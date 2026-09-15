---
name: article-import
description: 検証ラボ（../wp.noanavi.com/docs）に追加・更新された記事とスクリーンショットをサイトに取り込み、症状別ハブに割り当てる。「ラボから取り込んで」「新しい記事を反映」「sync して」と言われたときに使う。
---

# ラボから記事を取り込む

## 1. 取り込む

```sh
pnpm sync:articles
```

出力は 3 種類。

| 出力 | 意味 | 次にやること |
|---|---|---|
| 追加 | サイトに無かった記事・画像をコピーした | 手順 2 |
| ラボ側と内容が違う | サイト側で直した記事、またはラボ側で更新された記事 | 手順 4 |
| （出ない） | `scripts/sync-articles.mjs` の `RETIRED` にある統合済みの記事 | 何もしない |

## 2. 新しい記事をハブに割り当てる

記事を最後まで読み、`src/lib/hubs.ts` のどれか 1 つのハブに入れる。
**どのハブにも入っていない記事があるとビルドが失敗する。**

| ハブ | 入れる記事 |
|---|---|
| `error-screen` | 真っ白・「重大なエラー」・500・DB 接続エラー・メンテナンス表示など、サイトが落ちる |
| `cannot-login` | ログイン画面・管理画面に入れない |
| `display-broken` | ページは 200 で出るが、CSS・JS・画像・レイアウトが壊れる |
| `cannot-save` | 保存・投稿・アップロード・予約・メール・フォームが完了しない |
| `slow-seo` | 遅い・検索結果に出ない・フィード |
| `security` | 乗っ取り・改ざん・漏洩・脆弱性 |
| `diagnosis` | ログ・サイトヘルス・監視など、原因の調べ方そのもの |

**原因ではなく、読者に見えている症状で選ぶ。**
（例: PHP が原因でも、症状が「真っ白」なら `error-screen`）

ハブに足すもの:

- `articles` 配列に slug（検索されやすい記事ほど前）
- `rows` 配列に 1 行。`see` は読者に見えている症状、`suspect` は原因。
  ラボの `docs/symptoms.md` にその記事の行があれば、その文言を使う

どのハブにも当てはまらない記事が 3 本以上たまったら、ハブを増やすことをユーザーに提案する。

## 3. 狙い語の重複を確認する

```sh
grep -h '^keywords:' src/content/articles/*.md | tr ',' '\n' | sed 's/^ *//' | sort | uniq -d
```

新しい記事が既存の記事と同じ語を狙っていたら、ユーザーに報告する。
統合するなら **article-retire** スキルを使う。

## 4. 「ラボ側と内容が違う」記事

**`--force` で上書きしない。**サイト側で書いた結論ボックス・タイトル変更・統合した節が消える。

```sh
diff ../wp.noanavi.com/docs/articles/<slug>.md src/content/articles/<slug>.md
```

- 違いがサイト側の編集だけ（summary、title、ラボ専用記述の書き換えなど）→ 何もしない
- ラボ側に新しい実測・修正がある → その部分だけをサイト側に手で反映する

## 5. 索引ページ

`sync:articles` は索引を取り込まない。ラボ側が更新されていないか確認する。

```sh
diff ../wp.noanavi.com/docs/symptoms.md src/content/indexes/symptoms.md
diff ../wp.noanavi.com/docs/plugins.md  src/content/indexes/plugins.md
```

新しい行があれば、サイト側に手で足す。

## 6. 確認

```sh
pnpm build && pnpm check:site
```

新しい記事は `status: draft` のまま（noindex）。公開は **article-publish** スキルで行う。
ユーザーには、取り込んだ記事・割り当てたハブ・手で反映した差分を報告する。
