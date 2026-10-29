// 画面の通しテスト。GitHub は疑似クライアントに差し替え、ログインは疑似ログインを使う
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

function fakeGitHub() {
  const issues = [];
  let seq = 100;
  return {
    issues,
    async isCollaborator(login) { return login === 'taro'; },
    async createIssue({ title, body, labels }) {
      const issue = { number: ++seq, title, body, labels: labels.map((name) => ({ name })), html_url: `https://x/issues/${seq}`, created_at: new Date().toISOString(), state: 'open' };
      issues.unshift(issue);
      return issue;
    },
    async listRequestIssues() { return issues; },
    async listPulls() { return [{ number: 1, title: 'p', html_url: 'https://x/pull/1', head: { ref: 'claude/issue-101-x' }, body: '', state: 'open', merged_at: null }]; },
    async listClaudeBranches() { return []; },
    async countToday(login) { return issues.filter((i) => i.labels.some((l) => l.name === `requester:${login}`)).length; },
  };
}

function startServer(env, github) {
  const config = loadConfig({ TARGET_REPO: 'o/r', GITHUB_TOKEN: 'dummy', SESSION_SECRET: 's', NODE_ENV: 'test', GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'cs', OAUTH_CALLBACK_URL: 'http://localhost/cb', ...env });
  const app = createApp(config, { github });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Cookie を引き継ぐ簡易クライアント
function client(base) {
  let cookie = '';
  async function go(path, opts = {}) {
    const res = await fetch(base + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers || {}), cookie } });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  return { go };
}

test('未ログインはログイン画面へ', async () => {
  const { server, base } = await startServer({}, fakeGitHub());
  try {
    const c = client(base);
    const r = await c.go('/');
    assert.equal(r.status, 302);
    assert.equal(r.location, '/login');
    const login = await c.go('/login');
    assert.match(login.text, /GitHub でログイン/);
  } finally { server.close(); }
});

test('collaborator 以外は拒否', async () => {
  const { server, base } = await startServer({ DEV_FAKE_LOGIN: 'stranger' }, fakeGitHub());
  try {
    const r = await client(base).go('/');
    assert.equal(r.status, 302);
    assert.equal(r.location, '/forbidden');
  } finally { server.close(); }
});

test('フォーム表示 → バグ送信 → 一覧に状態付きで出る', async () => {
  const gh = fakeGitHub();
  const { server, base } = await startServer({ DEV_FAKE_LOGIN: 'taro' }, gh);
  try {
    const c = client(base);
    const form = await c.go('/');
    assert.equal(form.status, 200);
    assert.match(form.text, /修正要望を送る/);
    const csrf = /name="_csrf" value="([^"]+)"/.exec(form.text)[1];

    // バグなのに再現手順が無い → 400 でエラー表示
    const body = (o) => new URLSearchParams({ _csrf: csrf, ...o }).toString();
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    const bad = await c.go('/requests', { method: 'POST', headers, body: body({ kind: 'bug', screen: 'teacher', content: 'x' }) });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /再現手順を入力してください/);
    assert.equal(gh.issues.length, 0);

    // CSRF 不一致は 403
    const noCsrf = await c.go('/requests', { method: 'POST', headers, body: new URLSearchParams({ kind: 'style', screen: 'teacher', content: 'x' }).toString() });
    assert.equal(noCsrf.status, 403);

    // 正しい送信 → Issue 作成 → 一覧へ
    const ok = await c.go('/requests', { method: 'POST', headers, body: body({ kind: 'bug', screen: 'teacher', content: '落ちる', steps: '1', expected: '2', actual: '3' }) });
    assert.equal(ok.status, 302);
    assert.equal(ok.location, '/requests?created=101');
    assert.equal(gh.issues[0].labels.map((l) => l.name).join(','), 'type:bug,screen:teacher,request-site,requester:taro');

    const list = await c.go('/requests?created=101');
    assert.equal(list.status, 200);
    assert.match(list.text, /#101/);
    assert.match(list.text, /PR作成済み/);
    assert.match(list.text, /PR #1/);
    assert.match(list.text, /要望を送信しました/);
  } finally { server.close(); }
});

test('日次制限に達したら送信不可', async () => {
  const gh = fakeGitHub();
  const { server, base } = await startServer({ DEV_FAKE_LOGIN: 'taro', DAILY_LIMIT: '1' }, gh);
  try {
    const c = client(base);
    const form = await c.go('/');
    assert.match(form.text, /残り送信回数: <strong>1<\/strong> \/ 1 件/);
    const csrf = /name="_csrf" value="([^"]+)"/.exec(form.text)[1];
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    const send = () => c.go('/requests', { method: 'POST', headers, body: new URLSearchParams({ _csrf: csrf, kind: 'style', screen: 'auth', content: 'a' }).toString() });
    assert.equal((await send()).status, 302);
    const second = await send();
    assert.equal(second.status, 400);
    assert.match(second.text, /本日の送信上限（1件）に達しました/);
    assert.match(second.text, /disabled/);
    assert.equal(gh.issues.length, 1);
  } finally { server.close(); }
});

test('本番では疑似ログインが無効', () => {
  const config = loadConfig({ TARGET_REPO: 'o/r', GITHUB_TOKEN: 'd', SESSION_SECRET: 's', NODE_ENV: 'production', DEV_FAKE_LOGIN: 'taro', GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: 'b', OAUTH_CALLBACK_URL: 'c' });
  assert.equal(config.devFakeLogin, '');
  assert.throws(() => loadConfig({ TARGET_REPO: 'o/r', GITHUB_TOKEN: 'd', SESSION_SECRET: 's', NODE_ENV: 'production' }), /GITHUB_CLIENT_ID/);
});
