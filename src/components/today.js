import {tr} from '../lib/i18n.js';
import {esc,icon} from '../lib/ui.js';
import {todayTasks} from '../lib/daily.js';
import {localDate} from '../lib/dates.js';
import {taskCheck} from './tasks.js';
import {attachmentList} from '../lib/attachments.js';

function row(t){
 const done=t.status==='done',paused=t.status==='paused';
 return tr`<article class="today-task ${done?'completed':''} ${paused?'is-paused':''}" data-today-task="${esc(t.id)}">
 <button class="task-check" data-toggle-task="${esc(t.id)}" aria-pressed="${done}" aria-label="${done?tr('撤回完成'):tr('完成')} ${esc(t.title)}">${taskCheck}</button>
 <div class="today-task-body"><button class="today-task-title" data-toggle-task="${esc(t.id)}">${esc(t.title)}</button>${t.notes?`<p>${esc(t.notes)}</p>`:''}${attachmentList(t.attachments)}
 <small>${paused?(t.routineId?tr('今天已跳过'):tr('已搁置')):done?tr('已完成'):t.dueTime?esc(t.dueTime):tr('不限时间')}${t.project?' · '+esc(t.project):''}</small></div>
 <button class="icon-button" data-entry-menu="task" data-entry-id="${esc(t.id)}" aria-label="待办操作 ${esc(t.title)}" aria-haspopup="menu">⋯</button></article>`;
}
export function renderToday(data,day=localDate()){
 const {ordinary,daily,overdue}=todayTasks(data.tasks,day),all=[...ordinary,...daily],done=all.filter(t=>t.status==='done').length;
 const rows=items=>[...items].sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.dueTime||'99').localeCompare(b.dueTime||'99')).map(row).join('');
 return tr`<div class="today-overview"><span>${all.length?tr`今天 ${all.length} 项，已完成 ${done} 项`:tr('今天还没有安排')}</span><button class="secondary today-add" data-new-today>${icon('pen')}新增待办</button></div>
 <div class="today-grid"><section class="today-list"><header><h2>今日待办</h2><span>${ordinary.filter(t=>t.status==='done').length} / ${ordinary.length}</span></header>
 ${ordinary.length?rows(ordinary):tr('<div class="today-empty">今日暂无待办<button class="text-button" data-new-today>安排一件事 ↗</button></div>')}
 ${overdue.length?tr`<details class="today-overdue"><summary>之前未完成 <span>${overdue.length}</span></summary>${rows(overdue)}</details>`:''}</section>
 <aside class="daily-card"><header><div><span class="daily-eyebrow">DAILY</span><h2>每日计划</h2></div><span>${daily.filter(t=>t.status==='done').length} / ${daily.length}</span></header>
 ${daily.length?rows(daily):tr('<p class="today-empty">设置一次，每天出现在这里。</p>')}
 <button class="text-button daily-manage" data-manage-daily>设置每日计划 ↗</button></aside></div>`;
}
export function renderDailyPlans(plans=[],day=localDate()){
 return tr`<details class="daily-plans"><summary>每日计划 <span>${plans.length}</span></summary><div class="daily-plans-body"><button class="text-button" data-new-daily>新增每日计划 ↗</button>${plans.map(p=>tr`<div class="daily-plan-row"><div><strong>${esc(p.title)}</strong><small>${!p.active?tr('已暂停'):p.endDate&&p.endDate<day?tr('已结束'):p.startDate>day?tr('尚未开始'):tr('每天')} · ${esc(p.startDate)} 起${p.endDate?tr('，至 ')+esc(p.endDate):''}${p.dueTime?' · '+esc(p.dueTime):''}</small></div><button class="text-button" data-edit-daily="${esc(p.id)}">修改</button><button class="text-button" data-toggle-daily="${esc(p.id)}">${p.active?tr('暂停'):tr('恢复')}</button><button class="text-button" data-delete-daily="${esc(p.id)}">删除计划</button></div>`).join('')||tr('<p class="hint">例如：每天背 50 个单词。每天的完成情况分别保留。</p>')}</div></details>`;
}
