import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base='http://127.0.0.1:4325',dir=await mkdtemp(path.join(tmpdir(),'journal-orphan-draft-'));
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'4325',DATA_DIR:dir},stdio:'pipe'});let browser;
try{
 await new Promise((ok,no)=>{server.stdout.once('data',ok);server.once('error',no);});
 for(const engine of [chromium,webkit]){
  browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});const p=await browser.newPage();await p.clock.install({time:new Date('2026-10-13T09:21:00+08:00')});await p.goto(base);await p.locator('.sidebar [data-page=journal]').click();await p.locator('#record-form').waitFor();
  for(const kind of ['task','record']){
   const collection=kind==='task'?'tasks':'records',name=kind==='task'?'tasks':'journal',form='#'+kind+'-form';
   await p.evaluate(k=>localStorage.setItem('journal-inline-'+k+'-v1',JSON.stringify({item:{id:'deleted-'+k,status:'next'},values:{content:'删除之后仍应保留的文字 '+k,due:'',dueTime:'',date:'',time:'',status:'next',project:'恢复测试',autoSyncRecord:false,startedAt:'2026-10-13T09:00',priority:'normal',effort:'auto'},attachments:[],timingApplied:false,startedManually:false})),kind);
   await p.reload();await p.locator('.sidebar [data-page='+name+']').click();await p.locator(form).waitFor();
   assert.match(await p.locator(form+' .composer-title').textContent(),/新增/);assert.ok(await p.locator(form+' textarea').inputValue());assert.equal(await p.locator(form+' [name='+(kind==='task'?'due':'date')+']').inputValue(),'2026-10-13');assert.equal(await p.locator(form+' [name='+(kind==='task'?'dueTime':'time')+']').inputValue(),'09:21');
   await p.locator(form+' [type=submit]').click();await p.waitForFunction(s=>!document.querySelector(s+' textarea').value&&!document.querySelector(s+' [type=submit]').disabled,form);
   const d=(await (await fetch(base+'/api/data')).json()).data,entry=d[collection].findLast(x=>(x.details||x.content).includes('删除之后仍应保留的文字 '+kind));assert.ok(entry);assert.notEqual(entry.id,'deleted-'+kind);if(kind==='task')assert.equal(entry.due,'','Displaying a suggested date must not silently apply a deadline');
   const scope=kind==='task'?'#tasks':'#records';await p.locator(`${scope} [data-entry-id="${entry.id}"]`).click();await p.getByRole('menuitem',{name:'修改',exact:true}).click();
   if(kind==='task'){assert.equal(await p.locator('#task-due').inputValue(),'2026-10-13');await p.locator(form+' .apply-time').click();assert.equal(await p.locator(form+' [name=dueTime]').inputValue(),'09:21');}
   await p.locator(`${scope} [data-entry-id="${entry.id}"]`).click();await p.getByRole('menuitem',{name:'删除',exact:true}).click();await p.waitForFunction(s=>document.querySelector(s+' .composer-title').textContent.includes('新增'),form);assert.ok(await p.locator(form+' textarea').inputValue());
  }
  await browser.close();browser=null;
 }
 console.log('PASS: orphan task/record drafts become saveable new drafts, preserve text, default date/minute/weekday, no-deadline remains off, deleting while editing recovers, Chromium + WebKit.');
}finally{await browser?.close();server.kill();}
