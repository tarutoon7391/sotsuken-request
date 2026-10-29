# 卒研 修正要望サイト（sotsuken-request）

卒業研究チーム（5人）専用の「修正要望サイト」です。
メンバーがフォームから「見た目」「バグ」「機能追加」の修正要望を送ると、卒研リポジトリ（`tarutoon7391/Sotsuken`）に Issue が作られ、Claude Code Action が自動で修正 PR を作ります。その進み具合をサイト上で確認できます。

## 仕組み

```
メンバー ──GitHub OAuth──▶ 要望サイト(Railway) ──fine-grained token──▶ 卒研リポジトリに Issue 作成
                                                                      │ 本文末尾に @claude への指示
                                                                      ▼
                                                            claude-code-action が起動
                                                            → ブランチ claude/issue-N-… に修正を push
                                                            → gh pr create で PR 作成（ラベル type:style / type:bug / type:feature）
                                                                      ▼
                                              要望サイトの一覧が Issue と PR を突き合わせて状態を表示
```

- ログインは GitHub OAuth。ログイン後に卒研リポジトリの collaborator かをサーバー側で確認し、違えばアクセス拒否
- データベースはありません。卒研リポジトリの Issue（ラベル `request-site`）が一覧と日次制限の元データです
- サイトは卒研リポジトリのコードを直接書き換えません。変更は必ず Claude Code Action の PR 経由です
- GitHub トークン・OAuth シークレットはサーバーの環境変数だけで扱い、ブラウザには一切渡しません

## 画面

| パス | 内容 |
|---|---|
| `/login` | GitHub でログイン |
| `/` | 要望フォーム（種別・対象画面・内容。バグのときだけ再現手順／期待する動作／実際の動作が必須） |
| `/requests` | 要望一覧。Issue リンク・状態（未着手／作業中／PR作成済み／マージ済み／PRクローズ）・PR リンク。「自分の分」で絞り込み可 |
| `/forbidden` | collaborator 以外に表示 |

## Issue に付くラベル

| ラベル | 意味 |
|---|---|
| `type:style` / `type:bug` / `type:feature` | 種別 |
| `needs-human` | 機能追加で Claude が「難しい・できない」と見送った印。PR は作られず、理由が Issue のコメントに書かれる。一覧では「見送り（要相談）」と出る |
| `screen:student` `screen:teacher` `screen:popup-away` `screen:class` `screen:auth` `screen:other` | 対象画面（生徒画面／先生画面／確認ポップ・一時退出／クラス一覧・詳細／ログイン・登録／その他） |
| `request-site` | 要望サイトから作った Issue の目印（一覧の抽出に使う） |
| `requester:<GitHubユーザー名>` | 依頼者（日次制限の集計に使う） |

ラベルが卒研リポジトリに無ければサイトが自動で作ります。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `TARGET_REPO` | ○ | Issue を作る先。`tarutoon7391/Sotsuken` |
| `GITHUB_TOKEN` | ○ | 卒研リポジトリ限定の fine-grained personal access token。権限は Issues / Contents / Pull requests の Read and write（Metadata は自動で Read） |
| `GITHUB_CLIENT_ID` | ○ | GitHub OAuth App の Client ID |
| `GITHUB_CLIENT_SECRET` | ○ | GitHub OAuth App の Client secret |
| `OAUTH_CALLBACK_URL` | ○ | `https://<RailwayのURL>/auth/github/callback`。OAuth App の Authorization callback URL と完全一致させる |
| `SESSION_SECRET` | ○ | Cookie 署名用のランダム文字列（32 文字以上） |
| `DAILY_LIMIT` | | 1ユーザーが1日（日本時間）に送れる件数。`0` または未設定で無制限。当面は無制限で運用 |
| `PORT` | | 待ち受けポート。Railway では自動で入る |
| `NODE_ENV` | ○（本番） | 本番では `production`（Cookie が Secure になる） |
| `DEV_FAKE_LOGIN` | | 開発専用。GitHub ログインを省略して指定ユーザーとして扱う。`NODE_ENV=production` では無視される |

## ローカルで動かす

```powershell
# 依存を入れる
npm install
# .env を作る（.env.example をコピーして値を入れる）
Copy-Item .env.example .env
# 起動（http://localhost:3100）
npm run dev
# テスト（GitHub 通信なしで画面の流れまで確認する）
npm test
```

OAuth App をまだ作っていない段階では、`.env` に `DEV_FAKE_LOGIN=<自分のGitHubユーザー名>` を書くとログイン無しで画面を確認できます（`GITHUB_TOKEN` は必要です。collaborator 確認と Issue 作成に使います）。

## Railway へデプロイする

1. GitHub に `sotsuken-request` リポジトリを作り、このフォルダを push する
2. Railway で **New Project → Deploy from GitHub repo** → `sotsuken-request` を選ぶ（Node.js を自動検出し `npm start` で起動）
3. サービスの **Settings → Networking → Generate Domain** で公開 URL を作る（例 `https://sotsuken-request-production.up.railway.app`）
4. **Variables** に上の環境変数を登録する（`OAUTH_CALLBACK_URL` は手順 3 の URL + `/auth/github/callback`、`NODE_ENV=production`）
5. GitHub OAuth App の Authorization callback URL を手順 4 と同じ値にする
6. Redeploy して `/login` を開き、GitHub でログイン → フォームが出れば完了

CLI で上げる場合（Railway CLI を使う）：

```powershell
railway login
railway init          # 初回だけ。プロジェクト名 sotsuken-request
railway up --ci       # 以後の更新はこれ
railway variables --set "TARGET_REPO=tarutoon7391/Sotsuken" --set "NODE_ENV=production"   # 秘密値は Web の Variables 画面で
```

## 自分でやる必要がある作業（チェックリスト）

- [ ] GitHub に `tarutoon7391/sotsuken-request` を作成し push
- [ ] GitHub OAuth App を作成（Settings → Developer settings → OAuth Apps → New）。Homepage URL と callback URL は Railway の URL。Client ID / secret を控える
- [ ] fine-grained personal access token を発行（Settings → Developer settings → Personal access tokens → Fine-grained）。Repository access は `Sotsuken` だけ、Permissions は Issues / Contents / Pull requests を Read and write
- [ ] Railway に環境変数を登録（上の表）
- [ ] 卒研リポジトリ側の導入（`Sotsuken/docs/修正要望サイト_導入手順.md` を参照）：Claude GitHub App のインストール、`ANTHROPIC_API_KEY` の Secrets 登録、ブランチ保護（ruleset）の設定
- [ ] チームメンバー全員が `Sotsuken` の collaborator になっているか確認

## 開発メモ

- `src/issueBody.js` … Issue 本文と @claude への指示文。許可パス（見た目）、「失敗テストを先に書く」（バグ）、機能追加の見送り条件と許可パス（`client/src/**`）の文言はここ
- `src/status.js` … Issue と PR の突き合わせ。ブランチ名 `claude/issue-N-…` と本文の `Closes #N` で紐付ける
- `src/github.js` … GitHub API。20 秒キャッシュ
- 見た目の許可パスを変えるときは、卒研リポジトリ `.github/workflows/pr-checks.yml` の `ALLOWED_PATTERNS` も同じに揃える
