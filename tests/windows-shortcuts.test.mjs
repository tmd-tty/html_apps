// Windows のショートカット: Ctrl キー、日本語配列の記号キー、IME がオンのとき(key が "Process")でも動くこと
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, DGS_HOOK } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const pages = {
  'markdown-studio': appHtml('markdown-studio'), 'html-studio': appHtml('html-studio'), 'diagram-studio': appHtml('diagram-studio', DGS_HOOK),
  'macro-schedule-editor': appHtml('macro-schedule-editor'), 'org-chart-editor': appHtml('org-chart-editor'),
};
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(pages[q.url.slice(1)] || ''); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };

/** Windows として開く。ファイル選択は呼ばれたことだけを記録する */
async function open(app, ready) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });
    window.__picked = 0;
    const abort = async () => { window.__picked++; throw new DOMException('cancel', 'AbortError'); };
    window.showOpenFilePicker = abort;
    window.showDirectoryPicker = location.hash === '#opfs' ? async () => navigator.storage.getDirectory() : abort;
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${O}/${app}${app === 'diagram-studio' ? '#opfs' : ''}`);
  await page.waitForSelector(ready);
  page.errs = errs;
  return { ctx, page };
}
/** 実際のキーボードでは作れない組み合わせ(日本語配列や IME)を、キーイベントとして送る */
const send = (page, init) => page.evaluate((i) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...i });
  if (i.keyCode) Object.defineProperty(e, 'keyCode', { get: () => i.keyCode });
  (document.activeElement || document.body).dispatchEvent(e);
}, init);

// ---- Markdown Studio / HTML Studio ----
for (const app of ['markdown-studio', 'html-studio']) {
  const { ctx, page } = await open(app, '.placeholder');
  const T = (f) => page.evaluate(f);
  const sidebarHidden = () => T(() => document.body.classList.contains('no-sidebar'));
  ok(`${app}: tooltips show Ctrl`, (await page.getAttribute('[data-cmd=save]', 'title')).includes('Ctrl+S'));
  await page.keyboard.press('Control+o');
  ok(`${app}: Ctrl+O`, await T(() => window.__picked) === 1);
  await page.keyboard.press('Meta+o');
  ok(`${app}: Windows key is not Ctrl`, await T(() => window.__picked) === 1);
  await page.keyboard.press('Control+Backslash');
  ok(`${app}: Ctrl+\\ (US)`, await sidebarHidden());
  await send(page, { key: '\\', code: 'IntlRo', ctrlKey: true });
  ok(`${app}: Ctrl+\\ (Japanese keyboard)`, !await sidebarHidden());
  await page.keyboard.press('Control+Slash');
  ok(`${app}: Ctrl+/ opens help`, !!await page.$('.modal'));
  await page.keyboard.press('Escape');
  const theme = await T(() => document.documentElement.dataset.theme);
  await page.keyboard.press('Alt+d');
  ok(`${app}: Alt+D`, await T(() => document.documentElement.dataset.theme) !== theme);
  await send(page, { key: 'Process', code: 'KeyO', keyCode: 229, ctrlKey: true });
  ok(`${app}: Ctrl+O with IME on`, await T(() => window.__picked) === 2);
  await send(page, { key: 'Process', code: 'KeyD', keyCode: 229 });
  ok(`${app}: plain keys while IME is on are left alone`, await T(() => document.documentElement.dataset.theme) !== theme);
  ok(`${app}: no errors`, page.errs.length === 0, page.errs.join());
  await ctx.close();
}

// ---- Diagram Studio ----
{
  const { ctx, page } = await open('diagram-studio', '#empty h1');
  const T = (f, a) => page.evaluate(f, a);
  await T(async () => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const h = await r.getFileHandle('a.diagram.json', { create: true }), w = await h.createWritable();
    await w.write(JSON.stringify({ nodes: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50 }, { id: 'b', type: 'rect', x: 50, y: 20, w: 100, h: 50 }], edges: [] }));
    await w.close();
  });
  await page.click('[data-cmd=openFolder]');
  await page.click('.row[data-path="a.diagram.json"]');
  await page.waitForSelector('.tab.on');
  const k = () => T(() => __d.state.active.view.k), order = () => T(() => __d.state.active.doc.nodes.map((n) => n.id).join());
  let z = await k();
  await page.keyboard.press('Control+Equal');
  ok('diagram: Ctrl+= zooms in', await k() > z); z = await k();
  await send(page, { key: ';', code: 'Quote', ctrlKey: true });
  ok('diagram: Ctrl+; zooms in (Japanese keyboard)', await k() > z); z = await k();
  await send(page, { key: '+', code: 'Semicolon', ctrlKey: true, shiftKey: true });
  ok('diagram: Ctrl+Shift+; (+) zooms in (Japanese keyboard)', await k() > z); z = await k();
  await page.keyboard.press('Control+Minus');
  ok('diagram: Ctrl+- zooms out', await k() < z);
  await T(() => { __d.state.active.sel = new Set(['b']); });
  // 日本語配列の「[」は US 配列の「]」の位置にあるが、文字どおり「最背面へ」になる
  await send(page, { key: '{', code: 'BracketRight', ctrlKey: true, shiftKey: true });
  ok('diagram: Ctrl+Shift+[ sends to back (Japanese keyboard)', await order() === 'b,a', await order());
  await page.keyboard.press('Control+Shift+BracketRight');
  ok('diagram: Ctrl+Shift+] brings to front', await order() === 'a,b', await order());
  await page.keyboard.press('Control+z');
  ok('diagram: Ctrl+Z', await order() === 'b,a');
  await page.keyboard.press('Control+y');
  ok('diagram: Ctrl+Y', await order() === 'a,b');
  await page.focus('#canvas');
  await page.keyboard.press('Control+d');
  ok('diagram: Ctrl+D duplicates', await T(() => __d.state.active.doc.nodes.length) === 3);
  await send(page, { key: 'Process', code: 'KeyZ', keyCode: 229, ctrlKey: true });
  ok('diagram: Ctrl+Z with IME on', await T(() => __d.state.active.doc.nodes.length) === 2);
  ok('diagram: no errors', page.errs.length === 0, page.errs.join());
  await T(() => { for (const t of __d.state.tabs) t.dirty = false; });
  await ctx.close();
}

// ---- Macro Schedule Editor / Org Chart Editor ----
for (const [app, ready] of [['macro-schedule-editor', 'table thead'], ['org-chart-editor', '.empty']]) {
  const { ctx, page } = await open(app, ready);
  await page.keyboard.press('Control+o');
  ok(`${app}: Ctrl+O`, await page.evaluate(() => window.__picked) === 1);
  await send(page, { key: 'Process', code: 'KeyO', keyCode: 229, ctrlKey: true });
  ok(`${app}: Ctrl+O with IME on`, await page.evaluate(() => window.__picked) === 2);
  ok(`${app}: no errors`, page.errs.length === 0, page.errs.join());
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
