import {localMinute} from './task-time.js';
import {taskContent} from './task-content.js';

// Called on the same data snapshot as the task mutation, so both save atomically.
export function syncTaskRecord(data,task){
 const linked=data.records.filter(r=>r.sourceTaskId===task.id);
 if(task.status!=='done'||task.autoSyncRecord===false){
  data.records=data.records.filter(r=>r.sourceTaskId!==task.id);
  return;
 }
 if(!task.completedAt)return;
 const minute=localMinute(task.completedAt);if(!minute)return;
 const existing=linked[0];
 const record={id:existing?.id||crypto.randomUUID(),title:task.title,details:taskContent(task),raw:taskContent(task),date:minute.slice(0,10),time:minute.slice(11),project:task.project||'',createdAt:task.completedAt,suggestions:[],durationMinutes:null,effort:'normal',important:false,attachments:structuredClone(task.attachments||[]),sourceTaskId:task.id,taskSyncOwned:true,startedAt:task.startedAt||'',completedAt:task.completedAt};
 // Task is the source of its mirrored content; work-only metadata stays local.
 if(existing)Object.assign(record,{durationMinutes:existing.durationMinutes??null,effort:existing.effort||'normal',important:existing.important||false});
 data.records=data.records.filter(r=>r.sourceTaskId!==task.id);data.records.push(record);
}
