# プラグイン名から引く

「Contact Form 7 メール 届かない」のように、**プラグイン名で検索する人**が多い。
しかし調べてみると、**プラグインは引き金であって原因は別の層にある**ことが大半だった。

そのため、このページはプラグイン名から既存記事へ流す索引として置く。
**プラグイン固有の挙動を実測したものだけ、専用記事を持つ。**

---

## プラグイン固有の挙動を実測したもの

| プラグイン | 症状 | 記事 |
|---|---|---|
| **SiteGuard WP Plugin** | 有効化した瞬間に `wp-login.php` が 404。ログインできない | [新しい URL は /wp-admin/ が教えてくれる](articles/siteguard-lockout.md) |
| **Contact Form 7** | 送信ボタンがぐるぐる回ったまま止まらない | [「キャッシュで nonce が切れる」は現行版では起きない](articles/contact-form-7-not-sending.md) |

国内のレンタルサーバーが標準で導入していることが多く、遭遇率が高いため実測した。
**ログイン URL の形（`/login_数字.php`）、ロックの解除条件、既定でオフの機能**まで
計測してある。

---

## 引き金はプラグイン、原因は別の層にあるもの

プラグイン側の設定を触る前に、**下の層を確認したほうが速い**もの。

### フォーム系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| Contact Form 7 | メールが届かない | `wp_mail()` が false か、届かないだけか | [メールが届かない](articles/wp-mail-not-delivered.md) |
| Contact Form 7 | 送信ボタンが「くるくる」して止まらない | **REST の到達性**（nonce は現行版では使われていない。実測済み） | [専用記事](articles/contact-form-7-not-sending.md) |
| Contact Form 7 / MW WP Form | 送信すると画面が戻るだけ | `post_max_size` 超過で POST が空になる | [画像をアップロードできない](articles/media-upload-failure.md) |
| どのフォームでも | reCAPTCHA でブロックされる | 外部 JS の読み込み失敗 | [CSS が効かない・JS が動かない](articles/css-js-not-loading.md) |

**まず「フォームの送信記録が残っているか」を確認する。**
残っているならメールの問題、残っていないなら送信の問題。

### 移行・バックアップ系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| All-in-One WP Migration | 「最大アップロードサイズを超過しています」 | `upload_max_filesize` / `post_max_size` / `memory_limit` の 3 点 | [画像をアップロードできない](articles/media-upload-failure.md) |
| All-in-One WP Migration | インポート後に画像が出ない | `uploads` を移していない、URL の不一致 | [画像が表示されない](articles/images-not-displaying.md) |
| BackWPup / UpdraftPlus | バックアップが動かない | WP-Cron のループバック失敗 | [予約投稿されない](articles/scheduled-post-missed.md) |
| 移行全般 | 絵文字が消える / 時刻が 9 時間ずれる | `utf8` と `utf8mb4`、タイムゾーンの不一致 | [移行後の定番 2 つ](articles/emoji-and-timezone.md) |
| 移行全般 | 復元したのに直らない | ファイルと DB の整合 | [WP-CLI が無い環境での復旧](articles/recovery-without-wp-cli.md) |

**上限は 3 つ同時に上げる。**`upload_max_filesize` だけ上げても
`post_max_size` で切られる（実測）。

### キャッシュ・高速化系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| Autoptimize / LiteSpeed Cache / WP Fastest Cache | スライダーやモーダルが動かなくなった | JS の結合で依存順序が壊れる | [CSS が効かない・JS が動かない](articles/css-js-not-loading.md) |
| 同上 | CSS を直したのに反映されない | `?ver=` が更新されていない、CDN のキャッシュ | 同上 |
| 同上 | スマホだけ崩れる | PC 版のキャッシュがスマホに返っている | [スマホだけレイアウトが崩れる](articles/mobile-layout-broken.md) |
| 同上 | フォームが送信できない | nonce がキャッシュに焼き込まれた | [返答が正しい JSON レスポンスではありません](articles/rest-json-update-failed.md) |
| 同上 | 管理画面が崩れる | 管理画面まで最適化の対象にしている | [管理画面だけ表示が崩れる](articles/admin-styles-broken.md) |

**切り分けは「結合・最小化の機能だけをオフにする」。**
プラグイン全体を止める必要はない。

### セキュリティ系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| SiteGuard WP Plugin | ログインできない | ログイン URL の変更 | [専用記事](articles/siteguard-lockout.md) |
| Wordfence / XO Security など | ブロックエディタが真っ白 | `wp-includes` や REST の遮断 | [ブロックエディターが真っ白](articles/block-editor-blank.md) |
| 同上 | 「返答が正しい JSON レスポンスではありません」 | REST API の遮断 | [原因を見つける](articles/rest-json-update-failed.md) |
| 同上 | 403 が出る | WAF の誤検知、`.htaccess` の規則 | [.htaccess で 500 エラー](articles/htaccess-500-rewrite-loop.md) |
| 同上を 2 つ入れた | 極端に遅い / 相互に弾き合う | `.htaccess` の規則が競合 | [プラグインの競合](articles/plugin-conflict-diagnosis.md) |

**セキュリティ系は 1 つだけにする。**2 つ入れると互いの規則が衝突する。

### SSL 系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| Really Simple SSL など | リダイレクトを繰り返す | プロキシ配下で `X-Forwarded-Proto` を見ていない、SSL 強制が複数箇所 | [リダイレクトを繰り返す](articles/redirect-loop.md) |
| 同上 | 画像・CSS が読み込めない | 混在コンテンツ。DB の `http://` が残っている | [SSL 化したら読み込めない](articles/ssl-mixed-content.md) |

**SSL 強制は 1 箇所だけ。**プラグイン・`.htaccess`・サーバー設定の
どこでやっているか分からない状態が最も危険。

### 入力が多い系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| Advanced Custom Fields | 繰り返しフィールドが一部保存されない | `max_input_vars` 超過 | [保存したのに一部だけ消える](articles/max-input-vars-silent-loss.md) |
| Elementor / WPBakery | プレビューが読み込めない | メモリ不足、`max_input_vars`、REST の到達性 | 同上 / [ブロックエディターが真っ白](articles/block-editor-blank.md) |
| WooCommerce | 商品バリエーションが保存されない | `max_input_vars` 超過 | [保存したのに一部だけ消える](articles/max-input-vars-silent-loss.md) |
| メニューの項目が多い場合 | 30 個を超えると保存されない | 同上（1 項目で 10 個以上の変数を消費する） | 同上 |

### 画像最適化系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| EWWW / Smush など | 最適化が動かない | `exec()` が禁止された共用サーバー、メモリ不足 | [画像をアップロードできない](articles/media-upload-failure.md) |
| 2 つ以上入れた | 画像が劣化する / 容量が増える | 二重に圧縮している | [プラグインの競合](articles/plugin-conflict-diagnosis.md) |

### SEO 系

| プラグイン | 症状 | 実際の原因 | 記事 |
|---|---|---|---|
| Yoast SEO と Rank Math など 2 つ | meta タグが 2 つ出る | どちらも `wp_head` に出力している | [プラグインの競合](articles/plugin-conflict-diagnosis.md) |
| SEO 系全般 | サイトマップが 404 | `blog_public = 0`（検索エンジンのインデックス設定） | [RSS とサイトマップだけ壊れる](articles/feed-sitemap-broken.md) |

---

## プラグインを疑う前に取る値

プラグイン名で検索する前に、これを取ると原因の層が分かる。

```sh
bin/diagnose.sh https://example.com
```

| 観測 | プラグインの問題か |
|---|---|
| ページ本体が 500 | プラグインかテーマの Fatal。**両方有効なときだけ落ちるなら競合** |
| アセットが 403 | サーバー設定かセキュリティプラグイン |
| REST が JSON でない | セキュリティプラグインか Fatal |
| `Set-Cookie` が 0 | **プラグインではない**（出力が混ざっている） |
| 全部 200 なのに壊れている | キャッシュ・結合・JS エラー |

---

## 更新で壊れたとき

**「有効化したら壊れた」はほぼ起きない。**WordPress は有効化の前に
ファイルを読み込む検査をして、Fatal になるなら有効化を中止する（実測）。

実際に落ちるのは**両方が有効なまま、更新で衝突が生まれたとき**。
だから相談は「更新したら真っ白になった」に偏る。

→ [プラグインの競合](articles/plugin-conflict-diagnosis.md)

---

## このページに追記する基準

**プラグイン固有の挙動を実測できたものだけ、専用記事を作る。**

- バージョンで変わる不具合は書かない（数か月で嘘になる）
- 「このプラグインは重い」のような印象は書かない
- 既存記事の機構で説明できるものは、この索引の行を増やすだけにする
