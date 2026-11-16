import {tr} from './i18n.js';
import { localDate, parseDate } from './dates.js';
import {compareDayTime} from './entry-time.js';

export function deadlineValue(task) {
  const date=task.due||(task.routineId&&(task.routineEnd||task.routineDate));
  if (!date) return Infinity;
  return new Date(`${date}T${task.dueTime || '23:59'}:${task.dueTime?'00':'59.999'}`).getTime();
}

export function deadlineTone(task,now=new Date()){
 if(!['today','next'].includes(task.status))return 'neutral';
 const delta=deadlineValue(task)-now.getTime();
 // A clock-only routine has a period in which to finish, but no
 // explicit deadline to advertise when its planned start approaches.
 if(task.scheduleOnly&&task.scheduling==='times'&&!task.due&&delta>=0)return 'neutral';
 return delta<0?'overdue':delta<=86400000?'soon':'neutral';
}

// The list and timeline show when to do the work. A scheduled time alone
// must never start the deadline countdown.
export function taskWhen(task) {
  const date=task.routineDate||task.scheduledDate||task.due||'';
  const time=(task.scheduledDate&&task.scheduledDate===date?task.scheduledTime:task.due===date?task.dueTime:'')||'';
  return {date,time};
}
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const x=taskWhen(a),y=taskWhen(b);
    return (x.date||'9999').localeCompare(y.date||'9999')||compareDayTime({...x,timePeriod:a.timePeriod},{...y,timePeriod:b.timePeriod})||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
  });
}

export function belongsToDay(task,day){
  return task.scheduledDate===day||task.due===day||task.routineDate===day||
    Boolean(task.routineId&&!task.scheduledAt&&task.routineEnd===day)||
    (task.status==='today'&&!taskWhen(task).date);
}
export function taskListOrder(tasks,day=localDate(),order='asc'){
  const rank={high:0,normal:1,low:2};
  const todayTime=t=>({time:(t.scheduledDate===day&&t.scheduledTime)||(t.due===day&&t.dueTime)||(t.routineDate===day&&taskWhen(t).time)||'',timePeriod:t.timePeriod});
  const direction=order==='desc'?-1:1;
  return [...tasks].sort((a,b)=>{
    const at=belongsToDay(a,day),bt=belongsToDay(b,day);
    if(at!==bt)return at?-1:1;
    const x=taskWhen(a),y=taskWhen(b);
    const cmp=at?(rank[a.priority]??1)-(rank[b.priority]??1)||compareDayTime(todayTime(a),todayTime(b)):
      direction*((x.date||'9999').localeCompare(y.date||'9999')||compareDayTime({...x,timePeriod:a.timePeriod},{...y,timePeriod:b.timePeriod}));
    return cmp||(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id);
  });
}

export function countdown(task, now = new Date()) {
  if (task.status === 'done') {
    if(!task.completedAt||!task.due)return {label:tr('状态'),text:tr('已完成'),tone:'done'};
    const minutes=Math.floor(new Date(task.completedAt).getTime()/60000)-Math.floor(deadlineValue(task)/60000);
    return {label:minutes>0?tr('超时完成'):minutes<0?tr('提前完成'):tr('按时完成'),text:minutes?durationText(Math.abs(minutes)):tr('准时'),tone:minutes>0?'overdue':'done'};
  }
  if (task.status === 'paused') return { label: tr('状态'), text: tr('已搁置'), tone: 'paused' };
  if(task.scheduleOnly&&task.scheduling==='times'&&!task.due&&deadlineTone(task,now)==='neutral'){
    return {label:tr('计划时间'),text:task.scheduledTime||tr('未设置'),tone:'neutral'};
  }
  const date=task.due||(task.routineId&&(task.routineEnd||task.routineDate));
  if (!date) return { label: tr('截止时间'), text: tr('未设置'), tone: 'neutral' };
  if (!task.dueTime) {
    const days = Math.round((parseDate(date) - parseDate(localDate(now))) / 86400000);
    return { label: task.routineId?tr('计划周期'):tr('未设具体时分'), text: days === 0 ? tr('今天截止') : days > 0 ? tr`${days} 天后截止` : tr`已逾期 ${-days} 天`, tone: deadlineTone(task,now) };
  }
  const delta = deadlineValue(task) - now.getTime();
  if (Math.abs(delta) < 1000) return {label:tr('截止时间'),text:tr('现在到期'),tone:'soon'};
  const mins = Math.ceil(Math.abs(delta) / 60000);
  const text = durationText(mins);
  return { label: delta < 0 ? tr('已逾期') : tr('距离截止'), text, tone: deadlineTone(task,now) };
}

export function durationText(mins){
 const days=Math.floor(mins/1440),hours=Math.floor(mins%1440/60),minutes=mins%60;
 return days?tr`${days} 天${hours?tr` ${hours} 小时`:''}`:hours?tr`${hours} 小时${minutes?tr` ${minutes} 分`:''}`:tr`${minutes} 分钟`;
}

export function updateCountdowns(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  document.querySelectorAll('[data-urgency-task]').forEach(el=>{const task=byId.get(el.dataset.urgencyTask);if(task)el.dataset.urgency=deadlineTone(task);});
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const task = byId.get(el.dataset.countdown);
    if (!task) return;
    const state = countdown(task);
    el.dataset.tone = state.tone;
    el.querySelector('small').textContent = state.label;
    el.querySelector('strong').textContent = state.text;
  });
}
