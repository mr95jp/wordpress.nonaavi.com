---
title: "WordPressの改ざんチェックの落とし穴 — verify-checksumsだけでは足りない"
slug: verify-checksums-blind-spots
seo_title: "WordPress 改ざん チェック｜verify-checksums の穴と正しい確認"
description: "wp core verify-checksumsがSuccessでも改ざんは見つからないことを実測。コアしか見ずwp-contentは素通り、テーマ用コマンドは存在しない等3つの穴。git diffが唯一の全カバー経路。"
keywords: "WordPress 改ざん チェック, verify-checksums, wp-content 改ざん, 改ざん 検知, ファイル 改ざん 確認, WordPress 検知"
category: 障害報告
tags: [wordpress, セキュリティ, 改ざん, wp-cli, git]
summary: |
  wp core verify-checksums が照合するのはコアファイルだけです。
  ・プラグインやテーマを改ざんしても Success になる
  ・wp.org 配布のプラグインは wp plugin verify-checksums で検知できるが、自作プラグインは skipping と出て検査されない
  ・テーマ用の検査コマンドは存在しない
  ・コアと wp-content を均一に確認できたのは git status だけだった
  データベースに入った改ざんは、どの方法でも見つかりません。
status: published
published: 2026-09-16
verified: 2026-09-12
---

改ざんが疑われるサイトで `wp core verify-checksums` を実行したら、Success が
返ってきた。これで安全と判断していいのか。

**判断できません。**このコマンドが見ていない範囲が、思っているよりずっと広い
からです。4 箇所に無害なマーカーを仕込んで、どの検査で見つかるかを実測しました。

## 実測結果

| 改ざん箇所 | `core verify-checksums` | `plugin verify-checksums` | `git status` |
|---|---|---|---|
| コア既存ファイルの改変 | 検知 | — | 検知 |
| コア配下への新規ファイル設置 | 検知 | — | 検知 |
| wp.org 配布プラグインの改変 | **素通り（Success）** | 検知 | 検知 |
| 自作テーマ・自作プラグインの改変 | **素通り** | **対象外（skipping）** | 検知 |

コア側の 2 つはきちんと見つかります。

```
Warning: File doesn't verify against checksum: wp-includes/functions.php
Warning: File should not exist: wp-includes/class-wp-lab-backdoor.php
Error: WordPress installation doesn't verify against checksums.
```

新規ファイルの設置まで `File should not exist` で報告されるのは優秀です。
問題は、そこから先です。

## 穴 1: wp-content を一切見ていない

`hello.php`（wp.org 配布プラグイン）とテーマの `functions.php` にマーカーを
足した状態で実行すると、こうなります。

```
$ wp core verify-checksums
Success: WordPress installation verifies against checksums.
```

**Success です。**このコマンドはコアファイルのチェックサムしか照合しません。
実際の改ざんの大半はプラグインやテーマへの注入なので、この検査だけでは
判断材料になりません。
→ [プラグインに多い脆弱性の型](broken-access-control.md)

プラグインには専用のコマンドがあり、そちらは検知します。

```
$ wp plugin verify-checksums --all
plugin_name	file	message
hello	hello.php	Checksum does not match
```

## 穴 2: テーマ用のコマンドが存在しない

```
$ wp theme verify-checksums --all
Error: 'verify-checksums' is not a registered subcommand of 'theme'.
```

`plugin` にはあるのに `theme` には**実装されていません**。
テーマ改ざんを公式な手段でチェックする方法が無いということです。

## 穴 3: 自作コードは警告で流れる

自社製プラグインは wp.org に配布されていないので、チェックサムが取得できません。

```
Warning: Couldn't fetch response from https://downloads.wordpress.org/plugin-checksums/lab-triggers/0.1.0.json (HTTP code 404).
Warning: Could not retrieve the checksums for version 0.1.0 of plugin lab-triggers, skipping.
Error: Only verified 1 of 3 plugins (1 failed, 1 skipped).
```

`skipping` は **Error ではなく Warning** です。1 件でも失敗があれば終了コードは
非ゼロになりますが、**失敗がゼロで skip だけがある場合は成功扱いで抜けます。**
CI で終了コードだけ見ていると、自作コードは検査されないまま通過します。
そして受託案件では、自作テーマ・自作プラグインこそ本命の攻撃対象です。

## 結論: git が唯一の全カバー経路

3 つの検査の中で、コアと wp-content を均一にカバーするのは `git status` だけでした。
WordPress 本体ごと git 管理下に置いておけば、`git diff` が改ざんの内容まで
そのまま出してくれます。

```sh
git diff                            # 改変内容を特定
git checkout -- . && git clean -fd  # 復旧
```

`.gitignore` から除外するのは、アップロードとログだけにします。

```
/wp-content/uploads/
/wp-content/debug.log
# コアと wp-content は意図的に追跡する
```

ファイルをすべて検査しても、**データベースに入った改ざん**（知らない管理者、
記事本文へのスパムリンク、オプションへの注入）は見つかりません。
→ [乗っ取られた・改ざんされた時の確認と対処法](compromised-db-side.md)

## 検査は 3 つとも走らせる

1 つだけでは穴が残ります。3 つを順に実行し、**skip された対象を目で確認します。**
終了コードだけを見ると、skip は成功として流れます。

```sh
wp core verify-checksums
wp plugin verify-checksums --all 2>&1 | grep -iE 'skipping|does not match'
git status --short
```

- `skipping` と出たプラグインは**検査されていません。**自作コードは git でしか確認できません
- git の出力に `M`（改変）や `??`（新規）があれば、`git diff` で中身を確認します

ネットワークが遮断された環境ではチェックサムを取得できないため、使えるのは git だけです。

## 再現手順

```sh
printf '\n// TAMPER\n' >> src/wp-includes/functions.php
echo '<?php // TAMPER' > src/wp-includes/class-wp-lab-backdoor.php
printf '\n/* TAMPER */\n' >> src/wp-content/plugins/hello.php
printf '\n/* TAMPER */\n' >> src/wp-content/themes/<theme>/functions.php

wp core verify-checksums
wp plugin verify-checksums --all
git status --short src/

git checkout -- src/ && git clean -fd src/   # 復旧
```
