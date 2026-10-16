import {tr,locale} from '../lib/i18n.js';
import {esc} from '../lib/ui.js';
import {monthWeeks} from '../lib/insights.js';

function entries(records){
 return records.map(r=>`<button class="recap-entry" data-link-record="${esc(r.id)}"><time>${esc(r.date.slice(5))}${r.time?' · '+esc(r.time):''}</time><span><strong>${r.important?'★ ':''}${esc(r.title)}</strong><small>${esc(r.details)}</small></span><span aria-hidden="true">↗</span></button>`).join('');
}
export function renderRetrospective(records,date,view){
 const sorted=[...records].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 const groups=view==='week'?monthWeeks(date).map((w,i)=>({...w,label:tr`第 ${i+1} 周`})):
 Array.from({length:12},(_,i)=>{const month=`${date.slice(0,4)}-${String(i+1).padStart(2,'0')}`;return {start:month+'-01',end:month+'-31',label:locale()==='en'?new Date(2026,i,1).toLocaleDateString('en',{month:'long'}):tr`${i+1} 月`};});
 return `<div class="recap-list ${view==='month'?'annual-recap':''}">${groups.map(g=>{
  const all=sorted.filter(r=>r.date>=g.start&&r.date<=g.end),shown=view==='month'?all.filter(r=>r.important):all;
  return `<section class="recap-group"><div class="recap-heading"><h3>${g.label}</h3><span>${view==='week'?g.start.slice(5)+' — '+g.end.slice(5):all.length+tr(' 条记录')}</span>${view==='month'&&all.length?tr`<button class="text-button" data-review-month="${g.start}">查看各周 ↗</button>`:''}</div>${shown.length?entries(shown):`<p class="recap-empty">${all.length?tr('未标记重点，可在编辑记录时选择。'):tr('这段时间还没有记录。')}</p>`}</section>`;
 }).join('')}</div>`;
}
