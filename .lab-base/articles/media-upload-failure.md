---
title: "WordPressで画像をアップロードできない・HTTPエラーの対処法"
slug: media-upload-failure
seo_title: "WordPress 画像 アップロードできない・HTTPエラーの直し方"
description: "WordPressで画像をアップロードできない・「HTTPエラー」が出る時の対処法。原因はサイズ超過2種類か年月ディレクトリの権限で、画面のメッセージから原因を引く。post_max_size超過は200のまま失敗する実測も。"
keywords: "WordPress 画像 アップロードできない, HTTPエラー 画像, メディア アップロードできない, 画像 追加できない, upload_max_filesize, post_max_size"
category: 障害報告
tags: [wordpress, メディア, アップロード, php, パーミッション]
status: draft
verified: 2026-09-12
---

画像をアップロードしようとすると失敗する。表示されるのは
「HTTP エラー」か「アップロードしたファイルをサーバーに保存できません」だけ。

**サイズの問題なのか、権限の問題なのか、画面からは分かりません。**
PHP の層で何が起きているかを実測すると、3 つに分かれました。

## 実測: サイズ超過は 2 種類ある

`upload_max_filesize = 1M` / `post_max_size = 2M` にして、
3 つのサイズのファイルを送りました。

| 送ったサイズ | `$_POST` | `$_FILES` | PHP のエラー |
|---|---|---|---|
| 500KB | 1 件 | 1 件 | `error=0`（正常） |
| 1.5MB | **1 件（残る）** | 1 件 | **`error=1` UPLOAD_ERR_INI_SIZE** |
| 3MB | **0 件（全消失）** | **0 件** | ログに `POST Content-Length … exceeds the limit` |

**この 2 つはまったく違う症状になります。**

### `upload_max_filesize` を超えた場合（1.5MB）

ファイルだけが失敗し、**フォームの他の入力は届いています。**
WordPress は「このファイルは許可されている容量を超えています」のような
サイズに言及したメッセージを出せます。**原因が分かる側**です。

### `post_max_size` を超えた場合（3MB）

**リクエスト全体が破棄されます。**`$_POST` も `$_FILES` も空で、
HTTP は **200** で返ります。

WordPress から見ると「何も送られてこなかった」のと同じなので、
**サイズに言及したメッセージすら出せません。**画面は「HTTP エラー」や
無反応になります。

PHP のエラーログにだけ記録が残ります。

```
PHP Warning:  POST Content-Length of 3072310 bytes exceeds the limit of 2097152 bytes
              in Unknown on line 0
```

これも `wp-content/debug.log` ではなく**サーバーの PHP エラーログ**です
（WordPress の起動前に出るため）。

### 実質の上限は小さいほう

`upload_max_filesize` を大きくしても `post_max_size` が小さければ、
そこで切られます。**両方を上げる必要があります。**
目安として `post_max_size` は `upload_max_filesize` より少し大きくします
（フォームの他の入力ぶんがあるため）。

```ini
upload_max_filesize = 64M
post_max_size = 68M
```

管理画面のメディア追加画面に表示される「最大アップロードサイズ」は、
この 2 つの小さいほうです。**表示値が思っているより小さいときは
`post_max_size` を見ます。**

## 実測: 権限は「月のディレクトリ」で決まる

「uploads の権限を 755 にする」という対処法が定番ですが、
**見る場所は `uploads` ではありません。**

`uploads` 自体を読み取り専用（555）にして試した結果です。

```
成功。attachment ID=44 が作られた
```

**通ってしまいました。**WordPress が書き込むのは `uploads/2026/09/` のような
年月のサブディレクトリで、それが既に存在していれば `uploads` 自体の権限は
関係ないためです。

次に、**年月のディレクトリ**を読み取り専用にしました。

```
Reason: アップロードしたファイルをwp-content/uploads/2026/09に移動できませんでした。
Error: No items imported.
```

管理画面の「メディアを追加」からアップロードしたときの画面です。

![アップロードしたファイルをwp-content/uploads/2026/09に移動できませんでした。](../screenshots/s/media-upload-move-failed.jpg)

**エラーメッセージにディレクトリのパスが入っています。**
これが出ているなら、見るのはそのパスです。

### ここから分かる厄介な挙動

**月が変わった瞬間にアップロードできなくなることがあります。**

- 今月のディレクトリは既にあり、書き込めている → 正常に見える
- 来月になると、WordPress は `uploads/2026/10/` を**新規作成**しようとする
- `uploads` 自体に書き込み権限が無いと、そこで初めて失敗する

「先月まで普通に使えていたのに、今月になって突然アップロードできない」は
この形です。**`uploads` とその下の年月ディレクトリの両方**を確認します。

## メッセージから原因を引く

| 画面に出るもの | 原因 |
|---|---|
| 「アップロードしたファイルを **wp-content/uploads/… に移動できませんでした**」 | そのディレクトリの書き込み権限 |
| 「このファイルは許可されている容量を超えています」 | `upload_max_filesize` |
| **「HTTP エラー」だけ、または無反応** | `post_max_size` 超過、REST API の遮断、メモリ不足 |
| 「このファイルタイプをアップロードする権限がありません」 | 許可されていない拡張子（サイズや権限ではない） |

最後の「ファイルタイプ」は紛らわしいメッセージです。**権限と書いてありますが、
ロールの権限ではなく拡張子の話**です。実測でも `.css` を取り込もうとして
これが出ました。

## 「HTTP エラー」の残り 2 つ

`post_max_size` 以外に「HTTP エラー」になる経路が 2 つあります。

**REST API が塞がれている**

アップロードは REST API 経由なので、`/wp-json` が遮断されていると失敗します。
この場合は記事の保存もできないので、症状で区別できます。
→ [「返答が正しい JSON レスポンスではありません」](rest-json-update-failed.md)

**画像のリサイズでメモリ不足**

アップロード自体は成功しても、サムネイル生成で `memory_limit` を超えると
Fatal になります。**大きい画像だけ失敗する**のが特徴です。
元画像は `uploads` に残っているのに管理画面に出てこない、という形になります。

## 切り分けの順番

1. **メッセージにパスが入っているか** — 入っていればそのディレクトリの権限
2. サーバーの PHP エラーログを見る — `POST Content-Length … exceeds` があれば `post_max_size`
3. **小さい画像なら通るか試す** — 通るならサイズ系、通らないなら権限か REST
4. 記事の保存もできないか試す — できないなら REST の遮断
5. 大きい画像だけ失敗するならメモリ不足

## 再現手順

```sh
# サイズ系: php.ini を下げて 3 段階を送る
# upload_max_filesize = 1M / post_max_size = 2M
docker compose restart php apache
curl -s -F "f=@small.bin"  http://localhost:8080/probe.php   # error=0
curl -s -F "f=@big.bin"    http://localhost:8080/probe.php   # error=1
curl -s -F "f=@huge.bin"   http://localhost:8080/probe.php   # $_POST が空
grep "POST Content-Length" logs/php/php_error.log

# 権限系: uploads 自体ではなく年月ディレクトリを読み取り専用にする
chmod 555 src/wp-content/uploads/2026/09
wp media import /path/to/image.png
# → アップロードしたファイルをwp-content/uploads/2026/09に移動できませんでした。
chmod 755 src/wp-content/uploads/2026/09
```
