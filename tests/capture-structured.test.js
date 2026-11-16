import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {structuredCapture} from '../server/capture-structured.js';
const raw='我每周写一次作文',day='2026-11-16';
test('whole model result owns recurrence, dates, priorities and chain without keyword preclassification',()=>{
 const answer={rows:[{kind:'plan',text:'写作文',confidence:.95,plan:{repeat:'weekly',count:1,slots:[]}}]};
 const {rows}=structuredCapture(answer,raw,day);assert.equal(rows[0].kind,'plan');assert.equal(rows[0].plan.repeatFrequency,'weekly');assert.equal(rows[0].plan.targetCount,1);assert.equal(rows[0].plan.startDate,day);assert.equal(rows[0].source,raw);
 const chain=structuredCapture({rows:[{kind:'task',text:'写作文',confidence:.9,date:day,time:'21:00',when:'due',priority:'high',scheduledDate:day,scheduledTime:'18:00'},{kind:'task',text:'检查作文',confidence:.9,afterIndex:0}]},'随意语序的原话',day).rows;assert.equal(chain[1].afterIndex,0);assert.equal(chain[0].scheduledTime,'18:00');assert.equal(chain[0].priority,'high');
});
test('model output validation rejects invalid fields, impossible dates, time, cycles and plan schedules',()=>{
 const row={kind:'task',text:'事项',confidence:.9};
 for(const patch of [{date:'2026-02-30'},{time:'25:90'},{priority:'urgent'},{afterIndex:0},{confidence:1.1},{invented:'anything'},{plan:{repeat:'someday',count:1}}])assert.throws(()=>structuredCapture({rows:[{...row,...patch}]},raw,day));
 for(const plan of [{repeat:'weekly',count:2,slots:[{day:'0',time:'08:00'}]},{repeat:'monthly',count:1,slots:[{day:'32',time:'08:00'}]},{repeat:'daily',count:1,start:'2026-11-18',end:'2026-11-17'}])assert.throws(()=>structuredCapture({rows:[{...row,kind:'plan',plan}]},raw,day));
 assert.throws(()=>structuredCapture({rows:Array(13).fill(row)},raw,day));
});
test('low confidence stays review and uncertain predecessor blocks its successor',()=>{
 const {rows,retained}=structuredCapture({rows:[{kind:'task',text:'可能写作文',confidence:.4},{kind:'task',text:'检查',confidence:.9,afterIndex:0}]},raw,day);assert.equal(retained,2);assert.ok(rows.every(r=>r.kind==='review'));assert.equal(rows[1].afterIndex,undefined);
});
test('offline server path is explicitly rules; online missing component errors without falling back',()=>{
 const script=`import {parseCapture,captureModelStatus} from './server/capture-model.js';const status=await captureModelStatus();try{console.log(JSON.stringify({status,result:await parseCapture({text:'明天写作文',day:'${day}'})}));}catch(e){console.log(JSON.stringify({status,error:e.code}));}`;
 for(const mode of ['offline','online']){const p=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',windowsHide:true,env:{...process.env,WORKLOG_NETWORK_MODE:mode,WORKLOG_CAPTURE_OFFLINE:'',WORKLOG_CAPTURE_HOME:'Z:/worklog-intentionally-not-installed'}});assert.equal(p.status,0,p.stderr);const data=JSON.parse(p.stdout);assert.equal(data.status.online,mode==='online');if(mode==='offline'){assert.equal(data.result.engine,'rules');assert.equal(data.result.reason,'offline');}else assert.equal(data.error,'MODEL_KEY_REQUIRED');}
});
