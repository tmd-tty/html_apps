// src/index.html に vendor/ のライブラリを埋め込み、単一の markdown-studio.html を生成する。
// CDN を使わずオフラインで完結させるため、ライブラリはすべて HTML 内に展開する。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VENDORS = ['marked.umd.js', 'purify.min.js', 'highlight.min.js', 'mermaid.min.js'];

const inlineScript = (file) => {
  const code = readFileSync(join(here, 'vendor', file), 'utf8')
    .replace(/^\s*\/\/[#@]\s*sourceMappingURL=.*$/gm, '') // 開発者ツールが外部 map を取りに行かないよう除去
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
  return `<script>/* ${file} */\n${code}\n</script>`;
};

// --test のときだけ検証用の内部フックを残す
const testBuild = process.argv.includes('--test');
const template = readFileSync(join(here, 'src', 'index.html'), 'utf8')
  .replace(/^\/\*TEST\*\/.*\n/m, (line) => (testBuild ? line : ''));
if (!template.includes('<!--VENDOR-->')) throw new Error('<!--VENDOR--> marker not found');
const html = template.replace('<!--VENDOR-->', () => VENDORS.map(inlineScript).join('\n'));
const out = testBuild ? process.argv[process.argv.indexOf('--test') + 1] : join(here, 'markdown-studio.html');
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024 / 1024).toFixed(1)} MB`);
