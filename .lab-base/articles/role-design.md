---
title: "WordPressのユーザー権限をどう割り当てるか — ロール別の実測"
slug: role-design
seo_title: "WordPress ユーザー権限の割り当て｜ロール別の実測"
description: "管理者・編集者・投稿者・寄稿者で何ができるかを実測。管理者だけが持つ権限は27個あり、編集者はプラグインもテーマも設定も触れません。全員を管理者にしないための判断材料をまとめます。"
keywords: "WordPress 権限 割り当て, WordPress ユーザー 権限, WordPress ロール 違い, 編集者 権限, WordPress 管理者 権限, 権限 設計"
category: 技術メモ
tags: [wordpress, 権限, ロール, 運用, セキュリティ]
status: draft
verified: 2026-09-17
---

社内で WordPress を使うとき、**全員を管理者にしているサイトは珍しくありません。**
「権限で困ると面倒だから」という理由ですが、実際に何が変わるのかを測りました。

## 実測: ロールごとにできること

既定の 5 つのロールが持つ権限の数と、企業で問題になりやすい権限の有無です。

| ロール | 権限の数 | プラグイン操作 | テーマ編集 | 設定変更 | ユーザー管理 | 他人の投稿を編集 | 公開 | 画像の追加 |
|---|---|---|---|---|---|---|---|---|
| 管理者 | **61** | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 編集者 | **34** | × | × | × | × | ○ | ○ | ○ |
| 投稿者 | **10** | × | × | × | × | × | ○ | ○ |
| 寄稿者 | **5** | × | × | × | × | × | × | **×** |
| 購読者 | **2** | × | × | × | × | × | × | × |

**寄稿者は画像を追加できません。**これは権限不足のエラーが出ずに、
画面から機能が消えるだけなので、使う人は「壊れている」と感じます。
→ [「このページにアクセスする権限がありません」の対処法](wp-admin-403-capability.md)

## 管理者だけが持つ権限は 27 個

管理者と編集者の差分を取りました。

```
switch_themes, edit_themes, activate_plugins, edit_plugins, edit_users, edit_files,
manage_options, import, level_10, level_9, level_8, delete_users, create_users,
unfiltered_upload, edit_dashboard, update_plugins, delete_plugins, install_plugins,
update_themes, install_themes, update_core, list_users, remove_users, promote_users,
edit_theme_options, delete_themes, export
```

サイトを壊せる操作と、他人のアカウントを触れる操作が、ここに集まっています。

- `edit_plugins` / `edit_themes` … 管理画面からコードを書き換えられる（サイトが落ちる）
- `install_plugins` … 外部から持ってきたコードを入れられる
- `promote_users` / `create_users` … 自分以外を管理者にできる
- `export` … 記事とユーザー情報を丸ごと書き出せる

**編集者はこの 27 個をすべて持っていません。**記事の運用だけなら編集者で足ります。

## 画面の違い

管理者と編集者で、同じ管理画面を開いたときのメニューです。

![管理者のダッシュボード。外観・プラグイン・ユーザー・設定が並ぶ](../screenshots/s/admin-menu-administrator.jpg)

*管理者のメニューは 10 項目*

![編集者のダッシュボード。外観・プラグイン・ユーザー・設定が無い](../screenshots/s/admin-menu-editor.jpg)

*編集者は 7 項目。「ユーザー」は「プロフィール」に変わる*

| | 管理者 | 編集者 |
|---|---|---|
| メニューの数 | 10 | **7** |
| 外観 | ある | **無い** |
| プラグイン | ある | **無い** |
| ユーザー | ある | **プロフィールのみ** |
| 設定 | ある | **無い** |

**編集者は設定画面に入れないので、サイト URL やパーマリンクを壊せません。**
逆に言えば、管理者を配ると全員がそれを壊せる状態になります。

## 割り当ての目安

実測した権限の差から言えることです。

| 担当 | 割り当て | 理由 |
|---|---|---|
| 記事を書いて公開する人 | **編集者** | 他人の記事も直せる。設定とプラグインは触れない |
| 記事を書くだけの人 | 投稿者 | 自分の記事だけ公開できる |
| 外部のライター | 寄稿者 | 公開できない（レビューを通す）。ただし**画像も追加できない** |
| サイトを保守する人 | 管理者 | 更新とプラグインの操作に必要 |
| 見るだけの人 | 購読者 | 権限は 2 個だけ |

管理者は**保守の担当者だけ**にします。人数を絞ると、後述のとおり調査もしやすくなります。

## 権限を絞ってもコードは書き換えられる

編集者に落としても、管理者アカウントが 1 つ乗っ取られれば同じです。
管理画面からコードを編集させない設定を入れておきます。

```php
// wp-config.php
define( 'DISALLOW_FILE_EDIT', true );
```

これで「外観 > テーマファイルエディター」と「プラグインファイルエディター」が消えます。
コードの変更はファイル経由（FTP・デプロイ）に限られるので、
**乗っ取られたときに管理画面だけで完結する攻撃を防げます。**

## 誰がいつ権限を変えたかは残らない

権限を設計しても、**運用の記録は残りません。**
誰かを管理者に昇格させても、その操作はどこにも記録されません。
定期的に棚卸しする以外に方法がありません。

```sh
# 管理者の一覧（登録日つき）
wp user list --role=administrator --fields=ID,user_login,user_email,user_registered

# あるユーザーが実際に持っている権限
wp user list-caps <ユーザー名>
```

→ [誰が何を変えたか記録しない](no-audit-log.md)
→ [乗っ取られた・改ざんされた時の確認と対処法](compromised-db-side.md)

## 再現手順

```sh
# ロールごとの権限数と、特定の権限の有無
wp eval '
$caps = ["activate_plugins", "edit_themes", "manage_options", "edit_users",
  "edit_others_posts", "publish_posts", "upload_files"];
foreach (["administrator", "editor", "author", "contributor", "subscriber"] as $r) {
  $role = get_role($r);
  printf("%-14s %2d  %s\n", $r, count(array_filter($role->capabilities)),
    implode(" ", array_map(fn($c) => empty($role->capabilities[$c]) ? "×" : "○", $caps)));
}'

# 管理者だけが持つ権限
wp eval '
$a = array_keys(array_filter(get_role("administrator")->capabilities));
$e = array_keys(array_filter(get_role("editor")->capabilities));
printf("%d 個: %s\n", count(array_diff($a, $e)), implode(", ", array_diff($a, $e)));'
```

管理画面の見え方は、対象のユーザーでログインして確認します。
権限の差は**エラーではなくメニューの有無**として現れるため、
画面を見比べるのがいちばん速い確認方法です。
