// Explicit real-model acceptance. Never downloads a model or touches user data.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'worklog-model-')),out='artifacts/local-model-20261105',base='http://127.0.0.1:43476';
await mkdir(out,{recursive:true});
const p=spawn(process.execPath,['server/index.js'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:'43476',DATA_DIR:dir,WORKLOG_MODEL_IDLE_MS:'1800'}});
const rows=[];let stats,hostPid,modelPid,warmupMs;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ps=cmd=>JSON.parse(execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',cmd],{windowsHide:true,encoding:'utf8'}).trim()||'null');
const alive=id=>{try{process.kill(id,0);return true;}catch{return false;}};
const parse=async text=>{const r=await fetch(base+'/api/capture-parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,day:'2026-11-05',language:'zh-CN'})});const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));rows.push({input:text,...result});return result;};
try{
 await once(p.stdout,'data');const status=await(await fetch(base+'/api/status')).json();assert.equal(status.dataDirectory,dir);assert.equal(status.captureAI.available,true);assert.equal(status.ai,true);
 const warmStart=performance.now();const warm=await(await fetch(base+'/api/capture-warmup',{method:'POST'})).json();warmupMs=Math.round(performance.now()-warmStart);assert.equal(warm.loaded,true);
 let result=await parse('今天晚上21：00前要把csp作业补完然后把数学学了，还有seminar（优先级高）');
 assert.equal(result.rows.length,3);assert.deepEqual(result.rows.map(r=>[r.date,r.time,r.when]),Array(3).fill(['2026-11-05','21:00','due']));assert.equal(result.rows[2].priority,'high');assert.equal(result.rows[2].text.toLowerCase(),'seminar');
 result=await parse('哎我这个就是先把作文写完吧，那个写完之后还得仔细检查一遍');
 assert.equal(result.rows.length,2);assert.equal(result.rows[1].afterIndex,0);assert.ok(result.rows[0].text.includes('作文'));assert.ok(result.rows[1].text.includes('检查'));assert.ok(!result.rows.some(r=>/哎|那个|还得/.test(r.text)));
 result=await parse('呃那个我明天要去打印两份报告，然后顺便买一本笔记本，麻烦帮我记一下啊');
 assert.equal(result.rows.length,2);assert.ok(result.rows[0].text.includes('两份报告'));assert.ok(result.rows[1].text.includes('一本笔记本'));assert.ok(!result.rows.some(r=>/呃|那个|麻烦|顺便/.test(r.text)));
 result=await parse('每天晚上八点背50个单词，周一到周五，明天开始');
 assert.ok(result.rows[0].kind==='review'||result.rows[0].plan?.weekdaysOnly&&result.rows[0].plan.startDate==='2026-11-06','model cannot discard the weekday/start restrictions');
 result=await parse('我可能明天交报告，但不确定，不要安排');assert.ok(result.rows.every(r=>r.kind==='review'));
 result=await parse('Please write the essay, then proofread it');assert.ok(result.rows.every(r=>!/[\p{Script=Han}]/u.test(r.text)));assert.equal(result.rows.length,2);assert.equal(result.rows[1].afterIndex,0);
 stats=ps(`$h=Get-CimInstance Win32_Process -Filter "ParentProcessId=${p.pid}" | Where-Object Name -eq 'WorkLogModelHost.exe' | Select-Object -First 1;$m=Get-CimInstance Win32_Process -Filter "ParentProcessId=$($h.ProcessId)" | Where-Object Name -eq 'llama-server.exe' | Select-Object -First 1;$proc=Get-Process -Id $m.ProcessId;@{hostPid=$h.ProcessId;modelPid=$m.ProcessId;workingSetBytes=$proc.WorkingSet64;privateBytes=$proc.PrivateMemorySize64}|ConvertTo-Json -Compress`);
 hostPid=stats.hostPid;modelPid=stats.modelPid;assert.ok(modelPid);
 await wait(2300);assert.equal((await(await fetch(base+'/api/capture-status')).json()).loaded,false);assert.equal(alive(hostPid),false);assert.equal(alive(modelPid),false);
 await parse('帮我记一下，明天打印两份报告');
 const current=ps(`$h=Get-CimInstance Win32_Process -Filter "ParentProcessId=${p.pid}" | Where-Object Name -eq 'WorkLogModelHost.exe' | Select-Object -First 1;$m=Get-CimInstance Win32_Process -Filter "ParentProcessId=$($h.ProcessId)" | Where-Object Name -eq 'llama-server.exe' | Select-Object -First 1;@{hostPid=$h.ProcessId;modelPid=$m.ProcessId}|ConvertTo-Json -Compress`);
 p.kill();for(let n=0;n<30&&(alive(current.hostPid)||alive(current.modelPid));n++)await wait(100);
 assert.equal(alive(current.hostPid),false);assert.equal(alive(current.modelPid),false);
 await writeFile(out+'/verified-model.json',JSON.stringify({rows,memory:stats,warmupMs,idleUnloaded:true,hardParentExitCleaned:true,passed:true},null,2));console.log('PASS real local language model: source dates/priority retained, filler cleaned, two-task chain, quantities/uncertainty guarded, focus warmup, idle unload and hard-parent-exit cleanup.');
}finally{p.kill();}
