import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeDaily,saveDailyPlan,todayTasks} from '../src/lib/daily.js';
import {validateData,mergeData} from '../src/lib/model.js';
import {syncTaskRecord} from '../src/lib/task-record.js';
import {setTaskStatus} from '../src/lib/task-time.js';
import {deleteEntry,restoreDeleted} from '../src/lib/delete-entry.js';
const day='2026-10-15',at='2026-10-15T09:00:00.000Z';
const plan={id:'vocabulary',title:'背 50 个单词',content:'背 50 个单词',notes:'',project:'学习',due:'',dueTime:'',priority:'normal',status:'next',recordId:'',createdAt:at,startedAt:at,completedAt:'',repeatDaily:true,startDate:day,endDate:'',autoSyncRecord:true};
const start=()=>saveDailyPlan({version:1,records:[],tasks:[]},plan,day,at);
test('one daily occurrence per day, no rewrite of completion or duplicate mirrored records',()=>{
 let d=start();validateData(d);assert.equal(d.tasks.length,1);assert.equal(materializeDaily(d,day),d);
 d.tasks[0]=setTaskStatus(d.tasks[0],'done');syncTaskRecord(d,d.tasks[0]);syncTaskRecord(d,d.tasks[0]);assert.equal(d.records.length,1);
 const old=structuredClone(d.tasks[0]),r=structuredClone(d.records[0]);d=materializeDaily(d,'2026-10-16','2026-10-16T09:00:00Z');
 assert.equal(d.tasks.length,2);assert.deepEqual(d.tasks[0],old);assert.deepEqual(d.records[0],r);assert.equal(d.tasks[1].status,'next');assert.equal(todayTasks(d.tasks,'2026-10-16').daily.length,1);
 d.tasks[0]=setTaskStatus(d.tasks[0],'next');syncTaskRecord(d,d.tasks[0]);assert.equal(d.records.length,0);validateData(d);
});
test('start/end/pause and long offline gaps create only the current day',()=>{
 let d=saveDailyPlan({version:1,records:[],tasks:[]},{...plan,startDate:'2026-10-20',endDate:'2026-10-25'},day,at);assert.equal(d.tasks.length,0);
 d=materializeDaily(d,'2026-10-23');assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].routineDate,'2026-10-23');
 d.routines[0].active=false;assert.equal(materializeDaily(d,'2026-10-24'),d);d.routines[0].active=true;
 d=materializeDaily(d,'2026-10-25');assert.equal(d.tasks.length,2);assert.equal(materializeDaily(d,'2026-10-26'),d);
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
test('today does not swallow all undated tasks or yesterday daily leftovers',()=>{
 const d=start();d.tasks.push({...plan,id:'undated',repeatDaily:false},{...plan,id:'scheduled',scheduledDate:day,repeatDaily:false},{...plan,id:'overdue',due:'2026-10-14',repeatDaily:false});
 const t=todayTasks(d.tasks,day);assert.deepEqual(t.ordinary.map(x=>x.id),['scheduled']);assert.deepEqual(t.overdue.map(x=>x.id),['overdue']);assert.equal(todayTasks(d.tasks,'2026-10-16').daily.length,0);
});
