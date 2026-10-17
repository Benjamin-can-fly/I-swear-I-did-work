import {localMinute} from './task-time.js';

export function todayCompletedCount(data,day){
 const tasks=new Map((data.tasks||[]).map(task=>[task.id,task]));
 const completed=new Set();
 for(const task of tasks.values())if(task.status==='done'&&localMinute(task.completedAt).slice(0,10)===day)completed.add('task:'+task.id);
 for(const record of data.records||[]){
  // A task's mirror is the same completed event, including after a date edit.
  if(record.sourceTaskId&&tasks.has(record.sourceTaskId))continue;
  if(record.date===day)completed.add(record.sourceTaskId?'task:'+record.sourceTaskId:'record:'+record.id);
 }
 return completed.size;
}
