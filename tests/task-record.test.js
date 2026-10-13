import test from 'node:test';
import assert from 'node:assert/strict';
import {syncTaskRecord} from '../src/lib/task-record.js';
import {setTaskStatus} from '../src/lib/task-time.js';
import {timelineItems} from '../src/components/unified-timeline.js';
import {validateData} from '../src/lib/model.js';
const task=()=>({id:'test-task',title:'提交材料',content:'提交材料\n核对名单',notes:'核对名单',project:'社团',due:'2026-10-14',dueTime:'12:00',status:'next',priority:'normal',recordId:'',createdAt:new Date('2026-10-13T09:00:00').toISOString(),startedAt:new Date('2026-10-13T09:00:00').toISOString(),completedAt:'',attachments:[]});
test('完成待办生成一条包含原文、附件、起止时间的记录；重试不重复',()=>{
 const t=setTaskStatus(task(),'done',new Date('2026-10-13T10:15:00').toISOString()),data={version:1,records:[],tasks:[t]};syncTaskRecord(data,t);validateData(data);
 assert.equal(data.records.length,1);const r=data.records[0];assert.equal(r.date,'2026-10-13');assert.equal(r.time,'10:15');assert.equal(r.details,t.content);assert.equal(r.startedAt,t.startedAt);assert.equal(r.completedAt,t.completedAt);assert.equal(r.sourceTaskId,t.id);assert.equal(r.durationMinutes,null);
 syncTaskRecord(data,t);assert.equal(data.records.length,1);assert.equal(data.records[0].id,r.id);assert.equal(timelineItems(data.records,data.tasks).length,1);
 const pending=setTaskStatus(t,'next');data.tasks=[pending];syncTaskRecord(data,pending);assert.equal(data.records.length,0);const again=setTaskStatus(pending,'done',new Date('2026-10-13T11:00:00').toISOString());data.tasks=[again];syncTaskRecord(data,again);assert.equal(data.records.length,1);assert.equal(data.records[0].time,'11:00');
});
test('撤回完成删除对应记录，包括手动修改后的记录；没有历史完成时间时不补造',()=>{
 const t=setTaskStatus(task(),'done',new Date('2026-10-13T10:00:00').toISOString()),data={version:1,records:[],tasks:[t]};syncTaskRecord(data,t);data.records[0].taskSyncOwned=false;data.records[0].details='人工补充结果';syncTaskRecord(data,{...t,notes:'任务后来修改'});assert.equal(data.records[0].details,t.content);syncTaskRecord(data,setTaskStatus(t,'next'));assert.equal(data.records.length,0);
 syncTaskRecord(data,{...t,completedAt:''});assert.equal(data.records.length,0);
});
test('统一时间线同时包括过去已办、未来待办、逾期待办以及无日期条目',()=>{
 const t=task(),r={id:'r',date:'2026-10-13',time:'08:00',title:'已完成工作',details:'过程'};
 const entries=timelineItems([r],[t,{...t,id:'overdue',due:'2026-10-12'},{...t,id:'unknown',status:'done',completedAt:''},{...t,id:'undated',due:''}]);assert.equal(entries.length,5);assert.equal(entries.find(e=>e.id==='overdue').status,'next');assert.equal(entries.find(e=>e.id==='unknown').date,'');assert.equal(entries.find(e=>e.id==='r').status,'done');assert.equal(entries.find(e=>e.id===t.id).date,'2026-10-14');
});

test('同步开关关闭不创建，开启创建，关闭撤回，任务内容更新保留记录耗时',()=>{
 const t={...setTaskStatus(task(),'done'),autoSyncRecord:false},data={version:1,records:[],tasks:[t]};syncTaskRecord(data,t);assert.equal(data.records.length,0);t.autoSyncRecord=true;syncTaskRecord(data,t);assert.equal(data.records.length,1);data.records[0].durationMinutes=30;t.content='更新后的完整内容';syncTaskRecord(data,t);assert.equal(data.records[0].details,t.content);assert.equal(data.records[0].durationMinutes,30);t.autoSyncRecord=false;syncTaskRecord(data,t);assert.equal(data.records.length,0);
});
