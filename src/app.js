import {tr,localizeStatic} from './lib/i18n.js';
import {installAppearance} from './lib/theme.js';
import {localDate,prettyDate,rangeFor,movePeriod,parseDate,monthLabel} from './lib/dates.js';
import {emptyData,mergeData,validateData} from './lib/model.js';
import {esc,icon,hydrateIcons,notify,api,download} from './lib/ui.js';
import {renderRecords,calendarHTML} from './components/records.js';
import {renderTasks,groups} from './components/tasks.js';
import {sortTasks,updateCountdowns} from './lib/deadlines.js';
import {installMotion,refreshMotion,composerEntrance,newTaskFeedback,pageTransition,transitionPage,openDialog,closeDialog,listTransition,beginProcessing,taskCompletion,jellyRelease,waitForJelly} from './lib/motion.js';
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
import {materializeDaily,saveDailyPlan,routineActive,isReleased} from './lib/daily.js';
import {renderToday,renderDailyPlans} from './components/today.js';
import {VERSION} from './lib/version.js';

localizeStatic();
const $=s=>document.querySelector(s);
const markupCache=new WeakMap();
function markup(selector,html){const node=$(selector);if(markupCache.get(node)!==html){const open=[...node.querySelectorAll('details[data-disclosure][open]')].map(d=>d.dataset.disclosure);node.innerHTML=html;open.forEach(key=>{const d=node.querySelector('[data-disclosure="'+key+'"]');if(d)d.open=true;});markupCache.set(node,html);}}
let data=emptyData(),revision=0,page='today',view='day',date=localDate(),query='',project='',taskFilter='pending';
try{const back=sessionStorage.getItem('worklog.return-page');sessionStorage.removeItem('worklog.return-page');if(['today','journal','tasks','timeline','dashboard','settings'].includes(back))page=back;}catch{}
let ready=false,busy=false,todayFrequency='daily',todayManaging=false;
let reminded=new Set();try{reminded=new Set(JSON.parse(localStorage.getItem('worklog.reminded')||'[]'));}catch{}
let usage=null,usageError='',statDays=14,loadDate=localDate(),dataTab='records',dataOffset=0,dateOrder='asc';
async function track(event){try{usage=await api('/api/usage',{method:'POST',body:JSON.stringify({event})});usageError='';}catch{usageError=tr('使用统计暂不可用，记录仍可正常使用。');}if(page==='dashboard')renderDashboardPanel();}
function renderDashboardPanel(){const scroll=$('.load-chart-scroll')?.scrollLeft||0;markup('#dashboard-page',renderDashboard(data,usage,{days:statDays,selected:loadDate,collection:dataTab,query,project,offset:dataOffset,error:usageError}));$('.load-chart-scroll').scrollLeft=scroll;refreshMotion();}
const uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),draftKey='liubai-draft-v1';
let recordEditor,taskEditor,calendarDate=localDate(),calendarMode='calendar',calendarUnit='day',calendarLayout='rows',recordRange=null,taskRange=[localDate(),localDate()];
let taskDate=localDate(),taskView='day',historyDate=localDate(),historyLayout='horizontal';
let reportMode=false,reportUnit='item',reportTitle=tr('工作汇报'),reportSelected=new Set();
let languageView;
try{languageView=JSON.parse(sessionStorage.getItem('worklog.language-view'));sessionStorage.removeItem('worklog.language-view');if(languageView){({view,date,query,project,taskFilter,taskDate,taskView,taskRange,recordRange,historyDate,historyLayout,reportMode,reportUnit}=languageView);reportTitle=languageView.reportTitle??reportTitle;reportSelected=new Set(languageView.reportSelected||[]);$('#search').value=query;}}catch{}

function visibleReportEntries(){const [start,end]=rangeFor(historyDate,'month');return timelineItems(data.records.filter(matches),data.tasks.filter(matches)).filter(e=>!e.date||(e.date>=start&&e.date<=end));}
function renderHistory(){
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

function render(){
 closeEntryMenu();
 if(ready){recordEditor?.reconcile(data.records);taskEditor?.reconcile([...data.tasks,...(data.routines||[])]);}
 const journal=page==='journal';
 for(const name of ['today','journal','tasks','timeline','dashboard','settings'])$('#'+name+'-page').hidden=page!==name;
 const pageName={today:tr('今日'),journal:tr('工作记录'),tasks:tr('待办事项'),timeline:tr('时间线'),dashboard:tr('数据后台'),settings:tr('设置')}[page];
 $('#breadcrumb').textContent=pageName;$('#page-title').textContent=page==='today'?tr('今天该做些什么'):pageName;
 $('.searchbar').hidden=page==='today'||page==='settings';
 document.documentElement.dataset.activePage=page;
 $('#page-subtitle').textContent=page==='today'?prettyDate(localDate()):journal?tr`${data.records.length} 条记录 · 按发生时间归档`:page==='tasks'?tr`${data.tasks.filter(t=>['next','today'].includes(t.status)&&(!t.routineId||routineActive(t))).length} 项待处理`:page==='timeline'?tr('过去的记录与未来的安排'):page==='settings'?tr('按你的习惯来。'):tr('使用统计 · 工作负荷 · 数据管理');
 $('.sidebar nav').dataset.current=page;
 document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 document.querySelectorAll('[data-task-view]').forEach(b=>{const selected=Boolean(taskRange)&&b.dataset.taskView===taskView;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-task-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.taskFilter===taskFilter);b.setAttribute('aria-pressed',String(b.dataset.taskFilter===taskFilter));});
 $('#journal-range').value=view;$('#task-range').value=taskRange?taskView:'all';
 $('#task-count').textContent=data.tasks.filter(t=>['today','next'].includes(t.status)&&(!t.routineId||routineActive(t))).length;
 const matchedTasks=data.tasks.filter(t=>matches(t)&&(!taskRange||!(t.routineDate||t.due)||(t.routineId?((t.routineEnd||t.routineDate)>=taskRange[0]&&t.routineDate<=taskRange[1]):(t.due>=taskRange[0]&&t.due<=taskRange[1]))));$('#clear-task-date').hidden=true;
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
 markup('#records',view==='day'||query?renderRecords(records,data.tasks,recordRange?'week':view,Boolean(query||project),data.records.length===0,dateOrder):renderRetrospective(records,date,view));
 renderCalendar();
 $('#review-title').textContent=query?tr('搜索结果汇总'):{day:tr('当日汇总'),week:tr('本月记录'),month:tr('年度记录')}[view];
 const projects=[...new Set(records.map(r=>r.project||tr('未分类')))];
 markup('#review',records.length?tr`<div class="review-number">${records.length}<span>条记录 · ${projects.length} 个分类</span></div>${projects.map(p=>`<div class="review-project"><strong>${esc(p)}</strong>${records.filter(r=>(r.project||tr('未分类'))===p).slice(0,4).map(r=>`<button data-link-record="${esc(r.id)}">${esc(r.title)} <span>↗</span></button>`).join('')}</div>`).join('')}`:tr('<div class="review-number">0<span>条记录</span></div><p class="hint">所选时段暂无记录。</p>'));
 const next=sortTasks(data.tasks.filter(t=>(t.status==='today'||t.status==='next')&&(!t.routineId||routineActive(t)))).slice(0,3);
 markup('#next-tasks',next.length?next.map(t=>`<button class="next-task" data-complete-task="${esc(t.id)}"><span class="mini-square"></span><span>${esc(t.title)}<small>${t.due?esc(t.due+' '+(t.dueTime||'')):tr('未设截止时间')}</small></span></button>`).join(''):tr('<p class="muted small">暂无待办</p>'));
 markup('#tasks',renderTasks(matchedTasks,taskFilter,dateOrder));
 const plansOpen=$('.daily-plans')?.open;markup('#daily-plans',renderDailyPlans(data.routines));if(plansOpen)$('.daily-plans').open=true;
 if(page==='today')markup('#today-page',ready?renderToday(data,localDate(),{frequency:todayFrequency,manage:todayManaging}):tr('<p class="hint">正在读取今日安排…</p>'));if(page==='dashboard')renderDashboardPanel();if(page==='timeline')renderHistory();projectOptions();taskEditor?.records(data.records);refreshMotion();
}

function switchPage(next){
 if(page===next)return;
 const order=['today','journal','tasks','timeline','dashboard','settings'],direction=order.indexOf(next)>order.indexOf(page)?1:-1;
 page=next;transitionPage(()=>{render();window.scrollTo({top:0,behavior:'instant'});},direction);if(next!=='settings')void track(next);
}

let dailyDay='';
async function refreshDaily(){
 if(!ready||busy)return;
 const day=localDate(),next=materializeDaily(data,day);
 if(next!==data)await persist(next,null);
 if(day!==dailyDay){dailyDay=day;$('#today-label').textContent=prettyDate(day);}if(page==='today'&&!todayManaging)render();checkPlanReminders();
}
function checkPlanReminders(){
 const day=localDate(),due=data.tasks.filter(t=>t.remind&&t.scheduledAt&&['next','today'].includes(t.status)&&t.routineDate>=day&&isReleased(t)&&!reminded.has(t.id)&&data.routines?.some(p=>p.id===t.routineId&&p.active));
 if(!due.length)return;
 due.forEach(t=>reminded.add(t.id));reminded=new Set([...reminded].slice(-2000));try{localStorage.setItem('worklog.reminded',JSON.stringify([...reminded]));}catch{}
 const message=due.slice(0,3).map(t=>t.dueTime+' · '+t.title).join(' / ');
 notify(message);
 if(window.workJournalPlatform==='windows')window.chrome?.webview?.postMessage({type:'plan-reminder',message});
 else if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Work Log',{body:message});
}
async function persist(next,message=tr('已保存'),undo,beforeRender){
 if(!ready)throw Error(tr('数据尚未读取，无法保存'));if(busy)throw Error(tr('正在保存，请稍后'));busy=true;$('#save-state').textContent=tr('正在保存…');
 try{validateData(next);const result=await api('/api/data',{method:'PUT',body:JSON.stringify({data:next,revision})});data=next;revision=result.revision;if(beforeRender)await beforeRender();render();if(message)notify(message,undo);$('#save-state').innerHTML=tr('<i></i>已保存到本机');}
 catch(e){$('#save-state').textContent=tr('保存失败，请重试');throw e;}finally{busy=false;}
}
function openRecord(record){if(!record)return;if(page!=='journal'){page='journal';render();}recordEditor.edit(record);}
function openTask(task){if(!task)return;if(page!=='tasks'){page='tasks';render();}taskEditor.edit(task);}
async function saveInline(kind,item,editing){
 if(kind==='task'&&item.startDate&&item.repeatFrequency!=='none'){const applyCurrent=item.applyCurrent;delete item.applyCurrent;await persist(saveDailyPlan(data,item,localDate(),new Date().toISOString(),{applyCurrent}),tr('计划已保存')); void track('save');return;}
 if(kind==='task'&&item.status==='today'&&!item.scheduledDate)item.scheduledDate=localDate();
 const collection=kind==='record'?'records':'tasks',next=structuredClone(data);
 if(kind==='record'&&item.sourceTaskId)item.taskSyncOwned=false;
 if(editing){if(!next[collection].some(r=>r.id===item.id))throw Error(tr('这条内容已被删除，请重新新增'));next[collection]=next[collection].map(r=>r.id===item.id?item:r);}else next[collection].push(item);
 query='';project='';$('#search').value='';
 if(kind==='record'){date=item.date;view='day';recordRange=null;}else{syncTaskRecord(next,item);if(item.status==='done'&&item.completedAt){date=localMinute(item.completedAt).slice(0,10);view='day';recordRange=null;}taskDate=item.due||localDate();taskView='day';taskRange=[taskDate,taskDate];taskFilter=['today','next'].includes(item.status)?'pending':item.status;}
 await persist(next);void track('save');listTransition($(kind==='record'?'#records':'#tasks'));
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
  if(b.hasAttribute('data-new-today')){await newTaskFeedback(b);switchPage('tasks');taskEditor.form.scrollIntoView({block:'start',behavior:'smooth'});if(taskEditor.item){taskEditor.reset();taskEditor.restoreNewDraft();}taskEditor.fill({repeatFrequency:'none',status:'today'});taskEditor.draft();composerEntrance(taskEditor.form);$('#task-input').focus({preventScroll:true});return;}
  if(b.hasAttribute('data-manage-daily')){todayManaging=true;render();composerEntrance($('#today-page'));return;}
  if(b.hasAttribute('data-back-today')){todayManaging=false;render();return;}
  if(b.dataset.planFrequency){todayFrequency=b.dataset.planFrequency;render();return;}
  if(b.hasAttribute('data-new-daily')){if(page!=='tasks')switchPage('tasks');if(taskEditor.item){taskEditor.reset();taskEditor.restoreNewDraft();}taskEditor.fill({repeatFrequency:todayFrequency,startDate:localDate(),scheduling:'count',slots:[],targetCount:1});taskEditor.timingApplied=false;taskEditor.paint();taskEditor.expand(true);taskEditor.draft();taskEditor.form.scrollIntoView({block:'start',behavior:'smooth'});composerEntrance(taskEditor.form);$('#task-input').focus({preventScroll:true});return;}
  if(b.dataset.editDaily){const plan=data.routines?.find(p=>p.id===b.dataset.editDaily);if(plan)openTask(plan);return;}
  if(b.dataset.toggleDaily){const next=structuredClone(data),plan=next.routines.find(p=>p.id===b.dataset.toggleDaily);plan.active=!plan.active;await persist(materializeDaily(next),plan.active?tr('计划已恢复'):tr('计划已暂停，已有记录保留'));return;}
  if(b.dataset.deleteDaily){const next=structuredClone(data),plan=next.routines.find(p=>p.id===b.dataset.deleteDaily);next.routines=next.routines.filter(p=>p.id!==plan.id);await persist(next,tr('计划已删除，已有任务和记录保留'),async()=>{const restored=structuredClone(data);restored.routines??=[];if(!restored.routines.some(p=>p.id===plan.id))restored.routines.push(plan);await persist(restored,tr('计划已恢复'));});return;}
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
    if(entry.status!=='done')actions.push({label:tr('标记完成'),run:safe(()=>changeTaskStatus(id,'done'))});
    if(entry.status==='done'||entry.status==='paused')actions.push({label:tr('返回待处理'),run:safe(()=>changeTaskStatus(id,'next'))});
    else actions.push({label:entry.routineId?tr('跳过本次'):tr('搁置'),run:safe(()=>changeTaskStatus(id,'paused'))});
   }
   actions.push({label:tr('删除'),danger:true,run:safe(()=>removeEntry(collection,id))});openEntryMenu(b,actions);refreshMotion();return;
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
    const r=data.records.find(r=>r.id===b.dataset.linkRecord);if(!r)return notify(tr('关联记录已删除'));
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
 if(busy)return;
 const old=structuredClone(data.tasks.find(t=>t.id===id));if(!old)return;
 if(old.status===status)return;
 const priorRecords=structuredClone(data.records.filter(r=>r.sourceTaskId===id));
 const next=structuredClone(data);next.tasks=next.tasks.map(t=>t.id===id?setTaskStatus(t,status):t);syncTaskRecord(next,next.tasks.find(t=>t.id===id));
 if(status==='done'){date=localMinute(next.tasks.find(t=>t.id===id).completedAt).slice(0,10);view='day';recordRange=null;}
 await persist(next,status==='done'?(old.autoSyncRecord===false?tr('已完成'):tr('已完成，已加入工作记录')):status==='next'?tr('已返回待处理'):tr('已搁置'),async()=>{const restored=structuredClone(data);restored.tasks=restored.tasks.map(t=>t.id===id?{...t,status:old.status,completedAt:old.completedAt||''}:t);restored.records=restored.records.filter(r=>r.sourceTaskId!==id&&!priorRecords.some(p=>p.id===r.id));restored.records.push(...priorRecords);await persist(restored,tr('已撤销'));},row?()=>taskCompletion(row,status==='done'):undefined);
}

$('.brand').onclick=e=>{e.preventDefault();switchPage('today');};
$('#calendar-open').onclick=$('#task-calendar-open').onclick=openCalendar;
$('#view-date').onchange=e=>{if(e.target.value)selectCalendar(e.target.value);};
$('#record-order').onchange=e=>{dateOrder=e.target.value;render();};
$('#journal-range').onchange=e=>{view=e.target.value;recordRange=null;render();};
$('#task-range').onchange=e=>{if(e.target.value==='all')taskRange=null;else{taskView=e.target.value;taskRange=rangeFor(taskDate,taskView);}render();};
$('#clear-task-date').onclick=()=>{taskRange=null;render();};
$('#task-today').onclick=()=>{taskDate=localDate();taskView='day';taskRange=[taskDate,taskDate];render();};
document.addEventListener('change',e=>{if(e.target.id==='load-date'&&e.target.value){loadDate=e.target.value;renderDashboardPanel();}});
document.addEventListener('change',e=>{if(e.target.id==='history-layout'){historyLayout=e.target.value;renderHistory();}});
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
const plansHost=document.createElement('div');plansHost.id='daily-plans';taskEditor.form.querySelector('.composer-fields').append(plansHost);
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
setInterval(()=>{void refreshDaily().catch(e=>notify(e.message));if(page==='tasks')updateCountdowns(data.tasks);$('#today-label').textContent=prettyDate(localDate());},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateCountdowns(data.tasks);void refreshDaily().catch(e=>notify(e.message));}});

