// 対象画面の一覧。ラベル名（screen:〇〇）はASCIIにして CI でも扱いやすくする
const SCREENS = [
  { key: 'student', label: '生徒画面' },
  { key: 'teacher', label: '先生画面' },
  { key: 'popup-away', label: '確認ポップ・一時退出' },
  { key: 'class', label: 'クラス一覧・詳細' },
  { key: 'auth', label: 'ログイン・登録' },
  { key: 'other', label: 'その他' },
];

const KINDS = [
  { key: 'style', label: '見た目' },
  { key: 'bug', label: 'バグ' },
  { key: 'feature', label: '機能追加' },
];

// Claude が「難しい・できない」と判断して見送った Issue に付けるラベル
const NEEDS_HUMAN_LABEL = 'needs-human';

// 要望サイトから作った Issue に必ず付けるラベル
const SITE_LABEL = 'request-site';
const REQUESTER_LABEL_PREFIX = 'requester:';

function findScreen(key) {
  return SCREENS.find((s) => s.key === key) || null;
}
function findKind(key) {
  return KINDS.find((k) => k.key === key) || null;
}

module.exports = { SCREENS, KINDS, NEEDS_HUMAN_LABEL, SITE_LABEL, REQUESTER_LABEL_PREFIX, findScreen, findKind };
