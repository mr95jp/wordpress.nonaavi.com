// src/content/indexes/plugins.md の表を読み取り、プラグイン名ごとに組み替える。
// 表の中身はラボ側の plugins.md が元なので、ここでは解析だけを行う（内容を書かない）。

// ビルド時にバンドルされるよう ?raw で取り込む（fs で読むとパスがずれる）
import md from '../content/indexes/plugins.md?raw';

export type Link = { text: string; href: string };
export type Row = { symptom: string; cause?: string; links: Link[]; category: string; measured: boolean };
export type Plugin = { name: string; id: string; rows: Row[]; note?: string; measured: boolean };

/** 「引き金はプラグイン…」の節に出てくる、製品名ではない行のまとめ先 */
const GENERIC = 'プラグイン全般';

const id = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'other';

/** `[文言](articles/slug.md)` → { text, href: '/slug/' } */
const parseLinks = (cell: string): Link[] =>
  [...cell.matchAll(/\[([^\]]+)\]\((?:articles\/)?([a-z0-9-]+)\.md\)/g)].map((m) => ({
    text: m[1],
    href: `/${m[2]}/`,
  }));

/** 強調や記事リンクを外した、読める文字列にする */
const plain = (cell: string) =>
  cell
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();

const splitPlugins = (cell: string) =>
  plain(cell)
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

export function readPluginIndex(): { plugins: Plugin[]; intro: string[] } {
  const lines = md.split('\n');
  const intro: string[] = [];
  const byName = new Map<string, Plugin>();

  let category = '';
  let measuredTable = false; // 「プラグイン固有の挙動を実測したもの」の表か
  let inTable = false;
  let lastPlugins: string[] = [];
  let pendingNoteFor: string[] = [];

  const add = (names: string[], row: Omit<Row, 'category' | 'measured'>) => {
    for (const name of names) {
      const key = /[A-Za-z]/.test(name) ? name : GENERIC;
      const p = byName.get(key) ?? { name: key, id: id(key), rows: [], measured: false };
      p.rows.push({ ...row, category, measured: measuredTable });
      if (measuredTable) p.measured = true;
      byName.set(key, p);
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('## ')) {
      const heading = line.slice(3);
      measuredTable = heading.includes('実測したもの');
      category = '';
      inTable = false;
      // 表より後ろの節（「プラグインを疑う前に取る値」など）は plugins.astro が持つ
      if (heading.includes('疑う前に')) break;
      continue;
    }
    if (line.startsWith('### ')) {
      category = line.slice(4);
      inTable = false;
      continue;
    }

    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1);
      if (/^[\s:-]+$/.test(cells.join(''))) continue; // 区切り行
      if (!inTable) {
        inTable = true; // 見出し行
        continue;
      }
      const [pluginCell, symptomCell, third, fourth] = cells;
      const names = /^\s*同上/.test(plain(pluginCell)) ? lastPlugins : splitPlugins(pluginCell);
      if (!names.length) continue;
      lastPlugins = names;
      const qualifier = /^\s*同上を(.+)$/.exec(plain(pluginCell))?.[1];
      const symptom = plain(symptomCell) + (qualifier ? `（${qualifier.trim()}）` : '');
      const linkCell = fourth ?? third ?? '';
      add(names, {
        symptom,
        cause: fourth ? plain(third) : undefined,
        links: parseLinks(linkCell),
      });
      pendingNoteFor = names;
      continue;
    }

    if (inTable && line.startsWith('**')) {
      // 表の直後の太字の一文は、その表のプラグインへの注意書き
      const note = plain(line);
      for (const name of pendingNoteFor) {
        const p = byName.get(/[A-Za-z]/.test(name) ? name : GENERIC);
        if (p && !p.note) p.note = note;
      }
      continue;
    }
    if (!line) inTable = false;
    if (!category && !inTable && line && !line.startsWith('#') && !line.startsWith('---') && intro.length < 3) {
      intro.push(plain(line));
    }
  }

  // 同じ記事を指す行はまとめる（別の表に似た症状が重複して載っているため）
  for (const plugin of byName.values()) {
    const merged = new Map<string, Row>();
    for (const row of plugin.rows) {
      const key = row.links[0]?.href ?? row.symptom;
      const found = merged.get(key);
      if (!found) {
        merged.set(key, row);
        continue;
      }
      if (!found.cause && row.cause) found.cause = row.cause; // 原因はより詳しいほうを残す
      for (const link of row.links) {
        if (!found.links.some((l) => l.href === link.href)) found.links.push(link);
      }
    }
    plugin.rows = [...merged.values()];
  }

  // 実測した専用記事があるものを先頭に、あとは登場順
  const plugins = [...byName.values()].sort((a, b) => Number(b.measured) - Number(a.measured));
  return { plugins, intro };
}
