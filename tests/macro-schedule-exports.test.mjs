// Macro Schedule Editor の出力の中身: PowerPoint のスライド分割、長期間、色、はみ出し。Excel のセル固定位置、結合セル、色
import { chromium } from 'playwright-core';
import { appPath, outDir, unzipFile, badXml } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });
const OUT = outDir('macro-schedule-exports');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };

const T = (g, n, s, e, extra = {}) => ({ group: g, name: n, start: s, end: e, highlight: false, ...extra });
const M = (g, n, d, extra = {}) => ({ type: 'milestone', group: g, name: n, date: d, highlight: false, ...extra });
const open = async (name, tasks) => { await page.setInputFiles('#fileInput', { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, tasks })) }); await page.waitForFunction((n) => document.getElementById('status').textContent.includes(n), name); };
const dl = async (btn, f) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(btn)]); await d.saveAs(`${OUT}/${f}`); return unzipFile(`${OUT}/${f}`); };
const slides = (z) => Object.keys(z).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
/** 名前付きの図形ごとに、位置と色を取り出す(グループの外枠は除く) */
const shapes = (xml) => [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => {
  const s = m[0], name = (s.match(/<p:cNvPr id="\d+" name="([^"]*)"/) || [])[1] || '';
  const [, x, y] = s.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/) || [], [, cx, cy] = s.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/) || [];
  return { name, x: +x, y: +y, cx: +cx, cy: +cy, fill: (s.match(/<a:solidFill><a:srgbClr val="(\w+)"/) || [])[1] };
});
const outside = (list, w, h) => list.filter((s) => s.x < 0 || s.y < 0 || s.x + s.cx > w + 9000 || s.y + s.cy > h + 9000).map((s) => s.name);

await page.goto(`file://${appPath('macro-schedule-editor')}`);
await page.waitForSelector('table');

// ---- PowerPoint: 色と分割 ----
const sample = [
  T('企画', '青いバー', '2026-04', '2026-06', { color: 'blue' }),
  T('企画', '強調バー', '2026-05', '2026-08', { highlight: true }),
  M('企画', '緑の節目', '2026-07-15', { color: 'green' }),
  ...Array.from({ length: 26 }, (_, i) => T('開発', `作業${i + 1}`, '2026-04', '2026-09')),
];
await open('many.json', sample);
const p = await dl('#pptx', 'many.pptx');
ok('pptx xml valid', (await badXml(page, p)).length === 0);
const [w, h] = (p['ppt/presentation.xml'].match(/<p:sldSz cx="(\d+)" cy="(\d+)"/) || []).slice(1).map(Number);
const list = slides(p);
ok('31 rows split into 2 slides', list.length === 2, String(list.length));
ok('page numbers', p[list[0]].includes('1 / 2') && p[list[1]].includes('2 / 2'));
ok('group header not orphaned at slide end', !/<a:t>開発 \(26件\)<\/a:t>[\s\S]*$/.test(p[list[0]].split('タスク名:').pop() || ''));
const all = list.flatMap((n) => shapes(p[n]));
ok('every shape fits on the slide', outside(all, w, h).length === 0, outside(all, w, h).join());
const byName = (n) => all.find((s) => s.name === n);
ok('custom color on bar', byName('バー: 青いバー')?.fill === '2A70C8', byName('バー: 青いバー')?.fill);
ok('highlight color on bar', byName('バー: 強調バー')?.fill === 'C8102E', byName('バー: 強調バー')?.fill);
ok('custom color on milestone', byName('マイルストーン: 緑の節目')?.fill === '2E9E5B');
ok('every slide is one group', list.every((n) => (p[n].match(/name="スケジュール全体"/g) || []).length === 1));

// ---- PowerPoint: 長期間 ----
await open('long.json', [T('', '長期', '2019-04', '2031-03'), M('', '終端', '2031-03-31')]);
const pl = await dl('#pptx', 'long.pptx');
const sl = shapes(pl[slides(pl)[0]]);
// マイルストーンの名前を出す余白として、暦の末尾に2か月を足すので 144 + 2
ok('long range: month headers incl. margin', sl.filter((s) => s.name.startsWith('月: ')).length === 146);
ok('long range fits on the slide', outside(sl, w, h).length === 0, outside(sl, w, h).join());
ok('long range: era boundary 令和元年度', pl[slides(pl)[0]].includes('令和元年度'));

// ---- Excel ----
await open('cells.json', [T('企画', '要件定義', '2026-04', '2026-06', { color: 'blue' }), T('企画', '予算', '2026-05', '2026-08', { highlight: true }), M('企画', '承認', '2026-06-30'), T('', '全体', '2026-04', '2027-03')]);
const x = await dl('#xlsx', 'cells.xlsx');
ok('xlsx xml valid', (await badXml(page, x)).length === 0);
const sheet = x['xl/worksheets/sheet1.xml'], draw = x['xl/drawings/drawing1.xml'];
const anchor = (name) => { const a = draw.split(/<xdr:(?:two|one)CellAnchor>/).find((s) => s.includes(`name="${name}"`)) || ''; return { cols: [...a.matchAll(/<xdr:col>(\d+)<\/xdr:col>/g)].map((m) => +m[1]), rows: [...a.matchAll(/<xdr:row>(\d+)<\/xdr:row>/g)].map((m) => +m[1]), fill: (a.match(/srgbClr val="(\w+)"/) || [])[1] }; };
const req = anchor('バー: 要件定義');
ok('bar anchored from start month to end month', req.cols.join() === '2,5', JSON.stringify(req));
ok('bar anchored to its row', req.rows.join() === '6,6', JSON.stringify(req));
ok('bar color', req.fill === '2A70C8' && anchor('バー: 予算').fill === 'C8102E');
ok('milestone anchored in its month', anchor('マイルストーン: 承認').cols.join() === '4', JSON.stringify(anchor('マイルストーン: 承認')));
ok('fiscal year merged cells', /<mergeCell ref="C3:N3"\/>/.test(sheet), (sheet.match(/<mergeCell ref="[^"]+"\/>/g) || []).join());
ok('header and task column frozen', /<pane xSplit="2" ySplit="5" topLeftCell="C6"/.test(sheet));
ok('milestone name in the next cell', /<c r="F9"[^>]*t="inlineStr"><is><t xml:space="preserve">6\/30 承認<\/t>/.test(sheet));
ok('highlight star in task cell', sheet.includes('★ 予算'));
ok('print setup: A4 landscape, fit width, repeat headers', /paperSize="9" orientation="landscape" fitToWidth="1"/.test(sheet) && x['xl/workbook.xml'].includes('$3:$5'));

console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
