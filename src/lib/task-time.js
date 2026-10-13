import {localDate} from './dates.js';
import {deadlineValue} from './deadlines.js';

export function localMinute(value){
 if(!value)return '';
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 return `${localDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export const displayMinute=value=>localMinute(value).replace('T',' ')||'未记录';
export function setTaskStatus(task,status,at=new Date().toISOString()){
 const result={...task,status};
 if(status==='done'&&task.status!=='done')result.completedAt=at;
 if(status!=='done')result.completedAt='';
 return result;
}
export function completionDelta(task){
 if(task.status!=='done'||!task.completedAt||!task.due)return null;
 const end=new Date(task.completedAt).getTime(),deadline=deadlineValue(task);
 if(!Number.isFinite(end)||!Number.isFinite(deadline))return null;
 return Math.floor(end/60000)-Math.floor(deadline/60000);
}
export function taskTimingStats(tasks,start,end){
 const completed=tasks.filter(t=>t.status==='done'&&t.completedAt&&localMinute(t.completedAt).slice(0,10)>=start&&localMinute(t.completedAt).slice(0,10)<=end);
 const deltas=completed.map(completionDelta).filter(n=>n!==null),total=deltas.length;
 const late=deltas.filter(n=>n>0).length,early=deltas.filter(n=>n<0).length;
 return {total,late,early,onTime:total-late-early,lateRate:total?Math.round(late/total*1000)/10:null,earlyRate:total?Math.round(early/total*1000)/10:null,missing:tasks.filter(t=>t.status==='done'&&!t.completedAt).length};
}
