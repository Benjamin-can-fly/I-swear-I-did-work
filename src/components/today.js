import {todayCompletedCount} from '../lib/today-count.js';
import {tr} from '../lib/i18n.js';
import {esc,icon} from '../lib/ui.js';
import {todayTasks,repeatFrequency} from '../lib/daily.js';
import {localDate} from '../lib/dates.js';
import {taskCheck} from './tasks.js';
import {attachmentList} from '../lib/attachments.js';

function row(t){
 const done=t.status==='done',paused=t.status==='paused';
 return tr`<article class="today-task ${done?'completed':''} ${paused?'is-paused':''}" data-today-task="${esc(t.id)}">
 <button class="task-check" data-toggle-task="${esc(t.id)}" aria-pressed="${done}" aria-label="${done?tr('撤回完成'):tr('完成')} ${esc(t.title)}">${taskCheck}</button>
 <div class="today-task-body"><button class="today-task-title" data-toggle-task="${esc(t.id)}">${esc(t.title)}</button>${t.notes?`<p>${esc(t.notes)}</p>`:''}${attachmentList(t.attachments)}
 <small>${paused?(t.routineId?tr('本次已跳过'):tr('已搁置')):done?tr('已完成'):t.dueTime?esc(t.dueTime):tr('不限时间')}${t.project?' · '+esc(t.project):''}</small></div>
 <button class="icon-button" data-entry-menu="task" data-entry-id="${esc(t.id)}" aria-label="待办操作 ${esc(t.title)}" aria-haspopup="menu">⋯</button></article>`;
}
const frequencyName=f=>({daily:tr('每日计划'),weekly:tr('每周计划'),monthly:tr('每月计划')})[f];
const sortRows=items=>[...items].sort((a,b)=>(a.scheduledAt||a.dueTime||'99').localeCompare(b.scheduledAt||b.dueTime||'99')).map(row).join('');
function planRows(items){
 const result=[],seen=new Set();
 for(const task of items){
  if(task.scheduledAt){if(['next','today'].includes(task.status))result.push(row(task));continue;}
  const key=task.routineId+task.routinePeriod;if(seen.has(key))continue;seen.add(key);
  const group=items.filter(t=>t.routineId===task.routineId&&t.routinePeriod===task.routinePeriod),pending=group.find(t=>['next','today'].includes(t.status));
  if(!pending)continue;
  const done=group.filter(t=>t.status==='done').length;
  result.push(`<div class="quota-plan">${row(pending)}<span class="plan-progress">${tr`${done} / ${group.length} 次`}</span></div>`);
 }
 return result.join('');
}
export function renderToday(data,day=localDate(),{frequency='daily',manage=false}={}){
 if(manage)return tr`<section class="today-plan-manager"><button class="text-button" data-back-today>‹ 返回今日</button><div class="plan-manager-heading"><h2>管理计划</h2><button class="secondary" data-new-daily>新增计划</button></div>${renderPlanList(data.routines,day)}</section>`;
 const {ordinary,daily,overdue,upcoming}=todayTasks(data.tasks,day),all=[...ordinary,...daily],done=todayCompletedCount(data,day),pending=all.filter(t=>['next','today'].includes(t.status)).length,paused=all.filter(t=>t.status==='paused').length;
 const plans=daily.filter(t=>repeatFrequency(t)===frequency),later=upcoming.filter(t=>repeatFrequency(t)===frequency),finished=plans.filter(t=>t.status==='done'),ordinaryPending=ordinary.filter(t=>t.status!=='done'),ordinaryDone=ordinary.filter(t=>t.status==='done');
 return tr`<div class="today-overview"><div class="today-stats"><span>今日已办 <strong>${done}</strong></span><span>待办 <strong>${pending}</strong></span><span>已搁置 <strong>${paused}</strong></span></div><button class="secondary today-add" data-new-today>${icon('pen')}新增待办</button></div>
 <div class="today-grid"><section class="today-list"><header><h2>今日待办</h2><span>${ordinaryDone.length} / ${ordinary.length}</span></header>
 ${ordinaryPending.length?sortRows(ordinaryPending):tr('<div class="today-empty">今日暂无待办</div>')}
 ${ordinaryDone.length?tr`<details class="today-completed"><summary>已完成 <span>${ordinaryDone.length}</span></summary>${sortRows(ordinaryDone)}</details>`:''}
 ${overdue.length?tr`<details class="today-overdue"><summary>之前未完成 <span>${overdue.length}</span></summary>${sortRows(overdue)}</details>`:''}</section>
 <aside class="daily-card"><header><h2>计划</h2><button class="text-button" data-manage-daily>管理计划</button></header>
 <div class="plan-frequency-tabs" role="group" aria-label="计划周期">${['daily','weekly','monthly'].map(f=>`<button data-plan-frequency="${f}" aria-pressed="${f===frequency}">${frequencyName(f)}</button>`).join('')}</div>
 ${planRows(plans)||tr('<p class="today-empty">这会儿没有要做的计划。</p>')}
 ${later.length?tr`<details class="upcoming-plans"><summary>稍后显示 <span>${later.length}</span></summary>${sortRows(later)}</details>`:''}
 ${finished.length?tr`<details class="today-completed"><summary>已完成 <span>${finished.length}</span></summary>${sortRows(finished)}</details>`:''}
 ${plans.some(t=>t.status==='paused')?tr`<details class="today-completed"><summary>已搁置</summary>${sortRows(plans.filter(t=>t.status==='paused'))}</details>`:''}
 </aside></div>`;
}
export function renderPlanList(plans=[],day=localDate()){
 return plans.map(p=>tr`<div class="daily-plan-row"><div><strong>${esc(p.title)}</strong><small>${frequencyName(repeatFrequency(p))} · ${p.targetCount||1} 次 · ${!p.active?tr('已暂停'):p.endDate&&p.endDate<day?tr('已结束'):p.startDate>day?tr('尚未开始'):tr('进行中')}${p.scheduling==='times'?' · '+esc((p.slots||[]).map(s=>s.time).join(' / ')):''}</small></div><button type="button" class="text-button" data-edit-daily="${esc(p.id)}">修改</button><button type="button" class="text-button" data-toggle-daily="${esc(p.id)}">${p.active?tr('暂停'):tr('恢复')}</button><button type="button" class="text-button" data-delete-daily="${esc(p.id)}">删除计划</button></div>`).join('')||tr('<p class="hint">每天、每周或每月要做的事，在这里设置一次就好。</p>');
}
export function renderDailyPlans(plans=[],day=localDate()){
 return tr`<details class="daily-plans"><summary>已有计划 <span>${plans.length}</span></summary><div class="daily-plans-body"><button type="button" class="text-button" data-new-daily>新增计划 ↗</button>${renderPlanList(plans,day)}</div></details>`;
}
