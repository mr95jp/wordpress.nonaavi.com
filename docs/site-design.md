# wordpress.noanavi.com サイト設計

元記事: `~/Sites/wp.noanavi.com/docs/articles/`（39 本・すべて status: draft）

---

## 1. 前提: 何で勝つサイトか

### 読者は「原因」ではなく「症状」で検索してくる

記事の keywords を見ると、検索語の 9 割は症状か画面の文言です。

- 「WordPress 真っ白」「ログインできない」「500エラー」
- 「データベース接続確立エラー」「返答が正しいJSONレスポンスではありません」
- 「Contact Form 7 くるくる」「SiteGuard ログインできない」

検索する人は**いま困っていて、急いでいて、スマホで見ていることも多い**。

### 想定読者は 3 層

| 層 | 状況 | 使える道具 | 割合の見込み |
|---|---|---|---|
| A. サイト運営者 | レンタルサーバー。原因の見当がつかない | 管理画面・FTP・phpMyAdmin | **最大** |
| B. 制作者・保守担当 | 納品先のサイトが落ちた | 上記 + SSH・WP-CLI | 中 |
| C. 開発者 | プラグイン開発・監視・セキュリティ | すべて | 小（ただし被リンクを生む） |

いまの記事は **B 向けに書かれている**（curl・WP-CLI が中心）。
流入の大半は A なので、各記事の冒頭に A でもできる手順を置く必要がある（§5）。

### 差別化できるのは「実測値」だけ

「WordPress 真っ白」の上位は、レンタルサーバー各社のマニュアルや大手ブログが
押さえている。手順の網羅性では勝てない。勝てるのは次の 3 つ。

1. **実際に壊して測った値**（「白画面になる設定は 1 通りだけ」「5 原因で画面が md5 まで同一」）
2. **通説の訂正**（「CF7 のくるくるは nonce ではない」「`template_redirect` では塞げない」）
3. **症状から入れる導線**（競合の多くは原因別に並んでいる）

この 3 つをデザインとして前に出す。検証日と検証環境を記事の上部に表示し、
「実測」をサイトの看板にする。

---

## 2. 情報設計: 症状別ハブ 7 つ + 記事 39 本

元の分類（A〜H の原因別カテゴリ）は**読者には見せない**。
`symptoms.md` の方針どおり、症状を入口にする。

```
トップ（症状から選ぶ）
├── /topics/error-screen/    真っ白・エラー画面が出る ........ 8 本
├── /topics/cannot-login/    ログイン・管理画面に入れない .... 5 本
├── /topics/display-broken/  表示が崩れる・読み込めない ...... 7 本
├── /topics/cannot-save/     保存・投稿・送信ができない ...... 7 本
├── /topics/slow-seo/        遅い・検索に出ない .............. 3 本
├── /topics/security/        乗っ取り・改ざん・セキュリティ .. 5 本
├── /topics/diagnosis/       原因の調べ方（ログ・監視） ...... 4 本
│
├── /symptoms/   症状・直前にやったことから引く（全件索引）
├── /plugins/    プラグイン名から引く
└── /about/      運営者・検証環境・検証方法
```

### ハブごとの記事割り当て

| ハブ | 記事（slug） |
|---|---|
| **error-screen** 真っ白・エラー画面 | php-upgrade-white-screen / admin-only-white-screen / functions-php-broken-recovery / plugin-conflict-diagnosis / php7-to-php8-breaking-changes / htaccess-500-rewrite-loop / db-connection-error-diagnosis / maintenance-mode-stuck |
| **cannot-login** 入れない | login-impossible / siteguard-lockout / redirect-loop / wp-admin-403-capability / recovery-without-wp-cli |
| **display-broken** 表示崩れ | css-js-not-loading / admin-styles-broken / mobile-layout-broken / images-not-displaying / ssl-mixed-content / block-editor-blank / posts-404-permalink |
| **cannot-save** 保存・送信 | rest-json-update-failed / max-input-vars-silent-loss / media-upload-failure / scheduled-post-missed / emoji-and-timezone / wp-mail-not-delivered / contact-form-7-not-sending |
| **slow-seo** 遅い・検索 | site-is-slow / not-indexed-by-google / feed-sitemap-broken |
| **security** セキュリティ | compromised-db-side / verify-checksums-blind-spots / attack-surface-audit / config-file-exposure / broken-access-control |
| **diagnosis** 調べ方 | where-are-the-logs / site-health-reading / http-200-when-site-is-down / rest-api-fatal-http200 |

- `slow-seo` は検索意図が 2 つ混ざっている。記事が増えたら `slow` と `seo` に分ける
- `security` と `diagnosis` は C 層向け。被リンクと専門性の評価を集める役割

### ハブは記事一覧ではなく「記事」として書く

WordPress のカテゴリーアーカイブのような一覧だけのページは内容が薄く、順位がつきにくい。
ハブには次を書く（材料は `symptoms.md` をハブごとに切り分ければほぼ揃う）。

1. この症状で最初に確認すること（3 行）
2. **見えている画面 → 記事** の表
3. **直前にやったこと → 記事** の表
4. 画面の見分け方（スクリーンショットを並べる）

ハブが「WordPress 真っ白」のようなビッグワードを受け、
各記事が「PHP 上げたら 真っ白」「管理画面だけ 真っ白」のような具体的な語を受ける。

---

## 3. キーワードの重複（公開前に直す）

同じ検索語を複数の記事が取り合っている。このままだと互いの評価が割れる。

| 検索語 | 取り合っている記事 | 対処 |
|---|---|---|
| **WordPress 真っ白** | php-upgrade-white-screen（title が「WordPressが真っ白になった時の対処法」）/ admin-only / functions-php / plugin-conflict | ビッグワードは**ハブ error-screen** が受ける。php-upgrade-white-screen の title は中身どおり「PHP を上げたら真っ白」に絞る |
| **監視は正常なのに壊れている** | http-200-when-site-is-down / rest-api-fatal-http200 | **統合を推奨。**rest-api-fatal-http200（約 5,500 字）を http-200 に吸収し、301 リダイレクト |
| **REST API エラー** | rest-api-fatal-http200 / rest-json-update-failed | 上の統合で解消。rest-json は「JSON レスポンスではありません」の文言に集中させる |
| **WordPress 保存できない** | max-input-vars-silent-loss / rest-json-update-failed | max-input-vars は「一部だけ消える」、rest-json は「更新に失敗しました」に絞る |
| **管理画面 入れない** | login-impossible / recovery-without-wp-cli | login-impossible を主記事にする。recovery は「FTP・phpMyAdmin で復旧」に絞る |
| **WordPress 改ざん** | compromised-db-side / verify-checksums-blind-spots | compromised が「乗っ取り・改ざん」、verify が「改ざん チェック方法」。相互リンクを必ず張る |

統合すると 38 本 + ハブ 7 本になる。

---

## 4. URL 設計

| ページ | URL | 例 |
|---|---|---|
| 記事 | `/{slug}/` | `/db-connection-error-diagnosis/` |
| ハブ | `/topics/{hub}/` | `/topics/error-screen/` |
| 索引 | `/symptoms/` `/plugins/` | |
| 運営情報 | `/about/` `/privacy/` `/contact/` | |

- **記事の URL にハブ名を入れない。**ハブを分割・統合しても URL が変わらない
- slug は元記事のものをそのまま使う（英語・症状が分かる形になっている）
- 末尾スラッシュをどちらかに統一し、canonical で固定する

---

## 5. ページテンプレート

### 記事ページ

上から順に並べる。**急いでいる読者が上 1 画面で「自分の症状か」「何をすればいいか」を判断できること**を最優先にする。

```
パンくず: トップ > 真っ白・エラー画面が出る > 記事
H1（front matter の title）
[検証日 2026-09-12] [WordPress 6.x / PHP 8.2 / Apache・nginx で実測]
┌ この記事の結論 ─────────────────┐
│ ・症状の見分け方 1 行               │
│ ・まず試すこと（管理画面・FTP でできる）│
│ ・それでもだめなら → 見出しへのリンク   │
└────────────────────────┘
該当する画面のスクリーンショット（ある記事のみ）
目次
本文（実測結果 → なぜそうなるのか → 切り分け・対策）
▶ 再現手順（検証環境の詳細）※ 折りたたみ
次に疑うこと（同じハブの記事 + 直前にやったことで分岐）
```

- **「この記事の結論」ボックスは新規に書く必要がある。**いまの記事には無い。
  A 層の読者を逃がさないためと、AI による検索要約に引用されやすくするための両方に効く
- **再現手順は `<details>` で折りたたむ。**`docker compose`・`localhost:8080`・
  `lab-legacy-php` など、読者の環境では使えないものが並ぶため。
  消さずに残すのは「実際に測った」証拠になるから
- 表が多い（ほぼ全記事）。スマホでは表ごとに横スクロールにする。
  ページ全体を横スクロールさせない

### ハブページ

H1 → 最初に確認すること → 画面から選ぶ表 → 直前にやったことから選ぶ表 → 記事カード

### トップページ

- **症状ボタン 7 つ**（ハブへ）を最上部に置く。検索窓より先
- 「直前にやったこと」から選ぶリスト
- 「最初に取る 4 つの値」（`symptoms.md` の該当節。B 層向け）
- 最近検証した記事

### /about/

E-E-A-T（経験・専門性・信頼性）の評価の受け皿。次を書く。

- 運営者（実名かハンドルネーム、経歴、連絡先）
- **検証環境**: Apache + mod_php と nginx + php-fpm の 2 系統を並べている理由
- **記事の方針**: 「実測できたものだけ書く」「バージョンで変わる不具合は書かない」
  （`error-catalog.md` と `plugins.md` に既に書いてある原則をそのまま使える）

---

## 6. 内部リンク

### 現状の問題

記事から記事へのリンクを数えた結果:

- **ほかの記事から一度もリンクされていない記事が 14 本**
  （login-impossible・siteguard-lockout・contact-form-7-not-sending・posts-404-permalink など、
  検索需要が大きいと見込まれる記事も含む）
- **ほかの記事へのリンクが 1 本も無い記事が 6 本**
  （feed-sitemap-broken・max-input-vars・emoji-and-timezone・scheduled-post-missed・posts-404-permalink・verify-checksums）

索引（symptoms.md など）からはリンクされているが、それだけでは足りない。

### ルール

1. すべての記事 → 所属ハブ（パンくず）
2. すべてのハブ → 所属記事すべて
3. 記事末尾に「次に疑うこと」を 2〜4 本。**症状が隣り合う記事**を選ぶ
   （例: login-impossible → redirect-loop / siteguard-lockout / recovery-without-wp-cli）
4. 本文中で別記事の実測値に触れるときは必ずリンク
   （例: php-upgrade-white-screen の「REST API の Fatal が 200 で返るのと同じ機構」）
5. リンク文は記事タイトルではなく**症状の言葉**にする（「ログイン画面に戻される場合」）

関連記事はタグで自動生成しない。front matter に `related:` を手で書く。

---

## 7. front matter の追加項目

元記事にある項目（title / slug / seo_title / description / keywords / category / tags / status / verified）に加える。

> 実装メモ: 所属ハブは front matter ではなく `src/lib/hubs.ts` に集約した。
> ハブ内の並び順も同時に管理でき、ラボからの取り込みで front matter が消える心配もないため。

```yaml
related: [admin-only-white-screen, recovery-without-wp-cli]
published: 2026-09-20        # 公開日
updated: 2026-09-20          # 本文を更新した日（verified とは別）
env: "WordPress 6.8 / PHP 8.2 / Apache 2.4・nginx 1.27"   # 表示用
summary: |                   # 「この記事の結論」ボックス
  ...
```

- `seo_title` → `<title>`、`title` → H1。いまの分け方をそのまま使う
- `keywords` は検索エンジンは使わない。**記事ごとの狙い語の管理用**として残す
- `category`（障害報告 / 技術メモ）は表示しない。読者の役に立たない
- `env` の値は各記事の実測時の実際のバージョンを入れる（上の値は例）

---

## 8. 技術面の SEO

| 項目 | 内容 |
|---|---|
| 構造化データ | `TechArticle`（datePublished / dateModified / author）、`BreadcrumbList`。HowTo は Google のリッチリザルトが終了しているので使わない |
| サイトマップ | 記事とハブのみ。公開と同時に Search Console・Bing Webmaster Tools に送信 |
| OG 画像 | 記事タイトル入りの画像を自動生成（SNS で共有されやすい C 層向け記事で効く） |
| 表示速度 | ほぼテキストと表のサイトなので、静的に配信すれば Core Web Vitals は問題になりにくい。スクリーンショットは WebP にし、幅と高さを指定する |
| スクリーンショット | alt に画面の文言を入れる（「このサイトで重大なエラーが発生しました」で画像検索する人がいる） |
| コードブロック | コピーボタンを付ける。A 層は手打ちで間違える |
| 計測 | Search Console・GA4 を公開初日から入れる |

---

## 9. 公開前にやること

1. **統合と title 修正**（§3）
2. **各記事に「この記事の結論」を書く**（§5）。A 層向けに管理画面・FTP でできる手順から
3. **ラボ固有の記述を整理する**
   - 本文中の `bin/diagnose.sh` への言及 → 普通の curl コマンドに置き換えるか、スクリプトを公開する
   - `localhost:8080` / `8082` → 本文では `https://example.com` に、再現手順の中だけ残す
4. **ハブ 7 ページと /about/ を書く**
5. 内部リンクを張る（§6）
6. `status: draft` を外す

### 公開順

39 本を一度に出してかまわない（品質のばらつきが小さいため）。
ただし §9 の 2 は分量が多いので、先に仕上げるのは次の記事。
検索需要が大きいと見込まれる語を持つもの（実際の数値は Search Console で確かめる）。

1. php-upgrade-white-screen（真っ白）
2. login-impossible（ログインできない）
3. db-connection-error-diagnosis（データベース接続確立エラー）
4. htaccess-500-rewrite-loop（500 エラー）
5. wp-mail-not-delivered（メール 届かない）
6. site-is-slow（重い）
7. images-not-displaying（画像 表示されない）

### 検討事項: 検証環境を公開するか

`wp.noanavi.com` のリポジトリを GitHub で公開すると、
「再現手順をコピペで試せる」サイトになり、C 層からの被リンクが見込める。
公開する場合は `.env`（管理者パスワード）と `db/init/` の中身を確認してからにする。

---

## 10. 未決定: 構築方法

設計そのものはどちらでも成り立つ。

| | Astro（静的サイト） | WordPress |
|---|---|---|
| 記事の取り込み | **Markdown と front matter をそのまま使える** | 変換と画像の取り込みが必要 |
| 更新の流れ | ラボのリポジトリと同じく git で管理できる | 管理画面で編集 |
| 表示速度・保守 | 速い。サーバー側で壊れる部分がほぼ無い | キャッシュ・更新・セキュリティの手当てが必要 |
| 説得力 | — | 「WordPress のサイトが WordPress で動いている」 |
| 経験 | `noanavi.com_astro` で使用済み | — |

**推奨は Astro。**記事がすでに Markdown と front matter で書かれていて、
変換せずにそのまま公開できるため。
