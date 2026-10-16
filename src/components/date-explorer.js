import {tr} from '../lib/i18n.js';
import {esc} from '../lib/ui.js';
import {rangeFor,addDays,prettyDate,localDate,parseDate} from '../lib/dates.js';
import {monthWeeks} from '../lib/insights.js';
import {calendarHTML} from './records.js';
export function dateExplorer(date,entries,{mode='calendar',unit='day',layout='rows',tasks=false}={}){
 const normalized=entries.map(e=>({...e,date:tasks?e.due:e.date}));
 if(mode==='calendar')return calendarHTML(date,normalized);
 const [start,end]=rangeFor(date,'month'),periods=unit==='week'?monthWeeks(date):Array.from({length:parseDate(end).getDate()},(_,i)=>({start:addDays(start,i),end:addDays(start,i)}));
 return `<div class="date-event-list ${layout} ${unit}">${periods.map((p,i)=>{const items=normalized.filter(e=>e.date>=p.start&&e.date<=p.end).sort((a,b)=>(a.date+(a.time||a.dueTime||'')).localeCompare(b.date+(b.time||b.dueTime||'')));return tr`<button class="date-event-card" data-calendar="${p.start}" data-calendar-end="${p.end}"><span class="date-card-heading"><strong>${unit==='week'?tr`第 ${i+1} 周`:esc(prettyDate(p.start))}</strong><small>${unit==='week'?`${p.start.slice(5)} — ${p.end.slice(5)} · `:''}${items.length} 项</small></span><span class="date-events">${items.length?items.map(e=>`<span><time>${unit==='week'?e.date.slice(5)+' ':''}${esc(e.time||e.dueTime||'')}</time>${esc(e.title)}${(e.details||e.notes)?`<small>${esc((e.details||e.notes).slice(0,130))}${(e.details||e.notes).length>130?'…':''}</small>`:''}</span>`).join(''):tr('<small>暂无事项</small>')}</span></button>`;}).join('')}</div>`;
}
