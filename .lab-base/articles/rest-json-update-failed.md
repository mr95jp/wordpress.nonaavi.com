---
title: "「更新に失敗しました。返答が正しいJSONレスポンスではありません」の対処法"
slug: rest-json-update-failed
seo_title: "WordPress 更新に失敗しました JSONレスポンス｜原因と対処法"
description: "投稿保存時の「更新に失敗しました。返答が正しいJSONレスポンスではありません」の対処法。REST APIがJSONを返していないのが原因。.htaccessの遮断・REST内のFatal・nonce切れの見分け方を実測で解説。"
keywords: "更新に失敗しました, 正しいJSONレスポンスではありません, WordPress 保存できない JSON, ブロックエディター 更新できない, REST API エラー"
category: 障害報告
tags: [wordpress, ブロックエディタ, rest-api, json, htaccess]
status: draft
verified: 2026-09-12
---

記事を保存しようとしたら、このメッセージが出た。

> 更新に失敗しました。返答が正しい JSON レスポンスではありません。

ブロックエディタが REST API を呼んだのに、**JSON ではないものが返ってきた**
という意味です。何が返っているのかを実際に見れば原因は分かります。

## まず何が返っているか見る

ブラウザの開発者ツールでもいいですが、コマンドで叩くのが速いです。

```sh
curl -s -o /dev/null -D - "https://example.com/wp-json/"
```

見るのは 2 つだけです。

| 見るところ | 正常 |
|---|---|
| ステータス | 200 |
| `Content-Type` | `application/json; charset=UTF-8` |

**`text/html` が返っていたら、それが原因です。**

## 原因 1: REST API が塞がれている

セキュリティ目的で `/wp-json` を遮断する設定が入っていることがあります。
`.htaccess` に次のような規則が書かれているケースです。

```apache
RewriteRule ^wp-json/ - [F,L]
```

実測すると、こうなりました。

| | ステータス | `Content-Type` | 本文 |
|---|---|---|---|
| Apache | **403** | **`text/html`** | Apache の 403 Forbidden ページ |
| nginx | 200 | `application/json` | 正常 |

**HTML が返るので、エディタは「正しい JSON ではない」と言います。**
メッセージは JSON の話をしていますが、**原因は REST API に到達できないこと**です。

nginx 側が影響を受けていないのは、`.htaccess` を読むのが Apache だけだからです。
レンタルサーバーはほぼ Apache なので、この経路は実務で頻出します。

### .htaccess を見るときの注意

**書いてある位置によって、効いているかどうかが変わります。**

WordPress が生成するブロックは `RewriteRule . /index.php [L]` で終わります。
`[L]` で処理が止まるため、**このブロックより後に書かれたリライト規則は
実行されません。**

実測でも、`# BEGIN WordPress` より後に置いた遮断ルールはまったく効かず、
前に移した瞬間に 403 になりました。

つまり **`.htaccess` に怪しい記述があっても、WordPress ブロックより後ろなら
それは原因ではありません。**探すのは前半です。

同じ遮断は、セキュリティプラグインや WAF（ModSecurity）でも起きます。
`.htaccess` に何もなければ、そちらを疑います。

## 原因 2: REST API の中で Fatal error が起きている

プラグインが REST の処理中に Fatal を起こすと、JSON の代わりに
PHP のエラーが返ります。厄介なのは**ステータスが 200 のまま**なことです。

実測値です。

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8

<br />
<b>Fatal error</b>: Uncaught Error: Call to undefined function ...
```

**ステータスは 200、Content-Type は JSON、中身は HTML。**
REST サーバーはコールバックを呼ぶ前にヘッダを送り終えているため、
あとから 500 に変えられません。

死活監視は 200 を受け取るので気づきません。
気づくのは「保存できない」という報告が来たときです。

詳しくは [REST API の Fatal error は HTTP 200 で返る](rest-api-fatal-http200.md)。

## 原因 3: 認証が通っていない

ログインしているのに 401 が返ることがあります。

```json
{"code":"rest_not_logged_in","message":"現在ログインしていません。","data":{"status":401}}
```

REST API の Cookie 認証は **`X-WP-Nonce` ヘッダが必須**です。
無いと未ログイン扱いになります。

これは仕様なので、**`curl` で叩いて 401 が返るのは正常**です。
エディタからのリクエストには nonce が付くので 200 になります（実測で確認）。

「ブラウザでは動くのに curl では 401」の正体はこれで、
**この場合は原因ではありません。**混同しないようにします。

ただし**ログインしたまま長時間エディタを開いていた**場合は別で、
nonce の有効期限切れで実際に失敗します。画面を再読み込みすれば直ります。

## 原因 4: レスポンスの前に余計な出力が混ざっている

テーマの `functions.php` の末尾に空白があると、JSON の前にその空白や
Warning が出力されて、パースに失敗します。

この場合は REST だけでなく**ログインもできなくなる**ので、症状で区別できます。
`/wp-login.php` の `Set-Cookie` が 0 個なら、こちらです。

```sh
curl -s -o /dev/null -D - "https://example.com/wp-login.php" | grep -ci set-cookie
```

詳しくは [functions.php を壊したときの復旧](functions-php-broken-recovery.md)。

## 切り分けの順番

```sh
# 1. REST のトップが JSON を返すか
curl -s -o /dev/null -D - "https://example.com/wp-json/" | grep -iE '^HTTP|^content-type'
```

| 結果 | 原因 |
|---|---|
| 403 + `text/html` | 遮断されている（原因 1） |
| 200 + `application/json` なのに本文が HTML | REST 内で Fatal（原因 2） |
| 401 `rest_not_logged_in` | 正常（原因ではない） |
| 200 + JSON だが先頭に空白や Warning | 余計な出力（原因 4） |
| 404 | パーマリンク設定かサーバー設定。設定を保存し直す |
| 200 + 正常な JSON | REST は無罪。JS 側（プラグイン競合）を疑う |

最後の「REST は正常なのにエディタが失敗する」場合は、
ブラウザのコンソールに JS のエラーが出ていないか見ます。
jQuery の二重読み込みなどプラグイン競合の可能性があります。

詳しくは [プラグインの競合](plugin-conflict-diagnosis.md)。

## 応急処置として使えるもの

**クラシックエディタに切り替える**と、REST API を使わずに保存できます。
原因を直すまでの時間を稼げます。ただし REST API はエディタ以外
（スマホアプリ、外部連携、一部プラグイン）も使うので、
遮断を放置すると別の場所で問題が出ます。
