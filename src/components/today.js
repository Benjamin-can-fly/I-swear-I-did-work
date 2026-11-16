import {timeLabel,compareDayTime} from '../lib/entry-time.js';
import {countdown,deadlineTone} from '../lib/deadlines.js';
import {todayStatLists} from '../lib/today-count.js';
import {tr} from '../lib/i18n.js';
import {esc} from '../lib/ui.js';
import {todayTasks,repeatFrequency,routineAllowedOn} from '../lib/daily.js';
import {localDate} from '../lib/dates.js';
import {taskCheck} from './tasks.js';
import {attachmentList} from '../lib/attachments.js';
import {dependencyIndex,dependencyState,isTaskBlocked} from '../lib/task-dependencies.js';

function planNotes(notes){
 if(!notes)return '';
 const lines=notes.split('\n').map(line=>line.trim()).filter(Boolean);
 return `<div class="today-task-notes">${lines.map(line=>{
  const section=line.match(/^([^：:]{1,8})[：:]\s*(.*)$/);
  return section?`<div class="plan-note-section"><strong>${esc(section[1])}</strong><p>${esc(section[2])}</p></div>`:`<p>${esc(line)}</p>`;
 }).join('')}</div>`;
}
function row(t,dependencies=[]){
 const done=t.status==='done',paused=t.status==='paused',state=dependencyState(t,dependencies),blocked=state.blocked;
 return tr`<article class="today-task ${done?'completed':''} ${paused?'is-paused':''} ${blocked?'is-waiting':''}" data-today-task="${esc(t.id)}" ${blocked?'data-dependency-blocked="true"':`data-urgency-task="${esc(t.id)}"`} data-urgency="${blocked?'neutral':deadlineTone(t)}">
 <button class="task-check" data-toggle-task="${esc(t.id)}" ${blocked?'disabled':''} aria-pressed="${done}" aria-label="${blocked?tr('等待前一步'):done?tr('撤回完成'):tr('完成')} ${esc(t.title)}">${taskCheck}</button>
 <div class="today-task-body"><button class="today-task-title" data-toggle-task="${esc(t.id)}" ${blocked?'disabled':''}>${esc(t.title)}</button>${blocked?'':planNotes(t.notes)}${attachmentList(t.attachments)}
 ${t.afterTaskId?`<span class="task-dependency">${state.missing?tr('前一步已删除，修改关联'):tr('前一步：')+' '+esc(state.predecessor.title)}</span>`:''}<small>${blocked?tr('等待前一步'):paused?(t.routineId?tr('本次已跳过'):tr('已搁置')):done?tr('已完成'):esc(timeLabel(t.dueTime||t.scheduledTime,t.timePeriod)||tr('不限时间'))}${t.project?' · '+esc(t.project):''}</small>${!blocked&&['soon','overdue'].includes(deadlineTone(t))?`<span class="urgency-caption">${countdown(t).label} · ${countdown(t).text}</span>`:''}</div>
 <button class="icon-button" data-entry-menu="task" data-entry-id="${esc(t.id)}" aria-label="待办操作 ${esc(t.title)}" aria-haspopup="menu">⋯</button></article>`;
}
const frequencyName=f=>({daily:tr('每日计划'),weekly:tr('每周计划'),monthly:tr('每月计划')})[f];
const sortRows=(items,dependencies)=>[...items].sort((a,b)=>compareDayTime({time:a.dueTime||a.scheduledTime,timePeriod:a.timePeriod},{time:b.dueTime||b.scheduledTime,timePeriod:b.timePeriod})).map(t=>row(t,dependencies)).join('');
function planRows(items){
 const result=[],seen=new Set();
 for(const task of items){
  if(task.scheduledAt){if(['next','today'].includes(task.status))result.push(row(task));continue;}
  const key=task.routineId+task.routinePeriod;if(seen.has(key))continue;seen.add(key);
  const group=items.filter(t=>t.routineId===task.routineId&&t.routinePeriod===task.routinePeriod),pending=group.find(t=>['next','today'].includes(t.status));
  if(!pending)continue;
  const done=group.filter(t=>t.status==='done').length;
  result.push(`<div class="quota-plan">${row(pending)}${group.length>1?`<span class="plan-progress">${tr`${done} / ${group.length} 次`}</span>`:''}</div>`);
 }
 return result.join('');
}
export function renderToday(data,day=localDate(),{frequency='daily',manage=false,returnPage='today'}={}){
 if(manage)return tr`<section class="today-plan-manager"><header class="plan-manager-heading"><button class="text-button" data-back-today>${returnPage==='tasks'?tr('‹ 返回待办事项'):tr('‹ 返回今日')}</button><button class="secondary" data-new-daily>新增计划</button></header>${renderPlanList(data.routines,day)}</section>`;
 const groups=todayTasks(data.tasks,day),{ordinary,daily,overdue,upcoming,waiting=[]}=groups,{done,pending,paused}=todayStatLists(data,day,groups),dependencies=dependencyIndex(data.tasks);
 const plans=daily.filter(t=>repeatFrequency(t)===frequency),later=upcoming.filter(t=>repeatFrequency(t)===frequency),finished=plans.filter(t=>t.status==='done'),ordinaryPending=ordinary.filter(t=>t.status!=='done'),ordinaryDone=ordinary.filter(t=>t.status==='done');
 return tr`<div class="today-overview"><div class="today-stats"><button type="button" data-today-stat="done">今日已办 <strong>${done.tasks.length+done.records.length}</strong></button><button type="button" data-today-stat="pending">${tr('今日统计：待办')} <strong>${pending.length}</strong></button><button type="button" data-today-stat="paused">已搁置 <strong>${paused.length}</strong></button></div></div>
 ${urgencySummary(data.tasks)}<div class="today-grid"><section class="today-list"><header><h2>今日待办</h2><span>${ordinaryDone.length} / ${ordinary.length}</span></header>
 ${ordinaryPending.length?sortRows(ordinaryPending,dependencies):tr('<div class="today-empty">今日暂无待办</div>')}
 ${waiting.length?tr`<details class="today-waiting" data-disclosure="task-waiting" open><summary>后续任务 <span>${waiting.length}</span></summary>${sortRows(waiting,dependencies)}</details>`:''}
 ${ordinaryDone.length?tr`<details class="today-completed"><summary>已完成 <span>${ordinaryDone.length}</span></summary>${sortRows(ordinaryDone,dependencies)}</details>`:''}
 ${overdue.length?tr`<details class="today-overdue" open><summary>之前未完成 <span>${overdue.length}</span></summary>${sortRows(overdue.slice(0,5),dependencies)}${overdue.length>5?`<button class="text-button" data-show-urgency="overdue">${tr('查看全部逾期')} ↗</button>`:''}</details>`:''}</section>
 <aside class="daily-card"><header><h2>计划</h2><button class="text-button" data-manage-daily>管理计划</button></header>
 <div class="plan-frequency-tabs" role="group" aria-label="计划周期">${['daily','weekly','monthly'].map(f=>`<button data-plan-frequency="${f}" aria-pressed="${f===frequency}">${frequencyName(f)}</button>`).join('')}</div>
 ${planRows(plans)||tr('<p class="today-empty">这会儿没有要做的计划。</p>')}
 ${later.length?tr`<details class="upcoming-plans"><summary>稍后显示 <span>${later.length}</span></summary>${sortRows(later)}</details>`:''}
 ${finished.length?tr`<details class="today-completed"><summary>已完成 <span>${finished.length}</span></summary>${sortRows(finished)}</details>`:''}
 ${plans.some(t=>t.status==='paused')?tr`<details class="today-completed"><summary>已搁置</summary>${sortRows(plans.filter(t=>t.status==='paused'))}</details>`:''}
 </aside></div>`;
}
export function renderPlanList(plans=[],day=localDate()){
 return plans.map(p=>tr`<div class="daily-plan-row"><div><strong>${esc(p.title)}</strong><small>${frequencyName(repeatFrequency(p))} · ${p.targetCount||1} 次${p.weekdaysOnly?' · '+tr('仅工作日'):''} · ${!p.active?tr('已暂停'):p.endDate&&p.endDate<day?tr('已结束'):p.startDate>day?tr('尚未开始'):tr('进行中')}${p.scheduling==='times'?' · '+esc((p.slots||[]).map(s=>s.time).join(' / ')):''}</small></div><button type="button" class="text-button" data-edit-daily="${esc(p.id)}">修改</button><button type="button" class="icon-button" data-plan-menu="${esc(p.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="计划操作 ${esc(p.title)}">⋯</button></div>`).join('')||tr('<p class="hint">每天、每周或每月要做的事，在这里设置一次就好。</p>');
}

export function urgencySummary(tasks,allTasks=tasks){
 const dependencies=dependencyIndex(allTasks),eligible=tasks.filter(t=>(!t.routineId||routineAllowedOn(t))&&!isTaskBlocked(t,dependencies)),late=eligible.filter(t=>deadlineTone(t)==='overdue').length,soon=eligible.filter(t=>deadlineTone(t)==='soon').length;
 return late||soon?`<div class="urgency-summary" aria-label="${tr('截止提醒')}">${late?`<button data-show-urgency="overdue" class="is-overdue">${tr`已逾期 ${late} 项`}</button>`:''}${soon?`<button data-show-urgency="soon" class="is-soon">${tr`24 小时内到期 ${soon} 项`}</button>`:''}</div>`:'';
}
