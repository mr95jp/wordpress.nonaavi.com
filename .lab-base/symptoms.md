# 症状から原因を引く

困っている人は原因を知らない。**見えている症状**と**直前にやったこと**しか
分からない。そこから記事に流すための索引。

記事側は原因別（PHP・プラグイン・テーマ…）に整理してあるので、
入口はこのページが担う。

---

## 見えているものから引く

| 見えているもの | まず疑う | 記事 |
|---|---|---|
| **真っ白で何も出ない** | Fatal error + `display_errors` が Off | [PHP を上げたらサイトが白画面になった](articles/php-upgrade-white-screen.md) |
| **「このサイトで重大なエラーが発生しました。」** | テーマかプラグインの Fatal | [functions.php を壊したときの復旧](articles/functions-php-broken-recovery.md) / [プラグインの競合](articles/plugin-conflict-diagnosis.md) |
| **500 Internal Server Error** | `.htaccess` か PHP | [.htaccess で 500 エラー](articles/htaccess-500-rewrite-loop.md) |
| **「データベース接続確立エラー」** | 認証情報・ホスト名・DB 名・MySQL 停止・接続数 | [原因を切り分ける](articles/db-connection-error-diagnosis.md) |
| **「メンテナンスのためしばらく利用できません」が消えない** | `.maintenance` の残留 | [.maintenance と 10 分ルール](articles/maintenance-mode-stuck.md) |
| **502 Bad Gateway** | 接続が拒否された（参照先のズレ） | [.htaccess で 500 エラー](articles/htaccess-500-rewrite-loop.md) の 500/502/504 表 |
| **504 Gateway Timeout** | 接続して無応答（プロセス停止・ハング） | 同上 |
| **「このページにアクセスする権限がありません。」** | 権限不足（どの権限かは画面に出ない） | [原因の権限を特定する](articles/wp-admin-403-capability.md) |
| **「更新に失敗しました。返答が正しい JSON レスポンスではありません」** | REST API が JSON を返していない | [原因を見つける](articles/rest-json-update-failed.md) |
| **ログインできない** | Cookie・URL 設定・メール・Fatal の 4 パターン | [症状別に原因を絞る](articles/login-impossible.md) |
| **メールが届かない** | `wp_mail()` が false か、届かないだけか | [どちらなのかを分ける](articles/wp-mail-not-delivered.md) |
| **フォームの送信ボタンが止まらない** | REST の到達性（nonce ではない） | [Contact Form 7 が送信できない](articles/contact-form-7-not-sending.md) |
| **サイトは見えるのに管理画面に入れない** | サイト URL の設定ミス | [ログインできない](articles/login-impossible.md) のパターン 2 |
| **公開ボタンが無い / 画像を追加できない** | 権限不足（エラーは出ない） | [原因の権限を特定する](articles/wp-admin-403-capability.md) |
| **監視は正常なのに壊れている** | ステータス 200 で返る障害 | [サイトが死んでいるのに監視は 200 を返す](articles/http-200-when-site-is-down.md) |
| **エラーは出ないが数字や分岐がおかしい** | PHP 8 で `==` の比較結果が変わった | [7 で動いていたコードが 8 で壊れる](articles/php7-to-php8-breaking-changes.md) |
| **改ざんが疑われる** | チェックサムでは wp-content を見ていない | [verify-checksums だけでは足りない](articles/verify-checksums-blind-spots.md) |
| **投稿だけ 404（トップは出る）** | `.htaccess` が無い／効いていない。Apache だけで起きる | [「保存し直す」が何をしているのか](articles/posts-404-permalink.md) |
| **保存したのに一部だけ消えた** | `max_input_vars` 超過。警告は `debug.log` に出ない | [黙って捨てられている](articles/max-input-vars-silent-loss.md) |
| **画像をアップロードできない** | サイズ 2 種類か、年月ディレクトリの権限 | [「HTTP エラー」の中身](articles/media-upload-failure.md) |
| **RSS / サイトマップだけ壊れる** | XML の前に 1 バイトでも出力があると壊れる | [XML は 1 バイトも許さない](articles/feed-sitemap-broken.md) |
| **予約投稿されない** | WP-Cron のループバック失敗。アクセスが無いと動かない | [WP-Cron の仕組み](articles/scheduled-post-missed.md) |
| **管理画面だけ真っ白（フロントは正常）** | 管理画面でだけ動くコードの Fatal | [切り分けの型が変わる](articles/admin-only-white-screen.md) |
| **絵文字が消える / 時刻が 9 時間ずれる** | `utf8` と `utf8mb4`、PHP と WordPress のタイムゾーン | [移行後の定番 2 つ](articles/emoji-and-timezone.md) |
| **設定ファイルが漏れていないか心配** | 危険なのは本体ではなくバックアップファイル | [実測したら漏れたのは](articles/config-file-exposure.md) |

### 調べ方・診断ツール

| 状況 | 記事 |
|---|---|
| **ログを見ても何も出ていない** | [ログはどこにあり、何を見るのか](articles/where-are-the-logs.md) — 起動前のエラーは `debug.log` に入らない |
| **サイトヘルスに「重大な問題」が出ている** | [何を見ているのか・偽陽性の見分け方](articles/site-health-reading.md) |

### 遅い

| 状況 | まず疑う | 記事 |
|---|---|---|
| **全ページが一律に遅い** | `wp_options` の `autoload` 肥大 | [WordPress が重い](articles/site-is-slow.md) |
| **管理画面だけ遅い** | 外部通信（正常でも 0.8 秒、遮断なら 5 秒待ち） | 同上 |
| 特定のページだけ遅い | クエリ。`slow.log` の `Rows_examined` | 同上 |

### 検索・セキュリティ

| 状況 | 記事 |
|---|---|
| **検索結果に出てこない** | [noindex・robots.txt・サイトマップを 1 分で確認](articles/not-indexed-by-google.md) |
| **知らない管理者がいる / スパムリンクが埋まっている** | [データベース側の痕跡を探す](articles/compromised-db-side.md) |
| **攻撃者から何が見えているか知りたい** | [既定の WordPress を実測した](articles/attack-surface-audit.md) |
| **不審なログイン試行が大量に来る** | 同上（ログイン試行の制限は既定では無い） |
| **プラグインの脆弱性が心配 / 開発時の権限チェック** | [権限チェックの不備を実測する](articles/broken-access-control.md) |

### 表示がおかしい（ページ自体は 200 で返っている）

| 見えているもの | まず疑う | 記事 |
|---|---|---|
| **CSS が効かない / JS が動かない** | アセットが 404 か 403。読めていないのか効いていないのか | [まず読み込まれているか確認する](articles/css-js-not-loading.md) |
| **ブロックエディターが真っ白 / Gutenberg が使えない** | 1.4MB の JS が読めているか、REST が生きているか | [1.4MB の JS が読めているか](articles/block-editor-blank.md) |
| **管理画面だけ表示が崩れる** | `load-styles.php` / `load-scripts.php` が通っているか | [結合配信を確認する](articles/admin-styles-broken.md) |
| **スマホだけレイアウトが崩れる** | サーバーが同じ HTML を返しているかを先に確定させる | [サーバーは同じものを返している](articles/mobile-layout-broken.md) |
| **画像が表示されない**（アップロードは成功） | 404 か 403 か、URL が違うか | [404 の中身は 20KB の HTML](articles/images-not-displaying.md) |
| **リダイレクトを繰り返す** | ログに何も出ないループと 500 になるループがある | [2 種類のループ](articles/redirect-loop.md) |
| **SSL 化したら画像・CSS が読み込めない** | 混在コンテンツ。置換は `guid` を除外する | [検出と置換](articles/ssl-mixed-content.md) |

---

## 直前にやったことから引く

こちらのほうが精度が高い。**時間的に近いものが原因**である確率は高い。

| 直前にやったこと | 記事 |
|---|---|
| PHP のバージョンを変えた | [PHP を上げたらサイトが白画面になった](articles/php-upgrade-white-screen.md) / [7 で動いていたコードが 8 で壊れる](articles/php7-to-php8-breaking-changes.md) |
| **プラグインを更新した** | [プラグインの競合](articles/plugin-conflict-diagnosis.md) |
| プラグインを有効化した | 同上（ただし有効化は WordPress が止めるので稀） |
| `functions.php` を編集した | [functions.php を壊したときの復旧](articles/functions-php-broken-recovery.md) |
| `.htaccess` を編集した | [.htaccess で 500 エラー](articles/htaccess-500-rewrite-loop.md) |
| SSL を設定した / 独自ドメインに変えた | [ログインできない](articles/login-impossible.md) のパターン 2 |
| サーバーを移行した | [原因を切り分ける（DB）](articles/db-connection-error-diagnosis.md) / [ログインできない](articles/login-impossible.md) |
| WordPress 本体を更新した（途中で止まった） | [.maintenance と 10 分ルール](articles/maintenance-mode-stuck.md) |
| セキュリティプラグインを入れた | [更新に失敗しました](articles/rest-json-update-failed.md)（REST 遮断） / [SiteGuard でログインできない](articles/siteguard-lockout.md) |
| キャッシュプラグインを入れた | [プラグインの競合](articles/plugin-conflict-diagnosis.md) |
| 何もしていない | 自動更新か、接続数枯渇（時々落ちるなら後者） |
| プラグインを増やし続けた | [WordPress が重い](articles/site-is-slow.md)（`autoload` の肥大） |
| 制作中にインデックス設定を切った | [検索結果に出てこない](articles/not-indexed-by-google.md) |
| サーバーを移行した（文字・時刻） | [絵文字が消える / 時刻が 9 時間ずれる](articles/emoji-and-timezone.md) |
| メニューやカスタムフィールドを大量に編集した | [保存したのに一部だけ消えた](articles/max-input-vars-silent-loss.md) |
| `wp-config.php` をコピー・退避した | [設定ファイルの露出](articles/config-file-exposure.md) |
| 月が変わった | [画像をアップロードできない](articles/media-upload-failure.md)（年月ディレクトリの権限） |
| SSL を入れた | [SSL 化したら画像・CSS が読み込めない](articles/ssl-mixed-content.md) / [リダイレクトを繰り返す](articles/redirect-loop.md) |
| 「セキュリティ強化」の設定を入れた | [ブロックエディターが真っ白](articles/block-editor-blank.md)（`wp-includes` を丸ごと塞ぐと壊れる） |
| キャッシュ・最適化プラグインを入れた | [CSS が効かない / JS が動かない](articles/css-js-not-loading.md) / [スマホだけ崩れる](articles/mobile-layout-broken.md) |

---

## 最初に取る 4 つの値

原因を推測する前に取る。**ステータスコードだけでは判断できない**
（サイトが死んでいても 200 が返るケースを 4 つ実測している）。

```sh
# 1. どこが生きているか
curl -s -o /dev/null -w 'top   %{http_code}\n' https://example.com/
curl -s -o /dev/null -w 'login %{http_code}\n' https://example.com/wp-login.php
curl -s -o /dev/null -w 'admin %{http_code}\n' https://example.com/wp-admin/

# 2. 本文の長さ(200 でも中身が死んでいることがある)
curl -s https://example.com/ | wc -c

# 3. ログイン用 Cookie が出ているか(0 ならログインは絶対に成功しない)
curl -s -o /dev/null -D - https://example.com/wp-login.php | grep -ci set-cookie

# 4. REST API が JSON を返しているか
curl -s -o /dev/null -D - https://example.com/wp-json/ | grep -i content-type

# 5. ページ内の CSS / JS / 画像が読めているか(「表示がおかしい」系はこれが本体)
bin/diagnose.sh https://example.com
```

この 4 つをまとめて出すのが `bin/diagnose.sh`。

```sh
bin/diagnose.sh                      # ラボの 2 ゲートウェイ
bin/diagnose.sh https://example.com  # 任意のサイト
```

### 値の読み方

| 観測 | 意味 |
|---|---|
| トップ 200・管理画面 500 | 権限かリダイレクト設定。テーマ・プラグインの Fatal ではない |
| 全部 500 | テーマかプラグインの Fatal。入口が全部閉じている |
| 全部 503 + `Retry-After` | `.maintenance` の残留 |
| 200 なのに本文が極端に短い | Fatal が本文に出ている（`display_errors` が有効） |
| 200 で本文 0 バイト | テーマが見つからない状態 |
| `Set-Cookie` が 0 | ヘッダより前に出力がある（`functions.php` の末尾など） |
| REST が `text/html` | 遮断されているか、REST 内で Fatal |
| アセットに 404 がある | ファイルが無い。**404 でも 20KB の HTML が返る**ので転送量では判断できない |
| アセットに 403 がある | サーバー設定で塞がれている（`wp-includes` を丸ごと拒否など） |
| アセットが全部 200 なのに崩れる | キャッシュ・読み込み順・結合プラグイン・混在コンテンツ |

---

## 復旧手段の早見表

| 環境 | プラグインを止める | テーマを戻す |
|---|---|---|
| **WP-CLI がある** | `wp --skip-plugins plugin deactivate --all` | `wp --skip-themes theme activate <別テーマ>` |
| **FTP だけ** | 該当フォルダをリネームし、管理画面に一度入る | テーマのフォルダをリネーム |
| **phpMyAdmin だけ** | `active_plugins` を空に | `template` / `stylesheet` を更新 |

**Fatal が起きているときは WP-CLI 単体でも落ちる。**`--skip-plugins` /
`--skip-themes` が必要（実測）。

詳細は [WP-CLI が無い環境での復旧](articles/recovery-without-wp-cli.md)。

---

## 記事の一覧

- 原因別の索引: [error-catalog.md](error-catalog.md)
- **プラグイン名から引く索引: [plugins.md](plugins.md)**
  （「Contact Form 7 メール 届かない」のように製品名で探す人向け）
