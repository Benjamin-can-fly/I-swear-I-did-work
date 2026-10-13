import { localDate, parseDate } from './dates.js';

export function deadlineValue(task) {
  if (!task.due) return Infinity;
  return new Date(`${task.due}T${task.dueTime || '23:59'}:00`).getTime();
}

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const delta = deadlineValue(a) - deadlineValue(b);
    return (Number.isNaN(delta) ? 0 : delta) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

export function countdown(task, now = new Date()) {
  if (task.status === 'done') {
    if(!task.completedAt||!task.due)return {label:'状态',text:'已完成',tone:'done'};
    const minutes=Math.floor(new Date(task.completedAt).getTime()/60000)-Math.floor(deadlineValue(task)/60000);
    return {label:minutes>0?'超时完成':minutes<0?'提前完成':'按时完成',text:minutes?durationText(Math.abs(minutes)):'准时',tone:minutes>0?'overdue':'done'};
  }
  if (task.status === 'paused') return { label: '状态', text: '已搁置', tone: 'paused' };
  if (!task.due) return { label: '截止时间', text: '未设置', tone: 'neutral' };
  if (!task.dueTime) {
    const days = Math.round((parseDate(task.due) - parseDate(localDate(now))) / 86400000);
    return { label: '未设具体时分', text: days === 0 ? '今天截止' : days > 0 ? `${days} 天后截止` : `已逾期 ${-days} 天`, tone: days < 0 ? 'overdue' : days === 0 ? 'soon' : 'neutral' };
  }
  const delta = deadlineValue(task) - now.getTime();
  if (Math.abs(delta) < 1000) return {label:'截止时间',text:'现在到期',tone:'soon'};
  const mins = Math.ceil(Math.abs(delta) / 60000);
  const text = durationText(mins);
  return { label: delta < 0 ? '已逾期' : '距离截止', text, tone: delta < 0 ? 'overdue' : mins < 60 ? 'soon' : 'neutral' };
}

export function durationText(mins){
 const days=Math.floor(mins/1440),hours=Math.floor(mins%1440/60),minutes=mins%60;
 return days?`${days} 天${hours?` ${hours} 小时`:''}`:hours?`${hours} 小时${minutes?` ${minutes} 分`:''}`:`${minutes} 分钟`;
}

export function updateCountdowns(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const task = byId.get(el.dataset.countdown);
    if (!task) return;
    const state = countdown(task);
    el.dataset.tone = state.tone;
    el.querySelector('small').textContent = state.label;
    el.querySelector('strong').textContent = state.text;
  });
}
