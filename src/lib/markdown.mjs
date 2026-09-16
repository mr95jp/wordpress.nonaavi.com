// 元記事（wp.noanavi.com/docs）の Markdown をサイト用に変換する plugin。
// 記事本体には手を入れず、ここで吸収する。

const INDEX_PAGES = { symptoms: '/symptoms/', plugins: '/plugins/', 'error-catalog': '/symptoms/' };

/** `recovery-without-wp-cli.md` / `articles/x.md` → `/x/` */
export function remarkArticleLinks() {
  const walk = (node) => {
    if (node.type === 'link' && typeof node.url === 'string') {
      const m = node.url.match(/^(?:\.\/)?(?:\.\.\/)?(?:articles\/)?([a-z0-9-]+)\.md(#.*)?$/);
      if (m) node.url = (INDEX_PAGES[m[1]] ?? `/${m[1]}/`) + (m[2] ?? '');
    }
    node.children?.forEach(walk);
  };
  return walk;
}

const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('');

const isH2 = (node) => node.type === 'element' && node.tagName === 'h2';

/**
 * 表をスマホで横スクロールさせるためにラップする。
 * `## 再現手順` 以降の節は検証環境でしか使えないコマンドが並ぶため折りたたむ。
 */
/** 見出しに、その節へのリンクを足す（長い記事の節を共有できるように） */
const addHeadingLinks = (node) => {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === 'element' && /^h[23]$/.test(child.tagName) && child.properties?.id) {
      child.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          className: ['heading-link'],
          href: `#${child.properties.id}`,
          'aria-label': `${textOf(child)} へのリンク`,
        },
        children: [{ type: 'text', value: '#' }],
      });
    }
    addHeadingLinks(child);
  }
};

/** 表の見出しセルに scope を付ける（読み上げで列の対応が分かるように） */
const addThScope = (node) => {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === 'element' && child.tagName === 'th') {
      child.properties = { ...child.properties, scope: 'col' };
    }
    addThScope(child);
  }
};

/** 最初の画像は画面上部に来るので遅延読み込みにしない（表示が遅くなる） */
const eagerFirstImage = (node, state = { done: false }) => {
  if (state.done || !node.children) return state;
  for (const child of node.children) {
    if (state.done) break;
    if (child.type === 'element' && child.tagName === 'img') {
      child.properties = { ...child.properties, loading: 'eager', fetchpriority: 'high' };
      state.done = true;
      break;
    }
    eagerFirstImage(child, state);
  }
  return state;
};

export function rehypeArticleLayout() {
  const wrapTables = (node) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type === 'element' && child.tagName === 'table') {
        addThScope(child);
        return {
          type: 'element',
          tagName: 'div',
          properties: {
            className: ['table-wrap'],
            // キーボードでも横スクロールできるようにする
            tabindex: '0',
            role: 'region',
            'aria-label': '表（横にスクロールできます）',
          },
          children: [child],
        };
      }
      wrapTables(child);
      return child;
    });
  };

  return (tree) => {
    wrapTables(tree);
    addHeadingLinks(tree);
    eagerFirstImage(tree);

    const out = [];
    const children = tree.children;
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (!(isH2(node) && textOf(node).startsWith('再現手順'))) {
        out.push(node);
        continue;
      }
      const body = [];
      while (i + 1 < children.length && !isH2(children[i + 1])) body.push(children[++i]);
      out.push({
        type: 'element',
        tagName: 'details',
        properties: { className: ['repro'] },
        children: [{ type: 'element', tagName: 'summary', properties: {}, children: [node] }, ...body],
      });
    }
    tree.children = out;
  };
}
