// Issue 本文の整形と入力検証のテスト（GitHub 通信なし）
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, buildIssue, STYLE_ALLOWED_PATHS } = require('../src/issueBody');

const styleInput = { kind: 'style', screen: 'teacher', content: 'ボタンが重なる\n2行目' };
const bugInput = { kind: 'bug', screen: 'popup-away', content: '退出できない', steps: '1. 押す', expected: '閉じる', actual: '閉じない' };

test('見た目: 内容だけ必須', () => {
  assert.deepEqual(validateInput(styleInput), []);
  assert.ok(validateInput({ kind: 'style', screen: 'teacher', content: '  ' }).length > 0);
});

test('バグ: 再現手順・期待・実際が必須', () => {
  assert.deepEqual(validateInput(bugInput), []);
  const errors = validateInput({ ...bugInput, steps: '', expected: '', actual: '' });
  assert.equal(errors.length, 3);
});

test('種別・画面が不正なら拒否', () => {
  assert.ok(validateInput({ kind: 'other', screen: 'teacher', content: 'x' }).length > 0);
  assert.ok(validateInput({ kind: 'style', screen: 'nope', content: 'x' }).length > 0);
});

test('見た目の Issue: タイトル・ラベル・許可パスの指示', () => {
  const issue = buildIssue(styleInput, 'taro');
  assert.equal(issue.title, '[見た目] 先生画面: ボタンが重なる');
  assert.deepEqual(issue.labels, ['type:style', 'screen:teacher', 'request-site', 'requester:taro']);
  assert.match(issue.body, /@claude/);
  assert.match(issue.body, /許可パス以外は変更しないでください/);
  for (const p of STYLE_ALLOWED_PATHS) assert.ok(issue.body.includes(p), `許可パス ${p} が本文にある`);
  assert.match(issue.body, /--label "type:style" --label "screen:teacher"/);
  assert.match(issue.body, /> ボタンが重なる\n> 2行目/);
  assert.match(issue.body, /\| 依頼者 \| @taro \|/);
});

test('バグの Issue: 失敗テスト→修正の指示と3項目', () => {
  const issue = buildIssue(bugInput, 'hanako');
  assert.equal(issue.title, '[バグ] 確認ポップ・一時退出: 退出できない');
  assert.deepEqual(issue.labels, ['type:bug', 'screen:popup-away', 'request-site', 'requester:hanako']);
  assert.match(issue.body, /まずバグを再現する失敗テストを書いてください/);
  assert.match(issue.body, /npm test/);
  assert.match(issue.body, /### 再現手順\n> 1\. 押す/);
  assert.match(issue.body, /### 期待する動作\n> 閉じる/);
  assert.match(issue.body, /### 実際の動作\n> 閉じない/);
  assert.match(issue.body, /--label "type:bug"/);
});

test('長いタイトルは40文字で省略', () => {
  const issue = buildIssue({ ...styleInput, content: 'あ'.repeat(60) }, 'x');
  assert.equal(issue.title, `[見た目] 先生画面: ${'あ'.repeat(40)}…`);
});
