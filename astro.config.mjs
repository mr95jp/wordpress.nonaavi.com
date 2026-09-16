// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { rehypeHeadingIds, unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import remarkCjkFriendly from 'remark-cjk-friendly';
import { rehypeArticleLayout, remarkArticleLinks } from './src/lib/markdown.mjs';

const SITE = 'https://wordpress.noanavi.com';

// status: draft の記事はサイトマップから外す（ページ側でも noindex を出す）
const articlesDir = new URL('./src/content/articles/', import.meta.url);
const articleFiles = readdirSync(articlesDir).filter((f) => f.endsWith('.md'));
const draftPaths = new Set(
  articleFiles
    .filter((f) => /^status:\s*draft\s*$/m.test(readFileSync(new URL(f, articlesDir), 'utf8')))
    .map((f) => `${SITE}/${f.replace(/\.md$/, '')}/`),
);

// サイトマップの lastmod。updated > published > verified の順で新しい日付を使う
const lastmod = new Map(
  articleFiles.map((f) => {
    const src = readFileSync(new URL(f, articlesDir), 'utf8');
    const date = (key) => src.match(new RegExp(`^${key}:\\s*(\\d{4}-\\d{2}-\\d{2})`, 'm'))?.[1];
    return [`${SITE}/${f.replace(/\.md$/, '')}/`, date('updated') ?? date('published') ?? date('verified')];
  }),
);

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',

  // 統合した記事。配信先の 301 は public/_redirects、ここは静的ホスト向けの予備
  redirects: {
    '/rest-api-fatal-http200': '/http-200-when-site-is-down/',
  },

  integrations: [
    sitemap({
      filter: (page) => !draftPaths.has(page),
      serialize: (item) => {
        const date = lastmod.get(item.url);
        return date ? { ...item, lastmod: `${date}T00:00:00+09:00` } : item;
      },
    }),
  ],

  markdown: {
    processor: unified({
      // 「…。**次の文」のように約物に隣接する ** を CommonMark は太字にしない
      remarkPlugins: [remarkCjkFriendly, remarkArticleLinks],
      // 見出しの id を付ける処理を先に走らせる（後ろだと id が無く、見出しリンクを足せない）
      rehypePlugins: [rehypeHeadingIds, rehypeArticleLayout],
      // 記事中の "--skip-plugins" や引用符を記号に変換させない
      smartypants: false,
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});