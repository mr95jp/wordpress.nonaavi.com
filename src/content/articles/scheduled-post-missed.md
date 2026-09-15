---
title: "WordPressで予約投稿されない・公開されない時の対処法"
slug: scheduled-post-missed
seo_title: "WordPress 予約投稿 されない・失敗しました｜原因と対処法"
description: "予約した時刻を過ぎても公開されない・「予約投稿に失敗しました」の対処法。WP-Cronはサイト自身へのアクセスで動くため、アクセスが無い・ループバックが失敗すると動かないことを実測。手動実行と恒久対策も。"
keywords: "WordPress 予約投稿 されない, 予約投稿 失敗しました, 予約 公開されない, WP-Cron 動かない, 予約投稿 遅れる"
category: 障害報告
tags: [wordpress, 予約投稿, wp-cron, cron, ループバック]
status: draft
verified: 2026-09-12
---

予約した時刻を過ぎても公開されない。投稿一覧では「予約済み」のまま。
あるいは「**予約投稿に失敗しました**」と表示される。

WordPress の定期処理（WP-Cron）は、サーバーの cron とはまったく別の仕組みです。
**サイトへのアクセスをきっかけに、サイトが自分自身に HTTP リクエストを投げて動きます。**
この経路のどこかが切れていると、時刻になっても何も起きません。実測しました。

## 実測 1: アクセスが無いと公開されない

予約時刻を 90 秒後に設定し、**サイトに一切アクセスせず**3 分以上放置しました。

```
ID  post_status  post_date
47  future       2026-09-12 16:19:11
```

**予約時刻を過ぎても `future` のままです。**

WordPress は時計を持っていません。誰かがアクセスしたときに
「そろそろ実行すべき処理はあるか」を確認します。
**アクセスの無いサイトでは、予約投稿は公開されません。**

「深夜に予約したら朝まで公開されなかった」はこれです。
アクセスが少ないサイトほど遅れます。

## 実測 2: アクセスしても公開されないことがある

放置後に 1 回アクセスしました。

```
HTTP 200
ID  post_status
47  future        ← まだ公開されない
```

`wp-cron.php` を直接叩いても同じでした。

```
wp-cron.php HTTP 200
47  future
```

**200 が返るのに何も実行されません。**ここが本題です。

## 原因: 自分自身に接続できていない

WP-Cron の仕組みはこうです。

1. 誰かがサイトにアクセスする
2. WordPress が「実行すべき処理がある」と判断する
3. **サイト自身の URL（`https://自サイト/wp-cron.php`）に HTTP リクエストを投げる**
4. そのリクエストの中で処理が実行される

3 が失敗していました。WordPress 自身に確認させた結果です。

```
loopback 失敗: cURL error 7: Failed to connect to localhost:8080 after 0 ms:
               Could not connect to server
```

この「自分自身への接続」を**ループバック**と呼びます。
**ループバックが通らない環境では、WP-Cron は一切動きません。**

実際のサイトで通らなくなる原因は、たいていこれらです。

| 原因 | 説明 |
|---|---|
| Basic 認証をかけている | ステージング環境で頻発。自分へのリクエストも 401 で弾かれる |
| ファイアウォール・WAF が自ホストへの接続を遮断 | セキュリティ設定の副作用 |
| サイト URL が CDN やロードバランサ経由 | サーバーから自分の外向き URL に戻れない |
| DNS がサーバー内から解決できない | `hosts` の設定漏れ、内部 DNS の不整合 |
| サイト URL の設定が間違っている | そもそも存在しない URL に投げている |

**サイトヘルスの「重大な問題」として「ループバックリクエストが失敗しました」が
出ていたら、予約投稿も自動更新も止まっています。**

## 実測 3: 手動で実行すれば公開される

同じ状態で、WP-CLI から直接実行しました。

```
$ wp cron event run publish_future_post
Executed the cron event 'publish_future_post' in 0.03s.
Success: Executed a total of 1 cron event.

ID  post_status
47  publish        ← 公開された
```

**処理そのものは正常です。**壊れているのは「実行のきっかけ」だけ、と確定できます。
この切り分けができると、投稿やプラグインを疑う必要がなくなります。

## もう 1 つの症状: ロックが残る

実測中、この状態も観測しました。

```
option_name              option_value
_transient_doing_cron    1789197510.3333539962768554687500
```

WordPress は cron の二重起動を防ぐため、実行開始時にこのロックを置きます。
**処理が途中で死ぬとロックが残り、次回以降の起動が「すでに実行中」と判断して
即座に終了します。**

ロックは一定時間で無効になりますが、**残っている間はすべての定期処理が止まります。**
予約投稿だけでなく、自動更新・バックアップ・お知らせの取得も止まります。

phpMyAdmin から消せます。

```sql
DELETE FROM wp_options WHERE option_name LIKE '%doing_cron%';
```

## 切り分けの順番

**1. 溜まっているかを見る**

```sh
wp cron event list
```

`next_run_relative` が `now` や過去のものばかりなら、**cron が動いていません。**
1 件だけ遅れているのではなく全部遅れているのがポイントです。

**2. ループバックを確認する**

管理画面の **ツール > サイトヘルス** を開きます。
「ループバックリクエストが失敗しました」が出ていれば原因は確定です。

**3. 手動実行できるか試す**

```sh
wp cron event run --due-now
```

これで公開されるなら、処理は無罪で「きっかけ」だけの問題です。

**4. ロックを確認する**

```sql
SELECT * FROM wp_options WHERE option_name LIKE '%doing_cron%';
```

## 恒久対策: サーバーの cron から叩く

アクセスに依存する仕組みをやめて、サーバーの cron で定期的に叩きます。
**アクセスが少ないサイトでは、これが唯一確実な方法です。**

まず WordPress 側の自動起動を止めます。

```php
// wp-config.php
define( 'DISABLE_WP_CRON', true );
```

そのうえでサーバーの cron に登録します。

```
*/5 * * * * curl -s https://example.com/wp-cron.php?doing_wp_cron > /dev/null
```

WP-CLI が使えるなら、そちらのほうが確実です
（ループバックを経由しないため、Basic 認証やファイアウォールの影響を受けません）。

```
*/5 * * * * cd /path/to/wordpress && wp cron event run --due-now > /dev/null
```

**`DISABLE_WP_CRON` を書いたのにサーバー側の cron を登録し忘れると、
定期処理が完全に停止します。**片方だけやらないこと。

## 再現手順

```sh
# 90 秒後の予約投稿を作る(サイトのタイムゾーンで計算する)
wp eval '
$id = wp_insert_post( array(
  "post_title"    => "予約投稿テスト",
  "post_status"   => "future",
  "post_date"     => gmdate( "Y-m-d H:i:s", time() + 9*3600 + 90 ),
  "post_date_gmt" => gmdate( "Y-m-d H:i:s", time() + 90 ),
) );
echo $id, " ", get_post_status( $id ), "\n";'

# アクセスせずに 2 分待ってから、WordPress を起動せずに状態を見る
mysql -e "SELECT ID, post_status FROM wp_posts WHERE ID=<ID>;"   # future のまま

# ループバックを確認する
wp eval '
$r = wp_remote_get( site_url( "/wp-cron.php?doing_wp_cron" ), array( "timeout" => 5 ) );
echo is_wp_error( $r ) ? "失敗: " . $r->get_error_message() : "成功";'

# 手動実行
wp cron event run publish_future_post      # publish になる
```
