# wordpress.noanavi.com

WordPress の不具合を症状から切り分ける記事サイト。Astro で静的 HTML を書き出し、`dist/` だけを配信する。

記事の元は検証ラボ `../wp.noanavi.com/docs/`。設計は [docs/site-design.md](docs/site-design.md)。
**やり残し（公開を見送った記事・撮影が必要な画面）は [docs/todo.md](docs/todo.md)。**

## コマンド

```sh
pnpm install
pnpm dev              # http://localhost:4321
pnpm build            # dist/ に HTML を出力
pnpm preview          # dist/ を確認
pnpm sync:articles    # ラボから新しい記事・スクリーンショットを取り込む
pnpm check:site       # dist/ を検査（リンク切れ・noindex・title の長さ・og:image など）
pnpm og               # OG 画像を public/og/ に生成（タイトルを変えたら実行する）
pnpm indexnow         # 更新した URL を IndexNow に通知（Bing 向け。デプロイ後に実行）
```

## Claude Code のスキル

記事まわりの定型作業は `.claude/skills/` にまとめてある。

| スキル | 使う場面 |
|---|---|
| `article-import` | ラボから記事を取り込み、ハブに割り当てる |
| `article-summary` | 「この記事の結論」を書く |
| `article-publish` | 下書きを公開できる状態に仕上げて published にする |
| `article-retire` | 記事を統合・廃止して URL を転送する |

## 構成

```
src/content/articles/     記事（1 ファイル 1 記事。ファイル名 = URL）
src/content/screenshots/  記事内の画像。ビルド時に WebP に変換される
src/content/indexes/      symptoms.md / plugins.md（索引ページ。ラボと同期する）
src/lib/plugin-index.ts   plugins.md の表を読み、プラグイン名ごとに組み替える
                          （/plugins/ のセレクトボックスと見出しはここから自動生成。
                           プラグインを足すときはラボの plugins.md に行を足すだけ）
src/lib/hubs.ts           症状別ハブ 7 つ。記事の所属と並び順はここだけで管理
src/lib/markdown.mjs      .md リンクの書き換え・表のラップ・再現手順の折りたたみ
src/pages/                ルーティング（[slug] / topics/[hub] / symptoms / plugins / about）
```

| URL | 中身 |
|---|---|
| `/{slug}/` | 記事 |
| `/topics/{hub}/` | 症状別ハブ |
| `/symptoms/` `/plugins/` | 索引 |

## 記事を追加する

1. `pnpm sync:articles`（ラボの記事・索引・画像を取り込む。サイト側で手を入れた記事は `.lab-base/` を基準に 3 方向マージする。詳しい手順は `article-import` スキル）
2. `src/lib/hubs.ts` のどれかのハブの `articles` に slug を追加する
   （**どこにも属さない記事があるとビルドが失敗する**）
3. 公開するときは front matter の `status` を `published` にする

## 記事を統合・廃止する

1. 記事ファイルを消し、`src/lib/hubs.ts` から外す
2. `public/_redirects` に 301 を、`astro.config.mjs` の `redirects` にも同じ転送を足す
3. `scripts/sync-articles.mjs` の `RETIRED` に slug を足す（ラボから再び取り込まれないように）

統合済み: `rest-api-fatal-http200` → `http-200-when-site-is-down`

## 下書きの扱い

`status: draft` の記事はページに `noindex` が付き、サイトマップにも載らない。
配信してしまっても検索結果には出ない。

## front matter

ラボの記事の項目に加えて、次を任意で書ける。

| 項目 | 用途 |
|---|---|
| `summary` | 記事冒頭の「この記事の結論」ボックス |
| `env` | 検証日の横に出す環境（例: `WordPress 6.8 / PHP 8.2`） |
| `related` | 「次に疑うこと」に出す slug。省略すると同じハブの記事 |
| `published` / `updated` | 構造化データの日付。省略すると `verified` |

## Markdown の注意

- `## 再現手順` で始まる節は、次の `##` まで自動で折りたたまれる
- 記事間リンクは `[文言](other-slug.md)` のまま書けば `/other-slug/` に変換される
- 「…。**次の文**」のように約物の隣に `**` を置いても太字になる（`remark-cjk-friendly`）

## 配信

**Cloudflare Pages** で配信する（プロジェクト名 `wordpress-noanavi-com`）。
GitHub の `main` に push すると Pages がビルドして公開する。
全ページ静的なので **`@astrojs/cloudflare` アダプターは入れない**
（[Astro のガイド](https://docs.astro.build/ja/guides/deploy/cloudflare/) の静的サイト向け設定）。

| Pages の設定 | 値 |
|---|---|
| フレームワーク プリセット | Astro |
| ビルドコマンド | `pnpm build` |
| ビルド出力ディレクトリ | `dist` |
| 環境変数 | `PUBLIC_GA_ID`（GA4 の測定 ID） |
| Node / pnpm | `.node-version` と `packageManager` の版が使われる |

独自ドメイン `wordpress.noanavi.com` は、Pages の「カスタムドメイン」に登録し、
**お名前.com の DNS に CNAME（`wordpress` → `wordpress-noanavi-com.pages.dev`）を足す。**
noanavi.com のネームサーバーは Cloudflare に移さない。

`_redirects`（301）と `404.html` は Pages でそのまま効く。
**`_redirects` は 1 つのパスに 1 行だけ**（末尾の `/` 有無を別行にすると `Duplicate rule` で失敗する）。

### Workers で失敗した経緯（2026-09-15）

- ダッシュボードで GitHub のリポジトリを取り込むと、**既定では Workers のプロジェクトになる。**Pages は「Pages」側から作る
- Workers Builds は `wrangler.jsonc` が無いと `astro add cloudflare` を自動で実行してアダプターを入れる。
  アダプターが `astro.config.mjs` の `redirects` を `_redirects` に書き足し、`Duplicate rule` で deploy が失敗した
- Workers の独自ドメインは noanavi.com の DNS を Cloudflare に移さないと使えないため、Pages にした

手元から直接上げるとき（GitHub を経由しない緊急用）:

```sh
pnpm exec wrangler login   # 初回だけ
pnpm deploy                # build → check:site → wrangler pages deploy
```

**この Mac（macOS 12.6）では Cloudflare の実行環境 workerd が動かない**（13.5 以上が必要）。
`wrangler dev` と、アダプターを入れたビルドは失敗する。表示の確認は `pnpm preview` で行う。

### Google Tag Manager / GA4

GTM のコンテナ `GTM-KZQKTLS7` を全ページに入れている（`src/lib/site.ts` の `GTM_ID`）。
**GA4 は GTM のコンテナ側で設定する**（サイトのコードには GA4 の測定 ID を書かない）。

タグは `location.hostname` が `wordpress.noanavi.com` のときだけ読み込む。
`pnpm dev` / `pnpm preview` / `*.pages.dev` のプレビューでのアクセスは計測に混ざらない。
環境変数の設定は不要。

GA4 を使うのでプライバシーポリシー（`/privacy/`）を置いている。
