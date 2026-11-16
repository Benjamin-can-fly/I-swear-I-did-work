import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeDaily,saveDailyPlan,todayTasks} from '../src/lib/daily.js';
import {validateData,mergeData} from '../src/lib/model.js';
import {syncTaskRecord} from '../src/lib/task-record.js';
import {setTaskStatus} from '../src/lib/task-time.js';
import {deleteEntry,deletePlan,restoreDeleted} from '../src/lib/delete-entry.js';
import {mergeDataChanges,DataConflict} from '../src/lib/data-sync.js';
const day='2026-10-15',at='2026-10-15T09:00:00.000Z';
const plan={id:'vocabulary',title:'背 50 个单词',content:'背 50 个单词',notes:'',project:'学习',due:'',dueTime:'',priority:'normal',status:'next',recordId:'',createdAt:at,startedAt:at,completedAt:'',repeatDaily:true,startDate:day,endDate:'',autoSyncRecord:true};
const start=()=>saveDailyPlan({version:1,records:[],tasks:[]},plan,day,at);

test('a missed timed weekly occurrence stays visible the next day, before the week ends',()=>{
 const data=saveDailyPlan({version:1,records:[],tasks:[]},{...plan,startDate:'2026-10-12',repeatFrequency:'weekly',repeatDaily:false,scheduling:'times',slots:[{id:'monday',day:'0',time:'12:00'}],targetCount:1},'2026-10-12','2026-10-12T03:00:00Z');
 assert.equal(todayTasks(data.tasks,'2026-10-13','2026-10-13T03:00:00Z').overdue.length,1);
});
test('one daily occurrence per day, no rewrite of completion or duplicate mirrored records',()=>{
 let d=start();validateData(d);assert.equal(d.tasks.length,1);assert.equal(materializeDaily(d,day),d);
 d.tasks[0]=setTaskStatus(d.tasks[0],'done');syncTaskRecord(d,d.tasks[0]);syncTaskRecord(d,d.tasks[0]);assert.equal(d.records.length,1);
 const old=structuredClone(d.tasks[0]),r=structuredClone(d.records[0]);d=materializeDaily(d,'2026-10-16','2026-10-16T09:00:00Z');
 assert.equal(d.tasks.length,2);assert.deepEqual(d.tasks[0],old);assert.deepEqual(d.records[0],r);assert.equal(d.tasks[1].status,'next');assert.equal(todayTasks(d.tasks,'2026-10-16').daily.length,1);
 d.tasks[0]=setTaskStatus(d.tasks[0],'next');syncTaskRecord(d,d.tasks[0]);assert.equal(d.records.length,0);validateData(d);
});
test('start/end and offline gaps retain every scheduled daily occurrence, with pause excluded',()=>{
 let d=saveDailyPlan({version:1,records:[],tasks:[]},{...plan,startDate:'2026-10-20',endDate:'2026-10-25'},day,at);assert.equal(d.tasks.length,0);
 d=materializeDaily(d,'2026-10-23');assert.deepEqual(d.tasks.map(t=>t.routineDate),['2026-10-20','2026-10-21','2026-10-22','2026-10-23']);
 d.routines[0].active=false;assert.equal(materializeDaily(d,'2026-10-24'),d);
 d.routines[0].active=true;d.routines[0].historyTrackedThrough='2026-10-25';
 d=materializeDaily(d,'2026-10-25');assert.equal(d.tasks.length,5);assert.equal(materializeDaily(d,'2026-10-26'),d);
});

test('editing changes today unfinished and future occurrences, preserves completed history',()=>{
 let d=start();d=saveDailyPlan(d,{...d.routines[0],title:'背 80 个单词',due:day,dueTime:'21:30'},day,at);
 assert.equal(d.tasks[0].title,'背 80 个单词');assert.equal(d.tasks[0].dueTime,'21:30');
 d.tasks[0]=setTaskStatus(d.tasks[0],'done');syncTaskRecord(d,d.tasks[0]);
 d=saveDailyPlan(d,{...d.routines[0],title:'复习单词'},day,at);assert.equal(d.tasks[0].title,'背 80 个单词');assert.equal(d.records[0].title,'背 80 个单词');
 d=materializeDaily(d,'2026-10-16');assert.equal(d.tasks[1].title,'复习单词');validateData(d);
});
test('deleting a dated item does not resurrect it on refresh; undo and backup preserve plans',()=>{
 let d=start(),change=deleteEntry(d,'tasks',d.tasks[0].id);d=change.data;assert.equal(materializeDaily(d,day),d);assert.equal(d.tasks.length,0);
 d=restoreDeleted(d,change.removed);assert.equal(d.tasks.length,1);
 const merged=mergeData({version:1,records:[],tasks:[]},JSON.parse(JSON.stringify(d)));assert.deepEqual(merged,d);assert.deepEqual(mergeData(merged,d),d);
 assert.throws(()=>validateData({...d,routines:[{...d.routines[0],endDate:'2020-01-01'}]}));
});
test('deleting a legacy occurrence repairs missing generation markers and does not recreate it on reopen',()=>{
 let d=start();delete d.routines[0].generatedPeriods;delete d.routines[0].lastGeneratedDate;
 const id=d.tasks[0].id,change=deleteEntry(d,'tasks',id);
 let reopened=JSON.parse(JSON.stringify(change.data));
 reopened=materializeDaily(reopened,day,at);assert.equal(reopened.tasks.length,0);
 reopened=materializeDaily(reopened,'2026-10-16',at);assert.equal(reopened.tasks.length,1);assert.equal(reopened.tasks[0].routineDate,'2026-10-16');
 const restored=restoreDeleted(reopened,change.removed);assert.equal(restored.tasks.filter(t=>t.id===id).length,1);validateData(restored);
});
test('today does not swallow all undated tasks or yesterday daily leftovers',()=>{
 const d=start();d.tasks.push({...plan,id:'undated',repeatDaily:false},{...plan,id:'scheduled',scheduledDate:day,repeatDaily:false},{...plan,id:'overdue',due:'2026-10-14',repeatDaily:false});
 const t=todayTasks(d.tasks,day);assert.deepEqual(t.ordinary.map(x=>x.id),['scheduled']);assert.deepEqual(t.overdue.map(x=>x.id),['overdue']);assert.equal(todayTasks(d.tasks,'2026-10-16').daily.length,0);
});

const modern=(frequency='daily',overrides={})=>({...plan,planVersion:2,repeatFrequency:frequency,repeatDaily:frequency==='daily',scheduling:'count',targetCount:3,slots:[],leadMinutes:30,remind:false,startDate:'2026-10-12',...overrides});

test('weekday daily plans stay daily, skip the weekend, and preserve completion on Monday',()=>{
 let d=saveDailyPlan({version:1,tasks:[],records:[]},modern('daily',{weekdaysOnly:true,targetCount:1}),'2026-10-23',at);
 assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].repeatFrequency,'daily');
 d.tasks[0]=setTaskStatus(d.tasks[0],'done',at);const completed=structuredClone(d.tasks[0]);
 d=materializeDaily(d,'2026-10-24',at);d=materializeDaily(d,'2026-10-25',at);
 assert.equal(d.tasks.length,1);
 d=materializeDaily(d,'2026-10-26',at);assert.equal(d.tasks.length,2);assert.deepEqual(d.tasks[0],completed);
 assert.equal(todayTasks(d.tasks,'2026-10-26',at).daily[0].routineDate,'2026-10-26');validateData(d);
});

test('one email per workweek is available Monday, ends Friday, and resets next Monday',()=>{
 let d=saveDailyPlan({version:1,tasks:[],records:[]},modern('weekly',{weekdaysOnly:true,targetCount:1}),'2026-10-19',at);
 assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].scheduledAt,'');assert.equal(d.tasks[0].routineEnd,'2026-10-23');
 assert.equal(todayTasks(d.tasks,'2026-10-19',at).daily.length,1);
 assert.equal(todayTasks(d.tasks,'2026-10-23',at).daily.length,1);
 assert.equal(todayTasks(d.tasks,'2026-10-24',at).daily.length,0);
 d=materializeDaily(d,'2026-10-24',at);assert.equal(d.tasks.length,1);
 d=materializeDaily(d,'2026-10-26',at);assert.equal(d.tasks.length,2);assert.equal(d.tasks[1].routineEnd,'2026-10-30');
 const weekend=saveDailyPlan({version:1,tasks:[],records:[]},modern('weekly',{weekdaysOnly:true,targetCount:1}),'2026-10-24',at);
 assert.equal(weekend.tasks.length,0);assert.equal(materializeDaily(weekend,'2026-10-26',at).tasks.length,1);validateData(d);
});

test('unfinished weekday tasks and advance Monday tasks do not appear anywhere in Today at weekends',()=>{
 let d=saveDailyPlan({version:1,tasks:[],records:[]},modern('daily',{weekdaysOnly:true,targetCount:1}),'2026-10-23',at);
 const friday=structuredClone(d.tasks[0]);
 const ordinary={...plan,id:'weekend-ordinary',repeatDaily:false,due:'2026-10-23'};
 d.tasks.push(ordinary);
 for(const date of ['2026-10-24','2026-10-25']){
  d=materializeDaily(d,date,new Date(date+'T12:00:00').toISOString());
  const groups=todayTasks(d.tasks,date,new Date(date+'T12:00:00').toISOString());
  for(const group of Object.values(groups))assert.equal(group.some(t=>t.routineId==='vocabulary'),false);
  assert.ok(groups.overdue.some(t=>t.id==='weekend-ordinary'),'ordinary overdue task must remain');
  assert.deepEqual(d.tasks.find(t=>t.id===friday.id),friday,'no auto-completion or deletion');
 }
 d=materializeDaily(d,'2026-10-26',at);
 assert.equal(todayTasks(d.tasks,'2026-10-26',at).daily.filter(t=>t.routineId==='vocabulary').length,1);
 const timed=saveDailyPlan({version:1,tasks:[],records:[]},modern('daily',{weekdaysOnly:true,scheduling:'times',targetCount:1,leadMinutes:1440,slots:[{id:'morning',time:'08:00'}]}),'2026-10-25','2026-10-25T04:00:00Z');
 assert.equal(todayTasks(timed.tasks,'2026-10-25','2026-10-25T04:00:00Z').daily.length,0);
 assert.equal(todayTasks(timed.tasks,'2026-10-26','2026-10-26T04:00:00Z').daily.length,1);
});
test('three checks create three distinct entries; weekly and monthly counters roll only at boundaries',()=>{
 for(const [frequency,first,last,nextDay] of [['daily','2026-10-15','2026-10-15','2026-10-16'],['weekly','2026-10-12','2026-10-18','2026-10-19'],['monthly','2026-10-12','2026-10-31','2026-11-01']]){
  let d=saveDailyPlan({version:1,tasks:[],records:[]},modern(frequency),first,at);assert.equal(d.tasks.length,3);
  for(let i=0;i<3;i++){d.tasks[i]=setTaskStatus(d.tasks[i],'done',at);syncTaskRecord(d,d.tasks[i]);}assert.equal(d.records.length,3);
  assert.equal(materializeDaily(d,last,at),d);d=materializeDaily(d,nextDay,at);assert.equal(d.tasks.length,6);assert.equal(d.records.length,3);validateData(d);
 }
});
test('weekday times, advance visibility and per-occurrence sync/undo',()=>{
 let d=saveDailyPlan({version:1,tasks:[],records:[]},modern('weekly',{scheduling:'times',targetCount:2,slots:[{id:'a',day:'0',time:'08:00'},{id:'b',day:'3',time:'12:00'}]}),'2026-10-12',at);
 assert.deepEqual(d.tasks.map(t=>t.routineDate),['2026-10-12','2026-10-15']);validateData(d);
 assert.equal(todayTasks(d.tasks,'2026-10-15',new Date('2026-10-15T11:29:00').toISOString()).daily.length,0);
 assert.equal(todayTasks(d.tasks,'2026-10-15',new Date('2026-10-15T11:30:00').toISOString()).daily.length,1);
 d.tasks[1]=setTaskStatus(d.tasks[1],'done',at);syncTaskRecord(d,d.tasks[1]);assert.equal(d.records.length,1);
 d.tasks[1]=setTaskStatus(d.tasks[1],'next');syncTaskRecord(d,d.tasks[1]);assert.equal(d.records.length,0);
});
test('advance notice across midnight, offline gaps, deletion tombstones, pause and resume',()=>{
 const p=modern('daily',{scheduling:'times',targetCount:1,slots:[{id:'a',day:'0',time:'00:10'}]});
 let d=saveDailyPlan({version:1,tasks:[],records:[]},p,'2026-10-15',new Date('2026-10-15T23:39:00').toISOString());assert.equal(d.tasks.length,1);
 d=materializeDaily(d,'2026-10-15',new Date('2026-10-15T23:40:00').toISOString());assert.equal(d.tasks.length,2);assert.equal(d.tasks[1].routineDate,'2026-10-16');
 d.tasks=d.tasks.filter(t=>t.routineDate!=='2026-10-16');d=materializeDaily(d,'2026-10-16',at);assert.equal(d.tasks.length,1);
 d=saveDailyPlan(d,{...d.routines[0],title:'edited'},'2026-10-16',at);assert.equal(d.tasks.length,1);
 d.routines[0].active=false;assert.equal(materializeDaily(d,'2026-10-20',at),d);d.routines[0].active=true;d.routines[0].historyTrackedThrough='2026-10-20';
 d=materializeDaily(d,'2026-10-20',new Date('2026-10-20T10:00:00').toISOString());assert.equal(d.tasks.length,2);validateData(d);
});
test('month end and leap days clamp correctly, same instant is not duplicated',()=>{
 const p=modern('monthly',{startDate:'2024-01-01',scheduling:'times',targetCount:2,slots:[{id:'a',day:'31',time:'12:00'},{id:'b',day:'last',time:'12:00'}]});
 let d=saveDailyPlan({version:1,tasks:[],records:[]},p,'2024-02-01','2024-02-01T00:00:00Z');assert.deepEqual(d.tasks.map(t=>t.routineDate),['2024-02-29']);
 d=materializeDaily(d,'2025-02-01','2025-02-01T00:00:00Z');assert.equal(d.tasks.at(-1).routineDate,'2025-02-28');validateData(d);
});
test('edits preserve completed and already due entries unless explicitly applied; changing frequency starts next period',()=>{
 const p=modern('weekly',{scheduling:'times',targetCount:2,slots:[{id:'a',day:'0',time:'08:00'},{id:'b',day:'3',time:'12:00'}]});
 let d=saveDailyPlan({version:1,tasks:[],records:[]},p,'2026-10-12',at);const now=new Date('2026-10-13T10:00:00').toISOString();
 d=saveDailyPlan(d,{...d.routines[0],title:'new'},'2026-10-13',now,{applyCurrent:false});assert.equal(d.tasks[0].title,plan.title);assert.equal(d.tasks[1].title,'new');
 d.tasks[1]=setTaskStatus(d.tasks[1],'done',now);syncTaskRecord(d,d.tasks[1]);const history=structuredClone(d.records);
 d=saveDailyPlan(d,{...d.routines[0],title:'again'},'2026-10-13',now,{applyCurrent:true});assert.equal(d.tasks.find(t=>t.occurrenceKey==='a').title,'again');assert.equal(d.tasks.find(t=>t.occurrenceKey==='b').title,'new');assert.deepEqual(d.records,history);
 d=saveDailyPlan(d,{...d.routines[0],repeatFrequency:'monthly'},'2026-10-13',now);assert.equal(d.routines[0].effectiveFrom,'2026-10-19');assert.equal(d.tasks.length,2);
});
test('invalid schedule counts, times and advance offsets are rejected by the storage model',()=>{
 const d=saveDailyPlan({version:1,tasks:[],records:[]},modern(),'2026-10-15',at);
 for(const change of [{targetCount:0},{targetCount:61},{leadMinutes:-1},{leadMinutes:1441},{scheduling:'times',slots:[]}])assert.throws(()=>validateData({...d,routines:[{...d.routines[0],...change}]}));
});

test('deleting a plan removes pre-generated current/future work across reloads but keeps completed and past history',()=>{
 let d=saveDailyPlan({version:1,tasks:[],records:[]},modern('daily',{scheduling:'times',targetCount:1,slots:[{id:'morning',time:'00:10'}],leadMinutes:30,autoSyncRecord:true}),day,at);
 d.tasks[0]=setTaskStatus(d.tasks[0],'done',at);syncTaskRecord(d,d.tasks[0]);
 d=materializeDaily(d,'2026-10-16','2026-10-16T09:00:00Z');
 d=materializeDaily(d,'2026-10-17',new Date('2026-10-17T23:50:00').toISOString());
 const before=structuredClone(d),completed=d.tasks[0],pastMissed=d.tasks.find(t=>t.routineDate==='2026-10-16');
 const change=deletePlan(d,plan.id,'2026-10-17');
 assert.equal(change.data.routines.length,0);
 assert.deepEqual(change.data.tasks,[completed,pastMissed]);
 assert.deepEqual(change.data.records,before.records);
 assert.equal(change.removed.tasks.length,2,'today and the pre-generated tomorrow item are removed');
 let reopened=JSON.parse(JSON.stringify(change.data));
 for(const date of ['2026-10-17','2026-10-18','2026-10-26']){
  reopened=materializeDaily(reopened,date,at);
  assert.equal(todayTasks(reopened.tasks,date,at).daily.length,0);
  assert.equal(reopened.tasks.length,2);
 }
 validateData(reopened);
 const restored=restoreDeleted(reopened,change.removed);
 for(const key of ['tasks','records','routines'])assert.deepEqual([...restored[key]].sort((a,b)=>a.id.localeCompare(b.id)),[...before[key]].sort((a,b)=>a.id.localeCompare(b.id)));
 assert.deepEqual(d,before,'source snapshot is never mutated');
 assert.equal(restoreDeleted(restored,change.removed).tasks.length,before.tasks.length);
});

test('deleting a weekly quota removes its remaining current-period slots, preserves done work and unrelated tasks',()=>{
 let d=saveDailyPlan({version:1,tasks:[],records:[]},modern('weekly'),'2026-10-15',at);
 d.tasks[0]=setTaskStatus(d.tasks[0],'done',at);syncTaskRecord(d,d.tasks[0]);
 d.tasks[1].status='paused';d.tasks.push({...plan,id:'unrelated',repeatFrequency:'none'});
 const change=deletePlan(d,plan.id,'2026-10-15');
 assert.deepEqual(change.data.tasks.map(t=>t.id),[d.tasks[0].id,'unrelated']);
 assert.deepEqual(change.data.records,d.records);validateData(change.data);
 assert.equal(deletePlan(change.data,plan.id,'2026-10-15'),null);
});

test('deleting a plan wins over an unchanged stale window; a stale edit cannot silently restore it',()=>{
 const base=start(),removed=deletePlan(base,plan.id,day).data;
 const unrelated=structuredClone(base);unrelated.tasks.push({...plan,id:'ordinary'});
 const merged=mergeDataChanges(base,unrelated,removed);
 assert.equal(merged.routines.length,0);assert.deepEqual(merged.tasks.map(t=>t.id),['ordinary']);
 const edited=structuredClone(base);edited.tasks[0].title='stale change';
 assert.throws(()=>mergeDataChanges(base,edited,removed),DataConflict);
});
