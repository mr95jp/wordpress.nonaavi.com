---
name: article-retire
description: 狙う検索語が重なる記事を 1 本に統合する、または記事を廃止して URL を転送する。「記事を統合して」「〇〇を△△にまとめて」「記事を削除・廃止」「301 を設定」と言われたときに使う。
---

# 記事を統合・廃止する

統合元を「消す記事」、統合先を「残す記事」と呼ぶ。
記事の削除はサイト側だけで行う（ラボの元記事は残る）。

実例: `rest-api-fatal-http200` → `http-200-when-site-is-down`

## 1. どちらを残すか決める

ユーザーが指定していなければ、次の順で残すほうを選び、理由を添えて確認を取る。

1. 扱う範囲が広いほう（片方がもう片方の一部なら、広いほう）
2. ほかの記事からのリンクが多いほう
   `grep -l '](<slug>.md)' src/content/articles/*.md | wc -l`

## 2. 実測を移す

両方を最後まで読む。**消す記事にしか無い実測値・スクリーンショット・手順は、
残す記事に節として移す。**失われる実測があってはいけない。

- 残す記事に同じ内容があれば移さない（重複させない）
- 画像はパスごと移す（`../screenshots/<カテゴリ>/xxx.jpg`）。ファイルは消さない
- 残す記事の `description`・`keywords`・`tags` に、移した内容の語を足す
- 結論ボックス（summary）があれば、移した内容を反映する
- 消す記事の「再現手順」は、残す記事の再現手順に足す。不要なら足さない

## 3. 参照を張り替える

```sh
grep -rn '<消す slug>' src/ public/ astro.config.mjs scripts/
```

- 記事・索引（`src/content/indexes/`）のリンクを残す記事へ張り替える
- `src/lib/hubs.ts` の `articles` から消し、`rows` の `slug` を残す記事に変える
- 残す記事の中にある「消す記事へのリンク」は削除する

## 4. 転送と取り込み除外

3 か所に同じ slug を足す。

```
public/_redirects          /<消す slug>/  /<残す slug>/  301
astro.config.mjs           redirects: { '/<消す slug>': '/<残す slug>/' }
scripts/sync-articles.mjs  RETIRED に '<消す slug>'
```

`_redirects` が本物の 301（Cloudflare Pages / Netlify）。
**`_redirects` は 1 つのパスに 1 行だけ。**末尾の `/` 有無は同じパスとして扱われ、
両方書くと Cloudflare が `Duplicate rule` で deploy を失敗させる。
`astro.config.mjs` の転送は、それ以外の静的ホスト向けの予備（meta refresh + canonical）。
`RETIRED` に足さないと、次の `pnpm sync:articles` で記事が戻ってくる。

README の「統合済み」の行にも追記する。

## 5. 消す

```sh
rm src/content/articles/<消す slug>.md
```

## 6. 確認

```sh
pnpm build && pnpm check:site
pnpm sync:articles   # 消した記事が「追加」に出ないこと
```

- エラーが 0 件（リンク切れがあれば張り替え漏れ）
- `dist/<消す slug>/index.html` が転送ページになっている
- ページ数が 1 減っている

ユーザーには、移した節・張り替えたリンク・転送の設定を報告する。
