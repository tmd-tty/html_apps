// テストの共通処理。アプリはリポジトリ内の HTML をそのまま読み込み、検証用の内部フックだけを足す。
import fs from 'node:fs';
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

/** XML として壊れていないかを、ページ内の DOMParser で確かめる */
export async function badXml(page, files) {
  return page.evaluate((fs) => Object.keys(fs).filter((n) => new DOMParser().parseFromString(fs[n], 'application/xml').querySelector('parsererror')), files);
}

export const MD_HOOK = 'window.__mds = { formatTables, organizeLinks, strWidth, parseTableSize, state, commands, openFile, findNode, menuActions, moveNode, setRoot, paginate, fillTemplate };';
export const HTS_HOOK = 'window.__h = { state, commands, menuActions, findNode, formatHtml };';
