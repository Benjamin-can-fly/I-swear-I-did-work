import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';

const day='2026-11-04',at=day+'T07:00:00+08:00',port=43329,base='http://127.0.0.1:'+port;
const dir=await mkdtemp(path.join(tmpdir(),'worklog-reminder-ui-'));
const server=spawn(process.execPath,['server/index.js'],{windowsHide:true,env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});
let browser;
const task=(id,time)=>({id,title:id,status:'next',notes:'',project:'',priority:'normal',due:day,dueTime:time,remind:true,recordId:'',createdAt:at});
try{
 await once(server.stdout,'data');assert.equal((await(await fetch(base+'/api/status')).json()).dataDirectory,dir);
 const onceTask=task('一次性待办','18:00'),plan={...task('定时计划',''),due:'',startDate:day,endDate:day,active:true,repeatFrequency:'daily',scheduling:'times',targetCount:1,planVersion:2,slots:[{id:'a',time:'08:00'}],leadMinutes:30,remind:true};
 const save=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:0,data:{version:1,tasks:[onceTask],routines:[plan],records:[]}})});assert.equal(save.status,200,await save.text());
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.workJournalDesktop=true;window.workJournalPlatform='windows';window.workJournalScheduledReminders=true;window.reminderMessages=[];
  const listeners=[];
  window.chrome.webview={addEventListener:(type,fn)=>{if(type==='message')listeners.push(fn);},postMessage:msg=>{
   if(msg.type==='sync-reminders'||msg.type==='plan-reminder')window.reminderMessages.push(msg);
   if(msg.type==='sync-reminders')queueMicrotask(()=>listeners.forEach(fn=>fn({data:{type:'sync-reminders-result',requestId:msg.requestId,success:true}})));
  }};
 });
 await page.clock.install({time:new Date(at)});await page.goto(base);
 await page.waitForFunction(()=>window.reminderMessages.at(-1)?.items?.length===2);
 assert.deepEqual(await page.evaluate(()=>window.reminderMessages.at(-1).items.map(i=>[i.title,i.at])),[['定时计划','2026-11-03T23:30:00.000Z'],['一次性待办','2026-11-04T10:00:00.000Z']]);
 await page.clock.fastForward(31*60000);await page.locator('#today-content .daily-card [data-toggle-task]').first().waitFor();
 const completed=page.locator('#today-content .daily-card [data-toggle-task]').first();await completed.click();
 await page.waitForFunction(()=>window.reminderMessages.at(-1).items?.length===1);
 await page.locator('.sidebar [data-page=tasks]').click();await page.locator('#tasks [data-toggle-task="一次性待办"]').click();
 await page.waitForFunction(()=>window.reminderMessages.at(-1).items?.length===0);
 assert.equal(await page.evaluate(()=>window.reminderMessages.some(m=>m.type==='plan-reminder')),false);
 assert.equal(await page.locator('#task-form [name=remind]').locator('..').textContent(),'Windows 系统提醒');
 const form=page.locator('#task-form'),line=form.locator('.capture-line').first();
 await form.locator('[name=content]').fill('今天晚上8点开始整理资料');await line.locator('summary').click();
 let check=line.locator('[data-field=taskRemind]');assert.equal(await check.isChecked(),false);
 await check.check();await line.locator('[data-field=time]').fill('');assert.equal(await check.isVisible(),false);
 await line.locator('[data-field=time]').fill('20:15');assert.equal(await check.isChecked(),false);await check.check();
 await page.reload();await page.locator('.sidebar [data-page=tasks]').click();await line.locator('summary').click();
 assert.equal(await line.locator('[data-field=time]').inputValue(),'20:15');assert.equal(await check.isChecked(),true,'draft remembers explicit opt-in');
 await form.locator('[type=submit]').click();await page.waitForFunction(()=>window.reminderMessages.at(-1)?.items?.some(i=>i.title==='整理资料'));
 const load=async()=>(await(await fetch(base+'/api/data')).json()).data.tasks.find(t=>t.title==='整理资料');
 const added=await load();assert.equal(added.remind,true);assert.equal(added.due,'');assert.equal(added.scheduledTime,'20:15');
 await page.locator('#tasks [data-task="'+added.id+'"] [data-entry-menu]').click();await page.getByRole('menuitem',{name:'修改',exact:true}).click();
 const edit=form.locator('[name=oneOffRemind]');await edit.waitFor();assert.equal(await edit.isChecked(),true);await edit.uncheck();
 await form.locator('[type=submit]').click();await page.waitForFunction(()=>window.reminderMessages.at(-1)?.items?.length===0);
 assert.equal((await load()).remind===true,false);assert.equal((await load()).scheduledTime,'20:15');
 assert.deepEqual(errors,[]);console.log('PASS: Edge startup and completion sync; single timed capture opt-in, draft recovery, scheduled-only edit opt-out and native cancellation without duplicate online reminders.');
}finally{await browser?.close();server.kill();}
