# TODO

最終更新: 2026-09-16

公開済み 38 本・下書き 0 本。公開は `article-publish` スキルの手順で行う。

---

## 1. スクリーンショット

- [ ] `ssl-mixed-content` は画像なしで公開した（2026-09-16、判断済み）。ラボに HTTPS のリスナーが無く、ブラウザがブロックする画面を撮れないため。HTTPS を足したら次の 2 枚を撮って追加する
  - https のページで CSS が http のままブロックされ、デザインが崩れた画面
  - 開発者ツールのコンソールに `Mixed Content: … This request has been blocked.` が出ている画面

### 撮り方の注意（ラボの原則）

- 1 枚に 1 つの症状だけを写す
- 対比が必要な記事は正常な状態も撮る
- 撮ったらサイト名・ユーザー名・パスワードなどが写っていないか確認する
- 保存先はラボの `docs/screenshots/<カテゴリ>/`

### 撮ったあとの手順

1. ラボで `docs/screenshots/` に画像を置く
2. このリポジトリで `pnpm sync:articles`（画像が追加される。ラボ側で記事に画像を挿入していれば、その変更もサイト側の記事にマージされる）
3. マージされなかった記事には画像を手で挿入する: `![画面に出ている文言](../screenshots/<カテゴリ>/<ファイル名>)`
4. `article-publish` で公開する

---

## 2. 2026-09-16 の公開で気づいた点

- [ ] `mobile-layout-broken` からほかの記事へのリンクが 1 本だけ（`css-js-not-loading`）。本文に自然に置ける箇所が無かった
- [x] 本文の文言を実際の画面（WordPress 7.1）に合わせた（`login-impossible` / `wp-mail-not-delivered` / `scheduled-post-missed`）。ラボで直して sync で反映
- `site-health-reading` の本文の critical 2 件は CLI での実測値なので変えていない。撮影時は 3 件だったことを画像の説明文に注記した
- `login-impossible` パターン 4 に `c/functions-parse-error.jpg` は入れていない。display_errors が有効な画面で、パターン 4 の「500」とは見え方が違うため
- [x] 症状別記事の画像を `docs/screenshots/s/` に置くことを、ラボの `docs/error-catalog.md` に追記した

### 本文と画像の直し方（2026-09-16 に決めた運用）

- **本文・実測値・画面の文言・画像の挿入はラボで直す。**ラボでコミットしてから `pnpm sync:articles` で取り込む（3 方向マージ）
- **サイト側で直すのは公開用の手入れだけ**（結論ボックス、内部リンク、タイトル・メタ情報、`example.com` への置き換え、`status`）
- サイト側だけで本文や画像を直すと、次にラボを直したとき同じ行で競合しやすくなる

---

## 3. その他

- [ ] Search Console にサイトマップ `sitemap-index.xml` を送信する
- [ ] サイト名「WP復旧ラボ」と、`plugin-conflict-diagnosis` の参考文献にある「WP復旧本舗」が似ている。混同されないか検討する
- [ ] GitHub のリポジトリ名が `wordpress.nonaavi.com`（綴り違い）。変える場合は Cloudflare Pages の Git 連携を確認する
- [ ] 運営者情報を充実させる（`/about/`）。記事の信頼性の評価に効く
- [ ] 記事末尾に「この記事で解決しましたか？」を置くか検討する（GA4 のイベントで集計）
