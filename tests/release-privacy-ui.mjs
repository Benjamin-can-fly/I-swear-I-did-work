// First-launch inspection uses a new profile and DATA_DIR, never the owner's data.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
const dir=await mkdtemp(path.join(tmpdir(),'worklog-fresh-release-')),base='http://127.0.0.1:43518';
const child=spawn(process.execPath,['server/index.js'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:'43518',DATA_DIR:dir,WORKLOG_CAPTURE_HOME:path.join(dir,'no-model')}});
let browser;
try{
 await once(child.stdout,'data');
 const get=async p=>(await(await fetch(base+p)).json());
 assert.equal((await get('/api/status')).dataDirectory,dir);
 const initial=(await get('/api/data')).data;
 assert.equal(initial.records.length,0);assert.equal(initial.tasks.length,0);assert.equal(initial.routines?.length||0,0);
 const usage=await get('/api/usage');assert.ok(!JSON.stringify(usage).includes('2026-10-'),'fresh profile has no historical usage');
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.locator('#task-input').waitFor();
 assert.equal(await page.locator('#task-input').inputValue(),'');
 const preferences=await page.evaluate(()=>({mode:document.documentElement.dataset.mode,accent:localStorage.getItem('worklog.accent'),language:document.documentElement.lang}));
 assert.equal(preferences.mode,'light');assert.ok(preferences.accent===null||preferences.accent==='#466453');assert.equal(preferences.language,'zh-CN');
 await page.reload();await page.locator('#task-input').waitFor();
 const after=(await get('/api/data')).data;assert.equal(after.records.length,0);assert.equal(after.tasks.length,0);assert.equal(after.routines?.length||0,0);
 assert.deepEqual(errors,[]);
 await mkdir('artifacts/release-privacy-20261116',{recursive:true});
 await page.screenshot({path:'artifacts/release-privacy-20261116/fresh-profile.png'});
 await writeFile('artifacts/release-privacy-20261116/fresh-profile.json',JSON.stringify({passed:true,records:0,tasks:0,routines:0,preferences,isolatedData:true,reloadStayedEmpty:true},null,2));
 console.log('PASS: clean first launch and reload; zero records/tasks/plans, empty composer, default appearance, no historical usage.');
}finally{await browser?.close();child.kill();}
