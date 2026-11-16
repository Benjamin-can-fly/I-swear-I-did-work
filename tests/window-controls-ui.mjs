import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';

const dir=await mkdtemp(path.join(tmpdir(),'worklog-window-controls-'));
const out='artifacts/capture-window-plans-20261105',base='http://127.0.0.1:43341';
const server=spawn(process.execPath,['server/index.js'],{windowsHide:true,env:{...process.env,PORT:'43341',DATA_DIR:dir},stdio:'pipe'});
let browser;
try{
 await once(server.stdout,'data');await mkdir(out,{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.workJournalDesktop=true;window.workJournalPlatform='windows';window.nativeMessages=[];
  window.chrome.webview={postMessage:m=>window.nativeMessages.push(m),addEventListener:()=>{}};
 });
 await page.goto(base);await page.locator('[data-window=close]').waitFor();
 for(const width of [1280,900,620]){
  await page.setViewportSize({width,height:600});
  for(const section of ['today','journal','tasks','timeline','dashboard','settings']){
   await page.locator(`.sidebar [data-page=${section}]`).click();
   await page.locator(`#${section}-page`).waitFor({state:'visible'});
   // Model a long populated list without touching the live user's data.
   await page.evaluate(()=>{document.querySelector('#scroll-fixture')?.remove();const e=document.createElement('div');e.id='scroll-fixture';e.style.height='1600px';document.querySelector('.workspace').append(e);window.scrollTo({top:document.body.scrollHeight,behavior:'instant'});});
   await page.waitForFunction(()=>window.scrollY>500);
   const box=await page.locator('[data-window=close]').boundingBox();
   assert.ok(box.y>=0&&box.y<2,`${section}/${width}: close button moved to ${box.y}`);
   assert.ok(box.x+box.width<=width&&box.x+box.width>=width-20,`${section}/${width}: close not at window edge`);
   for(const action of ['minimize','maximize','close']){
    await page.locator(`[data-window=${action}]`).click();
    assert.equal(await page.evaluate(()=>window.nativeMessages.at(-1)?.action),action);
   }
   if(width===1280&&section==='today')await page.screenshot({path:out+'/window-controls-scrolled.png'});
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: all six pages at 1280 / 900 / 620 px keep native controls visible and clickable during document scrolling.');
}finally{await browser?.close();server.kill();}
