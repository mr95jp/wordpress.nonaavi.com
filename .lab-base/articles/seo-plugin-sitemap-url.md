---
title: "SEO プラグインを入れるとサイトマップの URL が変わる — 404 の正体"
slug: seo-plugin-sitemap-url
seo_title: "SEOプラグイン サイトマップ 404｜URL が変わる"
description: "Yoast SEO を入れるとコアの /wp-sitemap.xml が 301 で /sitemap_index.xml に変わる。Search Console に送った URL が使えなくなる仕組みと、robots.txt から wp-admin の Disallow が消えることを実測。"
keywords: "サイトマップ 404, wp-sitemap.xml 404, sitemap_index.xml, Yoast サイトマップ, SEOプラグイン 2つ, canonical 重複, Search Console 読み取れませんでした"
category: 障害報告
tags: [wordpress, seo, サイトマップ, yoast, all-in-one-seo, robots]
status: draft
verified: 2026-09-24
---

Search Console が「サイトマップを読み取れませんでした」と言っている。
前は読めていたのに、心当たりは **SEO プラグインを入れたこと**だけ。

WordPress 本体のサイトマップと、SEO プラグインのサイトマップは **URL が違います。**
入れた瞬間に切り替わるため、**前に送信した URL は使えなくなります。**
Yoast SEO（28.5）と All in One SEO（5.0.1.1）で実測しました。

## 実測 1: 入れる前（WordPress 本体だけ）

| URL | 結果 |
|---|---|
| `/wp-sitemap.xml` | **200** |
| `/sitemap.xml` | 301 → `/wp-sitemap.xml` |
| `/sitemap_index.xml` | 404 |

![WordPress 本体のサイトマップ](../screenshots/p/sitemap-core-default.jpg)

*本体のサイトマップ。中身は 4 つの子サイトマップへのリンク*

`robots.txt` はこうなっています。

```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: http://example.com/wp-sitemap.xml
```

## 実測 2: Yoast SEO を入れた直後

**設定は何も変えていません。**有効化しただけです。

| URL | 入れる前 | 入れた後 |
|---|---|---|
| `/wp-sitemap.xml` | 200 | **301 → `/sitemap_index.xml`** |
| `/wp-sitemap-posts-post-1.xml` | 200 | **301 → `/post-sitemap.xml`** |
| `/sitemap_index.xml` | 404 | **200** |

![Yoast SEO のサイトマップ](../screenshots/p/sitemap-yoast-index.jpg)

*同じサイトのサイトマップ。URL も中身の構成も変わっている*

**本体のサイトマップは無効になり、古い URL は 301 で新しい URL に飛ばされます。**

ここが誤解しやすいところです。**301 で飛ぶなら大丈夫、ではありません。**

- Search Console に登録済みの `/wp-sitemap.xml` は、**その URL 自体としては 200 を返さなくなります**
- 送信済みのサイトマップが「取得できませんでした」「読み取れませんでした」になるのはこのためです
- **新しい URL（`/sitemap_index.xml`）を送信し直す必要があります**

### robots.txt が丸ごと置き換わる

これは気づきにくい変化です。実測した全文です。

```
# START YOAST BLOCK
# ---------------------------
User-agent: *
Disallow:

Sitemap: http://example.com/sitemap_index.xml
# ---------------------------
# END YOAST BLOCK
```

**`Disallow: /wp-admin/` と `Allow: /wp-admin/admin-ajax.php` が消えています。**
代わりに空の `Disallow:`（= 何も禁止しない）が入ります。

WordPress の `robots.txt` は実ファイルではなく動的生成なので、
**プラグインが内容を差し替えられます。**
「`robots.txt` を編集した覚えがないのに変わっている」はこれです。

### `noindex` 設定との関係も変わる

**設定 > 表示設定 >「検索エンジンがサイトをインデックスしないようにする」**を
入れた状態（`blog_public = 0`）で比べました。

| | 本体だけ | Yoast あり |
|---|---|---|
| サイトマップ | **404**（機能ごと無効） | **200 のまま** |
| 記事の `meta robots` | `noindex, nofollow` | `noindex, nofollow` |

**Yoast のサイトマップは、この設定では止まりません。**
「サイトマップは出ているから公開設定は大丈夫」と判断すると外します。
判定に使うのは `meta robots` です。
→ [検索結果に出てこない](not-indexed-by-google.md)

## 実測 3: 2 つ入れると重複する

Yoast を入れたまま All in One SEO も有効化しました。

| head に出た数 | Yoast だけ | 2 つとも |
|---|---|---|
| `rel="canonical"` | 1 | **2** |
| `og:title` | 1 | **2** |

```html
<link rel="canonical" href="http://example.com/2026/09/12/post-31/" />
<link rel="canonical" href="http://example.com/2026/09/12/post-31/" />
```

**同じ URL でも 2 本出ます。**どちらも `wp_head` に出力するためです。
値が食い違えば、検索エンジンはどちらを正規とみなすか選べません。

サイトマップの取り合いも起きました。

| URL | 2 つとも有効なとき |
|---|---|
| `/sitemap.xml` | **200**（All in One SEO） |
| `/sitemap_index.xml` | **302 → `/sitemap.xml`** |
| `/post-sitemap.xml` | 200（Yoast のものが残る） |

`robots.txt` には **Sitemap 行が 3 本**並びました。

```
Sitemap: http://example.com/sitemap.xml
Sitemap: http://example.com/sitemap.rss

# START YOAST BLOCK
...
Sitemap: http://example.com/sitemap_index.xml
# END YOAST BLOCK
```

**SEO プラグインは 1 つだけにします。**乗り換えるときは、
古いほうを止めてから新しいほうを入れます。

## 実測 4: 外すと今度は新しい URL が 404 になる

両方を削除したあとの状態です。

| URL | 結果 |
|---|---|
| `/wp-sitemap.xml` | **200**（本体が復活） |
| `/sitemap_index.xml` | **404** |

`robots.txt` も既定の内容に戻りました。

**プラグインを外したら、今度は `/sitemap_index.xml` が 404 です。**
Search Console にはそちらを登録してあるので、**また送信し直しになります。**

入れるときも外すときも、サイトマップの URL は変わる。
これが「Search Console のサイトマップが急に読めなくなる」の正体です。

## 確認の順番

```sh
# 1. どの URL が生きているか
for u in /wp-sitemap.xml /sitemap_index.xml /sitemap.xml; do
  printf '%-22s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "https://example.com$u")"
done

# 2. robots.txt が何を指しているか
curl -s https://example.com/robots.txt | grep -i sitemap

# 3. canonical が 2 本出ていないか
curl -s https://example.com/ | grep -c 'rel="canonical"'
```

| 観測 | 意味 |
|---|---|
| 送信済みの URL が 301 か 404 | SEO プラグインの導入・削除で URL が変わった。**送信し直す** |
| `robots.txt` の Sitemap 行が 2 本以上 | SEO プラグインが 2 つ動いている |
| `canonical` が 2 本 | 同上。1 つに絞る |
| サイトマップは 200 なのに検索に出ない | `meta robots` の `noindex` を見る |

**`robots.txt` の Sitemap 行が、そのサイトで有効なサイトマップです。**
まずそこを見れば、どの URL を送ればいいかが分かります。

## 再現手順

```sh
wp option update blog_public 1

# 入れる前
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/wp-sitemap.xml   # 200
curl -s http://localhost:8080/robots.txt

wp plugin install wordpress-seo --activate

# 入れた後(設定は触らない)
curl -s -o /dev/null -D - http://localhost:8080/wp-sitemap.xml | grep -iE '^HTTP|^location'
# → 301 / Location: http://localhost:8080/sitemap_index.xml
curl -s http://localhost:8080/robots.txt        # Disallow: /wp-admin/ が消える

# noindex 設定との関係
wp option update blog_public 0
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/sitemap_index.xml  # 200 のまま
wp option update blog_public 1

# 2 つ同時
wp plugin install all-in-one-seo-pack --activate
curl -s http://localhost:8080/2026/09/12/post-31/ | grep -c 'rel="canonical"'     # 2
curl -s -o /dev/null -D - http://localhost:8080/sitemap_index.xml | grep -i location
# → Location: http://localhost:8080/sitemap.xml

# 後片付け
wp plugin deactivate all-in-one-seo-pack wordpress-seo
wp plugin delete all-in-one-seo-pack wordpress-seo
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/sitemap_index.xml  # 404 に戻る
```

検証で入れた 2 つのプラグインは削除し、`blog_public` も元の値に戻してあります。
