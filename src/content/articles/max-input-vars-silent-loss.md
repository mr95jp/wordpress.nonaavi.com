---
title: "WordPressでメニュー・設定が保存できない・一部消える時の対処法"
slug: max-input-vars-silent-loss
seo_title: "WordPress 保存できない・一部消える｜原因と対処"
description: "WordPressでメニューやカスタムフィールドが保存できない・保存したのに一部だけ消える時の対処法。原因はmax_input_vars超過で、警告はdebug.logに出ずPHPログにしか出ない。120個送って51個しか届かない実測。"
keywords: "WordPress 保存できない, メニュー 保存できない, 設定 保存できない, 一部 消える, max_input_vars, カスタムフィールド 保存されない, ACF 消える"
category: 障害報告
tags: [wordpress, php, メニュー, カスタムフィールド, max_input_vars]
summary: |
  PHP の max_input_vars を超えた入力が、警告も出さずに捨てられています。
  ・上限 50 で 120 個送ると 51 個しか届かず、WordPress は「保存しました」と表示した
  ・メニュー項目は 1 つで 10 個以上の入力を使うので、60〜80 項目で既定の上限 1000 に達する
  ・警告は debug.log には出ない。サーバーの PHP エラーログに Input variables exceeded と出る
  ・php.ini や .user.ini で max_input_vars を上げる。上げられなければメニューを分割する
status: published
published: 2026-09-16
verified: 2026-09-12
---

メニューを保存したら、後半の項目が消えた。カスタムフィールドが一部だけ保存されない。
**エラーは出ない。「保存しました」と表示される。**

原因は WordPress ではなく PHP の `max_input_vars` です。
上限を超えた分は**警告も出さずに捨てられます。**実測しました。

## 実測: 120 個送って 51 個しか届かない

`max_input_vars = 50` にして、120 個のフィールドを POST しました。
受け取った側で数えた結果です。

```
max_input_vars=50
受け取った要素数=51
最初のキー=field1  最後のキー=field51
```

**field52 以降は存在しません。**エラーにもならず、`$_POST` から消えています。

受け取った側から見ると「そもそも送られてこなかった」のと区別がつきません。
WordPress は届いた 51 件を正常に保存し、**「保存しました」と表示します。**

## 警告はどこに出るか — `debug.log` には出ない

これが厄介な点です。警告は出ているのですが、**探す場所が普段と違います。**

| ログ | 記録 |
|---|---|
| `wp-content/debug.log` | **0 件** |
| サーバーの PHP エラーログ | **1 件** |

記録されていた内容です。

```
PHP Warning:  PHP Request Startup: Input variables exceeded 50.
To increase the limit change max_input_vars in php.ini. in Unknown on line 0
```

`PHP Request Startup` とあるとおり、**WordPress が起動する前**に出る警告です。
そのため `WP_DEBUG_LOG` の仕組みでは拾えません。

**「debug.log を見ても何も出ていない」で調査が止まるのはこれが原因です。**
見るのはサーバーのエラーログ（レンタルサーバーなら管理画面のエラーログ機能）です。
→ [PHP のエラーログの場所](where-are-the-logs.md)

## 項目数と変数の数は一致しない

「メニュー項目は 30 個しかないのに 1000 の上限を超えるのか」と思いますが、
**1 項目が複数の変数を消費します。**

配列形式で送った場合の実測です。`menu-item[N][title]` を 120 個送りました。

```
受け取った要素数=103
```

配列の入れ子は**末端の要素がそれぞれ 1 個として数えられます。**
WordPress のメニュー項目は 1 つあたり
`menu-item-db-id` / `menu-item-object-id` / `menu-item-title` /
`menu-item-url` / `menu-item-target` … と 10 個以上の入力を持ちます。

つまり **メニュー項目 60〜80 個で既定の上限 1000 に達します。**
「50 個を超えたあたりから保存できない」という報告と計算が合います。

同じことがこれらでも起きます。

- カスタムフィールド（ACF の繰り返しフィールド、テーブル状の入力）
- 大量のチェックボックスを持つ設定画面
- 一括編集（投稿一覧でまとめて更新）
- WooCommerce の商品バリエーション

## 確認方法

現在値を確認します。

```sh
php -i | grep max_input_vars
```

管理画面の **ツール > サイトヘルス > 情報 > サーバー** にも表示されます
（→ [サイトヘルスの読み方](site-health-reading.md)）。

疑わしいときは、保存する直前のフォームの入力数を数えます。
ブラウザのコンソールで 1 行です。

```js
document.querySelectorAll('#your-form input, #your-form select, #your-form textarea').length
```

**この数が `max_input_vars` に近ければ確定です。**

## 対処

`php.ini` で上げます。

```ini
max_input_vars = 5000
```

共用サーバーでは `.user.ini` に書ける場合があります（php-fpm 環境）。

```ini
; .user.ini をドキュメントルートに置く
max_input_vars = 5000
```

**`.htaccess` の `php_value max_input_vars` は Apache（mod_php）でのみ有効です。**
php-fpm の環境では無視されます（この点は別記事で実測しています）。

### 上げられない場合

- メニューを分割する（フッター用・グローバル用などで複数のメニューにする）
- 一括編集をやめて小分けに保存する
- 繰り返しフィールドの行数を減らす

## なぜ気づきにくいのか

この障害には、調査を空振りさせる条件が揃っています。

1. **HTTP は 200 で返る** — 監視も、ブラウザの開発者ツールも正常に見える
2. **WordPress は「保存しました」と言う** — 届いた分は正しく保存している
3. **`debug.log` に出ない** — 起動前の警告なので拾えない
4. **毎回同じ場所で切れる** — 「特定の項目だけ保存できないバグ」だと誤診する

**「保存できない」ではなく「保存される量に上限がある」**という視点で見ると
一発で当たります。

## 再現手順

```sh
# php.ini で上限を下げる
# max_input_vars = 50
docker compose restart php apache

# 120 個の項目を POST して、受け取った数を数える
# (受信側で count($_POST) を出力するだけのファイルを置く)
data=""; for i in $(seq 1 120); do data="${data}field${i}=v${i}&"; done
curl -s -X POST "http://localhost:8080/probe.php" --data "${data%&}"
# → 受け取った要素数=51

grep "Input variables exceeded" logs/php/php_error.log      # 1 件
grep "Input variables exceeded" src/wp-content/debug.log    # 0 件
```
