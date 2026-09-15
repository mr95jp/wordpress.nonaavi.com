// 検証ラボ（wp.noanavi.com/docs）から新しい記事とスクリーンショットを取り込む。
//
// サイト側の記事は公開用に手を入れる（結論ボックスなど）ため、
// 既にある記事は上書きしない。差分があるものは一覧に出すだけ。
//
//   pnpm sync:articles                 新規だけ取り込む
//   pnpm sync:articles --force <slug>  指定した記事をラボの内容で上書き

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const labDocs = process.env.LAB_DOCS ?? join(root, '../wp.noanavi.com/docs');
// サイト側で統合・廃止した記事。ラボに残っていても取り込まない（転送は public/_redirects）
const RETIRED = new Set(['rest-api-fatal-http200']);
const forceIndex = process.argv.indexOf('--force');
const forced = new Set(forceIndex >= 0 ? process.argv.slice(forceIndex + 1) : []);

if (!existsSync(labDocs)) {
  console.error(`ラボの docs が見つかりません: ${labDocs}（LAB_DOCS で指定できます）`);
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const added = [];
const overwritten = [];
const diverged = [];

for (const [from, to] of [
  ['articles', 'src/content/articles'],
  ['screenshots', 'src/content/screenshots'],
]) {
  for (const src of walk(join(labDocs, from))) {
    const rel = relative(join(labDocs, from), src);
    const dest = join(root, to, rel);
    const slug = rel.replace(/\.md$/, '');
    if (RETIRED.has(slug)) continue;

    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      added.push(join(to, rel));
    } else if (!readFileSync(src).equals(readFileSync(dest))) {
      if (forced.has(slug)) {
        copyFileSync(src, dest);
        overwritten.push(join(to, rel));
      } else {
        diverged.push(join(to, rel));
      }
    }
  }
}

const print = (label, list) => list.length && console.log(`${label}\n${list.map((f) => `  ${f}`).join('\n')}`);
print('追加:', added);
print('上書き:', overwritten);
print('ラボ側と内容が違う（上書きしていない）:', diverged);
if (added.some((f) => f.endsWith('.md'))) {
  console.log('\n新しい記事は src/lib/hubs.ts のどれかのハブに追加してください（未所属だとビルドが失敗します）。');
}
if (!added.length && !overwritten.length) console.log('新しいファイルはありません。');
