import {localDate,addDays} from './dates.js';
import {repeatFrequency} from './daily.js';

// Count calendar days, not checkboxes. Late catch-up never rewrites that day.
// Only actual occurrences are evidence; pre-upgrade offline history is unknown.
export function missedPlanDays(tasks,today=localDate()){
 const days=new Map();
 for(const task of tasks){
  if(!task.routineId||repeatFrequency(task)!=='daily'||task.status==='paused')continue;
  const date=task.routineDate||task.routinePeriod;
  if(!date||date>=today)continue;
  const close=new Date(addDays(date,1)+'T00:00:00').getTime();
  if(task.status==='done'&&(!task.completedAt||Date.parse(task.completedAt)<close))continue;
  if(!days.has(date))days.set(date,[]);
  days.get(date).push(task);
 }
 return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,tasks])=>({date,tasks,pending:tasks.filter(t=>t.status!=='done').length}));
}
