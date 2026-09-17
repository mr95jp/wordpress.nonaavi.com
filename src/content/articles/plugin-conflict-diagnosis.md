---
title: "WordPressでプラグイン更新後に真っ白・不具合が出た時の対処法"
slug: plugin-conflict-diagnosis
seo_title: "WordPress プラグイン 競合・更新後 真っ白｜切り分け方"
description: "プラグインを更新したら真っ白・不具合が出た時の対処法。「有効化したら壊れた」はほぼ起きず、実際は更新時に衝突が生まれることを実測。meta重複やjQuery二重読み込みなど黙って壊れる競合の見分け方も。"
keywords: "WordPress プラグイン 競合, プラグイン 更新 真っ白, 更新したら 壊れた, プラグイン 不具合 切り分け, Cannot redeclare"
category: 障害報告
tags: [wordpress, プラグイン, 競合, wp-cli, jquery, デバッグ]
summary: |
  ・プラグインを更新したら真っ白 → まず debug.log を見る。Cannot redeclare なら、競合している 2 つのファイルが名指しされる
  ・管理画面に入れない → FTP でプラグインのフォルダ名を変えて止め、管理画面に一度入る
  ・エラーは出ないのに表示や動きがおかしい → 黙って壊れる競合（meta の重複、jQuery の二重読み込み、フックの後勝ち）。全部止めて 1 つずつ戻す
  「有効化したら壊れた」はほぼ起きません。WordPress が有効化の前に検査して止めるので、落ちるのは更新のときです。
status: published
published: 2026-09-15
verified: 2026-09-12
---

プラグインを更新したらサイトが真っ白になった。1 つずつ止めれば原因は分かる、
とよく書かれていますが、**そもそも競合には「落ちる」と「黙って壊れる」の
2 種類があり**、後者は 1 つずつ止めても気づけません。

Web 上で実際に報告されている競合の型を調べ、代表的な機構をローカル環境で
再現して計測しました。

## 実際に報告されている競合の型

調べた範囲で繰り返し挙がっていたのは、次のようなものです。

| 型 | 機構 | 症状 |
|---|---|---|
| 関数名の衝突 | 接頭辞を付けない関数を 2 つのプラグインが定義する | `Cannot redeclare` で Fatal |
| SEO プラグインの二重導入 | どちらも `wp_head` に meta を出す | meta description や canonical が 2 つ出る |
| jQuery の二重読み込み | `wp_enqueue_script` を通さず生の `script` タグで読む | `$ is not a function`、スライダーやモーダルが動かない |
| キャッシュ + ページビルダー | 静的 HTML が返るため編集画面の JS が動かない | 編集画面が開かない |
| キャッシュ + フォーム | nonce がキャッシュに焼き込まれて期限切れになる | 送信が黙って失敗する |
| セキュリティプラグインの二重導入 | 双方が `.htaccess` を書き換える | 403、ログイン不能、極端な遅延 |

このうち **関数名の衝突・meta の二重出力・jQuery の二重読み込み・同じフックの
取り合い** を、2 つの検証用プラグインで再現しました。どちらも単体では正常に動き、
**組み合わせたときだけ壊れます。**

## 計測 1: 単体では何も起きない

同じフックを使う 2 つのプラグインを用意し、有効化の組み合わせを変えました。

| 有効なプラグイン | HTTP | `meta description` | `jquery.min.js` |
|---|---|---|---|
| Alpha だけ | 200 | 1 個 | 1 個 |
| Beta だけ | 200 | 1 個 | 1 個 |
| **両方** | **200** | **2 個** | **2 個** |

**ステータスは 200 のまま、エラーも出ません。**しかし meta description が 2 つ出て、
jQuery が 2 回読み込まれています。

これが「黙って壊れる」側です。サイトは表示されるので誰も気づきません。
気づくのは Search Console の重複警告や、「スライダーが動かない」という
問い合わせが来たときです。

### jQuery の二重読み込みが厄介な理由

Alpha は作法どおり `wp_enqueue_script` に `jquery` を依存として指定しています。
Beta は `wp_footer` で生の `<script>` タグを出しています。

```php
// Beta 側(悪い例)
add_action( 'wp_footer', function () {
	printf( '<script src="%s"></script>', includes_url( 'js/jquery/jquery.min.js' ) );
} );
```

**WordPress からは Beta の読み込みが見えません。**依存関係の解決も、
キャッシュプラグインの結合・最小化の対象からも外れます。あとから読み込まれた
jQuery が `window.jQuery` を上書きするため、**先に初期化を終えていた
プラグインの状態が消えます。**

`wp_enqueue_script` を通していれば、WordPress は同じハンドルを 2 回読みません。
**生のタグで書いた瞬間に、この保護が無効になります。**

## 計測 2: 同じフックは後勝ちで、負けた側は消える

`excerpt_more` フィルタを両方が書き換える状態で、返り値を見ました。

| 状態 | 結果 |
|---|---|
| Alpha だけ（優先度 10） | テーマの指定が残る |
| Alpha + Beta（Beta は優先度 20） | **`[beta]` だけ** |

Alpha が設定した値は跡形もなく消えます。**エラーも警告も出ません。**

「設定したのに反映されない」という問い合わせの多くはこれです。
プラグインの設定画面を見ても正しく保存されているので、設定側を疑うと迷います。

原因を特定するには、そのフックに何が登録されているかを直接見ます。

```php
// wp-config.php や mu-plugin で
add_action( 'shutdown', function () {
	global $wp_filter;
	error_log( print_r( array_keys( $wp_filter['excerpt_more']->callbacks ), true ) );
} );
```

対処は、後から上書きしている側を外すことです。

```php
remove_filter( 'excerpt_more', 'beta_excerpt_more', 20 );
```

無名関数で登録されていると `remove_filter` では外せません。
その場合は優先度をさらに後ろにして自分の値を最後に適用します。

## 計測 3: Fatal になる競合 — ログが両方のファイルを名指しする

接頭辞を付けていない関数 `get_post_views()` を両方が定義する状態にしました。

```
Fatal error: Cannot redeclare get_post_views()
(previously declared in /var/www/html/wp-content/plugins/lab-conflict-alpha/lab-conflict-alpha.php:26)
in /var/www/html/wp-content/plugins/lab-conflict-beta/lab-conflict-beta.php on line 21
```

**先に定義した側と、あとから定義した側の両方が名指しされます。**
競合しているプラグインの組み合わせが 1 行で確定するので、
「1 つずつ止めて再現を探す」作業は本来不要です。

`display_errors` の設定で見え方が変わります。

| `display_errors` | HTTP | 本文 |
|---|---|---|
| ON | **200** | 272 bytes（Fatal のメッセージだけ） |
| OFF | **500** | 「このサイトで重大なエラーが発生しました。」 |

`display_errors` が有効だと、サイトが完全に死んでいるのに **200 が返ります**
（[監視が 200 を受け取ってしまう仕組み](http-200-when-site-is-down.md)）。
Fatal のメッセージが本文として先に出力されて、その時点でヘッダが確定するためです。

また、この Fatal では **リカバリーモードによるプラグインの自動停止は
働きませんでした**（`_paused_extensions` オプションが作られない）。
自動復旧を期待しないほうが安全です。

## 「有効化したら壊れた」はまず起きない

ここが実務上いちばん重要な点でした。

Alpha が有効な状態で Beta を有効化しようとすると、**WordPress が有効化を
拒否します。**

```
$ wp plugin activate lab-conflict-beta
Fatal error: Cannot redeclare get_post_views() ...

$ wp plugin list
lab-conflict-beta   inactive     ← 有効化されていない
```

WordPress はプラグインを有効化する前に、そのファイルを別リクエストで
読み込んでみる検査（sandbox scrape）を行います。Fatal になるなら有効化を
中止するので、**サイトは落ちません。**

つまり **「プラグインを有効化したら壊れた」は起きにくく、
実際に落ちるのは「両方が有効なまま、更新で衝突が生まれたとき」**です。

なお、プラグインの更新は**既定では自動になりません**（1 つずつ有効にする必要があります）。
→ [自動更新は既定でほとんど動かない](auto-update-not-working.md)
更新は既に有効なプラグインのファイルを差し替えるだけなので、この検査を通りません。

Web 上の事例が「更新したら真っ白になった」に偏っているのは、これが理由です。

## 切り分け手順

### 1. まず debug.log を見る（1 つずつ止める前に）

Fatal 系なら、競合しているファイルの組み合わせがログに出ています。
`WP_DEBUG_LOG` を有効にしておくことが前提です。

### 2. WP-CLI は落ちるので `--skip-plugins` を使う

プラグインが Fatal を起こしていると、WP-CLI も同じ Fatal で止まります。

```
$ wp plugin list
Fatal error: Cannot redeclare get_post_views() ...
Error: このサイトで重大なエラーが発生しました。
```

`--skip-plugins` を付けるとプラグインを読み込まずに起動するので、
そこから操作できます（実測で動作を確認しました）。

```sh
wp --skip-plugins plugin list
wp --skip-plugins plugin deactivate <slug>
wp --skip-plugins plugin deactivate --all
```

### 3. 全停止 → 1 つずつ戻す

黙って壊れる側（meta の重複、jQuery、フックの取り合い）は、ログに何も出ないので
この方法しかありません。**ただし「壊れている」の判定基準を先に決めておきます。**
HTTP 200 は判定に使えません。

- meta タグの数を数える: `curl -s <URL> | grep -c 'name="description"'`
- 読み込まれた jQuery の数を数える
- ブラウザのコンソールを見る（`$ is not a function` など）

CSS や JS がそもそも読み込めていない（404 や 403）場合は、競合ではありません。
→ [CSS が効かない・JS が動かない](css-js-not-loading.md)

### 4. 本番でやるなら Health Check & Troubleshooting

管理者だけプラグインを無効化した状態で閲覧できるので、
訪問者に影響を出さずに 1 つずつ戻せます。

## WP-CLI が無い環境では

共用レンタルサーバーには WP-CLI がありません。FTP でプラグインのフォルダを
リネームし、管理画面に一度入ると WordPress が無効化を確定させます（実測）。
手順は [WP-CLI が無い環境での復旧](recovery-without-wp-cli.md)。

## 開発側の対策

計測した 4 つの競合は、すべて書き方で防げるものでした。

| 競合 | 対策 |
|---|---|
| `Cannot redeclare` | 関数・クラス・定数に必ず接頭辞を付ける。名前空間を使う |
| jQuery の二重読み込み | 生の `script` タグを書かない。`wp_enqueue_script` で `jquery` を依存に指定する |
| `wp_head` の二重出力 | 同種の機能が既にあるか判定する。`has_action()` や既存プラグインの定数を見る |
| フックの後勝ち | 優先度を既定の 10 から動かさない。無名関数で登録しない（外せなくなる） |

特に **無名関数でフックに登録しない**のは効きます。名前付き関数にしておけば、
競合したときに相手側から `remove_filter` で外してもらえます。

## 再現手順

```sh
# 検証用の 2 プラグイン。単体では正常に動く
wp plugin activate lab-conflict-alpha
wp plugin activate lab-conflict-beta

# 黙って壊れる側を数える
curl -s "http://localhost:8080/" | grep -c 'name="description"'      # 2
curl -s "http://localhost:8080/" | grep -oc 'jquery/jquery.min.js'   # 2
wp eval 'echo apply_filters("excerpt_more", "(既定)");'              # [beta]

# Fatal になる競合を踏む
touch src/wp-content/lab-conflict-redeclare
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/
grep "Cannot redeclare" src/wp-content/debug.log

# 復旧
wp --skip-plugins plugin deactivate lab-conflict-beta
rm src/wp-content/lab-conflict-redeclare
```

## 参考にした情報源

- [10 Common WordPress Plugin Conflicts and How to Fix Them — ZenCore Digital](https://zencoredigital.com/blog/wordpress-plugin-conflicts/)
- [WordPress Plugin Conflicts: How to Find and Fix Them Fast — Peligent](https://peligent.com/blog/wordpress-plugin-conflicts/)
- [How to Fix the WordPress Fatal Error: Cannot Redeclare — WPDean](https://wpdean.com/wordpress-fatal-error-cannot-redeclare/)
- [WordPressが真っ白になる原因と対処法 — WP復旧本舗](https://www.wp-axis.jp/blog/wordpress-white-screen/)
- [WordPress プラグインが競合？その原因と解決法 — AQlier](https://aqlier.com/2025/08/17/wordpress_plugin_kyogo/)
