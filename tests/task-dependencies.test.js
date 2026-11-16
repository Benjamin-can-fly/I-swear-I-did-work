import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReadyTransitions,assertTaskReady,dependencyState,isTaskBlocked,newlyReadyTasks,validateDependencies} from '../src/lib/task-dependencies.js';
import {validateData,mergeData} from '../src/lib/model.js';
import {setTaskStatus} from '../src/lib/task-time.js';
import {syncTaskRecord} from '../src/lib/task-record.js';
import {deleteEntry,restoreDeleted} from '../src/lib/delete-entry.js';
import {todayTasks} from '../src/lib/daily.js';
import {todayStatLists} from '../src/lib/today-count.js';
import {planReminderQueue} from '../src/lib/plan-reminders.js';
import {mergeDataChanges} from '../src/lib/data-sync.js';

const day='2026-11-05',at=day+'T08:00:00+08:00';
const task=(id,extra={})=>({id,title:id,notes:'',project:'',due:day,dueTime:'20:00',scheduledDate:day,status:'next',priority:'normal',recordId:'',createdAt:at,startedAt:at,completedAt:'',remind:true,autoSyncRecord:true,...extra});
const fixture=()=>({version:1,tasks:[task('作文'),task('检查',{afterTaskId:'作文'}),task('提交',{afterTaskId:'检查'})],records:[]});

test('a saved chain waits, unlocks only the direct next step, and returns to waiting after an undo',()=>{
 const before=fixture(),data=JSON.parse(JSON.stringify(validateData(before)));
 assert.equal(isTaskBlocked(data.tasks[0],data.tasks),false);assert.equal(isTaskBlocked(data.tasks[1],data.tasks),true);
 assert.throws(()=>assertTaskReady(data.tasks[1],data.tasks),/请先完成/);
 data.tasks[0]=setTaskStatus(data.tasks[0],'done',at);
 assert.deepEqual(newlyReadyTasks(before,data).map(t=>t.id),['检查']);
 assert.equal(isTaskBlocked(data.tasks[2],data.tasks),true);
 const reopened=JSON.parse(JSON.stringify(validateData(data)));
 assert.doesNotThrow(()=>assertTaskReady(reopened.tasks[1],reopened.tasks));
 reopened.tasks[0]=setTaskStatus(reopened.tasks[0],'next');
 assert.equal(isTaskBlocked(reopened.tasks[1],reopened.tasks),true);
 assert.deepEqual(newlyReadyTasks(data,reopened),[]);
});

test('reverting an ancestor preserves already completed work and its synchronized record',()=>{
 const data=fixture();data.tasks[0]=setTaskStatus(data.tasks[0],'done',at);data.tasks[1]=setTaskStatus(data.tasks[1],'done',at);syncTaskRecord(data,data.tasks[1]);
 const saved=structuredClone(data),record=structuredClone(data.records);
 data.tasks[0]=setTaskStatus(data.tasks[0],'next');
 assert.equal(isTaskBlocked(data.tasks[1],data.tasks),false);assert.equal(isTaskBlocked(data.tasks[2],data.tasks),false);
 assert.doesNotThrow(()=>assertReadyTransitions(saved,data));assert.deepEqual(data.records,record);validateData(data);
 data.tasks[1]=setTaskStatus(data.tasks[1],'next');syncTaskRecord(data,data.tasks[1]);
 assert.equal(isTaskBlocked(data.tasks[1],data.tasks),true);assert.equal(isTaskBlocked(data.tasks[2],data.tasks),true);assert.equal(data.records.length,0);
});

test('deleting a predecessor leaves a recoverable waiting relation; undo restores its identity',()=>{
 const data=fixture(),change=deleteEntry(data,'tasks','作文');validateData(change.data);
 const waiting=change.data.tasks.find(t=>t.id==='检查');
 assert.equal(waiting.afterTaskId,'作文');assert.equal(dependencyState(waiting,change.data.tasks).missing,true);
 assert.throws(()=>assertTaskReady(waiting,change.data.tasks),/前一步已删除/);
 assert.deepEqual(newlyReadyTasks(data,change.data),[]);
 const restored=restoreDeleted(change.data,change.removed);validateData(restored);assert.equal(dependencyState(waiting,restored.tasks).missing,false);
 const detached={...waiting,afterTaskId:''};assert.equal(isTaskBlocked(detached,change.data.tasks),false);
});

test('validation rejects loops and recurring dependencies, while safe missing links and long chains survive',()=>{
 const data=fixture();data.tasks[0].afterTaskId='提交';assert.throws(()=>validateData(data),/循环/);
 data.tasks[0].afterTaskId='作文';assert.throws(()=>validateData(data),/自己/);
 data.tasks[0].afterTaskId=123;assert.throws(()=>validateData(data),/关联不正确/);
 data.tasks[0].afterTaskId='missing';assert.doesNotThrow(()=>validateData(data));
 data.tasks[1].repeatFrequency='daily';assert.throws(()=>validateData(data),/周期计划/);
 const long=Array.from({length:20000},(_,i)=>({id:String(i),afterTaskId:i?String(i-1):'',status:'next'}));assert.doesNotThrow(()=>validateDependencies(long));
 const first={version:1,records:[],tasks:[task('a',{afterTaskId:'b'})]},second={version:1,records:[],tasks:[task('b',{afterTaskId:'a'})]};
 assert.throws(()=>mergeData(first,second),/循环/);
});

test('waiting tasks stay out of today actionable counts and OS reminders until the prerequisite completes',()=>{
 const data=fixture();let groups=todayTasks(data.tasks,day,at);
 assert.deepEqual(groups.ordinary.map(t=>t.id),['作文']);assert.deepEqual(groups.waiting.map(t=>t.id),['检查','提交']);
 assert.deepEqual(todayStatLists(data,day).pending.map(t=>t.id),['作文']);
 const now=new Date(day+'T09:00:00');assert.deepEqual(planReminderQueue(data,now).map(t=>t.id),['作文']);
 data.tasks[0]=setTaskStatus(data.tasks[0],'done',at);
 assert.deepEqual(todayStatLists(data,day).pending.map(t=>t.id),['检查']);assert.deepEqual(planReminderQueue(data,now).map(t=>t.id),['检查']);
 data.tasks[0]=setTaskStatus(data.tasks[0],'next');assert.deepEqual(planReminderQueue(data,now).map(t=>t.id),['作文']);
 data.tasks[1].status='paused';assert.deepEqual(todayStatLists(data,day).paused.map(t=>t.id),['检查']);
});

test('a concurrent ancestor revert cannot merge a newly completed blocked descendant',()=>{
 const base=fixture();base.tasks[0]=setTaskStatus(base.tasks[0],'done',at);
 const local=structuredClone(base);local.tasks[1]=setTaskStatus(local.tasks[1],'done',at);
 const remote=structuredClone(base);remote.tasks[0]=setTaskStatus(remote.tasks[0],'next');
 const merged=mergeDataChanges(base,local,remote);validateData(merged);
 assert.throws(()=>assertReadyTransitions(remote,merged),/请先完成/);
 const history=structuredClone(local);history.tasks[0]=setTaskStatus(history.tasks[0],'next');assert.doesNotThrow(()=>assertReadyTransitions(local,history));
});
