// ビルド結果（dist/）を検査する。
//
//   pnpm check:site                   全体を検査（先に pnpm build が必要）
//   pnpm check:site --slug a,b        警告の表示を指定した記事に絞る
//
// エラー（終了コード 1）: リンク切れ / 太字にならず残った ** / noindex と status の不一致
// 警告: 結論ボックスが無い / 再現手順の外にラボ専用の記述がある

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const articlesDir = join(root, 'src/content/articles');

const slugArg = process.argv.indexOf('--slug');
const only = slugArg >= 0 ? new Set(process.argv[slugArg + 1].split(',')) : null;

if (!existsSync(dist)) {
  console.error('dist/ がありません。先に pnpm build を実行してください。');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const stripCode = (html) =>
  html
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/<code[\s\S]*?<\/code>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');

// 読者の環境では使えない、検証ラボ固有の記述。
// prose: true は地の文だけを見る（実測した出力の中の localhost などは証拠なので残す）
const LAB_PATTERNS = [
  { re: /localhost:(8080|8082|8025)/g, label: 'localhost:808x', prose: true },
  { re: /このラボ|検証ラボ/g, label: '「ラボ」表記', prose: true },
  { re: /bin\/(diagnose|verify|seed|logs|snapshot|restore)\.sh/g, label: 'bin/*.sh', prose: false },
  { re: /docker compose/g, label: 'docker compose', prose: false },
  { re: /src\/wp-content|src\/\.htaccess/g, label: 'src/ パス', prose: false },
];

const errors = [];
const warnings = [];
const pages = walk(dist).filter((f) => f.endsWith('.html'));

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const page = '/' + relative(dist, file).split(sep).join('/').replace(/index\.html$/, '');

  // 転送用のページは検査しない
  if (html.includes('http-equiv="refresh"')) continue;

  for (const [, href] of html.matchAll(/href="(\/[^"#]*)(?:#[^"]*)?"/g)) {
    if (!href || href === '/') continue;
    const target = join(dist, href);
    if (!existsSync(target) && !existsSync(join(target, 'index.html'))) {
      errors.push(`${page}: リンク切れ ${href}`);
    }
  }

  const stars = (stripCode(html).match(/\*\*/g) ?? []).length;
  if (stars) errors.push(`${page}: 太字にならず残った ** が ${stars} 個`);

  // 検索結果での表示幅。全角 32 文字相当で切られる（半角は 0.5 で数える）
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const titleWidth = [...title].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0);
  if (titleWidth > 32) warnings.push(`${page}: title が全角 ${titleWidth} 文字相当（32 を超えると検索結果で切れる）`);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (desc && desc.length > 120) warnings.push(`${page}: description が ${desc.length} 文字（120 文字程度に）`);
  if (!desc && !html.includes('http-equiv="refresh"')) warnings.push(`${page}: description が無い`);
  if (!html.includes('property="og:image"')) warnings.push(`${page}: og:image が無い`);
}

const articles = readdirSync(articlesDir).filter((f) => f.endsWith('.md'));
const sitemap = existsSync(join(dist, 'sitemap-0.xml')) ? readFileSync(join(dist, 'sitemap-0.xml'), 'utf8') : '';
const summary = { draft: 0, published: 0, noSummary: [] };

for (const file of articles) {
  const slug = file.replace(/\.md$/, '');
  const source = readFileSync(join(articlesDir, file), 'utf8');
  const status = source.match(/^status:\s*(\S+)/m)?.[1];
  const htmlPath = join(dist, slug, 'index.html');

  if (!existsSync(htmlPath)) {
    errors.push(`/${slug}/: ページが出力されていない`);
    continue;
  }
  const html = readFileSync(htmlPath, 'utf8');
  // 本文のコード例（&#x3C;meta name="robots" ...）に反応しないよう、タグの先頭から照合する
  const noindex = html.includes('<meta name="robots" content="noindex"');
  const inSitemap = sitemap.includes(`/${slug}/<`);

  if (status === 'draft') {
    summary.draft++;
    if (!noindex) errors.push(`/${slug}/: draft なのに noindex が無い`);
    if (inSitemap) errors.push(`/${slug}/: draft なのにサイトマップに載っている`);
  } else {
    summary.published++;
    if (noindex) errors.push(`/${slug}/: published なのに noindex が付いている`);
    if (!inSitemap) errors.push(`/${slug}/: published なのにサイトマップに無い`);
  }

  if (only && !only.has(slug)) continue;

  if (!html.includes('class="summary"')) summary.noSummary.push(slug);

  const body = html.match(/<div class="prose">([\s\S]*)<\/article>/)?.[1] ?? '';
  const outsideRepro = body.replace(/<details class="repro">[\s\S]*?<\/details>/g, '');
  const prose = stripCode(outsideRepro).replace(/<table[\s\S]*?<\/table>/g, '');
  const found = LAB_PATTERNS.map(({ re, label, prose: proseOnly }) => [
    label,
    ((proseOnly ? prose : outsideRepro).match(re) ?? []).length,
  ]).filter(([, n]) => n > 0);
  if (found.length) {
    warnings.push(`/${slug}/: 再現手順の外にラボ専用の記述 — ${found.map(([l, n]) => `${l}×${n}`).join(', ')}`);
  }
}

const print = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label}（${list.length}）`);
  for (const line of list) console.log(`  ${line}`);
};

console.log(`ページ ${pages.length} / 記事 ${articles.length}（draft ${summary.draft}・published ${summary.published}）`);
print('エラー', errors);
print('警告', warnings);
print('結論ボックスが無い記事', summary.noSummary);
if (!errors.length) console.log('\nエラーはありません。');
process.exit(errors.length ? 1 : 0);
