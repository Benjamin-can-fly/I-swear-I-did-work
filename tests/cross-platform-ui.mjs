import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'journal-webkit-')),base='http://127.0.0.1:4324';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATA_DIR:dir,PORT:'4324'},stdio:'pipe'});let browser;
try{
 await new Promise((ok,no)=>{server.stdout.once('data',ok);server.once('error',no);});browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:960},timezoneId:'Asia/Shanghai'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#record-form').waitFor();
 const go=async name=>{await page.locator('.sidebar [data-page='+name+']').click();await page.locator('#'+name+'-page').waitFor({state:'visible'});};
 const save=async kind=>{await page.locator(`#${kind}-form [type=submit]`).click();await page.waitForFunction(k=>document.querySelector(`#${k}-form textarea`).value===''&&!document.querySelector(`#${k}-form [type=submit]`).disabled,kind);};
 await page.locator('#raw-input').fill('完成活动海报初稿');await page.locator('#raw-input').press('Meta+Enter');await page.locator('#raw-input').press('End');await page.locator('#raw-input').pressSequentially('核对活动时间与报名入口，导出打印版。');assert.ok((await page.locator('#raw-input').inputValue()).includes('\n'));
 await page.locator('#record-form input[type=file]').setInputFiles({name:'活动说明.txt',mimeType:'text/plain',buffer:Buffer.from('用于测试的公开示例附件')});await page.locator('#record-form .attachment').waitFor();await save('record');
 await go('tasks');await page.locator('#task-input').fill('确认活动场地\n联系负责人，核对座位与投影设备。');await page.locator('[name=autoSyncRecord]').check();await save('task');await page.locator('#tasks .task-check').click();await page.waitForFunction(()=>document.querySelector('#toast span').textContent.includes('已加入工作记录'));
 await page.locator('#task-input').fill('提交本周工作汇报\n汇总已完成事项，附上需要协调的问题。');await save('task');
 await go('journal');await mkdir('artifacts/readme',{recursive:true});await page.screenshot({path:'artifacts/readme/journal.png',animations:'disabled',fullPage:true});
 await go('tasks');await page.screenshot({path:'artifacts/readme/tasks.png',animations:'disabled',fullPage:true});
 await go('timeline');await page.locator('#open-report').click();await page.locator('[data-report-unit=day]').click();await page.locator('[data-report-all]').click();assert.match(await page.locator('#report-selection-count').textContent(),/3/);await page.locator('#report-title').fill('本周工作汇报');await page.screenshot({path:'artifacts/readme/timeline.png',animations:'disabled',fullPage:true});
 const [popup]=await Promise.all([page.waitForEvent('popup'),page.locator('#export-report-pdf').click()]);await popup.locator('article').nth(2).waitFor();assert.equal(await popup.locator('h1').textContent(),'本周工作汇报');await popup.close();
 // Verify the message contract shared by the Mac and Windows desktop bridges.
 await page.evaluate(()=>{window.workJournalDesktop=true;window.chrome={webview:{postMessage:m=>window.__nativeMessage=m}};});await page.locator('#export-report-pdf').click();assert.equal(await page.evaluate(()=>window.__nativeMessage.type),'export-report');
 await go('dashboard');await page.screenshot({path:'artifacts/readme/dashboard.png',animations:'disabled',fullPage:true});
 for(const name of ['journal','tasks','timeline','dashboard']){await page.setViewportSize({width:390,height:700});await go(name);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await go('journal');const downloadPromise=page.waitForEvent('download');await page.locator('#mobile-backup').click();await page.locator('#export-json').click();const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith('.json'));
 assert.deepEqual(errors,[]);console.log('PASS: WebKit save, Command+Enter, file upload, task sync, timeline/day selection, report preview/native bridge, JSON download and four-page narrow layout.');
}finally{await browser?.close();server.kill();}
