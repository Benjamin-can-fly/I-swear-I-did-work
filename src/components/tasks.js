import {timeLabel} from '../lib/entry-time.js';
import {locale} from '../lib/i18n.js';
import {tr} from '../lib/i18n.js';
import {attachmentList} from '../lib/attachments.js';
import {esc,icon} from '../lib/ui.js';
import {displayMinute} from '../lib/task-time.js';
import {parseDate,localDate} from '../lib/dates.js';
import {taskListOrder,belongsToDay,countdown,deadlineTone,taskWhen} from '../lib/deadlines.js';
import {dependencyIndex,dependencyState} from '../lib/task-dependencies.js';

export const groups={today:tr('今天要做'),next:tr('待处理'),paused:tr('已搁置'),done:tr('已完成')};
export const taskCheck='<svg class="completion-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>';

function taskRow(task,selection=null,dependencies=[]) {
  const state=dependencyState(task,dependencies),blocked=state.blocked;
  const relation=task.afterTaskId?`<span class="task-dependency">${state.missing?tr('前一步已删除，修改关联'):tr('前一步：')+' '+esc(state.predecessor.title)}</span>`:'';
  const remaining = blocked?{tone:'neutral',label:tr('状态'),text:tr('等待前一步')}:countdown(task);
  const {date:scheduled,time}=taskWhen(task);
  const day = scheduled ? parseDate(scheduled).toLocaleDateString(locale(),{month:'short',day:'numeric'}) : tr('未安排');
  return tr`<article class="task-row ${task.status==='done'?'completed':''} ${blocked?'is-waiting':''}" data-task="${esc(task.id)}" ${blocked?'data-dependency-blocked="true"':`data-urgency-task="${esc(task.id)}"`} data-urgency="${blocked?'neutral':deadlineTone(task)}" ${selection?'data-batch-row':''}>
    <div class="task-date"><time datetime="${esc(scheduled+(time?'T'+time:''))}"><span>${esc(day)}</span><strong>${esc(timeLabel(time,task.timePeriod)||(scheduled?tr('不限时'):'—'))}</strong>${scheduled?`<small>${esc(scheduled.slice(0,4))}</small>`:''}</time><i class="timeline-node"></i></div>
    <div class="task-main">${selection?`<label class="batch-check"><input type="checkbox" data-batch-item="tasks" value="${esc(task.id)}" ${selection.has(task.id)?'checked':''} aria-label="${tr('选择')} ${esc(task.title)}"></label>`:''}<button class="task-check" data-toggle-task="${esc(task.id)}" ${blocked?'disabled':''} aria-pressed="${task.status==='done'}" aria-label="${blocked?tr('等待前一步'):task.status==='done'?tr('重新打开'):tr('完成')} ${esc(task.title)}">${taskCheck}</button><div class="task-content"><button class="task-writing" ${task.status==='done'||blocked?'disabled':`data-complete-task="${esc(task.id)}"`} aria-label="${blocked?tr('等待前一步'):task.status==='done'?tr('已完成'):tr('完成')} ${esc(task.title)}"><span class="task-title">${esc(task.title)}</span>${task.notes?`<span class="task-notes">${esc(task.notes)}</span>`:''}</button>${relation}${attachmentList(task.attachments)}<div class="task-meta">${task.project?`<span class="tag">${esc(task.project)}</span>`:''}${task.priority==='high'?tr('<span class="priority">优先</span>'):''}${task.recordId?tr`<button class="text-button" data-link-record="${esc(task.recordId)}">相关记录 ↗</button>`:''}</div></div></div>
    <div class="task-timing"><dl><div><dt>开始</dt><dd>${esc(displayMinute(task.startedAt))}</dd></div><div><dt>完成</dt><dd>${task.status==='done'?esc(displayMinute(task.completedAt)):tr('未完成')}</dd></div></dl><div class="task-countdown" ${blocked?'':`data-countdown="${esc(task.id)}"`} data-tone="${remaining.tone}"><small>${remaining.label}</small><strong>${remaining.text}</strong></div></div><button class="icon-button task-more" data-entry-menu="task" data-entry-id="${esc(task.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="待办操作 ${esc(task.title)}">⋯</button>
  </article>`;
}

export function renderTasks(tasks,filter='pending',order='asc',selection=null,allTasks=tasks) {
  const dependencies=dependencyIndex(allTasks);
  const day=localDate(),list=taskListOrder(tasks.filter(t=>filter==='pending'?['today','next'].includes(t.status):t.status===filter),day,order);
  if(!list.length)return `<div class="empty-state task-empty"><span class="empty-icon">${icon('check')}</span><h3>${filter==='pending'?tr('暂无待办'):filter==='done'?tr('暂无已完成事项'):tr('暂无搁置事项')}</h3><p>${filter==='pending'?tr('在上方输入内容并保存。'):tr('此分类下没有事项。')}</p></div>`;
  const dated=[],undated=[];for(const t of list)(taskWhen(t).date||belongsToDay(t,day)?dated:undated).push(t);
  return `${dated.length?`<div class="task-timeline">${dated.map(t=>taskRow(t,selection,dependencies)).join('')}</div>`:''}${undated.length?tr`<h3 class="undated-heading">未设截止时间 <span>${undated.length}</span></h3><div class="task-timeline undated">${undated.map(t=>taskRow(t,selection,dependencies)).join('')}</div>`:''}`;
}
