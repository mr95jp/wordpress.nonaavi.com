---
title: "WordPressで絵文字が保存できない・時刻がずれる時の対処法（移行後）"
slug: emoji-and-timezone
seo_title: "WordPress 絵文字 消える・投稿時間 ずれる｜移行後の対処法"
description: "サーバー移行後に絵文字が保存できない・投稿時刻が9時間ずれる時の対処法。utf8テーブルは日本語は通るが絵文字でエラー1366、date()とcurrent_time()でタイムゾーンが違うことを実測。文字化けの原因も。"
keywords: "WordPress 絵文字 消える, 絵文字 保存できない, 文字化け 移行, 投稿時間 ずれる, 予約投稿 時間 ずれる, utf8mb4, タイムゾーン 9時間"
category: 障害報告
tags: [wordpress, mysql, utf8mb4, 絵文字, タイムゾーン, 移行]
summary: |
  どちらも原因はデータベースと PHP の設定で、プラグインを止めても直りません。
  ・絵文字以降が消える・保存できない → テーブルが utf8（3 バイトまで）。日本語は通るので気づきにくい。バックアップを取ってから utf8mb4 に変換する
  ・時刻が 9 時間ずれる → PHP の date.timezone と WordPress のタイムゾーンが違う。設定 > 一般で「東京」を選び、php.ini も Asia/Tokyo に揃える
  ・自作のコードでは date() ではなく current_time() か wp_date() を使う
status: published
published: 2026-09-16
verified: 2026-09-12
---

サーバーを移行したあとに出る症状のうち、**原因がデータベースと PHP の設定にある
2 つ**を実測しました。どちらも「WordPress の不具合」ではないので、
プラグインを止めても直りません。

## 絵文字だけが保存できない

記事に絵文字を入れて保存すると、**絵文字以降の文章が消える**、
あるいは保存自体が失敗する。日本語は問題なく保存できる。

### 実測

3 バイトまでしか扱えない `utf8` のテーブルに、日本語と絵文字を入れました。

```sql
CREATE TABLE test (body TEXT) DEFAULT CHARSET=utf8;

INSERT INTO test VALUES ('日本語は通る');
→ 成功

INSERT INTO test VALUES ('絵文字 🍣 入り');
→ ERROR 1366 (HY000): Incorrect string value: '\xF0\x9F\x8D\xA3 \xE5...'
```

**日本語は通ります。**通らないのは 4 バイト文字だけです。

MySQL の `utf8` は**3 バイトまでしか格納できない独自仕様**で、
本来の UTF-8（最大 4 バイト）ではありません。絵文字は 4 バイトなので入りません。
4 バイト必要な文字は絵文字だけではなく、`𠮟`（しかる）のような
一部の漢字も該当します。

**「日本語が表示できているから文字コードは大丈夫」という判断が間違いになります。**

正しい設定は `utf8mb4` です。実測環境の値です。

```
db_charset     utf8mb4
wp_posts       utf8mb4_unicode_520_ci
wp_options     utf8mb4_unicode_520_ci
```

### 確認方法

```sql
SELECT @@character_set_database, @@collation_database;

SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'データベース名';
```

`utf8mb4` 以外が混ざっていたら、そのテーブルに 4 バイト文字は入りません。
`wp-config.php` の設定も見ます。

```php
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
```

**`DB_CHARSET` が `utf8` になっているとこの問題が出ます。**
古い記事や古いインストール手順をコピーすると、ここが `utf8` のままになります。

### 直すときの注意

`wp-config.php` を `utf8mb4` に書き換えるだけでは不十分です。
**既存テーブルの文字セットは変わりません。**変換が必要です。

```sh
wp db query "ALTER TABLE wp_posts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

**必ずバックアップを取ってから実行します。**
インデックスの長さ制限（767 バイト問題）に当たることがあるためです。

### 照合順序の不一致も見ておく

実測環境では、データベース既定が `utf8mb4_unicode_ci`、
テーブルが `utf8mb4_unicode_520_ci` でした。**同じ `utf8mb4` でも照合順序が違います。**

移行元と移行先で MySQL のバージョンが違うと、こうしたズレが生まれます。
テーブルを JOIN するクエリで
`Illegal mix of collations` というエラーが出るのがその症状です。
プラグインが独自テーブルを作っている場合に起きやすいです。

## 時刻が 9 時間ずれる

予約投稿が違う時間に公開される。投稿日時が未来になっている。
プラグインのログの時刻が合わない。

### 実測: 同じサイト内に 2 つの時刻がある

同じ WordPress に対して、時刻の取り方を変えて出力しました。

| 取り方 | 値 |
|---|---|
| `date()`（PHP の関数） | **2026-09-12 07:16:43** |
| `current_time('mysql')`（WordPress の関数） | **2026-09-12 16:16:43** |

**9 時間ずれています。**設定はこうなっていました。

| 項目 | 値 |
|---|---|
| WordPress の `timezone_string` | Asia/Tokyo |
| WordPress の `gmt_offset` | 9 |
| **Web サーバーの `date.timezone`** | **Asia/Tokyo** |
| **コマンドライン（別環境）の `date.timezone`** | **UTC** |

`date()` は**PHP（サーバー）のタイムゾーン**を使います。
`current_time()` は**WordPress の設定**を使います。
この 2 つが一致していない環境では、**どちらの関数で書かれているかによって
時刻が変わります。**

コマンドラインと Web で PHP の設定値が違うことは、サイトヘルスの判定もずらします。
→ [サイトヘルスの「重大な問題」の読み方](site-health-reading.md)

### 実際に踏んだ例

この検証中、予約投稿を作ろうとして失敗しました。

```sh
wp post create --post_status=future --post_date="$(date -d '+60 seconds')"
→ status=publish   # 即座に公開されてしまった
```

コマンドライン側が UTC だったため、**サイトの時刻（JST）から見ると
9 時間前の日時**になり、「過去の予約」として即公開されたのです。

**移行スクリプトやインポートツールが同じ間違いをすると、
予約投稿が全部公開されるか、全部 9 時間ずれます。**
時刻は合っているのに公開されない場合は、別の原因です。
→ [予約投稿されない](scheduled-post-missed.md)

### 確認方法

```sh
wp eval '
echo "PHP:           ", date( "Y-m-d H:i:s" ), "\n";
echo "WordPress:     ", current_time( "mysql" ), "\n";
echo "date.timezone: ", ini_get( "date.timezone" ) ?: "(未設定=UTC)", "\n";
echo "timezone_string: ", get_option( "timezone_string" ), "\n";'
```

**2 つの時刻が違っていたら、それが原因です。**

### 対処

1. **WordPress の設定を正しくする** — 設定 > 一般 > タイムゾーンで
   「東京」を選ぶ（`UTC+9` ではなく地域名を選ぶ。夏時間の扱いが変わるため）
2. **サーバーの `date.timezone` を合わせる** — `php.ini` に
   `date.timezone = Asia/Tokyo`
3. **コードでは `current_time()` / `wp_date()` を使う** — `date()` を使わない

3 が本質的な対策です。サーバーのタイムゾーンに依存しないコードにしておけば、
移行先の設定が違っても壊れません。

### 投稿日時が保存される仕組み

WordPress は 2 つの列に保存します。

| 列 | 内容 |
|---|---|
| `post_date` | サイトのタイムゾーンでの時刻 |
| `post_date_gmt` | UTC での時刻 |

**判定に使われるのは `post_date_gmt` です。**
移行時に片方だけ書き換えると、表示は正しいのに公開判定がずれる、
という状態になります。SQL で日時を直接触るときは**必ず両方**を更新します。

## 再現手順

```sh
# 絵文字
mysql -e "CREATE TABLE t (body TEXT) DEFAULT CHARSET=utf8;
          INSERT INTO t VALUES ('日本語は通る');
          INSERT INTO t VALUES ('絵文字 🍣 入り');"
# → 2 つ目が ERROR 1366

# タイムゾーン
wp eval 'echo date("H:i"), " vs ", current_time("H:i"), "\n";'
```
