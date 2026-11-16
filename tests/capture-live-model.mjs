// Optional integration test. Requires the installed model; never uses personal data.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';

const dir=await mkdtemp(path.join(tmpdir(),'worklog-live-model-'));
const base='http://127.0.0.1:43465',out='artifacts/model-followups-20261105';
const server=spawn(process.execPath,['server/index.js'],{windowsHide:true,env:{...process.env,PORT:'43465',DATA_DIR:dir},stdio:'pipe'});
let browser;
try {
 await once(server.stdout,'data');
 const status=await (await fetch(base+'/api/status')).json();assert.equal(status.dataDirectory,dir);
 assert.equal((await (await fetch(base+'/api/capture-status')).json()).available,true);
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({timezoneId:'Asia/Shanghai',viewport:{width:1280,height:900},reducedMotion:'reduce'});
 page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.sidebar [data-page=tasks]').click();
 const input=page.locator('#task-input'),form=page.locator('#task-form');
 const raw='哎我这个就是先把作文写完吧，那个写完之后还得仔细检查一遍';
 const response=page.waitForResponse(r=>r.url().endsWith('/api/capture-parse')&&r.status()===200);
 await input.fill(raw);
 const result=await (await response).json();assert.match(result.engine,/Qwen3/);
 await form.locator('.capture-model-state[data-state=ready],.capture-model-state[data-state=partial]').waitFor();
 assert.equal(await form.locator('.capture-line').count(),2);
 assert.match(result.rows[0].text,/写作文/);assert.match(result.rows[1].text,/检查/);assert.equal(result.rows[1].afterIndex,0);
 await mkdir(out,{recursive:true});await form.screenshot({path:out+'/live-model-preview.png'});
 await input.press('Enter');await page.waitForFunction(()=>!document.querySelector('#task-input').value);
 const read=async()=>(await(await fetch(base+'/api/data')).json()).data;
 let data=await read();assert.equal(data.tasks.length,2);const [a,b]=data.tasks;
 assert.equal(b.afterTaskId,a.id);assert.equal(a.captureRaw,raw);assert.equal(b.captureRaw,raw);
 const row=id=>page.locator('#tasks [data-task="'+id+'"]');
 assert.equal(await row(b.id).locator('.task-check').isDisabled(),true);
 await row(a.id).locator('.task-check').click();
 await page.waitForFunction(id=>document.querySelector('[data-task="'+id+'"] .task-writing')===document.activeElement,b.id);
 assert.equal(await row(b.id).locator('.task-check').isEnabled(),true);
 assert.match(await page.locator('#toast').textContent(),/下一步/);
 await page.locator('#toast button').click();
 await page.waitForFunction(id=>document.querySelector('[data-task="'+id+'"] .task-check')?.disabled,b.id);
 await page.reload();await page.locator('.sidebar [data-page=tasks]').click();
 assert.equal(await row(b.id).locator('.task-check').isDisabled(),true);
 data=await read();assert.equal(data.tasks.find(t=>t.id===a.id).status,'next');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/live-model-ui.json',JSON.stringify({passed:true,engine:result.engine,timingMs:result.timingMs,input:raw,rows:result.rows,retained:result.retained,assertions:['actual local model, no mocked responses','preview and raw text preserved','saved predecessor ID','blocked until predecessor complete','next task receives focus','undo and reload retain waiting state','no browser errors'],isolatedData:true},null,2));
 console.log('PASS: real local-model preview, save, dependency release/focus, undo and reload; isolated data.');
} finally {await browser?.close();server.kill();}
