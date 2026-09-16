---
title: "WordPressのセキュリティ確認 — 攻撃者から何が見えているか実測"
slug: attack-surface-audit
seo_title: "WordPress セキュリティ確認｜漏れている情報"
description: "既定のWordPressが攻撃者に何を見せているかを実測。ユーザー名が4経路（REST/?author/ログインエラー/XML-RPC）から漏れる。効かない対策（is_adminやxmlrpc_enabled）も実測で特定。"
keywords: "WordPress セキュリティ 対策, ユーザー名 漏洩, ユーザー列挙, xmlrpc 対策, WordPress 脆弱性 確認, ブルートフォース 対策"
category: 技術メモ
tags: [wordpress, セキュリティ, 脆弱性, ユーザー列挙, xmlrpc, rest-api]
summary: |
  インストールしたままの WordPress は、ログインしなくても次のことを外に見せています。
  ・ユーザー名 → REST API のユーザー一覧、?author=1 のリダイレクト先、ログインエラーの文言、XML-RPC
  ・バージョン → meta generator、アセットの ?ver=、readme.html
  ・ログイン試行の回数制限は無い
  ・?author=N は template_redirect では塞げない。XML-RPC は xmlrpc_enabled では system.multicall が残るので、サーバー側で拒否する
  隠すことより、更新・強いパスワード・ログイン試行の制限が先です。
status: published
published: 2026-09-16
verified: 2026-09-12
---

「WordPress は狙われやすい」と言われても、**具体的に何が見えているのか**は
分かりにくいものです。

インストールしたままの WordPress に対して、攻撃者が最初に行う情報収集を
実際にやってみました。**そして対策を入れて、効いたものと効かなかったものを
計測しました。**

## 攻撃の前提: まずユーザー名を集める

パスワードを試すには、有効なユーザー名が必要です。
既定の WordPress は**これを 4 経路で教えます。**

### ① REST API のユーザー一覧

```sh
curl -s "https://example.com/wp-json/wp/v2/users"
```

実測結果です。

```
HTTP 200
露出したユーザー数: 2
  1  admin           / admin
  4  lab_contributor / Lab contributor
```

**ログインせずに、ログイン名（`slug`）と表示名が取れます。**
投稿があるユーザーが対象です。

### ② 投稿者アーカイブ

```sh
curl -s -o /dev/null -D - "https://example.com/?author=1"
```

```
HTTP/1.1 301 Moved Permanently
Location: https://example.com/author/admin/
```

**ID を 1 から順に試すだけで、ユーザー名が判明します。**
リダイレクト先の URL にログイン名が入るためです。

### ③ ログインエラーのメッセージ

これがいちばん直接的です。誤ったパスワードで試した結果です。

| 入力したユーザー名 | 返ってきたメッセージ |
|---|---|
| `admin`（実在） | **「ユーザー名 admin のパスワードが間違っています。」** |
| `nosuchuser_zzz`（存在しない） | **「ユーザー名 nosuchuser_zzz は、このサイトに登録されていません。」** |

**メッセージが違うので、ユーザー名が実在するかどうかが分かります。**
これは既定の動作です。

### ④ XML-RPC

```sh
curl -X POST "https://example.com/xmlrpc.php" -H "Content-Type: text/xml" \
  --data '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>'
```

実測で利用可能だったメソッドです。

```
system.multicall
wp.getUsersBlogs
pingback.ping
```

**`system.multicall` があると、1 回のリクエストに大量のログイン試行を
詰め込めます。**`wp.getUsersBlogs` は認証を試すためのメソッドです。

## 攻撃の前提: バージョンを特定する

脆弱性は「このバージョンに存在する」という形で公開されるため、
攻撃者はまずバージョンを見ます。**実測では 3 経路で分かりました。**

| 経路 | 実測結果 |
|---|---|
| `meta generator` | `<meta name="generator" content="WordPress 7.1" />` |
| アセットの `?ver=` | `ver=7.1` |
| `/readme.html` | **HTTP 200**（本体のバージョンが書かれている） |
| `/license.txt` | HTTP 200 |

プラグインも同じ方法で分かります。

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://example.com/wp-content/plugins/akismet/readme.txt"
```

**200 が返れば、そのプラグインが入っていることが確定します。**
実測では `akismet/readme.txt` が 200、存在しないプラグインは 404 でした。
`readme.txt` にはバージョンも書かれています。

**「どのプラグインの何番が入っているか」は外から一覧できる**ということです。

## ログイン試行の制限は既定では無い

同じユーザー名で 5 回連続でログインを試した結果です。

```
200 200 200 200 200
```

**制限も遅延もありません。**自動化ツールで 1 秒間に何百回も試せます。

## 対策を入れて効果を測った

`mu-plugins` に対策をまとめて、前後を比較しました。

| 対策 | 結果 |
|---|---|
| REST のユーザー一覧を未ログインに返さない | **効いた**（200 → 401 `rest_forbidden`） |
| ログインエラーのメッセージを統一する | **効いた**（実在・非実在で同一文になった） |
| `meta generator` を消す | **効いた**（0 件） |
| アセットの `?ver=` を消す | **効いた**（0 件） |
| `?author=N` を塞ぐ | **最初は効かなかった**（後述） |
| XML-RPC を止める | **PHP のフィルタだけでは不完全**（後述） |

### 効かなかった 1: `?author=N`

最初はこう書きました。

```php
add_action( 'template_redirect', function () {
	if ( is_author() ) { wp_safe_redirect( home_url( '/' ), 301 ); exit; }
} );
```

**まだ `/author/admin/` へリダイレクトされました。**
WordPress の正規化リダイレクト（`redirect_canonical`）は
`template_redirect` より**先に**走るためです。

クエリが解釈される時点で弾く必要があります。

```php
add_action( 'parse_request', function ( $wp ) {
	if ( is_user_logged_in() ) { return; }
	if ( isset( $wp->query_vars['author'] ) || isset( $wp->query_vars['author_name'] ) ) {
		wp_safe_redirect( home_url( '/' ), 301 );
		exit;
	}
} );
```

これで `?author=1` はトップページへ 301 になりました（実測）。
**ユーザー名は出ません。**

### 効かなかった 2: XML-RPC

よく紹介される書き方です。

```php
add_filter( 'xmlrpc_enabled', '__return_false' );
```

実測では、**まだ `system.multicall` が使えました。**

```
xmlrpc POST: HTTP 200
  system.getCapabilities
  system.listMethods
  system.multicall
```

`xmlrpc_enabled` は **認証が必要なメソッド（`wp.getUsersBlogs` など）を
無効にするだけ**で、`system.*` 系は残ります。
メソッド一覧を空にするフィルタを足しても、**`system.*` は WordPress が
後から追加するため残りました。**

**サーバー側で拒否するしかありません。**

```apache
# .htaccess (Apache)
<Files "xmlrpc.php">
  Require all denied
</Files>
```

```nginx
# nginx
location = /xmlrpc.php { deny all; }
```

実測した結果です。

| | xmlrpc POST |
|---|---|
| Apache（`.htaccess` で拒否） | **403** |
| nginx（`.htaccess` を読まない） | **200** |

**`.htaccess` に書いても nginx では効きません。**
サーバーごとに設定する必要があります。

副作用も確認しました。サイト表示・REST API・管理画面はすべて正常
（200 / 200 / 302）でした。**XML-RPC を止めても通常の運用に影響はありません**
（アプリからの投稿や Jetpack を使っている場合は別です）。

## まとめた対策

```php
// mu-plugins/harden.php として置く

// 1. REST のユーザー一覧を未ログインには返さない
add_filter( 'rest_authentication_errors', function ( $result ) {
	if ( ! empty( $result ) ) { return $result; }
	$uri = $_SERVER['REQUEST_URI'] ?? '';
	if ( ! is_user_logged_in() && false !== strpos( $uri, '/wp/v2/users' ) ) {
		return new WP_Error( 'rest_forbidden', '', array( 'status' => 401 ) );
	}
	return $result;
} );

// 2. ?author=N を塞ぐ(parse_request でないと間に合わない)
add_action( 'parse_request', function ( $wp ) {
	if ( is_user_logged_in() ) { return; }
	if ( isset( $wp->query_vars['author'] ) || isset( $wp->query_vars['author_name'] ) ) {
		wp_safe_redirect( home_url( '/' ), 301 ); exit;
	}
} );

// 3. ログインエラーを統一する
add_filter( 'login_errors', function () {
	return 'ユーザー名またはパスワードが正しくありません。';
} );

// 4. バージョンを出さない
remove_action( 'wp_head', 'wp_generator' );
add_filter( 'style_loader_src',  fn( $src ) => remove_query_arg( 'ver', $src ) );
add_filter( 'script_loader_src', fn( $src ) => remove_query_arg( 'ver', $src ) );
```

サーバー側にも設定します。

```apache
<Files "xmlrpc.php">
  Require all denied
</Files>
<Files "readme.html">
  Require all denied
</Files>
<FilesMatch "\.(bak|save|old|orig|swp|inc)$|~$">
  Require all denied
</FilesMatch>
```

最後の 1 行は、**`wp-config.php.bak` のようなバックアップから
データベースのパスワードが全文露出する**のを防ぐためです（実測済み）。
→ [設定ファイルは漏れるのか](config-file-exposure.md)

## 優先順位

**情報を隠すのは二次的な対策です。**効果の大きい順に並べるとこうなります。

| 優先 | 対策 | 理由 |
|---|---|---|
| **1** | **本体・プラグイン・テーマを更新する** | 実際に侵入されるのは既知の脆弱性経由。隠しても古ければ破られる（→ [プラグインに多い脆弱性の型](broken-access-control.md)） |
| **2** | **強いパスワードと二要素認証** | ユーザー名が漏れても、パスワードが破れなければ入られない |
| **3** | **ログイン試行の制限** | 既定では無制限。総当たりを実際に止める |
| **4** | 使っていないプラグイン・テーマを削除する | 停止中でもファイルは残り、脆弱性の対象になる |
| 5 | XML-RPC を止める（使っていなければ） | マルチコール攻撃の土台を消す |
| 6 | ユーザー名・バージョンを隠す | 手間は増やせるが、それだけでは止まらない |

**6 を先にやっても効果は薄い**ということです。
ユーザー名が分かっても、パスワードが強ければ入られません。
逆に、ユーザー名を隠しても古い脆弱性が残っていれば
ログインを経由せずに侵入されます。

## 自分のサイトを確認する

```sh
S=https://example.com

# ユーザー名が漏れているか
curl -s "$S/wp-json/wp/v2/users" | head -c 300
curl -s -o /dev/null -D - "$S/?author=1" | grep -i location

# バージョンが分かるか
curl -s "$S/" | grep -oE '<meta name="generator"[^>]*'
curl -s -o /dev/null -w '%{http_code}\n' "$S/readme.html"

# XML-RPC が開いているか
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$S/xmlrpc.php" \
  -H "Content-Type: text/xml" \
  --data '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>'

# 設定ファイルのバックアップが残っていないか
for f in wp-config.php.bak "wp-config.php~" wp-config.txt .env; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$S/$f")" "$f"
done
```

**403 か 404 以外が返る行があれば、そこが対応箇所です。**

## 侵害されたあとの確認は別記事に

すでに入られている疑いがある場合は、痕跡の探し方が別になります。
**ファイルの検査だけでは、管理者の追加や本文への注入は見つかりません。**
→ [WordPressが乗っ取られた・改ざんされた時の確認と対処法](compromised-db-side.md)

## 参考にした情報源

- [WordPress 攻撃の手口と傾向 — WPセキュリティ](https://wpsecurity.jp/column/wp-attack-patterns/)
- [2026年版WordPress脆弱性対策｜8つの手法で攻撃防止 — NILTO](https://www.nilto.com/ja/knowledge/posts/wordpress-vulnerability/)
- [WordPress テーマ・プラグイン 脆弱性情報のまとめ — KUSANAGI](https://kusanagi.tokyo/releases/24853/)
- [WordPressプラグイン脆弱性情報 — ジオコード](https://www.geo-code.co.jp/seo/mag/vulnerability20260420/)
- [【実録】WordPressサイトがハッキングで全削除された](https://zenn.dev/7788/articles/6b8cc4701404e4)
