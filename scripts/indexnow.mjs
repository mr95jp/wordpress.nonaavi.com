// 更新した URL を IndexNow に通知する（Bing・Yandex・Naver などが受け取る。Google は非対応）。
//
//   pnpm indexnow                 サイトマップに載っている全 URL を送る
//   pnpm indexnow /slug/ /other/  指定した URL だけ送る
//   pnpm indexnow --dry-run       送らずに内容だけ表示する
//
// 鍵は public/<鍵>.txt というファイル名そのもの。デプロイ済みでないと検証に失敗する。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://wordpress.noanavi.com';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const given = args.filter((a) => !a.startsWith('--'));

// 鍵ファイル（public/ にある 8〜128 文字の 16 進数 .txt）を探す
const keyFile = readdirSync(join(root, 'public')).find((f) => /^[a-f0-9]{8,128}\.txt$/.test(f));
if (!keyFile) {
  console.error('public/ に鍵ファイルが見つかりません（例: public/<16進数>.txt）');
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, '');

/** 送る URL を決める。指定が無ければサイトマップから読む（= 公開済みのページだけ） */
const urlList = given.length
  ? given.map((u) => (u.startsWith('http') ? u : `${SITE}${u.startsWith('/') ? '' : '/'}${u}`))
  : (() => {
      const sitemap = join(root, 'dist/sitemap-0.xml');
      if (!existsSync(sitemap)) {
        console.error('dist/sitemap-0.xml がありません。先に pnpm build を実行してください。');
        process.exit(1);
      }
      return [...readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    })();

console.log(`鍵: ${key}（${SITE}/${keyFile}）`);
console.log(`送信する URL: ${urlList.length} 件`);
for (const u of urlList.slice(0, 5)) console.log(`  ${u}`);
if (urlList.length > 5) console.log(`  ...ほか ${urlList.length - 5} 件`);

if (DRY) {
  console.log('\n--dry-run: 送信していません。');
  process.exit(0);
}

// 鍵ファイルが公開されているか先に確認する（未デプロイだと 403 で弾かれる）
const keyCheck = await fetch(`${SITE}/${keyFile}`).catch(() => null);
if (!keyCheck?.ok || (await keyCheck.text()).trim() !== key) {
  console.error(`\n鍵ファイルが公開されていません: ${SITE}/${keyFile}`);
  console.error('デプロイが終わってから実行してください。');
  process.exit(1);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList }),
});

const body = await res.text();
console.log(`\n応答: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);

// 200/202 が成功。それ以外は原因を出す
const reason = {
  400: 'リクエストの形式が正しくない',
  403: '鍵が確認できない（鍵ファイルが公開されているか確認する）',
  422: 'URL がこのサイトのものではない、または鍵が一致しない',
  429: '送りすぎ。しばらく待つ',
}[res.status];
if (!res.ok) {
  console.error(reason ? `原因: ${reason}` : '不明なエラー');
  process.exit(1);
}
console.log('送信しました。Bing の索引への反映は数時間から数日かかります。');
