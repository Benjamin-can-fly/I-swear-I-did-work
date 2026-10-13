import {chromium,webkit} from '@playwright/test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'journal-clear-')),base='http://127.0.0.1:4327';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'4327',DATA_DIR:dir},stdio:'pipe'});let browser;
try{
 await new Promise((ok,no)=>{server.stdout.once('data',ok);server.once('error',no);});
 for(const engine of [chromium,webkit]){
  browser=await engine.launch(engine===chromium?{channel:'msedge',headless:true}:{headless:true});const p=await browser.newPage({viewport:{width:1280,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-13T09:21:00+08:00')});await p.goto(base);await p.locator('#record-form').waitFor();
  assert.equal(await p.locator('.brand-mark').evaluate(el=>el.complete&&el.naturalWidth>0),true,'brand asset loads');
  await p.locator('#raw-input').fill('已保存记录不能被清空按钮删除');await p.locator('#organize').click();await p.waitForFunction(()=>!document.querySelector('#organize').disabled);
  const records=(await(await fetch(base+'/api/data')).json()).data.records;
  for(const kind of ['record','task']){
   const beforeCount=(await(await fetch(base+'/api/data')).json()).data.records.length;
   await p.locator(`.sidebar [data-page=${kind==='record'?'journal':'tasks'}]`).click();const form=p.locator('#'+kind+'-form');
   await form.locator('.expand-fields').click();await form.locator('textarea').fill('需要清空的正文');await form.locator('[name=project]').fill('项目甲');
   await form.locator('[type=file]').setInputFiles({name:'清空测试.txt',mimeType:'text/plain',buffer:Buffer.from('保留原文件')});await p.waitForFunction(s=>!document.querySelector(s+' [type=submit]').disabled,'#'+kind+'-form');
   if(kind==='record'){
    await form.locator('[name=title]').fill('自定义标题');await form.locator('[name=date]').fill('2026-09-02');await form.locator('[name=time]').fill('15:17');await form.locator('[name=durationMinutes]').fill('30');await form.locator('[name=important]').check();
   }else{
    await form.locator('[name=autoSyncRecord]').check();await form.locator('[name=recordId]').selectOption(records[0].id);await form.locator('[name=due]').fill('2026-11-20');await form.locator('[name=dueTime]').fill('20:20');
   }
   await form.getByRole('button',{name:'清空输入',exact:true}).click();assert.equal(await form.locator('textarea').inputValue(),'');assert.equal(await form.locator('[name=project]').inputValue(),'');assert.equal(await form.locator('.editor-attachments').textContent(),'');
   assert.equal(await form.locator('.apply-time').getAttribute('aria-pressed'),'true');
   if(kind==='record'){assert.equal(await form.locator('[name=date]').inputValue(),'2026-09-02');assert.equal(await form.locator('[name=time]').inputValue(),'15:17');assert.equal(await form.locator('[name=title]').inputValue(),'');assert.equal(await form.locator('[name=important]').isChecked(),false);}
   else{assert.equal(await form.locator('[name=due]').inputValue(),'2026-10-13');assert.equal(await form.locator('[name=dueTime]').inputValue(),'09:21');assert.equal(await form.locator('[name=recordId]').inputValue(),'');assert.equal(await form.locator('[name=autoSyncRecord]').isChecked(),true);}
   await p.locator('#toast button').click();assert.equal(await form.locator('textarea').inputValue(),'需要清空的正文');assert.match(await form.locator('.editor-attachments').textContent(),/清空测试/);
   await form.locator('.apply-time').click();await form.locator('.clear-composer').click();assert.equal(await form.locator('.apply-time').getAttribute('aria-pressed'),'false');
   if(kind==='task'){
    assert.equal(await form.locator('[name=due]').inputValue(),'');assert.equal(await form.locator('[name=dueTime]').inputValue(),'');await p.reload();await p.locator('.sidebar [data-page=tasks]').click();assert.equal(await form.locator('[name=due]').inputValue(),'');assert.equal(await form.locator('[name=autoSyncRecord]').isChecked(),true);
    await form.locator('.apply-time').click();assert.equal(await form.locator('[name=due]').inputValue(),'2026-10-13');
   }else assert.equal(await form.locator('[name=date]').inputValue(),'2026-09-02');
   const after=(await(await fetch(base+'/api/data')).json()).data;assert.equal(after.records.length,beforeCount);
   await form.locator('textarea').fill('清空后仍然能保存');await form.locator('[type=submit]').click();await p.waitForFunction(s=>!document.querySelector(s+' [type=submit]').disabled&&!document.querySelector(s+' textarea').value,'#'+kind+'-form');
  }
  assert.deepEqual(errors,[]);await browser.close();browser=null;
 }
 console.log('PASS Chromium + WebKit: clear text/options/attachments/links; preserve switches and record date; reset task date by application state, restore cleared draft after reload, undo, retain saved entries and save after clear.');
}finally{await browser?.close();server.kill();}

