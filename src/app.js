import {CaptureEditor} from './components/capture-editor.js';
import {applyCapture} from './lib/capture.js';
import {tr,localizeStatic} from './lib/i18n.js';
import {installAppearance} from './lib/theme.js';
import {localDate,prettyDate,rangeFor,movePeriod,parseDate,monthLabel} from './lib/dates.js';
import {emptyData,mergeData,validateData} from './lib/model.js';
import {esc,icon,hydrateIcons,notify,api,download} from './lib/ui.js';
import {renderRecords,calendarHTML} from './components/records.js';
import {renderTasks,groups} from './components/tasks.js';
import {sortTasks,updateCountdowns,deadlineTone,taskWhen} from './lib/deadlines.js';
import {installMotion,refreshMotion,pageTransition,transitionPage,openDialog,closeDialog,listTransition,taskCompletion,jellyRelease,waitForJelly} from './lib/motion.js';
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
import {deleteEntry,deleteEntries,deletePlan,restoreDeleted} from './lib/delete-entry.js';
import {materializeDaily,saveDailyPlan,routineActive,routineAllowedOn,isReleased} from './lib/daily.js';
import {createReminderSync,hasScheduledReminders} from './lib/plan-reminders.js';
import {renderToday,urgencySummary} from './components/today.js';
import {todayStatLists} from './lib/today-count.js';
import {VERSION} from './lib/version.js';
import {commitDataChanges,mergeDataChanges} from './lib/data-sync.js';
import {isTaskBlocked,assertTaskReady,assertReadyTransitions,newlyReadyTasks} from './lib/task-dependencies.js';

localizeStatic();
const $=s=>document.querySelector(s);
const markupCache=new WeakMap();
function markup(selector,html){const node=$(selector);if(markupCache.get(node)!==html){const open=[...node.querySelectorAll('details[data-disclosure][open]')].map(d=>d.dataset.disclosure);node.innerHTML=html;open.forEach(key=>{const d=node.querySelector('[data-disclosure="'+key+'"]');if(d)d.open=true;});markupCache.set(node,html);}}
let data=emptyData(),revision=0,page='today',view='day',date=localDate(),query='',project='',taskFilter='pending';
try{const back=sessionStorage.getItem('worklog.return-page');sessionStorage.removeItem('worklog.return-page');if(['today','journal','tasks','timeline','dashboard','settings'].includes(back))page=back;}catch{}
let ready=false,busy=false,todayFrequency='daily',todayManaging=false,planReturnPage='today';
let todayStatScope='',scopedTaskIds='';
const statTitles={done:tr('今日已办'),pending:tr('今日待办'),paused:tr('已搁置')};
let reminded=new Set();try{reminded=new Set(JSON.parse(localStorage.getItem('worklog.reminded')||'[]'));}catch{}
const windowsReminderSync=hasScheduledReminders(window)?createReminderSync(message=>window.chrome.webview.postMessage(message),()=>notify(tr('Windows 未能安排提醒，请检查系统通知设置。'))):null;
const syncWindowsReminders=()=>windowsReminderSync?.update(data,new Date(),reminded);
let usage=null,usageError='',statDays=14,loadDate=localDate(),dataTab='records',dataOffset=0,dateOrder='asc';
async function track(event){try{usage=await api('/api/usage',{method:'POST',body:JSON.stringify({event})});usageError='';}catch{usageError=tr('使用统计暂不可用，记录仍可正常使用。');}if(page==='dashboard')renderDashboardPanel();}
function renderDashboardPanel(){const scroll=$('.load-chart-scroll')?.scrollLeft||0;markup('#dashboard-page',renderDashboard(data,usage,{days:statDays,selected:loadDate,collection:dataTab,query,project,offset:dataOffset,error:usageError}));$('.load-chart-scroll').scrollLeft=scroll;refreshMotion();}
const uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),draftKey='liubai-draft-v1';
let recordEditor,taskEditor,calendarDate=localDate(),calendarMode='calendar',calendarUnit='day',calendarLayout='rows',recordRange=null,taskRange=[localDate(),localDate()];
let taskDate=localDate(),taskView='day',historyDate=localDate(),historyLayout='horizontal';
let batchCollection='',batchSelected=new Set(),batchVisible={records:[],tasks:[]},taskUrgency='';
function batchBar(collection){
 const active=batchCollection===collection;
 return `<div class="batch-bar"><button class="secondary" data-batch-mode="${collection}" aria-pressed="${active}">${active?tr('退出多选'):tr('批量管理')}</button>${active?`<span>${tr`已选 ${batchSelected.size} 项`}</span><button class="text-button" data-batch-all>${tr('全选当前列表')}</button><button class="text-button" data-batch-clear>${tr('清空选择')}</button><button class="secondary batch-delete" data-batch-delete ${batchSelected.size?'':'disabled'}>${tr('删除所选')}</button><small>${collection==='tasks'?tr('删除待办会一并删除它同步的工作记录；每日计划设置保留。'):tr('只删除所选记录，不删除来源待办。')}</small>`:''}</div>`;
}
let reportMode=false,reportUnit='item',reportTitle=tr('工作汇报'),reportSelected=new Set();
let languageView;
try{languageView=JSON.parse(sessionStorage.getItem('worklog.language-view'));sessionStorage.removeItem('worklog.language-view');if(languageView){({view,date,query,project,taskFilter,taskDate,taskView,taskRange,recordRange,historyDate,historyLayout,reportMode,reportUnit}=languageView);reportTitle=languageView.reportTitle??reportTitle;reportSelected=new Set(languageView.reportSelected||[]);$('#search').value=query;}}catch{}

function visibleReportEntries(){const [start,end]=rangeFor(historyDate,'month');return timelineItems(data.records.filter(matches),data.tasks.filter(matches)).filter(e=>!e.date||(e.date>=start&&e.date<=end));}
function renderHistory(scopedDone){
 if(todayStatScope==='done'){
  const day=localDate(),{records,tasks}=scopedDone||todayStatLists(data,day).done;
  markup('#timeline-page',renderUnifiedTimeline(records,tasks,day,'vertical',null,{onlyDay:day}));refreshMotion();return;
 }
 const valid=new Set(timelineItems(data.records,data.tasks).map(reportKey));reportSelected=new Set([...reportSelected].filter(k=>valid.has(k)));
 markup('#timeline-page',`<div class="report-entry"><button class="secondary" id="open-report" aria-pressed="${reportMode}">${reportMode?tr('退出汇报选择'):tr('导出汇报')}</button></div>`+(reportMode?renderReportControls(visibleReportEntries(),reportSelected,reportUnit,reportTitle):'')+renderUnifiedTimeline(data.records.filter(matches),data.tasks.filter(matches),historyDate,historyLayout,reportMode?reportSelected:null));
 document.querySelectorAll('[data-report-group]').forEach(input=>input.indeterminate=input.dataset.partial==='true');refreshMotion();
}
function renderCalendar(){
 markup('#calendar',dateExplorer(calendarDate,page==='tasks'?data.tasks:data.records,{mode:calendarMode,unit:calendarUnit,layout:calendarLayout,tasks:page==='tasks'}));
 $('#calendar-month').textContent=monthLabel(calendarDate);
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
 $('#project-filter').innerHTML=tr('<option value="">全部项目</option>')+projects.map(p=>`<option>${esc(p)}</option>`).join('');
 $('#project-filter').hidden=!projects.length&&!project;$('#project-filter').value=project;$('#project-options').innerHTML=projects.map(p=>`<option value="${esc(p)}">`).join('');
}
function matches(r){return (!project||r.project===project)&&(!query||[r.title,r.details,r.summary,r.raw,r.notes,r.project].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()));}
function taskInRange(t,range,includeOverdue){
 if(!range||includeOverdue&&deadlineTone(t)==='overdue')return true;
 if(t.routineId)return (t.scheduledAt?t.routineDate:t.routineEnd||t.routineDate)>=range[0]&&t.routineDate<=range[1];
 const dates=[t.scheduledDate,t.due].filter(Boolean);
 return !dates.length||dates.some(d=>d>=range[0]&&d<=range[1]);
}

function render(){
 closeEntryMenu();
 if(ready){recordEditor?.reconcile(data.records);taskEditor?.reconcile([...data.tasks,...(data.routines||[])]);}
 const journal=page==='journal';
 for(const name of ['today','journal','tasks','timeline','dashboard','settings'])$('#'+name+'-page').hidden=page!==name;
 // Keep the live form outside the refreshed list. Moving it only on navigation
 // preserves attachments, preview corrections and typed drafts between both pages.
 const slot=$(page==='today'&&!todayManaging?'#today-composer-slot':'#task-composer-slot');
 if(taskEditor&&taskEditor.root.parentElement!==slot){
  slot.append(taskEditor.root);taskEditor.quickCapture?.syncPlaceholder();
 }
 if(page==='tasks'&&!manageLink.isConnected)taskEditor.form.querySelector('.composer-fields').append(manageLink);
 else if(page!=='tasks'&&manageLink.isConnected)manageLink.remove();
 const pageName={today:tr('今日'),journal:tr('工作记录'),tasks:tr('待办事项'),timeline:tr('时间线'),dashboard:tr('数据后台'),settings:tr('设置')}[page];
 const scoped=todayStatScope?todayStatLists(data,localDate()):null;
 $('#breadcrumb').textContent=pageName;$('#page-title').textContent=scoped?statTitles[todayStatScope]:page==='today'?(todayManaging?tr('管理计划'):tr('今天该做些什么')):pageName;
 $('.searchbar').hidden=Boolean(scoped)||page==='today'||page==='settings';
 $('[data-back-to-today-stat]').hidden=!scoped;
 document.documentElement.toggleAttribute('data-today-stat-detail',Boolean(scoped));
 document.documentElement.dataset.activePage=page;
 if(scoped){const count=todayStatScope==='done'?scoped.done.records.length+scoped.done.tasks.length:scoped[todayStatScope].length;$('#page-subtitle').textContent=prettyDate(localDate())+' · '+tr`${count} 项`;}
 else $('#page-subtitle').textContent=page==='today'?prettyDate(localDate()):journal?tr`${data.records.length} 条记录 · 按发生时间归档`:page==='tasks'?tr`${data.tasks.filter(t=>['next','today'].includes(t.status)&&(!t.routineId||routineAllowedOn(t)&&(routineActive(t)||deadlineTone(t)==='overdue'))).length} 项待处理`:page==='timeline'?tr('过去的记录与未来的安排'):page==='settings'?tr('按你的习惯来。'):tr('使用统计 · 工作负荷 · 数据管理');
 $('.sidebar nav').dataset.current=page;
 document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 document.querySelectorAll('[data-task-view]').forEach(b=>{const selected=Boolean(taskRange)&&b.dataset.taskView===taskView;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-task-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.taskFilter===taskFilter);b.setAttribute('aria-pressed',String(b.dataset.taskFilter===taskFilter));});
 $('#journal-range').value=view;$('#task-range').value=taskRange?taskView:'all';
 $('#task-count').textContent=data.tasks.filter(t=>['today','next'].includes(t.status)&&(!t.routineId||routineAllowedOn(t)&&(routineActive(t)||deadlineTone(t)==='overdue'))).length;
 const currentTaskView=!taskRange||(taskRange[0]===localDate()&&taskRange[1]===localDate());
 const scopedTasks=scoped&&page==='tasks',activeTaskFilter=scopedTasks?todayStatScope:taskFilter;
 const matchedTasks=scopedTasks?scoped[todayStatScope]:data.tasks.filter(t=>(!taskUrgency||deadlineTone(t)===taskUrgency)&&(!currentTaskView||!t.routineId||t.status==='done'||routineAllowedOn(t))&&matches(t)&&taskInRange(t,taskRange,currentTaskView));$('#clear-task-date').hidden=true;
 scopedTaskIds=scopedTasks?JSON.stringify(matchedTasks.map(t=>t.id)):'';
 $('#task-range-title').textContent=!taskRange?tr('全部日期'):taskView==='day'?prettyDate(taskDate):taskRange.join(' — ');
 $('#task-range-count').textContent=tr`${matchedTasks.length} 条待办`;
 $('#pending-count').textContent=matchedTasks.filter(t=>['today','next'].includes(t.status)).length;
 $('#done-count').textContent=matchedTasks.filter(t=>t.status==='done').length;
 $('#paused-count').textContent=matchedTasks.filter(t=>t.status==='paused').length;
 $('#clear-filter').hidden=!query&&!project;$('#view-date').value=page==='tasks'?(taskRange?.[0]||localDate()):date;
 const [start,end]=recordRange||reviewRange(date,view);
 const records=data.records.filter(r=>matches(r)&&(query||(r.date>=start&&r.date<=end)));
 $('#range-title').textContent=query?tr('全部日期的搜索结果'):recordRange?recordRange.join(' — '):view==='day'?prettyDate(date):view==='week'?tr`${date.slice(0,4)} 年 ${Number(date.slice(5,7))} 月 · 各周回顾`:tr`${date.slice(0,4)} 年 · 每月重点`;
 $('#record-count').textContent=tr`${records.length} 条记录`;
 batchVisible={records:records.map(r=>r.id),tasks:matchedTasks.filter(t=>activeTaskFilter==='pending'?['today','next'].includes(t.status):t.status===activeTaskFilter).map(t=>t.id)};
 if(batchCollection)batchSelected=new Set([...batchSelected].filter(id=>batchVisible[batchCollection].includes(id)));
 markup('#records',batchBar('records')+(view==='day'||query||batchCollection==='records'?renderRecords(records,data.tasks,recordRange?'week':view,Boolean(query||project),data.records.length===0,dateOrder,batchCollection==='records'?batchSelected:null):renderRetrospective(records,date,view)));
 renderCalendar();
 $('#review-title').textContent=query?tr('搜索结果汇总'):{day:tr('当日汇总'),week:tr('本月记录'),month:tr('年度记录')}[view];
 const projects=[...new Set(records.map(r=>r.project||tr('未分类')))];
 markup('#review',records.length?tr`<div class="review-number">${records.length}<span>条记录 · ${projects.length} 个分类</span></div>${projects.map(p=>`<div class="review-project"><strong>${esc(p)}</strong>${records.filter(r=>(r.project||tr('未分类'))===p).slice(0,4).map(r=>`<button data-link-record="${esc(r.id)}">${esc(r.title)} <span>↗</span></button>`).join('')}</div>`).join('')}`:tr('<div class="review-number">0<span>条记录</span></div><p class="hint">所选时段暂无记录。</p>'));
 const next=sortTasks(data.tasks.filter(t=>(t.status==='today'||t.status==='next')&&!isTaskBlocked(t,data.tasks)&&(!t.routineId||routineAllowedOn(t)&&(routineActive(t)||deadlineTone(t)==='overdue')))).slice(0,3);
 markup('#next-tasks',next.length?next.map(t=>`<button class="next-task" data-complete-task="${esc(t.id)}"><span class="mini-square"></span><span>${esc(t.title)}<small>${t.scheduledDate?tr('安排日期')+' '+esc(t.scheduledDate+' '+(t.scheduledTime||'')):t.due?tr('截止日期')+' '+esc(t.due+' '+(t.dueTime||'')):tr('未设截止时间')}</small></span></button>`).join(''):tr('<p class="muted small">暂无待办</p>'));
 const taskTools=scopedTasks?'':urgencySummary(data.tasks.filter(matches),data.tasks)+(taskUrgency?`<button class="text-button" data-clear-urgency>${tr('清除截止筛选')}</button>`:'')+batchBar('tasks');
 markup('#tasks',taskTools+(scopedTasks&&!matchedTasks.length?tr('<div class="empty-state"><h3>此分类下没有事项。</h3></div>'):renderTasks(matchedTasks,activeTaskFilter,dateOrder,batchCollection==='tasks'?batchSelected:null,data.tasks)));
 if(page==='today')markup('#today-content',ready?renderToday(data,localDate(),{frequency:todayFrequency,manage:todayManaging,returnPage:planReturnPage}):tr('<p class="hint">正在读取今日安排…</p>'));if(page==='dashboard')renderDashboardPanel();if(page==='timeline')renderHistory(scoped?.done);projectOptions();taskEditor?.records(data.records);taskEditor?.dependencies(data.tasks);refreshMotion();
}

function switchPage(next,scope='',focusSelector=''){
 if(page===next&&scope===todayStatScope)return;
 todayStatScope=scope;
 if(next!=='today')todayManaging=false;
 batchCollection='';batchSelected.clear();
 const order=['today','journal','tasks','timeline','dashboard','settings'],direction=order.indexOf(next)>order.indexOf(page)?1:-1;
 page=next;transitionPage(()=>{render();window.scrollTo({top:0,behavior:'instant'});if(focusSelector)$(focusSelector)?.focus({preventScroll:true});},direction);if(next!=='settings')void track(next);
}

let dailyDay='';
let syncInFlight=null,dataEpoch=0;
async function syncExternalData(){
 if(!ready||busy)return;
 if(syncInFlight)return syncInFlight;
 const epoch=dataEpoch;
 syncInFlight=(async()=>{
  const loaded=await api('/api/data');
  // A local action may have started while this read was in flight. Its save
  // will reconcile revisions instead; never replace that action's snapshot.
  if(busy||epoch!==dataEpoch)return;
  if(loaded.revision===revision&&JSON.stringify(loaded.data)===JSON.stringify(data))return;
  data=loaded.data;revision=loaded.revision;syncWindowsReminders();render();
  $('#save-state').innerHTML=tr('<i></i>已保存到本机');
 })();
 try{await syncInFlight;}finally{syncInFlight=null;}
}
async function refreshDaily(){
 if(!ready||busy)return;
 await syncExternalData();if(busy)return;
 const day=localDate(),next=materializeDaily(data,day);
 if(next!==data)await persist(next,null);
 const newDay=day!==dailyDay;
 if(newDay){
  if(taskView==='day'&&taskRange?.[0]===dailyDay&&taskRange?.[1]===dailyDay){taskDate=day;taskRange=[day,day];}
  dailyDay=day;$('#today-label').textContent=prettyDate(day);
 }
 const listChanged=page==='tasks'&&todayStatScope&&JSON.stringify(todayStatLists(data,day)[todayStatScope].map(t=>t.id))!==scopedTaskIds;
 if((page==='today'&&!todayManaging)||(newDay&&(todayStatScope||page==='tasks'))||listChanged)render();
 checkPlanReminders();
}
function checkPlanReminders(){
 if(windowsReminderSync){syncWindowsReminders();return;}
 const day=localDate(),due=data.tasks.filter(t=>routineAllowedOn(t,day)&&t.remind&&t.scheduledAt&&['next','today'].includes(t.status)&&t.routineDate>=day&&isReleased(t)&&!reminded.has(t.id)&&data.routines?.some(p=>p.id===t.routineId&&p.active));
 if(!due.length)return;
 due.forEach(t=>reminded.add(t.id));reminded=new Set([...reminded].slice(-2000));try{localStorage.setItem('worklog.reminded',JSON.stringify([...reminded]));}catch{}
 const message=due.slice(0,3).map(t=>(t.scheduledTime||t.dueTime||new Date(t.scheduledAt).toTimeString().slice(0,5))+' · '+t.title).join(' / ');
 notify(message);
 if(window.workJournalPlatform==='windows')window.chrome?.webview?.postMessage({type:'plan-reminder',message});
 else if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Work Log',{body:message});
}
async function persist(next,message=tr('已保存'),undo,beforeRender,guardCompletions=false){
 if(guardCompletions)assertReadyTransitions(data,next);
 if(!ready)throw Error(tr('数据尚未读取，无法保存'));if(busy)throw Error(tr('正在保存，请稍后'));busy=true;$('#save-state').textContent=tr('正在保存…');
 const base=structuredClone(data);
 dataEpoch++;
 try{
  const result=await commitDataChanges({base,next,revision,read:()=>api('/api/data'),write:(candidate,version)=>api('/api/data',{method:'PUT',body:JSON.stringify({data:candidate,revision:version})}),validate:validateData,
   reconcile:(candidate,remote)=>{if(guardCompletions)assertReadyTransitions(remote,candidate);for(const task of candidate.tasks){const old=base.tasks.find(t=>t.id===task.id);if(old&&JSON.stringify(old)!==JSON.stringify(next.tasks.find(t=>t.id===task.id))&&JSON.stringify(task)!==JSON.stringify(remote.tasks.find(t=>t.id===task.id)))syncTaskRecord(candidate,task);}}
  });
  data=result.data;revision=result.revision;syncWindowsReminders();if(beforeRender)await beforeRender();render();if(message)notify(message,undo);$('#save-state').innerHTML=tr('<i></i>已保存到本机');
 }
 catch(e){if(e.latest){data=e.latest.data;revision=e.latest.revision;syncWindowsReminders();render();}$('#save-state').textContent=tr('保存失败，请重试');e.message=tr(e.message);throw e;}finally{busy=false;}
}
function openRecord(record){if(!record)return;if(page!=='journal'){todayStatScope='';todayManaging=false;page='journal';render();}recordEditor.edit(record);}
function openTask(task){if(!task)return;if(page!=='tasks'||todayStatScope){todayStatScope='';todayManaging=false;page='tasks';render();}taskEditor.edit(task);}
async function changePlan(id,remove=false){
 const next=structuredClone(remove?data:materializeDaily(data)),plan=next.routines.find(p=>p.id===id);if(!plan)return;
 if(!remove){
  plan.active=!plan.active;plan.historyTrackedThrough=localDate();
  await persist(materializeDaily(next),plan.active?tr('计划已恢复'):tr('计划已暂停，已有记录保留'));return;
 }
 const change=deletePlan(data,id);if(!change)return;
 await persist(change.data,tr('计划已删除，已完成和历史记录保留'),async()=>{await persist(restoreDeleted(data,change.removed),tr('计划已恢复'));});
}
async function saveInline(kind,item,editing){
 if(kind==='task'&&item.startDate&&item.repeatFrequency!=='none'){
  const applyCurrent=item.applyCurrent;delete item.applyCurrent;
  if(editing&&taskEditor.item?.id===item.id){const current=(data.routines||[]).find(p=>p.id===item.id);if(!current)throw Error(tr('这条内容已被删除，请重新新增'));item=mergeDataChanges({routines:[taskEditor.item]},{routines:[item]},{routines:[current]}).routines[0];}
  await persist(saveDailyPlan(data,item,localDate(),new Date().toISOString(),{applyCurrent}),tr('计划已保存')); void track('save');return;
 }
 if(kind==='task'&&item.status==='today'&&!item.scheduledDate)item.scheduledDate=localDate();
 const collection=kind==='record'?'records':'tasks',next=structuredClone(data);
 if(kind==='record'&&item.sourceTaskId)item.taskSyncOwned=false;
 if(editing){
  const current=next[collection].find(r=>r.id===item.id);if(!current)throw Error(tr('这条内容已被删除，请重新新增'));
  const editor=kind==='record'?recordEditor:taskEditor,original=editor.item;
  // Keep untouched remote fields when saving a draft that was opened earlier.
  if(original?.id===item.id)item=mergeDataChanges({[collection]:[original]},{[collection]:[item]},{[collection]:[current]})[collection][0];
  next[collection]=next[collection].map(r=>r.id===item.id?item:r);
 }else next[collection].push(item);
 query='';project='';$('#search').value='';
 if(kind==='record'){date=item.date;view='day';recordRange=null;}else{syncTaskRecord(next,item);if(item.status==='done'&&item.completedAt){date=localMinute(item.completedAt).slice(0,10);view='day';recordRange=null;}taskDate=item.due||localDate();taskView='day';taskRange=[taskDate,taskDate];taskFilter=['today','next'].includes(item.status)?'pending':item.status;}
 const before=structuredClone(data);await persist(next,undefined,undefined,undefined,kind==='task');void track('save');listTransition($(kind==='record'?'#records':'#tasks'));if(kind==='task')focusFollowingTask(before);
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
  if(b.dataset.todayStat&&Object.hasOwn(statTitles,b.dataset.todayStat)){const kind=b.dataset.todayStat;switchPage(kind==='done'?'timeline':'tasks',kind,'#page-title');return;}
  if(b.hasAttribute('data-back-to-today-stat')){switchPage('today','',`[data-today-stat="${todayStatScope}"]`);return;}
  if(b.dataset.batchMode){batchCollection=batchCollection===b.dataset.batchMode?'':b.dataset.batchMode;batchSelected.clear();render();return;}
  if(b.hasAttribute('data-batch-all')){batchSelected=new Set(batchVisible[batchCollection]);render();return;}
  if(b.hasAttribute('data-batch-clear')){batchSelected.clear();render();return;}
  if(b.hasAttribute('data-batch-delete')){
   const change=deleteEntries(data,batchCollection,[...batchSelected]);if(!change)return;
   await persist(change.data,tr('已删除所选，15 秒内可撤销'),async()=>{await persist(restoreDeleted(data,change.removed),tr('已恢复'));},()=>{batchSelected.clear();});return;
  }
  if(b.dataset.showUrgency){taskUrgency=b.dataset.showUrgency;taskRange=null;taskFilter='pending';batchCollection='';batchSelected.clear();if(page!=='tasks')switchPage('tasks');else render();return;}
  if(b.hasAttribute('data-clear-urgency')){taskUrgency='';render();return;}
  if(b.dataset.missedDate){historyDate=b.dataset.missedDate;historyLayout='vertical';switchPage('timeline');setTimeout(()=>document.querySelector('[data-history-date="'+b.dataset.missedDate+'"]')?.scrollIntoView({block:'center',behavior:'smooth'}),350);return;}
  if(b.hasAttribute('data-manage-daily')){planReturnPage=page;todayManaging=true;if(page!=='today')switchPage('today');else render();return;}
  if(b.hasAttribute('data-back-today')){todayManaging=false;if(page!==planReturnPage)switchPage(planReturnPage);else render();return;}
  if(b.dataset.planFrequency){todayFrequency=b.dataset.planFrequency;render();return;}
  if(b.hasAttribute('data-new-daily')){todayManaging=false;render();if(taskEditor.item)notify(tr('请先保存或取消当前编辑'));else taskEditor.quickCapture.suggestPlan(todayFrequency);taskEditor.form.elements.content.focus();return;}
  if(b.dataset.editDaily){const plan=data.routines?.find(p=>p.id===b.dataset.editDaily);if(plan)openTask(plan);return;}
  if(b.dataset.planMenu){const plan=data.routines.find(p=>p.id===b.dataset.planMenu);if(!plan)return;
   const change=remove=>()=>changePlan(plan.id,remove).catch(e=>notify(e.message));
   openEntryMenu(b,[{label:plan.active?tr('暂停'):tr('恢复'),run:change(false)},{label:tr('删除计划'),danger:true,run:change(true)}]);return;}
  if(b.id==='open-report' ||b.hasAttribute('data-report-close')){reportMode=!reportMode;renderHistory();return;}
  if(b.dataset.reportUnit){reportUnit=b.dataset.reportUnit;renderHistory();return;}
  if(b.hasAttribute('data-report-all')){visibleReportEntries().forEach(e=>reportSelected.add(reportKey(e)));renderHistory();return;}
  if(b.hasAttribute('data-report-clear')){reportSelected.clear();renderHistory();return;}
  if(b.id==='export-report-pdf'){const entries=reportEntries(data,reportSelected);if(!entries.length)return;notify(await exportReport(entries,reportTitle.trim()||tr('工作汇报'),reportUnit));return;}
  if(b.hasAttribute('data-close'))return closeDialog(b.closest('dialog'));
  if(b.dataset.entryMenu){
   const kind=b.dataset.entryMenu,id=b.dataset.entryId,collection=kind==='record'?'records':'tasks',entry=data[collection].find(r=>r.id===id);if(!entry)return;
   const safe=fn=>()=>Promise.resolve().then(fn).catch(err=>notify(err.message));
   const actions=[{label:tr('修改'),run:()=>kind==='record'?openRecord(entry):openTask(entry)}];
   if(kind==='task'){
    if(!entry.routineId&&entry.status!=='done')actions.push({label:tr('安排到今天'),run:safe(async()=>{const next=structuredClone(data);next.tasks.find(t=>t.id===id).scheduledDate=localDate();await persist(next,tr('已安排到今天'));})});
    if(entry.status!=='done'&&!isTaskBlocked(entry,data.tasks))actions.push({label:tr('标记完成'),run:safe(()=>changeTaskStatus(id,'done'))});
    if(entry.status==='done'||entry.status==='paused')actions.push({label:tr('返回待处理'),run:safe(()=>changeTaskStatus(id,'next'))});
    else actions.push({label:entry.routineId?tr('跳过本次'):tr('搁置'),run:safe(()=>changeTaskStatus(id,'paused'))});
   }
   actions.push({label:kind==='task'&&entry.routineId?tr('删除本次'):tr('删除'),danger:true,run:safe(()=>removeEntry(collection,id))});
   if(kind==='task'&&entry.routineId&&data.routines?.some(p=>p.id===entry.routineId))actions.push({label:tr('删除整个计划'),danger:true,run:safe(()=>changePlan(entry.routineId,true))});
   openEntryMenu(b,actions);refreshMotion();return;
  }
  if(b.dataset.page){if(page==='today'&&b.dataset.page==='today'&&todayManaging){todayManaging=false;render();}else switchPage(b.dataset.page);}
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
    const r=data.records.find(r=>r.id===b.dataset.linkRecord);if(!r)return notify(tr('关联记录已删除'));
    const switched=page!=='journal';todayStatScope='';page='journal';view='day';date=r.date;query='';project='';$('#search').value='';render();
    if(switched)pageTransition($('#journal-page'),-1);
    const el=[...document.querySelectorAll('[data-record]')].find(el=>el.dataset.record===r.id);
    el?.scrollIntoView({behavior:'smooth',block:'nearest'});el?.classList.add('highlight');
  }
  if(b.dataset.suggest){
    if(b.disabled)return;
    const r=data.records.find(r=>r.id===b.dataset.suggest),s=r.suggestions[Number(b.dataset.index)];
    if(data.tasks.some(t=>t.recordId===r.id&&t.title===s.title))return;
    jellyRelease(b);b.disabled=true;
    try{const next=structuredClone(data);next.tasks.push({id:uid(),title:s.title,notes:'',due:s.due,dueTime:'',project:r.project,status:s.due&&s.due<=localDate()?'today':'next',priority:'normal',autoSyncRecord:false,recordId:r.id,createdAt:now(),startedAt:now(),completedAt:''});await persist(next,tr('已加入待办'),undefined,()=>waitForJelly(b));}finally{b.disabled=false;}
  }
  if(b.dataset.toggleTask){
    const id=b.dataset.toggleTask,t=data.tasks.find(t=>t.id===id);await changeTaskStatus(id,t.status==='done'?'next':'done',b.closest('.task-row'));
  }
  if(b.dataset.completeTask)await changeTaskStatus(b.dataset.completeTask,'done',b.closest('.task-row'));
  if(b.id==='fill-example'){recordEditor.fill({content:tr('今天 14:00 与小王讨论社团招新。确定海报使用蓝白配色，我负责海报，小王申请场地。明天完成海报文案。')});recordEditor.draft();}

 }catch(err){notify(err.message);}
});

async function removeEntry(collection,id){
 const change=deleteEntry(data,collection,id);if(!change)return;
 const linked=change.removed.records.length&&change.removed.tasks.length;
 await persist(change.data,linked?tr('已同步删除待办和记录，15 秒内可撤销'):tr('已删除，15 秒内可撤销'),async()=>{await persist(restoreDeleted(data,change.removed),tr('已恢复'));});
}
async function changeTaskStatus(id,status,row){
 if(busy||batchCollection)return;
 const old=structuredClone(data.tasks.find(t=>t.id===id));if(!old)return;
 if(old.status===status)return;
 if(status==='done')assertTaskReady(old,data.tasks);
 const before=structuredClone(data);
 const priorRecords=structuredClone(data.records.filter(r=>r.sourceTaskId===id));
 const next=structuredClone(data);next.tasks=next.tasks.map(t=>t.id===id?setTaskStatus(t,status):t);syncTaskRecord(next,next.tasks.find(t=>t.id===id));
 if(status==='done'){date=localMinute(next.tasks.find(t=>t.id===id).completedAt).slice(0,10);view='day';recordRange=null;}
 const following=newlyReadyTasks(before,next);
 const message=status==='done'?(old.autoSyncRecord===false?tr('已完成'):tr('已完成，已加入工作记录')):status==='next'?tr('已返回待处理'):tr('已搁置');
 await persist(next,message+(following.length?' · '+tr('下一步：')+following[0].title:''),async()=>{const restored=structuredClone(data);restored.tasks=restored.tasks.map(t=>t.id===id?{...t,status:old.status,completedAt:old.completedAt||''}:t);restored.records=restored.records.filter(r=>r.sourceTaskId!==id&&!priorRecords.some(p=>p.id===r.id));restored.records.push(...priorRecords);await persist(restored,tr('已撤销'));},row?()=>taskCompletion(row,status==='done'):undefined,true);
 focusFollowingTask(before);
}

function focusFollowingTask(before){
 const next=newlyReadyTasks(before,data)[0];if(!next)return;
 const selector=`[data-task="${CSS.escape(next.id)}"],[data-today-task="${CSS.escape(next.id)}"]`;
 let target=[...document.querySelectorAll(selector)].find(el=>el.getClientRects().length);
 if(!target){
  page='tasks';todayStatScope='';todayManaging=false;taskRange=null;taskFilter='pending';taskUrgency='';query='';project='';$('#search').value='';render();
  target=document.querySelector(selector);
 }
 if(!target)return;
 target.classList.add('followup-highlight');
 target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 target.querySelector('.task-writing,.today-task-title')?.focus({preventScroll:true});
 setTimeout(()=>target?.classList.remove('followup-highlight'),1800);
}

$('.brand').onclick=e=>{e.preventDefault();if(page==='today'&&todayManaging){todayManaging=false;render();}else switchPage('today');};
$('#calendar-open').onclick=$('#task-calendar-open').onclick=openCalendar;
$('#view-date').onchange=e=>{if(e.target.value)selectCalendar(e.target.value);};
$('#record-order').onchange=e=>{dateOrder=e.target.value;render();};
$('#journal-range').onchange=e=>{view=e.target.value;recordRange=null;render();};
$('#task-range').onchange=e=>{if(e.target.value==='all')taskRange=null;else{taskView=e.target.value;taskRange=rangeFor(taskDate,taskView);}render();};
$('#clear-task-date').onclick=()=>{taskRange=null;render();};
$('#task-today').onclick=()=>{taskDate=localDate();taskView='day';taskRange=[taskDate,taskDate];render();};
document.addEventListener('change',e=>{if(e.target.id==='load-date'&&e.target.value){loadDate=e.target.value;renderDashboardPanel();}});
document.addEventListener('change',e=>{if(e.target.dataset.batchItem){const input=e.target;if(input.dataset.batchItem!==batchCollection)return;input.checked?batchSelected.add(input.value):batchSelected.delete(input.value);render();}});
document.addEventListener('change',e=>{if(e.target.id==='history-layout'){historyLayout=e.target.value;renderHistory();}});
document.addEventListener('change',e=>{if(e.target.id==='history-month'&&e.target.value){historyDate=e.target.value+'-01';renderHistory();}});
document.addEventListener('input',e=>{if(e.target.id==='report-title')reportTitle=e.target.value;});
document.addEventListener('change',e=>{
 const input=e.target;
 if(input.hasAttribute('data-report-item')){const key=input.dataset.reportItem;input.checked?reportSelected.add(key):reportSelected.delete(key);renderHistory();}
 if(input.hasAttribute('data-report-group')){for(const entry of visibleReportEntries().filter(x=>reportGroup(x.date,reportUnit)===input.dataset.reportGroup)){input.checked?reportSelected.add(reportKey(entry)):reportSelected.delete(reportKey(entry));}renderHistory();}
});
window.chrome?.webview?.addEventListener('message',e=>{if(e.data?.type==='report-result')notify(e.data.message);if(e.data?.type==='sync-reminders-result')windowsReminderSync?.result(e.data.success===true,e.data.requestId);});
$('#go-today').onclick=()=>{date=localDate();recordRange=null;render();listTransition($('#records'));};
$('#see-tasks').onclick=()=>switchPage('tasks');
$('#search').oninput=e=>{query=e.target.value.trim();dataOffset=0;render();};
$('#project-filter').onchange=e=>{project=e.target.value;render();listTransition($(page==='journal'?'#records':'#tasks'));};
$('#clear-filter').onclick=()=>{project='';query='';$('#search').value='';render();};
$('#backup-open').onclick=$('#mobile-backup').onclick=()=>openDialog($('#backup'));
$('#export-json').onclick=async()=>{if(!ready)return notify(tr('数据尚未载入'));try{const backup=await api('/api/backup');download(tr`工作日志备份-${localDate()}.json`,JSON.stringify(backup,null,2),'application/json');notify(tr('备份已导出，包含附件'));}catch(e){notify(e.message);}};
$('#export-md').onclick=()=>{
 if(!ready)return notify(tr('数据尚未载入'));
 const content=tr('# 工作日志\n\n')+[...data.records].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(r=>tr`## ${r.date} ${r.time||tr('时间未注明')} · ${r.title}\n\n${r.details}\n\n项目：${r.project||tr('未分类')}；耗时：${r.durationMinutes?r.durationMinutes+tr(' 分钟'):tr('未填写')}；重点：${r.important?tr('是'):tr('否')}\n\n原文：\n${r.raw}\n`).join('\n')+tr('\n# 待办事项\n\n')+sortTasks(data.tasks).map(t=>tr`- [${t.status==='done'?'x':' '}] ${t.title}（${groups[t.status]}；截止：${t.due?(t.due+' '+(t.dueTime||tr('时间未定'))):tr('未设置')}）\n  ${t.notes}`).join('\n');
 download(tr`工作日志-${localDate()}.md`,content,'text/markdown;charset=utf-8');
};
$('#import-json').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  if(f.size>200_000_000)throw Error(tr('备份过大，上限 200 MB'));const imported=validateData(JSON.parse(await f.text()));
  if(confirm(tr`备份包含 ${imported.records.length} 条记录、${imported.tasks.length} 条待办。合并到当前数据？`)){
   const incoming={version:1,records:imported.records.filter(r=>!data.records.some(x=>x.id===r.id)),tasks:imported.tasks.filter(t=>!data.tasks.some(x=>x.id===t.id)),routines:(imported.routines||[]).filter(p=>!(data.routines||[]).some(x=>x.id===p.id))},files=new Map((imported.attachmentFiles||[]).map(f=>[f.id,f.content])),mapped=new Map();
   for(const entry of [...incoming.records,...incoming.tasks,...incoming.routines])for(let i=0;i<(entry.attachments||[]).length;i++){
    const a=entry.attachments[i];if(mapped.has(a.id)){entry.attachments[i]=mapped.get(a.id);continue;}
    if(files.has(a.id)){const encoded=files.get(a.id);if(typeof encoded!=='string'||encoded.length>28_000_000)throw Error(tr('附件数据过大'));const binary=atob(encoded),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(bytes.length!==a.size)throw Error(tr('备份附件大小不匹配'));const meta=await uploadFile(new File([bytes],a.name,{type:a.type}));mapped.set(a.id,meta);entry.attachments[i]=meta;}
    else if(!(await fetch('/api/attachments/'+a.id,{method:'GET'})).ok)throw Error(tr('备份缺少附件文件，请从原设备重新导出'));
   }
   await persist(mergeData(data,incoming),tr('备份已合并'));
  }
 }
 catch(err){notify(tr('导入失败：')+err.message);}finally{e.target.value='';}
};

recordEditor=new InlineEditor($('#record-composer'),'record',(item,edit)=>saveInline('record',item,edit));
const buildLabel=document.createElement('p');buildLabel.className='hint';buildLabel.id='app-version';buildLabel.textContent=tr`版本 ${VERSION} · ${window.workJournalDesktop?tr('桌面版'):tr('浏览器版')}`;$('#backup').append(buildLabel);
taskEditor=new InlineEditor($('#task-composer'),'task',(item,edit)=>saveInline('task',item,edit));
function showCaptured(origin,rows,before,next){
 if(page!==origin)return;
 if(origin==='today'){
  const frequencies=[...new Set(rows.filter(r=>r.kind==='plan').map(r=>r.plan?.repeatFrequency).filter(Boolean))];
  if(frequencies.length===1)todayFrequency=frequencies[0];
  return;
 }
 const journal=origin==='journal';if(!journal&&origin!=='tasks')return;
 const key=journal?'records':'tasks',previous=new Set(before[key].map(e=>e.id)),completed=new Set(rows.filter(r=>r.kind==='complete').map(r=>r.target));
 const saved=next[key].filter(e=>!previous.has(e.id)||(!journal&&completed.has(e.id)));if(!saved.length)return;
 if((query||project)&&saved.some(e=>!matches(e))){query='';project='';$('#search').value='';}
 if(journal){
  const [start,end]=recordRange||reviewRange(date,view),days=[...new Set(saved.map(r=>r.date))].sort();
  if(days[0]<start||days.at(-1)>end){date=days[0];view='day';recordRange=days.length===1?null:[days[0],days.at(-1)];}
 }else{
  const filters=new Set(saved.map(t=>['today','next'].includes(t.status)?'pending':t.status));
  if(!filters.has(taskFilter))taskFilter=filters.has('pending')?'pending':filters.values().next().value;
  if(taskUrgency&&saved.some(t=>deadlineTone(t)!==taskUrgency))taskUrgency='';
  if(taskRange&&saved.some(t=>!taskInRange(t,taskRange,false))){
   const days=[...new Set(saved.map(t=>taskWhen(t).date).filter(Boolean))];
   if(days.length===1){taskDate=days[0];taskView='day';taskRange=[taskDate,taskDate];}else taskRange=null;
  }
 }
}
async function saveCapture(rows,raw,editor,origin=page){
 const before=structuredClone(data),next=applyCapture(before,rows,raw,{attachments:editor.attachments,project:editor.form.elements.project?.value||'',autoSyncRecord:editor.form.elements.autoSyncRecord?.checked||false});
 if(origin==='today'){
  const existing=new Set(before.tasks.map(t=>t.id));
  for(const t of next.tasks)if(!existing.has(t.id)&&!t.routineId&&!t.due&&!t.scheduledDate)t.scheduledDate=localDate();
 }
 const labels={task:tr('待办事项'),record:tr('工作记录'),complete:tr('完成已有待办'),plan:tr('计划')},destinations=[...new Set(rows.map(r=>labels[r.kind]))];
 await persist(next,[tr`已保存 ${rows.length} 项`,...destinations].join(' · '),async()=>{await persist(mergeDataChanges(next,before,data),tr('已撤销'));},()=>showCaptured(origin,rows,before,next),true);focusFollowingTask(before);void track('save');
}
for(const editor of [recordEditor,taskEditor])editor.quickCapture=new CaptureEditor(editor,()=>data.tasks,saveCapture);
const manageLink=document.createElement('button');manageLink.type='button';manageLink.className='text-button composer-plan-link';manageLink.dataset.manageDaily='';manageLink.textContent=tr('管理计划');
installTaskGesture($('#tasks'),(id,row)=>changeTaskStatus(id,'done',row).catch(e=>notify(e.message)));
document.addEventListener('worklog-language-change',e=>{
 if(busy||recordEditor.saving||taskEditor.saving||recordEditor.uploading||taskEditor.uploading){e.preventDefault();notify(tr('请等待当前保存或上传完成'));return;}
 recordEditor.draft();taskEditor.draft();
 try{sessionStorage.setItem('worklog.return-page',page);sessionStorage.setItem('worklog.language-view',JSON.stringify({view,date,query,project,taskFilter,taskDate,taskView,taskRange,recordRange,historyDate,historyLayout,reportMode,reportUnit,reportTitle:reportMode?reportTitle:null,reportSelected:[...reportSelected],recordExpanded:!recordEditor.form.querySelector('.composer-fields').hidden,taskExpanded:!taskEditor.form.querySelector('.composer-fields').hidden}));}catch{}
});
if(languageView){recordEditor.expand(languageView.recordExpanded);taskEditor.expand(languageView.taskExpanded);}
installAppearance();hydrateIcons();installMotion();installAutosize();$('#today-label').textContent=prettyDate(localDate());render();
try{const loaded=await api('/api/data');data=loaded.data;revision=loaded.revision;ready=true;await refreshDaily();render();}catch(e){notify(e.message);$('#save-state').textContent=tr('数据读取失败，请刷新');}
window.chrome?.webview?.postMessage({type:'app-ready'});
try{usage=await api('/api/usage');if(!sessionStorage.getItem('journal-session')){await track('session');if(!usageError)sessionStorage.setItem('journal-session','1');}void track('today');}catch{usageError=tr('使用统计暂不可用。');}
setInterval(()=>{void refreshDaily().catch(e=>notify(e.message));updateCountdowns(data.tasks);if(page==='dashboard')renderDashboardPanel();if(page==='timeline')renderHistory();$('#today-label').textContent=prettyDate(localDate());},15000);
setInterval(()=>{void syncExternalData().catch(()=>{});},2000);
window.addEventListener('focus',()=>{void refreshDaily().catch(e=>notify(e.message));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateCountdowns(data.tasks);void refreshDaily().catch(e=>notify(e.message));}});

