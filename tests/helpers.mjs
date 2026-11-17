// テストの共通処理。アプリはリポジトリ内の HTML をそのまま読み込み、検証用の内部フックだけを足す。
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** アプリの HTML のパス。例: appPath('markdown-studio') */
export const appPath = (app) => path.join(ROOT, app, `${app}.html`);

/** 内部の関数をテストから呼べるように、起動直前にフックを差し込んだ HTML を返す */
export function appHtml(app, hook) {
  const html = fs.readFileSync(appPath(app), 'utf8');
  if (!hook) return html;
  if (html.split('\nboot();').length !== 2) throw new Error(`${app}: boot() の呼び出しが見つかりません`);
  return html.replace('\nboot();', `\n${hook}\nboot();`);
}

/** スクリーンショットや出力ファイルの置き場所。OS の一時フォルダに作る */
export const outDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `html-apps-${name}-`));

/** アプリは Mac では ⌘、それ以外では Ctrl をショートカットに使う */
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** ダウンロードした ZIP(pptx / docx / xlsx)を、ページ内の JSZip で開いて中身の XML を返す */
export async function unzipInPage(page, file) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async (data) => {
    const zip = await window.JSZip.loadAsync(data, { base64: true });
    const out = {};
    for (const name of Object.keys(zip.files)) if (/\.(xml|rels)$/.test(name)) out[name] = await zip.file(name).async('string');
    return out;
  }, b64);
}

/** ZIP(pptx / docx / xlsx)を Node.js の標準機能だけで展開し、{ 名前: 文字列 } を返す */
export function unzipFile(file) {
  const b = fs.readFileSync(file);
  let end = b.length - 22;
  while (end >= 0 && b.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error(`${file}: ZIP ではありません`);
  const count = b.readUInt16LE(end + 10), out = {};
  for (let i = 0, p = b.readUInt32LE(end + 16); i < count; i++) {
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(start, start + size);
    if (!name.endsWith('/')) out[name] = (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8'); // フォルダ項目は除く
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** XML として壊れていないかを、ページ内の DOMParser で確かめる */
export async function badXml(page, files) {
  const xml = Object.fromEntries(Object.entries(files).filter(([n]) => /\.(xml|rels)$/.test(n))); // 画像などは対象外
  return page.evaluate((fs) => Object.keys(fs).filter((n) => new DOMParser().parseFromString(fs[n], 'application/xml').querySelector('parsererror')), xml);
}

export const MD_HOOK = 'window.__mds = { formatTables, organizeLinks, strWidth, parseTableSize, state, commands, openFile, findNode, menuActions, moveNode, setRoot, paginate, fillTemplate, buildPdfDom, A4 };';
export const HTS_HOOK = 'window.__h = { state, commands, menuActions, findNode, formatHtml, buildDoc, mountDoc, paginate, A4, PDF_CSS };';
