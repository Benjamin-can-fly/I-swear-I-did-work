import {localDate,rangeFor,addDays,parseDate} from './dates.js';
import {dependencyIndex,isTaskBlocked} from './task-dependencies.js';

export const repeatFrequency=plan=>plan.repeatFrequency||(plan.repeatDaily?'daily':'none');
export function routinePeriod(plan,day=localDate()){
 const f=repeatFrequency(plan),[start,calendarEnd]=rangeFor(day,f==='weekly'?'week':f==='monthly'?'month':'day');
 const end=plan.weekdaysOnly&&f==='weekly'?addDays(start,4):calendarEnd;
 const lower=plan.effectiveFrom||plan.startDate;
 return [start<lower?lower:start,plan.endDate&&plan.endDate<end?plan.endDate:end];
}
export const routineAllowedOn=(task,day=localDate())=>!task.weekdaysOnly||![0,6].includes(parseDate(day).getDay());
export const routineActive=(task,day=localDate())=>Boolean(task.routineId&&routineAllowedOn(task,day)&&(task.routinePeriod||task.routineDate)<=day&&(task.routineEnd||task.routineDate)>=day);
export const isReleased=(task,at=new Date().toISOString())=>!task.visibleFrom||Date.parse(task.visibleFrom)<=Date.parse(at);
export function planOccurrences(plan,day,at=new Date().toISOString()){
 const {repeatDaily,startDate,endDate,active,lastGeneratedDate,generatedPeriods,slots,effectiveFrom,historyTrackedThrough,...base}=structuredClone(plan);
 const f=repeatFrequency(plan),[start,end]=routinePeriod(plan,day);
 if(start>end)return [];
 if(f==='weekly'&&plan.weekdaysOnly&&day>end)return [];
 if(f==='daily'&&plan.weekdaysOnly&&[0,6].includes(parseDate(day).getDay()))return [];
 const timed=plan.scheduling==='times';
 const entries=timed?(slots||[]).map(slot=>{
  let date=start;
  if(f==='weekly')date=addDays(rangeFor(day,'week')[0],Number(slot.day));
  if(f==='monthly'){const last=Number(rangeFor(day,'month')[1].slice(8));date=day.slice(0,8)+String(slot.day==='last'?last:Math.min(Number(slot.day),last)).padStart(2,'0');}
  return {key:slot.id,date,time:slot.time};
 }).filter(e=>e.date>=start&&e.date<=end):Array.from({length:plan.targetCount||1},(_,i)=>({key:String(i),date:start,time:plan.dueTime||''}));
 const unique=timed?entries.filter((entry,i)=>entries.findIndex(other=>other.date===entry.date&&other.time===entry.time)===i):entries;
 return unique.map((entry,index)=>{
  const scheduledAt=timed?new Date(entry.date+'T'+entry.time+':00').toISOString():'';
  const legacy=f==='daily'&&!timed&&(plan.targetCount||1)===1;
  return {...base,id:legacy?`daily:${plan.id}:${start}`:`plan:${plan.id}:${start}:${entry.key}`,routineId:plan.id,routinePeriod:start,routineDate:entry.date,routineEnd:end,repeatFrequency:f,occurrenceKey:entry.key,occurrenceIndex:index+1,
   ...(timed&&plan.scheduleOnly?{scheduledDate:entry.date,scheduledTime:entry.time}:{}),
   due:timed?(plan.scheduleOnly?'':entry.date):entry.time?end:'',dueTime:timed&&plan.scheduleOnly?'':entry.time,scheduledAt,visibleFrom:scheduledAt?new Date(Date.parse(scheduledAt)-(plan.leadMinutes||0)*60000).toISOString():'',
   status:'next',completedAt:'',createdAt:at,startedAt:at,recordId:''};
 });
}
export const dailyTask=(plan,day,at)=>planOccurrences(plan,day,at)[0];
// Current occurrences are immutable history. Deleted occurrences stay deleted.
export function materializeDaily(data,day=localDate(),at=new Date().toISOString()){
 let next=null;
 for(const plan of data.routines||[]){
  // Start gap tracking on upgrade, without inventing older offline history.
  if(!plan.active)continue;
  const trackedDay=plan.endDate&&plan.endDate<day?plan.endDate:day;
  if(repeatFrequency(plan)==='daily'&&plan.historyTrackedThrough!==trackedDay){next??=structuredClone(data);next.routines.find(p=>p.id===plan.id).historyTrackedThrough=trackedDay;}
  const [,end]=routinePeriod(plan,day),days=[day];
  if(repeatFrequency(plan)==='daily'&&plan.historyTrackedThrough&&plan.historyTrackedThrough<day){
   for(let d=addDays(plan.historyTrackedThrough,1);d<day;d=addDays(d,1))days.push(d);
   days.sort();
  }
  if(plan.scheduling==='times')days.push(addDays(end,1));
  for(const date of days){
   if(date<(plan.effectiveFrom||plan.startDate)||(plan.endDate&&date>plan.endDate))continue;
   const [start]=routinePeriod(plan,date);
   if((plan.generatedPeriods||[]).includes(start)||start<=(plan.lastGeneratedDate||''))continue;
   const entries=planOccurrences(plan,date,at);
   if(date>day&&!entries.some(t=>isReleased(t,at)))continue;
   next??=structuredClone(data);
   for(const task of entries)if(!next.tasks.some(t=>t.id===task.id))next.tasks.push(task);
   const updated=next.routines.find(p=>p.id===plan.id);
   updated.lastGeneratedDate=start;
   updated.generatedPeriods=[...new Set([...(updated.generatedPeriods||[]),start])].sort().slice(-3);
  }
 }
 return next||data;
}
export function saveDailyPlan(data,item,day=localDate(),at=new Date().toISOString(),{applyCurrent=true}={}){
 const next=structuredClone(materializeDaily(data,day,at));next.routines??=[];
 const previous=next.routines.find(p=>p.id===item.id),f=repeatFrequency(item);
 const plan={...item,repeatDaily:f==='daily',repeatFrequency:f,status:'next',completedAt:'',recordId:'',active:previous?.active??true,lastGeneratedDate:previous?.lastGeneratedDate||'',generatedPeriods:previous?.generatedPeriods||[],historyTrackedThrough:day};
 if(previous&&repeatFrequency(previous)!==f){plan.effectiveFrom=addDays(routinePeriod(previous,day)[1],1);plan.lastGeneratedDate='';plan.generatedPeriods=[];}
 next.routines=next.routines.filter(p=>p.id!==plan.id);next.routines.push(plan);
 if(previous&&repeatFrequency(previous)===f){
  const periodDays=new Set(next.tasks.filter(t=>t.routineId===plan.id&&(t.routineEnd||t.routineDate)>=day).map(t=>t.routinePeriod||t.routineDate));
  for(const period of periodDays){
   const existing=next.tasks.filter(t=>t.routineId===plan.id&&(t.routinePeriod||t.routineDate)===period);
   const future=t=>['next','today'].includes(t.status)&&(applyCurrent||period>day||(t.scheduledAt&&Date.parse(t.scheduledAt)>Date.parse(at)));
   const candidates=planOccurrences(plan,period,at),previousKeys=new Set(planOccurrences(previous,period,at).map(t=>t.occurrenceKey));
   // Keep completed/skipped/started occurrences, including their original dates and content.
   const retained=existing.filter(t=>!future(t));
   next.tasks=next.tasks.filter(t=>!existing.includes(t)||retained.includes(t));
   for(const candidate of candidates){
    const old=existing.find(t=>(t.occurrenceKey||'0')===candidate.occurrenceKey);
    if(old&&!future(old))continue;
    if(!old&&previousKeys.has(candidate.occurrenceKey))continue;
    if(!old&&!(applyCurrent||period>day||(candidate.scheduledAt&&Date.parse(candidate.scheduledAt)>Date.parse(at))))continue;
    next.tasks.push(old?{...candidate,id:old.id,createdAt:old.createdAt,startedAt:old.startedAt}:candidate);
   }
  }
 }
 return materializeDaily(next,day,at);
}
export function todayTasks(tasks,day=localDate(),at=new Date().toISOString()){
 const index=dependencyIndex(tasks),ready=t=>!isTaskBlocked(t,index);
 const current=tasks.filter(t=>t.routineId&&routineAllowedOn(t,day)&&(t.scheduledAt?(t.routineDate===day||t.routineDate>day&&isReleased(t,at)):routineActive(t,day)));
 // A deadline can be worked on before it is due. A requested lead time still
 // controls early display, and notification delivery keeps its own release check.
 const visible=t=>(t.scheduleOnly===false&&t.dueTime&&!t.leadMinutes&&t.routineDate===day)||isReleased(t,at);
 const daily=current.filter(visible),upcoming=current.filter(t=>!visible(t));
 const ordinary=tasks.filter(t=>!t.routineId&&(ready(t)||t.status==='paused')&&(t.due===day||t.scheduledDate===day||(!t.due&&!t.scheduledDate&&t.status==='today')));
 const overdue=tasks.filter(t=>ready(t)&&['next','today'].includes(t.status)&&(!t.routineId||routineAllowedOn(t,day))&&!ordinary.includes(t)&&!daily.includes(t)&&((t.routineId&&(t.scheduledAt?t.routineDate:(t.routineEnd||t.routineDate))<day)||(!t.routineId&&t.due&&t.due<day)));
 const waiting=tasks.filter(t=>!ready(t)&&t.status!=='paused'&&(!t.scheduledDate&&!t.due||t.scheduledDate&&t.scheduledDate<=day||t.due&&t.due<=day));
 return {daily,ordinary,overdue,upcoming,waiting};
}
