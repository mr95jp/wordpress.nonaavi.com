---
title: "WordPressのエラーログはどこにある？debug.logの場所と見方"
slug: where-are-the-logs
seo_title: "WordPress ログの場所｜debug.log の見方"
description: "WordPressのログはどこにあり、どの障害がどこに記録されるかを実測で一覧化。max_input_vars超過はPHPログだけ、外部リダイレクトループはどこにも出ない。"
keywords: "WordPress ログ 場所, debug.log どこ, WordPress エラーログ 見方, error_log 場所, デバッグ ログ 出し方, WP_DEBUG"
category: 技術メモ
tags: [wordpress, ログ, debug-log, デバッグ, 障害対応]
summary: |
  障害は層ごとに別のログに出ます。debug.log が空でも、障害が無いとは限りません。
  ・Fatal error、構文エラー、DB 接続エラー → wp-content/debug.log（wp-config.php で WP_DEBUG_LOG を有効にしておく）
  ・max_input_vars や post_max_size の超過 → サーバーの PHP エラーログだけ（in Unknown on line 0 が目印）
  ・.htaccess の誤り、内部リライトのループ → Apache のエラーログ
  ・外部リダイレクトのループ、DB 名の誤り → どのログにも出ない
  debug.log は Web から読めるので、公開領域の外に出すか、サーバー設定で拒否します。
status: published
published: 2026-09-16
verified: 2026-09-12
---

「`debug.log` を見てください」と言われたが、そのファイルが無い。
あるいは**見ているのに何も出ていない。**

WordPress の障害は**層ごとに別のログに出ます。**そして
**どのログにも出ないものがあります。**
実際に障害を起こして、どこに記録されるかを 1 つずつ確認しました。

## ログは 4 つある

| ログ | 場所 | 書いているもの |
|---|---|---|
| **WordPress のデバッグログ** | `wp-content/debug.log` | PHP のエラーのうち、WordPress が起動した後のもの |
| **PHP のエラーログ** | サーバー設定次第（`php.ini` の `error_log`） | PHP のエラー全部。**起動前のものも含む** |
| **Web サーバーのログ** | Apache: `error_log` / nginx: `error.log` | `.htaccess` の誤り、プロキシの失敗 |
| **MySQL のログ** | `error.log` / `slow.log` | 接続エラー、遅いクエリ |

**この 4 つは別物です。**`debug.log` は WordPress が自分で書いているだけなので、
**WordPress が起動する前に起きたことは入りません。**これが「見ているのに何も無い」の
最大の原因です。

## まず debug.log を出す設定

既定では書かれません。`wp-config.php` に 3 行足します。

```php
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );   // 訪問者には見せない
```

**`WP_DEBUG_DISPLAY` を `false` にするのが重要です。**
`true` のままだとエラーが画面に出力され、
**ヘッダ送出前に本文が始まるためリダイレクトや Cookie が壊れます**
（別記事で実測済み）。さらに**障害のステータスが 500 ではなく 200 になります。**

出力先を変えることもできます。

```php
define( 'WP_DEBUG_LOG', '/path/outside/webroot/wp-debug.log' );
```

**`wp-content/debug.log` は Web から読めます。**
`https://example.com/wp-content/debug.log` が 200 で返る状態は、
**ファイルパスやクエリの内容を外部に公開している**のと同じです。
公開領域の外に出すか、サーバー設定で拒否します。

## 障害ごとの記録先（実測）

検証環境で実際に障害を起こして確認した対応表です。

| 障害 | `debug.log` | PHP ログ | Web サーバーログ |
|---|---|---|---|
| テーマ・プラグインの Fatal error | **出る**（ファイルと行番号） | 出る | — |
| 構文エラー（Parse error） | **出る** | 出る | — |
| DB 接続エラー | **出る**（`1045` / `2002` / `1040`） | 出る | — |
| **DB 名の誤り** | **出ない** | 出ない | — |
| `headers already sent` | **出る**（`output started at` が原因の場所） | 出る | — |
| **`max_input_vars` 超過** | **出ない** | **出る** | — |
| **`post_max_size` 超過** | **出ない** | **出る** | — |
| `.htaccess` の構文エラー | — | — | **Apache に出る**（`Invalid command`） |
| 内部リライトのループ | — | — | **Apache に出る**（`AH00124`） |
| **外部リダイレクトのループ** | — | — | **どこにも出ない** |
| 502 / 504 | — | — | **nginx に出る**（`connect() failed` / `upstream timed out`） |
| 遅いクエリ | — | — | **MySQL の `slow.log`** |

### 起動前に出るものは debug.log に入らない

`max_input_vars` と `post_max_size` の超過は、**WordPress が動き出す前**に
PHP が判定します。そのため `debug.log` には 1 件も記録されません。

実測した記録です（PHP のエラーログ側）。

```
PHP Warning:  PHP Request Startup: Input variables exceeded 50.
To increase the limit change max_input_vars in php.ini. in Unknown on line 0

PHP Warning:  POST Content-Length of 3072310 bytes exceeds the limit of 2097152 bytes
in Unknown on line 0
```

`in Unknown on line 0` が目印です。**「どのファイルでもない」= 起動前**です。

**「メニューが保存できない」「アップロードすると何も起きない」で
`debug.log` を見ても空**なのは、この理由です。見る場所はサーバーの PHP ログです。

### どこにも出ないもの

**外部リダイレクトの無限ループ**は、どのログにも記録されません。
サーバーは 301 を正常に返しているだけなので、エラーとして扱われないためです。

実測では、ループしている間 `error.log` は **0 行**でした。
`access.log` に 301 が並ぶだけです。

**「ログに何も出ていないのにサイトが見られない」は、それ自体が手がかり**です。
→ [リダイレクトを繰り返す](redirect-loop.md)

**DB 名の誤り**も同様に何も出ません。唯一原因を言うのは WP-CLI です。
→ [「データベース接続確立エラー」の原因を切り分ける](db-connection-error-diagnosis.md)

## PHP のエラーログはどこにあるのか

これがいちばん探しにくいログです。設定を確認します。

```sh
php -i | grep error_log
```

WordPress 側から見るなら、管理画面の **ツール > サイトヘルス > 情報 > サーバー**
にも出ています。

レンタルサーバーの場合は、置き場所が事業者ごとに違います。

- 管理画面に「エラーログ」の閲覧機能がある（多い）
- ドキュメントルートに `error_log` というファイルが作られる
- ログ専用のディレクトリに置かれる

**`wp-config.php` で自分の管理下に集めてしまうのが確実です。**

```php
// wp-config.php の先頭付近
@ini_set( 'log_errors', 'On' );
@ini_set( 'error_log', dirname( __FILE__ ) . '/../php-errors.log' );  // 公開領域の外
```

これを入れておけば、**起動前のエラーも含めて 1 箇所にまとまります。**

## MySQL のログ

### 接続エラー

エラー番号で原因が割れます（実測値）。

| 番号 | 意味 |
|---|---|
| `1045` | 認証。ユーザー名かパスワードが違う |
| `2002` | 到達できない。ホスト名の誤り、または MySQL が停止 |
| `1040` | 接続数の枯渇 |

### 遅いクエリ

`long_query_time` を超えたクエリが `slow.log` に記録されます。実測しました。

```
# Query_time: 3.000884  Lock_time: 0.000000 Rows_sent: 1  Rows_examined: 0
SELECT SLEEP(3);
```

**`Rows_examined` が大きいものが本当の問題**です。
`Query_time` が長いだけなら回線や負荷の影響もありますが、
`Rows_examined` が数万〜数百万なら**インデックスが効いていません。**

有効化には設定が必要です。

```ini
slow_query_log      = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time     = 1
```

## opcache に注意

**コンパイル時に出る警告は 1 回しか記録されません。**

実測では、3 リクエスト連続で叩いたときの件数がこうなりました。

| 警告の種類 | 3 リクエストでの件数 |
|---|---|
| 実行時（動的プロパティの作成など） | **3** |
| **コンパイル時**（`${var}` の補間など） | **0** |

opcache がコンパイル結果を持っている間、構文レベルの警告は二度と出ません。
**PHP を上げた直後に 1 回だけ出た警告は、後から調べても再現しません。**
→ [PHP 8 に上げる前に debug.log で見ておくこと](php7-to-php8-breaking-changes.md)

調査するときは opcache をリセットしてから 1 回目のログを見ます。

```sh
php -r 'opcache_reset();'   # または php-fpm / Apache を再起動
```

## 障害が起きたときの見る順番

```sh
# 1. ステータスと本文の長さを取る(200 でも死んでいることがある)
curl -s -o /tmp/body -w 'HTTP %{http_code}
' https://example.com/
wc -c < /tmp/body

# 2. WordPress のログ
tail -50 wp-content/debug.log

# 3. PHP のログ(起動前のエラーはこちらだけ)
tail -50 /path/to/php-error.log | grep "in Unknown on line 0"

# 4. Web サーバーのログ
tail -50 /path/to/error_log
```

| 症状 | 最初に見るログ |
|---|---|
| 500 / 重大なエラー | `debug.log` |
| 保存した内容が一部消える | **PHP のログ**（`debug.log` には出ない） |
| アップロードで何も起きない | **PHP のログ** |
| 投稿だけ 404 | **Web サーバーのログ**（`.htaccess`） |
| リダイレクトが止まらない | **ログを見ても無駄**。`Location` ヘッダを追う |
| 間欠的に落ちる | **MySQL のログ**（`1040`）、`slow.log` |
| 何も出ていない | DB 名の誤り、外部リダイレクトのループ、起動前のエラー |

**「ログに何も出ていない」で止まらないこと。**
それは「そのログには出ない種類の障害」だという情報です。

## 調査用の記録を足すなら mu-plugins に置く

障害を調べるためにログを書くコードを足すなら、通常のプラグインではなく
`wp-content/mu-plugins/` に置きます。この記事の検証でも、記録はこの方式で取りました。

**プラグインが Fatal で停止させられても、リカバリーモードで
全プラグインが読み込まれなくても記録が残る**ためです。
記録用のコードを通常のプラグインに置くと、いちばん知りたい瞬間に道連れで消えます。
