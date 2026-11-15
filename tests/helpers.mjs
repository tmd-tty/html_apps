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

export const MD_HOOK = 'window.__mds = { formatTables, organizeLinks, strWidth, parseTableSize, state, commands, openFile, findNode, menuActions, moveNode, setRoot, paginate, fillTemplate };';
export const HTS_HOOK = 'window.__h = { state, commands, menuActions, findNode, formatHtml };';
