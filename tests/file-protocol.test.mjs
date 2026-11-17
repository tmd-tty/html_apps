// 4つのアプリを、実際の使い方と同じ file:// で開いたときに起動できること。あわせて CSP の存在と、起動時の通信を確かめる
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { appPath } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 120000);
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const CDN = 'https://cdn.jsdelivr.net/npm/';
const apps = [
  { app: 'markdown-studio', ready: '.placeholder', boot: [`${CDN}marked@18.1.3/lib/marked.umd.js`, `${CDN}dompurify@3.4.17/dist/purify.min.js`, `${CDN}@highlightjs/cdn-assets@11.12.0/highlight.min.js`, `${CDN}mermaid@12.3.0/dist/mermaid.min.js`] },
  { app: 'html-studio', ready: '.placeholder', boot: [`${CDN}dompurify@3.4.17/dist/purify.min.js`] },
  { app: 'macro-schedule-editor', ready: 'table thead', boot: [] },
  { app: 'org-chart-editor', ready: '.empty', boot: [] },
];
for (const { app, ready, boot } of apps) {
  const html = fs.readFileSync(appPath(app), 'utf8');
  ok(`${app}: CSP comes first in head`, /<head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'none';/.test(html));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('request', (r) => { if (!/^(data|blob|file):/.test(r.url())) reqs.push(r.url()); });
  await page.goto(`file://${appPath(app)}`);
  await page.waitForSelector(ready, { timeout: 20000 }).then(() => ok(`${app}: boots from file://`, true)).catch(() => ok(`${app}: boots from file://`, false));
  await page.waitForTimeout(400);
  ok(`${app}: no errors`, errs.length === 0, errs.join(' / '));
  ok(`${app}: only expected requests on boot`, reqs.length === boot.length && reqs.every((u) => boot.includes(u)), reqs.join(' '));
  await ctx.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
