---
title: "WordPressのRSS・サイトマップだけ壊れる時の対処法（サイトは正常）"
slug: feed-sitemap-broken
seo_title: "WordPress RSS 表示されない・サイトマップ エラー｜XML が壊れる原因"
description: "サイトは正常なのにRSS（/feed/）やサイトマップだけ壊れる・エラーになる時の対処法。functions.php末尾の空白1つでXMLが壊れる、サイトマップ404はblog_public=0が原因、などを実測で解説。"
keywords: "WordPress RSS 表示されない, feed 壊れる, サイトマップ エラー, wp-sitemap.xml 404, サイトマップ 読み取れませんでした, RSS フィード エラー, XML パースエラー"
category: 障害報告
tags: [wordpress, rss, サイトマップ, xml, seo]
status: draft
verified: 2026-09-12
---

Search Console が「サイトマップを読み取れませんでした」と言っている。
RSS リーダーでフィードが表示されない。**でもサイトは普通に表示されている。**

原因はサイトの表示とは別の層にあります。実測すると、
**HTML なら無害な 1 バイトが XML を完全に壊していました。**

## 実測: フィードだけが壊れる

テーマの `functions.php` の末尾に、`?>` のあとの空白を 1 つ足した状態です。

| URL | 結果 | 先頭のバイト |
|---|---|---|
| トップページ | **200 / 正常に表示** | ` <!doctype html>…` |
| `/feed/` | **200 だが壊れている** | ` <br /><b>Warning</b>: Cannot modify header…` |

XML としてパースを試すと失敗します。

```
パース失敗: junk after document element: line 3, column 0
```

同じ状態で `/feed/` をブラウザで開くと、先頭に Warning が出ています。

![Warning: Cannot modify header information - headers already sent by](../screenshots/c/feed-headers-already-sent.jpg)

**サイト表示は無事です。**HTML パーサーは先頭の空白や余計な出力を無視するので、
ブラウザで見る限り何も起きていません。

一方 XML は **`<?xml` 宣言がファイルの先頭（0 バイト目）から始まること**を
要求します。前に空白 1 つでもあれば、その時点で不正な文書になります。

## 気づくのが遅れる理由

この障害は**人間の目に触れない場所だけが壊れます。**

- サイトを見に来た人は気づかない
- 管理画面も正常
- 死活監視も 200 で正常
- 気づくのは Search Console の警告、RSS 購読者の減少、
  外部連携の停止（IFTTT、Slack 通知、まとめサイトへの配信など）

**発見までに数週間かかることがあります。**

## 原因の場所は 1 行で分かる

`debug.log` にファイル名と行番号が出ています。

```
Warning: Cannot modify header information - headers already sent by
(output started at /var/www/html/wp-content/themes/xxx/functions.php:142)
in /var/www/html/wp-includes/pluggable.php on line ...
```

**`output started at` の後ろが原因です。**`pluggable.php` の行番号ではありません。

同じ原因は他の症状も同時に引き起こします。

- `Set-Cookie` が出なくなって**ログインできない**
- リダイレクトが効かなくなる

フィードだけが壊れていて他は無事なら、出力が混ざっているのは
**フィードの生成時だけ実行されるコード**（`is_feed()` の中など）です。

## 予防

`functions.php` の末尾に **`?>` を書かない**。PHP は閉じタグを省略できます。
省略しておけば、後ろに空白が入る余地がありません。

これは WordPress のコーディング規約でも推奨されています。

## もう 1 つの原因: サイトマップが 404

「壊れている」のではなく「そもそも無い」場合もあります。実測しました。

| `blog_public` | `/wp-sitemap.xml` | トップの `meta robots` |
|---|---|---|
| **0** | **404** | `noindex, nofollow` |
| 1 | **200** | `max-image-preview:large` |

`blog_public = 0` は、管理画面の
**設定 > 表示設定 > 「検索エンジンがサイトをインデックスしないようにする」**
のチェックボックスです。

これが入っていると WordPress は**サイトマップ機能そのものを無効にします。**
404 が返るのは仕様です。

**開発中にチェックを入れて、公開時に外し忘れる**のが定番の経路です。
「サイトマップが 404」「検索結果に出ない」が同時に起きていたら、
まずここを見ます。`noindex` が出ているかは 1 行で確認できます。

```sh
curl -s https://example.com/ | grep -o "<meta name='robots'[^>]*"
```

## nginx の設定で 404 になることもある

サーバー側の設定で、WordPress に到達できていないケースもあります。
実測で見つけた例です。

| URL | nginx | Apache |
|---|---|---|
| `/robots.txt` | **404** | **200** |

原因は nginx の設定です。

```nginx
location = /robots.txt { log_not_found off; access_log off; }
```

このブロックには `try_files` も `fastcgi_pass` もありません。
**静的ファイルを探して、無ければ 404。**WordPress が動的に生成する
仮想ファイルには到達しません。

よく配られる設定例にそのまま入っている書き方です。1 行足せば直ります。

```nginx
location = /robots.txt { try_files $uri /index.php?$args; access_log off; log_not_found off; }
```

**WordPress が生成するはずのファイルが 404 のときは、
サーバー設定で個別に `location` が切られていないか**を見ます。

## 切り分けの順番

```sh
# 1. 中身の先頭を見る(空白や警告が混ざっていないか)
curl -s https://example.com/feed/ | head -c 80 | cat -A | head -3

# 2. XML として読めるか
curl -s https://example.com/feed/ -o /tmp/f.xml
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/tmp/f.xml'); print('OK')"

# 3. サイトマップが 404 なら noindex 設定を疑う
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/wp-sitemap.xml
curl -s https://example.com/ | grep -o "<meta name='robots'[^>]*"
```

| 観測 | 原因 |
|---|---|
| 先頭に空白や `<br />` `Warning` がある | 余計な出力（`functions.php` の末尾など） |
| サイトマップが 404 で `noindex` が出ている | `blog_public = 0`（表示設定のチェック） |
| サイトマップが 404 だが `noindex` は無い | サーバー設定か、パーマリンクの問題 |
| XML は正常なのに Search Console が読めない | URL の到達性、`robots.txt` での遮断 |

## 再現手順

```sh
cp src/wp-content/themes/<theme>/functions.php /tmp/fn.bak
printf '?>\n \n' >> src/wp-content/themes/<theme>/functions.php

curl -s http://localhost:8080/       | head -c 40   # 正常に見える
curl -s http://localhost:8080/feed/  | head -c 40   # 先頭に空白と Warning

cp /tmp/fn.bak src/wp-content/themes/<theme>/functions.php

# サイトマップ側
wp option update blog_public 0
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/wp-sitemap.xml   # 404
wp option update blog_public 1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/wp-sitemap.xml   # 200
```
