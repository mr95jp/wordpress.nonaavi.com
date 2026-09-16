// OG 画像（SNS 共有時に出るカード画像）を public/og/ に書き出す。
//
//   pnpm og        変更・不足分だけ作る
//   pnpm og --all  全部作り直す
//
// 日本語フォントを使うため、生成はこの Mac で行い、できた PNG を git に入れる。
// Cloudflare のビルド環境には日本語フォントが無く、豆腐（□）になるため。

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/og');
const ALL = process.argv.includes('--all');

const SITE_NAME = 'WP復旧ラボ';
const TAGLINE = '実際に壊して測った WordPress のトラブル対処';
const FONT = 'Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif';

// 全角 1・半角 0.5 で数えた「表示幅」
const width = (s) => [...s].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0);

// 太字の実測では 1 文字が font-size の約 1.15 倍の幅を取る（見積もりが甘いと右端で切れる）
const CHAR_RATIO = 1.15;
const TEXT_WIDTH = 1040; // 左右 80px の余白を引いた描画幅

/** 折り返す。maxLines を超える分は末尾を … にする */
const wrap = (text, fontSize, maxLines) => {
  const max = TEXT_WIDTH / (fontSize * CHAR_RATIO);
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (width(line + ch) > max && line) {
      lines.push(line);
      line = '';
    }
    line += ch;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1];
    lines.length = maxLines;
    lines[maxLines - 1] = [...last].slice(0, -1).join('') + '…';
  }
  return lines;
};

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const svgFor = (title, label) => {
  const size = width(title) > 30 ? 50 : 58;
  const lines = wrap(title, size, 3);
  const startY = 300 - ((lines.length - 1) * (size + 18)) / 2;
  const text = lines
    .map(
      (l, i) =>
        `<text x="80" y="${startY + i * (size + 18)}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="#1d1f21">${escapeXml(l)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect x="0" y="0" width="1200" height="630" fill="#fbfbf9"/>
  <text x="80" y="140" font-family="${FONT}" font-size="30" font-weight="700" fill="#1f5fbf">${escapeXml(label)}</text>
  ${text}
  <text x="80" y="546" font-family="${FONT}" font-size="30" font-weight="700" fill="#1d1f21">${escapeXml(SITE_NAME)}</text>
  <text x="80" y="590" font-family="${FONT}" font-size="26" fill="#5f6368">${escapeXml(TAGLINE)}</text>
</svg>`;
};

// 記事: front matter の title（H1）を使う
const articlesDir = join(root, 'src/content/articles');
const pages = readdirSync(articlesDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const src = readFileSync(join(articlesDir, f), 'utf8');
    const title = src.match(/^title:\s*"(.+)"\s*$/m)?.[1] ?? f;
    return { path: `/${f.replace(/\.md$/, '')}`, title, label: '症状から切り分ける' };
  });

// 症状別ハブ: hubs.ts から id と title を読む
const hubsSrc = readFileSync(join(root, 'src/lib/hubs.ts'), 'utf8');
for (const m of hubsSrc.matchAll(/id: '([a-z-]+)',\s*\n\s*label: '[^']*',\s*\n\s*title: '([^']+)'/g)) {
  pages.push({ path: `/topics/${m[1]}`, title: m[2], label: '症状から探す' });
}

pages.push(
  { path: '/index', title: 'WordPress の不具合を、見えている症状から切り分ける', label: '' },
  { path: '/symptoms', title: '症状と直前の操作から原因を引く', label: '索引' },
  { path: '/plugins', title: 'プラグイン名から不具合の原因を引く', label: '索引' },
  { path: '/about', title: 'このサイトについて', label: '' },
  { path: '/privacy', title: 'プライバシーポリシー', label: '' },
  { path: '/default', title: 'WordPress のトラブルを実測で切り分ける', label: '' },
);

if (ALL && existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

let made = 0;
let kept = 0;
for (const page of pages) {
  const dest = join(outDir, `${page.path}.png`);
  const svg = svgFor(page.title, page.label);
  const sidecar = `${dest}.svg`; // 元にした SVG。タイトルが変わったかの判定に使う
  if (!ALL && existsSync(dest) && existsSync(sidecar) && readFileSync(sidecar, 'utf8') === svg) {
    kept++;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  // 文字と単色の背景だけなので、色数を絞ると 1/10 以下になる
  await sharp(Buffer.from(svg)).png({ palette: true, colours: 32, compressionLevel: 9 }).toFile(dest);
  writeFileSync(sidecar, svg);
  made++;
}

console.log(`OG 画像: ${made} 枚を生成、${kept} 枚は変更なし（${outDir.replace(root + '/', '')}）`);
