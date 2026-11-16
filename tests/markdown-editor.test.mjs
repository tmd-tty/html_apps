// Markdown Studio の編集機能: リストと表の補完、整形、リンク、チェックボックス、ファイル操作、検索、テンプレート、保存
import { chromium } from 'playwright-core';
import http from 'node:http';
import { appHtml, MD_HOOK, MOD } from './helpers.mjs';

setTimeout(() => { console.log('WATCHDOG'); process.exit(3); }, 150000);
process.on('unhandledRejection', (e) => { console.log('REJECT', String(e).slice(0, 500)); process.exit(2); });

const html = appHtml('markdown-studio', MD_HOOK);
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const O = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await ctx.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n, x); } };
const T = (f, a) => page.evaluate(f, a);
const TA = 'textarea.ed:not([hidden])';
const val = () => page.$eval(TA, (e) => e.value);
const setv = async (v) => { await page.$eval(TA, (e, v) => { e.focus(); e.select(); document.execCommand('insertText', false, v); }, v); await page.waitForTimeout(150); };
const caret = (a, b = a) => page.$eval(TA, (e, [a, b]) => e.setSelectionRange(a, b), [a, b]);
const sel = () => page.$eval(TA, (e) => e.value.slice(e.selectionStart, e.selectionEnd));
const cmd = (n) => T((n) => { __mds.commands[n].run(); }, n);
const prompt = async (v) => { await page.waitForSelector('.modal input'); await page.fill('.modal input', v); await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.querySelector('.modal')); };

await page.goto(O);
await page.waitForSelector('.placeholder');
await T(async () => {
  const r = await navigator.storage.getDirectory();
  for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  const w = async (d, n, t) => { const h = await d.getFileHandle(n, { create: true }); const s = await h.createWritable(); await s.write(t); await s.close(); };
  const docs = await r.getDirectoryHandle('docs', { create: true });
  await r.getDirectoryHandle('target', { create: true });
  await w(docs, 'note.md', '# ノート\n\n検索用キーワード ほげ\n');
  await w(r, 'crlf.md', 'a\r\nb\r\n');
  await w(r, 'test.md', '# 見出し\n');
  const t = await r.getDirectoryHandle('templates', { create: true });
  await w(t, '議事録.md', '# {{title}}\n\n- 日付: {{date:YYYY/MM/DD(ddd)}}\n- ファイル: {{filename}}\n');
});
await page.click('[data-cmd=openFolder]');
await page.waitForSelector('.row[data-path="test.md"]');
await page.click('.row[data-path="test.md"]');
await page.waitForSelector(TA);

// ---- リストと表 ----
await setv('- a'); await caret(3); await page.keyboard.press('Enter'); await page.keyboard.type('b');
ok('list continues', await val() === '- a\n- b', await val());
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
ok('empty item exits list', await val() === '- a\n- b\n', JSON.stringify(await val()));
await setv('1. a'); await page.keyboard.press('Enter');
ok('numbered list continues', await val() === '1. a\n2. ', await val());
await setv('* a'); await page.keyboard.press('Tab');
ok('tab indents 4 spaces', await val() === '    * a', await val());
await page.keyboard.press('Shift+Tab');
ok('shift+tab unindents', await val() === '* a');
await setv('| a | b |\n| --- | --- |\n| c | d |'); await caret(2);
await page.keyboard.press('Tab'); ok('tab moves to next cell', await sel() === 'b');
await page.keyboard.press('Tab'); ok('tab wraps to next row', await sel() === 'c');
await setv('| 名前 | 値 |\n|:--|--:|\n| 山田太郎 | 1 |'); await caret(26); await page.keyboard.press('Enter');
ok('enter adds row and formats table', await val() === '| 名前     |  値 |\n| :------- | --: |\n| 山田太郎 |   1 |\n|          |     |', JSON.stringify(await val()));
await page.keyboard.press(`${MOD}+z`);
ok('one undo restores table', await val() === '| 名前 | 値 |\n|:--|--:|\n| 山田太郎 | 1 |', JSON.stringify(await val()));
const fmt = await T(() => __mds.formatTables('| 名前 | x |\n|:--|--:|\n| abc | 日本語 |').text);
ok('table format aligns wide chars', fmt.split('\n').map((l) => [...l].reduce((a, c) => a + (/[\x00-\xff]/.test(c) ? 1 : 2), 0)).every((w, i, a) => w === a[0]), fmt);

// ---- 文字の装飾とリンク ----
await setv('text'); await caret(0, 4); await cmd('bold');
ok('bold', await val() === '**text**');
const LONG = 'https://example.com/docs/very/long/path/to/the/specification/page?ref=abc';
await setv('仕様書はこちら。'); await caret(4, 7); await page.keyboard.press(`${MOD}+k`); await prompt(LONG);
ok('long link becomes reference', await val() === `仕様書は[こちら][1]。\n\n[1]: ${LONG}\n`, JSON.stringify(await val()));
ok('link text selected', await sel() === 'こちら');
await setv('短い'); await caret(0, 2); await page.keyboard.press(`${MOD}+k`); await prompt('https://e.co/x');
ok('short link stays inline', await val() === '[短い](https://e.co/x)');
await setv('買い物'); await page.keyboard.press('Alt+x');
ok('alt+x adds checkbox', await val() === '- [ ] 買い物', await val());
await page.keyboard.press('Alt+x');
ok('alt+x toggles checkbox', await val() === '- [x] 買い物');

// ---- 入力の安全性 ----
await setv('');
await T(() => { const t = document.querySelector('textarea.ed:not([hidden])'); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })); });
ok('IME enter ignored', await val() === '');
ok('no wrapping, horizontal scroll', await page.$eval(TA, (e) => e.getAttribute('wrap') === 'off' && getComputedStyle(e).whiteSpace === 'pre'));

// ---- 保存 ----
await setv('# 保存テスト\n');
ok('dirty mark', await page.$('.tab.dirty') !== null);
await page.keyboard.press(`${MOD}+s`);
await page.waitForFunction(() => !document.querySelector('.tab.dirty'));
ok('saved to disk', await T(async () => (await (await __mds.state.active.handle.getFile()).text()) === '# 保存テスト\n'));
await page.click('.row[data-path="crlf.md"]');
await page.waitForFunction(() => __mds.state.active?.name === 'crlf.md');
await page.keyboard.type('z'); await page.keyboard.press(`${MOD}+s`);
await page.waitForFunction(() => !document.querySelector('.tab.dirty'));
ok('CRLF line endings kept', await T(async () => (await (await __mds.state.active.handle.getFile()).text()).includes('\r\n')));
await page.keyboard.type('q');
await page.click('.tab.on .x');
await page.waitForSelector('.modal');
ok('closing unsaved tab asks', (await page.textContent('.modal')).includes('未保存'));
await page.click('.modal .btn:has-text("保存しない")');

// ---- ファイル操作 ----
const act = (n, p) => T(([n, p]) => { __mds.menuActions[n](__mds.findNode(p)); }, [n, p]);
const z = (n) => String(n).padStart(2, '0'), now = new Date(), ymd = `${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}`;
await act('newFile', 'docs'); await page.waitForSelector('.modal input');
const ini = await page.$eval('.modal input', (e) => ({ v: e.value, s: e.selectionStart, e: e.selectionEnd }));
ok('new file name starts with date', ini.v === `${ymd}_.md` && ini.s === ini.e && ini.s === ini.v.length - 3, JSON.stringify(ini));
await page.keyboard.type('定例'); await page.selectOption('.modal select', { label: '議事録.md' }); await page.keyboard.press('Enter');
await page.waitForFunction((y) => __mds.state.active?.name === `${y}_定例.md`, ymd);
const made = await val();
ok('template placeholders filled', made.startsWith(`# ${ymd}_定例\n`) && made.includes(`- ファイル: ${ymd}_定例.md`) && /- 日付: \d{4}\/\d\d\/\d\d\([日月火水木金土]\)/.test(made), made);
await act('rename', `docs/${ymd}_定例.md`); await prompt('定例改.md');
await page.waitForSelector('.row[data-path="docs/定例改.md"]');
ok('rename keeps tab', await T(() => __mds.state.active.path) === 'docs/定例改.md');
await act('duplicate', 'docs/定例改.md');
await page.waitForSelector('.row[data-path="docs/定例改 のコピー.md"]');
ok('duplicate', true);
await T(() => __mds.moveNode(__mds.findNode('docs/定例改 のコピー.md'), __mds.findNode('target')));
await page.waitForSelector('.row[data-path="target/定例改 のコピー.md"]');
ok('move', true);
await act('remove', 'target/定例改 のコピー.md'); await page.waitForSelector('.modal'); await page.click('.modal .btn.danger');
await page.waitForFunction(() => !__mds.findNode('target/定例改 のコピー.md'));
ok('delete', true);

// ---- 検索 ----
await page.keyboard.press(`${MOD}+Shift+f`);
await page.waitForSelector('.modal input');
await page.keyboard.type('ほげ');
await page.waitForSelector('.sr-hit mark:text-is("ほげ")');
await page.click('.sr-hit');
await page.waitForFunction(() => __mds.state.active?.name === 'note.md');
ok('search opens file and selects hit', await sel() === 'ほげ');

// ---- 画像の貼り付け ----
await T(async () => {
  const c = document.createElement('canvas'); c.width = 80; c.height = 40; c.getContext('2d').fillRect(0, 0, 80, 40);
  const d = new DataTransfer(); d.items.add(new File([await new Promise((x) => c.toBlob(x))], 'x.png', { type: 'image/png' }));
  __mds.state.active.ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => __mds.state.active.ta.value.includes('![image](images/image-'));
ok('pasted image saved to images folder', await T(() => !!__mds.findNode('docs/images')));

await T(() => { for (const t of __mds.state.tabs) t.dirty = false; });
console.log('errors', errs);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
