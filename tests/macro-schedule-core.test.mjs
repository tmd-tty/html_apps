// Macro Schedule Editor の基本機能: 画面、入力、保存と読み込み、タブ、1行に複数の項目、PowerPoint と Excel の出力
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import { appHtml, outDir, MOD, unzipInPage, badXml } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const OUT = outDir('macro-schedule-core');
const html = appHtml('macro-schedule-editor');
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await ctx.newPage();
const reqs = [], errs = [];
page.on('request', (r) => { if (/^https:/.test(r.url())) reqs.push(r.url()); });
page.on('pageerror', (e) => errs.push(e.message));
await ctx.addInitScript(() => {
  window.__x = 0;
  const dir = () => navigator.storage.getDirectory();
  window.showSaveFilePicker = async (o) => (await dir()).getFileHandle(window.__saveName || o.suggestedName, { create: true });
  window.showOpenFilePicker = async () => [await (await dir()).getFileHandle(window.__openName)];
});

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const put = (n, t) => T(async ([n, t]) => { const h = await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true }); const w = await h.createWritable(); await w.write(t); await w.close(); }, [n, t]);
const read = (n) => T(async (n) => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text()), n);
const openF = async (n) => { await T((n) => { window.__openName = n; }, n); await page.click('#open'); await page.waitForTimeout(150); };
const names = () => page.$$eval('tbody .name', (e) => e.map((x) => x.textContent).join(' '));
const months = () => page.$$eval('thead tr:nth-child(3) th', (e) => e.map((x) => x.textContent));
const row = (n) => `tbody tr:has(.name:text-is("${n}"))`;
const per = (n) => page.textContent(`${row(n)} .period`);

await page.goto(O);
await T(() => localStorage.clear());
await page.reload();
await page.waitForSelector('table');
await T(async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true }); });

// ---- 画面と入力 ----
ok('dark theme by default', await T(() => document.documentElement.dataset.theme) === 'dark');
ok('15 months when empty', (await months()).length === 15);
const add = async (g, n, s, e, { newGroup, hi, ms, date, color, rowOf } = {}) => {
  await page.click(ms ? '#addMs' : '#add');
  if (newGroup) { await page.selectOption('#fGroup', '\0new'); await page.fill('#fNew', newGroup); } else await page.selectOption('#fGroup', g);
  await page.fill('#fName', n);
  if (ms) await page.fill('#fDate', date); else { await page.fill('#fStart', s); await page.fill('#fEnd', e); }
  if (hi) await page.check('#fHi');
  if (color) await page.click(`.swatch[title="${color}"]`);
  if (rowOf) await page.selectOption('#fRow', { label: rowOf });
  await page.click('#fOk');
  await page.waitForFunction(() => !document.getElementById('taskDlg').open);
};
await add('', '要件定義', '2026-04', '2026-09', { newGroup: 'フェーズ1' });
await add('フェーズ1', '基本設計', '2026-08', '2027-02', { hi: true });
await add('', '全体管理', '2026-04', '2028-03');
await add('フェーズ1', '承認', '', '', { ms: true, date: '2026-06-30', color: '緑' });
ok('rows', await names() === 'フェーズ1 要件定義 基本設計 承認 全体管理', await names());
ok('calendar grows to 24 months', (await months()).length === 24);
const fy = await page.$$eval('thead tr:nth-child(1) th:not(.corner)', (e) => e.map((x) => `${x.textContent}:${x.colSpan}`).join());
ok('japanese fiscal years', fy === '令和8年度:12,令和9年度:12', fy);
ok('highlight bar', await page.$eval(`${row('基本設計')} .bar`, (e) => e.classList.contains('hi')));
ok('milestone color', await page.$eval(`${row('承認')} .ms`, (e) => e.style.backgroundColor) === 'rgb(46, 158, 91)');
const geo = await T(() => { const b = [...document.querySelectorAll('.bar')][0]; const r = b.getBoundingClientRect(), t = b.closest('td').getBoundingClientRect(); return { l: r.left - t.left, w: r.width }; });
ok('bar geometry', geo.l === 3 && geo.w === 6 * 72 - 6, JSON.stringify(geo));
await page.click('#add'); await page.fill('#fName', 'x'); await page.fill('#fStart', '2027-05'); await page.fill('#fEnd', '2027-01'); await page.click('#fOk');
ok('end before start rejected', (await page.textContent('#fError')).includes('終了月'));
await page.keyboard.press('Escape');

// 年は4桁で止まる(次の欄へ進むため)
ok('year limited to 4 digits', await page.$eval('#fStart', (e) => e.min === '1927-01' && e.max === '2199-12'));

// ---- 1行に複数の項目 ----
await page.click(`${row('基本設計')} .bar`); await page.waitForSelector('#taskDlg[open]');
await page.selectOption('#fRow', { label: '要件定義' }); await page.click('#fOk'); await page.waitForFunction(() => !document.getElementById('taskDlg').open);
ok('joined into one row', (await page.$$(`${row('要件定義')} .bar`)).length === 2 && !(await names()).includes('基本設計'), await names());
ok('row period spans items', await per('要件定義') === '2026/04 – 2027/02', await per('要件定義'));

// ---- ドラッグ ----
const box = await page.locator(`${row('全体管理')} .bar`).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 10); await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 36, box.y + 10, { steps: 2 }); await page.mouse.move(box.x + box.width / 2 + 72, box.y + 10, { steps: 2 });
await page.mouse.up(); await page.waitForTimeout(400);
ok('drag moves period', await per('全体管理') === '2026/05 – 2028/04', await per('全体管理'));
ok('no dialog after drag', await T(() => !document.getElementById('taskDlg').open));

// ---- 保存と読み込み ----
await T(() => { window.__saveName = 'plan.json'; });
await page.keyboard.press(`${MOD}+s`);
await page.waitForSelector('#status.saved');
ok('saved status visible', /plan\.json に保存しました.*\d+:\d\d:\d\d/.test(await page.textContent('#status')));
const j = await read('plan.json');
ok('file content', j.version === 2 && j.tasks.some((t) => t.type === 'milestone' && t.color === 'green') && j.tasks.filter((t) => t.row === '要件定義').length === 2, JSON.stringify(j).slice(0, 200));
for (const [n, t] of [['bad1.json', '{oops'], ['bad2.json', '{"tasks":[{"name":"a","start":"2026-13","end":"2026-14"}]}']]) {
  await put(n, t); const before = await page.$$eval('.tab', (e) => e.length);
  await openF(n); await page.waitForFunction(() => document.getElementById('toast').textContent);
  ok(`reject ${n}`, await page.$$eval('.tab', (e) => e.length) === before, await page.textContent('#toast'));
  await T(() => { document.getElementById('toast').textContent = ''; });
}
await put('evil.json', JSON.stringify({ tasks: [{ group: '<img src=x onerror=__x=1>', name: '<script>__x=2</script>', start: '2026-01', end: '2026-02', highlight: false }] }));
await openF('evil.json');
ok('xss inert', await T(() => window.__x === 0 && !document.querySelector('tbody img, tbody script')));
ok('opened in new tab', (await page.$$eval('.tab .tn', (e) => e.map((x) => x.textContent))).join() === 'plan.json,evil.json');
await openF('plan.json');
ok('same file switches tab', (await page.$$eval('.tab', (e) => e.length)) === 2 && (await page.textContent('.tab.on')).includes('plan.json'));

// ---- 出力 ----
const dl = async (btn, f) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(btn)]); await d.saveAs(`${OUT}/${f}`); return d.suggestedFilename(); };
ok('no network before export', reqs.length === 0, reqs.join());
ok('pptx file name', await dl('#pptx', 'plan.pptx') === 'plan.pptx');
ok('only pptxgen fetched', reqs.length === 1 && /pptxgenjs@4\.0\.1/.test(reqs[0]), reqs.join());
const p = await unzipInPage(page, `${OUT}/plan.pptx`);
ok('pptx xml valid', (await badXml(page, p)).length === 0);
const slide = p['ppt/slides/slide1.xml'];
ok('pptx grouped', slide.includes('name="スケジュール全体"') && slide.includes('name="スケジュール表"'));
ok('pptx native shapes, no images', /prst="homePlate"/.test(slide) && /prst="diamond"/.test(slide) && !slide.includes('<p:pic>'));
ok('pptx fixed arrow tips', !slide.includes('prst="homePlate"><a:avLst></a:avLst>'));
ok('xlsx file name', await dl('#xlsx', 'plan.xlsx') === 'plan.xlsx');
const x = await unzipInPage(page, `${OUT}/plan.xlsx`);
ok('xlsx xml valid', (await badXml(page, x)).length === 0);
const sheet = x['xl/worksheets/sheet1.xml'], drawing = x['xl/drawings/drawing1.xml'];
ok('xlsx cells', sheet.includes('令和8年度') && sheet.includes('要件定義') && sheet.includes('state="frozen"'));
ok('xlsx only bars and milestones are shapes', (drawing.match(/<xdr:sp /g) || []).length === 4 && /homePlate/.test(drawing) && /"diamond"/.test(drawing));
ok('no other network', reqs.length === 1, reqs.join());

console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
