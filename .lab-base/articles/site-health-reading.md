---
title: "WordPressサイトヘルスの「重大な問題」の意味と対処法"
slug: site-health-reading
seo_title: "WordPress サイトヘルス 重大な問題｜意味と偽陽性の見分け方"
description: "サイトヘルスに出る「重大な問題」の意味と対処法。REST APIやループバックの検査はサイト自身への通信で判定するため、正常でも赤くなる偽陽性がある。実害のある項目とそうでない項目を実測で仕分け。"
keywords: "WordPress サイトヘルス 重大な問題, サイトヘルス REST API エラー, ループバック 失敗, サイトヘルス 見方, 推奨されている改善"
category: 技術メモ
tags: [wordpress, サイトヘルス, 診断, rest-api, ループバック]
status: draft
verified: 2026-09-12
---

管理画面の **ツール > サイトヘルス** に「重大な問題」が出ている。
でもサイトは普通に動いている。直すべきなのか、放っていいのか分からない。

**サイトヘルスの項目には、環境によって必ず赤くなるものがあります。**
各検査が実際に何を見ているかを、1 つずつ壊して確かめました。

## 検査は 2 種類ある

WordPress の検査は 26 項目あり、動き方が 2 つに分かれます。

| 種類 | 件数 | 動き方 |
|---|---|---|
| **direct** | 21 | PHP の中で直接判定する |
| **async** | 5 | **サイト自身に HTTP リクエストを投げて判定する** |

async の 5 つは、実際にこの URL を叩いています。

```
/wp-json/wp-site-health/v1/tests/dotorg-communication
/wp-json/wp-site-health/v1/tests/background-updates
/wp-json/wp-site-health/v1/tests/loopback-requests
/wp-json/wp-site-health/v1/tests/https-status
/wp-json/wp-site-health/v1/tests/authorization-header
```

**ここが偽陽性の最大の原因です。**サイト自身への通信（ループバック）が
通らない環境では、**中身が正常でも 5 つ全部が失敗します。**

## 実測: 正常なサイトでも critical が 2 件出た

検証環境（サイトは正常に動作、REST API も外から見れば 200 で正常な JSON を返す）で
検査を走らせた結果です。

```
rest_availability    [critical]   REST API でエラーが発生しました
loopback_requests    [critical]   サイトでループバックリクエストが完了できませんでした
```

しかし外から REST API を叩くと正常です。

```
$ curl -s -o /dev/null -D - http://localhost:8080/wp-json/ | grep -iE '^HTTP|^content-type'
HTTP/1.1 200 OK
Content-Type: application/json; charset=UTF-8
```

![REST API でエラーが発生しました / サイトでループバックリクエストが完了できませんでした](../screenshots/s/site-health-critical.jpg)

*同じ環境をブラウザで開いた画面（2026-09-16 撮影）。このときは「バックグラウンド更新が想定通りに動作していません」を含む 3 件が並んだ。バックグラウンド更新も async の検査で、ループバックが通らないと失敗する 5 つのうちの 1 つ*

**「REST API でエラーが発生しました」は、REST API が壊れていることを
意味しません。**サイト自身から自分の URL に到達できないだけです。

### ループバックが通らない実際の原因

| 原因 | 説明 |
|---|---|
| Basic 認証をかけている | ステージング環境で頻発。自分へのリクエストも 401 で弾かれる |
| ファイアウォールが自ホストへの接続を遮断 | セキュリティ設定の副作用 |
| サイト URL が CDN やロードバランサ経由 | サーバーから自分の外向き URL に戻れない |
| DNS がサーバー内から解決できない | `hosts` の設定漏れ |
| コンテナ環境でホスト名が解決できない | 検証環境で起きたのはこれ |

**この状態では予約投稿も自動更新も止まります。**
サイトヘルスの警告は無視できませんが、**「REST が壊れている」と読むのは誤りです。**
→ [予約投稿されない](scheduled-post-missed.md)

### 見分け方

```sh
# 外から REST を叩く
curl -s -o /dev/null -D - https://example.com/wp-json/ | grep -i content-type
```

| 結果 | 判断 |
|---|---|
| `application/json` が返る | **REST は正常。**サイトヘルスが赤いのはループバックの問題 |
| `text/html` が返る | **REST が本当に壊れている**（遮断か Fatal） |

後者なら記事の内容が変わります。
→ [「返答が正しい JSON レスポンスではありません」](rest-json-update-failed.md)

## 実測: 全 21 項目の判定

同じ環境での direct 検査の結果です。**赤や黄色が並ぶのが普通の状態**だと
分かります。

| 項目 | 判定 | 意味 |
|---|---|---|
| `wordpress_version` | good | 本体が最新か |
| `plugin_version` / `theme_version` | recommended | **停止中のものを削除しろ**と言っている |
| `php_version` | recommended | PHP のバージョン |
| `php_extensions` | good | 必須・推奨モジュール |
| `php_default_timezone` | good | タイムゾーン設定 |
| `php_sessions` | good | セッションの使用 |
| `sql_server` | recommended | **データベースのバージョン**（MySQL 5.7 は古い扱い） |
| `ssl_support` | good | 外部と安全に通信できるか |
| `scheduled_events` | recommended | **予約イベントの実行に失敗** |
| `http_requests` | good | 外向き通信が許可されているか |
| **`rest_availability`** | **critical** | **内部リクエストで判定（偽陽性になりうる）** |
| `debug_enabled` | recommended | **訪問者にエラーを表示する設定になっている** |
| `file_uploads` | good | アップロードの可否 |
| `plugin_theme_auto_updates` | good | 自動更新の設定 |
| `update_temp_backup_writable` | good | 更新用の一時領域 |
| `available_updates_disk_space` | good | ディスク空き |
| **`autoloaded_options`** | good | **autoload のサイズ**（後述） |
| `insecure_registration` | good | 誰でも権限付きで登録できる状態か |
| `search_engine_visibility` | recommended | **検索エンジンにインデックスさせない設定** |
| `opcode_cache` | recommended | オペコードキャッシュ |

### 放っていい recommended と、放ってはいけないもの

**放ってはいけないもの**

| 項目 | 理由 |
|---|---|
| `debug_enabled`（訪問者へのエラー表示） | **エラーがそのまま見える**。しかも**障害時のステータスが 500 でなく 200 になる**ので監視に引っかからなくなる |
| `scheduled_events`（予約イベントの失敗） | 予約投稿・自動更新・バックアップが全部止まっている |
| `search_engine_visibility` | **公開サイトなら致命的**。検索結果に出ない |
| `insecure_registration` | 誰でも管理者になれる状態なら即対応 |

`debug_enabled` の実害は別記事で実測しています。
→ [サイトが死んでいるのに監視は 200 を返す](http-200-when-site-is-down.md)

**優先度が低いもの**

| 項目 | 理由 |
|---|---|
| `plugin_version` / `theme_version`（停止中を削除） | 削除は望ましいが、**表示にも速度にも影響しない**。停止中のプラグインは読み込まれない |
| `php_version` / `sql_server` | 上げるべきだが、**上げると壊れる**可能性がある。準備してから |
| `opcode_cache` | **測り方によって偽陽性になる**（後述） |

## autoload のサイズは WordPress 自身が見ている

`autoloaded_options` は、**起動時に読み込まれるオプションの合計サイズ**を
検査します。しきい値を実測で挟み込みました。

| 合計サイズ | 件数 | 判定 |
|---|---|---|
| 42 KB | 127 | **good** |
| 530 KB | 128 | **good** |
| **921 KB** | 129 | **critical** |

**約 800 KB が境目**です。critical のときのメッセージには
実際の数値が入ります。

```
このサイトには options テーブル内に 139 個の自動読み込みオプション
(サイズ: 11 MB) があります。
```

**これは実際に速度とメモリに効きます。**別記事で測った値です。

| autoload | クエリ時間 | ピークメモリ |
|---|---|---|
| 42 KB | 0.7 ms | 28 MB |
| 12 MB | **15.1 ms** | **52 MB** |

→ [WordPress が重い](site-is-slow.md)

**この項目が critical なら、実害があるので対応します。**

## 偽陽性になる項目

### コマンドラインから検査を走らせた場合

WP-CLI から検査を実行すると、**Web とは別の環境で判定される**ため
結果がずれます。実測した例です。

| | 結果 |
|---|---|
| サイトヘルスの `opcode_cache` | recommended「オペコードキャッシュが有効化されていません」 |
| **Web（fpm）側の実際の状態** | **`opcache.enable=1` / 実際に有効=はい** |

**Web では有効なのに、コマンドラインからは無効と判定されました。**
オペコードキャッシュはコマンドライン実行では既定で働かないためです。

同じ理由で、**タイムゾーン、メモリ上限、アップロードサイズなども
コマンドラインと Web で違う値になります。**

**サイトヘルスはブラウザから見るのが正しい**、ということになります。

### HTTPS を使っていない環境

`https_status` は async なので、ループバックが通らないと判定できません。
また HTTP のみの検証環境では当然 recommended になります。

## 「情報」タブのほうが役に立つ

「ステータス」タブより、**「情報」タブ**が実務では有用です。
ここには判定ではなく**生の値**が並びます。

| 見たい値 | 場所 |
|---|---|
| PHP のバージョン、`memory_limit`、`max_input_vars` | サーバー |
| **PHP のエラーログの場所** | サーバー |
| アップロードの最大サイズ | メディア処理 |
| データベースのバージョンと文字セット | データベース |
| 有効なプラグインとバージョン一覧 | プラグイン |
| 定数の設定（`WP_DEBUG` など） | WordPress の定数 |

**`max_input_vars` と PHP のエラーログの場所は、ここで確認するのが最短です。**
どちらも障害調査で必要になり、他の場所からは探しにくい値です。
→ [保存したのに一部だけ消える](max-input-vars-silent-loss.md)
→ [ログはどこにあり、何を見るのか](where-are-the-logs.md)

## まとめ: 読む順番

1. **critical を見る。ただし `rest_availability` と `loopback_requests` は
   外から REST を叩いて確認する**（偽陽性の可能性）
2. `autoloaded_options` が critical なら実害あり。対応する
3. `debug_enabled` が出ていたら本番設定を直す
4. `search_engine_visibility` が出ていたら公開サイトかどうか確認する
5. `scheduled_events` が出ていたらループバックを疑う
6. `plugin_version` / `php_version` は「いつかやる」に分類してよい

**「重大な問題」という表示は、必ずしも「今すぐ直す」を意味しません。**
逆に recommended（`debug_enabled`）のほうが実害が大きいことがあります。

## 再現手順

```sh
# ブラウザを使わずに検査を走らせる(ただし CLI 実行は一部偽陽性になる)
wp eval '
require_once ABSPATH . "wp-admin/includes/class-wp-site-health.php";
$h = WP_Site_Health::get_instance();
foreach ( WP_Site_Health::get_tests()["direct"] as $key => $t ) {
  $m = "get_test_" . $t["test"];
  if ( ! is_string( $t["test"] ) || ! method_exists( $h, $m ) ) continue;
  $r = $h->$m();
  printf( "%-26s [%s] %s
", $key, $r["status"], wp_strip_all_tags( $r["label"] ) );
}'

# REST が本当に壊れているか(サイトヘルスとは別に確認する)
curl -s -o /dev/null -D - https://example.com/wp-json/ | grep -i content-type
```
