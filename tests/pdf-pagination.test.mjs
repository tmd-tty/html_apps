// PDF のページ分割(Markdown Studio と HTML Studio): 枠からはみ出さない、表の見出し行を繰り返す、見出しだけを残さない、
// 番号付きリストの番号を続ける、小さなブロックを分割しない。画像化の前に、分割を決める関数を直接呼んで確かめる
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, MD_HOOK, HTS_HOOK } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const errs = [];
async function openApp(app, hook, file, text) {
  const html = appHtml(app, hook);
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  await ctx.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${app}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${srv.address().port}`);
  await page.waitForSelector('.placeholder');
  await page.evaluate(async ([f, t]) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const h = await r.getFileHandle(f, { create: true }); const w = await h.createWritable(); await w.write(t); await w.close();
  }, [file, text]);
  await page.click('[data-cmd=openFolder]');
  await page.click(`.row[data-path="${file}"]`);
  await page.waitForSelector('textarea.ed:not([hidden])');
  return page;
}
/** ページごとの使用高さ、末尾の要素、表と番号付きリストの状態をまとめる(body はページの本文の要素) */
const SUMMARY = `(bodies, H) => bodies.map((b) => {
  const last = b.lastElementChild, top = b.getBoundingClientRect().top;
  let tail = last; while (tail && tail.lastElementChild && /^(DIV|SECTION)$/.test(tail.tagName) && !tail.classList.contains('pdf-slice') && !tail.classList.contains('card')) tail = tail.lastElementChild;
  return {
    used: last ? last.getBoundingClientRect().bottom - top : 0, H,
    endsWithHeading: !!tail && /^H[1-6]$/.test(tail.tagName) && b.querySelectorAll('*').length > 1,
    tables: [...b.querySelectorAll('table')].map((t) => ({ head: !!t.tHead, rows: t.tBodies[0] ? t.tBodies[0].rows.length : 0 })),
    ols: [...b.querySelectorAll('ol')].map((o) => ({ start: o.start, items: o.children.length })),
    cards: [...b.querySelectorAll('section.card')].map((c) => (c.querySelector('h2') ? 1 : 0) + (c.querySelector('p') ? 2 : 0)),
  };
})`;
function check(label, pages, { rows, items, cards }) {
  ok(`${label}: several pages`, pages.length > 3, String(pages.length));
  const over = pages.map((p, i) => ({ i, used: Math.round(p.used) })).filter((p) => p.used > pages[0].H + 1);
  ok(`${label}: nothing overflows a page`, over.length === 0, JSON.stringify(over));
  ok(`${label}: no page ends with a heading`, pages.every((p) => !p.endsWithHeading), JSON.stringify(pages.map((p, i) => p.endsWithHeading && i).filter((x) => x !== false)));
  const parts = pages.flatMap((p) => p.tables);
  ok(`${label}: table split keeps the header row`, parts.length > 1 && parts.every((t) => t.head), JSON.stringify(parts));
  ok(`${label}: no table row lost`, parts.reduce((a, t) => a + t.rows, 0) === rows, String(parts.reduce((a, t) => a + t.rows, 0)));
  if (items) {
    const ols = pages.flatMap((p) => p.ols);
    let next = 1, cont = true;
    for (const o of ols) { if (o.start !== next) cont = false; next = o.start + o.items; }
    ok(`${label}: ordered list numbering continues`, ols.length > 1 && cont && next - 1 === items, JSON.stringify(ols));
  }
  if (cards) {
    const all = pages.flatMap((p) => p.cards);
    ok(`${label}: small blocks are not split`, all.length === cards && all.every((c) => c === 3), JSON.stringify(all));
  }
}

// ---- Markdown Studio ----
const md = ['# 長文の報告書', ''];
for (let i = 1; i <= 12; i++) md.push(`## 節 ${i}`, '', '改ページを確認するための段落です。'.repeat(12), '');
md.push('## 表', '', '| 番号 | 名前 |', '|--:|:--|', ...Array.from({ length: 90 }, (_, i) => `| ${i + 1} | 行 |`), '');
md.push('## 手順', '', ...Array.from({ length: 70 }, (_, i) => `${i + 1}. 手順 ${i + 1}`), '');
md.push('## コード', '', '```text', ...Array.from({ length: 120 }, (_, i) => `line ${i}`), '```', '', '## 長い段落', '', '長い段落。'.repeat(1500), '');
const mdPage = await openApp('markdown-studio', MD_HOOK, 'a.md', md.join('\n'));
const mdPages = await mdPage.evaluate(async (summary) => {
  const stage = document.getElementById('pdfStage');
  const src = await __mds.buildPdfDom(stage, __mds.state.active);
  const pages = __mds.paginate(src, stage);
  const out = eval(summary)(pages, __mds.A4.contentH);
  stage.textContent = '';
  return out;
}, SUMMARY);
check('markdown', mdPages, { rows: 90, items: 70 });
await mdPage.evaluate(() => { for (const t of __mds.state.tabs) t.dirty = false; });

// ---- HTML Studio ----
const cards = Array.from({ length: 30 }, (_, i) => `<section class="card"><h2>節${i + 1}</h2><p>${'改ページの確認文です。'.repeat(10)}</p></section>`).join('');
const rows = Array.from({ length: 70 }, (_, i) => `<tr><td>${i + 1}</td><td>行</td></tr>`).join('');
const htmlDoc = `<!doctype html><html><head><style>.card{border:1px solid #888;padding:10px;margin:8px 0}td,th{border:1px solid #999}</style></head><body><div class="wrap"><h1>報告書</h1>${cards}<table><thead><tr><th>番号</th><th>値</th></tr></thead><tbody>${rows}</tbody></table></div></body></html>`;
const hPage = await openApp('html-studio', HTS_HOOK, 'index.html', htmlDoc);
const hPages = await hPage.evaluate(async (summary) => {
  const host = document.createElement('div'); document.getElementById('pdfStage').append(host);
  const stage = host.attachShadow({ mode: 'open' });
  const t = __h.state.active, built = await __h.buildDoc(t.ta.value, t);
  built.outerClass = `pdf ${built.outerClass}`.trim();
  const { html, body } = __h.mountDoc(stage, built);
  stage.querySelector('style').textContent += `\n${__h.PDF_CSS}`;
  const pages = __h.paginate(body, html, stage);
  const out = eval(summary)(pages.map((p) => p.querySelector('.doc-body')), __h.A4.contentH);
  out.forEach((o, i) => { o.wrapper = !!pages[i].querySelector('.doc-body > .wrap'); });
  host.remove();
  return out;
}, SUMMARY);
check('html', hPages, { rows: 70, cards: 30 });
ok('html: wrapper recreated on every page', hPages.every((p) => p.wrapper));
await hPage.evaluate(() => { for (const t of __h.state.tabs) t.dirty = false; });

console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
