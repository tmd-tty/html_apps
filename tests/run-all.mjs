// すべてのテストを順に実行し、結果をまとめて表示する。1つでも失敗すれば終了コード 1 を返す。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && (!only.length || only.some((o) => f.includes(o)))).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 180000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const summary = (out.match(/(\d+) passed, (\d+) failed/) || [])[0] || '結果を取得できませんでした';
  const ok = r.status === 0 && /, 0 failed/.test(summary);
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${f.padEnd(36)} ${summary}`);
  if (!ok) console.log(out.split('\n').filter((l) => /^FAIL|Error|REJECT|WATCHDOG/.test(l)).slice(0, 8).map((l) => `     ${l.slice(0, 200)}`).join('\n'));
}
console.log(`\n${files.length - failed} / ${files.length} ファイルが成功`);
process.exit(failed ? 1 : 0);
