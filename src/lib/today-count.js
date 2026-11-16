import {localMinute} from './task-time.js';
import {todayTasks} from './daily.js';
import {dependencyIndex,isTaskBlocked} from './task-dependencies.js';

export function todayCompletedEntries(data,day){
 const tasks=new Map((data.tasks||[]).map(task=>[task.id,task]));
 const completed={tasks:[],records:[]},seen=new Set();
 for(const task of tasks.values())if(task.status==='done'&&localMinute(task.completedAt).slice(0,10)===day)completed.tasks.push(task);
 for(const record of data.records||[]){
  // A task's mirror is the same completed event, including after a date edit.
  if(record.sourceTaskId&&tasks.has(record.sourceTaskId))continue;
  const id=record.sourceTaskId?'task:'+record.sourceTaskId:'record:'+record.id;
  if(record.date===day&&!seen.has(id)){seen.add(id);completed.records.push(record);}
 }
 return completed;
}
export function todayCompletedCount(data,day){
 const {tasks,records}=todayCompletedEntries(data,day);return tasks.length+records.length;
}
export function todayStatLists(data,day,groups=todayTasks(data.tasks||[],day)){
 const all=[...groups.ordinary,...groups.daily],index=dependencyIndex(data.tasks);
 return {done:todayCompletedEntries(data,day),pending:all.filter(t=>['next','today'].includes(t.status)&&!isTaskBlocked(t,index)),paused:all.filter(t=>t.status==='paused')};
}
