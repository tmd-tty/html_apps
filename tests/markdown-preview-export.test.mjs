// Markdown Studio のプレビューと出力: 描画、危険な入力の無害化、外部リンク、表示モード、PDF と Word、許可した通信だけであること
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import { appHtml, outDir, MD_HOOK, MOD } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 170000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const OUT = outDir('markdown-preview-export');
const html = appHtml('markdown-studio', MD_HOOK);
// ページ以外への到達はすべて記録する(外部リンクのクリックで開いたページだけは許可)
let hits = [];
const srv = http.createServer((q, r) => {
  if (q.url !== '/') hits.push({ url: q.url, ref: q.headers.referer });
  r.setHeader('content-type', 'text/html');
  r.end(q.url === '/' ? html : '<p id=o></p><script>document.getElementById("o").textContent=String(window.opener)</' + 'script>');
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;
const ALLOWED = ['marked@18.1.3/lib/marked.umd.js', 'dompurify@3.4.17/dist/purify.min.js', '@highlightjs/cdn-assets@11.12.0/highlight.min.js', 'mermaid@12.3.0/dist/mermaid.min.js', 'docx@9.15.2/dist/index.iife.js'].map((x) => `https://cdn.jsdelivr.net/npm/${x}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const reqs = [], cspBlocked = new Set(), errs = [];
page.on('request', (r) => { if (/^https:/.test(r.url())) reqs.push(r.url()); });
page.on('requestfailed', (r) => { if (/csp/i.test(r.failure()?.errorText || '')) cspBlocked.add(r.url()); });
page.on('pageerror', (e) => errs.push(e.message));
await ctx.addInitScript(() => { window.__x = 0; window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const TA = 'textarea.ed:not([hidden])';
const val = () => page.$eval(TA, (e) => e.value);

const doc = [
  '# 報告書', '', '段落 **太字** `code`', '', '- [ ] 未完', '- [x] 完了', '', '| 左 | 右 |', '|:--|--:|', '| 1 | 2 |', '',
  '```js', 'const a = 1; // <b>x</b>', '```', '', '```mermaid', 'flowchart LR', '  A[開始] --> B[終了]', '```', '',
  `[外部](${O}/out?secret=1) [内部](other.md) [危険](javascript:window.__x=9)`, '', `![外部画像](${O}/img.png)`, '',
  `<img src="${O}/raw.png" onerror="window.__x=1"><script>window.__x=2;fetch('${O}/fetch')</` + 'script>', '',
  '## 付録', '', '本文。', '',
].join('\n');
await page.goto(O);
await page.waitForSelector('.placeholder');
await T(async (d) => {
  const r = await navigator.storage.getDirectory();
  for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  const w = async (n, t) => { const h = await r.getFileHandle(n, { create: true }); const s = await h.createWritable(); await s.write(t); await s.close(); };
  await w('a.md', d); await w('other.md', '# 別ファイル');
}, doc);
await page.click('[data-cmd=openFolder]');
await page.click('.row[data-path="a.md"]');
await page.waitForSelector('#preview .mermaid-block svg', { timeout: 20000 });
await page.waitForTimeout(300);

// ---- 描画 ----
ok('syntax highlight', await page.$('#preview .hljs-keyword') !== null);
ok('checkboxes enabled', (await page.$$('#preview input[data-task]:not([disabled])')).length === 2);
ok('table alignment', await page.$eval('#preview td[align=right]', (e) => e.textContent === '2'));
ok('sections for folding', (await page.$$('#preview section.sec')).length === 2);
ok('external image not loaded', (await page.textContent('#preview')).includes('外部画像は読み込みません'));

// ---- 無害化 ----
ok('no script executed', await T(() => window.__x === 0), String(await T(() => window.__x)));
ok('no dangerous elements or handlers', await T(() => !document.querySelector('#preview script, #preview [onerror]')));
ok('nothing sent while rendering', hits.length === 0, JSON.stringify(hits));

// ---- 操作 ----
await page.click('#preview input[data-task="0"]');
await page.waitForTimeout(200);
ok('checkbox click edits source', (await val()).includes('- [x] 未完'));
await page.hover('#preview .code-wrap');
await page.click('#preview .copy-btn');
await page.waitForTimeout(100);
ok('copy button copies code', await T(() => navigator.clipboard.readText()) === 'const a = 1; // <b>x</b>');
const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.click('#preview a:text-is("外部")')]);
await popup.waitForLoadState();
ok('external link opens new tab', popup.url() === `${O}/out?secret=1`);
ok('no referrer, no opener', hits.at(-1)?.ref === undefined && await popup.textContent('#o') === 'null', JSON.stringify(hits.at(-1)));
await popup.close();
const before = ctx.pages().length;
await page.click('#preview a:text-is("危険")');
await page.waitForTimeout(200);
ok('javascript: link does nothing', ctx.pages().length === before && await T(() => window.__x === 0));
await page.click('#preview a:text-is("内部")');
await page.waitForFunction(() => __mds.state.active?.name === 'other.md');
ok('internal link opens tab', true);
await page.click('.tab:has-text("a.md")');
await page.waitForSelector('#preview .mermaid-block svg');

// ---- 表示モードとテーマ ----
await page.keyboard.press(`${MOD}+e`);
await page.waitForTimeout(100);
ok('read mode uses full width', await T(() => { const p = document.querySelector('#preview p').getBoundingClientRect().width; return p > document.getElementById('workspace').getBoundingClientRect().width - 120; }));
await page.keyboard.press(`${MOD}+Shift+e`);
ok('edit-only mode hides preview', await page.$eval('#previewPane', (e) => getComputedStyle(e).display) === 'none');
await page.keyboard.press(`${MOD}+Shift+e`);
const fillOf = () => page.$eval('#preview .mermaid-block svg .node rect, #preview .mermaid-block svg .node .label-container', (e) => getComputedStyle(e).fill);
const light = await fillOf();
await page.keyboard.press('Alt+d');
await page.waitForTimeout(800);
ok('diagram follows theme', await fillOf() !== light, light);
await page.keyboard.press('Alt+d');
await page.waitForTimeout(500);

// ---- 出力 ----
const dl = async (cmd, f) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(`[data-cmd=${cmd}]`)]); await d.saveAs(`${OUT}/${f}`); return d.suggestedFilename(); };
ok('pdf name', await dl('pdf', 'a.pdf') === 'a.pdf');
const pdf = fs.readFileSync(`${OUT}/a.pdf`, 'latin1');
ok('pdf structure', pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF') && /\/Type \/Page /.test(pdf));
ok('pdf has no copy buttons', await T(() => !document.querySelector('#pdfStage .copy-btn, #pdfStage .sec-toggle')));
ok('word name', await dl('word', 'a.docx') === 'a.docx');
const docx = fs.readFileSync(`${OUT}/a.docx`);
ok('docx is a zip with document.xml', docx.subarray(0, 2).toString() === 'PK' && docx.includes('word/document.xml'));

// ---- 通信 ----
const external = [...new Set(reqs.filter((u) => !cspBlocked.has(u)))];
ok('only allowed CDN files fetched', external.every((u) => ALLOWED.includes(u)) && external.length === 5, external.join('\n'));
ok('fetch blocked by CSP', await T(async (o) => { try { await fetch(`${o}/x`, { mode: 'no-cors' }); return false; } catch { return true; } }, O));
// 開いた先のページのアイコンはブラウザが取りに行くもので、アプリの通信ではないので除く
const fromApp = hits.filter((h) => h.url !== '/favicon.ico');
ok('only the clicked link reached the server', fromApp.length === 1 && fromApp[0].url === '/out?secret=1', JSON.stringify(hits));

const p2 = await ctx.newPage();
await p2.route('**/cdn.jsdelivr.net/**', (r) => r.abort());
await p2.goto(O);
await p2.waitForTimeout(500);
ok('offline message when CDN unreachable', (await p2.textContent('body')).includes('インターネット接続'));

await T(() => { for (const t of __mds.state.tabs) t.dirty = false; });
console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
