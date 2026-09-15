---
title: "FTPとphpMyAdminだけでWordPressを復旧する方法（WP-CLIが無いサーバー）"
slug: recovery-without-wp-cli
seo_title: "WordPress FTP・phpMyAdmin で復旧｜プラグイン停止・テーマを戻す手順"
description: "WordPressの管理画面に入れない・WP-CLIが無いレンタルサーバーでの復旧方法。プラグインやテーマのフォルダをFTPでリネームする、phpMyAdminでテーマを戻す等を実測。何ができて何ができないかを整理。"
keywords: "WordPress 管理画面 入れない 復旧, プラグイン 停止 FTP, phpMyAdmin テーマ 戻す, WP-CLI 無い, レンタルサーバー 復旧, active_plugins"
category: 障害報告
tags: [wordpress, 復旧, ftp, phpmyadmin, レンタルサーバー]
status: draft
verified: 2026-09-12
---

WordPress の復旧手順を調べると `wp plugin deactivate` のような WP-CLI のコマンドが
出てきます。しかし**共用レンタルサーバーには WP-CLI がありません。**
あるのは FTP（またはファイルマネージャ）と phpMyAdmin だけです。

その 2 つだけで何ができて、何ができないのかを実測しました。

## 一覧

| やりたいこと | 手段 | 結果 |
|---|---|---|
| プラグインを全部止める | `wp-content/plugins` をリネーム | サイトと管理画面が即復活。ただし**DB は変わらない** |
| 特定のプラグインを止める | そのフォルダだけリネーム | 復活し、**管理画面を開くと恒久的に無効化される** |
| テーマを戻す | テーマのフォルダをリネーム | フロントは**真っ白**になるが管理画面に入れる |
| テーマを戻す（DB 側） | phpMyAdmin で 2 行更新 | **即反映。ログイン不要** |
| メンテ表示を消す | `.maintenance` を削除 | 即復活 |
| サイト URL を直す | phpMyAdmin で `siteurl` / `home` | **効かない場合がある**（後述） |

## プラグイン: フォルダのリネームが効く

プラグイン同士が衝突して Fatal になり、サイトも管理画面も 500 だった状態から
計測しました。

### ディレクトリごとリネームした場合

`wp-content/plugins` を `plugins-off` にリネームします。

| | リネーム前 | リネーム後 |
|---|---|---|
| サイト | 500 | **200** |
| `/wp-admin/` | 500 | **302**（ログイン画面へ） |
| `/wp-login.php` | 500 | **200** |

即座に復活します。ただし **DB の `active_plugins` は一切変わっていません。**

```
a:3:{i:0;s:41:"lab-conflict-alpha/...";i:1;s:39:"lab-conflict-beta/...";...}
```

そのため**名前を戻すと、その瞬間に再び 500 に戻ります**（実測）。
これは復旧ではなく、**原因がプラグインにあると確定させるための手段**です。

### 特定のフォルダだけリネームした場合

こちらが本当の復旧手順です。原因のプラグインのフォルダだけリネームします。

サイトは 200、管理画面は 302 で入れるようになります。そして
**管理画面を開くと WordPress が自分で後始末をします。**

```
無効と判定: lab-conflict-beta/lab-conflict-beta.php / プラグインファイルが存在しません。
処理後の active_plugins:
  [0] => lab-conflict-alpha/lab-conflict-alpha.php
  [2] => lab-triggers/lab-triggers.php
```

WordPress は管理画面の読み込み時に、有効なプラグインのファイルが実在するかを
検査します（`validate_active_plugins()`）。無いものは `active_plugins` から外します。

つまり手順はこうなります。

1. 原因のプラグインのフォルダを `〜-off` にリネームする
2. **管理画面に一度ログインする**（ここで WordPress が無効化を確定させる）
3. フォルダ名を元に戻す

3 の後もそのプラグインは無効のままです（実測で確認）。
ファイルを消さずに済むので、あとで修正版を入れ直せます。

## テーマ: フロントは白くなるが管理画面には入れる

テーマの `functions.php` を壊して 500 にした状態から、テーマのフォルダを
リネームしました。プラグインとは挙動が違います。

| | 結果 |
|---|---|
| サイト | **200 だが本文 0 バイト（真っ白）** |
| `/wp-admin/` | **302**（ログイン画面へ） |

**フロントは白いままです。**プラグインのときのように「サイトが戻る」わけでは
ありません。しかし管理画面には入れるので、そこから先に進めます。

管理画面を読み込むと、WordPress が既定テーマへ切り替えます
（`validate_current_theme()`）。

```
template   = twentytwentyfive
stylesheet = twentytwentyfive
```

DB にも書き込まれるので、恒久的に切り替わります。

### phpMyAdmin なら 2 行更新で直る

管理画面にも入れない場合は、DB を直接触るほうが速いです。

```sql
UPDATE wp_options SET option_value = 'twentytwentyfive'
WHERE option_name IN ('template', 'stylesheet');
```

**ログイン不要で即反映されました**（実測）。
`template`（親テーマ）と `stylesheet`（適用テーマ）の**両方**を、
実在するテーマ名に揃えます。片方だけ変えると親子テーマ扱いになり、
意図しない見た目になります。

## 落とし穴: phpMyAdmin で siteurl を直しても効かないことがある

「サイト URL がおかしい」ときに `wp_options` の `siteurl` / `home` を
書き換える手順がよく紹介されます。しかし **`wp-config.php` に定数があると、
DB の値は無視されます。**

実測では、DB を書き換えても実効値が変わりませんでした。

| | 値 |
|---|---|
| DB の `siteurl` / `home` | `http://127.0.0.1:8080` |
| **実際に使われた値** | **`http://localhost:8080`** |

原因は `wp-config.php` の 2 行です。

```php
define( 'WP_HOME', 'http://localhost:8080' );
define( 'WP_SITEURL', 'http://localhost:8080' );
```

この定数があるときは、**管理画面の「設定 > 一般」でも URL の入力欄が
編集できなくなります。**「グレーアウトして直せない」「phpMyAdmin で直したのに
戻る」はこれが原因です。直す場所は `wp-config.php` です。

## .htaccess を直すときの注意

`.htaccess` に追記して復旧・対策しようとする場合、**書く位置で効くか効かないかが
変わります。**

WordPress が生成するブロックは、最後がこうなっています。

```apache
RewriteRule . /index.php [L]
```

`[L]` で書き換え処理が終わるため、**このブロックより後ろに足したリライト規則は
実行されません。**実測でも、`# BEGIN WordPress` より後に足したルールは
まったく効かず、前に移したら効きました。

追記するなら `# BEGIN WordPress` より前です。

## メンテナンス表示が消えないとき

`.maintenance` というファイルがサイトのルートにあると、
全ページが 503 になります。FTP で削除すれば即復活します。
詳しくは [メンテナンスモードが解除されない](maintenance-mode-stuck.md) に
まとめました。

## デバッグの有効化も FTP でできる

原因を見るには `wp-config.php` に 4 行足します。
**`WP_DEBUG_DISPLAY` を `false` にするのが重要です**（訪問者にエラーを
見せないため）。

```php
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
@ini_set( 'display_errors', 0 );
```

ログは `wp-content/debug.log` に出ます。FTP でダウンロードして見ます。

## 手順のまとめ

**サイトも管理画面も 500 のとき**

1. `wp-content/plugins` をリネーム → 直ったらプラグインが原因
2. 直らなければテーマのフォルダをリネーム → 管理画面に入れたらテーマが原因
3. どちらでもなければ `wp-config.php` に上のデバッグ設定を足して
   `debug.log` を見る

**原因が特定できたら**

- プラグイン → 該当フォルダだけリネームし、管理画面に一度入る
- テーマ → phpMyAdmin で `template` / `stylesheet` を既定テーマに更新

**やってはいけないこと**

- `plugins` ディレクトリのリネームで直ったからといって、そのまま名前を戻す
  （DB は変わっていないので即再発する）
- 原因のファイルを削除する（修正版に差し替えられなくなる）
