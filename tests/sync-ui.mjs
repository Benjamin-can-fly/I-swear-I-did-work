import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'journal-sync-')),base='http://127.0.0.1:4323';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATA_DIR:dir,PORT:'4323'},stdio:'pipe'});let browser;
const read=async()=> (await (await fetch(base+'/api/data')).json()).data;
try{
 await new Promise((ok,no)=>{server.stdout.once('data',ok);server.once('error',no);});browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}});await p.goto(base);await p.locator('.sidebar [data-page=journal]').click();await p.locator('#record-form').waitFor();
 const go=async page=>{await p.locator('.sidebar [data-page='+page+']').click();await p.locator('#'+page+'-page').waitFor({state:'visible'});};
 const menu=async(scope,id,label)=>{await p.locator(`${scope} [data-entry-id="${id}"]`).click();await p.getByRole('menuitem',{name:label,exact:true}).click();};
 const save=async kind=>{await p.locator(`#${kind}-form [type=submit]`).click();await p.waitForFunction(k=>!document.querySelector(`#${k}-form [type=submit]`).disabled&&!document.querySelector(`#${k}-form textarea`).value,kind);};
 await go('tasks');assert.equal(await p.locator('[name=autoSyncRecord]').isChecked(),false);await p.locator('#task-input').fill('开关验证\n详细过程');await save('task');let d=await read(),id=d.tasks[0].id;await p.locator(`[data-toggle-task="${id}"]`).click();await p.waitForFunction(()=>document.querySelector('#toast span').textContent==='已完成');d=await read();assert.equal(d.records.length,0);
 await p.locator('[data-task-filter=done]').click();await menu('#tasks',id,'修改');await p.locator('[name=autoSyncRecord]').check();await save('task');d=await read();assert.equal(d.records.length,1);let rid=d.records[0].id;
 await menu('#tasks',id,'修改');await p.locator('#task-input').fill('更改后的任务\n所有细节仍在');await save('task');d=await read();assert.equal(d.records[0].details,'更改后的任务\n所有细节仍在');assert.equal(d.records[0].id,rid);
 await go('journal');await menu('#records',rid,'修改');await p.locator('#raw-input').fill('只改记录');await save('record');d=await read();assert.equal(d.tasks[0].content,'更改后的任务\n所有细节仍在');
 await menu('#records',rid,'删除');await p.waitForFunction(()=>document.querySelector('#toast span').textContent.includes('已删除'));d=await read();assert.equal(d.records.length,0);assert.equal(d.tasks.length,1);
 await go('tasks');await menu('#tasks',id,'修改');await save('task');d=await read();assert.equal(d.records.length,1);
 await menu('#tasks',id,'修改');await p.locator('[name=autoSyncRecord]').uncheck();await save('task');d=await read();assert.equal(d.records.length,0);
 await menu('#tasks',id,'修改');await p.locator('[name=autoSyncRecord]').check();await save('task');await menu('#tasks',id,'删除');await p.waitForFunction(()=>document.querySelector('#toast span').textContent.includes('已同步删除'));d=await read();assert.equal(d.records.length,0);assert.equal(d.tasks.length,0);await p.locator('#toast button').click();await p.waitForFunction(()=>document.querySelector('#toast span').textContent==='已恢复');d=await read();assert.equal(d.records.length,1);assert.equal(d.tasks.length,1);
 await menu('#tasks',id,'返回待处理');await p.waitForFunction(()=>document.querySelector('#toast span').textContent==='已返回待处理');d=await read();assert.equal(d.records.length,0);
 // The parent glyph must rotate in addition to its four independent particles.
 await p.locator('#task-input').fill('旋转验证');await p.evaluate(()=>{window.__frames=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.assemble-icon'))window.__frames.push(frames);return original.call(this,frames,options);};});await save('task');assert.ok(await p.evaluate(()=>window.__frames.some(frames=>frames.some(f=>f.transform?.includes('286deg')))));
 console.log('PASS: default off, enable/disable, directional edit/delete/reopen, paired deletion undo, click glyph rotation.');
}finally{await browser?.close();server.kill();}
