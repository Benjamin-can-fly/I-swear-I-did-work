import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-neutral-')),base='http://127.0.0.1:43263',out='artifacts/neutral-dark';
await mkdir(out,{recursive:true});const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43263',DATA_DIR:dir},stdio:'pipe'});let browser;const checks=[];
try{
 await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 for(const [name,engine,options] of [['edge',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
  browser=await engine.launch({headless:true,...options});const page=await browser.newPage({viewport:{width:1400,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('worklog.mode','dark');localStorage.setItem('worklog.accent','#3566a0');});
  await page.goto(base);const nav=async name=>{await page.locator(`.sidebar [data-page=${name}]`).click();await page.locator(`#${name}-page`).waitFor({state:'visible'});};
  await nav('tasks');await page.locator('#task-input').fill('保留这份草稿');
  for(const color of ['#466453','#3566a0','#76619a','#a15d45','#786633','#46545e']){
   await nav('settings');await page.locator(`[data-accent="${color}"]`).click();
   for(const view of ['today','journal','tasks','timeline','dashboard','settings']){
    await nav(view);
    const result=await page.evaluate(()=>{
     const neutral=color=>{const values=color.match(/[\d.]+/g)?.map(Number);return values&&Math.max(...values.slice(0,3))-Math.min(...values.slice(0,3))<.001;};
     const selectors=['body','.sidebar','.workspace','.panel','.daily-card','.dashboard-card','.data-manager','.inline-composer textarea','.today-task-notes','.section-kicker','.page-heading'];
     const failures=[];
     for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
      if(!el.getClientRects().length)continue;const s=getComputedStyle(el);
      if(s.backgroundColor!=='rgba(0, 0, 0, 0)'&&!neutral(s.backgroundColor))failures.push({selector,property:'background',value:s.backgroundColor});
      if(!neutral(s.color))failures.push({selector,property:'text',value:s.color});
     }
     return {failures,canvas:getComputedStyle(document.body).backgroundColor,surface:getComputedStyle(document.querySelector('#task-form')).backgroundColor,accent:document.documentElement.style.getPropertyValue('--accent')};
    });
    assert.deepEqual(result.failures,[],`${name} ${color} ${view}`);assert.equal(result.accent,color);assert.equal(result.canvas,'rgb(18, 18, 18)');assert.equal(result.surface,'rgb(28, 28, 28)');
    if(color==='#3566a0')await page.screenshot({path:`${out}/${name}-blue-${view}.png`,fullPage:true});
    checks.push({engine:name,color,view,neutral:true});
   }
  }
  await nav('tasks');assert.equal(await page.locator('#task-input').inputValue(),'保留这份草稿');
  await nav('settings');await page.locator('button[data-mode=light]').click();await nav('tasks');assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await page.locator('#task-input').inputValue(),'保留这份草稿');assert.deepEqual(errors,[]);
  await browser.close();browser=null;
 }
 await writeFile(`${out}/verification.json`,JSON.stringify(checks,null,2));console.log(`${checks.length} page/accent checks passed; drafts preserved; light mode unchanged.`);
}finally{await browser?.close();server.kill();}
