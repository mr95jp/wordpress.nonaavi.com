---
title: "WordPressの自動更新は既定でほとんど動かない — 何が自動で何が手動か"
slug: auto-update-not-working
seo_title: "WordPress 自動更新されない｜既定の動きと設定"
description: "自動更新に任せているつもりでも、既定で自動になるのは本体のマイナー更新だけです。プラグインとテーマは1つずつ有効にしないと更新されません。既定値と、設定が止められている場合の見分け方を実測しました。"
keywords: "WordPress 自動更新 されない, WordPress 自動更新 設定, プラグイン 自動更新, WordPress 更新 自動, 自動更新 有効化, AUTOMATIC_UPDATER_DISABLED"
category: 技術メモ
tags: [wordpress, 更新, 運用, セキュリティ, cron]
status: draft
verified: 2026-09-17
---

「更新は自動に任せている」と思っていたのに、プラグインのバージョンが半年前のまま。
企業のサイトでよくある状態です。

**既定で自動になるのは、本体のマイナー更新だけ**でした。実測した結果を示します。

## 実測: 何が自動で、何が手動か

新規インストール相当の状態（`auto_update_core_*` の行を消し、
`AUTOMATIC_UPDATER_DISABLED` などの定数も外した状態）で、
WordPress 自身の判定（`WP_Automatic_Updater::should_update()`）を測りました。

| 対象 | 自動で更新するか |
|---|---|
| 本体のマイナー更新（7.1 → 7.1.1） | **する** |
| 本体のメジャー更新（7.1 → 7.2） | **しない** |
| プラグイン | **しない**（1 つずつ有効にするまで） |
| テーマ | **しない**（同上） |

セキュリティ修正は多くがマイナー更新で配られるため、本体だけは放っておいても上がります。
**問題はプラグインです。**侵入経路として実際に使われるのはプラグインの既知の脆弱性で、
そこが既定では自動更新されません。

## プラグインは 1 つずつ有効にする必要がある

プラグイン一覧の右端に「自動更新」の列があり、そこから 1 つずつ有効にします。

![プラグイン一覧の「自動更新」列。既定ではすべて「自動更新を有効化」のまま](../screenshots/s/plugin-auto-update-column.jpg)

*6 つのうち、自動更新が有効なプラグインは 1 つもない状態*

有効にすると、その**プラグインのファイル名が `auto_update_plugins` に追加されます。**

```
有効化前: []
Hello Dolly の自動更新を有効化: ["hello.php"]
```

同じ状態で判定を測ると、こう変わりました。

| `auto_update_plugins` | `should_update("plugin")` |
|---|---|
| 空（既定） | **false** |
| `["hello.php"]` | **true** |

**プラグインを新しく入れたときは、そのつど自動更新を有効にしない限り対象になりません。**
「前に設定したから大丈夫」は成り立ちません。

## 「自動更新」の列が無いなら、設定で止められている

同じ画面でも、列そのものが出ないことがあります。

![同じプラグイン一覧。「自動更新」の列が消えている](../screenshots/s/plugin-auto-update-column-disabled.jpg)

*列が無いので、画面からは有効にできない*

実測では、`wp-config.php` に次の 1 行があるだけで列が消えました。

```php
define( 'AUTOMATIC_UPDATER_DISABLED', true );
```

| `wp-config.php` の定数 | プラグイン一覧の「自動更新」列 |
|---|---|
| 無し（既定） | **出る**（`自動更新を有効化` のリンクつき） |
| `AUTOMATIC_UPDATER_DISABLED = true` | **出ない** |

レンタルサーバーや制作会社が「更新で壊れないように」と入れていることがあります。
**列が無い状態は、自動更新が止まっているサインです。**
`DISALLOW_FILE_MODS`（ファイルの変更を禁止する定数）でも同じように消えます。

判定に使う関数を間違えないでください。

```php
// これは plugin と theme しか扱わない。core を渡すと常に false が返る
wp_is_auto_update_enabled_for_type( 'core' );
```

本体の判定は `WP_Automatic_Updater::should_update()` で測ります。

## 自動更新はいつ走るのか

更新の確認は WP-Cron の定期処理です。実測した登録状況です。

| イベント | 間隔 |
|---|---|
| `wp_version_check`（本体） | `twicedaily` = **12 時間** |
| `wp_update_plugins`（プラグイン） | `twicedaily` = **12 時間** |
| `wp_update_themes`（テーマ） | `twicedaily` = **12 時間** |

WP-Cron は**サイトへのアクセスをきっかけに動きます。**
アクセスが少ないサイトや、サイトが自分自身に接続できない環境では、
この確認自体が走りません。
→ [予約投稿されない](scheduled-post-missed.md)（同じループバックの問題）

## 運用で決めておくこと

- **プラグインを追加したら、その場で自動更新を有効にする。**設定は個別なので、あとでまとめてはできません
- **メジャー更新は人が判断する。**既定で自動にならないのは、壊れる可能性があるためです
- **「自動更新」の列があるか、月に一度は見る。**列が消えていたら止まっています
- **誰が更新したかは記録されません。**担当者と頻度を先に決めておきます
  → [誰が何を変えたか記録しない](no-audit-log.md)
- 更新で壊れたときに戻せるよう、バックアップの取り方を決めておきます
  → [プラグイン更新後に真っ白・不具合が出た時の対処法](plugin-conflict-diagnosis.md)

## 再現手順

```sh
# 既定の判定を測る（wp-config.php の AUTOMATIC_UPDATER_DISABLED などは外した状態で）
wp eval '
require_once ABSPATH . "wp-admin/includes/class-wp-upgrader.php";
$u = new WP_Automatic_Updater();
$core = fn($v, $new) => (object) ["response" => "upgrade", "current" => $v, "new_files" => $new,
  "locale" => "ja", "packages" => (object) ["full" => "https://example.com/wp.zip"],
  "php_version" => "7.2.24", "mysql_version" => "5.5.5", "download" => "https://example.com/wp.zip"];
printf("マイナー: %s\n", var_export($u->should_update("core", $core("7.1.1", false), ABSPATH), true));
printf("メジャー: %s\n", var_export($u->should_update("core", $core("7.2", true), ABSPATH), true));'

# プラグインの自動更新の保存値
wp eval '
$plugin = (object) ["id" => "w.org/plugins/hello-dolly", "slug" => "hello-dolly",
  "plugin" => "hello.php", "new_version" => "1.7.3"];
require_once ABSPATH . "wp-admin/includes/class-wp-upgrader.php";
$u = new WP_Automatic_Updater();
printf("未設定: %s\n", var_export($u->should_update("plugin", $plugin, ABSPATH), true));
update_site_option("auto_update_plugins", ["hello.php"]);
printf("有効化: %s\n", var_export($u->should_update("plugin", $plugin, ABSPATH), true));
delete_site_option("auto_update_plugins");'

# 更新確認の間隔
wp eval '
foreach (["wp_version_check", "wp_update_plugins", "wp_update_themes"] as $h) {
  printf("%-20s %s\n", $h, wp_get_schedule($h) ?: "未登録");
}'
```

**測るときは、この環境固有の設定を外してから測ります。**
`wp-config.php` の定数だけでなく、データベースに保存された
`auto_update_core_major` / `_minor` / `_dev` も判定に効きます
（新規インストールにはこの行がありません）。
