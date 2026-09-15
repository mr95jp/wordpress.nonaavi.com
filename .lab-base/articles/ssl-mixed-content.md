---
title: "SSL化したら画像・CSSが表示されない（混在コンテンツ）の対処法"
slug: ssl-mixed-content
seo_title: "WordPress SSL化 画像・CSS 読み込めない｜混在コンテンツ対処法"
description: "SSL化（https化）したら画像やCSSが読み込めない・鍵マークに警告が出る時の対処法。原因は混在コンテンツ。DB内のhttp://の検出と置換手順、guidを除外する理由、wp-config.phpの定数の落とし穴を実測。"
keywords: "WordPress SSL化 崩れる, https 画像 表示されない, 混在コンテンツ, mixed content, SSL化 CSS 効かない, http https 置換, 鍵マーク 警告"
category: 障害報告
tags: [wordpress, ssl, https, 混在コンテンツ, search-replace, 移行]
status: draft
verified: 2026-09-12
---

SSL 証明書を入れて https でアクセスできるようになった。**でも画像が出ない、
デザインが崩れる、鍵マークに警告が付く。**

原因は**ページは https なのに、中で読んでいるリソースが http のまま**という
状態です。ブラウザがそれをブロックします。これを混在コンテンツと呼びます。

## 最初にやること: どこに http が残っているか数える

修正の前に、**どのテーブルに何件あるか**を把握します。
場所によって対処が変わります。

実測環境で数えた結果です。

| 場所 | 件数 |
|---|---|
| `wp_posts.post_content`（記事本文） | 2 |
| **`wp_posts.guid`** | **42** |
| `wp_options` | 7 |
| `wp_postmeta` | 0 |

```sql
SELECT 'post_content' AS place, COUNT(*) FROM wp_posts WHERE post_content LIKE '%http://%'
UNION ALL SELECT 'guid',        COUNT(*) FROM wp_posts WHERE guid LIKE '%http://%'
UNION ALL SELECT 'options',     COUNT(*) FROM wp_options WHERE option_value LIKE '%http://%'
UNION ALL SELECT 'postmeta',    COUNT(*) FROM wp_postmeta WHERE meta_value LIKE '%http://%';
```

**`guid` が圧倒的に多いのが普通です。**そして `guid` は
**置換してはいけない列**です（後述）。

## 置換は SQL の REPLACE() ではなく WP-CLI で

`wp_options` や `wp_postmeta` には**直列化されたデータ**（PHP の `serialize()`）が
入っています。直列化データは**文字列の長さを内部に持っている**ため、
SQL の `REPLACE()` で文字数が変わると壊れます。

```
a:1:{s:19:"http://example.test";}
     ↑ この 19 が実際の長さと合わなくなると読めなくなる
```

WP-CLI の `search-replace` は直列化を解いて置換し直します。
実測すると、対象が直列化データかどうかが `Type` 列に出ます。

```
$ wp search-replace 'http://example.com' 'https://example.com' --all-tables --dry-run
Table       Column         Replacements  Type
wp_options  option_value   2             PHP     ← 直列化データとして処理
wp_posts    post_content   2             SQL
wp_posts    guid           42            SQL
wp_users    user_url       1             SQL
Success: 47 replacements to be made.
```

**`Type` が `PHP` の行は、SQL の REPLACE() では壊れていた箇所です。**

### guid は除外する

`guid` は投稿を一意に識別するための値で、**RSS リーダーが「同じ記事か」を
判断するのに使います。**変更すると、購読者側で**全記事が新着として再配信**されます。

実測では、除外すると件数が大きく変わりました。

| | 置換件数 |
|---|---|
| そのまま | **47 件** |
| `--skip-columns=guid` | **5 件** |

`guid` は表示には使われないので、http のままで問題ありません。

```sh
wp search-replace 'http://example.com' 'https://example.com' \
  --all-tables --skip-columns=guid --dry-run
```

**必ず `--dry-run` で件数を確認してから実行します。**
そして実行前にデータベースのバックアップを取ります。

## 落とし穴: wp-config.php の定数

データベースを置換しても URL が変わらないことがあります。
**`wp-config.php` に定数があると、データベースの値は無視されます。**

実測です。DB を書き換えても実効値は変わりませんでした。

| | 値 |
|---|---|
| DB の `siteurl` / `home` | `http://127.0.0.1:8080` |
| **実際に使われた値** | **`http://localhost:8080`** |

```php
// これがあると DB より優先される
define( 'WP_HOME', 'http://example.com' );
define( 'WP_SITEURL', 'http://example.com' );
```

**管理画面の「設定 > 一般」で URL 欄がグレーアウトしている場合は、
この定数があります。**`https` に書き換える場所は `wp-config.php` です。

## プロキシ配下では WordPress が https だと気づかない

ロードバランサ・CDN・リバースプロキシが SSL を終端する構成では、
**サーバーには http で届きます。**WordPress は「自分は http で動いている」と
判断し、**https のページなのに http の URL を出力し続けます。**

DB を置換しても直りません。`wp-config.php` に次を入れます。

```php
// wp-settings.php を読み込む行より前に置く
if ( isset( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) && 'https' === $_SERVER['HTTP_X_FORWARDED_PROTO'] ) {
	$_SERVER['HTTPS'] = 'on';
}
```

これを入れずに `.htaccess` で https に強制すると、
**無限リダイレクトになります。**
→ [リダイレクトを繰り返す](redirect-loop.md)

## ブロックされる/されないの違い

すべての http リソースが同じ扱いになるわけではありません。

| リソース | https ページから http で読むと |
|---|---|
| **JS / CSS / iframe** | **ブロックされる**（動かない・デザインが崩れる） |
| 画像 / 音声 / 動画 | ブラウザが自動で https に変えて試す（失敗すれば表示されない） |
| リンク（`<a href>`) | ブロックされない（警告も出ない） |

**JS と CSS が最も影響が大きい**ので、「SSL 化したら崩れた」は
まずこの 2 つを確認します。

コンソールに出るメッセージはこの形です。

```
Mixed Content: The page at 'https://example.com/' was loaded over HTTPS,
but requested an insecure stylesheet 'http://example.com/style.css'.
This request has been blocked.
```

## 検出方法

**このラボでは HTTPS のリスナーを用意していないため、
ブラウザがブロックする様子そのものは再現できていません。**
検出と置換の部分だけが実測値です。ここは分けて書いておきます。

実際のサイトでの確認方法は 3 つです。

**1. ブラウザのコンソール**

`Mixed Content` で検索します。ブロックされたリソースの URL が出ます。

**2. ページの HTML を直接見る**

```sh
curl -s https://example.com/ | grep -oE 'http://[^"'"'"' ]*' | sort -u | head -20
```

**自ドメインの http:// が出てきたら要修正**です。
外部サービスの http:// は、そのサービスが https に対応しているか確認します。

**3. アセットをまとめて確認する**

このラボの `bin/diagnose.sh` は、https のページを対象にしたとき
**http で読んでいるリソースを数えます。**

```
  アセット 12 件: 200=12
  !! 混在コンテンツ 3 件(https のページから http のリソースを読んでいる)
       http://example.com/wp-content/themes/xxx/style.css
```

## 置換しても残るもの

データベースの置換で直らない場所があります。

| 場所 | 対処 |
|---|---|
| **テーマ・プラグインのコードに直書きされた URL** | ファイルを検索して修正（`grep -r "http://" wp-content/themes/`) |
| ウィジェット内の HTML | 直列化データなので `search-replace` で対応できる |
| **外部サービスの埋め込み**（古い広告タグ、地図、SNS） | 提供元の https 版に差し替える |
| CDN の設定 | CDN 側のオリジン URL を https に |
| キャッシュ | **置換後にキャッシュを全消去する**（古い HTML が残る） |

**置換したのに直らない場合、まずキャッシュを疑います。**
CDN・キャッシュプラグイン・ブラウザの 3 層すべてです。

## 作業の順番

1. **バックアップを取る**（DB とファイル）
2. `wp-config.php` の定数を確認する（あれば https に書き換える）
3. プロキシ配下なら `X-Forwarded-Proto` の対応を入れる
4. `--dry-run` で件数を確認する（`--skip-columns=guid`）
5. 置換を実行する
6. **キャッシュを全消去する**
7. コンソールとアセットを確認して、残りを個別に直す
8. 最後に http → https のリダイレクトを 1 箇所だけ設定する

**8 を先にやるとループする**ので最後です。

## 再現手順（検出・置換の部分）

```sh
# どこに何件あるか
mysql -e "SELECT COUNT(*) FROM wp_posts WHERE post_content LIKE '%http://%';"

# 置換件数の確認(直列化データは Type=PHP と表示される)
wp search-replace 'http://localhost:8080' 'https://localhost:8080' \
  --all-tables --dry-run --report-changed-only
# → 47 件

wp search-replace 'http://localhost:8080' 'https://localhost:8080' \
  --all-tables --dry-run --report-changed-only --skip-columns=guid
# → 5 件
```
