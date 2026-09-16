---
title: "WordPressサイトが検索結果に出てこない・インデックスされない時の対処法"
slug: not-indexed-by-google
seo_title: "WordPress が検索に出てこない｜確認する順番"
description: "公開したのにGoogle検索に出てこない・インデックスされない時の対処法。原因の多くは「検索エンジンにインデックスさせない」設定。noindex・robots.txt・サイトマップを1分で確認する方法を実測で解説。"
keywords: "WordPress 検索に出てこない, Google インデックスされない, 検索結果 出ない, noindex 外し方, サイトマップ 404, 検索エンジン インデックス"
category: 技術メモ
tags: [wordpress, seo, noindex, robots, サイトマップ, インデックス]
summary: |
  原因の大半は「検索エンジンがサイトをインデックスしないようにする」のチェックです。設定 > 表示設定で外します。
  ・ページの HTML に noindex が出ている、サイトマップが 404 → このチェックが入っている
  ・robots.txt は変わらない（違いは Sitemap 行だけ）ので、robots.txt を見ても判断できない
  ・チェックを外しても noindex が消えない → SEO プラグインの設定か X-Robots-Tag ヘッダ
  ・設定が全部正しければ、Search Console の URL 検査でインデックス登録をリクエストする
status: published
published: 2026-09-16
verified: 2026-09-12
---

公開したのに検索結果に出てこない。サイト名で検索しても自分のサイトが出ない。

原因の大半は**設定が「検索エンジンに出さない」になっている**ことです。
そして**その設定は 3 箇所に分かれて現れます。**
どこを見れば分かるかを実測しました。

## 1 分で確認する

```sh
# 1. noindex が出ていないか(これが最重要)
curl -s https://example.com/ | grep -o "<meta name=['\"]robots['\"][^>]*"

# 2. robots.txt の中身
curl -s https://example.com/robots.txt

# 3. サイトマップが返るか
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/wp-sitemap.xml

# 4. canonical が自分を指しているか
curl -s https://example.com/ | grep -o "<link rel=['\"]canonical['\"][^>]*"
```

**1 で `noindex` が出ていたら、それが答えです。**他を見る必要はありません。

## 実測: 「インデックスさせない」設定の正体

WordPress の **設定 > 表示設定 > 検索エンジンがサイトをインデックスしないようにする**
のチェックボックス（`blog_public`）を切り替えて、出力を比較しました。

| | `blog_public = 0`（チェック有り） | `blog_public = 1`（通常） |
|---|---|---|
| `meta robots` | **`noindex, nofollow`** | `max-image-preview:large` |
| `/wp-sitemap.xml` | **404** | **200** |
| `robots.txt` | **変化なし** | `Sitemap:` 行が増える |

### 通説の訂正: robots.txt は変わらない

「インデックスさせない設定にすると `robots.txt` が `Disallow: /` になる」と
説明されていることがありますが、**現行の WordPress では変わりません。**
実測した全文です。

**`blog_public = 0`**

```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
```

**`blog_public = 1`**

```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: http://example.com/wp-sitemap.xml
```

**違いは `Sitemap:` の 1 行だけです。**

つまり:

- **`robots.txt` を見ても、この設定が有効かどうかは分かりません**
- クロールは禁止されていないので、**クローラは来ます**
- 止めているのは `<meta name="robots" content="noindex">` だけです

判定に使えるのは **`meta robots`** と **サイトマップが 404 かどうか**です。

### サイトマップが 404 なのは設定のせい

`/wp-sitemap.xml` が 404 なら、**まずこの設定を疑います。**
サーバー設定やパーマリンクの問題ではないことが多いです。

実測では、`blog_public` を 1 にした瞬間に 200 で返るようになりました。

## 直す場所

管理画面の **設定 > 表示設定** で、
「検索エンジンがサイトをインデックスしないようにする」の
**チェックを外します。**

コマンドでも変えられます。

```sh
wp option get blog_public      # 0 なら出さない設定
wp option update blog_public 1
```

**制作中にチェックを入れて、公開時に外し忘れる**のが定番の経路です。
公開直後は必ず確認します。

### サイトヘルスも教えてくれる

管理画面の **ツール > サイトヘルス** に、この項目が出ます（実測）。

```
search_engine_visibility  [recommended]
検索エンジンによるこのサイトのインデックス作成は推奨されていません。
```

**「推奨されていません」という表現なので見逃しやすい**のですが、
公開サイトでは致命的な設定です。
→ [サイトヘルスの「重大な問題」は何を見ているのか](site-health-reading.md)

## noindex は他からも出る

`blog_public` を 1 にしても `noindex` が消えない場合、別の出どころがあります。

| 出どころ | 確認方法 |
|---|---|
| **SEO プラグインの設定** | 投稿ごと・投稿タイプごとに `noindex` を設定できる。該当ページの設定を見る |
| **テーマが直接出力している** | `grep -rn "noindex" wp-content/themes/<テーマ>/` |
| **`X-Robots-Tag` ヘッダ** | `curl -s -o /dev/null -D - <URL> \| grep -i x-robots` |
| ステージング環境用のプラグイン | 環境判定で `noindex` を出すものがある |

**`X-Robots-Tag` は HTML を見ても分かりません。**ヘッダを確認します。
サーバー設定やホスティングのステージング機能で付与されることがあります。

```sh
curl -s -o /dev/null -D - https://example.com/ | grep -i x-robots
```

## robots.txt が 404 になる罠

**WordPress の `robots.txt` は実ファイルではなく動的に生成されます。**
そのため、サーバー設定で個別に扱われていると WordPress に到達しません。

実測で見つけた例です。

| URL | nginx | Apache |
|---|---|---|
| `/robots.txt` | **404** | **200** |

原因は nginx の設定でした。

```nginx
location = /robots.txt { log_not_found off; access_log off; }
```

このブロックには `try_files` も `fastcgi_pass` もありません。
**静的ファイルを探して、無ければ 404 で終わります。**
よく配られる設定例にそのまま入っている書き方です。

```nginx
# 直す
location = /robots.txt { try_files $uri /index.php?$args; access_log off; log_not_found off; }
```

**`robots.txt` が 404 の状態は「クロール禁止」ではありません**
（クローラは 404 を「制限なし」と解釈します）。ただし
`Sitemap:` 行も届かなくなります。

同じ理由で `/wp-sitemap.xml` が 404 になることもあります。
→ [RSS とサイトマップだけ壊れる](feed-sitemap-broken.md)

## canonical の確認

`canonical` が別の URL を指していると、**そのページは検索結果に出ません**
（指定先が評価されます）。

実測した正常な出力です。

```html
<link rel="canonical" href="http://example.com/2026/09/12/post-31/" />
```

**自分自身を指していれば正常です。**
移行直後に旧ドメインを指したままになっていることがあります。

```sh
curl -s https://example.com/some-post/ | grep -o "<link rel=['\"]canonical['\"][^>]*"
```

旧ドメインが出てきたら、データベースの置換が済んでいません。
→ [SSL 化したら画像・CSS が読み込めない](ssl-mixed-content.md)（置換の手順は同じ）

## 設定は正しいのに出ない場合

ここまで全部正常なら、WordPress 側の問題ではありません。

| 状況 | 見るところ |
|---|---|
| 公開してから数日以内 | **まだクロールされていないだけ。**Search Console で URL 検査 → インデックス登録をリクエスト |
| Search Console で「除外」と出る | 理由が表示される（重複、noindex、クロール済み未登録など） |
| `site:` 検索で 0 件 | インデックス自体が無い。サイトマップを送信する |
| 一部のページだけ出ない | 内容の薄さ、重複、正規化。個別の問題 |

**「出ない」と「順位が低い」は別問題です。**
`site:example.com` で 0 件ならインデックスされていない、
出てくるなら順位の話になります。

## 確認の順番

1. **`meta robots` を見る** → `noindex` があれば `blog_public` と
   SEO プラグインの設定
2. **サイトマップが 404 か** → 404 なら `blog_public` を疑う
3. `X-Robots-Tag` ヘッダを見る → HTML に無い `noindex` はここから来る
4. `canonical` が自分を指しているか
5. `robots.txt` が 200 で返るか（404 ならサーバー設定）
6. ここまで正常なら Search Console を見る

## 再現手順

```sh
# 設定を切り替えて出力を比べる
wp option update blog_public 0
curl -s http://localhost:8080/ | grep -o "<meta name='robots'[^>]*"
# → noindex, nofollow
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/wp-sitemap.xml
# → 404

wp option update blog_public 1
curl -s http://localhost:8080/ | grep -o "<meta name='robots'[^>]*"
# → max-image-preview:large
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/wp-sitemap.xml
# → 200

# robots.txt は両方で同じ(Sitemap 行の有無だけが違う)
curl -s http://localhost:8080/robots.txt
```
