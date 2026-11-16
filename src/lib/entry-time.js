import {formatCaptureWhen} from './capture-display.js';

// Exact and loose times share one display slot. A loose time has no clock value.
export const timeLabel=(time,period)=>formatCaptureWhen({time:time||'',period:period||''},{includeDate:false});

const periods=['dawn','morning','noon','afternoon','evening','night'];
function group(time,period){
 if(time){const h=Number(time.slice(0,2));return h<6?0:h<12?1:h<14?2:h<18?3:h<21?4:5;}
 const index=periods.indexOf(period);return index<0?6:index;
}
export function compareDayTime(a,b){
 return group(a.time,a.timePeriod)-group(b.time,b.timePeriod)||(a.time||'').localeCompare(b.time||'');
}
// With two dates, the left-hand time describes the plan; the deadline belongs
// to its own label. An evening plan can have a different, precise deadline.
export function separateDeadline(task){
 if(!task.due||!task.scheduledDate||task.due===task.scheduledDate&&task.dueTime===task.scheduledTime&&!task.timePeriod)return '';
 return formatCaptureWhen({date:task.due,time:task.dueTime||''});
}
