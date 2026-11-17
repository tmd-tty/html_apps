// Diagram Studio: 図形の追加、移動、大きさの変更、線でつなぐ、文字の編集、元に戻す、保存と読み込み、不正なファイル、SVG / PNG の書き出し、通信がないこと
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, MOD, DGS_HOOK } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const html = appHtml('diagram-studio', DGS_HOOK);
let hits = [];
const srv = http.createServer((q, r) => { if (q.url !== '/') hits.push(q.url); r.setHeader('content-type', 'text/html'); r.end(q.url === '/' ? html : 'x'); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const reqs = [], errs = [];
page.on('request', (r) => { if (!/^(data|blob):/.test(r.url()) && r.url() !== `${O}/`) reqs.push(r.url()); });
page.on('pageerror', (e) => errs.push(e.message));
await ctx.addInitScript(() => { window.__x = 0; window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const doc = () => T(() => __d.state.active.doc);
const readFile = (n) => T(async (n) => (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text(), n);
const put = (n, t) => T(async ([n, t]) => { const h = await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true }); const w = await h.createWritable(); await w.write(t); await w.close(); }, [n, t]);
/** 図の座標を画面の座標に変換する */
const scr = (x, y) => T(([x, y]) => { const r = document.getElementById('canvas').getBoundingClientRect(), v = __d.state.active.view; return { x: r.left + v.x + x * v.k, y: r.top + v.y + y * v.k }; }, [x, y]);
const drag = async (a, b) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 }); await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up(); };

await page.goto(O);
await page.waitForSelector('#empty h1');
await T(async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true }); });
await put('memo.txt', 'x');
await page.click('[data-cmd=openFolder]');
await page.waitForSelector('.row[data-path="memo.txt"]');

// ---- 新しい図 ----
await page.click('#tree', { button: 'right', position: { x: 60, y: 200 } });
await page.click('#ctx button:has-text("新しい図")');
const input = page.locator('.modal input');
ok('new name is dated and caret before extension', await input.evaluate((e) => /^\d{8}_\.diagram\.json$/.test(e.value) && e.selectionStart === e.value.length - '.diagram.json'.length));
await input.fill('flow');
await page.keyboard.press('Enter');
await page.waitForSelector('.tab.on:has-text("flow")');
ok('extension added and file created', JSON.parse(await readFile('flow.diagram.json')).nodes.length === 0);
ok('placeholder hidden', await page.$eval('#empty', (e) => e.hidden));

// ---- 図形の追加と移動 ----
await T(() => { const a = __d.addShape('rect', 0, 0); a.text = '開始'; const b = __d.addShape('diamond', 300, 0); b.text = '判断'; __d.state.active.sel.clear(); });
await T(() => __d.commands.fit.run());
let d = await doc();
ok('two shapes added', d.nodes.length === 2 && d.nodes[0].type === 'rect' && d.nodes[1].type === 'diamond');
ok('snapped to grid', d.nodes.every((n) => n.x % 10 === 0 && n.y % 10 === 0), JSON.stringify(d.nodes.map((n) => [n.x, n.y])));
await page.click('#palette button[data-shape="ellipse"]');
ok('palette click adds at center', (await doc()).nodes.length === 3 && (await doc()).nodes[2].type === 'ellipse');
await page.keyboard.press('Delete');
ok('delete key removes selection', (await doc()).nodes.length === 2);
const r0 = d.nodes[0];
await drag(await scr(r0.x + 30, r0.y + 30), await scr(r0.x + 30, r0.y + 130));
d = await doc();
ok('drag moves shape', d.nodes[0].y === r0.y + 100 && d.nodes[0].x === r0.x, JSON.stringify(d.nodes[0]));
ok('tab marked dirty', await page.$eval('.tab.on', (e) => e.classList.contains('dirty')));

// ---- 大きさの変更 ----
await page.mouse.click((await scr(d.nodes[0].x + 10, d.nodes[0].y + 10)).x, (await scr(d.nodes[0].x + 10, d.nodes[0].y + 10)).y);
const se = await page.$('[data-handle="se"]');
ok('resize handles shown', !!se);
const hb = await se.boundingBox();
const k = await T(() => __d.state.active.view.k);
await drag({ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x + hb.width / 2 + 40 * k, y: hb.y + hb.height / 2 + 20 * k });
d = await doc();
ok('resize via handle', d.nodes[0].w === 160 && d.nodes[0].h === 80, JSON.stringify(d.nodes[0]));

// ---- 線でつなぐ ----
const a = d.nodes[0], b = d.nodes[1];
await page.mouse.move((await scr(a.x + a.w / 2, a.y + a.h / 2)).x, (await scr(a.x + a.w / 2, a.y + a.h / 2)).y);
const dot = await page.$(`[data-connect="right"][data-of="${a.id}"]`);
ok('connection dots on hover', !!dot);
const db = await dot.boundingBox();
await drag({ x: db.x + db.width / 2, y: db.y + db.height / 2 }, await scr(b.x + b.w / 2, b.y + b.h / 2));
d = await doc();
ok('edge created', d.edges.length === 1 && d.edges[0].from === a.id && d.edges[0].to === b.id && d.edges[0].style.arrowEnd, JSON.stringify(d.edges));
ok('edge rendered with arrow', await page.$eval(`[data-edge="${d.edges[0].id}"]`, (g) => !!g.querySelector('polygon')));
const before = await T((id) => __d.edgePoints(__d.state.active.doc, __d.state.active.doc.edges[0]).at(-1), d.edges[0].id);
await T(() => { const n = __d.state.active.doc.nodes[1]; n.y += 200; });
const after = await T(() => __d.edgePoints(__d.state.active.doc, __d.state.active.doc.edges[0]).at(-1));
ok('edge follows moved shape', after.y !== before.y, JSON.stringify([before, after]));
await T(() => { __d.state.active.doc.nodes[1].y -= 200; });

// ---- 文字の編集 ----
const c = await scr(b.x + b.w / 2, b.y + b.h / 2);
await page.mouse.dblclick(c.x, c.y);
await page.waitForSelector('#editor:not([hidden])');
ok('editor shows current text', await page.inputValue('#editor') === '判断');
await page.fill('#editor', 'OK?\n<b>x</b>');
await page.keyboard.press(`${MOD}+Enter`);
d = await doc();
ok('text edited', d.nodes[1].text === 'OK?\n<b>x</b>');
ok('text escaped and wrapped in lines', await page.$eval(`[data-node="${b.id}"] text`, (t) => t.querySelectorAll('tspan').length === 2 && !t.querySelector('b')));
const blank = await page.$eval('#canvas', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; });
const count = (await doc()).nodes.length;
await page.mouse.dblclick(blank.x, blank.y);
await page.waitForSelector('#editor:not([hidden])');
await page.keyboard.type('メモ');
await page.keyboard.press('Escape');
ok('escape on new text leaves nothing behind', (await doc()).nodes.length === count && await T(() => __d.state.active.past.length) > 0);
await page.mouse.dblclick(blank.x, blank.y);
await page.waitForSelector('#editor:not([hidden])');
await page.keyboard.type('メモ');
await page.mouse.click(blank.x + 300, blank.y + 300);
ok('click outside commits new text', (await doc()).nodes.some((n) => n.type === 'text' && n.text === 'メモ'));
await page.keyboard.press(`${MOD}+z`);
ok('undo removes placed text', (await doc()).nodes.length === count);
await page.click('#palette button[data-shape="text"]');
ok('palette text opens editor', await page.$eval('#editor', (e) => !e.hidden && document.activeElement === e));
await page.keyboard.press('Escape');

// ---- 書式 ----
await page.mouse.click(c.x, c.y);
await page.click('#props .sw button[aria-label="塗り: #e3eefb"]');
ok('fill color applied', (await doc()).nodes[1].style.fill === '#e3eefb');
const ep = await T(() => __d.edgePoints(__d.state.active.doc, __d.state.active.doc.edges[0]));
const mid = await scr((ep[1].x + ep[2].x) / 2, (ep[1].y + ep[2].y) / 2);
await page.mouse.click(mid.x, mid.y);
await page.click('#props .seg button:has-text("直線")');
await page.click('#props .seg button:has-text("両端")');
d = await doc();
ok('edge style changed', d.edges[0].style.route === 'straight' && d.edges[0].style.arrowStart && d.edges[0].style.arrowEnd, JSON.stringify(d.edges[0].style));

// ---- やりとりするデータ ----
await page.fill('#props input[aria-label="ラベル"]', 'HTTPS');
await page.keyboard.press('Tab');
await page.click('#props button:has-text("データを追加")');
ok('new data row focused', await T(() => document.activeElement?.getAttribute('aria-label') === 'データ名'));
await page.keyboard.type('注文データ');
// 入力したまま次の行を追加しても、クリックが消えない
await page.click('#props button:has-text("データを追加")');
await page.keyboard.type('注文結果');
await page.locator('#props .drow').nth(1).locator('select').selectOption('backward');
await page.keyboard.press('Enter');
d = await doc();
ok('label and data saved on edge', d.edges[0].text === 'HTTPS' && JSON.stringify(d.edges[0].data) === JSON.stringify([{ name: '注文データ', dir: 'forward' }, { name: '注文結果', dir: 'backward' }]), JSON.stringify(d.edges[0]));
const dirLabels = await page.$$eval('#props .drow select', (s) => s.map((x) => x.selectedOptions[0].textContent));
ok('direction shown with shape names', dirLabels[0] === '開始 → OK?' && dirLabels[1] === 'OK? → 開始', JSON.stringify(dirLabels));
const card = await page.$eval(`[data-edge="${d.edges[0].id}"]`, (g) => [...g.querySelectorAll('text')].map((t) => t.textContent));
ok('card shows label, data and arrows', JSON.stringify(card) === JSON.stringify(['HTTPS', '→', '注文データ', '←', '注文結果']), JSON.stringify(card));
await page.keyboard.press(`${MOD}+z`);
ok('undo removes last added data', (await doc()).edges[0].data.length === 1);
await page.keyboard.press(`${MOD}+Shift+z`);
// 縦の線では上下の矢印にする
const vert = await T(() => { const D = __d.state.active.doc, e = D.edges[0], a = __d.state.active.doc.nodes.find((n) => n.id === e.from), b = D.nodes.find((n) => n.id === e.to); const ox = b.x, oy = b.y; b.x = a.x; b.y = a.y + 300; const svg = __d.exportSvg(D); b.x = ox; b.y = oy; return svg; });
ok('vertical line uses up/down arrows', vert.includes('>↓</text>') && vert.includes('>↑</text>'));
await page.locator('#props .drow').nth(0).locator('button.x').click();
ok('delete data row', JSON.stringify((await doc()).edges[0].data) === JSON.stringify([{ name: '注文結果', dir: 'backward' }]));
await page.keyboard.press(`${MOD}+z`);
ok('undo restores deleted data', (await doc()).edges[0].data.length === 2);
d = await doc();

// ---- コピーと貼り付け、元に戻す ----
await page.mouse.click(c.x, c.y);
await page.keyboard.press(`${MOD}+d`);
ok('duplicate', (await doc()).nodes.filter((n) => n.type === 'diamond').length === 2);
const n1 = (await doc()).nodes.length;
await page.keyboard.press(`${MOD}+z`);
ok('undo', (await doc()).nodes.length === n1 - 1);
await page.keyboard.press(`${MOD}+Shift+z`);
ok('redo', (await doc()).nodes.length === n1);
await page.keyboard.press(`${MOD}+z`);
// 図形を消すと、つながった線も消える
await page.mouse.click(c.x, c.y);
await page.keyboard.press('Delete');
ok('deleting shape removes its edges', (await doc()).edges.length === 0);
await page.keyboard.press(`${MOD}+z`);
ok('undo restores edge', (await doc()).edges.length === 1);

// ---- 保存と読み込み ----
await page.keyboard.press(`${MOD}+s`);
await page.waitForFunction(() => !document.querySelector('.tab.on').classList.contains('dirty'));
const saved = JSON.parse(await readFile('flow.diagram.json'));
ok('saved file content', saved.app === 'Diagram Studio' && saved.version === 1 && saved.nodes.length === d.nodes.length && saved.edges.length === 1);
ok('roundtrip parse', await T((s) => JSON.stringify(__d.parseDiagram(s)) === JSON.stringify(__d.state.active.doc), await readFile('flow.diagram.json')));

for (const [n, t, msg] of [
  ['bad1.diagram.json', '{oops', 'JSON'],
  ['bad2.diagram.json', '{"nodes":[{"id":"a","type":"evil","x":0,"y":0,"w":10,"h":10}],"edges":[]}', '種類'],
  ['bad4.diagram.json', '{"nodes":[{"id":"a","type":"rect","x":0,"y":0,"w":10,"h":10},{"id":"b","type":"rect","x":0,"y":0,"w":10,"h":10}],"edges":[{"id":"e","from":"a","to":"b","data":"x"}]}', 'データ'],
  ['bad3.diagram.json', '{"nodes":[{"id":"a","type":"rect","x":0,"y":0,"w":10,"h":10}],"edges":[{"id":"e","from":"a","to":"zz"}]}', 'つなぎ先'],
]) {
  await put(n, t);
  await page.click('#refresh');
  await page.click(`.row[data-path="${n}"]`);
  await page.waitForTimeout(150);
  const toast = await page.textContent('#toast');
  ok(`reject ${n}`, toast.includes(msg) && (await page.$$('.tab')).length === 1, toast);
}
await put('evil.diagram.json', JSON.stringify({ nodes: [{ id: 'a"><script>__x=1</script>', type: 'rect', x: 0, y: 0, w: 100, h: 50, text: '<img src=x onerror=__x=2>', style: { fill: 'red;}</style><script>__x=3</script>', color: 'url(http://x)' } }], edges: [] }));
await page.click('#refresh');
await page.click('.row[data-path="evil.diagram.json"]');
await page.waitForSelector('.tab.on:has-text("evil")');
await page.waitForTimeout(200);
ok('malicious content inert', await T(() => window.__x === 0 && !document.querySelector('#canvas script, #canvas img')));
ok('invalid colors replaced by defaults', await T(() => __d.state.active.doc.nodes[0].style.fill === '#ffffff' && __d.state.active.doc.nodes[0].style.color === '#1f2430'));
await page.click('.tab:has-text("flow")');

// ---- 書き出し ----
await page.click('[data-cmd=svg]');
await page.waitForSelector('.row[data-path="flow.svg"]');
const svg = await readFile('flow.svg');
ok('svg exported', svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svg.includes('開始') && svg.includes('&lt;b&gt;') && svg.includes('注文データ'));
ok('svg has no external references', !/href|url\(/.test(svg));
ok('svg parses as XML', await T((s) => !new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), svg));
await page.click('[data-cmd=png]');
await page.waitForSelector('.row[data-path="flow.png"]');
const png = await T(async () => { const f = await (await (await navigator.storage.getDirectory()).getFileHandle('flow.png')).getFile(); const b = await createImageBitmap(f); return { type: f.type, w: b.width, h: b.height, sig: [...new Uint8Array(await f.slice(0, 4).arrayBuffer())] }; });
ok('png exported at 2x', png.sig.join() === '137,80,78,71' && png.w > 300, JSON.stringify(png));

// ---- 閉じるときの確認 ----
await page.click('#palette button[data-shape="cloud"]');
await page.click('.tab.on .x');
await page.waitForSelector('.modal:has-text("未保存の変更")');
await page.click('.modal button:has-text("キャンセル")');
ok('close cancelled keeps tab', (await page.$$('.tab')).length === 2);

// ---- 通信 ----
ok('no network at all', reqs.length === 0 && hits.length === 0, reqs.join() + hits.join());
ok('fetch blocked by CSP', await T(async (o) => { try { await fetch(`${o}/x`, { mode: 'no-cors' }); return false; } catch { return true; } }, O));
ok('no page errors', errs.length === 0, errs.join(' / '));

await T(() => { for (const t of __d.state.tabs) t.dirty = false; });
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
