import {addDays,localDate,rangeFor,validDate} from './dates.js';
import {planOccurrences,repeatFrequency,routineAllowedOn,routinePeriod} from './daily.js';
import {dependencyIndex,isTaskBlocked} from './task-dependencies.js';

const horizonDays=30,capacity=64,dayMs=86400000;
const midnight=day=>new Date(day+'T00:00:00').getTime();
export const hasScheduledReminders=host=>host?.workJournalPlatform==='windows'&&host.workJournalScheduledReminders===true&&typeof host.chrome?.webview?.postMessage==='function';
export const hasReminderTime=(day,time)=>validDate(day)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'');

// Produce a replacement queue without writing projected occurrences into the journal.
// Keep the two queues bounded independently: same-day catch-up must not displace future alarms.
export function planReminderQueue(data,now=new Date(),previouslyReminded=new Set()){
 const dependencies=dependencyIndex(data.tasks);
 const start=localDate(now),ms=now.getTime(),end=midnight(addDays(start,horizonDays));
 const plans=new Map((data.routines||[]).filter(p=>p.active&&p.remind&&p.scheduling==='times').map(p=>[p.id,p]));
 const actualIds=new Set(),future=[],due=[];
 const byTime=(a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id);
 function include(t,p){
  if(!t.remind||!t.scheduledAt||!['next','today'].includes(t.status)||t.routineDate<start||p&&(t.routineDate<p.startDate||p.endDate&&t.routineDate>p.endDate))return;
  let fire=Date.parse(t.visibleFrom||t.scheduledAt);
  if(!Number.isFinite(fire))return;
  // Weekday-only plans never alert on a weekend. A Monday slot released on
  // Sunday first becomes visible/eligible at local midnight on Monday.
  let fireDay=localDate(new Date(fire));
  while(!routineAllowedOn(t,fireDay)){fireDay=addDays(fireDay,1);fire=midnight(fireDay);}
  if(fireDay>t.routineDate||fire>=end||fire<ms-2*dayMs||fire<=ms&&previouslyReminded.has(t.id))return;
  const list=fire<=ms?due:future,sort=list===due?(a,b)=>byTime(b,a):byTime;
  const item={id:t.id,title:t.title,at:new Date(fire).toISOString(),scheduledAt:new Date(t.scheduledAt).toISOString(),time:t.scheduledTime||t.dueTime||new Date(t.scheduledAt).toTimeString().slice(0,5)};
  if(list.length===capacity&&sort(item,list[capacity-1])>=0)return;
  list.push(item);list.sort(sort);if(list.length>capacity)list.pop();
 }
 for(const t of data.tasks){
  actualIds.add(t.id);
  if(isTaskBlocked(t,dependencies))continue;
  if(t.routineId){const p=plans.get(t.routineId);if(p)include(t,p);continue;}
  if(t.remind!==true||!['next','today'].includes(t.status))continue;
  const deadline=hasReminderTime(t.due,t.dueTime),day=deadline?t.due:t.scheduledDate,time=deadline?t.dueTime:t.scheduledTime;
  if(!hasReminderTime(day,time))continue;
  const slot=new Date(day+'T'+time+':00'),lead=Math.min(1440,Math.max(0,Number(t.leadMinutes)||0));
  if(Number.isFinite(slot.getTime()))include({id:t.id,title:t.title,status:t.status,remind:true,routineDate:day,scheduledTime:time,scheduledAt:slot.toISOString(),visibleFrom:new Date(slot.getTime()-lead*60000).toISOString()});
 }
 for(const p of plans.values()){
  const frequency=repeatFrequency(p),unit=frequency==='weekly'?'week':frequency==='monthly'?'month':'day';
  let cursor=[start,p.startDate,p.effectiveFrom||''].sort().at(-1);
  // Use the same slot IDs, month-end clamping and local clock conversion as the
  // journal. Avoid cloning notes and attachments into each hypothetical task.
  const rule={id:p.id,title:p.title,startDate:p.startDate,effectiveFrom:p.effectiveFrom,endDate:p.endDate,repeatFrequency:frequency,weekdaysOnly:p.weekdaysOnly,scheduleOnly:p.scheduleOnly,scheduling:p.scheduling,slots:p.slots,leadMinutes:p.leadMinutes,remind:p.remind};
  for(;(!p.endDate||cursor<=p.endDate)&&midnight(cursor)-dayMs<end;cursor=addDays(rangeFor(cursor,unit)[1],1)){
   // No later period can beat the full queue, even with a full day's lead.
   if(future.length===capacity&&midnight(cursor)-dayMs>Date.parse(future[capacity-1].at))break;
   const [period]=routinePeriod(rule,cursor);
   if(period<=(p.lastGeneratedDate||'')||(p.generatedPeriods||[]).includes(period))continue;
   for(const t of planOccurrences(rule,cursor,now.toISOString()))if(!actualIds.has(t.id))include(t,p);
  }
 }
 return [...due,...future];
}

// Send immediately after a committed change, on day rollover, or when a slot fires
// (to refill the bounded queue). Other refreshes do no recurrence work or native I/O.
export function createReminderSync(post,onError){
 let source=null,nextCheck=0,lastClock=0,zone='',items=[],sent=null,acked=false,lastSend=0,failed=false,requestId=0;
 return {
  update(data,now=new Date(),previouslyReminded){
   const ms=now.getTime(),currentZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
   if(data!==source||ms>=nextCheck||ms<lastClock||zone!==currentZone){
    items=planReminderQueue(data,now,previouslyReminded);source=data;zone=currentZone;
    nextCheck=Math.min(midnight(addDays(localDate(now),1)),...items.map(i=>Date.parse(i.at)).filter(t=>t>ms));
   }
   lastClock=ms;const wire=JSON.stringify(items);
   if(wire===sent&&(acked||ms>=lastSend&&ms-lastSend<60000))return;
   sent=wire;lastSend=ms;acked=false;
   try{post({type:'sync-reminders',requestId:++requestId,items});}catch{this.result(false,requestId);}
  },
  result(success,id){if(id!==requestId)return;acked=success;if(!success&&!failed)onError();failed=!success;}
 };
}
