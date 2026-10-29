// Issue と PR の突き合わせ・日次カウントのテスト（GitHub 通信なし）
const test = require('node:test');
const assert = require('node:assert/strict');
const { attachStatus, issueNumbersOfPull } = require('../src/status');
const { startOfJstDay } = require('../src/github');

function issue(number, labels = ['type:style', 'screen:teacher', 'request-site', 'requester:taro'], extra = {}) {
  return { number, title: `[見た目] 先生画面: t${number}`, html_url: `https://x/issues/${number}`, created_at: '2026-10-29T01:00:00Z', state: 'open', labels: labels.map((name) => ({ name })), ...extra };
}
function pull(number, { ref = '', body = '', state = 'open', merged_at = null } = {}) {
  return { number, title: `PR ${number}`, html_url: `https://x/pull/${number}`, head: { ref }, body, state, merged_at };
}

test('PR→Issue の紐付け: ブランチ名と Closes #N', () => {
  assert.deepEqual(issueNumbersOfPull(pull(1, { ref: 'claude/issue-12-20261029-0900' })), [12]);
  assert.deepEqual(issueNumbersOfPull(pull(1, { ref: 'feature/x', body: '修正です。\nCloses #7' })), [7]);
  assert.deepEqual(issueNumbersOfPull(pull(1, { ref: 'claude/issue-12-x', body: 'Fixes #12' })), [12]);
  // キーワード無しでも #N は拾う
  assert.deepEqual(issueNumbersOfPull(pull(1, { body: '関連: #3' })), [3]);
});

test('状態: 未着手 / 作業中 / PR作成済み / マージ済み / クローズ', () => {
  const issues = [issue(1), issue(2), issue(3), issue(4), issue(5)];
  const pulls = [
    pull(10, { ref: 'claude/issue-3-a', state: 'open' }),
    pull(11, { ref: 'claude/issue-4-a', state: 'closed', merged_at: '2026-10-29T02:00:00Z' }),
    pull(12, { ref: 'claude/issue-5-a', state: 'closed' }),
  ];
  const rows = attachStatus(issues, pulls, ['claude/issue-2-20261029']);
  const byNum = Object.fromEntries(rows.map((r) => [r.number, r]));
  assert.equal(byNum[1].status.key, 'none');
  assert.equal(byNum[2].status.key, 'branch');
  assert.equal(byNum[3].status.key, 'pr');
  assert.equal(byNum[3].pr.number, 10);
  assert.equal(byNum[4].status.key, 'merged');
  assert.equal(byNum[5].status.key, 'closed');
  assert.equal(byNum[1].kind, 'style');
  assert.equal(byNum[1].screen, 'teacher');
  assert.equal(byNum[1].requester, 'taro');
});

test('同じ Issue に複数 PR があればマージ済みを優先', () => {
  const rows = attachStatus([issue(1)], [
    pull(10, { ref: 'claude/issue-1-a', state: 'closed' }),
    pull(11, { ref: 'claude/issue-1-b', state: 'closed', merged_at: '2026-10-29T02:00:00Z' }),
    pull(12, { ref: 'claude/issue-1-c', state: 'open' }),
  ]);
  assert.equal(rows[0].status.key, 'merged');
  assert.equal(rows[0].pr.number, 11);
});

test('日本時間の0時境界', () => {
  // 2026-10-29 23:30 JST = 14:30Z → その日の0時 JST は 2026-10-28T15:00Z
  assert.equal(startOfJstDay(new Date('2026-10-29T14:30:00Z')).toISOString(), '2026-10-28T15:00:00.000Z');
  // 2026-10-30 00:10 JST = 2026-10-29T15:10Z → 2026-10-29T15:00Z
  assert.equal(startOfJstDay(new Date('2026-10-29T15:10:00Z')).toISOString(), '2026-10-29T15:00:00.000Z');
});
