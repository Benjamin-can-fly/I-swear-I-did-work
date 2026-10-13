import {displayMinute} from '../lib/task-time.js';
import {attachmentList} from '../lib/attachments.js';
import {esc,icon} from '../lib/ui.js';
import {prettyDate,parseDate,localDate} from '../lib/dates.js';
export function recordCard(r,tasks) {
 return `<article class="record" data-record="${esc(r.id)}"><div class="time-stamp">${esc(r.time||'未注明')}<i></i></div><div class="record-body"><div class="record-top"><h3>${esc(r.title)}</h3><button class="icon-button" data-entry-menu="record" data-entry-id="${esc(r.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="记录操作 ${esc(r.title)}">⋯</button></div><p class="record-details">${esc(r.details)}</p>${attachmentList(r.attachments)}<div class="record-meta">${r.sourceTaskId?`<span class="tag">待办完成记录</span><span class="record-task-times">开始 ${esc(displayMinute(r.startedAt))} · 完成 ${esc(displayMinute(r.completedAt))}</span>`:''}${r.project?`<span class="tag">${esc(r.project)}</span>`:''}<details class="raw-details"><summary>查看原文</summary><blockquote>${esc(r.raw)}</blockquote><small>录入于 ${esc(new Date(r.createdAt).toLocaleString('zh-CN'))}</small></details></div></div></article>`;
}
export function renderRecords(records,tasks,view,searching,allowExample=false,order='asc') {
 if(!records.length)return `<div class="empty-state"><span class="empty-icon">${icon('book')}</span><h3>${searching?'没有匹配的记录':'暂无记录'}</h3><p>${searching?'调整关键词或清除筛选。':'在上方输入内容并保存。'}</p>${!searching&&allowExample?'<button class="secondary" id="fill-example">填入示例 ↗</button>':''}</div>`;
 const direction=order==='asc'?1:-1,dates=[...new Set(records.map(r=>r.date))].sort((a,b)=>direction*a.localeCompare(b));
 return dates.map(date=>`${view!=='day'||searching?`<h3 class="day-divider">${prettyDate(date)}</h3>`:''}${records.filter(r=>r.date===date).sort((a,b)=>direction*(a.time||'99:99').localeCompare(b.time||'99:99')).map(r=>recordCard(r,tasks)).join('')}`).join('');
}
export function calendarHTML(date,records){const d=parseDate(date),year=d.getFullYear(),month=d.getMonth(),offset=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();return `<div class="calendar">${['一','二','三','四','五','六','日'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const s=localDate(new Date(year,month,i+1)),count=records.filter(r=>r.date===s).length;return `<button data-calendar="${s}" class="${s===date?'chosen':''}" aria-label="${s}，${count} 条记录">${i+1}<span>${count?'•':''}</span></button>`;}).join('')}</div>`;}
