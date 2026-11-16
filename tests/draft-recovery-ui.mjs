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
  browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});const p=await browser.newPage({timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});await p.clock.setFixedTime(new Date('2026-10-13T09:21:00+08:00'));await p.route('**/api/capture-intent',r=>r.fulfill({json:{labels:['review']}}));await p.goto(base);await p.locator('.sidebar [data-page=journal]').click();await p.locator('#record-form').waitFor();
  for(const kind of ['task','record']){
   const collection=kind==='task'?'tasks':'records',name=kind==='task'?'tasks':'journal',form='#'+kind+'-form';
   await p.evaluate(k=>localStorage.setItem('journal-inline-'+k+'-v1',JSON.stringify({item:{id:'deleted-'+k,status:'next'},values:{content:'删除之后仍应保留的文字 '+k,due:'',dueTime:'',date:'',time:'',status:'next',project:'恢复测试',autoSyncRecord:false,startedAt:'2026-10-13T09:00',priority:'normal',effort:'auto'},attachments:[],timingApplied:false,startedManually:false})),kind);
   await p.reload();await p.locator('.sidebar [data-page='+name+']').click();await p.locator(form).waitFor();
   await p.waitForFunction(s=>document.querySelector(s+' .composer-title').textContent==='随手记',form);
   const text='删除之后仍应保留的文字 '+kind;assert.equal(await p.locator(form+' textarea').inputValue(),text);
   if(kind==='record'){assert.equal(await p.locator(form+' [name=date]').inputValue(),'2026-10-13');assert.equal(await p.locator(form+' [name=time]').inputValue(),'09:21');}
   else{assert.equal(await p.locator(form+' .apply-time').getAttribute('aria-checked'),'false');assert.equal(await p.locator(form+' [name=deadlineYear]').inputValue(),'2026');assert.equal(await p.locator(form+' [name=deadlineMonth]').inputValue(),'10');assert.equal(await p.locator(form+' [name=due]').inputValue(),'');assert.equal(await p.locator(form+' [name=dueTime]').inputValue(),'');}
   const preview=p.locator(form+' .capture-line').first();await preview.waitFor();if(!await preview.evaluate(el=>el.open))await preview.locator('summary').click();await preview.locator('[data-field=kind]').selectOption(kind);
   await p.locator(form+' [type=submit]').click();await p.waitForFunction(s=>!document.querySelector(s+' textarea').value&&!document.querySelector(s+' [type=submit]').disabled,form);
   const d=(await (await fetch(base+'/api/data')).json()).data,entry=d[collection].findLast(x=>(x.details||x.content)===text);assert.ok(entry);assert.notEqual(entry.id,'deleted-'+kind);assert.equal(entry.project,'恢复测试');if(kind==='task')assert.equal(entry.due,'','Displaying a suggested month must not apply a deadline');
   const scope=kind==='task'?'#tasks':'#records';await p.locator(`${scope} [data-entry-id="${entry.id}"]`).click();await p.getByRole('menuitem',{name:'修改',exact:true}).click();
   if(kind==='task'){assert.equal(await p.locator('#task-due').inputValue(),'');await p.locator(form+' .apply-time').click();for(const [k,v] of [['Day','13'],['Hour','09'],['Minute','21']])await p.locator(form+' [name=deadline'+k+']').fill(v);assert.equal(await p.locator('#task-due').inputValue(),'2026-10-13');assert.equal(await p.locator(form+' [name=dueTime]').inputValue(),'09:21');assert.equal(await p.locator(form+' .inline-weekday').inputValue(),'1');}
   await p.locator(`${scope} [data-entry-id="${entry.id}"]`).click();await p.getByRole('menuitem',{name:'删除',exact:true}).click();await p.waitForFunction(s=>document.querySelector(s+' .composer-title').textContent==='随手记',form);assert.equal(await p.locator(form+' textarea').inputValue(),text);
  }
  await browser.close();browser=null;
 }
 console.log('PASS: orphan task/record drafts become saveable new drafts, preserve text, default date/minute/weekday, no-deadline remains off, deleting while editing recovers, Chromium + WebKit.');
}finally{await browser?.close();server.kill();}
