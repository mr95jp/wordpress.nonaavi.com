---
title: "WordPressのバックアップは何を取れば戻せるのか — 実測"
slug: backup-and-restore
seo_title: "WordPress バックアップ｜何を取れば戻せるか"
description: "標準のエクスポートで書き出せるのは投稿とユーザーだけで、プラグインも設定も含まれません。データベースだけ戻したときに何が消えるかを実測し、戻せるバックアップの最低条件をまとめます。"
keywords: "WordPress バックアップ, WordPress 復元, WordPress エクスポート, データベース バックアップ, WordPress 復旧, バックアップ 方法"
category: 技術メモ
tags: [wordpress, バックアップ, 復旧, 運用, データベース]
status: draft
verified: 2026-09-17
---

「バックアップは取っています」と言われて中身を見ると、
**管理画面の「エクスポート」で書き出した XML だけ**ということがあります。

それでは戻せません。何が含まれていて何が含まれていないのかを実測しました。

## 標準のエクスポートに含まれるもの・含まれないもの

「ツール > エクスポート」から書き出せる XML（WXR 形式）の中身を数えました。

![ツール > エクスポートの画面。選べるのは「すべてのコンテンツ」「投稿」「固定ページ」「メディア」](../screenshots/s/export-screen.jpg)

*画面の説明にも「投稿、固定ページ、コメント、カスタムフィールド、カテゴリー、タグ」とある*

| 項目 | 含まれるか |
|---|---|
| 投稿・固定ページ | **含む**（38 件） |
| ユーザー名 | **含む**（2 件） |
| パスワードのハッシュ | **含まない** |
| 有効なプラグインの一覧 | **含まない** |
| テーマの設定 | **含まない** |
| サイト名・サイト URL などの設定 | **含まない** |
| 画像の実体 | **含まない**（URL だけ） |

書き出したファイルは 58.7KB でした。**記事は入っていますが、サイトの形は入っていません。**
これだけを持っていても、同じサイトは作り直せません。

画像も含まれません。XML にあるのは元のサイトの URL だけなので、
**サーバー上の `wp-content/uploads` を別に持っていなければ画像は戻りません。**
→ [画像が表示されない](images-not-displaying.md)

## 戻すために必要なもの

WordPress のサイトは、次の 2 つがそろって初めて元に戻ります。

| | 中身 | 取り方 |
|---|---|---|
| **データベース** | 投稿・設定・ユーザー・プラグインの有効状態 | `mysqldump`、phpMyAdmin の書き出し、プラグイン |
| **ファイル** | テーマ・プラグイン・`wp-content/uploads`・`wp-config.php` | FTP、サーバーのバックアップ機能、プラグイン |

## 実測: データベースだけ戻すと何が起きるか

バックアップを取ったあとに変更を加え、**データベースだけ**を戻しました。

| | バックアップ時 | 変更後 | DB だけ復元した後 |
|---|---|---|---|
| 有効なプラグイン | `lab-triggers` のみ | `hello.php` を追加 | **`lab-triggers` のみに戻る** |
| サイト名 | `Error Lab (local)` | 変更した名前 | **元に戻る** |
| `hello.php` のファイル | ある | ある | **残ったまま** |

**データベースの内容は戻りますが、ファイルは戻りません。**
この例では「プラグインのファイルはあるのに、有効化の記録だけが消えた」状態になりました。
サイトは 200 で表示されますが、**バックアップを取った時点とは違う状態**です。

逆に、**ファイルだけ戻して DB を戻さない**と、DB には存在しないプラグインの記録が残ります。

## 存在しないプラグインの記録は自動で消えない

`active_plugins` に、実体の無いプラグインを入れた状態を作りました。

```
active_plugins: ["lab-triggers/lab-triggers.php","not-exists/not-exists.php"]
```

| 確認 | 結果 |
|---|---|
| サイトの表示 | **200**（壊れない） |
| ログイン画面 | **200** |
| フロントを読み込んだ後の `active_plugins` | **そのまま残る** |
| `validate_plugin()` の判定 | 「プラグインファイルが存在しません。」 |

**WordPress は無視するだけで、記録を消してくれません。**
移行や復元のあとに「有効なはずのプラグインが効いていない」ときは、
エラーが出ないので気づきにくいところです。

## 実測: バックアップと復元にかかる時間

検証環境（12 テーブル・1024KB）での計測です。

| 操作 | 時間 |
|---|---|
| データベースの書き出し（`mysqldump --single-transaction`） | **0.36〜0.39 秒**（3 回計測） |
| データベースの復元 | **0.77 秒** |
| gzip 圧縮後のサイズ | 1024KB → **149KB** |

小規模なサイトなら、データベースのバックアップは一瞬で終わります。
**「重いからやっていない」という理由は、少なくとも DB については成り立ちません。**

大きくなるのは `wp_options` です。この環境でも 1520KB あり、
テーブルの中で最大でした。肥大の原因と測り方は
→ [WordPress が重い](site-is-slow.md)

## 最低限の手順

```sh
# データベース（サーバーに SSH で入れる場合）
mysqldump --single-transaction --default-character-set=utf8mb4 \
  -u <ユーザー> -p <DB 名> > backup-$(date +%Y%m%d).sql
gzip backup-$(date +%Y%m%d).sql

# ファイル（wp-content だけでも、テーマ・プラグイン・画像は揃う）
tar czf wp-content-$(date +%Y%m%d).tar.gz wp-content/
```

`wp-config.php` は**別に保管**します。データベースの接続情報と認証キーが入っているため、
公開領域に置いたままにすると読まれる可能性があります。
→ [wp-config.php は漏れるのか](config-file-exposure.md)

バックアッププラグインで書き出したファイルも、**置き場所によっては外から取得できます。**
→ [All-in-One WP Migration のバックアップは外から取れる](ai1wm-backup-exposure.md)

## 戻せるかどうかは、戻してみないと分からない

バックアップを取っていても、**復元を試したことがなければ戻せる保証はありません。**
確認しておく項目です。

- データベースとファイルの**両方**が同じ時点のものか
- `wp-content/uploads` が含まれているか（画像が戻るか）
- 復元先で `wp-config.php` の接続情報を書き換える手順があるか
- 誰が復元するのか。**その人が手順を実行できるか**
  → [FTP と phpMyAdmin だけで復旧する方法](recovery-without-wp-cli.md)

なお、誰がいつバックアップを取ったかは WordPress に記録されません。
→ [誰が何を変えたか記録しない](no-audit-log.md)

## 再現手順

```sh
# 標準のエクスポートの中身を数える
wp export --dir=/tmp --filename_format=wxr.xml
grep -o "<item>" /tmp/wxr.xml | wc -l          # 投稿・固定ページ
grep -c "active_plugins" /tmp/wxr.xml          # 0（含まれない）
grep -c "blogname" /tmp/wxr.xml                # 0（含まれない）

# DB だけ戻したときの挙動
mysqldump --single-transaction -uwp -pwp wp_lab > /tmp/snap.sql
wp plugin activate hello
wp option update blogname "変更後の名前"
mysql -uwp -pwp wp_lab < /tmp/snap.sql
wp plugin list --status=active          # hello は消えている
ls wp-content/plugins/hello.php         # ファイルは残っている

# 存在しないプラグインの記録は消えない
wp eval 'update_option("active_plugins", array_merge(get_option("active_plugins"), ["not-exists/not-exists.php"]));'
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/   # 200
wp eval 'var_dump(get_option("active_plugins"));'                  # 残ったまま
```

**WP-CLI の `wp db export` は、環境によっては接続の TLS 検証で失敗します**
（`Certificate verification failure`）。その場合はデータベース側で直接
`mysqldump` を実行します。
