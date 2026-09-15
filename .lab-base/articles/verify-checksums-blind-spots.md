---
title: "WordPressの改ざんチェックの落とし穴 — verify-checksumsだけでは足りない"
slug: verify-checksums-blind-spots
seo_title: "WordPress 改ざん チェック｜verify-checksums の穴と正しい確認"
description: "wp core verify-checksumsがSuccessでも改ざんは見つからないことを実測。コアしか見ずwp-contentは素通り、テーマ用コマンドは存在しない等3つの穴。git diffが唯一の全カバー経路。"
keywords: "WordPress 改ざん チェック, verify-checksums, wp-content 改ざん, 改ざん 検知, ファイル 改ざん 確認, WordPress 検知"
category: 障害報告
tags: [wordpress, セキュリティ, 改ざん, wp-cli, git]
status: draft
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
git diff src/                              # 改変内容を特定
git checkout -- src/ && git clean -fd src/ # 復旧
```

`.gitignore` から除外するのは、アップロードとログだけにします。

```
/src/wp-content/uploads/
/src/wp-content/debug.log
# コアと wp-content は意図的に追跡する
```

## 検査を 1 コマンドにまとめる

3 層を順に走らせ、**検査対象外を明示的に列挙する**スクリプトを用意しました。
skip を黙って流さないことが目的です。

```sh
$ bin/verify.sh
== 1/3 コア ==
  ○ 改変なし

== 2/3 プラグイン(wp.org 配布分のみ) ==
  ○ 改変なし
  - 検査対象外(自作): lab-triggers

== 3/3 git(src/ 全体) ==
  ○ HEAD と一致

改ざんは検出されませんでした。
```

改ざんがある状態だと、こうなります。

```
== 3/3 git(src/ 全体) ==
  × 改変: src/wp-content/plugins/hello.php
  × 改変: src/wp-content/themes/<theme>/functions.php
  × 改変: src/wp-includes/functions.php
  × 新規: src/wp-includes/class-wp-lab-backdoor.php

改ざんを検出しました。
```

ネットワークが遮断された環境ではチェックサムを取得できないため、
git 層だけを走らせるモードも用意しています。

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
