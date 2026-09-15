---
title: "WordPressが重い・遅い時の対処法 — 原因を数値で確かめる"
slug: site-is-slow
seo_title: "WordPress 重い・表示が遅い・管理画面 遅い｜原因と対処法"
description: "WordPressが重い・表示速度が遅い・管理画面だけ遅い時の対処法。autoloadの肥大は42KBで0.7ms→12MBで15ms、外部通信は遮断されると5秒待ちになることを実測。原因を数値で確かめてから対策する。"
keywords: "WordPress 重い, WordPress 遅い, 表示速度 遅い, 管理画面 遅い, サイト 重い 原因, autoload, TTFB 遅い"
category: 技術メモ
tags: [wordpress, パフォーマンス, autoload, wp_options, 表示速度]
status: draft
verified: 2026-09-12
---

サイトの表示が遅い。管理画面がとくに遅い。
キャッシュプラグインを入れても改善しない。

「重い」は感覚では動かせません。**どこに何 ms かかっているかを測る**と、
直す場所が決まります。実測で数字を出しました。

## 先に結論

| 原因 | 実測値 | 特徴 |
|---|---|---|
| `wp_options` の `autoload` 肥大 | 42KB で **0.7 ms** → 12MB で **15.1 ms** | **全ページに毎回かかる** |
| 同上（メモリ） | 28MB → **52MB**（ピークメモリが倍増） | メモリ不足の引き金になる |
| 外部通信（api.wordpress.org） | 1 回 **825〜883 ms** | 管理画面に効く |
| 外部通信が**遮断**されている | **5,005 ms**（タイムアウト待ち） | **遅いより遮断のほうが悪い** |
| 遅いクエリ | `slow.log` に `Query_time` として記録 | 特定のページだけ遅い |

**フロントが遅いなら `autoload`、管理画面だけ遅いなら外部通信**、
という切り分けになります。

## autoload とは何か

WordPress は**起動時に 1 回、`wp_options` テーブルから
「autoload が有効な行」をまとめて読み込みます。**

```sql
SELECT option_name, option_value FROM wp_options WHERE autoload IN ('on','auto');
```

サイト名やテーマ設定など、どのページでも必要なものを
毎回問い合わせずに済ませるための仕組みです。

問題は、**プラグインが不要なデータまで autoload にしてしまう**ことです。
ライセンス情報、キャッシュ、ログ、削除されたプラグインの残骸などが積み上がります。

## 実測: サイズと時間の関係

意図的に肥大させて、このクエリの実行時間を測りました。

| autoload のサイズ | 件数 | クエリ時間 | 展開時間 | ピークメモリ |
|---|---|---|---|---|
| **42 KB**（このラボの素の状態） | 127 | **0.7 ms** | 0.1 ms | 28 MB |
| 1 MB | 128 | **1.5 ms** | 0.1 ms | 28 MB |
| 4 MB | 131 | **3.3 ms** | 0.2 ms | 28 MB |
| **12 MB** | 139 | **15.1 ms** | 0.1 ms | **52 MB** |

読み取れることが 3 つあります。

**1. サイズにほぼ比例する**

42KB → 12MB（約 280 倍）で、0.7 ms → 15.1 ms（約 20 倍）。
**これが全ページの表示時間に毎回乗ります。**

15 ms は単体では小さく見えますが、キャッシュが効かないページ
（ログイン中、カート、検索結果、管理画面）では毎回発生します。

**2. 展開（unserialize）のコストはほぼゼロ**

「直列化データの展開が重い」と言われることがありますが、
**0.1〜0.2 ms で、サイズを増やしても変わりませんでした。**
重いのは**転送と読み取り**です。

**3. メモリが倍増する — これが本当の危険**

12MB の autoload でピークメモリが **28MB → 52MB** になりました。
autoload の中身は**リクエストの間ずっとメモリに載ります。**

`memory_limit` が 128MB の環境で、テーマとプラグインが 60MB 使っていたら、
autoload の 24MB 増加で**メモリ不足による白画面**が起きます。
「特定のページだけ真っ白」「画像をアップロードすると落ちる」の背後に
これがあることがあります。
→ [PHP を上げたらサイトが白画面になった](php-upgrade-white-screen.md)

## 自分のサイトの autoload を測る

```sql
-- 合計サイズと件数
SELECT COUNT(*) AS 件数, ROUND(SUM(LENGTH(option_value))/1024, 1) AS KB
FROM wp_options WHERE autoload IN ('on','auto','yes');

-- 大きいものを上から
SELECT option_name, ROUND(LENGTH(option_value)/1024, 1) AS KB
FROM wp_options WHERE autoload IN ('on','auto','yes')
ORDER BY LENGTH(option_value) DESC LIMIT 20;
```

**`autoload` の値は WordPress のバージョンで違います。**
古いものは `yes` / `no`、新しいものは `on` / `off` / `auto` です。
実測環境（WordPress 7.1）では `on` / `off` / `auto` の 3 種類でした。
**古い記事のクエリ（`autoload = 'yes'`）をそのまま使うと 0 件になります。**

### 目安

| 合計サイズ | 判断 |
|---|---|
| 〜 200 KB | 問題なし |
| 200 KB 〜 1 MB | 上位を確認する価値がある |
| 1 MB 以上 | **確実に削る対象がある** |

### 削るときの注意

**中身を見ずに消してはいけません。**プラグインの設定が入っていることがあります。

```sql
-- まず中身を確認する
SELECT option_name, LEFT(option_value, 200) FROM wp_options WHERE option_name = '<名前>';
```

安全に削れるのは、**すでに削除したプラグインの残骸**です。
名前に接頭辞が付いているので判別できます。
使っているプラグインのものは、**消すのではなく autoload を外します。**

```sql
UPDATE wp_options SET autoload = 'off' WHERE option_name = '<名前>';
```

こうすると、必要になったときだけ個別に読まれます。
**削除より安全で、効果は同じです。**

`_transient_` で始まる期限切れのものは、WP-CLI でまとめて消せます。

```sh
wp transient delete --expired
```

## 管理画面だけ遅い場合は外部通信

管理画面は、更新の有無やお知らせを**外部に問い合わせます。**
実測した往復時間です。

| 宛先 | 時間 | 結果 |
|---|---|---|
| `api.wordpress.org`（更新チェック） | **825 ms** | HTTP 200 |
| `api.wordpress.org`（お知らせ） | **883 ms** | HTTP 200 |

**正常でも 1 回 0.8 秒かかります。**ダッシュボードは複数の問い合わせをするので、
それだけで数秒になります。

### 遮断されているほうが悪い

到達できない宛先への通信を測りました（遮断された状態の再現）。

| | 時間 | 結果 |
|---|---|---|
| 到達できない宛先 | **5,005 ms** | `http_request_failed` |

**タイムアウトまで待たされます。**指定した 5 秒を使い切りました。

ファイアウォールが外向き通信を落としている環境、
社内ネットワーク、`api.wordpress.org` が遅い時期などでは、
**「遅い」ではなく「タイムアウトを待っている」**という状態になります。

管理画面が 10 秒以上かかるなら、まずこれを疑います。

```sh
# WordPress から実際に叩いて時間を測る
wp eval '
$t = microtime( true );
$r = wp_remote_get( "https://api.wordpress.org/core/version-check/1.7/", array( "timeout" => 5 ) );
printf( "%.0f ms / %s
", ( microtime( true ) - $t ) * 1000,
  is_wp_error( $r ) ? $r->get_error_code() : wp_remote_retrieve_response_code( $r ) );'
```

**1 秒以内なら正常、5 秒前後で失敗するなら遮断されています。**

### 対処

外部通信そのものを止めるのは副作用が大きい（更新の検知ができなくなる）ので、
**頻度を下げるか、ダッシュボードのウィジェットを止めます。**

- ダッシュボードの「WordPress イベントとニュース」を表示オプションで外す
- 更新チェックの間隔を延ばす
- 外向き通信が塞がれているなら、**塞ぐのをやめるか、明示的に無効化する**
  （タイムアウト待ちが一番損）

同じ仕組みが**予約投稿の失敗**にも効きます。WP-Cron は
サイト自身への HTTP リクエストで動くため、ループバックが通らないと
定期処理が全部止まります。
→ [予約投稿されない](scheduled-post-missed.md)

## 特定のページだけ遅い場合はクエリ

全ページではなく特定のページだけ遅いなら、そのページのクエリです。
`slow.log` に記録させます。

```ini
slow_query_log      = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time     = 1
```

実測した記録の形です。

```
# Query_time: 3.000884  Lock_time: 0.000000 Rows_sent: 1  Rows_examined: 0
SELECT SLEEP(3);
```

**見るのは `Query_time` ではなく `Rows_examined` です。**
数万〜数百万なら**インデックスが効いていません。**
`Query_time` が長いだけなら、負荷やロック待ちの影響もあります。

WordPress で `Rows_examined` が膨らむ典型は次のものです。

- `meta_query` での絞り込み（`wp_postmeta` の全走査）
- `posts_per_page = -1`（全件取得）
- `orderby` にメタ値を使う並び替え
- 投稿数が数万件あるサイトでのカテゴリ・タグ一覧

## 測る順番

```sh
# 1. autoload の合計サイズ(全ページに効く)
wp db query "SELECT COUNT(*), ROUND(SUM(LENGTH(option_value))/1024,1) AS KB
             FROM wp_options WHERE autoload IN ('on','auto','yes');"

# 2. 応答時間の内訳(TTFB が長いならサーバー側、その後が長いなら転送や JS)
curl -s -o /dev/null -w 'TTFB %{time_starttransfer}s / 合計 %{time_total}s
' https://example.com/

# 3. 管理画面が遅いなら外部通信を測る(上の wp eval)

# 4. 特定ページが遅いなら slow.log を有効にする
```

| 観測 | 原因 |
|---|---|
| 全ページが一律に遅い | `autoload`、共有サーバーの負荷 |
| **管理画面だけ遅い** | 外部通信（正常でも 0.8 秒 × 複数回、遮断なら 5 秒待ち） |
| 特定のページだけ遅い | クエリ。`slow.log` の `Rows_examined` |
| 間欠的に遅い・時々落ちる | DB の接続数枯渇 → [DB 接続エラー](db-connection-error-diagnosis.md) |
| TTFB は速いのに表示が遅い | アセット。画像のサイズ、JS の量 → [CSS が効かない・JS が動かない](css-js-not-loading.md) |

**キャッシュプラグインは「測ってから」入れます。**
`autoload` が 12MB ある状態でキャッシュを足しても、
キャッシュが効かないページ（ログイン中、カート、検索）は遅いままです。

## 再現手順

```sh
# autoload を肥大させて、クエリ時間とメモリを測る
mysql -e "INSERT INTO wp_options (option_name, option_value, autoload)
          VALUES ('lab_bloat', REPEAT('x', 1000000), 'on');"

# 起動時と同じクエリの時間を測るプローブを置いて叩く
# (wp-load.php を読み込み、$wpdb->get_results() の時間と memory_get_peak_usage を出す)

mysql -e "DELETE FROM wp_options WHERE option_name LIKE 'lab_bloat%';"
```
