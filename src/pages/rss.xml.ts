import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION, SITE_NAME } from '../lib/site';

export async function GET(context: APIContext) {
  const articles = (await getCollection('articles'))
    .filter((a) => a.data.status === 'published')
    .map((a) => ({ entry: a, date: a.data.published ?? a.data.verified }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return rss({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    site: context.site ?? 'https://wordpress.noanavi.com',
    items: articles.map(({ entry, date }) => ({
      title: entry.data.title,
      description: entry.data.description,
      link: `/${entry.id}/`,
      pubDate: date,
    })),
    customData: '<language>ja</language>',
  });
}
