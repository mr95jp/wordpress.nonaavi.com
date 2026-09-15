---
title: "WordPressの管理画面だけ表示が崩れる時の直し方"
slug: admin-styles-broken
seo_title: "WordPress 管理画面 表示が崩れる・レイアウト崩れの対処法"
description: "WordPressの管理画面だけレイアウトが崩れる・CSSが効かない時の対処法。load-styles.php / load-scripts.php が通っているかを確認するだけで原因が絞れる。セキュリティ設定やキャッシュが原因のケースを実測。"
keywords: "WordPress 管理画面 崩れる, 管理画面 レイアウト崩れ, 管理画面 CSS 効かない, ダッシュボード 崩れる, load-styles.php"
category: 障害報告
tags: [wordpress, 管理画面, css, load-styles, キャッシュ]
status: draft
verified: 2026-09-12
---

サイトの表示は正常なのに、管理画面だけレイアウトが崩れている。
メニューが縦に並ばない、アイコンが文字（`dashicons` の文字化け）になる、
ボタンがリンクのように見える。

**Fatal error で真っ白になるのとは別の症状**です。画面は出ているので、
壊れているのは CSS と JS の読み込みだけです。

## 管理画面の CSS/JS はまとめて配信されている

WordPress の管理画面は、多数の CSS / JS を**1 つのリクエストに結合**して配信します。

| 配信口 | 中身 | 実測サイズ |
|---|---|---|
| `/wp-admin/load-styles.php` | 管理画面の CSS を結合 | **142,760 bytes** |
| `/wp-admin/load-scripts.php` | 管理画面の JS を結合 | **101,132 bytes** |

**この 2 つが通らないと、管理画面の見た目は全部崩れます。**
逆に言えば、**確認するのはこの 2 つだけ**です。

そして重要な点として、**ログインしていなくても取得できます。**

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://example.com/wp-admin/load-styles.php?load%5B%5D=dashicons,admin-bar,common"
```

**管理画面に入れない状態でも、外から生死を確認できます。**

`load-styles.php` を塞いだ状態のログイン画面です。

![CSS が読めていない管理画面](../screenshots/c/admin-styles-stripped.jpg)

*HTML は正常。当たっていないのは CSS だけなので、要素はすべて縦に並ぶ*

## 原因 1: 結合の仕組みが壊れている

`load-styles.php` は、クエリパラメータで指定されたハンドル名を読んで
ファイルを連結して返す PHP です。**PHP として動く必要があります。**

- `wp-admin` 配下を制限する設定を入れると 403 になる
- WAF が長いクエリ文字列（ハンドル名が数十個並ぶ）を攻撃と誤検知して弾く
- `mod_security` のルールで `load%5B%5D=` のような配列パラメータが拒否される

**200 以外が返っていたら、サーバー設定かセキュリティ機器が原因**です。

結合をやめれば回避できます。個別のファイルとして読み込まれるようになるので、
1 リクエストが 50 リクエストほどに増えますが、表示は直ります。

```php
// wp-config.php
define( 'CONCATENATE_SCRIPTS', false );
```

**これで直るなら、原因は結合の仕組みだと確定します。**切り分けにも使えます。

## 原因 2: 一部のファイルだけ欠けている

コアの更新が途中で止まると、`wp-admin/css/` の一部が無い状態になります。
結合された CSS の中で**欠けたファイルの分だけが抜ける**ため、
「一部だけ崩れる」という中途半端な症状になります。

この場合は**コアの再インストール**が最短です。

```sh
wp core download --force
```

データベースと `wp-content` には触らずにコアファイルだけ入れ替えます。
`wp core verify-checksums` で欠損を確認できます
（→ [改ざんチェックの記事](verify-checksums-blind-spots.md)）。

## 原因 3: キャッシュ・最適化プラグイン

管理画面まで最適化の対象にしているプラグインがあります。

- 管理画面の CSS/JS を結合・圧縮して壊す
- ログイン中のページをキャッシュしてしまう

**多くのプラグインには「管理画面は対象外にする」設定があります。**
まずそれを確認し、無ければそのプラグインを一時的に止めて切り分けます。

## 原因 4: プラグインが管理画面の CSS を上書きしている

設定画面を持つプラグインが、**管理画面全体に効く CSS** を出していることがあります。

```php
// 悪い例: 自分の設定画面以外にも効いてしまう
add_action( 'admin_enqueue_scripts', function () {
	wp_enqueue_style( 'my-admin', $url );
} );
```

本来は自分の画面だけに限定すべきものです。

```php
add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( 'settings_page_my-plugin' !== $hook ) {
		return;
	}
	wp_enqueue_style( 'my-admin', $url );
} );
```

**特定のプラグインを入れてから崩れた**なら、これを疑います。
ブラウザの開発者ツールで崩れている要素を選び、
**どのファイルのスタイルが当たっているか**を見れば犯人が分かります。

## 原因 5: 混在コンテンツ（SSL 化の直後）

https のページから http のアセットを読もうとすると、ブラウザがブロックします。
管理画面も同じです。

コンソールに `Mixed Content: ... was blocked` が出ていればこれです。
→ [SSL 化したら画像・CSS が読み込めない](ssl-mixed-content.md)

## 切り分けの順番

```sh
# 1. 結合された CSS/JS が通るか(ログイン不要)
curl -s -o /dev/null -w 'styles  %{http_code}\n' \
  "https://example.com/wp-admin/load-styles.php?load%5B%5D=dashicons,common"
curl -s -o /dev/null -w 'scripts %{http_code}\n' \
  "https://example.com/wp-admin/load-scripts.php?load%5B%5D=jquery-core"
```

| 結果 | 次に見るもの |
|---|---|
| 403 | サーバー設定、セキュリティプラグイン、WAF |
| 404 | コアファイルの欠損（`wp core verify-checksums`） |
| 500 | PHP のエラー。`debug.log` を見る |
| **200** | 読み込みは成功している。キャッシュ・プラグインの CSS・混在コンテンツ |

200 だった場合は、`CONCATENATE_SCRIPTS` を `false` にして変化を見ます。
**直れば結合の仕組み、変わらなければ個別の CSS の問題**です。

## フロントは正常なのに管理画面だけ、の意味

管理画面でだけ読み込まれるものが原因、という切り分けになります。

| 崩れている範囲 | 疑うもの |
|---|---|
| 管理画面のすべて | `load-styles.php` / `load-scripts.php` |
| 特定のプラグインの設定画面だけ | そのプラグインの CSS |
| 投稿編集画面だけ | ブロックエディターのアセット → [ブロックエディターが真っ白](block-editor-blank.md) |
| フロントも崩れている | テーマ側。→ [CSS が効かない](css-js-not-loading.md) |

**表示が崩れているだけで Fatal ではない**場合、WordPress は動いているので
WP-CLI もプラグインの操作も普通に使えます。慌てて全部止める必要はありません。
