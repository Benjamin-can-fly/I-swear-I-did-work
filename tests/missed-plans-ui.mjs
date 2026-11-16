import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const out='artifacts/missed-plans-20261023';await mkdir(out,{recursive:true});
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-missed-')),base='http://127.0.0.1:43265';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43265',DATA_DIR:dir},windowsHide:true,stdio:'pipe'});let browser;
const at=new Date('2026-10-21T09:00').toISOString();
const task=(id,title,extra={})=>({id,title,notes:'',project:'',due:'',dueTime:'',status:'next',priority:'normal',recordId:'',createdAt:at,startedAt:at,completedAt:'',autoSyncRecord:false,...extra});
const rec=id=>({id,title:'Journal '+id,details:'Details',raw:'Original',date:'2026-10-23',time:'09:00',project:'',createdAt:at,suggestions:[]});
const fixture={version:1,records:[rec('r1'),rec('r2')],tasks:[task('miss1','Read 20 pages',{routineId:'p',repeatFrequency:'daily',routineDate:'2026-10-22',routinePeriod:'2026-10-22',routineEnd:'2026-10-22'}),task('miss2','Review vocabulary',{routineId:'q',repeatFrequency:'daily',routineDate:'2026-10-22',routinePeriod:'2026-10-22',routineEnd:'2026-10-22'}),task('late','Send the report',{due:'2026-10-23',dueTime:'11:00'}),task('soon','Prepare presentation',{due:'2026-10-24',dueTime:'06:00'}),task('later','Next week',{due:'2026-10-28',dueTime:'12:00'})]};
const results=[];
try{
 await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 for(const [engine,type,options] of [['edge',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
  const current=await (await fetch(base+'/api/data')).json();const saved=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,data:fixture})});assert.equal(saved.status,200,await saved.text());
  browser=await type.launch({headless:true,...options});const page=await browser.newPage({viewport:{width:1320,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-23T12:00')});await page.addInitScript(()=>{localStorage.setItem('worklog.mode','dark');});await page.goto(base);
  const nav=async view=>{await page.locator(`.sidebar [data-page=${view}]`).click();await page.locator(`#${view}-page`).waitFor({state:'visible'});};
  await page.locator('#today-page .today-task').first().waitFor();assert.equal(await page.locator('#today-page [data-show-urgency=overdue]').innerText(),'已逾期 3 项');assert.equal(await page.locator('#today-page [data-show-urgency=soon]').innerText(),'24 小时内到期 1 项');
  assert.equal(await page.locator('[data-today-task=late]').getAttribute('data-urgency'),'overdue');await page.screenshot({path:`${out}/${engine}-today.png`});
  await nav('dashboard');assert.equal((await page.locator('.missed-number').innerText()).trim().startsWith('1'),true);assert.equal(await page.locator('.missed-strip .is-missed').count(),1);
  const bounds=await page.locator('.missed-overview').boundingBox();assert.ok(bounds.y<350);await page.screenshot({path:`${out}/${engine}-dashboard.png`});
  await page.locator('[data-missed-date="2026-10-22"]').click();await page.locator('#timeline-page').waitFor({state:'visible'});await page.locator('.missed-day-note').waitFor();assert.ok((await page.locator('.missed-day-note').innerText()).includes('2'));
  await page.locator('[data-history-layout=horizontal]').click();assert.equal(await page.locator('[data-history-layout=horizontal]').getAttribute('aria-pressed'),'true');await page.locator('[data-history-layout=vertical]').hover();
  const selected=await page.locator('[data-history-layout=horizontal]').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,r:getComputedStyle(el).borderRadius}));assert.equal(selected.bg,'rgb(56, 56, 56)');assert.equal(selected.r,'999px');
  await page.screenshot({path:`${out}/${engine}-timeline.png`});
  await nav('tasks');await page.locator('#tasks [data-show-urgency=soon]').click();await page.locator('#tasks [data-task=soon]').waitFor();assert.equal(await page.locator('#tasks .task-row').count(),1);assert.equal(await page.locator('[data-task=soon]').getAttribute('data-urgency'),'soon');
  await page.locator('[data-clear-urgency]').click();await page.locator('[data-batch-mode=tasks]').click();await page.locator('[data-batch-item=tasks][value=miss1]').check();await page.locator('[data-batch-item=tasks][value=miss2]').check();await page.locator('#tasks [data-batch-delete]').click();await page.waitForFunction(()=>!document.querySelector('[data-task=miss1]'));
  let data=(await (await fetch(base+'/api/data')).json()).data;assert.equal(data.tasks.length,3);await page.locator('#toast button').click();await page.locator('[data-task=miss1]').waitFor();data=(await (await fetch(base+'/api/data')).json()).data;assert.equal(data.tasks.length,5);
  await nav('journal');await page.locator('[data-batch-mode=records]').click();await page.locator('#records [data-batch-all]').click();await page.locator('#records [data-batch-delete]').click();await page.waitForFunction(()=>!document.querySelector('#records [data-record]'));assert.equal((await (await fetch(base+'/api/data')).json()).data.records.length,0);await page.locator('#toast button').click();await page.locator('[data-record=r1]').waitFor();
  await nav('tasks');await page.locator('#task-input').fill('Draft must survive');await nav('dashboard');await page.setViewportSize({width:650,height:800});await page.screenshot({path:`${out}/${engine}-narrow.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1320,height:900});
  await nav('settings');await page.locator('[data-mode=light]').click();await nav('dashboard');await page.screenshot({path:`${out}/${engine}-light.png`});
  await nav('settings');await page.locator('[data-language=en]').click();await page.waitForFunction(()=>document.documentElement.lang==='en');await nav('dashboard');
  await nav('timeline');await nav('today');await nav('tasks');
  const missing=await page.evaluate(async()=>{const m=await import('/src/lib/i18n.js');return m.missingMessages();});results.push({engine,errors,missing,selected});assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await nav('tasks');assert.equal(await page.locator('#task-input').inputValue(),'Draft must survive');await browser.close();browser=null;
 }
 await writeFile(out+'/ui-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();server.kill();}
