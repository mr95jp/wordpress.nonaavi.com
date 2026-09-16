---
title: "wp-config.phpは漏れる？情報漏洩の確認と対策"
slug: config-file-exposure
seo_title: "wp-config.php 漏洩・情報漏洩｜確認方法と対策"
description: "wp-config.phpのパスワードが漏れるか実測。PHP停止でも本体は漏れないが、.bakや~などのバックアップファイルは全文露出することを確認。自分のサイトで確認する方法と対策を解説。"
keywords: "wp-config.php 漏洩, WordPress 情報漏洩, wp-config バックアップ 漏れる, .env 漏洩, パスワード 漏洩 確認, セキュリティ 確認"
category: 障害報告
tags: [wordpress, セキュリティ, wp-config, 情報漏洩, htaccess]
summary: |
  ・wp-config.php 本体は、PHP を止めてもソースが出なかった（0 バイトか応答なし）
  ・危険なのはバックアップ。wp-config.php.bak、wp-config.php~、.save、.txt、.inc は nginx でも Apache でも全文が返った
  ・.env は Apache で全文が返った（nginx は拒否した）
  ・退避ファイルは公開領域の外に置き、.htaccess で拡張子とドットファイルを拒否する
  ・漏れた疑いがあれば、DB のパスワードと認証キーを作り直す
status: published
published: 2026-09-16
verified: 2026-09-12
---

`wp-config.php` にはデータベースのパスワードと認証キーが平文で書かれています。
「PHP が停止したらソースが配信されて漏れるのではないか」という懸念をよく聞きます。

実測した結果、**その心配はほぼ不要で、代わりに別の経路が確実に漏れていました。**

## 実測 1: PHP が止まっても漏れない

`wp-config.php` を直接ブラウザから叩いた結果です。

| 状態 | nginx | Apache |
|---|---|---|
| 正常時 | 200 / **0 バイト** | 200 / **0 バイト** |
| PHP（fpm）を停止 | **接続不能**（応答なし） | 200 / **0 バイト** |

**どのケースでもソースは出てきませんでした。**

- 正常時は PHP として実行され、何も出力しないので 0 バイト
- nginx は PHP に渡せなければ 502 / 504 を返すだけで、ファイルを代わりに配信しない
- Apache は mod_php なので、PHP-FPM の停止とは無関係

**PHP ハンドラの設定が壊れれば理屈の上では起こり得ますが、
通常の構成では起きません。**心配する優先順位は低いです。

## 実測 2: バックアップファイルは全文が漏れる

危険なのはこちらでした。`wp-config.php` のコピーを置いて叩きました。
中には目印として `SECRET-DO-NOT-LEAK` と書いてあります。

| ファイル名 | nginx | Apache |
|---|---|---|
| `wp-config.php` | 露出なし | 露出なし |
| **`wp-config.php.bak`** | **★全文露出** | **★全文露出** |
| **`wp-config.php~`** | **★全文露出** | **★全文露出** |
| **`wp-config.php.save`** | **★全文露出** | **★全文露出** |
| **`wp-config.txt`** | **★全文露出** | **★全文露出** |
| **`wp-config.inc`** | **★全文露出** | **★全文露出** |

**5 種類すべて、両方のサーバーで、200 で全文が返りました。**

理由は単純です。**`.php` 以外の拡張子は PHP に渡されず、
静的ファイルとしてそのまま配信されます。**

### どうやってこのファイルができるのか

意図的に作らなくても、普通の作業で生まれます。

- **FTP クライアントやエディタが自動でバックアップを作る**
  （`~` は vi / nano、`.save` は nano、`.bak` は多くのエディタ）
- 「念のためコピーしておこう」と `wp-config.php.bak` を作る
- サーバー移行時にファイル名を変えて退避する
- 中身を確認するために `.txt` に変えてブラウザで開く

**最後のものは、確認のためにやった行為がそのまま漏洩になります。**

## 実測 3: ドットファイルはサーバー設定で結果が変わる

`.env` を置いて叩きました。

| ファイル | nginx | Apache |
|---|---|---|
| `.env` | **403**（拒否） | **★全文露出** |

nginx 側にはドットファイルを拒否する設定がありました。

```nginx
location ~ /\.(?!well-known) { deny all; }
```

**Apache の既定にはこの保護がありません。**
レンタルサーバーは基本 Apache なので、**`.env` や `.git` を置くと読める可能性があります。**

`.htaccess` 自体は Apache が保護しますが、それ以外のドットファイルは対象外です。

## 対策

### 1. バックアップファイルを Web 公開領域に置かない

いちばん効く対策です。退避するなら Web から見えない場所へ。

```sh
# 悪い: 同じディレクトリに残す
cp wp-config.php wp-config.php.bak

# 良い: 公開領域の外へ
cp wp-config.php ~/backup/wp-config.php.20260912
```

移行プラグインが書き出すバックアップも同じです。**中身はデータベース全体**で、
置き場所は公開領域です（実測しました）。
→ [All-in-One WP Migration の .wpress は未ログインで取得できる](ai1wm-backup-exposure.md)

### 2. サーバー設定で拡張子を塞ぐ

Apache（`.htaccess`）の場合です。**WordPress のブロックより前に書きます**
（後ろに書くとリライト規則が `[L]` で止まって到達しません）。

```apache
# wp-config.php 本体を直接叩かれないようにする
<Files "wp-config.php">
  Require all denied
</Files>

# バックアップ・退避ファイルを拒否する
<FilesMatch "\.(bak|save|old|orig|swp|swo|inc|txt~?)$|~$">
  Require all denied
</FilesMatch>

# ドットファイル(.env など)を拒否する
<FilesMatch "^\.">
  Require all denied
</FilesMatch>
```

nginx の場合です。

```nginx
location ~* \.(bak|save|old|orig|swp|swo|inc)$|~$ { deny all; }
location ~ /\.(?!well-known) { deny all; }
location = /wp-config.php { deny all; }
```

### 3. 漏れたら鍵を替える

漏洩が疑われる場合、ファイルを消すだけでは不十分です。

1. **データベースのパスワードを変更**し、`wp-config.php` を更新
2. **認証キーとソルト（8 個の `define`）を再生成**
   （[WordPress の生成ツール](https://api.wordpress.org/secret-key/1.1/salt/)で作り直す）
   → 全ユーザーのログインセッションが無効になり、Cookie の偽装ができなくなる
3. 管理者のパスワードを変更
4. 管理者ユーザーが増えていないか確認
   → [乗っ取られた・改ざんされた時の確認](compromised-db-side.md)

**認証キーの再生成を忘れると、パスワードだけ変えても
盗まれた Cookie でログインされ続けます。**

設定ファイル以外に外から見えている情報（ユーザー名やバージョン）の確認は
→ [攻撃者から何が見えているか](attack-surface-audit.md)

## 自分のサイトを確認する

```sh
for f in wp-config.php.bak "wp-config.php~" wp-config.php.save wp-config.txt \
         wp-config.php.old wp-config.inc .env .git/config; do
  printf "%-24s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' "https://example.com/$f")"
done
```

**403 か 404 以外が返ったら、その場で対処が必要です。**
200 が返るファイルは、検索エンジンやスキャナに既に見つかっている可能性があります。

## 再現手順

```sh
printf '<?php\ndefine( "DB_PASSWORD", "SECRET-DO-NOT-LEAK" );\n' > src/wp-config.php.bak
cp src/wp-config.php.bak "src/wp-config.php~"

curl -s http://localhost:8080/wp-config.php.bak    # 全文が返る
curl -s http://localhost:8082/wp-config.php.bak    # 全文が返る
curl -s http://localhost:8080/wp-config.php        # 0 バイト(安全)

rm -f src/wp-config.php.bak "src/wp-config.php~"
```
