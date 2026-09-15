---
title: "WordPressが乗っ取られた・改ざんされた時の確認と対処法"
slug: compromised-db-side
seo_title: "WordPress 乗っ取り・改ざん｜確認方法と復旧手順"
description: "知らない管理者がいる・スパムリンクが埋め込まれた等、乗っ取り・改ざんの確認と対処法。ファイル検査では見つからないDB側の痕跡（管理者追加・本文注入）の探し方と、認証キー再生成を含む初動を実測。"
keywords: "WordPress 乗っ取り, WordPress 改ざん, 知らない管理者, スパムリンク 埋め込み, マルウェア 除去, ハッキング 復旧, 不正ログイン"
category: 障害報告
tags: [wordpress, セキュリティ, 改ざん, 侵害, データベース]
status: draft
verified: 2026-09-12
---

知らない管理者ユーザーがいる。記事に見覚えのないリンクが入っている。
検索結果に自分のサイトが変な文字列で出ている。

**ファイルの改ざんチェックだけでは足りません。**
`wp core verify-checksums` や git の差分で見られるのはファイルだけで、
**データベースに書き込まれた痕跡は 1 件も見つかりません。**

実際に痕跡を作って、DB 側の検知方法を確立しました。

## ファイル側の検査では見つからない

前提として、ファイル側の検査には別記事で測った通り 3 つの穴があります。
→ [verify-checksums が Success でも改ざんは見つかっていない](verify-checksums-blind-spots.md)

そのうえで、**次の 3 つはファイルを 1 バイトも変えません。**

- 管理者ユーザーの追加
- 記事本文へのリンク・スクリプトの挿入
- オプション（設定値）へのコード挿入

**ファイルの検査が全部 Success でも、これらは残っています。**

## 検知 1: 管理者ユーザーの棚卸し

いちばん先に見るところです。

```sql
SELECT u.ID, u.user_login, u.user_email, u.user_registered
FROM wp_users u
JOIN wp_usermeta m ON m.user_id = u.ID
WHERE m.meta_key = 'wp_capabilities'
  AND m.meta_value LIKE '%administrator%'
ORDER BY u.user_registered DESC;
```

実測した出力です（`lab_intruder` が仕込んだもの）。

```
ID  user_login     user_email            user_registered
6   lab_intruder   intruder@lab.local    2026-09-12 11:38:55
1   admin          admin@example.com     2026-09-11 14:32:45
```

**登録日で並べるのが要点です。**最近登録された管理者が心当たりのないものなら、
そこが侵入点です。

WP-CLI でも同じことができます。

```sh
wp user list --role=administrator --fields=ID,user_login,user_registered
```

**両方で突き合わせてください。**プラグインがユーザー一覧を
フィルタで隠している場合、WP-CLI（WordPress 経由）では見えず、
**SQL でだけ見える**ことがあります。逆に権限の付け方が変則的だと
SQL の条件に引っかからないこともあります。

### 見るべき他の項目

```sql
-- 誰でも登録できる状態になっていないか
SELECT option_name, option_value FROM wp_options
WHERE option_name IN ('users_can_register', 'default_role', 'admin_email');
```

`users_can_register = 1` かつ `default_role = administrator` は、
**誰でも管理者になれる状態**です。サイトヘルスもこれを検査しています。

`admin_email` が書き換えられていると、
**パスワード再設定のメールが攻撃者に届きます。**必ず確認します。

## 検知 2: 記事本文への挿入

```sql
SELECT ID, post_type, post_status, post_modified FROM wp_posts
WHERE post_content REGEXP '<script|<iframe|base64_decode|eval\\(|display:\\s*none'
LIMIT 20;
```

隠しリンクは `display:none` や画面外への移動で仕込まれるため、
**スクリプトタグだけを探すのでは足りません。**

特定のドメインで探すほうが確実な場合もあります。

```sql
SELECT ID, post_title FROM wp_posts WHERE post_content LIKE '%不審なドメイン%';
```

## 重要: 更新日は当てにならない

これが実測でいちばん有用だった点です。

**攻撃者が SQL で直接書き換えた場合、`post_modified` は変わりません。**

投稿本文に文字列を追加した直後の値です。

```
ID  post_date              post_modified          判定
1   2026-09-11 23:32:45    2026-09-11 23:32:45    同じ
```

**本文は変わっているのに、更新日は元のままです。**

WordPress の管理画面や REST API 経由で編集すれば `post_modified` が更新されますが、
**DB を直接叩かれた場合は痕跡が残りません。**

つまり:

- 「更新日が最近の投稿を調べる」は**侵害調査の手段として不完全**です
- 逆に**更新日が新しい投稿が並んでいたら、WordPress 経由で操作された**
  （盗まれた管理者アカウントが使われた）可能性が高い、という情報になります

## 検知 3: オプションへの挿入

```sql
SELECT option_name, LEFT(option_value, 80), autoload FROM wp_options
WHERE option_value REGEXP '<script|<iframe|base64_decode|eval\\(';
```

実測すると、仕込んだものと一緒に**偽陽性**が出ました。

```
option_name                              先頭
_site_transient_feed_992efac...          a:6:{s:5:"child";...   ← 偽陽性
lab_marker_injected                      <script>/*...*/</script>  ← 本物
```

**`_transient_` や `_site_transient_` で始まるものは、
外部から取得した RSS などのキャッシュ**です。中に `<script` が
含まれていても正常です。

除外して検索します。

```sql
SELECT option_name, LEFT(option_value, 80) FROM wp_options
WHERE option_value REGEXP '<script|<iframe|base64_decode|eval\\('
  AND option_name NOT LIKE '%transient%';
```

**`autoload` が `on` のものは全ページで読み込まれます。**
そこにコードが入っていると、サイト全体に影響します。
まずここを見ます。

## 検知 4: その他の置き場所

挿入先は本文とオプションだけではありません。

```sql
-- ウィジェット(オプションに入っている)
SELECT option_name FROM wp_options WHERE option_name LIKE 'widget_%';

-- カスタムフィールド
SELECT post_id, meta_key, LEFT(meta_value, 60) FROM wp_postmeta
WHERE meta_value REGEXP '<script|<iframe|base64_decode' LIMIT 20;

-- ユーザーのプロフィール(表示名や自己紹介にリンクを仕込む手口)
SELECT user_id, meta_key, LEFT(meta_value, 60) FROM wp_usermeta
WHERE meta_value REGEXP '<a |<script|http' AND meta_key IN ('description','first_name','last_name') LIMIT 20;

-- コメント
SELECT comment_ID, comment_author, LEFT(comment_content, 60) FROM wp_comments
WHERE comment_approved = '1' AND comment_content REGEXP '<script|<iframe' LIMIT 20;

-- 予約された処理(バックドアの再設置に使われる)
SELECT option_value FROM wp_options WHERE option_name = 'cron';
```

**`cron` オプションは必ず見てください。**
定期処理として「ファイルを再設置する」処理が登録されていると、
ファイルを消しても復活します。

```sh
wp cron event list
```

見覚えのないフック名があれば、それがバックドアです。

## 侵害が確認できたときの初動

**ファイルを消して終わりにしないこと。**
盗まれた認証情報とセッションが残っていると、すぐ再侵入されます。

### 1. 認証キーを再生成する

`wp-config.php` には 8 つの認証キーが定義されています（実測で確認）。

```php
define( 'AUTH_KEY', '...' );
define( 'SECURE_AUTH_KEY', '...' );
define( 'LOGGED_IN_KEY', '...' );
define( 'NONCE_KEY', '...' );
define( 'AUTH_SALT', '...' );
define( 'SECURE_AUTH_SALT', '...' );
define( 'LOGGED_IN_SALT', '...' );
define( 'NONCE_SALT', '...' );
```

**これを作り直すと、発行済みのログイン Cookie が全部無効になります。**
[WordPress の生成ツール](https://api.wordpress.org/secret-key/1.1/salt/)の
出力で 8 行を置き換えます。

**パスワードだけ変えても、盗まれた Cookie は使えたままです。**
ここを飛ばすと再侵入されます。

### 2. セッションを明示的に破棄する

ログインセッションは DB に記録されています（実測）。

```sql
SELECT user_id, meta_key FROM wp_usermeta WHERE meta_key = 'session_tokens';
```

```sh
wp user session destroy --all --all-users
```

### 3. 全ユーザーのパスワードを変更する

とくに管理者と編集者。**再設定メールは `admin_email` に届く**ので、
その値が正しいことを先に確認します。

### 4. 不正なユーザーを削除する

```sh
wp user delete <ID> --reassign=<正当なユーザーID>
```

**`--reassign` を付けないと、そのユーザーの投稿も消えます。**

### 5. ファイル側も確認する

```sh
bin/verify.sh          # コア・プラグイン・git の 3 層
wp cron event list     # 再設置の仕込み
```

→ [verify-checksums だけでは足りない](verify-checksums-blind-spots.md)

### 6. 侵入経路を塞ぐ

痕跡を消しても経路が残っていれば再発します。

| 確認する場所 | 何を見るか |
|---|---|
| アクセスログ | 不正ログインの成功、`wp-login.php` への大量アクセス、見覚えのない POST |
| PHP / WordPress のログ | 侵害の前後のエラー |
| プラグイン・テーマ | 古いバージョン、公式以外から入れたもの |
| `wp-config.php` のバックアップ | **`.bak` などが公開領域に残っていないか**（実測で全文露出を確認） |

最後の項目は見落としやすいところです。
→ [設定ファイルは漏れるのか](config-file-exposure.md)

## 棚卸しをまとめて実行する

```sql
-- 管理者
SELECT u.user_login, u.user_email, u.user_registered FROM wp_users u
JOIN wp_usermeta m ON m.user_id=u.ID
WHERE m.meta_key='wp_capabilities' AND m.meta_value LIKE '%administrator%'
ORDER BY u.user_registered DESC;

-- 登録設定
SELECT option_name, option_value FROM wp_options
WHERE option_name IN ('users_can_register','default_role','admin_email','siteurl','home');

-- 本文・メタ・オプションへの挿入(transient は除外)
SELECT 'posts' AS 場所, COUNT(*) FROM wp_posts
  WHERE post_content REGEXP '<script|<iframe|base64_decode|eval\\('
UNION ALL SELECT 'postmeta', COUNT(*) FROM wp_postmeta
  WHERE meta_value REGEXP '<script|<iframe|base64_decode'
UNION ALL SELECT 'options', COUNT(*) FROM wp_options
  WHERE option_value REGEXP '<script|<iframe|base64_decode|eval\\('
  AND option_name NOT LIKE '%transient%';
```

**この 3 本を定期的に走らせて件数を記録しておくと、
「増えた」で気づけます。**0 件であることを知っていれば、
1 件出た時点で異常だと分かります。

## 再現手順

```sql
-- 痕跡を作る(無害なマーカーのみ)
INSERT INTO wp_users (user_login, user_pass, user_nicename, user_email, user_registered, user_status, display_name)
VALUES ('lab_intruder', 'MARKER', 'lab-intruder', 'intruder@lab.local', NOW(), 0, 'lab');
SET @uid = LAST_INSERT_ID();
INSERT INTO wp_usermeta (user_id, meta_key, meta_value)
VALUES (@uid, 'wp_capabilities', 'a:1:{s:13:"administrator";b:1;}');

UPDATE wp_posts SET post_content = CONCAT(post_content, '<a href="http://marker.invalid/">X</a>')
WHERE ID = 1;

INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('marker_injected', '<script>/*X*/</script>', 'on');

-- post_modified が変わっていないことを確認する
SELECT ID, post_date, post_modified FROM wp_posts WHERE ID = 1;
```
