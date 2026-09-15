---
title: "WordPressで画像が表示されない時の対処法（アップロードは成功している）"
slug: images-not-displaying
seo_title: "WordPress 画像が表示されない・表示できない時の直し方"
description: "アップロードは成功したのに画像が表示されない・壊れたアイコンになる時の対処法。404か403かで原因が割れる（ファイル欠け/権限）。メディアライブラリに並んでいても実ファイルが無いことがある実測。"
keywords: "WordPress 画像 表示されない, 画像 表示できない, 画像 壊れる, サムネイル 表示されない, アイキャッチ 表示されない, 画像 バツ印"
category: 障害報告
tags: [wordpress, 画像, uploads, 移行, パーミッション]
status: draft
verified: 2026-09-12
---

メディアライブラリには画像が並んでいる。でも記事に貼ると表示されない。
管理画面のサムネイルも壊れたアイコンになっている。

**アップロードは成功しているのに表示されない**場合、
「ファイルが無い」か「URL が違う」か「読めない」のどれかです。
実測して切り分け方をまとめました。

## 実測: 画像が無いと 404 で 20KB の HTML が返る

存在しない画像の URL を直接叩いた結果です。

```
HTTP/1.1 404 Not Found
Content-Type: text/html
20,737 bytes
```

**画像を頼んだのに、20KB の HTML（WordPress の 404 ページ）が返ります。**

`.htaccess`（nginx なら `try_files`）が、存在しないファイルへのリクエストを
`index.php` に流すためです。

ここから 2 つのことが言えます。

- **開発者ツールで「20KB 転送された」と見えても中身は画像ではありません。**
  サイズだけ見て「読めている」と判断すると外します
- **欠けている画像 1 枚ごとに WordPress のフルページ生成が走ります。**
  画像が 50 枚欠けたページを開くと、1 回の表示で 50 回 WordPress が起動します。
  表示の問題であると同時に、サーバー負荷の問題です

なお、**WordPress 側の添付データは残ります。**実測では実ファイルを消しても
添付の投稿ステータスは `inherit` のままでした。
**メディアライブラリに並んでいることは、ファイルが存在する証拠になりません。**

![画像が壊れたアイコンになっている](../screenshots/c/image-broken.jpg)

*記事は正常に表示され、画像の位置に alt 文字列だけが残る*

## 原因 1: ファイルを移行していない（最多）

サーバー移行で**データベースだけ移して `wp-content/uploads` を忘れる**、
あるいは容量が大きいので後回しにして忘れる、というパターンです。

症状の特徴は **全部の画像が一律に表示されない**ことです。

```sh
# 記事中の画像 URL を 1 つ取って直接叩く
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://example.com/wp-content/uploads/2026/09/sample.png"
```

404 なら、サーバー上の実ファイルを探します。

```sh
ls -la wp-content/uploads/2026/09/
```

**ディレクトリごと無い**なら移行漏れです。

## 原因 2: URL が違う（移行・SSL 化の直後）

ファイルはあるのに URL が別のドメインやスキームを指している場合です。
開発者ツールで**リクエスト先のドメイン**を見ると分かります。

WordPress が画像 URL を組み立てる元になる値を確認します。

```sh
wp eval '$d = wp_upload_dir(); echo "basedir=", $d["basedir"], "\nbaseurl=", $d["baseurl"], "\n";'
```

実測環境の値です。

```
basedir=/var/www/html/wp-content/uploads
baseurl=http://localhost:8080/wp-content/uploads
```

**`baseurl` が実際のアクセス先と違っていたら、そこが原因です。**

`baseurl` はサイト URL から作られます。そしてサイト URL は
**`wp-config.php` の定数がデータベースより優先されます。**

```php
define( 'WP_HOME', 'http://old-domain.example' );   // これが残っていると DB を直しても変わらない
define( 'WP_SITEURL', 'http://old-domain.example' );
```

実測でも、DB を `127.0.0.1` に書き換えても実効値は定数の `localhost` のままでした。
**「phpMyAdmin で URL を直したのに画像が古いドメインを向いている」**の正体です。

記事本文に埋め込まれた URL も置換が必要です。

```sh
wp search-replace 'http://old-domain.example' 'https://new-domain.example' \
  --all-tables --skip-columns=guid
```

→ 詳細は [SSL 化したら画像・CSS が読み込めない](ssl-mixed-content.md)

## 原因 3: 読めない（パーミッション）

ファイルはあり URL も正しいが、Web サーバーが読めない場合です。
**403** が返ります（404 ではありません）。

```
ディレクトリ  755
ファイル      644
```

移行時に `tar` や FTP で権限が変わると起きます。
**403 が返っていたらパーミッション、404 ならファイルが無い**、
と覚えると速いです。

## 原因 4: サムネイルだけ無い

元画像は表示されるが、一覧やアイキャッチだけ壊れている場合です。

WordPress はアップロード時に複数のサイズを生成し、
`sample-150x150.png` のような別ファイルとして保存します。
**移行でこれらが欠けると、サムネイルだけ 404 になります。**

元画像があるなら再生成できます。

```sh
wp media regenerate --yes
```

サムネイルが**一度も生成されていない**場合は、
画像処理の拡張（GD / Imagick）が無いか、リサイズ中にメモリ不足で
失敗しています。→ [画像をアップロードできない](media-upload-failure.md)

## 原因 5: 混在コンテンツ

https のページから http の画像を読むと、ブラウザがブロックします。
**ステータスは 200 なのに表示されません。**

コンソールに `Mixed Content: ... was blocked` が出ます。
→ [SSL 化したら画像・CSS が読み込めない](ssl-mixed-content.md)

## 切り分けの順番

ステータスコードだけで 3 つに割れます。

```sh
curl -s -o /dev/null -w '%{http_code}\n' "https://example.com/wp-content/uploads/2026/09/sample.png"
```

| 結果 | 原因 |
|---|---|
| **404** | ファイルが無い（移行漏れ、削除、サムネイル未生成） |
| **403** | パーミッション |
| **200 なのに表示されない** | 混在コンテンツ、または中身が壊れている |
| **別のドメインにリクエストが飛んでいる** | URL の設定（定数・DB・本文） |

`bin/diagnose.sh` はページ内の画像も取得してステータスを数えるので、
**どの画像が欠けているかを一覧で出せます。**

```
  アセット 12 件: 200=9 404=3
  !! 404 [img] https://example.com/wp-content/uploads/2026/09/a.jpg
```

## 再現手順

```sh
# 画像を置いて、消して、レスポンスを比べる
python3 -c "
import base64, pathlib
pathlib.Path('src/wp-content/uploads/2026/09/t.png').write_bytes(
  base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='))"

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/wp-content/uploads/2026/09/t.png   # 200
rm src/wp-content/uploads/2026/09/t.png
curl -s -o /dev/null -D - http://localhost:8080/wp-content/uploads/2026/09/t.png | head -3
# → 404 / Content-Type: text/html / 20KB
```
