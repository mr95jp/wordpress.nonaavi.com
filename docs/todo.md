# TODO

最終更新: 2026-09-15

公開済み 7 本・下書き 31 本。公開は `article-publish` スキルの手順で行う。

---

## 1. スクリーンショット待ちで公開を見送った 4 本

2026-09-15 の公開で見送り。**中身（結論ボックス・ラボ専用の記述・内部リンク）は公開できる状態。**
「画面に症状が出る記事には、その画面のスクリーンショットを必ず入れる」という原則を満たしていないため止めている。

| 記事 | 結論 | 撮る画面 |
|---|---|---|
| [ ] `login-impossible` ログインできない | 済 | 下記 |
| [ ] `wp-mail-not-delivered` メールが届かない | 済 | 下記 |
| [ ] `redirect-loop` リダイレクトが多すぎます | **未** | 下記 |
| [ ] `rest-json-update-failed` 更新に失敗しました（JSON） | **未** | 下記 |

### 撮る画面（ラボで撮影する）

**login-impossible**
- [ ] パスワード再設定で「エラー: メールを送信できませんでした。メール送信が正しく設定されていない可能性があります。」が出た画面（パターン 3）
- [ ] 管理画面にアクセスして HTTPS に転送され、ブラウザが接続できない画面（パターン 2）
- ログイン画面の 500（パターン 4）は既存の `c/functions-parse-error.jpg` が使えるか確認する

**wp-mail-not-delivered**
- [ ] 「エラー: メールを送信できませんでした。」の画面（送信できていない状態）
- [ ] 「確認のリンクを含むメールを送信しました」の画面（正常。対比用）
- 1 枚目は login-impossible と共用できる

**redirect-loop**
- [ ] ブラウザの「リダイレクトが繰り返し行われました」（`ERR_TOO_MANY_REDIRECTS`）の画面
- [ ] 同じ状態で nginx 側（8080）は正常に表示されている画面（Apache だけでループする対比。任意）

**rest-json-update-failed**
- [ ] ブロックエディターで「更新に失敗しました。返答が正しい JSON レスポンスではありません。」が出た画面（原因 1: `.htaccess` で `wp-json` を遮断）
- [ ] 遮断を外して保存できた画面（正常。対比用。任意）

### 撮り方の注意（ラボの原則）

- 1 枚に 1 つの症状だけを写す
- 対比が必要な記事は正常な状態も撮る
- 撮ったらサイト名・ユーザー名・パスワードなどが写っていないか確認する
- 保存先はラボの `docs/screenshots/<カテゴリ>/`

### 撮ったあとの手順

1. ラボで `docs/screenshots/` に画像を置く
2. このリポジトリで `pnpm sync:articles`（画像が追加される。ラボ側で記事に画像を挿入していれば、その変更もサイト側の記事にマージされる）
3. マージされなかった記事には画像を手で挿入する: `![画面に出ている文言](../screenshots/<カテゴリ>/<ファイル名>)`
4. `redirect-loop` と `rest-json-update-failed` は `article-summary` で結論を書く
5. `article-publish` で公開する

---

## 2. 残りの下書き 27 本

**結論ボックスはすべて未。**「スクショ」列が「要」の記事は、上と同じく撮影が済むまで公開しない。

| ハブ | 記事 | 画像 | スクショ |
|---|---|---|---|
| error-screen | `admin-only-white-screen` | 2 | 足りている |
| error-screen | `functions-php-broken-recovery` | 1 | 足りている |
| error-screen | `maintenance-mode-stuck` | 1 | 足りている |
| error-screen | `php7-to-php8-breaking-changes` | 0 | 不要（ログと比較結果が証拠） |
| cannot-login | `siteguard-lockout` | 3 | 足りている |
| cannot-login | `wp-admin-403-capability` | 2 | 足りている |
| cannot-login | `recovery-without-wp-cli` | 0 | 不要（手順の記事） |
| display-broken | `css-js-not-loading` | 1 | 足りている |
| display-broken | `admin-styles-broken` | 1 | 足りている |
| display-broken | `block-editor-blank` | 1 | 足りている |
| display-broken | `mobile-layout-broken` | 0 | **要**（スマホで崩れた画面） |
| display-broken | `ssl-mixed-content` | 0 | **要**（崩れた画面か、コンソールの Mixed Content。ただし記事中で「ブラウザのブロックは再現できていない」と明記しているので要検討） |
| display-broken | `posts-404-permalink` | 0 | **要**（投稿だけサーバーの 404 になる画面） |
| cannot-save | `contact-form-7-not-sending` | 0 | **要**（送信ボタンがくるくる回ったまま） |
| cannot-save | `media-upload-failure` | 0 | **要**（メディアの「HTTP エラー」） |
| cannot-save | `max-input-vars-silent-loss` | 0 | 不要（黙って消える。件数が証拠） |
| cannot-save | `scheduled-post-missed` | 0 | 任意（「予約投稿の失敗」表示） |
| cannot-save | `emoji-and-timezone` | 0 | 不要（ログと値が証拠） |
| slow-seo | `feed-sitemap-broken` | 0 | 任意（XML のパースエラー画面） |
| slow-seo | `not-indexed-by-google` | 0 | 不要 |
| security | `attack-surface-audit` | 0 | 不要 |
| security | `broken-access-control` | 1 | 足りている |
| security | `compromised-db-side` | 0 | 不要 |
| security | `config-file-exposure` | 0 | 不要 |
| security | `verify-checksums-blind-spots` | 0 | 不要 |
| diagnosis | `site-health-reading` | 0 | 任意（サイトヘルスの「重大な問題」画面） |
| diagnosis | `where-are-the-logs` | 0 | 不要 |

「要」「任意」は記事本文から判断した見込み。公開するときに `article-publish` の手順 6 で改めて確認する。

### 進め方

- 1 回に 5〜10 本。「足りている」「不要」の記事から結論を書いて公開する
- 週 1 回程度のペースで出し、Search Console でインデックスの状況を見る

---

## 3. その他

- [ ] Search Console にサイトマップ `sitemap-index.xml` を送信する
- [ ] サイト名「WP復旧ラボ」と、`plugin-conflict-diagnosis` の参考文献にある「WP復旧本舗」が似ている。混同されないか検討する
- [ ] GitHub のリポジトリ名が `wordpress.nonaavi.com`（綴り違い）。変える場合は Cloudflare Pages の Git 連携を確認する
- [ ] 運営者情報を充実させる（`/about/`）。記事の信頼性の評価に効く
- [ ] 記事末尾に「この記事で解決しましたか？」を置くか検討する（GA4 のイベントで集計）
