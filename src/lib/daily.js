import {localDate} from './dates.js';

export function dailyTask(plan,day,at=new Date().toISOString()){
 const {repeatDaily,startDate,endDate,active,lastGeneratedDate,...task}=structuredClone(plan);
 return {...task,id:`daily:${plan.id}:${day}`,routineId:plan.id,routineDate:day,
  due:plan.dueTime?day:'',dueTime:plan.dueTime||'',status:'next',completedAt:'',
  createdAt:at,startedAt:at,recordId:''};
}

// A plan and each dated occurrence have separate identities. Never reset yesterday.
export function materializeDaily(data,day=localDate(),at=new Date().toISOString()){
 let next=null;
 for(const plan of data.routines||[]){
  if(!plan.active||day<plan.startDate||(plan.endDate&&day>plan.endDate)||day<=(plan.lastGeneratedDate||''))continue;
  next??=structuredClone(data);
  if(!next.tasks.some(t=>t.routineId===plan.id&&t.routineDate===day))next.tasks.push(dailyTask(plan,day,at));
  next.routines.find(p=>p.id===plan.id).lastGeneratedDate=day;
 }
 return next||data;
}

export function saveDailyPlan(data,item,day=localDate(),at=new Date().toISOString()){
 const next=structuredClone(data);next.routines??=[];
 const previous=next.routines.find(p=>p.id===item.id);
 const plan={...item,repeatDaily:true,status:'next',completedAt:'',recordId:'',active:previous?.active??true,lastGeneratedDate:previous?.lastGeneratedDate||''};
 next.routines=next.routines.filter(p=>p.id!==plan.id);next.routines.push(plan);
 // Only today's unfinished occurrence follows an edit. Completed history is immutable here.
 next.tasks=next.tasks.map(t=>t.routineId===plan.id&&t.routineDate===day&&['next','today'].includes(t.status)
  ?{...dailyTask(plan,day,at),id:t.id,createdAt:t.createdAt,startedAt:t.startedAt}:t);
 return materializeDaily(next,day,at);
}

export function todayTasks(tasks,day=localDate()){
 const daily=tasks.filter(t=>t.routineDate===day);
 const ordinary=tasks.filter(t=>!t.routineId&&(t.due===day||t.scheduledDate===day||(!t.due&&!t.scheduledDate&&t.status==='today')));
 const overdue=tasks.filter(t=>!t.routineId&&['next','today'].includes(t.status)&&t.due&&t.due<day&&!ordinary.includes(t));
 return {daily,ordinary,overdue};
}
