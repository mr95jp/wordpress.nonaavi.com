import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    seo_title: z.string(),
    description: z.string(),
    keywords: z.string().optional(), // 狙い語の管理用。ページには出さない
    category: z.enum(['障害報告', '技術メモ']),
    // `503` のような数字だけのタグは YAML で数値になるので文字列に揃える
    tags: z.array(z.union([z.string(), z.number()]).transform(String)).default([]),
    status: z.enum(['draft', 'published']),
    verified: z.coerce.date(),
    published: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    env: z.string().optional(), // 例: "WordPress 6.8 / PHP 8.2 / Apache・nginx"
    summary: z.string().optional(), // 「この記事の結論」ボックス
    related: z.array(z.string()).optional(),
  }),
});

// symptoms.md / plugins.md（索引ページ）
const indexes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/indexes' }),
});

export const collections = { articles, indexes };
