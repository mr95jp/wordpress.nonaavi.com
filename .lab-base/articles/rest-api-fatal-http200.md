---
title: "WordPress REST APIのエラーがHTTP 200で返る — 監視が見逃す死角"
slug: rest-api-fatal-http200
seo_title: "WordPress REST API Fatal error 200｜監視が見逃す仕組み"
description: "REST APIのFatal errorがHTTP 200で返り、死活監視が見逃すことを実測。同じFatalがRESTで200・admin-ajaxで500になる理由（ヘッダ送出のタイミング）と、監視で検知する方法を解説。"
keywords: "WordPress REST API エラー, REST API 200, フロント 壊れてる 監視 正常, 死活監視 見逃す, api/wp-json エラー, JSON エラー"
category: 技術メモ
tags: [wordpress, rest-api, php, 監視]
status: draft
verified: 2026-09-12
---

API を叩いているフロントが壊れているのに、監視は全部グリーン。
ステータスコードを見ている限り、どこにも異常が見つからない。

WordPress の REST API で Fatal error が起きたとき、**レスポンスは 500 ではなく
200 OK で返ってくる**ことがあります。ローカル環境で実際に計測した結果と、
なぜそうなるのかをまとめます。

## 同じ Fatal error が、経路によって別のステータスになる

検証用プラグインで、未定義の関数を呼ぶだけの Fatal error を 2 つの経路に仕込んで
叩き比べました。エラーの内容は同一です。

| 経路 | HTTP | Content-Type | 本文 |
|---|---|---|---|
| `/wp-json/lab/v1/boom` | **200 OK** | `application/json` | HTML のスタックトレース |
| `/wp-admin/admin-ajax.php?action=lab_boom` | **500** | `text/html` | 「このサイトで重大なエラーが発生しました。」 |

REST 側のレスポンスヘッダは、こうなっていました。

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8
X-Powered-By: PHP/8.2.33
```

そして本文が、これです。

```html
<br />
<b>Fatal error</b>:  Uncaught Error: Call to undefined function ...
Stack trace:
#0 /var/www/html/wp-includes/rest-api/class-wp-rest-server.php(1293)
...
```

`Content-Type` は JSON だと言っているのに、中身は HTML。しかもステータスは 200。

## 原因はヘッダの送出タイミング

WordPress の REST サーバーは、**ルートのコールバックを呼ぶ前に**ステータスラインと
ヘッダを送り終えています。正常系では当然 `200 OK` です。

そのあとでコールバックの中で Fatal error が起きても、`WP_Fatal_Error_Handler` は
もうステータスコードを書き換えられません。HTTP ヘッダは送出済みだからです。
結果、ステータスは 200 のまま、本文の途中に PHP のエラー出力が混ざります。

一方 `admin-ajax.php` は、ヘッダを送る前に落ちます。ハンドラが介入できるので、
正しく 500 と汎用エラー画面が返ります。この差はゲートウェイに依存しません。
nginx + php-fpm と Apache + mod_php の両方で同じ結果でした。

## 何が問題なのか

**1. ステータスコード監視をすり抜ける**

死活監視やアップタイム監視の多くは「200 が返れば正常」と判断します。
REST エンドポイントが壊れていても、監視は永遠に緑のままです。

**2. クライアントは JSON パースで落ちる**

`Content-Type: application/json` を信じたクライアントが HTML を受け取るので、
`JSON.parse` が例外を投げます。フロント側のエラーは「Unexpected token <」に
なり、**サーバー側に原因があることが伝わりません。**

**3. スタックトレースが露出する**

これは Fatal error handler が有効（`WP_DISABLE_FATAL_ERROR_HANDLER=0`）でも
起きます。ハンドラは「エラー画面に差し替える」処理をしますが、ヘッダ送出後は
それもできないため、`display_errors` の出力がそのまま流れます。
ドキュメントルートの絶対パスとプラグイン構成が、外から丸見えになります。

## 対策

- **監視はステータスコードだけで判断しない。**レスポンスが有効な JSON か、
  期待するキーを含むかまで検証する
- 本番では `display_errors = Off` を必ず確認する。ステータスが 200 で返る以上、
  これが最後の防波堤になる
- REST のコールバックは自前で try/catch し、`WP_Error` を返して
  ステータスを明示する

## おまけ: 「ブラウザでは動くのに curl では 401」

同じ検証中に、`/wp-json/wp/v2/users/me` がログイン中でも
**401 `rest_not_logged_in`** を返す場面がありました。

```json
{"code":"rest_not_logged_in","message":"現在ログインしていません。","data":{"status":401}}
```

Cookie 認証の REST リクエストは、`X-WP-Nonce` ヘッダが無いと未ログイン扱いに
なります。ブロックエディタが投げる同じリクエストは nonce 付きなので 200 で通りました。
「ブラウザの管理画面では動くのに curl では 401」の正体はこれです。

## 再現手順

```sh
curl -i http://localhost:8080/wp-json/lab/v1/boom
# → HTTP 200 + スタックトレース

curl -i "http://localhost:8080/wp-admin/admin-ajax.php?action=lab_boom"
# → HTTP 500
```

![REST が 200 のままスタックトレースを返す](../screenshots/g/rest-fatal-http200-stacktrace.jpg)

![同じ Fatal を admin-ajax 経由で踏むと 500](../screenshots/g/ajax-fatal-http500.jpg)
