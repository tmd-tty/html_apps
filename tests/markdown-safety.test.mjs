// Markdown Studio: 前回フォルダの復元(権限の再要求)、チェックボックスの対応ずれ防止
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, MD_HOOK } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 120000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const html = appHtml('markdown-studio', MD_HOOK);
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
// 権限の状態は sessionStorage の指定で切り替える(prompt: 再要求が必要、denied: 拒否)
await ctx.addInitScript(() => {
  window.showDirectoryPicker = async () => navigator.storage.getDirectory();
  const mode = sessionStorage.getItem('perm');
  if (mode) {
    FileSystemHandle.prototype.queryPermission = async () => 'prompt';
    FileSystemHandle.prototype.requestPermission = async () => { window.__asked = (window.__asked || 0) + 1; return mode === 'denied' ? 'denied' : 'granted'; };
  }
});
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const TA = 'textarea.ed:not([hidden])';

await page.goto(O);
await page.waitForSelector('.placeholder');
await T(async () => {
  const r = await navigator.storage.getDirectory();
  for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  const h = await r.getFileHandle('a.md', { create: true }); const w = await h.createWritable(); await w.write('# A'); await w.close();
});
await page.click('[data-cmd=openFolder]');
await page.waitForSelector('.row[data-path="a.md"]');

// ---- 前回フォルダの復元 ----
await page.reload();
await page.waitForSelector('.row[data-path="a.md"]');
ok('granted permission restores automatically', true);
await T(() => sessionStorage.setItem('perm', 'prompt'));
await page.reload();
await page.waitForSelector('button:has-text("前回のフォルダを復元")');
ok('restore button when permission needed', await page.$('.row') === null && await T(() => !window.__asked));
await page.click('button:has-text("前回のフォルダを復元")');
await page.waitForSelector('.row[data-path="a.md"]');
ok('restored after permission granted', await T(() => window.__asked === 1));
await T(() => sessionStorage.setItem('perm', 'denied'));
await page.reload();
await page.click('button:has-text("前回のフォルダを復元")');
await page.waitForTimeout(300);
ok('denied permission keeps the button, no files', await page.$('.row') === null && await page.$('button:has-text("前回のフォルダを復元")') !== null);
await T(() => sessionStorage.removeItem('perm'));
await page.reload();
await page.waitForSelector('.row[data-path="a.md"]');
await page.click('.row[data-path="a.md"]');
await page.waitForSelector(TA);

// ---- チェックボックスの対応ずれ防止 ----
const setv = async (v) => { await page.$eval(TA, (e, v) => { e.focus(); e.select(); document.execCommand('insertText', false, v); }, v); await page.waitForTimeout(250); };
await setv('- [ ] 一\n- [ ] 二\n');
ok('normal checkboxes are clickable', (await page.$$('#preview input[data-task]:not([disabled])')).length === 2);
const mixed = '- [ ] 一\n\n<input type="checkbox" data-task="0">\n\n- [ ] 二\n';
await setv(mixed);
ok('html checkbox disables all', await page.$$eval('#preview input[type=checkbox]', (e) => e.length === 3 && e.every((x) => x.disabled)));
await page.click('#preview input[type=checkbox] >> nth=2', { force: true });
await page.waitForTimeout(200);
ok('disabled checkbox does not edit source', await page.$eval(TA, (e) => e.value) === mixed);
await setv('```\n- [ ] コード内\n```\n\n- [ ] 本物\n');
ok('task in code block is not counted', (await page.$$('#preview input[data-task]:not([disabled])')).length === 1);
await page.click('#preview input[data-task="0"]');
await page.waitForTimeout(200);
ok('the right line is edited', await page.$eval(TA, (e) => e.value) === '```\n- [ ] コード内\n```\n\n- [x] 本物\n');

await T(() => { for (const t of __mds.state.tabs) t.dirty = false; });
console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
