import test from 'node:test';
import assert from 'node:assert/strict';
import {missedPlanDays} from '../src/lib/missed-plans.js';
import {deadlineTone,countdown} from '../src/lib/deadlines.js';
import {saveDailyPlan,materializeDaily} from '../src/lib/daily.js';
import {deleteEntries,restoreDeleted} from '../src/lib/delete-entry.js';
const task={id:'a',routineId:'plan',repeatFrequency:'daily',routineDate:'2026-10-22',routineEnd:'2026-10-22',status:'next'};
test('misses count distinct past days; catch-up retains history; pauses and weeks excluded',()=>{
 const tasks=[task,{...task,id:'b'},{...task,id:'late',status:'done',completedAt:new Date('2026-10-23T01:00').toISOString()},
 {...task,id:'ok',status:'done',completedAt:new Date('2026-10-22T23:59').toISOString()},
 {...task,id:'skip',status:'paused'},{...task,id:'weekly',repeatFrequency:'weekly'},
 {...task,id:'today',routineDate:'2026-10-23'},{...task,id:'future',routineDate:'2026-10-24'}];
 const result=missedPlanDays(tasks,'2026-10-23');assert.equal(result.length,1);assert.equal(result[0].tasks.length,3);assert.equal(result[0].pending,2);
});
test('deadline warning covers exactly 24 hours, crosses midnight and respects period end',()=>{
 const now=new Date('2026-10-23T12:00'),base={status:'next',due:'2026-10-24',dueTime:'12:00'};
 assert.equal(deadlineTone(base,now),'soon');assert.equal(deadlineTone({...base,dueTime:'12:01'},now),'neutral');
 assert.equal(deadlineTone({...base,due:'2026-10-23',dueTime:'11:59'},now),'overdue');
 assert.equal(deadlineTone({...base,status:'done'},now),'neutral');assert.equal(deadlineTone({...base,status:'paused'},now),'neutral');
 assert.equal(deadlineTone({status:'next'},now),'neutral');assert.equal(deadlineTone({...base,due:'2026-10-23',dueTime:''},now),'soon');
 assert.equal(deadlineTone({...task,repeatFrequency:'weekly',routineEnd:'2026-10-25'},now),'neutral');
 assert.equal(countdown(task,now).tone,'overdue');
});
test('offline weekday backfill is idempotent and upgrade never guesses older gaps',()=>{
 const plan={id:'p',title:'Words',repeatFrequency:'daily',startDate:'2026-10-01',weekdaysOnly:true,targetCount:2};
 let d=saveDailyPlan({version:1,records:[],tasks:[]},plan,'2026-10-23');
 d=materializeDaily(d,'2026-10-27');assert.deepEqual([...new Set(d.tasks.map(t=>t.routineDate))],['2026-10-23','2026-10-26','2026-10-27']);
 assert.equal(missedPlanDays(d.tasks,'2026-10-27').length,2);assert.equal(materializeDaily(d,'2026-10-27'),d);
 delete d.routines[0].historyTrackedThrough;d=materializeDaily(d,'2026-11-02');assert.equal(d.tasks.length,8);
 const removed=deleteEntries(d,'tasks',[d.tasks[0].id]);assert.equal(materializeDaily(removed.data,'2026-11-02'),removed.data);
});
test('batch delete is atomic, handles duplicate IDs, cascades one way and can undo',()=>{
 const data={version:1,tasks:[{id:'a'},{id:'b'},{id:'ref',recordId:'ra'}],records:[{id:'ra',sourceTaskId:'a'},{id:'rb',sourceTaskId:'b'},{id:'independent'}],routines:[{id:'plan'}]};
 const change=deleteEntries(data,'tasks',['a','b','a','gone']);assert.equal(change.data.tasks.length,1);assert.equal(change.data.records.length,1);assert.equal(change.data.tasks[0].recordId,'');
 const undone=restoreDeleted(change.data,change.removed);assert.equal(undone.records.length,3);assert.equal(undone.tasks.length,3);assert.equal(undone.tasks[0].recordId,'ra');assert.deepEqual(undone.routines,data.routines);
 assert.equal(deleteEntries(data,'records',['ra','rb']).data.tasks.length,3);assert.equal(data.tasks.length,3);
});
