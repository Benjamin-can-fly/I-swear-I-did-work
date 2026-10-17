import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'worklog-deadline-')),base='http://127.0.0.1:43259';
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'43259',DATA_DIR:dir},stdio:'pipe'});
let browser;const results=[],day='2026-10-17',at='2026-10-17T04:00:00Z';
const nav=async(p,name)=>{await p.locator('.sidebar [data-page='+name+']').click();await p.locator('#'+name+'-page').waitFor({state:'visible'});};
const load=async()=>(await(await fetch(base+'/api/data')).json()).data;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});await mkdir('artifacts/deadline',{recursive:true});
 for(const [name,engine,options]of [['chromium',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
  const record=(id,date,extra={})=>({id,title:id,raw:id,details:id,date,time:'12:00',createdAt:at,suggestions:[],project:'',durationMinutes:null,effort:'normal',...extra});
  const snapshot=await(await fetch(base+'/api/data')).json();const seed={version:1,records:[record('today',day),record('yesterday','2026-10-16'),record('mirror',day,{sourceTaskId:'finished'})],tasks:[{id:'finished',title:'Finished early',notes:'',status:'done',due:'2026-10-20',dueTime:'18:00',autoSyncRecord:true,priority:'normal',project:'',recordId:'',createdAt:at,startedAt:at,completedAt:at}]};
  const response=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:seed,revision:snapshot.revision})});assert.ok(response.ok,await response.text());
  await writeFile(path.join(dir,'usage.json'),JSON.stringify({since:'2026-10-04',days:{'2026-10-04':{save:4},'2026-10-11':{save:50},[day]:{save:10}}}));
  browser=await engine.launch({headless:true,...options});const p=await browser.newPage({viewport:{width:1440,height:960},timezoneId:'Asia/Shanghai',locale:'zh-CN',reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date(at)});await p.goto(base);await p.locator('[data-new-today]').waitFor();
  assert.equal(await p.locator('.today-stats strong').first().innerText(),'2');await p.locator('[data-new-today]').click();
  const f=p.locator('#task-form'),part=key=>f.locator('[name=deadline'+key+']');
  assert.equal(await f.locator('.composer-fields').isVisible(),false);assert.equal(await f.locator('.apply-time').isVisible(),true);assert.equal(await f.locator('.apply-time').getAttribute('aria-checked'),'false');
  await f.locator('.apply-time').click();assert.equal(await part('Year').inputValue(),'2026');assert.equal(await part('Month').inputValue(),'10');for(const key of ['Day','Hour','Minute'])assert.equal(await part(key).inputValue(),'');
  await p.locator('#task-input').fill('Pick a real deadline');await part('Day').fill('18');await part('Hour').fill('12');await p.locator('#new-task').click();assert.equal(await p.locator('#task-input').inputValue(),'Pick a real deadline');assert.equal(await part('Minute').evaluate(el=>el===document.activeElement),true);
  await p.reload();await nav(p,'tasks');assert.equal(await part('Day').inputValue(),'18');assert.equal(await part('Hour').inputValue(),'12');assert.equal(await part('Minute').inputValue(),'');
  await part('Minute').fill('00');await part('Month').fill('02');await part('Day').fill('30');await p.locator('#new-task').click();assert.equal(await f.locator('[name=due]').inputValue(),'');
  await part('Month').fill('10');await part('Day').fill('18');await f.locator('[data-deadline-shift="1"]').click();assert.equal(await part('Day').inputValue(),'19');await f.locator('[data-deadline-shift="-1"]').click();await f.locator('.inline-weekday').selectOption('0');assert.equal(await part('Day').inputValue(),'12');await f.locator('.inline-weekday').selectOption('6');assert.equal(await part('Day').inputValue(),'18');
  await f.locator('.apply-time').click();await f.locator('.apply-time').click();assert.equal(await part('Minute').inputValue(),'00');
  await p.screenshot({path:`artifacts/deadline/${name}-deadline-light.png`});await p.locator('#new-task').click();await p.waitForFunction(()=>document.querySelector('#task-input').value==='');
  const saved=(await load()).tasks.find(t=>t.title==='Pick a real deadline');assert.equal(saved.due,'2026-10-18');assert.equal(saved.dueTime,'12:00');
  assert.equal(await p.locator('#tasks-page [data-task="'+saved.id+'"] time').getAttribute('datetime'),'2026-10-18T12:00');
  await p.locator('#tasks-page [data-entry-id="'+saved.id+'"]').click();await p.getByRole('menuitem',{name:'修改',exact:true}).click();assert.equal(await part('Day').inputValue(),'18');assert.equal(await part('Minute').inputValue(),'00');await f.locator('.cancel-edit').click();
  // Clear keeps switches, removes content, and starts a genuinely partial date.
  await f.locator('.apply-time').click();await part('Day').fill('20');await part('Hour').fill('15');await part('Minute').fill('30');await f.locator('.expand-fields').click();await f.locator('[name=autoSyncRecord]').check();await f.locator('[name=project]').fill('clear me');await p.locator('#task-input').fill('clear me');await f.locator('.clear-composer').click();
  assert.equal(await f.locator('.apply-time').getAttribute('aria-checked'),'true');assert.equal(await f.locator('[name=autoSyncRecord]').isChecked(),true);assert.equal(await f.locator('[name=project]').inputValue(),'');assert.equal(await part('Day').inputValue(),'');assert.equal(await part('Hour').inputValue(),'');assert.equal(await part('Minute').inputValue(),'');
  await f.locator('.expand-fields').click();await f.locator('[name=repeatFrequency]').selectOption('weekly');assert.equal(await f.locator('.task-deadline').isVisible(),false);await f.locator('[name=repeatFrequency]').selectOption('none');assert.equal(await f.locator('.task-deadline').isVisible(),true);await f.locator('.expand-fields').click();
  await nav(p,'dashboard');await p.locator('.frequency-bar').first().waitFor();const ticks=await p.locator('.frequency-line>span').allTextContents();assert.deepEqual(ticks,['0','25','50']);const lines=await p.locator('.frequency-line').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().y));assert.ok(lines[0]-lines[1]>80&&lines[1]-lines[2]>80,'Y ticks must be spatially separated');assert.ok((await p.locator('.frequency-fill rect').nth(7).boundingBox()).height>175,'maximum bar must reach maximum tick');assert.equal(await p.locator('.frequency-bar[title]').count(),0);await p.locator('.frequency-bar').nth(7).hover();await p.screenshot({path:`artifacts/deadline/${name}-chart-light.png`});assert.equal(await p.locator('#usage-tip-7').evaluate(el=>getComputedStyle(el).visibility),'visible');
  await p.locator('.frequency-bar').first().focus();assert.equal(await p.locator('#usage-tip-0').evaluate(el=>getComputedStyle(el).visibility),'visible');
  await nav(p,'settings');await p.locator('[data-mode=dark]').click();await p.locator('[data-language=en]').click();await p.waitForFunction(()=>document.documentElement.lang==='en');
  for(const size of [{width:1440,height:960},{width:800,height:600},{width:390,height:844}]){await p.setViewportSize(size);for(const page of ['tasks','dashboard','settings']){await nav(p,page);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),page+' overflow '+size.width);if(page==='dashboard'){await p.locator('.frequency-bar').last().hover();const box=await p.locator('.frequency-tip').last().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=size.width,'tooltip outside viewport');}await p.screenshot({path:`artifacts/deadline/${name}-${page}-dark-${size.width}.png`});}}
  assert.deepEqual(await p.evaluate(async()=>(await import('/src/lib/i18n.js')).missingMessages()),[]);assert.deepEqual(errors,[]);results.push({engine:name,checks:'partial deadline, validation, draft reload, arrows, clear, plan switch, actual-day dedup, adaptive axis, custom tooltip, English/dark/3 widths'});console.log('PASS deadline and chart '+name);await browser.close();browser=null;
 }
 await writeFile('artifacts/deadline/results.json',JSON.stringify(results,null,2));
}finally{await browser?.close();server.kill();}
