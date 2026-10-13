import {esc} from './ui.js';
import {localDate,rangeFor} from './dates.js';
import {displayMinute} from './task-time.js';
import {timelineItems} from '../components/unified-timeline.js';
export const reportKey=e=>`${e.kind}:${e.id}`;
export function reportGroup(date,unit){
 if(!date)return '未确定日期';
 if(unit==='month')return date.slice(0,7);
 if(unit==='week')return rangeFor(date,'week').join(' — ');
 return date;
}
export function reportEntries(data,keys){
 return timelineItems(data.records,data.tasks).filter(e=>keys.has(reportKey(e))).map(e=>({...e,source:(e.kind==='record'?data.records:data.tasks).find(x=>x.id===e.id)}));
}
export function renderReportControls(entries,selected,unit,title){
 const groups=new Map();for(const e of entries){const key=reportGroup(e.date,unit);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 return `<section class="report-panel"><div class="report-heading"><strong>导出汇报</strong><button class="icon-button" data-report-close aria-label="关闭汇报选择">×</button></div><div class="report-settings"><label>汇报标题<input id="report-title" maxlength="100" value="${esc(title)}" placeholder="例如：本周工作汇报"></label><div class="segmented" aria-label="汇报选择单位">${[['item','逐条'],['day','按日'],['week','按周'],['month','按月']].map(([v,l])=>`<button data-report-unit="${v}" class="${v===unit?'selected':''}">${l}</button>`).join('')}</div></div>${unit==='item'?'':`<div class="report-groups">${[...groups].map(([group,list])=>{const count=list.filter(e=>selected.has(reportKey(e))).length;return `<label><input type="checkbox" data-report-group="${esc(group)}" ${count===list.length?'checked':''} data-partial="${count>0&&count<list.length}"><span>${esc(group)} <small>${count}/${list.length} 项</small></span></label>`;}).join('')}</div>`}<div class="report-actions"><span id="report-selection-count">已选 ${selected.size} 项</span><button class="text-button" data-report-all>全选当前月份</button><button class="text-button" data-report-clear>清空选择</button><button class="primary" id="export-report-pdf" ${selected.size?'':'disabled'}><span class="action-label">导出 PDF</span></button></div><p class="hint">可以跨月份选择；切换单位不会清空已选内容。分组选取仅包含当前筛选下可见的事项。</p></section>`;
}
export function reportHtml(entries,title,unit){
 const groups=new Map();for(const e of entries){const key=reportGroup(e.date,unit);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 const body=[...groups].map(([group,list])=>`<section class="report-group"><h2>${esc(group)}</h2>${list.map(e=>{const s=e.source,status=e.status==='done'?'已办':e.status==='paused'?'已搁置':'待办';return `<article><div class="entry-head"><span class="status">${status}</span><h3>${esc(e.title)}</h3></div><p class="metadata">${esc(e.date||'日期未设置')}${e.time?' '+esc(e.time):''}${s.project?' · '+esc(s.project):''}</p>${e.body?`<div class="entry-content">${esc(e.body)}</div>`:''}<p class="metadata">${e.kind==='task'?`开始：${esc(displayMinute(s.startedAt))}　完成：${s.status==='done'?esc(displayMinute(s.completedAt)):'未完成'}<br>截止：${s.due?esc(s.due+' '+(s.dueTime||'未设时分')):'未设置'}`:s.sourceTaskId?`开始：${esc(displayMinute(s.startedAt))}　完成：${esc(displayMinute(s.completedAt))}`:`${s.durationMinutes?'实际耗时：'+s.durationMinutes+' 分钟':''}`}</p>${e.attachments?.length?`<div class="attachment-names"><b>附件</b><ul>${e.attachments.map(a=>`<li>${esc(a.name)}</li>`).join('')}</ul></div>`:''}</article>`;}).join('')}</section>`).join('');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${reportCss}</style></head><body><header><p class="eyebrow">工作日志 · 汇报导出</p><h1>${esc(title)}</h1><p class="metadata">导出日期 ${localDate()} · 共 ${entries.length} 项 · 已办 ${entries.filter(e=>e.status==='done').length} 项 / 待办 ${entries.filter(e=>e.status!=='done'&&e.status!=='paused').length} 项 / 已搁置 ${entries.filter(e=>e.status==='paused').length} 项</p></header>${body}<footer>附件仅列出文件名，原文件保留在工作日志中。本汇报保留所选事项内容，未自动改写或生成总结。</footer></body></html>`;
}
export const reportCss=`@page{size:A4;margin:18mm 17mm}*{box-sizing:border-box}body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#2d3e33;font-size:10.5pt;line-height:1.8;margin:0}h1{font-size:24pt;line-height:1.4;margin:8px 0 12px;overflow-wrap:anywhere}h2{font-size:14pt;border-bottom:1px solid #cddbc8;padding-bottom:7px;margin:28px 0 14px;break-after:avoid}h3{font-size:12pt;line-height:1.6;margin:0;overflow-wrap:anywhere}.eyebrow{color:#6d8564;font-size:9pt}.metadata{color:#73816d;font-size:9pt;margin:6px 0}.entry-head{display:flex;align-items:baseline;gap:10px;break-after:avoid}.status{flex:none;background:#edf4e8;border-radius:4px;padding:2px 7px;font-size:8pt}.entry-content{white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0;orphans:3;widows:3}article{padding:10px 0 18px;border-bottom:1px solid #edf1e8}article p{overflow-wrap:anywhere}.attachment-names{font-size:9pt;color:#66795c}.attachment-names ul{padding-left:20px;margin:4px 0}li{overflow-wrap:anywhere}footer{border-top:1px solid #dfe8d8;padding-top:15px;margin-top:30px;color:#85917d;font-size:8pt}`;
export async function exportReport(entries,title,unit){
 const html=reportHtml(entries,title,unit);
 if(window.workJournalDesktop&&window.chrome?.webview){window.chrome.webview.postMessage({type:'export-report',html,title});return '正在导出，请选择保存位置';}
 const key='workjournal-report-'+crypto.randomUUID();sessionStorage.setItem(key,html);
 const popup=window.open('/report.html?key='+encodeURIComponent(key),'_blank');
 if(!popup){sessionStorage.removeItem(key);throw Error('请允许打开汇报预览窗口后重试');}
 return '已打开汇报预览，点击“打印 / 保存 PDF”';
}

