import {locale} from '../lib/i18n.js';
import {tr} from '../lib/i18n.js';
import {attachmentList} from '../lib/attachments.js';
import {esc,icon} from '../lib/ui.js';
import {displayMinute} from '../lib/task-time.js';
import {parseDate} from '../lib/dates.js';
import {sortTasks,countdown} from '../lib/deadlines.js';

export const groups={today:tr('今天要做'),next:tr('待处理'),paused:tr('已搁置'),done:tr('已完成')};
export const taskCheck='<svg class="completion-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>';

function taskRow(task) {
  const remaining = countdown(task);
  const scheduled=task.routineDate||task.due||task.scheduledDate;
  const day = scheduled ? parseDate(scheduled).toLocaleDateString(locale(),{month:'short',day:'numeric'}) : tr('未安排');
  return tr`<article class="task-row ${task.status==='done'?'completed':''}" data-task="${esc(task.id)}">
    <div class="task-date"><time datetime="${esc(scheduled+(task.dueTime?'T'+task.dueTime:''))}"><span>${esc(day)}</span><strong>${esc(task.dueTime|| (scheduled?tr('不限时'):'—'))}</strong>${scheduled?`<small>${esc(scheduled.slice(0,4))}</small>`:''}</time><i class="timeline-node"></i></div>
    <div class="task-main"><button class="task-check" data-toggle-task="${esc(task.id)}" aria-pressed="${task.status==='done'}" aria-label="${task.status==='done'?tr('重新打开'):tr('完成')} ${esc(task.title)}">${taskCheck}</button><div class="task-content"><button class="task-writing" ${task.status==='done'?'disabled':`data-complete-task="${esc(task.id)}"`} aria-label="${task.status==='done'?tr('已完成'):tr('完成')} ${esc(task.title)}"><span class="task-title">${esc(task.title)}</span>${task.notes?`<span class="task-notes">${esc(task.notes)}</span>`:''}</button>${attachmentList(task.attachments)}<div class="task-meta">${task.project?`<span class="tag">${esc(task.project)}</span>`:''}${task.priority==='high'?tr('<span class="priority">优先</span>'):''}${task.recordId?tr`<button class="text-button" data-link-record="${esc(task.recordId)}">相关记录 ↗</button>`:''}</div></div></div>
    <div class="task-timing"><dl><div><dt>开始</dt><dd>${esc(displayMinute(task.startedAt))}</dd></div><div><dt>完成</dt><dd>${task.status==='done'?esc(displayMinute(task.completedAt)):tr('未完成')}</dd></div></dl><div class="task-countdown" data-countdown="${esc(task.id)}" data-tone="${remaining.tone}"><small>${remaining.label}</small><strong>${remaining.text}</strong></div></div><button class="icon-button task-more" data-entry-menu="task" data-entry-id="${esc(task.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="待办操作 ${esc(task.title)}">⋯</button>
  </article>`;
}

export function renderTasks(tasks,filter='pending',order='asc') {
  const list=sortTasks(tasks.filter(t=>filter==='pending'?['today','next'].includes(t.status):t.status===filter));
  if(order==='desc')list.reverse();
  if(!list.length)return `<div class="empty-state task-empty"><span class="empty-icon">${icon('check')}</span><h3>${filter==='pending'?tr('暂无待办'):filter==='done'?tr('暂无已完成事项'):tr('暂无搁置事项')}</h3><p>${filter==='pending'?tr('新建事项并设置截止日期和时间。'):tr('此分类下没有事项。')}</p></div>`;
  const dated=list.filter(t=>t.due||t.routineDate||t.scheduledDate),undated=list.filter(t=>!t.due&&!t.routineDate&&!t.scheduledDate);
  return `${dated.length?`<div class="task-timeline">${dated.map(taskRow).join('')}</div>`:''}${undated.length?tr`<h3 class="undated-heading">未设截止时间 <span>${undated.length}</span></h3><div class="task-timeline undated">${undated.map(taskRow).join('')}</div>`:''}`;
}
