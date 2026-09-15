// 検証ラボ（wp.noanavi.com/docs）の記事・索引・スクリーンショットを取り込む。
//
// サイト側の記事は公開用に手を入れている（結論ボックス・タイトル・リンクなど）ので、
// 単純に上書きせず 3 方向マージする。
//
//   サイト側の記事  ×  前回取り込んだときのラボの記事（.lab-base/）  ×  いまのラボの記事
//
// - ラボだけが変わった     → そのまま反映
// - 両方が別の場所を変えた → git merge-file で自動マージ
// - 同じ行を両方が変えた   → サイトの記事は触らず、競合入りのファイルを .lab-sync/conflicts/ に出す
//
//   pnpm sync:articles                  取り込む
//   pnpm sync:articles --dry-run        何が起きるかだけ表示する（書き込まない）
//   pnpm sync:articles --force <slug>   指定した記事をラボの内容で上書きする（サイト側の変更は消える）
//   pnpm sync:articles --resolved <slug> 競合を手で反映し終えた記事の基準をラボの内容に進める（記事は触らない）
//   pnpm sync:articles --init-base      いまのラボの内容を基準として保存し直す（通常は使わない）

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const labDocs = process.env.LAB_DOCS ?? join(root, '../wp.noanavi.com/docs');
const baseDir = join(root, '.lab-base');
const conflictDir = join(root, '.lab-sync/conflicts');

// サイト側で統合・廃止した記事。ラボに残っていても取り込まない（転送は public/_redirects）
const RETIRED = new Set(['rest-api-fatal-http200']);

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const INIT = args.includes('--init-base');
// `--force a b --resolved c` のように、オプションの後ろに続く slug を集める
const slugsAfter = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return new Set();
  const rest = args.slice(i + 1);
  const end = rest.findIndex((a) => a.startsWith('--'));
  return new Set(end < 0 ? rest : rest.slice(0, end));
};
const forced = slugsAfter('--force');
const resolved = slugsAfter('--resolved');

if (!existsSync(labDocs)) {
  console.error(`ラボの docs が見つかりません: ${labDocs}（LAB_DOCS で指定できます）`);
  process.exit(1);
}

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
      })
    : [];

const same = (a, b) => existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));

const write = (dest, data) => {
  if (DRY) return;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, data);
};
const copy = (src, dest) => write(dest, readFileSync(src));

// 記事と索引（テキスト）。lab: ラボ側のパス、site: サイト側のパス、base: 基準のパス
const textFiles = [
  ...walk(join(labDocs, 'articles'))
    .filter((f) => f.endsWith('.md'))
    .map((lab) => {
      const name = relative(join(labDocs, 'articles'), lab);
      return { lab, site: join(root, 'src/content/articles', name), base: join(baseDir, 'articles', name), slug: name.replace(/\.md$/, '') };
    }),
  ...['symptoms.md', 'plugins.md'].map((name) => ({
    lab: join(labDocs, name),
    site: join(root, 'src/content/indexes', name),
    base: join(baseDir, name),
    slug: name.replace(/\.md$/, ''),
  })),
];

if (INIT) {
  for (const f of textFiles) if (existsSync(f.lab)) copy(f.lab, f.base);
  console.log(`${DRY ? '（dry-run）' : ''}基準を保存しました: ${textFiles.length} ファイル → .lab-base/`);
  process.exit(0);
}

const merge3 = (site, base, lab) => {
  try {
    const out = execFileSync('git', ['merge-file', '-p', '-L', 'サイト', '-L', '前回取り込み', '-L', 'ラボ', site, base, lab]);
    return { conflicts: 0, out };
  } catch (e) {
    // 終了コードは競合の数。負の値（255）はエラー
    if (typeof e.status === 'number' && e.status > 0 && e.status < 128) return { conflicts: e.status, out: e.stdout };
    throw e;
  }
};

const result = { added: [], applied: [], merged: [], conflicts: [], forced: [], resolved: [], images: [], notes: [] };
const rel = (p) => relative(root, p);

for (const f of textFiles) {
  if (RETIRED.has(f.slug)) continue;
  if (!existsSync(f.lab)) continue;

  if (forced.has(f.slug)) {
    copy(f.lab, f.site);
    copy(f.lab, f.base);
    result.forced.push(rel(f.site));
    continue;
  }

  if (resolved.has(f.slug)) {
    // 競合は手で反映済み。サイトの記事は触らず、次回からいまのラボの内容を基準にする
    copy(f.lab, f.base);
    result.resolved.push(rel(f.site));
    continue;
  }

  if (!existsSync(f.site)) {
    if (existsSync(f.base)) {
      result.notes.push(`${f.slug}: サイト側で削除済み。取り込まない場合は scripts/sync-articles.mjs の RETIRED に追加する`);
    } else {
      copy(f.lab, f.site);
      copy(f.lab, f.base);
      result.added.push(rel(f.site));
    }
    continue;
  }

  if (!existsSync(f.base)) {
    if (!same(f.site, f.lab)) {
      result.notes.push(`${f.slug}: 基準（.lab-base）が無いのでマージできない。diff で確認して手で反映する`);
    }
    continue;
  }

  if (same(f.lab, f.base)) continue; // ラボ側は前回から変わっていない

  if (same(f.site, f.base) || same(f.site, f.lab)) {
    // サイト側は手を入れていない（またはすでに同じ内容）→ ラボの内容をそのまま使う
    copy(f.lab, f.site);
    copy(f.lab, f.base);
    result.applied.push(rel(f.site));
    continue;
  }

  const { conflicts, out } = merge3(f.site, f.base, f.lab);
  if (conflicts === 0) {
    write(f.site, out);
    copy(f.lab, f.base);
    result.merged.push(rel(f.site));
  } else {
    const dest = join(conflictDir, relative(root, f.site));
    write(dest, out);
    result.conflicts.push(`${rel(f.site)}（競合 ${conflicts} 箇所）→ ${rel(dest)}`);
  }
}

// スクリーンショットはサイト側で編集しないので、新規・変更をそのまま反映する
for (const lab of walk(join(labDocs, 'screenshots'))) {
  const dest = join(root, 'src/content/screenshots', relative(join(labDocs, 'screenshots'), lab));
  if (same(lab, dest)) continue;
  result.images.push(`${existsSync(dest) ? '更新' : '追加'} ${rel(dest)}`);
  copy(lab, dest);
}

const print = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label}（${list.length}）`);
  for (const line of list) console.log(`  ${line}`);
};

if (DRY) console.log('（--dry-run: 何も書き込んでいません）');
print('新しい記事を追加', result.added);
print('ラボの更新をそのまま反映（サイト側で手を入れていない記事）', result.applied);
print('自動マージ（サイト側の変更を残してラボの更新を合成）', result.merged);
print('--force で上書き', result.forced);
print('--resolved で基準を更新（記事は変更していない）', result.resolved);
print('競合: サイトの記事は変更していない。競合ファイルを見て手で反映する', result.conflicts);
print('スクリーンショット', result.images);
print('確認が必要', result.notes);

const changed = Object.values(result).some((l) => l.length);
if (!changed) console.log('ラボ側に新しい変更はありません。');
if (result.added.some((f) => f.includes('src/content/articles'))) {
  console.log('\n新しい記事は src/lib/hubs.ts のどれかのハブに追加してください（未所属だとビルドが失敗します）。');
}
if (result.merged.length || result.applied.length) {
  console.log('\n反映した記事は git diff で内容を確認してから commit してください。');
}
if (result.conflicts.length) {
  console.log('\n競合ファイルの <<<<<<< サイト / ======= / >>>>>>> ラボ を見て、残す内容をサイトの記事に手で反映する。');
  console.log('反映し終えたら pnpm sync:articles --resolved <slug> で基準を進める（しないと次回も同じ競合が出る）。');
  process.exitCode = 2;
}
