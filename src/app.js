import {installAppearance} from './lib/theme.js';
import {localDate,prettyDate,rangeFor,movePeriod,parseDate} from './lib/dates.js';
import {emptyData,mergeData,validateData} from './lib/model.js';
import {esc,icon,hydrateIcons,notify,api,download} from './lib/ui.js';
import {renderRecords,calendarHTML} from './components/records.js';
import {renderTasks,groups} from './components/tasks.js';
import {sortTasks,updateCountdowns} from './lib/deadlines.js';
import {installMotion,refreshMotion,pageTransition,transitionPage,openDialog,closeDialog,listTransition,beginProcessing,taskCompletion,jellyRelease,waitForJelly} from './lib/motion.js';
import {reviewRange,shiftReview,effortOptions} from './lib/insights.js';
import {renderRetrospective} from './components/retrospective.js';
import {renderDashboard} from './components/dashboard.js';
import {localMinute,setTaskStatus} from './lib/task-time.js';
import {openEntryMenu,closeEntryMenu} from './lib/entry-menu.js';
import {InlineEditor} from './components/inline-editor.js';
import {dateExplorer} from './components/date-explorer.js';
import {installAutosize} from './lib/autosize.js';
import {uploadFile} from './lib/attachments.js';
import {syncTaskRecord} from './lib/task-record.js';
import {renderUnifiedTimeline,timelineItems} from './components/unified-timeline.js';
import {reportKey,reportGroup,reportEntries,renderReportControls,exportReport} from './lib/report.js';
import {installTaskGesture} from './lib/task-gesture.js';
import {deleteEntry,restoreDeleted} from './lib/delete-entry.js';
import {VERSION} from './lib/version.js';

const $=s=>document.querySelector(s);
const markupCache=new WeakMap();
function markup(selector,html){const node=$(selector);if(markupCache.get(node)!==html){node.innerHTML=html;markupCache.set(node,html);}}
let data=emptyData(),revision=0,page='journal',view='day',date=localDate(),query='',project='',taskFilter='pending';
let ready=false,busy=false;
let usage=null,usageError='',statDays=14,loadDate=localDate(),dataTab='records',dataOffset=0,dateOrder='asc';
async function track(event){try{usage=await api('/api/usage',{method:'POST',body:JSON.stringify({event})});usageError='';}catch{usageError='使用统计暂不可用，记录仍可正常使用。';}if(page==='dashboard')renderDashboardPanel();}
function renderDashboardPanel(){const scroll=$('.load-chart-scroll')?.scrollLeft||0;markup('#dashboard-page',renderDashboard(data,usage,{days:statDays,selected:loadDate,collection:dataTab,query,project,offset:dataOffset,error:usageError}));$('.load-chart-scroll').scrollLeft=scroll;refreshMotion();}
const uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),draftKey='liubai-draft-v1';
let recordEditor,taskEditor,calendarDate=localDate(),calendarMode='calendar',calendarUnit='day',calendarLayout='rows',recordRange=null,taskRange=[localDate(),localDate()];
let taskDate=localDate(),taskView='day',historyDate=localDate(),historyLayout='horizontal';
let reportMode=false,reportUnit='item',reportTitle='工作汇报',reportSelected=new Set();
function visibleReportEntries(){const [start,end]=rangeFor(historyDate,'month');return timelineItems(data.records.filter(matches),data.tasks.filter(matches)).filter(e=>!e.date||(e.date>=start&&e.date<=end));}
function renderHistory(){
 const valid=new Set(timelineItems(data.records,data.tasks).map(reportKey));reportSelected=new Set([...reportSelected].filter(k=>valid.has(k)));
 markup('#timeline-page',`<div class="report-entry"><button class="secondary" id="open-report" aria-pressed="${reportMode}">${reportMode?'退出汇报选择':'选择事项 · 导出汇报'}</button></div>`+(reportMode?renderReportControls(visibleReportEntries(),reportSelected,reportUnit,reportTitle):'')+renderUnifiedTimeline(data.records.filter(matches),data.tasks.filter(matches),historyDate,historyLayout,reportMode?reportSelected:null));
 document.querySelectorAll('[data-report-group]').forEach(input=>input.indeterminate=input.dataset.partial==='true');refreshMotion();
}
function renderCalendar(){
 markup('#calendar',dateExplorer(calendarDate,page==='tasks'?data.tasks:data.records,{mode:calendarMode,unit:calendarUnit,layout:calendarLayout,tasks:page==='tasks'}));
 $('#calendar-month').textContent=calendarDate.slice(0,4)+' 年 '+Number(calendarDate.slice(5,7))+' 月';
 $('.date-list-options').hidden=calendarMode!=='events';
 for(const [key,value]of [['calendarMode',calendarMode],['calendarUnit',calendarUnit],['calendarLayout',calendarLayout]])document.querySelectorAll('[data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']').forEach(b=>{b.classList.toggle('selected',b.dataset[key]===value);b.setAttribute('aria-pressed',String(b.dataset[key]===value));});refreshMotion();
}
function openCalendar(){calendarDate=page==='tasks'?taskDate:date;renderCalendar();openDialog($('#date-picker'));}
function selectCalendar(start,end=start){
 if(page==='tasks'){taskDate=start;taskRange=[start,end];taskView=start===end?'day':'week';}else{date=start;recordRange=start===end?null:[start,end];view='day';query='';$('#search').value='';}
 $('#date-picker').close();render();listTransition($(page==='tasks'?'#tasks':'#records'));
}
function projectOptions(){
 const projects=[...new Set([...data.records,...data.tasks].map(r=>r.project).filter(Boolean))].sort();
 $('#project-filter').innerHTML='<option value="">全部项目</option>'+projects.map(p=>`<option>${esc(p)}</option>`).join('');
 $('#project-filter').value=project;$('#project-options').innerHTML=projects.map(p=>`<option value="${esc(p)}">`).join('');
}
function matches(r){return (!project||r.project===project)&&(!query||[r.title,r.details,r.summary,r.raw,r.notes,r.project].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()));}

function render(){
 closeEntryMenu();
 if(ready){recordEditor?.reconcile(data.records);taskEditor?.reconcile(data.tasks);}
 const journal=page==='journal';
 for(const name of ['journal','tasks','timeline','dashboard'])$('#'+name+'-page').hidden=page!==name;
 const pageName={journal:'工作记录',tasks:'待办事项',timeline:'时间线',dashboard:'数据后台'}[page];
 $('#breadcrumb').textContent=pageName;$('#page-title').textContent=pageName;
 $('#page-subtitle').textContent=journal?`${data.records.length} 条记录 · 按发生时间归档`:page==='tasks'?`${data.tasks.filter(t=>['next','today'].includes(t.status)).length} 项待处理`:page==='timeline'?'过去的记录与未来的安排':'使用统计 · 工作负荷 · 数据管理';
 $('.sidebar nav').dataset.current=page;
 document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 document.querySelectorAll('[data-task-view]').forEach(b=>{const selected=Boolean(taskRange)&&b.dataset.taskView===taskView;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-task-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.taskFilter===taskFilter);b.setAttribute('aria-pressed',String(b.dataset.taskFilter===taskFilter));});
 $('#task-count').textContent=data.tasks.filter(t=>['today','next'].includes(t.status)).length;
 const matchedTasks=data.tasks.filter(t=>matches(t)&&(!taskRange||!t.due||(t.due>=taskRange[0]&&t.due<=taskRange[1])));$('#clear-task-date').hidden=!taskRange;
 $('#task-range-title').textContent=!taskRange?'全部日期':taskView==='day'?prettyDate(taskDate):taskRange.join(' — ');
 $('#task-range-count').textContent=`${matchedTasks.length} 条待办`;
 const summaryRange=taskRange||rangeFor(taskDate,'day'),summaryTasks=data.tasks.filter(t=>matches(t)&&t.due>=summaryRange[0]&&t.due<=summaryRange[1]);
 $('#task-review-title').textContent=!taskRange||taskView==='day'?'当日汇总':taskView==='week'?'本周汇总':'本月汇总';
 markup('#task-review',`<div class="review-number">${summaryTasks.length}<span>条待办</span></div><div class="task-review-counts"><span>待处理<strong>${summaryTasks.filter(t=>['next','today'].includes(t.status)).length}</strong></span><span>已搁置<strong>${summaryTasks.filter(t=>t.status==='paused').length}</strong></span><span>已完成<strong>${summaryTasks.filter(t=>t.status==='done').length}</strong></span></div><p class="hint">${summaryRange[0]===summaryRange[1]?summaryRange[0]:summaryRange.join(' — ')} · 按截止日期统计</p>`);
 $('#pending-count').textContent=matchedTasks.filter(t=>['today','next'].includes(t.status)).length;
 $('#done-count').textContent=matchedTasks.filter(t=>t.status==='done').length;
 $('#paused-count').textContent=matchedTasks.filter(t=>t.status==='paused').length;
 $('#clear-filter').hidden=!query&&!project;$('#view-date').value=page==='tasks'?(taskRange?.[0]||localDate()):date;
 const [start,end]=recordRange||reviewRange(date,view);
 const records=data.records.filter(r=>matches(r)&&(query||(r.date>=start&&r.date<=end)));
 $('#range-title').textContent=query?'全部日期的搜索结果':recordRange?recordRange.join(' — '):view==='day'?prettyDate(date):view==='week'?`${date.slice(0,4)} 年 ${Number(date.slice(5,7))} 月 · 各周回顾`:`${date.slice(0,4)} 年 · 每月重点`;
 $('#record-count').textContent=`${records.length} 条记录`;
 markup('#records',view==='day'||query?renderRecords(records,data.tasks,recordRange?'week':view,Boolean(query||project),data.records.length===0,dateOrder):renderRetrospective(records,date,view));
 renderCalendar();
 $('#review-title').textContent=query?'搜索结果汇总':{day:'当日汇总',week:'本月记录',month:'年度记录'}[view];
 const projects=[...new Set(records.map(r=>r.project||'未分类'))];
 markup('#review',records.length?`<div class="review-number">${records.length}<span>条记录 · ${projects.length} 个分类</span></div>${projects.map(p=>`<div class="review-project"><strong>${esc(p)}</strong>${records.filter(r=>(r.project||'未分类')===p).slice(0,4).map(r=>`<button data-link-record="${esc(r.id)}">${esc(r.title)} <span>↗</span></button>`).join('')}</div>`).join('')}`:'<div class="review-number">0<span>条记录</span></div><p class="hint">所选时段暂无记录。</p>');
 const next=sortTasks(data.tasks.filter(t=>t.status==='today'||t.status==='next')).slice(0,3);
 markup('#next-tasks',next.length?next.map(t=>`<button class="next-task" data-complete-task="${esc(t.id)}"><span class="mini-square"></span><span>${esc(t.title)}<small>${t.due?esc(t.due+' '+(t.dueTime||'')):'未设截止时间'}</small></span></button>`).join(''):'<p class="muted small">暂无待办</p>');
 markup('#task-next',$('#next-tasks').innerHTML);
 markup('#tasks',renderTasks(matchedTasks,taskFilter,dateOrder));if(page==='dashboard')renderDashboardPanel();if(page==='timeline')renderHistory();projectOptions();taskEditor?.records(data.records);refreshMotion();
}

function switchPage(next){
 if(page===next)return;
 const order=['journal','tasks','timeline','dashboard'],direction=order.indexOf(next)>order.indexOf(page)?1:-1;
 page=next;transitionPage(()=>{render();window.scrollTo({top:0,behavior:'instant'});},direction);void track(next);
}

async function persist(next,message='已保存',undo,beforeRender){
 if(!ready)throw Error('数据尚未读取，无法保存');if(busy)throw Error('正在保存，请稍后');busy=true;$('#save-state').textContent='正在保存…';
 try{validateData(next);const result=await api('/api/data',{method:'PUT',body:JSON.stringify({data:next,revision})});data=next;revision=result.revision;if(beforeRender)await beforeRender();render();notify(message,undo);$('#save-state').innerHTML='<i></i>已保存到本机';}
 catch(e){$('#save-state').textContent='保存失败，请重试';throw e;}finally{busy=false;}
}
function openRecord(record){if(!record)return;if(page!=='journal'){page='journal';render();}recordEditor.edit(record);}
function openTask(task){if(!task)return;if(page!=='tasks'){page='tasks';render();}taskEditor.edit(task);}
async function saveInline(kind,item,editing){
 const collection=kind==='record'?'records':'tasks',next=structuredClone(data);
 if(kind==='record'&&item.sourceTaskId)item.taskSyncOwned=false;
 if(editing){if(!next[collection].some(r=>r.id===item.id))throw Error('这条内容已被删除，请重新新增');next[collection]=next[collection].map(r=>r.id===item.id?item:r);}else next[collection].push(item);
 query='';project='';$('#search').value='';
 if(kind==='record'){date=item.date;view='day';recordRange=null;}else{syncTaskRecord(next,item);if(item.status==='done'&&item.completedAt){date=localMinute(item.completedAt).slice(0,10);view='day';recordRange=null;}taskDate=item.due||localDate();taskView='day';taskRange=[taskDate,taskDate];taskFilter=['today','next'].includes(item.status)?'pending':item.status;}
 await persist(next);void track('save');listTransition($(kind==='record'?'#records':'#tasks'));
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
  if(b.id==='open-report'||b.hasAttribute('data-report-close')){reportMode=!reportMode;renderHistory();return;}
  if(b.dataset.reportUnit){reportUnit=b.dataset.reportUnit;renderHistory();return;}
  if(b.hasAttribute('data-report-all')){visibleReportEntries().forEach(e=>reportSelected.add(reportKey(e)));renderHistory();return;}
  if(b.hasAttribute('data-report-clear')){reportSelected.clear();renderHistory();return;}
  if(b.id==='export-report-pdf'){const entries=reportEntries(data,reportSelected);if(!entries.length)return;notify(await exportReport(entries,reportTitle.trim()||'工作汇报',reportUnit));return;}
  if(b.hasAttribute('data-close'))return closeDialog(b.closest('dialog'));
  if(b.dataset.entryMenu){
   const kind=b.dataset.entryMenu,id=b.dataset.entryId,collection=kind==='record'?'records':'tasks',entry=data[collection].find(r=>r.id===id);if(!entry)return;
   const safe=fn=>()=>Promise.resolve().then(fn).catch(err=>notify(err.message));
   const actions=[{label:'修改',run:()=>kind==='record'?openRecord(entry):openTask(entry)}];
   if(kind==='task'){
    if(entry.status!=='done')actions.push({label:'标记完成',run:safe(()=>changeTaskStatus(id,'done'))});
    if(entry.status==='done'||entry.status==='paused')actions.push({label:'返回待处理',run:safe(()=>changeTaskStatus(id,'next'))});
    else actions.push({label:'搁置',run:safe(()=>changeTaskStatus(id,'paused'))});
   }
   actions.push({label:'删除',danger:true,run:safe(()=>removeEntry(collection,id))});openEntryMenu(b,actions);refreshMotion();return;
  }
  if(b.dataset.page)switchPage(b.dataset.page);
  if(b.dataset.taskView){taskView=b.dataset.taskView;taskRange=rangeFor(taskDate,taskView);render();listTransition($('#tasks'));}
  if(b.dataset.taskShift){taskDate=movePeriod(taskDate,taskView,Number(b.dataset.taskShift));taskRange=rangeFor(taskDate,taskView);render();listTransition($('#tasks'),'date',Number(b.dataset.taskShift));}
  if(b.dataset.historyShift){historyDate=movePeriod(historyDate,'month',Number(b.dataset.historyShift));renderHistory();}
  if(b.dataset.historyLayout){historyLayout=b.dataset.historyLayout;renderHistory();}
  if(b.id==='history-today'){historyDate=localDate();renderHistory();$('[data-history-date="'+localDate()+'"]')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});}
  if(b.dataset.view){recordRange=null;view=b.dataset.view;render();listTransition($('.timeline-scroll'));}
  if(b.dataset.shift){recordRange=null;date=shiftReview(date,view,Number(b.dataset.shift));render();listTransition($('#records'),'date',Number(b.dataset.shift));}
  if(b.dataset.calendar)selectCalendar(b.dataset.calendar,b.dataset.calendarEnd||b.dataset.calendar);
  if(b.dataset.calendarShift){calendarDate=movePeriod(calendarDate,'month',Number(b.dataset.calendarShift));renderCalendar();listTransition($('#calendar'));}
  if(b.dataset.calendarMode){calendarMode=b.dataset.calendarMode;renderCalendar();}
  if(b.dataset.calendarUnit){calendarUnit=b.dataset.calendarUnit;renderCalendar();}
  if(b.dataset.calendarLayout){calendarLayout=b.dataset.calendarLayout;renderCalendar();}
  if(b.dataset.reviewMonth){date=b.dataset.reviewMonth;view='week';recordRange=null;render();listTransition($('#records'));}
  if(b.dataset.statDays){statDays=Number(b.dataset.statDays);renderDashboardPanel();listTransition($('#dashboard-page'));}
  if(b.dataset.chartDate){loadDate=b.dataset.chartDate;const scroll=$('#dashboard-page').scrollTop;renderDashboardPanel();$('#dashboard-page').scrollTop=scroll;$('#dashboard-page [data-chart-date="'+loadDate+'"]').focus({preventScroll:true});}
  if(b.dataset.dataTab){dataTab=b.dataset.dataTab;dataOffset=0;renderDashboardPanel();}
  if(b.dataset.dataOffset){dataOffset=Number(b.dataset.dataOffset);renderDashboardPanel();}
  if(b.id==='dashboard-backup')openDialog($('#backup'));
  if(b.dataset.taskFilter){taskFilter=b.dataset.taskFilter;render();listTransition($('#tasks'));}
  if(b.dataset.editRecord)openRecord(data.records.find(r=>r.id===b.dataset.editRecord));
  if(b.dataset.editTask)openTask(data.tasks.find(t=>t.id===b.dataset.editTask));
  if(b.dataset.linkRecord){recordRange=null;
    const r=data.records.find(r=>r.id===b.dataset.linkRecord);if(!r)return notify('关联记录已删除');
    const switched=page!=='journal';page='journal';view='day';date=r.date;query='';project='';$('#search').value='';render();
    if(switched)pageTransition($('#journal-page'),-1);
    const el=[...document.querySelectorAll('[data-record]')].find(el=>el.dataset.record===r.id);
    el?.scrollIntoView({behavior:'smooth',block:'nearest'});el?.classList.add('highlight');
  }
  if(b.dataset.suggest){
    if(b.disabled)return;
    const r=data.records.find(r=>r.id===b.dataset.suggest),s=r.suggestions[Number(b.dataset.index)];
    if(data.tasks.some(t=>t.recordId===r.id&&t.title===s.title))return;
    jellyRelease(b);b.disabled=true;
    try{const next=structuredClone(data);next.tasks.push({id:uid(),title:s.title,notes:'',due:s.due,dueTime:'',project:r.project,status:s.due&&s.due<=localDate()?'today':'next',priority:'normal',autoSyncRecord:false,recordId:r.id,createdAt:now(),startedAt:now(),completedAt:''});await persist(next,'已加入待办',undefined,()=>waitForJelly(b));}finally{b.disabled=false;}
  }
  if(b.dataset.toggleTask){
    const id=b.dataset.toggleTask,t=data.tasks.find(t=>t.id===id);await changeTaskStatus(id,t.status==='done'?'next':'done',b.closest('.task-row'));
  }
  if(b.dataset.completeTask)await changeTaskStatus(b.dataset.completeTask,'done',b.closest('.task-row'));
  if(b.id==='fill-example'){recordEditor.fill({content:'今天 14:00 与小王讨论社团招新。确定海报使用蓝白配色，我负责海报，小王申请场地。明天完成海报文案。'});recordEditor.draft();}

 }catch(err){notify(err.message);}
});

async function removeEntry(collection,id){
 const change=deleteEntry(data,collection,id);if(!change)return;
 const linked=change.removed.records.length&&change.removed.tasks.length;
 await persist(change.data,linked?'已同步删除待办和记录，15 秒内可撤销':'已删除，15 秒内可撤销',async()=>{await persist(restoreDeleted(data,change.removed),'已恢复');});
}
async function changeTaskStatus(id,status,row){
 if(busy)return;
 const old=structuredClone(data.tasks.find(t=>t.id===id));if(!old)return;
 if(old.status===status)return;
 const priorRecords=structuredClone(data.records.filter(r=>r.sourceTaskId===id));
 const next=structuredClone(data);next.tasks=next.tasks.map(t=>t.id===id?setTaskStatus(t,status):t);syncTaskRecord(next,next.tasks.find(t=>t.id===id));
 if(status==='done'){date=localMinute(next.tasks.find(t=>t.id===id).completedAt).slice(0,10);view='day';recordRange=null;}
 await persist(next,status==='done'?(old.autoSyncRecord===false?'已完成':'已完成，已加入工作记录'):status==='next'?'已返回待处理':'已搁置',async()=>{const restored=structuredClone(data);restored.tasks=restored.tasks.map(t=>t.id===id?{...t,status:old.status,completedAt:old.completedAt||''}:t);restored.records=restored.records.filter(r=>r.sourceTaskId!==id&&!priorRecords.some(p=>p.id===r.id));restored.records.push(...priorRecords);await persist(restored,'已撤销');},row?()=>taskCompletion(row,status==='done'):undefined);
}

$('.brand').onclick=e=>{e.preventDefault();switchPage('journal');};
$('#calendar-open').onclick=$('#task-calendar-open').onclick=openCalendar;
$('#view-date').onchange=e=>{if(e.target.value)selectCalendar(e.target.value);};
$('#record-order').onchange=e=>{dateOrder=e.target.value;render();};
$('#clear-task-date').onclick=()=>{taskRange=null;render();};
$('#task-today').onclick=()=>{taskDate=localDate();taskView='day';taskRange=[taskDate,taskDate];render();};
document.addEventListener('change',e=>{if(e.target.id==='load-date'&&e.target.value){loadDate=e.target.value;renderDashboardPanel();}});
document.addEventListener('change',e=>{if(e.target.id==='history-month'&&e.target.value){historyDate=e.target.value+'-01';renderHistory();}});
document.addEventListener('input',e=>{if(e.target.id==='report-title')reportTitle=e.target.value;});
document.addEventListener('change',e=>{
 const input=e.target;
 if(input.hasAttribute('data-report-item')){const key=input.dataset.reportItem;input.checked?reportSelected.add(key):reportSelected.delete(key);renderHistory();}
 if(input.hasAttribute('data-report-group')){for(const entry of visibleReportEntries().filter(x=>reportGroup(x.date,reportUnit)===input.dataset.reportGroup)){input.checked?reportSelected.add(reportKey(entry)):reportSelected.delete(reportKey(entry));}renderHistory();}
});
window.chrome?.webview?.addEventListener('message',e=>{if(e.data?.type==='report-result')notify(e.data.message);});
$('#go-today').onclick=()=>{date=localDate();recordRange=null;render();listTransition($('#records'));};
$('#see-tasks').onclick=()=>switchPage('tasks');
$('#search').oninput=e=>{query=e.target.value.trim();dataOffset=0;render();};
$('#project-filter').onchange=e=>{project=e.target.value;render();listTransition($(page==='journal'?'#records':'#tasks'));};
$('#clear-filter').onclick=()=>{project='';query='';$('#search').value='';render();};
$('#backup-open').onclick=$('#mobile-backup').onclick=()=>openDialog($('#backup'));
$('#export-json').onclick=async()=>{if(!ready)return notify('数据尚未载入');try{const backup=await api('/api/backup');download(`工作日志备份-${localDate()}.json`,JSON.stringify(backup,null,2),'application/json');notify('备份已导出，包含附件');}catch(e){notify(e.message);}};
$('#export-md').onclick=()=>{
 if(!ready)return notify('数据尚未载入');
 const content='# 工作日志\n\n'+[...data.records].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(r=>`## ${r.date} ${r.time||'时间未注明'} · ${r.title}\n\n${r.details}\n\n项目：${r.project||'未分类'}；耗时：${r.durationMinutes?r.durationMinutes+' 分钟':'未填写'}；重点：${r.important?'是':'否'}\n\n原文：\n${r.raw}\n`).join('\n')+'\n# 待办事项\n\n'+sortTasks(data.tasks).map(t=>`- [${t.status==='done'?'x':' '}] ${t.title}（${groups[t.status]}；截止：${t.due?(t.due+' '+(t.dueTime||'时间未定')):'未设置'}）\n  ${t.notes}`).join('\n');
 download(`工作日志-${localDate()}.md`,content,'text/markdown;charset=utf-8');
};
$('#import-json').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  if(f.size>200_000_000)throw Error('备份过大，上限 200 MB');const imported=validateData(JSON.parse(await f.text()));
  if(confirm(`备份包含 ${imported.records.length} 条记录、${imported.tasks.length} 条待办。合并到当前数据？`)){
   const incoming={version:1,records:imported.records.filter(r=>!data.records.some(x=>x.id===r.id)),tasks:imported.tasks.filter(t=>!data.tasks.some(x=>x.id===t.id))},files=new Map((imported.attachmentFiles||[]).map(f=>[f.id,f.content])),mapped=new Map();
   for(const entry of [...incoming.records,...incoming.tasks])for(let i=0;i<(entry.attachments||[]).length;i++){
    const a=entry.attachments[i];if(mapped.has(a.id)){entry.attachments[i]=mapped.get(a.id);continue;}
    if(files.has(a.id)){const encoded=files.get(a.id);if(typeof encoded!=='string'||encoded.length>28_000_000)throw Error('附件数据过大');const binary=atob(encoded),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(bytes.length!==a.size)throw Error('备份附件大小不匹配');const meta=await uploadFile(new File([bytes],a.name,{type:a.type}));mapped.set(a.id,meta);entry.attachments[i]=meta;}
    else if(!(await fetch('/api/attachments/'+a.id,{method:'GET'})).ok)throw Error('备份缺少附件文件，请从原设备重新导出');
   }
   await persist(mergeData(data,incoming),'备份已合并');
  }
 }
 catch(err){notify('导入失败：'+err.message);}finally{e.target.value='';}
};

recordEditor=new InlineEditor($('#record-composer'),'record',(item,edit)=>saveInline('record',item,edit));
const buildLabel=document.createElement('p');buildLabel.className='hint';buildLabel.id='app-version';buildLabel.textContent=`版本 ${VERSION} · ${window.workJournalDesktop?'桌面版':'浏览器版'}`;$('#backup').append(buildLabel);
taskEditor=new InlineEditor($('#task-composer'),'task',(item,edit)=>saveInline('task',item,edit));
installTaskGesture($('#tasks'),(id,row)=>changeTaskStatus(id,'done',row).catch(e=>notify(e.message)));
installAppearance();hydrateIcons();installMotion();installAutosize();$('#today-label').textContent=prettyDate(localDate());render();
try{const loaded=await api('/api/data');data=loaded.data;revision=loaded.revision;ready=true;render();}catch(e){notify(e.message);$('#save-state').textContent='数据读取失败，请刷新';}
window.chrome?.webview?.postMessage({type:'app-ready'});
try{usage=await api('/api/usage');if(!sessionStorage.getItem('journal-session')){await track('session');if(!usageError)sessionStorage.setItem('journal-session','1');}void track('journal');}catch{usageError='使用统计暂不可用。';}
setInterval(()=>{if(page==='tasks')updateCountdowns(data.tasks);$('#today-label').textContent=prettyDate(localDate());},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateCountdowns(data.tasks);});

