import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-today-')),base='http://127.0.0.1:43219';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43219',DATA_DIR:dir},stdio:'pipe'});
let browser;const errors=[];
const load=async()=> (await(await fetch(base+'/api/data')).json()).data;
async function nav(p,name){await p.locator('.sidebar [data-page='+name+']').click();await p.locator('#'+name+'-page').waitFor({state:'visible'});}
async function save(p){await p.locator('#new-task').click();await p.waitForFunction(()=>!document.querySelector('#new-task').disabled&&document.querySelector('#task-input').value==='');}
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai',locale:'zh-CN'});p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});
 await p.addInitScript(()=>{window.workJournalDesktop=true;window.workJournalPlatform='windows';window.chrome.webview={postMessage(){},addEventListener(){}};});
 await p.clock.install({time:new Date('2026-10-15T23:58:00+08:00')});await p.goto(base);await p.locator('[data-new-today]').first().waitFor();
 assert.equal(await p.locator('#page-title').textContent(),'今天该做些什么');assert.equal(await p.locator('.topbar').evaluate(e=>e.offsetHeight),32);
 await p.locator('[data-manage-daily]').click();await p.locator('.daily-plans[open]').waitFor();await p.locator('[data-new-daily]').click();
 assert.equal(await p.locator('#task-form [name=repeatDaily]').isChecked(),true);await p.locator('#task-input').fill('背诵 50 个单词\n复习昨天不熟悉的词');await p.locator('#task-form [name=autoSyncRecord]').check();
 await p.locator('#task-form [type=file]').setInputFiles({name:'vocabulary.txt',mimeType:'text/plain',buffer:Buffer.from('50 words')});await p.locator('#task-form .attachment').waitFor();await p.locator('#new-task:enabled').waitFor();await save(p);
 let d=await load();assert.equal(d.routines.length,1);assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].due,'');assert.equal(d.tasks[0].routineDate,'2026-10-15');
 await nav(p,'today');const first=d.tasks[0].id;await p.locator(`[data-today-task="${first}"] .today-task-title`).click();await p.waitForFunction(()=>document.querySelector('.daily-card .today-task')?.classList.contains('completed'));assert.equal((await load()).records.length,1);
 await p.locator(`[data-today-task="${first}"] .task-check`).click();await p.waitForFunction(()=>!document.querySelector('.daily-card .today-task')?.classList.contains('completed'));assert.equal((await load()).records.length,0);
 await p.locator(`[data-today-task="${first}"] .task-check`).click();await p.waitForFunction(()=>document.querySelector('.daily-card .today-task')?.classList.contains('completed'));
 await p.reload();await p.locator('[data-new-today]').first().waitFor();assert.equal((await load()).tasks.length,1);
 await p.clock.fastForward(180000);await p.waitForFunction(()=>document.querySelector('.daily-card .today-task')&&!document.querySelector('.daily-card .today-task').classList.contains('completed'));
 d=await load();assert.equal(d.tasks.length,2);assert.equal(d.tasks[0].status,'done');assert.equal(d.tasks[1].routineDate,'2026-10-16');assert.equal(d.records.length,1);assert.equal(await p.locator('.daily-card .today-task').count(),1);
 await nav(p,'tasks');await p.locator('.daily-plans summary').click();await p.locator('[data-edit-daily]').click();await p.locator('#task-input').fill('背诵 60 个单词');await save(p);d=await load();assert.equal(d.tasks[0].title,'背诵 50 个单词');assert.equal(d.tasks[1].title,'背诵 60 个单词');
 await p.locator('[data-toggle-daily]').click();await p.waitForFunction(()=>document.querySelector('[data-toggle-daily]')?.textContent==='恢复');await p.clock.fastForward(86400000);assert.equal((await load()).tasks.length,2);
 await p.locator('[data-toggle-daily]').click();await p.waitForFunction(()=>document.querySelector('[data-toggle-daily]')?.textContent==='暂停');assert.equal((await load()).tasks.length,3);
 await nav(p,'today');await p.locator('[data-new-today]').first().click();await p.locator('#task-input').fill('整理本周的学习笔记');await save(p);await nav(p,'today');assert.equal(await p.locator('.today-list .today-task').count(),1);
 const backup=await(await fetch(base+'/api/backup')).json();assert.equal(backup.routines.length,1);assert.equal(backup.attachmentFiles.length,1);
 await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(650);await p.evaluate(()=>window.scrollTo(0,0));await mkdir('artifacts/today',{recursive:true});await p.screenshot({path:'artifacts/today/home-desktop.png'});
 for(const size of [{width:800,height:600},{width:390,height:844}]){await p.setViewportSize(size);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'homepage has no horizontal overflow');await nav(p,'tasks');await p.locator('[data-new-daily]').click();await p.locator('#task-form .expand-fields').click();await p.locator('#new-task').scrollIntoViewIfNeeded();const b=await p.locator('#new-task').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=size.width&&b.y+b.height<=size.height);await nav(p,'today');}
 await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:'artifacts/today/home-mobile.png'});await p.setViewportSize({width:1440,height:900});await nav(p,'tasks');await p.screenshot({path:'artifacts/today/plan-editor.png'});
 await nav(p,'journal');assert.equal(await p.locator('.clear-composer').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');await p.screenshot({path:'artifacts/today/journal-header.png'});
 assert.deepEqual(errors,[]);console.log('PASS today default, daily creation + attachments, completion/undo/sync, reload dedup, midnight rollover, plan edit/pause/resume, ordinary today task, backup, compact toolbar, responsive layout');
}finally{await browser?.close();server.kill();}
