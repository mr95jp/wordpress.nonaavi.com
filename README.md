# wordpress.noanavi.com

WordPress の不具合を症状から切り分ける記事サイト。Astro で静的 HTML を書き出し、`dist/` だけを配信する。

記事の元は検証ラボ `../wp.noanavi.com/docs/`。設計は [docs/site-design.md](docs/site-design.md)。

## コマンド

```sh
pnpm install
pnpm dev              # http://localhost:4321
pnpm build            # dist/ に HTML を出力
pnpm preview          # dist/ を確認
pnpm sync:articles    # ラボから新しい記事・スクリーンショットを取り込む
pnpm check:site       # dist/ を検査（リンク切れ・noindex・ラボ専用の記述など）
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
src/content/indexes/      symptoms.md / plugins.md（索引ページ）
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

1. `pnpm sync:articles`（ラボに追加した記事を取り込む。既存の記事は上書きしない）
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

`dist/` の中身をそのまま置く。Cloudflare Pages などに接続する場合は
ビルドコマンド `pnpm build`、出力ディレクトリ `dist`。

### Google Analytics

ビルド時に環境変数 `PUBLIC_GA_ID`（`G-` で始まる測定 ID）を渡すと GA4 のタグが入る。
未設定ならタグは出ない（ローカルのビルドで計測が混ざらない）。

```sh
PUBLIC_GA_ID=G-XXXXXXXXXX pnpm build
```

Cloudflare Pages ならプロジェクトの環境変数に設定する。
GA4 を使うのでプライバシーポリシー（`/privacy/`）を置いている。
