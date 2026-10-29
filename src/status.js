// Issue と PR・ブランチを突き合わせて「対応状況」を決める純粋関数（テストしやすいよう GitHub 通信を含めない）

const STATUS = {
  none: { key: 'none', label: '未着手' },
  branch: { key: 'branch', label: '作業中（PR未作成）' },
  pr: { key: 'pr', label: 'PR作成済み' },
  merged: { key: 'merged', label: 'マージ済み' },
  closed: { key: 'closed', label: 'PRクローズ（未マージ）' },
};

// PR がどの Issue に対応するか。ブランチ名 claude/issue-N-... と本文の Closes #N の両方を見る
function issueNumbersOfPull(pr) {
  const nums = new Set();
  const ref = (pr.head && pr.head.ref) || '';
  const m = /^claude\/issue-(\d+)/.exec(ref);
  if (m) nums.add(Number(m[1]));
  const body = pr.body || '';
  const re = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  let r;
  while ((r = re.exec(body))) nums.add(Number(r[1]));
  // 明示のキーワードが無い場合は本文中の #N も拾う（Claude が「Closes」を書き忘れたとき用）
  if (nums.size === 0) {
    const re2 = /#(\d+)/g;
    while ((r = re2.exec(body))) nums.add(Number(r[1]));
  }
  return [...nums];
}

// issues: GitHub Issue 配列、pulls: PR 配列、branches: claude/ ブランチ名の配列
function attachStatus(issues, pulls, branches = []) {
  const byIssue = new Map();
  for (const pr of pulls) {
    for (const n of issueNumbersOfPull(pr)) {
      const list = byIssue.get(n) || [];
      list.push(pr);
      byIssue.set(n, list);
    }
  }
  return issues.map((issue) => {
    const prs = byIssue.get(issue.number) || [];
    // マージ済み > open > closed の優先で代表 PR を選ぶ
    const pick = prs.find((p) => p.merged_at) || prs.find((p) => p.state === 'open') || prs[0] || null;
    let status = STATUS.none;
    if (pick) {
      if (pick.merged_at) status = STATUS.merged;
      else if (pick.state === 'open') status = STATUS.pr;
      else status = STATUS.closed;
    } else if (branches.some((b) => b.startsWith(`claude/issue-${issue.number}-`))) {
      status = STATUS.branch;
    }
    const labels = issue.labels.map((l) => l.name);
    const kind = (labels.find((l) => l.startsWith('type:')) || 'type:').slice(5);
    const screen = (labels.find((l) => l.startsWith('screen:')) || 'screen:').slice(7);
    const requester = (labels.find((l) => l.startsWith('requester:')) || 'requester:').slice(10);
    return {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      createdAt: issue.created_at,
      issueState: issue.state,
      kind,
      screen,
      requester,
      status,
      pr: pick ? { number: pick.number, url: pick.html_url, title: pick.title } : null,
    };
  });
}

module.exports = { STATUS, attachStatus, issueNumbersOfPull };
