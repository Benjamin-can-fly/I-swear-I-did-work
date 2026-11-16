import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';

const day='2026-11-04',at=day+'T08:30:00+08:00',port=43293,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server/index.js'],{cwd:process.env.WORKLOG_TEST_APP_ROOT||process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),DATA_DIR:await mkdtemp(path.join(tmpdir(),'worklog-today-sort-'))},stdio:'pipe'});
let browser;
const task=(id,due,dueTime,priority='normal',extra={})=>({id,title:id,notes:'',priority,due,dueTime,status:'next',project:'',recordId:'',createdAt:at,startedAt:at,...extra});
const record=(id,extra={})=>({id,title:id,raw:id,details:id,date:day,time:'08:30',suggestions:[],project:'',createdAt:at,...extra});
try{
 await once(server.stdout,'data');
 const tasks=[task('昨天的作文','2026-11-03','','high'),task('普通·晚上',day,'20:30'),task('优先·晚',day,'18:00','high'),task('普通·早上',day,'09:15'),task('优先·早',day,'10:00','high'),task('今天不限时',day,''),task('暂停',day,'','normal',{status:'paused'}),task('今天做完','2026-11-12','','normal',{status:'done',completedAt:at}),task('明天','2026-11-05','08:00')];
 const seed={version:1,tasks,records:[record('独立记录'),record('自动镜像',{sourceTaskId:'今天做完'})]};
 const response=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:seed,revision:0})});assert.ok(response.ok,await response.text());
 browser=await chromium.launch({channel:'msedge',headless:true});
 const p=await browser.newPage({locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date(at)});await p.goto(base);
 const order=['优先·早','优先·晚','普通·早上','普通·晚上','今天不限时'];
 const ids=async()=>p.locator('#tasks [data-task]').evaluateAll(rows=>rows.map(e=>e.dataset.task));
 const check=async(kind,expected)=>{
  const b=p.locator('[data-today-stat='+kind+']');await b.waitFor();assert.equal(Number(await b.locator('strong').innerText()),expected.length);
  await b.press('Enter');await p.locator('[data-back-to-today-stat]').waitFor();
  if(kind==='done')assert.deepEqual((await p.locator('#timeline-page [data-history-id]').evaluateAll(rows=>rows.map(r=>r.dataset.historyId))).sort(),[...expected].sort());
  else assert.deepEqual(await ids(),expected);
  await p.locator('[data-back-to-today-stat]').click();await b.waitFor();assert.equal(await p.locator('#task-input').inputValue(),'尚未提交的草稿');
 };
 await p.locator('[data-today-stat=done]').waitFor();await p.locator('#task-input').fill('尚未提交的草稿');
 await check('pending',order);await check('paused',['暂停']);await check('done',['今天做完','独立记录']);
 await p.locator('[data-page=tasks]').click();await p.locator('#tasks-page').waitFor();assert.deepEqual(await ids(),[...order,'昨天的作文']);
 await p.locator('#task-range').selectOption('all');assert.deepEqual(await ids(),[...order,'昨天的作文','明天']);
 assert.deepEqual(errors,[]);console.log('PASS: all Today counts match visible entries; no duplicate mirror; draft, today/priority/time ordering and full list verified.');
}finally{server.kill();await browser?.close();}
