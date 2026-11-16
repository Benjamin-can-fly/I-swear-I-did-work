import {timeLabel,compareDayTime} from '../lib/entry-time.js';
import {missedPlanDays} from '../lib/missed-plans.js';
import {deadlineTone,taskWhen} from '../lib/deadlines.js';
import {tr} from '../lib/i18n.js';
import {esc} from '../lib/ui.js';
import {localDate,prettyDate,rangeFor,monthLabel} from '../lib/dates.js';
import {localMinute} from '../lib/task-time.js';
import {attachmentList} from '../lib/attachments.js';

export function timelineItems(records,tasks){
 const linked=new Set(records.map(r=>r.sourceTaskId).filter(Boolean));
 return [...records.map(r=>({id:r.id,kind:'record',date:r.date,time:r.time||'',timePeriod:r.timePeriod,status:'done',title:r.title,body:r.details,attachments:r.attachments})),...tasks.filter(t=>!(t.status==='done'&&linked.has(t.id))).map(t=>{const at=localMinute(t.completedAt),when=taskWhen(t);return {id:t.id,kind:'task',date:t.status==='done'?at.slice(0,10):when.date,time:t.status==='done'?at.slice(11):when.time,timePeriod:t.status==='done'?'':t.timePeriod,status:t.status,urgency:deadlineTone(t),title:t.title,body:t.notes,attachments:t.attachments};})].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||compareDayTime(a,b)||a.id.localeCompare(b.id));
}
export function renderUnifiedTimeline(records,tasks,date,layout='horizontal',selection=null,{onlyDay=''}={}){
 const [start,end]=onlyDay?[onlyDay,onlyDay]:rangeFor(date,'month'),today=localDate();
 const items=timelineItems(records,tasks).filter(e=>onlyDay?e.date===onlyDay:!e.date||(e.date>=start&&e.date<=end));
 const missed=onlyDay?[]:missedPlanDays(tasks).filter(d=>d.date>=start&&d.date<=end);
 const dates=onlyDay?[onlyDay]:[...new Set([...items.map(e=>e.date).filter(Boolean),...missed.map(d=>d.date)])];
 if(!onlyDay){if(today>=start&&today<=end&&!dates.includes(today))dates.push(today);dates.sort();if(items.some(e=>!e.date))dates.push('');}
 const toolbar=onlyDay?'':tr`<div class="unified-toolbar"><div class="date-controls"><button class="icon-button" data-history-shift="-1" aria-label="时间线上一个月">‹</button><input id="history-month" type="month" value="${date.slice(0,7)}" aria-label="时间线月份"><button class="icon-button" data-history-shift="1" aria-label="时间线下一个月">›</button><button class="text-button" id="history-today">今天</button></div><div class="layout-switch" role="group" aria-label="时间线方向">${['horizontal','vertical'].map(v=>`<button data-history-layout="${v}" aria-pressed="${v===layout}">${v==='horizontal'?tr('横向'):tr('纵向')}</button>`).join('')}</div></div>`;
 return tr`${toolbar}<div class="unified-scroll ${layout}" tabindex="0" aria-label="全部事项时间线">${dates.map(d=>`<section class="unified-day ${d===today?'is-today':''}" data-history-date="${d}"><header><i></i><strong>${d?esc(prettyDate(d)):tr('未确定日期')}</strong><small>${d===today?tr('今天'):d?(d<today?tr('过去'):tr('未来')):tr('待办未设日期 / 完成日期未记录')}</small></header>${missed.some(m=>m.date===d)?`<div class="missed-day-note">${tr`当天有 ${missed.find(m=>m.date===d).tasks.length} 项每日计划未完成`}${missed.find(m=>m.date===d).pending?'':` · ${tr('已补做')}`}</div>`:''}<div class="unified-events">${items.filter(e=>e.date===d).map(e=>tr`<article class="unified-event" data-history-id="${esc(e.id)}" data-history-kind="${e.kind}" data-urgency="${e.urgency||'neutral'}" ${e.kind==='task'?`data-urgency-task="${esc(e.id)}"`:''}><div class="unified-event-top"><span class="event-status ${e.status==='done'?'done':e.status==='paused'?'paused':'pending'}">${e.status==='done'?tr('已办'):e.status==='paused'?tr('已搁置'):e.urgency==='overdue'?tr('待办 · 已逾期'):e.urgency==='soon'?tr('24 小时内到期'):tr('待办')}</span><time>${esc(timeLabel(e.time,e.timePeriod))}</time><button class="icon-button" data-entry-menu="${e.kind}" data-entry-id="${esc(e.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="事项操作 ${esc(e.title)}">⋯</button></div>${selection?`<label class="report-item"><input type="checkbox" data-report-item="${esc(e.kind+':'+e.id)}" ${selection.has(e.kind+':'+e.id)?'checked':''}><strong>${esc(e.title)}</strong></label>`:`<button class="unified-title" ${e.kind==='task'&&e.status!=='done'?`data-complete-task="${esc(e.id)}"`:'disabled'}>${esc(e.title)}</button>`}${e.body?`<p>${esc(e.body)}</p>`:''}${attachmentList(e.attachments)}</article>`).join('')||tr('<p class="unified-empty">暂无事项</p>')}</div></section>`).join('')||tr('<div class="empty-state"><h3>本月暂无事项</h3><p>切换月份查看已办和待办。</p></div>')}</div>`;
}
