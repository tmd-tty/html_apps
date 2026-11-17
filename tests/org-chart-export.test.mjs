// Org Chart Editor の PowerPoint の中身: リーダーの目印、備考、色、別スライドの案内、はみ出し
import { chromium } from 'playwright-core';
import { appPath, outDir, unzipFile, badXml } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 120000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });
const OUT = outDir('org-chart-export');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const open = async (name, nodes) => { await page.setInputFiles('#fileInput', { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ nodes })) }); await page.waitForSelector('.card'); };
const dl = async (f) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#pptx')]); await d.saveAs(`${OUT}/${f}`); return unzipFile(`${OUT}/${f}`); };
const slides = (z) => Object.keys(z).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
const shapes = (xml) => [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => {
  const s = m[0], [, x, y] = s.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/) || [], [, cx, cy] = s.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/) || [];
  return { name: (s.match(/name="([^"]*)"/) || [])[1], x: +x, y: +y, cx: +cx, cy: +cy, fill: (s.match(/<a:solidFill><a:srgbClr val="(\w+)"/) || [])[1], text: [...s.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('\n') };
});

await page.goto(`file://${appPath('org-chart-editor')}`);
await page.waitForSelector('.empty');

// ---- 中身 ----
await open('small.json', [{ group: '本部', leaders: ['山田', '田中'], members: ['佐藤', '鈴木'], note: '週次で報告\n事務局は総務', color: 'blue', children: [{ group: '開発部', leaders: ['高橋'], members: [], children: [] }] }]);
const p = await dl('small.pptx');
ok('xml valid', (await badXml(page, p)).length === 0);
const [w, h] = (p['ppt/presentation.xml'].match(/<p:sldSz cx="(\d+)" cy="(\d+)"/) || []).slice(1).map(Number);
const s1 = shapes(p[slides(p)[0]]);
const head = s1.find((s) => s.name === 'グループ: 本部'), body = s1.find((s) => s.name === '本文: 本部');
ok('group header shape with color', head && head.text === '本部' && head.fill === '2A70C8', JSON.stringify(head));
ok('leaders marked with ★, no role labels', body && body.text.split('\n')[0] === '山田★、田中★' && !/リーダー|メンバー/.test(body.text), body && body.text);
ok('members line', body.text.split('\n')[1] === '佐藤、鈴木');
ok('note lines', body.text.includes('週次で報告\n事務局は総務'), body.text);
ok('default header color', s1.find((s) => s.name === 'グループ: 開発部').fill === 'B81D2A');
ok('connector lines', s1.filter((s) => s.name === '接続線').length === 2);
ok('no images', !p[slides(p)[0]].includes('<p:pic>'));
ok('fits on slide', s1.every((s) => s.x >= 0 && s.y >= 0 && s.x + s.cx <= w + 9000 && s.y + s.cy <= h + 9000));

// ---- 大きな組織の分割 ----
await open('huge.json', [{ group: '全社', leaders: ['社長'], children: Array.from({ length: 12 }, (_, i) => ({ group: `本部${i + 1}`, leaders: ['本部長'], children: Array.from({ length: 4 }, (_, j) => ({ group: `部${i + 1}-${j + 1}`, members: ['A', 'B'], children: [] })) })) }]);
const q = await dl('huge.pptx');
const list = slides(q);
ok('split into several slides', list.length > 3, String(list.length));
ok('overview notes children on other slides', q[list[0]].includes('配下 4 グループは別スライド'));
ok('detail slide titled by group', q[list[list.length - 1]].includes('/ 本部12'));
const sizes = list.flatMap((n) => [...q[n].matchAll(/<a:rPr[^>]*sz="(\d+)"/g)].map((m) => +m[1] / 100));
ok('text stays readable (>= 6pt)', Math.min(...sizes) >= 6, String(Math.min(...sizes)));
ok('all slides fit', list.every((n) => shapes(q[n]).every((s) => s.x >= 0 && s.y >= 0 && s.x + s.cx <= w + 9000 && s.y + s.cy <= h + 9000)));

console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
