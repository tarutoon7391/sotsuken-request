// GitHub API との通信。トークンはここでしか使わない（フロントには一切渡さない）
const { SITE_LABEL, REQUESTER_LABEL_PREFIX, NEEDS_HUMAN_LABEL } = require('./screens');

const API = 'https://api.github.com';
const CACHE_MS = 20 * 1000; // 一覧と PR の取得は 20 秒キャッシュ（5人用なので十分）

class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createGitHubClient(config) {
  const base = `${API}/repos/${config.owner}/${config.repo}`;
  const cache = new Map();

  async function request(method, path, body) {
    const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sotsuken-request-site',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data && data.message) || res.statusText;
      throw new GitHubError(res.status, `GitHub API ${method} ${path} → ${res.status}: ${msg}`);
    }
    return data;
  }

  async function cached(key, loader) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await loader();
    cache.set(key, { value, expires: Date.now() + CACHE_MS });
    return value;
  }
  function invalidate() {
    cache.clear();
  }

  // 卒研リポジトリの collaborator かどうか（204 なら collaborator、404 なら違う）
  async function isCollaborator(login) {
    try {
      await request('GET', `${base}/collaborators/${encodeURIComponent(login)}`);
      return true;
    } catch (e) {
      if (e.status === 404) return false;
      throw e;
    }
  }

  // ラベルが無ければ作る（Issue 作成時に存在しないラベルで失敗しないように）
  const knownLabels = new Set();
  const LABEL_COLORS = { 'type:style': 'c5def5', 'type:bug': 'd73a4a', 'type:feature': '7057ff', [NEEDS_HUMAN_LABEL]: 'e99695', [SITE_LABEL]: '0e8a16' };
  function colorFor(name) {
    if (LABEL_COLORS[name]) return LABEL_COLORS[name];
    if (name.startsWith('screen:')) return 'fbca04';
    if (name.startsWith(REQUESTER_LABEL_PREFIX)) return 'ededed';
    return 'bfdadc';
  }
  async function ensureLabels(names) {
    for (const name of names) {
      if (knownLabels.has(name)) continue;
      try {
        await request('GET', `${base}/labels/${encodeURIComponent(name)}`);
      } catch (e) {
        if (e.status !== 404) throw e;
        await request('POST', `${base}/labels`, { name, color: colorFor(name), description: '修正要望サイトが付けるラベル' });
      }
      knownLabels.add(name);
    }
  }

  async function createIssue({ title, body, labels }) {
    // Claude が見送るときに付ける needs-human も、無いと gh issue edit が失敗するので先に作っておく
    await ensureLabels(labels.includes('type:feature') ? [...labels, NEEDS_HUMAN_LABEL] : labels);
    const issue = await request('POST', `${base}/issues`, { title, body, labels });
    invalidate();
    return issue;
  }

  // 要望サイト発の Issue 一覧（open/closed 両方、新しい順）
  async function listRequestIssues() {
    return cached('issues', async () => {
      const items = await request(
        'GET',
        `${base}/issues?labels=${encodeURIComponent(SITE_LABEL)}&state=all&per_page=100&sort=created&direction=desc`,
      );
      // issues API は PR も返すので除外する
      return items.filter((i) => !i.pull_request);
    });
  }

  // PR 一覧（open/closed 両方、更新が新しい順）
  async function listPulls() {
    return cached('pulls', () => request('GET', `${base}/pulls?state=all&per_page=100&sort=updated&direction=desc`));
  }

  // Claude が push したが PR になっていないブランチ（claude/issue-N-...）
  async function listClaudeBranches() {
    return cached('branches', async () => {
      const branches = await request('GET', `${base}/branches?per_page=100`);
      return branches.map((b) => b.name).filter((n) => n.startsWith('claude/'));
    });
  }

  // 指定ユーザーが「日本時間の今日」に送った件数。日次制限の判定に使う
  async function countToday(login, now = new Date()) {
    const issues = await listRequestIssues();
    const jstStart = startOfJstDay(now);
    const label = `${REQUESTER_LABEL_PREFIX}${login}`;
    return issues.filter((i) => i.labels.some((l) => l.name === label) && new Date(i.created_at) >= jstStart).length;
  }

  return { isCollaborator, createIssue, listRequestIssues, listPulls, listClaudeBranches, countToday, invalidate, request };
}

// 日本時間での「今日の0時」を UTC の Date で返す
function startOfJstDay(now) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 9 * 60 * 60 * 1000);
}

// OAuth のコードをアクセストークンに交換し、ユーザー情報を返す（ユーザーのトークンは保存しない）
async function exchangeOAuthCode(oauth, code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'sotsuken-request-site' },
    body: JSON.stringify({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      code,
      redirect_uri: oauth.callbackUrl,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new GitHubError(401, `OAuth の交換に失敗しました: ${data.error_description || data.error || '不明'}`);
  }
  const userRes = await fetch(`${API}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${data.access_token}`,
      'User-Agent': 'sotsuken-request-site',
    },
  });
  if (!userRes.ok) throw new GitHubError(userRes.status, 'GitHub ユーザー情報の取得に失敗しました');
  const user = await userRes.json();
  return { login: user.login, name: user.name || user.login, avatar: user.avatar_url };
}

module.exports = { createGitHubClient, exchangeOAuthCode, startOfJstDay, GitHubError };
