---
title: "バックアップが取れていない — UpdraftPlus と BackWPup を実測"
slug: backup-plugin-not-running
seo_title: "バックアップが動かない｜UpdraftPlus・BackWPup 実測"
description: "バックアッププラグインを入れたのに実行されていない原因を実測。入れただけでは予約されず、WP-Cron のループバックが不通だと予定時刻を過ぎても走りません。取れたファイルが外から取れる問題も測りました。"
keywords: "UpdraftPlus 動かない, BackWPup 動かない, バックアップ されていない, WordPress バックアップ 自動, wp-cron 動かない, バックアップ 漏洩"
category: 障害報告
tags: [wordpress, バックアップ, updraftplus, backwpup, wp-cron, セキュリティ]
status: draft
verified: 2026-09-26
---

バックアッププラグインを入れてある。しかし**いつ取れたのか分からない**。
管理画面を見ると「次回のバックアップ」の日時が**過ぎたまま**になっている。

UpdraftPlus（1.26.8）と BackWPup（5.7.6）を入れて、
**どこまでが自動で、どこからが手動なのか**を測りました。
あわせて、取れたバックアップが外から取れるかどうかも確認しています。

## 実測環境

WordPress 7.1 / PHP 8.2。**この環境はループバックが通りません。**

```
loopback 失敗: cURL error 7: Failed to connect to localhost:8080
```

ループバックとは、サイトが自分自身に HTTP リクエストを投げる仕組みのことです。
**WP-Cron はこれで動く**ため、通らない環境では定期処理が一切動きません。
→ [予約投稿されない](scheduled-post-missed.md)

レンタルサーバーでも、Basic 認証・WAF・CDN 経由の構成で同じ状態になります。

## 実測 1: 入れただけでは何も予約されない

有効化した直後に、登録された定期処理を数えました。

| プラグイン | 有効化直後に増えた定期処理 | バックアップの予約 |
|---|---|---|
| UpdraftPlus | `updraftplus_clean_temporary_files`（12 時間ごと） | **無し** |
| BackWPup | `backwpup_check_cleanup`（12 時間ごと） | **無し** |

**どちらも掃除用の処理が増えるだけです。**
「入れた＝バックアップが始まる」ではありません。

### BackWPup は「ジョブが 1 件あるのに無い」

BackWPup は有効化時に `First backup` という雛形ジョブを作ります。
しかし**画面にもコマンドにも出てきません。**

![BackWPup の画面。「Ready to set up your first backup?」と出てジョブ一覧が空](../screenshots/p/backwpup-no-job.jpg)

*有効化した直後の画面。内部に雛形はあるが、設定は何も終わっていない*

理由はフラグでした。雛形には `tempjob` が立っていて、
一覧を作る処理がこれを除外します。

| 確認 | 結果 |
|---|---|
| 内部のジョブ一覧（`get_job_ids()`） | **1 件**（`First backup`） |
| 管理画面のジョブ一覧 | **0 件**（セットアップの案内が出る） |
| コマンドのジョブ一覧 | **0 件** |
| 予約（`backwpup_cron`） | **未登録** |

`tempjob` を外すと、コマンドの一覧には出るようになりました
（`cron = 0 0 1 * *` = 毎月 1 日 0 時、`last_run = never`）。
**それでも予約は入りません。**

### 予約は「掃除の処理」が入れている

BackWPup の予約は、ジョブを作った時ではなく
**12 時間ごとの掃除の処理（`backwpup_check_cleanup`）が走ったときに登録されます。**

実測しました。

| 操作 | `backwpup_cron` の予約 |
|---|---|
| ジョブを有効な状態にした直後 | **無し** |
| `backwpup_check_cleanup` を実行した後 | **2026-09-30 15:00 に登録** |

**その掃除の処理自体も WP-Cron で動きます。**
つまりループバックが通らない環境では、
**予約が入る前の段階で止まります。**

## 実測 2: 予約しても、時間が来ても走らない

UpdraftPlus で日次のスケジュールを設定しました。予約は入ります。

```
updraft_backup           1 日ごと
updraft_backup_database  1 日ごと
```

ここで**予約時刻を過去にずらし、サイトに 3 回アクセス**しました。
WP-Cron は「誰かがアクセスしたとき」に起動する仕組みだからです。

| | バックアップのファイル数 |
|---|---|
| アクセス前 | 6 |
| **アクセス後** | **6（増えない）** |

**1 つも実行されませんでした。**ループバックが通らないためです。

管理画面にはこう出ていました。

```
Next scheduled backups:
  Files:    日, 9月 27, 2026 00:39
  Database: 金, 9月 25, 2026 00:39
  Time now: 土, 9月 26, 2026 01:43
```

**データベースの予定は 9 月 25 日なのに、今は 9 月 26 日です。**
画面に「次回」と書かれていても、**過ぎた日時のまま止まっている**ことがあります。
ここが「取れているつもり」の正体です。

## 実測 3: 手動なら完走する

同じ状態で、コマンドから直接実行しました。

| | 結果 |
|---|---|
| UpdraftPlus（`updraft_backup` を実行） | **348 秒で完了**。ファイルが 6 → 12 に増えた |
| BackWPup（ジョブを直接実行） | **136 秒で完了**。145.59MB・5,445 ファイル |

**処理そのものは正常です。**壊れているのは「実行のきっかけ」だけ、と確定できます。

対策は予約投稿と同じで、**サーバーの cron から叩く**ことです。

```
*/15 * * * * cd /path/to/wordpress && wp cron event run --due-now > /dev/null
```

`wp-config.php` に `define( 'DISABLE_WP_CRON', true );` を入れる場合は、
**サーバー側の cron 登録を必ずセットで行います。**片方だけだと全部止まります。

## 実測 4: 取れたバックアップは外から取れる

置き場所と、未ログインでの到達性を測りました。
**別記事で測った All-in-One WP Migration も並べます。**

| プラグイン | 置き場所 | 保護 | nginx | Apache |
|---|---|---|---|---|
| All-in-One WP Migration | `wp-content/ai1wm-backups/` | **拒否なし** | **200** | **200** |
| UpdraftPlus | `wp-content/updraft/` | `.htaccess` に `deny from all` | **200** | 403 |
| BackWPup | `uploads/backwpup/<ランダム6文字>/backups/` | `.htaccess` に `Require all denied` | **200** | 403 |

**3 つとも nginx では素通りです。**`.htaccess` は Apache しか読まないためです。

実際に未ログインで取得できた中身です。

| 取得したもの | サイズ | 中身 |
|---|---|---|
| UpdraftPlus の `-db.gz` | 170,421 バイト | 展開して約 1MB。`CREATE TABLE` が 31 個、`wp_users` の INSERT あり |
| BackWPup の `.tar` | 152,667,648 バイト | `wp_lab.sql` と **`wp-config.php`** を含む |

**BackWPup のアーカイブには `wp-config.php` が入っていました。**
データベースの認証情報と認証キーが書かれているファイルです。
→ [設定ファイルは漏れるのか](config-file-exposure.md)

nginx を使っているなら、サーバー設定で塞ぎます。

```nginx
location ~* /wp-content/(updraft|ai1wm-backups)/ { deny all; }
location ~* /wp-content/uploads/backwpup/         { deny all; }
```

**保存先を公開領域の外に置ける設定があるなら、そちらが確実です。**
→ [.wpress は未ログインで取得できる](ai1wm-backup-exposure.md)

## 実測 5: 消しても設定は残る

両方のプラグインを削除したあと、残ったオプションを数えました。

| 接頭辞 | 残っていた件数 |
|---|---|
| `updraft` | **29 件** |
| `backwpup` | **32 件** |

`uploads/backwpup-restore` というディレクトリも残りました。

**削除しても設定は消えません。**入れ替えを繰り返したサイトでは、
使っていないプラグインの設定が `wp_options` に積もります。
起動のたびに読み込まれる設定が増えると表示が遅くなります。
→ [WordPress が重い](site-is-slow.md)

## 確認の順番

```sh
# 1. バックアップの予約が入っているか
wp cron event list | grep -iE 'updraft|backwpup'

# 2. 予定時刻が過去になっていないか（過去のまま = 動いていない）
wp cron event list --fields=hook,next_run_relative | grep -iE 'updraft|backwpup'

# 3. ループバックが通るか
wp eval '$r = wp_remote_get( site_url( "/wp-cron.php" ), array( "timeout" => 5 ) );
echo is_wp_error( $r ) ? "失敗: " . $r->get_error_message() : "成功";'

# 4. 取れたファイルが外から取れないか
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/wp-content/updraft/
```

| 観測 | 意味 |
|---|---|
| 予約が 1 件も無い | 設定が終わっていない。プラグインを入れただけの状態 |
| 予定時刻が過去のまま | WP-Cron が動いていない。**ループバックを確認する** |
| 手動実行は成功する | 処理は正常。きっかけだけの問題。サーバーの cron から叩く |
| 置き場所が 200 で返る | **バックアップが公開されている。**サーバー設定で塞ぐ |

**「次回のバックアップ」の日時が過ぎていないか**を見るのが、
いちばん早い確認方法です。

## 再現手順

```sh
wp plugin install updraftplus --activate
wp plugin install backwpup --activate

# 入れただけの状態で予約を数える
wp cron event list --fields=hook,recurrence | grep -iE 'updraft|backwpup'

# UpdraftPlus に日次スケジュールを入れる
wp eval '$GLOBALS["updraftplus"]->schedule_backup("daily");
$GLOBALS["updraftplus"]->schedule_backup_database("daily");'

# 予約時刻を過去にずらしてサイトにアクセスする（実行されない）
for i in 1 2 3; do curl -s -o /dev/null http://localhost:8080/; sleep 3; done
ls wp-content/updraft/backup_* | wc -l

# 手動実行（完走する）
wp cron event run updraft_backup

# BackWPup の雛形ジョブ
wp eval 'echo count(BackWPup_Option::get_job_ids()), "\n";'   # 1 件
wp backwpup job                                                # 0 件
wp eval 'BackWPup_Option::update(1, "tempjob", false);'
wp cron event run backwpup_check_cleanup                       # ここで予約が入る
wp backwpup run 1 --now

# 外から取れるか
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8080/wp-content/updraft/<ファイル名>"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8082/wp-content/updraft/<ファイル名>"
```

検証で入れた 2 つのプラグイン、生成したアーカイブ、登録された定期処理は削除済みです。
