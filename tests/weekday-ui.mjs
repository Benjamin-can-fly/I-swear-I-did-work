import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {saveDailyPlan} from '../src/lib/daily.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-weekdays-')),base='http://127.0.0.1:43261',out='artifacts/weekday-visibility-fix';
await mkdir(out,{recursive:true});
const plan={id:'weekday-vocab',title:'背诵 30 个单词',notes:'',content:'背诵 30 个单词',project:'',due:'',dueTime:'',status:'next',priority:'normal',recordId:'',createdAt:'2026-10-23T00:00:00Z',repeatFrequency:'daily',repeatDaily:true,weekdaysOnly:true,startDate:'2026-10-19',endDate:'',active:true,planVersion:2,scheduling:'count',targetCount:1,slots:[],leadMinutes:0,remind:false};
const original=saveDailyPlan({version:1,records:[],tasks:[]},plan,'2026-10-23','2026-10-23T00:00:00Z');
await writeFile(path.join(dir,'journal.json'),JSON.stringify(original));
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43261',DATA_DIR:dir},stdio:'pipe'});let browser;const checks=[];
try{
 await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 for(const [name,engine,options] of [['edge',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
  browser=await engine.launch({headless:true,...options});
  for(const [day,expected] of [['2026-10-23',1],['2026-10-24',0],['2026-10-25',0],['2026-10-26',1]]){
   const revision=(await(await fetch(base+'/api/data')).json()).revision;
   assert.equal((await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,data:original})})).status,200);
   const page=await browser.newPage({timezoneId:'Asia/Shanghai',viewport:{width:1400,height:900},reducedMotion:'reduce'});
   await page.clock.setFixedTime(new Date(day+'T12:00:00+08:00'));
   await page.goto(base);await page.locator('.sidebar [data-page=today]').click();
   await page.locator('.daily-card').waitFor();
   assert.equal(await page.locator('.daily-card .today-task').count(),expected);
   if(!expected){
    assert.equal(await page.locator('#today-page .today-task').count(),0,'Friday must not leak into weekend overdue');
    await page.screenshot({path:`${out}/${name}-${day}-today.png`,fullPage:true});
   }
   await page.locator('.sidebar [data-page=tasks]').click();
   await page.locator('#task-range').selectOption('all');
   if(!expected)assert.equal(await page.locator('#tasks [data-task]').count(),0,'all pending view should respect days off');
   const data=(await(await fetch(base+'/api/data')).json()).data;
   assert.equal(data.tasks.filter(t=>t.routineDate===day).length,expected);
   assert.equal(data.tasks.find(t=>t.routineDate==='2026-10-23').status,'next','no destructive auto-completion');
   if(day==='2026-10-26'){
    await page.locator('.sidebar [data-page=today]').click();await page.locator('[data-manage-daily]').click();
    await page.locator('#today-page [data-edit-daily="weekday-vocab"]').click();
    assert.equal(await page.locator('[name=executionDays]').inputValue(),'weekdays');
    await page.locator('[name=executionDays]').selectOption('all');
    await page.locator('[name=executionDays]').selectOption('weekdays');
    await page.screenshot({path:`${out}/${name}-active-days-setting.png`,fullPage:true});
    await page.locator('#task-form [type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#task-form .composer-title')?.textContent.includes('新增'));
    assert.equal((await(await fetch(base+'/api/data')).json()).data.routines[0].weekdaysOnly,true);
   }
   checks.push({engine:name,day,expected,passed:true});await page.close();
  }
  await browser.close();browser=null;
 }
 await writeFile(`${out}/ui-checks.json`,JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}finally{await browser?.close();server.kill();}
