// フォーム入力を Issue のタイトル・本文・ラベルに整形する。末尾に @claude への指示文を付ける
const { SITE_LABEL, REQUESTER_LABEL_PREFIX, findScreen, findKind } = require('./screens');

// 見た目の修正で変更を許可するパス（卒研リポジトリ .github/workflows/pr-checks.yml と一致させる）
const STYLE_ALLOWED_PATHS = ['client/src/styles/**', 'client/src/**/*.css', 'client/src/**/*.jsx'];

const TITLE_MAX = 40;

// フォーム入力の検証。問題があればメッセージの配列を返す
function validateInput(input) {
  const errors = [];
  const kind = findKind(input.kind);
  const screen = findScreen(input.screen);
  if (!kind) errors.push('種別を選んでください');
  if (!screen) errors.push('対象画面を選んでください');
  if (!input.content || !input.content.trim()) errors.push('要望内容を入力してください');
  if (kind && kind.key === 'bug') {
    if (!input.steps || !input.steps.trim()) errors.push('再現手順を入力してください');
    if (!input.expected || !input.expected.trim()) errors.push('期待する動作を入力してください');
    if (!input.actual || !input.actual.trim()) errors.push('実際の動作を入力してください');
  }
  const tooLong = ['content', 'steps', 'expected', 'actual'].find((k) => (input[k] || '').length > 5000);
  if (tooLong) errors.push('入力が長すぎます（各欄 5000 文字まで）');
  return errors;
}

// 本文中の Markdown 引用として安全に入れるため、各行に > を付ける
function quote(text) {
  return String(text || '').trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n');
}

function firstLine(text) {
  const line = String(text || '').trim().split(/\r?\n/)[0] || '';
  return line.length > TITLE_MAX ? line.slice(0, TITLE_MAX) + '…' : line;
}

function styleInstruction(screen) {
  return [
    '@claude 上記の「見た目」の修正要望に対応してください。',
    '',
    '**守ること**',
    `- 変更してよいのは次の許可パスだけです: ${STYLE_ALLOWED_PATHS.map((p) => '`' + p + '`').join(', ')}`,
    '- **許可パス以外は変更しないでください**（server/・shared/・package.json・設定ファイル・テストは触らない）。CI が許可パス外の変更を検出すると失敗します',
    '- ロジック（state・API 呼び出し・Socket イベント・権限チェック）は変えず、CSS・マークアップ・className の調整に留めてください',
    '- 色は `client/src/styles/broadsheet.css` の CSS 変数から取り、直書きしないでください（CLAUDE.md の規約）',
    '',
    '**作業の流れ**',
    '1. 対象画面のコンポーネントと CSS を確認し、要望に沿って修正する',
    '2. `npm run build` が通ることを確認する',
    '3. `gh pr create --base main --label "type:style" --label "screen:' + screen.key + '"` で PR を作成する。タイトルは「修正: 〜」の形、本文は日本語で変更内容を説明し、先頭に `Closes #<この Issue の番号>` を書く',
  ].join('\n');
}

function bugInstruction(screen) {
  return [
    '@claude 上記のバグを修正してください。',
    '',
    '**守ること**',
    '- **まずバグを再現する失敗テストを書いてください**。サーバー側は jest（`server/src/**/*.test.js`）、クライアント側は vitest（`client/src/**/*.test.jsx`）です',
    '- 失敗を確認してから修正し、`npm test` が通ることを確認してください（CI でも `npm test` を実行します）',
    '- 修正は原因箇所に絞り、無関係なリファクタはしないでください',
    '- `docs/04_API・イベント仕様.md` に無い API・イベントを追加しないでください（CLAUDE.md の規約）',
    '',
    '**作業の流れ**',
    '1. 再現手順をもとに原因を特定する',
    '2. 失敗するテストを追加し、失敗することを確認する',
    '3. 修正してテストを通す',
    '4. `gh pr create --base main --label "type:bug" --label "screen:' + screen.key + '"` で PR を作成する。タイトルは「修正: 〜」の形、本文は日本語で原因・修正内容・追加したテストを説明し、先頭に `Closes #<この Issue の番号>` を書く',
  ].join('\n');
}

// 入力から Issue の { title, body, labels } を作る。requester はサイトにログインした GitHub ユーザー名
function buildIssue(input, requester) {
  const kind = findKind(input.kind);
  const screen = findScreen(input.screen);
  const title = `[${kind.label}] ${screen.label}: ${firstLine(input.content)}`;

  const lines = [
    `## 修正要望（${kind.label}）`,
    '',
    '| 項目 | 内容 |',
    '|---|---|',
    `| 種別 | ${kind.label} |`,
    `| 対象画面 | ${screen.label} |`,
    `| 依頼者 | @${requester} |`,
    `| 送信元 | 修正要望サイト |`,
    '',
    '### 要望内容',
    quote(input.content),
  ];
  if (kind.key === 'bug') {
    lines.push('', '### 再現手順', quote(input.steps));
    lines.push('', '### 期待する動作', quote(input.expected));
    lines.push('', '### 実際の動作', quote(input.actual));
  }
  lines.push('', '---', '', kind.key === 'bug' ? bugInstruction(screen) : styleInstruction(screen));

  const labels = [`type:${kind.key}`, `screen:${screen.key}`, SITE_LABEL, `${REQUESTER_LABEL_PREFIX}${requester}`];
  return { title, body: lines.join('\n'), labels };
}

module.exports = { validateInput, buildIssue, STYLE_ALLOWED_PATHS };
