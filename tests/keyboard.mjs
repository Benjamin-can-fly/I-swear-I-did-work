import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'journal-keyboard-')),base='http://127.0.0.1:4319';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATA_DIR:dir,PORT:'4319'},stdio:'pipe'});
let browser;const errors=[];
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#record-form').waitFor();
 await p.waitForTimeout(200);
 for(const [page,form,input,key,collection] of [['journal','#record-form','#raw-input','journal-inline-record-v1','records'],['tasks','#task-form','#task-input','journal-inline-task-v1','tasks']]){
  await p.locator(`[data-page=${page}]`).click();const editor=p.locator(input);await editor.fill('第一行第二行');await editor.evaluate(el=>el.setSelectionRange(3,3));await editor.press('Control+Enter');assert.equal(await editor.inputValue(),'第一行\n第二行');assert.equal(await p.locator('dialog[open]').count(),0);
  assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).values.content,key),'第一行\n第二行');
  await editor.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,cancelable:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true}));});
  let data=(await (await fetch(base+'/api/data')).json()).data;assert.equal(data[collection].length,0,'IME confirmation and held Enter do not save');
  await editor.evaluate(el=>el.setSelectionRange(0,3));await editor.press('Control+Enter');assert.equal(await editor.inputValue(),'\n\n第二行','newline replaces selected text at the caret');
  await editor.fill('键盘保存测试');await editor.press('Control+Enter');await editor.press('a');assert.equal(await editor.inputValue(),'键盘保存测试\na');
  await editor.press('Enter');await p.waitForFunction(s=>document.querySelector(s+' textarea').value===''&&!document.querySelector(s+' [type=submit]').disabled,form);
  data=(await (await fetch(base+'/api/data')).json()).data;assert.equal(data[collection].length,1);assert.equal(collection==='records'?data.records[0].details:data.tasks[0].content,'键盘保存测试\na');
  assert.ok((await p.locator(form+' .shortcut').textContent()).includes('Enter'));
 }
 assert.deepEqual(errors,[]);console.log('PASS: both editors save on Enter, Ctrl+Enter inserts at caret/replaces selection and saves drafts, IME and repeated keydown do not submit, persisted multiline content remains intact.');
}finally{await browser?.close();server.kill();}
