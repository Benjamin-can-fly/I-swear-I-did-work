import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-settings-')),base='http://127.0.0.1:43229';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43229',DATA_DIR:dir},stdio:'pipe'});
let browser;const load=async()=> (await(await fetch(base+'/api/data')).json()).data;
async function nav(p,name){await p.locator('.sidebar [data-page='+name+']').click();await p.locator('#'+name+'-page').waitFor({state:'visible'});}
async function close(p,target='tasks'){await nav(p,target);assert.equal(await p.locator('#settings-page').isVisible(),false);}
async function lang(p,value){await p.locator('[data-language="'+value+'"]').click();await p.waitForFunction(l=>document.documentElement.lang===l,value);await p.locator('#settings-page').waitFor();}
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 await mkdir('artifacts/settings',{recursive:true});
 for(const [name,engine,options]of [['chromium',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
  browser=await engine.launch({headless:true,...options});const p=await browser.newPage({viewport:{width:1440,height:960},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.stack));
  await p.goto(base);await p.locator('[data-new-today]').first().waitFor();
  assert.equal(await p.locator('[data-page=settings]').innerText(),'设置');
  await nav(p,'journal');await p.locator('#raw-input').fill('工作记录\n删除 暂无记录 <b>用户文字</b> {0}');
  await p.locator('#record-form [type=file]').setInputFiles({name:'我的附件.txt',mimeType:'text/plain',buffer:Buffer.from('unchanged')});await p.locator('#record-form .attachment').waitFor();await p.locator('#organize:enabled').waitFor();
  const fontZh=await p.locator('body').evaluate(e=>getComputedStyle(e).fontFamily);
  await nav(p,'settings');assert.equal(await p.locator('dialog[open]').count(),0);assert.equal(await p.locator('.sidebar [data-page=settings]').getAttribute('aria-current'),'page');assert.ok((await p.locator('#settings-page').boundingBox()).width>700,'settings uses the main workspace');await p.locator('button[data-mode=dark]').click();
  assert.equal(await p.evaluate(()=>document.documentElement.dataset.mode),'dark');
  await p.locator('[data-accent="#76619a"]').click();
  await lang(p,'en');assert.equal(await p.locator('#page-title').innerText(),'Settings');
  assert.match(await p.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Segoe UI/);
  assert.notEqual(await p.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),fontZh);
  assert.equal(await p.locator('button[data-mode=dark]').getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('[data-accent="#76619a"]').getAttribute('aria-pressed'),'true');
  await p.screenshot({path:`artifacts/settings/${name}-settings-dark.png`});
  await close(p,'journal');assert.equal(await p.locator('#raw-input').inputValue(),'工作记录\n删除 暂无记录 <b>用户文字</b> {0}');
  assert.equal(await p.locator('#record-form .attachment').count(),1);
  await p.locator('#organize').click();await p.waitForFunction(()=>document.querySelector('#raw-input').value==='');
  const saved=(await load()).records.at(-1);assert.equal(saved.details,'工作记录\n删除 暂无记录 <b>用户文字</b> {0}');
  assert.equal(await p.locator(`[data-record="${saved.id}"] h3`).textContent(),'工作记录');
  assert.equal(await p.locator(`[data-record="${saved.id}"] .record-details`).textContent(),saved.details);
  assert.equal(await p.locator(`[data-record="${saved.id}"] .record-details b`).count(),0);
  await p.locator('#calendar-open').click();await p.screenshot({path:`artifacts/settings/${name}-calendar-dark.png`});await p.locator('#date-picker [data-close]').click();
  await nav(p,'tasks');await p.locator('#task-input').fill('Read ten pages');await p.locator('#task-form [name=autoSyncRecord]').check();await p.locator('#new-task').click();await p.waitForFunction(()=>document.querySelector('#task-input').value==='');
  const task=(await load()).tasks.at(-1);await p.locator(`[data-toggle-task="${task.id}"]`).first().click();await p.waitForFunction(()=>Number(document.querySelector('#done-count').textContent)>0);
  assert.ok((await load()).records.some(r=>r.sourceTaskId===task.id));
  await p.locator('[data-task-filter=done]').click();await p.locator(`[data-entry-id="${task.id}"]`).click();await p.getByRole('menuitem',{name:'Back to pending'}).click();
  assert.ok(!(await load()).records.some(r=>r.sourceTaskId===task.id));
  await p.locator('#task-form .expand-fields').click();await p.screenshot({path:`artifacts/settings/${name}-task-dark.png`});
  for(const page of ['timeline','dashboard','today']){await nav(p,page);if(page==='today')assert.equal(await p.locator('#page-title').textContent(),'What to do today?');if(page==='timeline'){await p.locator('#open-report').click();}await p.screenshot({path:`artifacts/settings/${name}-${page}-dark.png`});}
  const missing=await p.evaluate(async()=> (await import('/src/lib/i18n.js')).missingMessages());assert.deepEqual(missing,[],'all UI messages have English copy');
  for(const size of [{width:800,height:600},{width:390,height:844}]){await p.setViewportSize(size);await nav(p,'tasks');await p.locator('#new-task').scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');await p.locator('[data-page=settings]').click();await p.locator('[data-language="zh-CN"]').scrollIntoViewIfNeeded();const b=await p.locator('[data-language="zh-CN"]').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=size.width);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.locator('dialog[open]').count(),0);await p.screenshot({path:`artifacts/settings/${name}-settings-${size.width}.png`});await close(p);}
  await p.setViewportSize({width:1440,height:960});await p.locator('[data-page=settings]').click();await p.locator('button[data-mode=light]').click();await lang(p,'zh-CN');await p.screenshot({path:`artifacts/settings/${name}-settings-light.png`});await close(p);
  assert.match(await p.locator('#task-input').getAttribute('placeholder'),/免得回头还得猜/);assert.equal(await p.evaluate(()=>document.documentElement.dataset.mode),'light');
  await p.reload();await p.locator('[data-new-today]').first().waitFor();assert.equal(await p.locator('#page-title').textContent(),'今天该做些什么');
  assert.deepEqual(errors,[]);console.log('PASS '+name+': preferences persisted, independent fonts/copy, draft + attachment preservation, user content safe, task sync/undo, all pages, responsive settings');
  await browser.close();browser=null;
 }
}finally{await browser?.close();server.kill();}
