import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'journal-report-')),base='http://127.0.0.1:4322';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATA_DIR:dir,PORT:'4322'},stdio:'pipe'});let browser;
try{
 await new Promise((ok,no)=>{server.stdout.once('data',ok);server.once('error',no);});
 const rec=(id,date,details)=>({id,date,time:'09:21',title:'事项 '+id,details,raw:details,project:'汇报测试',createdAt:'2026-10-13T01:21:00.000Z',suggestions:[],attachments:[]});
 const fixture={version:1,records:[rec('one','2026-10-12','核对名单，保留 32 人与 7:21 的细节。'),rec('two','2026-10-13','<script>不是代码</script>\n保留换行。'),rec('long','2026-10-14',Array.from({length:100},(_,i)=>`第 ${i+1} 项详细内容，执行过程、结果与下一步安排。`).join('\n')),rec('next','2026-11-01','跨月事项')],tasks:[{id:'pending',title:'未来待办',content:'未来待办\n准备汇报',notes:'准备汇报',project:'汇报测试',due:'2026-10-15',dueTime:'15:32',status:'next',priority:'normal',recordId:'',createdAt:'2026-10-13T01:21:00.000Z',startedAt:'2026-10-13T01:21:00.000Z',completedAt:'',autoSyncRecord:false,attachments:[]}]};
 const response=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:fixture,revision:0})});assert.equal(response.status,200);
 browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await p.goto(base);await p.locator('#record-form').waitFor();await p.locator('.sidebar [data-page=timeline]').click();await p.locator('#history-month').fill('2026-10');await p.locator('#open-report').click();
 await p.locator('[data-report-unit=week]').click();await p.locator('[data-report-group]').check();assert.match(await p.locator('#report-selection-count').textContent(),/4/);
 await p.locator('[data-report-item="task:pending"]').uncheck();assert.equal(await p.locator('[data-report-group]').evaluate(e=>e.indeterminate),true);
 await p.locator('#history-month').fill('2026-11');assert.match(await p.locator('#report-selection-count').textContent(),/3/);await p.locator('[data-report-unit=month]').click();await p.locator('[data-report-group]').check();assert.match(await p.locator('#report-selection-count').textContent(),/4/);
 await p.locator('#history-month').fill('2026-10');await p.locator('[data-report-item="task:pending"]').check();await p.locator('#report-title').fill('十月周报与下月计划');await p.locator('[data-report-unit=week]').click();
 await mkdir('artifacts/guide',{recursive:true});await p.screenshot({path:'artifacts/guide/report-selection.png',animations:'disabled'});
 const [preview]=await Promise.all([p.waitForEvent('popup'),p.locator('#export-report-pdf').click()]);await preview.waitForLoadState('networkidle');assert.equal(await preview.locator('article').count(),5);assert.equal(await preview.locator('h1').textContent(),'十月周报与下月计划');assert.ok((await preview.locator('body').textContent()).includes('<script>不是代码</script>'));assert.ok((await preview.locator('body').textContent()).includes('15:32'));
 await preview.emulateMedia({media:'print'});await preview.pdf({path:'artifacts/guide/汇报导出验证.pdf',preferCSSPageSize:true,printBackground:true});await preview.screenshot({path:'artifacts/guide/report-preview.png',animations:'disabled'});
 const stored=(await (await fetch(base+'/api/data')).json()).data;assert.deepEqual(stored,fixture,'selection must not mutate entries');
 await p.setViewportSize({width:360,height:700});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#export-report-pdf').scrollIntoViewIfNeeded();assert.ok(await p.locator('#export-report-pdf').isVisible());
 await p.locator('[data-report-clear]').click();assert.equal(await p.locator('#export-report-pdf').isDisabled(),true);assert.deepEqual(errors,[]);
 await writeFile('artifacts/report-fixture.json',JSON.stringify(fixture));console.log('PASS: individual/week/month selection, partial groups, cross-month retention, no task mutation, escaped full-text PDF, narrow layout.');
}finally{await browser?.close();server.kill();}

