import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const out='artifacts/theme-sync-20261023',colors=['#466453','#3566a0','#76619a','#a15d45','#786633','#46545e','#ffffff','#000000'];
await mkdir(out,{recursive:true});
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-theme-')),base='http://127.0.0.1:43264';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43264',DATA_DIR:dir},windowsHide:true,stdio:'pipe'});let browser;const checks=[];
try{
 await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 for(const [engine,type,options] of [['edge',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
  browser=await type.launch({headless:true,...options});const page=await browser.newPage({viewport:{width:1350,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.themeMessages=[];window.chrome={webview:{postMessage:m=>window.themeMessages.push(m),addEventListener:()=>{}}};});
  await page.goto(base);const nav=async view=>{await page.locator(`.sidebar [data-page=${view}]`).click();await page.locator(`#${view}-page`).waitFor({state:'visible'});};
  await nav('tasks');await page.locator('#task-input').fill('Theme check draft');
  await nav('settings');
  for(const mode of ['light','dark']){
   await page.locator(`button[data-mode=${mode}]`).click();
   for(const color of colors){
    await page.evaluate(c=>{const input=document.querySelector('#accent-hex');input.value=c;input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));},color);
    await page.waitForFunction(c=>window.themeMessages.filter(m=>m.type==='set-theme').at(-1)?.color===c,color);
    const result=await page.evaluate(()=>{
     const css=getComputedStyle(document.documentElement),resolve=name=>{const e=document.createElement('i');e.style.color=`var(${name})`;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c;};
     // Probe real selectors as well as the currently visible page.
     const probe=document.createElement('div');probe.innerHTML='<label class="sync-option"><input type="checkbox" checked><i class="sync-track"></i></label><button class="apply-time" aria-pressed="true"><i class="apply-indicator"></i></button><label class="report-item"><input type="checkbox" checked></label><svg class="load-chart"><path d="M0 0L10 10"/></svg>';
     document.body.append(probe);const get=(s,p)=>getComputedStyle(probe.querySelector(s))[p];
     const r={accent:css.getPropertyValue('--accent').trim(),readable:resolve('--accent-readable'),soft:resolve('--accent-soft'),accentRGB:resolve('--accent'),sync:get('.sync-track','backgroundColor'),apply:get('.apply-time','color'),chart:get('path','stroke'),checkbox:get('input','accentColor'),canvas:getComputedStyle(document.body).backgroundColor};probe.remove();return r;
    });
    assert.equal(result.accent,color);assert.equal(result.sync,result.accentRGB);assert.equal(result.checkbox,result.accentRGB);assert.equal(result.apply,result.readable);assert.equal(result.chart,result.readable);assert.equal(result.canvas,mode==='dark'?'rgb(18, 18, 18)':'rgb(255, 255, 255)');
    if(engine==='edge'&&mode==='dark'){const png=await page.evaluate(()=>window.themeMessages.filter(m=>m.type==='set-theme').at(-1).png);await writeFile(`${out}/icon-${color.slice(1)}.png`,Buffer.from(png,'base64'));}
    checks.push({engine,mode,color,...result});
   }
  }
  await page.evaluate(()=>{document.querySelectorAll('[data-accent]').forEach(b=>b.click());});
  await page.waitForFunction(()=>window.themeMessages.filter(m=>m.type==='set-theme').at(-1)?.color==='#46545e');
  await page.locator('[data-accent="#3566a0"]').click();await nav('tasks');assert.equal(await page.locator('#task-input').inputValue(),'Theme check draft');
  await page.locator('#task-input').click();
  const frames=await page.locator('#task-input').evaluate(el=>el.getAnimations().flatMap(a=>a.effect.getKeyframes()).map(f=>f.backgroundColor).filter(Boolean));
  assert.ok(!frames.some(c=>/^(#fff(?:fff)?|rgb\(255, 255, 255\))$/.test(c)),JSON.stringify(frames));
  await page.screenshot({path:`${out}/${engine}-blue-tasks.png`});
  await page.reload();await nav('settings');assert.equal(await page.locator('#accent-hex').inputValue(),'#3566a0');assert.equal(await page.locator('html').getAttribute('data-mode'),'dark');
  assert.deepEqual(errors,[]);await browser.close();browser=null;
 }
 await writeFile(`${out}/web-verification.json`,JSON.stringify(checks,null,2));console.log(`PASS ${checks.length} palette cases: live controls, charts, native messages, rapid switching, draft retention, reload and dark animation.`);
}finally{await browser?.close();server.kill();}
