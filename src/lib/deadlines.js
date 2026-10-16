import {tr} from './i18n.js';
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
    if(!task.completedAt||!task.due)return {label:tr('状态'),text:tr('已完成'),tone:'done'};
    const minutes=Math.floor(new Date(task.completedAt).getTime()/60000)-Math.floor(deadlineValue(task)/60000);
    return {label:minutes>0?tr('超时完成'):minutes<0?tr('提前完成'):tr('按时完成'),text:minutes?durationText(Math.abs(minutes)):tr('准时'),tone:minutes>0?'overdue':'done'};
  }
  if (task.status === 'paused') return { label: tr('状态'), text: tr('已搁置'), tone: 'paused' };
  if (!task.due) return { label: tr('截止时间'), text: tr('未设置'), tone: 'neutral' };
  if (!task.dueTime) {
    const days = Math.round((parseDate(task.due) - parseDate(localDate(now))) / 86400000);
    return { label: tr('未设具体时分'), text: days === 0 ? tr('今天截止') : days > 0 ? tr`${days} 天后截止` : tr`已逾期 ${-days} 天`, tone: days < 0 ? 'overdue' : days === 0 ? 'soon' : 'neutral' };
  }
  const delta = deadlineValue(task) - now.getTime();
  if (Math.abs(delta) < 1000) return {label:tr('截止时间'),text:tr('现在到期'),tone:'soon'};
  const mins = Math.ceil(Math.abs(delta) / 60000);
  const text = durationText(mins);
  return { label: delta < 0 ? tr('已逾期') : tr('距离截止'), text, tone: delta < 0 ? 'overdue' : mins < 60 ? 'soon' : 'neutral' };
}

export function durationText(mins){
 const days=Math.floor(mins/1440),hours=Math.floor(mins%1440/60),minutes=mins%60;
 return days?tr`${days} 天${hours?tr` ${hours} 小时`:''}`:hours?tr`${hours} 小时${minutes?tr` ${minutes} 分`:''}`:tr`${minutes} 分钟`;
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
