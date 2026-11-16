// HTML Studio のプレビュー: スクリプトを実行しない、外部へ通信しない、CSS をアプリへ漏らさない。あわせて PDF 出力
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, outDir, HTS_HOOK } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const OUT = outDir('html-studio-security');
const html = appHtml('html-studio', HTS_HOOK);
// ページ以外へのリクエストは、すべて外部への通信とみなして記録する
let hits = [];
const srv = http.createServer((q, r) => { if (q.url !== '/') hits.push(q.url); r.setHeader('content-type', 'text/html'); r.setHeader('access-control-allow-origin', '*'); r.end(q.url === '/' ? html : 'x'); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const reqs = [], errs = [];
page.on('request', (r) => { if (/^https:/.test(r.url())) reqs.push(r.url()); });
page.on('pageerror', (e) => errs.push(e.message));
await ctx.addInitScript(() => { window.__x = 0; window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const SH = (fn) => page.evaluate(`(s=>{${fn}})(document.getElementById('pageHost').shadowRoot)`);

await page.goto(O);
await page.waitForSelector('.placeholder');
await T(async () => {
  const r = await navigator.storage.getDirectory();
  for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  const w = async (n, t) => { const h = await r.getFileHandle(n, { create: true }); const s = await h.createWritable(); await s.write(t); await s.close(); };
  const c = document.createElement('canvas'); c.width = 60; c.height = 40; c.getContext('2d').fillRect(0, 0, 60, 40);
  await w('pic.png', await new Promise((x) => c.toBlob(x)));
  await w('style.css', 'h1{color:rgb(1,2,3)}');
  await w('other.html', '<h2>別ページ</h2>');
  await w('index.html', '<!doctype html><html><head><link rel="stylesheet" href="style.css"><style>body{background:rgb(250,240,200);margin:30px}h2{color:rgb(200,0,0)}</style></head><body><h1>見出し</h1><h2>小見出し</h2><img src="pic.png" alt="p"><a id="in" href="other.html">内部</a><a id="ext" href="https://evil.example/l">外部</a><form action="https://evil.example/f"><button id="sb">送信</button></form></body></html>');
});
await page.click('[data-cmd=openFolder]');
await page.click('.row[data-path="index.html"]');
await page.waitForFunction(() => document.getElementById('pageHost')?.shadowRoot.querySelector('img[src^="blob:"]'));

// ---- CSS とリンク ----
const cs = await SH("const g=(q,p)=>getComputedStyle(s.querySelector(q))[p];return {h1:g('h1','color'),h2:g('h2','color'),bg:g('.doc-body','backgroundColor'),m:g('.doc-body','marginTop')}");
ok('local css file applied', cs.h1 === 'rgb(1, 2, 3)', JSON.stringify(cs));
ok('inline css and body rewrite', cs.h2 === 'rgb(200, 0, 0)' && cs.bg === 'rgb(250, 240, 200)' && cs.m === '30px', JSON.stringify(cs));
ok('css does not leak into app', await T(() => getComputedStyle(document.body).backgroundColor !== 'rgb(250, 240, 200)'));
await SH("s.querySelector('#ext').click(); s.querySelector('#sb').click();");
await page.waitForTimeout(200);
ok('external link and form do not navigate', page.url().startsWith(O));
await SH("s.querySelector('#in').click();");
await page.waitForFunction(() => __h.state.active?.name === 'other.html');
ok('internal link opens tab', true);
await page.click('.tab:has-text("index.html")');

// ---- 悪意のある HTML ----
const EVIL = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${O}/refresh"><base href="${O}/base/"><link rel=stylesheet href="${O}/l.css"><script src="${O}/s.js"></` + `script><style>@import url(${O}/imp.css);body{background:url(${O}/bg.png)}@font-face{font-family:x;src:url(${O}/f.woff)}p{font-family:x}</style></head><body onload="__x=1"><script>__x=2;fetch('${O}/fetch')</` + `script><img src="${O}/i.png" onerror="__x=3"><img src=x onerror="__x=4"><svg onload="__x=5"><image href="${O}/si.png"/></svg><iframe src="${O}/if"></iframe><iframe srcdoc="<script>parent.__x=7</` + `script>"></iframe><object data="${O}/o"></object><embed src="${O}/e"><video src="${O}/v.mp4" autoplay></video><a href="javascript:__x=8" id="j">j</a><div style="background:url(${O}/st.png)">s</div><p>t</p><details ontoggle="__x=9" open>d</details><input autofocus onfocus="__x=10"><img srcset="${O}/ss.png 1x"></body></html>`;
hits = [];
await page.$eval('textarea.ed:not([hidden])', (e, v) => { e.focus(); e.select(); document.execCommand('insertText', false, v); }, EVIL);
await page.waitForTimeout(800);
await SH("s.querySelector('#j')?.click();");
await page.waitForTimeout(200);
ok('no script executed', await T(() => window.__x === 0), String(await T(() => window.__x)));
ok('nothing reached the server', hits.length === 0, hits.join());
ok('no event handler attributes', await SH("return ![...s.querySelectorAll('*')].some(e=>[...e.attributes].some(a=>/^on/i.test(a.name)))"));
ok('no frames, scripts, links', await SH("return !s.querySelector('iframe,object,embed,script,link,meta,base')"));
const notes = await page.textContent('#notes');
ok('notes explain what was blocked', notes.includes('スクリプト') && notes.includes('外部ファイル') && notes.includes('埋め込み'), notes);
ok('fetch blocked by CSP', await T(async (o) => { try { await fetch(`${o}/x`, { mode: 'no-cors' }); return false; } catch { return true; } }, O));

// ---- PDF ----
await page.$eval('textarea.ed:not([hidden])', (e) => { e.focus(); e.select(); document.execCommand('insertText', false, '<h1>報告</h1>' + '<section><h2>節</h2><p>本文です。</p></section>'.repeat(30) + '<table><thead><tr><th>番号</th></tr></thead><tbody>' + Array.from({ length: 60 }, (_, i) => `<tr><td>${i}</td></tr>`).join('') + '</tbody></table>'); });
await page.waitForTimeout(300);
const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-cmd=pdf]')]);
await d.saveAs(`${OUT}/index.pdf`);
ok('pdf exported', d.suggestedFilename() === 'index.pdf');

// ---- 通信 ----
const external = [...new Set(reqs)];
ok('only DOMPurify fetched from CDN', external.length === 1 && /dompurify@3\.4\.17/.test(external[0]), external.join());
await T(() => { for (const t of __h.state.tabs) t.dirty = false; });

const p2 = await ctx.newPage();
await p2.route('**/cdn.jsdelivr.net/**', (r) => r.abort());
await p2.goto(O);
await p2.waitForTimeout(500);
ok('offline message when CDN unreachable', (await p2.textContent('body')).includes('インターネット接続'));

console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
