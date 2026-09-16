---
title: "WordPressでリダイレクトが多すぎます（ERR_TOO_MANY_REDIRECTS）の対処法"
slug: redirect-loop
seo_title: "リダイレクトが多すぎます｜ループの原因と対処"
description: "「リダイレクトが多すぎます」（ERR_TOO_MANY_REDIRECTS）やログイン画面との往復の対処法。エラーログに何も出ない外部ループと500になる内部ループを見分ける。siteurl不一致やSSL強制が原因のケースを実測。"
keywords: "リダイレクトが多すぎます, ERR_TOO_MANY_REDIRECTS, WordPress リダイレクト ループ, ログイン 戻される 繰り返し, リダイレクトを繰り返しました"
category: 障害報告
tags: [wordpress, リダイレクト, ssl, htaccess, siteurl]
summary: |
  ループは 2 種類あり、ログの出方で見分けられます。
  ・ブラウザに「リダイレクトが繰り返し行われました」と出てエラーログが空 → 外部リダイレクトのループ。SSL 強制の条件ミスか、SSL 強制プラグインの重複
  ・500 でエラーログに AH00124 → 内部リライトのループ。RewriteBase の誤りなど
  ・エラーは出ないのにログイン画面に戻され続ける → WP_HOME と WP_SITEURL のホストが違い、Cookie が別ホストに置かれている
  ・管理画面に入れないときは、.htaccess と SSL 強制プラグインのフォルダを FTP でリネームする
status: published
published: 2026-09-16
verified: 2026-09-12
---

ブラウザに「リダイレクトが多すぎます」（`ERR_TOO_MANY_REDIRECTS`）と出る。
あるいはログインしても管理画面に入れず、ログイン画面に戻される。

**ループには 2 種類あり、ログの出方が正反対です。**
どちらかを先に判別すると、調べる場所が決まります。

## 2 種類のループ

実測した比較です。

| | ステータス | `error.log` | `access.log` |
|---|---|---|---|
| **外部リダイレクトのループ** | **301 を繰り返す** | **何も出ない** | 301 が並ぶ |
| **内部リライトのループ** | **500** | `AH00124` | 500 |

**エラーログに何も出ていないのにサイトが見られない場合は、
外部リダイレクトのループです。**エラーとして扱われないため、ログを見ても
何も分かりません。これが調査を空振りさせます。

## 外部リダイレクトのループ

実測しました。`.htaccess` に「SSL 強制」の規則を入れた状態です。

```apache
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ http://localhost:8082/$1 [R=301,L]
```

結果です。

```
Apache: HTTP 301 リダイレクト回数=8   ← curl の上限で打ち切り
Location: http://localhost:8082/       ← 自分自身
error.log の行数: 0
AH00124 の件数: 0
```

`Location` が**自分自身**を指しています。ブラウザは 301 を追いかけ続け、
上限に達して `ERR_TOO_MANY_REDIRECTS` を表示します。

![このページは動作していません。リダイレクトが繰り返し行われました。ERR_TOO_MANY_REDIRECTS](../screenshots/e/redirect-loop-too-many-redirects.jpg)

*同じ状態を Chrome で開いた画面。サーバーのエラーログにはこのとき何も出ていない*

なお nginx 側は `.htaccess` を読まないため **200 のまま正常**でした。
**2 台構成やステージングで「片方だけループする」**のはこの非対称性です。

### なぜ条件が満たされないのか

`%{HTTPS}` は、**Apache 自身が SSL を終端している場合にだけ** `on` になります。

ロードバランサや CDN、リバースプロキシが SSL を終端して、
そこから先は HTTP でサーバーに渡す構成では、
**Apache から見ると常に `off`** です。

- ブラウザ → （https）→ プロキシ → （http）→ Apache
- Apache は「HTTPS off」と判断して https にリダイレクト
- ブラウザは https で再度アクセスするが、Apache には再び http で届く
- 永久に繰り返す

正しくは、プロキシが付けるヘッダを見ます。

```apache
RewriteCond %{HTTP:X-Forwarded-Proto} !https
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
```

WordPress 側も同じ対応が必要です。

```php
// wp-config.php の、wp-settings.php を読み込む行より前に置く
if ( isset( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) && 'https' === $_SERVER['HTTP_X_FORWARDED_PROTO'] ) {
	$_SERVER['HTTPS'] = 'on';
}
```

**これが無いと、WordPress は「自分は http で動いている」と思い込み、
https のページから http の URL を出力します**（混在コンテンツの原因にもなります）。

### SSL 強制プラグインを 2 つ入れた場合

「Really Simple SSL」のような SSL 強制プラグインと、`.htaccess` の規則、
サーバー側の設定が**同時に有効**だと、互いにリダイレクトし合います。

**SSL 強制は 1 箇所だけ**にします。どこでやっているか分からない状態が
いちばん危険です。

## 内部リライトのループ

こちらは 500 になり、ログに残ります。

```
AH00124: Request exceeded the limit of 10 internal redirects due to probable
configuration error.
```

外部へのリダイレクトではなく、Apache 内部で書き換えを繰り返している状態です。
`RewriteBase` の誤りが典型です。

→ 詳細は [.htaccess で 500 エラー](htaccess-500-rewrite-loop.md)

**トップページだけ表示されて個別記事が 500**という特徴的な症状になります。

## ログイン画面との往復

「リダイレクトが多すぎます」とは出ないのに、
**ログインしても毎回ログイン画面に戻される**場合です。

実測しました。`WP_HOME` と `WP_SITEURL` を食い違わせた状態です。

```
WP_HOME    = http://localhost:8080
WP_SITEURL = http://127.0.0.1:8080
```

管理画面にアクセスしたときの挙動です。

```
HTTP/1.1 302 Found
Location: http://127.0.0.1:8080/wp-login.php?redirect_to=http%3A%2F%2Flocalhost%3A8080%2Fwp-admin%2F
```

**別ホストのログイン画面に飛ばされています。**
ここが問題になるのは Cookie の仕組みです。

WordPress が発行するログイン Cookie には `Domain` 属性が付きません
（実測: `Set-Cookie: wordpress_test_cookie=...; path=/; HttpOnly`）。
**Cookie はアクセスしたホストにだけ保存されます。**

1. `127.0.0.1` のログイン画面でログイン → Cookie は `127.0.0.1` に保存される
2. `redirect_to` が指す `localhost/wp-admin/` に飛ばされる
3. `localhost` には Cookie が無いので未ログイン扱い
4. ログイン画面に戻される（1 に戻る）

**HTTP レベルの無限ループではないので `ERR_TOO_MANY_REDIRECTS` は出ません。**
利用者から見ると「ログインできない」という報告になります。
→ [ログインできない時の症状別の見分け方](login-impossible.md)

同じことが `www` 有り無し、`http` / `https`、独自ドメインと
サーバー既定ドメインの混在でも起きます。**ホストが 1 文字でも違えば別扱い**です。

## 切り分けの順番

```sh
# リダイレクトの連鎖を数える
curl -s -o /dev/null -L --max-redirs 10 \
  -w 'status=%{http_code} redirects=%{num_redirects} final=%{url_effective}\n' \
  https://example.com/

# 1 段目だけ見る
curl -s -o /dev/null -D - https://example.com/ | grep -iE '^HTTP/|^location'
```

| 観測 | 原因 |
|---|---|
| 301 が延々と続き、`Location` が自分自身 | 外部リダイレクトのループ（SSL 強制の条件ミス、プラグインの重複） |
| 500 + `error.log` に `AH00124` | 内部リライトのループ（`RewriteBase` など） |
| `Location` のホストが違う | `WP_HOME` / `WP_SITEURL` の不一致。Cookie が別ホストに置かれる |
| `http` と `https` を往復している | プロキシ配下で `X-Forwarded-Proto` を見ていない |

**`error.log` を見て何も無ければ、外部リダイレクトのループ**と判断して
`.htaccess` とプラグインの設定に移ります。

## 復旧できないときの入口

ループしていると管理画面に入れないので、プラグインを止められません。

- `.htaccess` を退避する（リネームする）→ サーバー側の規則が止まる
- FTP でプラグインのフォルダをリネームする → SSL 強制プラグインが止まる

→ [WP-CLI が無い環境での復旧](recovery-without-wp-cli.md)

**`.htaccess` をリネームするとパーマリンクが 404 になりますが、
トップページと管理画面には入れるようになります。**
まず入れる状態を作ってから原因を直します。

## 再現手順

```sh
cp src/.htaccess /tmp/ht.bak

# 自分自身に 301 する規則を、WordPress ブロックより前に入れる
# RewriteCond %{HTTPS} off
# RewriteRule ^(.*)$ http://localhost:8082/$1 [R=301,L]

curl -s -o /dev/null -L --max-redirs 8 -w '%{num_redirects} 回\n' http://localhost:8082/
curl -s -o /dev/null -D - http://localhost:8082/ | grep -i location
wc -l < logs/apache/error.log      # 0 行(エラーとして残らない)

cp /tmp/ht.bak src/.htaccess
```
