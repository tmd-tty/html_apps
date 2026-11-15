import { chromium } from 'playwright-core';import http from 'node:http';import fs from 'node:fs';
import { appHtml, appPath, outDir, MD_HOOK, HTS_HOOK } from './helpers.mjs';
setTimeout(()=>{console.log('WATCHDOG');process.exit(3)},90000);process.on('unhandledRejection',e=>{console.log('REJECT',String(e).slice(0,500));process.exit(2)});
const html=appHtml('macro-schedule-editor');const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(html)}).listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));const O=`http://127.0.0.1:${srv.address().port}`;
const b=await chromium.launch({channel:'chrome',headless:true});const ctx=await b.newContext({viewport:{width:1280,height:720}});let page=await ctx.newPage();const errs=[];const hook=p=>{p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))})};hook(page);
await ctx.addInitScript(()=>{const inj=sessionStorage.getItem('inject');if(inj!=null){localStorage.setItem('mse.drafts',inj);sessionStorage.removeItem('inject')}});
await ctx.addInitScript(()=>{const dir=()=>navigator.storage.getDirectory();window.showSaveFilePicker=async o=>(await dir()).getFileHandle(window.__saveName||o.suggestedName,{create:true})});
let pass=0,fail=0;const ok=(n,c,x='')=>{if(c){pass++;console.log('ok  ',n)}else{fail++;console.log('FAIL',n,x)}};const T=(f,a)=>page.evaluate(f,a);
await page.goto(O);await page.waitForSelector('.tab');await T(()=>localStorage.clear());await page.reload();await page.waitForSelector('.tab');
const tk=n=>({group:'G',name:n,start:'2026-04',end:'2026-06',highlight:false});
await page.setInputFiles('#fileInput',{name:'a.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({tasks:[tk('A'),tk('B')]}))});await page.waitForSelector('tbody .name');
const names=()=>page.$$eval('tbody .name',e=>e.map(x=>x.textContent).join(' '));const dirty=async()=>(await page.textContent('#status')).includes('未保存');const btn=id=>page.$eval('#'+id,e=>e.disabled);
ok('buttons disabled at start',await btn('undo')&&await btn('redo'));
const add=async n=>{await page.click('#add');await page.fill('#fName',n);await page.click('#fOk');await page.waitForFunction(()=>!document.getElementById('taskDlg').open)};
await add('C');ok('added',await names()==='G A B C');ok('undo enabled',!(await btn('undo')));
await page.keyboard.press('Meta+z');ok('undo add',await names()==='G A B',await names());ok('back to saved -> clean',!(await dirty()));ok('redo enabled',!(await btn('redo')));
await page.keyboard.press('Meta+Shift+z');ok('redo',await names()==='G A B C');ok('dirty again',await dirty());
await page.keyboard.press('Control+y');ok('ctrl+y no-op when nothing',await names()==='G A B C');
// drag
const bar=page.locator('tbody tr:has(.name:text-is("A")) .bar');const r=await bar.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+10);await page.mouse.down();await page.mouse.move(r.x+r.width/2+40,r.y+10,{steps:2});await page.mouse.move(r.x+r.width/2+72,r.y+10,{steps:2});await page.mouse.up();await page.waitForTimeout(400);
const per=()=>page.textContent('tbody tr:has(.name:text-is("A")) .period');ok('dragged',(await per())==='2026/05 – 2026/07',await per());await page.click('#undo');ok('undo drag',(await per())==='2026/04 – 2026/06',await per());
// delete, duplicate, move, highlight
await page.click('tbody tr:has(.name:text-is("B")) .bar',{button:'right'});await page.click('#ctx button:has-text("削除")');await page.click('#askYes');await page.waitForTimeout(80);ok('deleted',!(await names()).includes(' B'));await page.keyboard.press('Meta+z');ok('undo delete',(await names()).includes(' B'),await names());
await page.click('tbody tr:has(.name:text-is("A")) .bar',{button:'right'});await page.click('#ctx button:has-text("複製")');ok('dup',(await names()).includes('A のコピー'));await page.keyboard.press('Meta+z');ok('undo dup',!(await names()).includes('のコピー'));
await page.hover('tbody tr:has(.name:text-is("A"))');await page.click('tbody tr:has(.name:text-is("A")) .act:text-is("▼")');ok('moved',(await names()).startsWith('G B A'),await names());await page.keyboard.press('Meta+z');ok('undo move',(await names()).startsWith('G A B'),await names());
// redo cleared by new change
await page.keyboard.press('Meta+z');await page.keyboard.press('Meta+z');const n1=await names();ok('multi undo',!n1.includes(' C'),n1);await add('D');ok('redo cleared after new edit',await btn('redo'));
// tabs keep own history
await page.click('#newTab');ok('new tab no history',await btn('undo'));await add('X');await page.click('.tab:has-text("a.json")');await page.keyboard.press('Meta+z');ok('undo in this tab only',!(await names()).includes(' D'),await names());await page.click('.tab:has-text("新規")');ok('other tab kept',(await names()).includes('X'));
// save then undo makes dirty
await page.click('.tab:has-text("a.json")');await T(()=>{window.__saveName='a.json'});await page.click('#saveAs');await page.waitForSelector('#status.saved');await page.waitForTimeout(100);ok('clean after save',!(await page.$('.tab.dirty:has-text("a.json")')));await page.keyboard.press('Meta+Shift+z');ok('redo past save -> dirty',!!(await page.$('.tab.dirty:has-text("a.json")')));await page.keyboard.press('Meta+z');ok('undo back to saved -> clean',!(await page.$('.tab.dirty:has-text("a.json")')));await page.keyboard.press('Meta+Shift+z');
// drafts
await page.waitForTimeout(1000);const drafts=await T(()=>JSON.parse(localStorage.getItem('mse.drafts')||'{}'));ok('drafts saved',Object.keys(drafts).length===2,JSON.stringify(Object.values(drafts).map(x=>x.name)));
await T(()=>{window.onbeforeunload=null});await page.close();page=await ctx.newPage();hook(page);await page.goto(O);await page.waitForSelector('#askDlg[open]');ok('restore prompt',(await page.textContent('#askMsg')).includes('2 件'));await page.click('#askYes');await page.waitForTimeout(150);
const tabs=await page.$$eval('.tab .tn',e=>e.map(x=>x.textContent));ok('restored tabs',tabs.length===2&&tabs.every(t=>t.endsWith('(復元)')),tabs.join());ok('restored dirty',(await page.$$('.tab.dirty')).length===2);
await page.click('.tab:has-text("a.json(復元)")');ok('restored content',(await names()).includes(' A')&&!(await names()).includes('のコピー'),await names());
await T(()=>{window.__saveName=null});const sug=await T(async()=>{let n;window.showSaveFilePicker=async o=>{n=o.suggestedName;return (await navigator.storage.getDirectory()).getFileHandle('r.json',{create:true})};return 1});await page.click('#saveAs');await page.waitForSelector('#status.saved');ok('saved restored',!(await page.$('.tab.on.dirty')));
await page.waitForTimeout(1000);ok('draft removed after save',Object.keys(await T(()=>JSON.parse(localStorage.getItem('mse.drafts')||'{}'))).length===1);
await page.click('.tab.dirty .x');await page.click('#askAlt');await page.waitForTimeout(100);ok('draft removed after discard',!(await T(()=>localStorage.getItem('mse.drafts'))));
await T(()=>sessionStorage.setItem('inject',JSON.stringify({x:{name:'z',fileName:'z.json',tasks:'[{"group":"","name":"Z","start":"2026-04","end":"2026-05","highlight":false}]',time:Date.now()}})));await page.reload();await page.waitForSelector('#askDlg[open]');await page.click('#askAlt');await page.waitForTimeout(100);ok('discard drafts',!(await T(()=>localStorage.getItem('mse.drafts')))&&(await page.$$('.tab')).length===1);
await T(()=>sessionStorage.setItem('inject','{broken'));await page.reload();await page.waitForSelector('.tab');await page.waitForTimeout(200);ok('broken drafts ignored',!(await page.$('#askDlg[open]')));
console.log('errors',errs);console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
