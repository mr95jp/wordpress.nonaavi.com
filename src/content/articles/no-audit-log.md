---
title: "WordPressは誰が何を変えたか記録しない — 操作ログの実測"
slug: no-audit-log
seo_title: "WordPress 操作ログ・監査ログは無い｜実測と対策"
description: "誰がプラグインを有効化したか、いつ設定を変えたかをWordPressは記録しません。操作の前後でデータベースがどう変わるかを実測。ログイン履歴も残らないことと、運用で決めておくことをまとめます。"
keywords: "WordPress 操作ログ, WordPress 監査ログ, WordPress ログイン履歴, 誰が更新したか, WordPress 変更履歴, 企業 WordPress 運用"
category: 技術メモ
tags: [wordpress, 運用, ログ, 監査, セキュリティ]
summary: |
  「誰がいつ設定を変えたか」を WordPress は記録していません。
  ・プラグインの有効化も設定の変更も、データベースの行数は増えず、前の値も残らない
  ・記録が残るのは投稿と固定ページの本文だけ（リビジョンに編集者と日時が入る）
  ・ログインは時刻だけ。IP も失敗の回数も残らず、アクセスログでは成功と失敗を区別できない
  ・記録が要るなら mu-plugins に自分で足す。更新の担当者とアカウントの棚卸しは先に決めておく
status: published
published: 2026-09-17
verified: 2026-09-17
---

「先月、誰がこのプラグインを有効化したのか」「設定はいつ変わったのか」。
社内で聞かれても、**WordPress にはそれを答える材料がありません。**

どこまでが記録され、どこからが記録されないのかを実測しました。

## 実測: 操作してもデータベースは増えない

管理者と同じ操作を行い、直前と直後でテーブルの行数を比べました。

| 操作 | データベースの変化 | 誰が・いつ の記録 |
|---|---|---|
| プラグインを有効化 | **変化なし** | **残らない** |
| サイト設定を変更（サイト名） | **変化なし** | **残らない** |
| 投稿を編集 | `wp_posts` **+1**（リビジョン） | **残る**（作成者 ID と日時） |

プラグインの有効化で変わるのは `wp_options` の `active_plugins` の**値だけ**です。

```
有効化前: ["lab-triggers/lab-triggers.php"]
有効化後: ["hello.php","lab-triggers/lab-triggers.php"]
```

**前の値も、変更した人も、時刻も保存されません。**
サイト名を変えたときも同じで、変更前の値を持つ行は作られませんでした。

記録が残るのは投稿と固定ページの本文だけです。実測したリビジョンには、
編集したユーザーの ID と日時が入っていました（`lab_editor` ID 2 で確認）。

## 監査用のテーブルは存在しない

インストール直後の WordPress が持つテーブルを確認しました。

```
wp_commentmeta, wp_comments, wp_links, wp_options, wp_postmeta, wp_posts,
wp_term_relationships, wp_term_taxonomy, wp_termmeta, wp_terms, wp_usermeta, wp_users
```

**12 個だけで、操作の履歴を書く場所がありません。**
記録の仕組みとして用意されているのはリビジョンだけで、その対象は本文です。

## ログインの記録も残らない

こちらのほうが影響が大きいかもしれません。

| 知りたいこと | 実測結果 |
|---|---|
| いつログインしたか | `session_tokens` に `login` と `expiration` の**時刻だけ** |
| どこからログインしたか | **記録なし**（IP もブラウザ情報も保存されない） |
| 最終ログイン日時 | `wp_users` に列が無く、`wp_usermeta` にも `last_login` は無い |
| ログインの失敗 | `wp_options` の行数は **±0**。試行回数もロックも記録しない |

実際に保存されていた値です。

```json
{"expiration":1789572728,"login":1789565528}
```

`wp_users` の列は `ID, user_login, user_pass, user_nicename, user_email, user_url,
user_registered, user_activation_key, user_status, display_name` で、
**最後にログインした日時を持つ列はありません。**

### アクセスログでも成功と失敗を区別できない

Web サーバーのログなら追えるのでは、と考えて確かめました。
ログイン成功と、パスワードを間違えた 3 回の記録です。

```
192.168.65.1 - - [16/Sep/2026:15:12:05 +0000] "POST /wp-login.php HTTP/1.1" 200 10373
192.168.65.1 - - [16/Sep/2026:15:12:55 +0000] "POST /wp-login.php HTTP/1.1" 200 10362
192.168.65.1 - - [16/Sep/2026:15:12:55 +0000] "POST /wp-login.php HTTP/1.1" 200 10362
192.168.65.1 - - [16/Sep/2026:15:12:55 +0000] "POST /wp-login.php HTTP/1.1" 200 10362
```

**成功も失敗も `200` です。**ユーザー名も残りません。
本文の長さがわずかに違うだけで、ログから「誰がログインしたか」「何回失敗したか」は
読み取れません。

→ どのログに何が出るかは [ログはどこにあり、何を見るのか](where-are-the-logs.md)

## なぜそうなるのか

WordPress は設定を `wp_options` に**上書き**で保存します。
`update_option()` は値を差し替えるだけで、前の値も操作者も残しません。

リビジョンだけが例外なのは、投稿の編集を**取り消せるようにする**ための機能だからです。
監査のための仕組みではないので、対象も本文に限られます。

つまり「記録が無い」のは不具合ではなく、**そういう設計**です。

## 運用で決めておくこと

記録が残らない以上、事前に決めておかないと後から追えません。
あわせて実測した、既定のままだと危ういものを挙げます。

**1. 更新を誰がやるか（自動更新は既定ではほぼ働かない）**

| 対象 | 既定 |
|---|---|
| 本体のマイナー更新（7.1 → 7.1.1） | **自動で更新する** |
| 本体のメジャー更新（7.1 → 7.2） | **自動で更新しない** |
| プラグイン | **自動で更新しない**（1 つずつ有効化が必要） |
| テーマ | **自動で更新しない** |

「自動更新に任せている」と思っていても、**プラグインは 1 つずつ有効にしない限り
更新されません。**担当者と頻度を決めておきます。

**2. パスワードの強度は強制されない**

`"1234"` でユーザーを作成でき、そのままログインできました。
WordPress のコアに、長さや複雑さの下限を決める設定はありません。
画面に出る強度メーターは警告するだけで、登録は止まりません。

**3. アプリケーションパスワードは既定で有効**

`wp_is_application_passwords_available()` は既定で `true` でした。
これは REST API 用の別パスワードで、**通常のログイン画面を守っても、
こちらが残っていれば外部から操作できます。**使わないなら止める判断が要ります。

**4. 退職者のアカウントを残さない**

誰がいつ作ったアカウントかは追えないので、定期的に棚卸しするしかありません。
ユーザーを削除するときは投稿の扱いに注意します（`--reassign` を付けないと投稿も消えます）。
→ [乗っ取られた・改ざんされた時の確認と対処法](compromised-db-side.md)

## 記録を残したいなら

WordPress の外側に自分で足すことになります。記録を書くコードは、
通常のプラグインではなく `wp-content/mu-plugins/` に置きます。
**プラグインが Fatal で止められても、リカバリーモードで全プラグインが
読み込まれなくても動く層**だからです。

```php
// wp-content/mu-plugins/audit.php
add_action( 'activated_plugin', function ( $plugin ) {
	error_log( sprintf( '[audit] plugin activated: %s by user %d', $plugin, get_current_user_id() ) );
} );
add_action( 'updated_option', function ( $option ) {
	if ( in_array( $option, array( 'blogname', 'siteurl', 'home', 'users_can_register' ), true ) ) {
		error_log( sprintf( '[audit] option updated: %s by user %d', $option, get_current_user_id() ) );
	}
} );
add_action( 'wp_login', function ( $login ) {
	error_log( sprintf( '[audit] login: %s from %s', $login, $_SERVER['REMOTE_ADDR'] ?? '-' ) );
} );
```

出力先は公開領域の外に置きます。`wp-content/debug.log` は
**Web から読めてしまう**ためです。
→ [ログはどこにあり、何を見るのか](where-are-the-logs.md)

## 再現手順

```sh
# 操作の前後で行数を比べる
wp eval '
require_once ABSPATH . "wp-admin/includes/plugin.php";
global $wpdb;
$c = function () use ($wpdb) { return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->options}"); };
$before = $c();
activate_plugin("hello.php");
printf("options: %d → %d\n", $before, $c());
printf("active_plugins: %s\n", json_encode(get_option("active_plugins")));
deactivate_plugins("hello.php");'

# ログインの記録
wp eval '
$u = get_user_by("login", "admin");
var_dump(get_user_meta($u->ID, "session_tokens", true));
var_dump(get_user_meta($u->ID, "last_login", true));'

# 自動更新の既定（AUTOMATIC_UPDATER_DISABLED などの定数を外した状態で測る）
wp eval '
require_once ABSPATH . "wp-admin/includes/class-wp-upgrader.php";
$u = new WP_Automatic_Updater();
$item = (object) ["response" => "upgrade", "current" => "7.1.1", "new_files" => false,
  "locale" => "ja", "packages" => (object) ["full" => "https://example.com/wp.zip"],
  "php_version" => "7.2.24", "mysql_version" => "5.5.5", "download" => "https://example.com/wp.zip"];
var_dump($u->should_update("core", $item, ABSPATH));'

# パスワードの強度
wp user create weakpw weakpw@example.com --user_pass=1234   # 作成できてしまう
wp user delete weakpw --yes
```

**`wp_is_auto_update_enabled_for_type()` は本体の判定に使えません。**
この関数は `plugin` と `theme` しか扱わず、`core` を渡すと常に `false` を返します。
本体は `WP_Automatic_Updater::should_update()` で測ります。
