import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDataChanges,commitDataChanges,DataConflict} from '../src/lib/data-sync.js';
const entry=(id,fields={})=>({id,title:id,status:'next',...fields});
const fixture=()=>({version:1,records:[],tasks:[entry('one'),entry('two')],routines:[]});
test('保存旧窗口的勾选时保留另一窗口新加和修改的条目',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
 local.tasks[0].status='done';remote.tasks.push(entry('new'));remote.tasks[1].title='updated';
 const merged=mergeDataChanges(base,local,remote);
 assert.equal(merged.tasks.find(t=>t.id==='one').status,'done');assert.equal(merged.tasks.find(t=>t.id==='two').title,'updated');assert.ok(merged.tasks.find(t=>t.id==='new'));
 assert.equal(base.tasks[0].status,'next');
});
test('同一条目的不同字段可以合并，相同字段冲突拒绝覆盖',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
 local.tasks[0].status='done';remote.tasks[0].title='remote';
 assert.deepEqual(mergeDataChanges(base,local,remote).tasks[0],entry('one',{status:'done',title:'remote'}));
 local.tasks[0].title='local';assert.throws(()=>mergeDataChanges(base,local,remote),DataConflict);
});
test('远端删除不复活，本地删除遇到远端修改保留两方并报告冲突',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);remote.tasks.pop();
 assert.equal(mergeDataChanges(base,local,remote).tasks.length,1);
 local.tasks[1].status='done';assert.throws(()=>mergeDataChanges(base,local,remote),DataConflict);
 const removed=fixture();removed.tasks.shift();const changed=fixture();changed.tasks[0].title='changed';
 assert.throws(()=>mergeDataChanges(base,removed,changed),DataConflict);
});
test('同时生成重复计划任务时采用已保存的完成状态，保留不同的计划生成周期',()=>{
 const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
 local.tasks.push(entry('routine',{routineId:'daily',routineDate:'2026-10-21',occurrenceKey:'0',createdAt:'local'}));
 remote.tasks.push(entry('routine',{routineId:'daily',routineDate:'2026-10-21',occurrenceKey:'0',createdAt:'remote',status:'done'}));
 const task=mergeDataChanges(base,local,remote).tasks.find(t=>t.id==='routine');assert.equal(task.status,'done');assert.equal(task.createdAt,'remote');
});
test('409 自动取最新数据合并并重试，连续冲突有上限',async()=>{
 const base=fixture(),next=structuredClone(base),remote=structuredClone(base);next.tasks[0].status='done';remote.tasks.push(entry('new'));
 let calls=0;const result=await commitDataChanges({base,next,revision:0,validate:()=>{},read:async()=>({data:remote,revision:1}),write:async(data,revision)=>{if(++calls===1)throw Object.assign(Error('conflict'),{status:409});assert.equal(revision,1);assert.equal(data.tasks.length,3);return {revision:2};}});
 assert.equal(calls,2);assert.equal(result.revision,2);assert.equal(result.data.tasks[0].status,'done');
 calls=0;await assert.rejects(commitDataChanges({base,next,revision:0,validate:()=>{},read:async()=>({data:remote,revision:1}),write:async()=>{calls++;throw Object.assign(Error('conflict'),{status:409});}}),/草稿已保留/);assert.equal(calls,4);
});
test('不能合并时返回最新快照供界面同步，原输入不变',async()=>{
 const base=fixture(),next=structuredClone(base),remote=structuredClone(base);next.tasks[0].title='local';remote.tasks[0].title='remote';
 await assert.rejects(commitDataChanges({base,next,revision:0,validate:()=>{},read:async()=>({data:remote,revision:1}),write:async()=>{throw Object.assign(Error('conflict'),{status:409});}}),e=>e instanceof DataConflict&&e.latest.data.tasks[0].title==='remote');
 assert.equal(next.tasks[0].title,'local');
});
