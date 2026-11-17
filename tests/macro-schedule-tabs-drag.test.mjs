// Macro Schedule Editor: タブを閉じるときの確認、開き直したときの巻き戻り防止、ドラッグの細かい操作、古い形式のファイル
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, MOD } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const html = appHtml('macro-schedule-editor');
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await ctx.addInitScript(() => {
  const dir = () => navigator.storage.getDirectory();
  window.showSaveFilePicker = async (o) => { if (window.__cancelSave) throw new DOMException('cancel', 'AbortError'); return (await dir()).getFileHandle(window.__saveName || o.suggestedName, { create: true }); };
  window.showOpenFilePicker = async () => [await (await dir()).getFileHandle(window.__openName)];
});
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const put = (n, t) => T(async ([n, t]) => { const h = await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true }); const w = await h.createWritable(); await w.write(t); await w.close(); }, [n, t]);
const read = (n) => T(async (n) => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text()), n);
const openF = async (n) => { await T((n) => { window.__openName = n; }, n); await page.click('#open'); await page.waitForTimeout(150); };
const tabs = () => page.$$eval('.tab', (e) => e.map((x) => (x.classList.contains('on') ? '*' : '') + x.querySelector('.tn').textContent + (x.classList.contains('dirty') ? '●' : '')).join(' | '));
const names = () => page.$$eval('tbody .name', (e) => e.map((x) => x.textContent).join(' '));
const add = async (n) => { await page.click('#add'); await page.fill('#fName', n); await page.click('#fOk'); await page.waitForFunction(() => !document.getElementById('taskDlg').open); };
const row = (n) => `tbody tr:has(.name:text-is("${n}"))`;
const per = (n) => page.textContent(`${row(n)} .period`);
const tk = (n, s = '2026-06', e = '2026-09') => ({ group: '', name: n, start: s, end: e, highlight: false });

await page.goto(O);
await T(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.tab');
await T(async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true }); });
await put('a.json', JSON.stringify({ tasks: [tk('A1')] }));
await put('b.json', JSON.stringify({ tasks: [tk('B1')] }));

// ---- タブを閉じるときの確認 ----
await openF('a.json'); await openF('b.json');
ok('two tabs', await tabs() === 'a.json | *b.json', await tabs());
await page.click('.tab:has-text("a.json")'); await add('A2'); await page.click('.tab:has-text("b.json")');
await page.click('.tab:has-text("a.json") .x');
await page.waitForSelector('#askDlg[open]');
ok('closing a background dirty tab shows it first', (await tabs()).includes('*a.json●'), await tabs());
ok('three choices', await page.$eval('#askAlt', (e) => !e.hidden && e.textContent === '保存しない'));
await page.click('#askNo');
ok('cancel keeps the tab', (await tabs()).includes('a.json●'));
await page.click('.tab:has-text("a.json") .x'); await page.click('#askAlt'); await page.waitForTimeout(100);
ok('discard closes without writing', !(await tabs()).includes('a.json') && (await read('a.json')).tasks.length === 1);
await openF('a.json'); await add('A3');
await page.click('.tab.on .x'); await page.click('#askYes');
await page.waitForFunction(() => ![...document.querySelectorAll('.tab .tn')].some((x) => x.textContent === 'a.json'));
ok('save closes after writing', (await read('a.json')).tasks.length === 2);
await page.click('#newTab'); await add('N');
await T(() => { window.__cancelSave = true; });
await page.click('.tab.on .x'); await page.click('#askYes'); await page.waitForTimeout(150);
ok('cancelled save keeps the tab', (await tabs()).includes('●'), await tabs());
await T(() => { window.__cancelSave = false; });
await page.click('.tab.on .x'); await page.click('#askAlt'); await page.waitForTimeout(80);
await page.click('.tab.on .x'); await page.waitForTimeout(80);
ok('closing the last tab leaves a fresh one', (await page.$$('.tab')).length === 1 && (await tabs()).startsWith('*新規スケジュール'), await tabs());

// ---- 表示中のファイルを開き直しても巻き戻らない ----
await openF('b.json'); await add('B2');
await T(() => { window.__saveName = 'b.json'; }); await page.keyboard.press(`${MOD}+s`); await page.waitForSelector('#status.saved');
await add('B3'); await openF('b.json');
ok('reopening the active file keeps edits', (await names()).includes('B3') && (await tabs()).includes('b.json●'), `${await names()} / ${await tabs()}`);

// ---- ドラッグ ----
const drag = async (n, fx, dx, during) => {
  const r = await page.locator(`${row(n)} .bar`).boundingBox(); const x = r.x + (fx < 0 ? r.width + fx : fx), y = r.y + r.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y, { steps: 3 }); await page.mouse.move(x + dx, y, { steps: 3 });
  if (during) await during(); await page.mouse.up(); await page.waitForTimeout(400);
};
await drag('B1', -6, 72); ok('right edge extends end', await per('B1') === '2026/06 – 2026/10', await per('B1'));
await drag('B1', 8, 144); ok('left edge moves start', await per('B1') === '2026/08 – 2026/10', await per('B1'));
await drag('B1', 8, 720); ok('start cannot pass end', await per('B1') === '2026/10 – 2026/10', await per('B1'));
await drag('B1', 30, 72, () => page.keyboard.press('Escape')); ok('escape cancels drag', await per('B1') === '2026/10 – 2026/10');
ok('no dialog after drag', await T(() => !document.getElementById('taskDlg').open));
await page.click('#addMs'); await page.fill('#fName', '節目'); await page.fill('#fDate', '2026-07-15'); await page.click('#fOk'); await page.waitForFunction(() => !document.getElementById('taskDlg').open);
const m = await page.locator(`${row('節目')} .ms`).boundingBox();
await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2); await page.mouse.down(); await page.mouse.move(m.x + m.width / 2 + 72, m.y + m.height / 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(400);
ok('milestone drag moves about a month', /^2026\/08\/1[3-7]$/.test(await per('節目')), await per('節目'));
await page.waitForTimeout(350);
await page.click(`${row('節目')} .ms`); await page.waitForSelector('#taskDlg[open]');
ok('click after drag still opens editor', await page.inputValue('#fName') === '節目');
await page.keyboard.press('Escape');

// ---- 古い形式のファイル ----
await put('v1.json', JSON.stringify({ app: 'Macro Schedule Editor', version: 1, tasks: [tk('旧形式'), { group: 'G', name: '色なし', start: '2026-04', end: '2026-05', highlight: true }] }));
await openF('v1.json');
ok('version 1 file opens', (await names()).includes('旧形式') && (await names()).includes('色なし'), await names());
await put('nover.json', JSON.stringify({ tasks: [{ name: '最小', start: '2026-04', end: '2026-04' }], extra: 1 }));
await openF('nover.json');
ok('minimal file opens (no version, no group, unknown keys)', (await names()) === '最小', await names());
await put('future.json', JSON.stringify({ version: 2, tasks: [{ ...tk('未来'), color: 'nope', row: '', note: '将来の項目' }] }));
await openF('future.json');
ok('unknown values ignored', (await names()) === '未来' && await page.$eval(`${row('未来')} .bar`, (e) => e.style.backgroundColor === ''));

await T(() => { window.onbeforeunload = null; window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true); });
console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
