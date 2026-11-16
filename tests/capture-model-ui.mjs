import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';

// Controlled responses verify the client contract. Real model quality has a separate test.
const base='http://127.0.0.1:43441',dir=await mkdtemp(path.join(tmpdir(),'worklog-model-ui-'));
const server=spawn(process.execPath,['server/index.js'],{windowsHide:true,env:{...process.env,PORT:'43441',DATA_DIR:dir,WORKLOG_CAPTURE_HOME:path.join(dir,'no-model')},stdio:'pipe'});
const read=async()=>(await(await fetch(base+'/api/data')).json()).data;
const raw='哎呀，麻烦帮我记一下，先把作文写完，然后再仔细检查一遍';
let browser;
try{
 await once(server.stdout,'data');browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({timezoneId:'Asia/Shanghai',viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 let status={available:true,mode:'model',online:true,engine:'test-model'},configCalls=0,fail=true;
 let releaseFirst;const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
 const requests=[],row=(text,day)=>({kind:'task',text,date:day,time:'',when:'scheduled',candidates:[],target:'',source:raw});
 await page.route('**/api/capture-status',r=>r.fulfill({json:status}));
 await page.route('**/api/capture-config',r=>{configCalls++;assert.deepEqual(r.request().postDataJSON(),{apiKey:'test-key-for-client-contract'});status={available:true,mode:'model',online:true,engine:'test-model'};return r.fulfill({json:status});});
 await page.route('**/api/capture-parse',async route=>{
  const body=route.request().postDataJSON();requests.push(body);if(requests.length===1)await firstGate;
  await new Promise(r=>setTimeout(r,body.text==='慢结果'?1600:450));
  if(body.text==='明天交作业'&&fail)return route.fulfill({status:503,json:{error:'test failure'}}).catch(()=>{});
  let rows=body.text===raw?[row('写作文',body.day),{...row('检查作文',body.day),afterIndex:0}]:[row(body.text==='慢结果'?'旧结果':body.text==='新内容'?'新任务':body.text,body.day)];
  if(body.text==='明天开始后天截止')rows=[{...row('写报告',body.day),scheduledDate:body.day,scheduledTime:'12:00',when:'due',time:'18:00'}];
  if(body.text==='每周写一次作文')rows=[{kind:'plan',text:'写作文',date:body.day,time:'',when:'scheduled',plan:{repeatFrequency:'weekly',scheduling:'count',targetCount:1,slots:[],weekdaysOnly:false,startDate:body.day,endDate:'',leadMinutes:0,remind:false}}];
  await route.fulfill({json:{rows,mode:'model',engine:'test-model',timingMs:450,retained:body.text==='保留这段含义'?1:0}}).catch(()=>{});
 });
 await mkdir('artifacts/capture-model-20261116',{recursive:true});await page.goto(base);const input=page.locator('#task-input'),form=page.locator('#task-form');await input.waitFor();
 const state=key=>form.locator('.capture-model-state[data-state='+key+']').waitFor({state:'attached'});
 const ready=()=>state('ready');const saved=()=>page.waitForFunction(()=>!document.querySelector('#task-input').value&&!document.querySelector('#task-form [type=submit]').disabled);
 const review=async()=>{const summary=form.locator('.capture-results>summary');await summary.waitFor();if(!await form.locator('.capture-results').getAttribute('open'))await summary.click();};
 const undo=async()=>{await page.locator('#toast button').click();await page.locator('#toast').waitFor({state:'hidden'});await page.waitForFunction(async()=>!(await(await fetch('/api/data')).json()).data.tasks.length);};
 await input.fill(raw);await state('working');assert.equal(await form.locator('.capture-line').count(),0,'online shows no interim keyword rows');releaseFirst();
 await input.press('Enter');await saved();let data=await read();assert.deepEqual(data.tasks.map(t=>t.title),['写作文','检查作文']);assert.equal(data.tasks[1].afterTaskId,data.tasks[0].id);assert.ok(data.tasks.every(t=>t.captureRaw===raw));assert.equal(requests[0].text,raw);
 await input.blur();await input.focus();await undo();

 await input.fill(raw);await ready();assert.equal(await form.locator('.capture-results').getAttribute('open'),null);assert.match(await form.locator('.capture-results>summary').innerText(),/2 项/);assert.equal(await form.locator('[data-field=text]').first().isVisible(),false);
 assert.equal((await read()).tasks.length,0,'undo is complete before another capture');await review();await form.locator('.capture-line>summary').first().click();await form.locator('[data-field=kind]').first().selectOption('skip');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('前一步'));assert.equal((await read()).tasks.length,0);
 await form.locator('.capture-line>summary').nth(1).click();await form.locator('[data-field=afterKey]').selectOption('');await input.press('Enter');await saved();assert.equal((await read()).tasks[0].afterTaskId,undefined);await undo();

 await input.fill(raw);await ready();await review();await form.locator('.capture-line>summary').nth(1).click();await form.locator('[data-field=text]').nth(1).fill('检查论据和引用');
 const beforeReload=requests.length;await page.reload();await input.waitFor();await state('edited');await review();assert.match(await form.locator('.capture-line').nth(1).innerText(),/检查论据和引用/);assert.equal(requests.length,beforeReload);
 await input.fill('慢结果');await state('working');assert.equal(await form.locator('.capture-line').count(),0);await input.fill('新内容');await ready();await review();assert.match(await form.locator('.capture-line').innerText(),/新任务/);assert.doesNotMatch(await form.innerText(),/旧结果/);

 await input.fill('明天交作业');await input.press('Enter');await state('error');assert.equal((await read()).tasks.length,0);assert.equal(await input.inputValue(),'明天交作业');assert.equal(await form.locator('[data-model-review]').count(),0,'no online switch to rule mode');
 fail=false;await form.locator('[data-model-retry]').click();await ready();await input.press('Enter');await saved();await undo();
 const beforeIME=requests.length;await input.dispatchEvent('compositionstart');await input.fill('输入法还在选字');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(requests.length,beforeIME);assert.equal((await read()).tasks.length,0);await input.dispatchEvent('compositionend');await ready();
 await input.press('Control+Enter');assert.ok((await input.inputValue()).endsWith('\n'));
 await input.fill('保留这段含义');await state('partial');await page.reload();await input.waitFor();await state('partial');

 await input.fill('明天开始后天截止');await ready();await review();await form.locator('.capture-line>summary').click();
 const ordering=await form.locator('.capture-line-fields [data-field]').evaluateAll(els=>els.map(e=>e.dataset.field));assert.ok(ordering.indexOf('kind')<ordering.indexOf('scheduledDate'));assert.ok(ordering.indexOf('scheduledDate')<ordering.indexOf('date'));assert.equal(await form.locator('[data-field=when]:visible').count(),1);assert.equal(await form.locator('.deadline-options').isVisible(),false);
 await form.screenshot({path:'artifacts/capture-model-20261116/task-fields.png'});
 await input.fill('每周写一次作文');await ready();await review();await form.locator('.capture-line>summary').click();assert.equal(await form.locator('[data-field=kind]').inputValue(),'plan:weekly');assert.equal(await form.locator('[data-field=count]').inputValue(),'1');await form.screenshot({path:'artifacts/capture-model-20261116/weekly-fields.png'});await input.press('Enter');await saved();data=await read();assert.equal(data.routines[0].title,'写作文');assert.equal(data.routines[0].repeatFrequency,'weekly');assert.equal(data.routines[0].targetCount,1);

 // Connectivity is refreshed, not inferred from a stale model-availability cache.
 status={available:false,mode:'manual',online:false,reason:'offline',engine:'rules'};await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await state('offline');
 const beforeOffline=requests.length;await input.fill('明天整理笔记');await state('offline');await review();await form.locator('.capture-line>summary').click();await form.locator('[data-field=text]').fill('整理课堂笔记');status={available:true,mode:'model',online:true,engine:'test-model'};await page.evaluate(()=>window.dispatchEvent(new Event('online')));await state('edited');assert.equal(await form.locator('[data-field=text]').inputValue(),'整理课堂笔记');assert.equal(requests.length,beforeOffline);await input.press('Enter');await saved();assert.equal(requests.length,beforeOffline);assert.ok((await read()).tasks.some(t=>t.title==='整理课堂笔记'));
 status={available:false,mode:'manual',online:false,reason:'offline',engine:'rules'};await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await input.fill('明天交报告');await state('offline');status={available:true,mode:'model',online:true,engine:'test-model'};await page.evaluate(()=>window.dispatchEvent(new Event('online')));await ready();assert.ok(requests.some(r=>r.text==='明天交报告'));

 // Cloud access asks for the user's own key; input stays intact and keys never enter drafts.
 status={available:false,mode:'model',online:true,reason:'missing-key'};
 await page.reload();await input.waitFor();await input.fill('准备后再保存这条');await state('setup');assert.equal(await form.locator('.capture-line').count(),0);await input.press('Enter');assert.equal(await input.inputValue(),'准备后再保存这条');
 await form.locator('.capture-cloud-config>summary').click();await form.locator('[data-model-key]').fill('test-key-for-client-contract');await form.locator('[data-model-key]').press('Enter');await ready();assert.equal(configCalls,1);assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('test-key-for-client-contract'))),false);assert.equal(await input.inputValue(),'准备后再保存这条');
 await mkdir('artifacts/capture-model-20261116',{recursive:true});await form.screenshot({path:'artifacts/capture-model-20261116/compact.png'});
 await page.setViewportSize({width:390,height:780});await review();await form.locator('.capture-line>summary').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('PASS: whole-text model, no keyword preview online, compact review, prerequisite safety, draft corrections, stale response rejection, explicit retry, IME, weekly quota, offline manual editing, reconnect, cloud key configuration/privacy, narrow layout. Controlled client responses only.');
}finally{await browser?.close();server.kill();}

