import {addDays,localDate,parseDate,validDate} from './dates.js';
import {hasReminderTime} from './plan-reminders.js';
import {taskFields} from './task-content.js';
import {setTaskStatus} from './task-time.js';
import {syncTaskRecord} from './task-record.js';
import {saveDailyPlan} from './daily.js';
import {readCapturePlan} from './capture-plan.js';
import {parseCaptureTiming} from './capture-time.js';
import {captureClauses,capturePriority,taskAction,captureChain} from './capture-clauses.js';
import {validateData} from './model.js';
import {assertTaskReady} from './task-dependencies.js';
import {tr} from './i18n.js';
export {capturePlanLabel} from './capture-plan.js';

// Small bilingual prototype classifier. Unknown or close matches require review.
const examples={
 record:['刚从图书馆回来','笔记已经整理好了','给老师回过邮件了','和小组讨论了方案','交上去了','作业写好了','搞定实验报告','做完了练习','finished the report','sent the email','reviewed the design','met with the team','submitted the assignment'],
 task:['记得带上资料','抽空找老师聊聊','有空把笔记整理一下','买一本笔记本','回头再查一下','还得练习演讲','准备明天的汇报','pick up the books','need to revise the slides','remember to email my tutor','follow up with the team','prepare for the meeting']
};
const norm=t=>t.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function grams(t){const s=norm(t),g=new Set();for(let i=0;i<s.length-1;i++)g.add(s.slice(i,i+2));return g;}
function similarity(a,b){let n=0;for(const x of a)if(b.has(x))n++;return 2*n/(a.size+b.size||1);}
const anchors=Object.entries(examples).map(([kind,list])=>[kind,list.map(grams)]);
function classify(t){const g=grams(t),scores=anchors.map(([k,list])=>[k,Math.max(...list.map(a=>similarity(a,g)))]).sort((a,b)=>b[1]-a[1]);return scores[0][1]>=.42&&scores[0][1]-scores[1][1]>.13?scores[0][0]:'review';}
const dayRe=/(20\d\d[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}[日号]?|大后天|后天|明天|今天|昨天|前天|(?:下|本|这)?(?:周|星期)[一二三四五六日天]|\b(?:tomorrow|today|yesterday|(?:next )?(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b)/i;
function readDay(m,base,past=false){if(!m)return '';const d=m[0].toLowerCase(),fixed=d.match(/^(?:(20\d\d)[-/年])?(\d{1,2})[-/月](\d{1,2})/);if(fixed){const date=(fixed[1]||base.slice(0,4))+'-'+fixed[2].padStart(2,'0')+'-'+fixed[3].padStart(2,'0');return validDate(date)?date:'';}
 const rel={'今天':0,today:0,'明天':1,tomorrow:1,'后天':2,'大后天':3,'昨天':-1,yesterday:-1,'前天':-2};if(d in rel)return addDays(base,rel[d]);
 const w='一二三四五六日'.indexOf(d.slice(-1).replace('天','日')),en=['mon','tue','wed','thu','fri','sat','sun'];const idx=w<0?en.indexOf(d.replace('next ','').slice(0,3)):w,cur=(parseDate(base).getDay()+6)%7;let delta=idx-cur;if(/^(下|next )/.test(d))delta+=7;else if(!/^[本这]/.test(d)){if(past&&delta>0)delta-=7;if(!past&&delta<0)delta+=7;}return addDays(base,delta);}
function clock(t){const m=t.match(/(凌晨|上午|早上|下午|晚上|中午)?\s*(\d{1,2})(?:[:：](\d{2})|点(半|\d{1,2}分?)?)/);if(!m)return /中午前|by noon/i.test(t)?'12:00':'';let h=+m[2];const min=m[3]?+m[3]:m[4]==='半'?30:parseInt(m[4]||0);if(/下午|晚上/.test(m[1]||'')&&h<12)h+=12;return h<24&&min<60?String(h).padStart(2,'0')+':'+String(min).padStart(2,'0'):'';}
const normalizeAction=t=>norm(t.replace(/^(?:我)?(?:刚刚|刚才|刚|已经|已|终于|把|我)+/g,'').replace(/(?:完毕|好了|完了|完成了|了)[。！!]?$/,'').replace(/\b(sent|finished|completed|submitted)\b/ig,x=>({sent:'send',finished:'finish',completed:'complete',submitted:'submit'})[x.toLowerCase()]));
export function candidates(text,tasks){const n=normalizeAction(text);if(n.length<2)return [];const g=grams(n);return tasks.filter(t=>['next','today'].includes(t.status)).map(t=>{const v=normalizeAction(t.title);return {id:t.id,title:t.title,score:v===n?1:similarity(g,grams(v))};}).filter(c=>c.score>=.48).sort((a,b)=>b.score-a.score).slice(0,6);}
// Strip instructions addressed to the editor, not mentions or actions like “记一下实验结果”.
const captureLead=/^(?:(?:(?:麻烦|请)(?:你)?\s*)?(?:帮我|给我|替我)\s*(?:记录|记)\s*(?:一下(?!子)|一笔|下来|下(?!来))(?![的了])|(?:请(?:你)?\s*)?(?:我(?:先)?\s*)?(?:记录|记)(?:一下|一笔)(?=\s*[,，:：、。；;！!]|$)|(?:please\s+)?(?:make a note(?:\s+that\b|(?=\s*[:,]))|note to self(?=\s*:)|jot this down\b))[\s,，:：、。；;！!]*/i;
const onlyWhen=/^(?:我(?:想|要|打算)?\s*)?(?:(?:大后天|后天|明天|今天|昨天|前天|(?:下|本|这)?(?:周|星期)[一二三四五六日天]|[今明昨](?=[早晚晨夜]))\s*)?(?:(?:凌晨|清晨|早晨|早上|早|上午|中午|下午|傍晚|晚上|晚|夜里)\s*)?(?:(?:\d{1,2}|[零一二两三四五六七八九十]+)(?:[:：]\d{1,2}(?:钟)?|[点时](?:钟|半|[零一二三四五六七八九十\d]+分)?))?\s*(?:想要|打算|需要|准备|要)?\s*[.…。]*$/;
export function captureStatement(clause){
 let value=clause.trim(),rest=value.replace(captureLead,'').trim();
 while(rest!==value){value=rest;rest=value.replace(captureLead,'').trim();}
 return onlyWhen.test(value)||/^(?:tonight|(?:today|tomorrow|yesterday)(?:\s+(?:morning|afternoon|evening|night))?)[.!…]*$/i.test(value)?'':value;
}
export function propose(raw,tasks=[],base=localDate()){
 const parts=captureChain(captureStatement(raw));
 if(parts){
  const rows=[];
  for(const [i,part] of parts.entries()){
   const parsed=proposeSimple(part,tasks,base);
   if(parsed.length!==1||parsed[0].kind==='plan'||parsed[0].guarded)return proposeSimple(raw,tasks,base);
   const row={...parsed[0],kind:'task',when:parsed[0].when==='event'?'scheduled':parsed[0].when,candidates:[],target:'',source:part};
   row.text=taskAction(row.text).replace(/^(写|读|背|做|学|整理|检查)完/,'$1');
   if(i){
    const previous=rows[i-1],subject=previous.text.replace(/^(?:先|我)?(?:写|读|背|做|学|整理|准备|完成|修改|检查)\s*/,'').trim();
    if(subject!==previous.text&&/^(?:检查|复查|核对)(?:一遍|一下|一次)?$/.test(row.text))row.text=row.text.replace(/(?:一遍|一下|一次)$/,'')+subject;
    const english=previous.text.match(/^(?:write|read|complete|finish)\s+(.+)$/i);if(english&&/\bit\b/i.test(row.text))row.text=row.text.replace(/\bit\b/i,english[1]);
    row.afterIndex=i-1;
    if(!row.date&&!row.time&&previous.date){row.date=previous.date;row.time=previous.time;row.when=previous.when;row.period=previous.period;}
   }
   rows.push(row);
  }
  return rows;
 }
 return proposeSimple(raw,tasks,base);
}
function proposeSimple(raw,tasks=[],base=localDate()){
 const rows=[];let subject='',context=null,previousGroup=-1;
 const clauses=captureClauses(raw.trim()).map(c=>({...c,text:captureStatement(c.text)})).filter(c=>c.text);
 for(const {text:source,group} of clauses){
  if(group!==previousGroup){context=null;previousGroup=group;}
  const metadata=capturePriority(source);
  let t=metadata.text,correction=t.match(/^(?:本来|原本|原先)(?:说|打算)?(.+?)[，,。]?\s*(?:现在)?(?:改到|改为|改成|改)(.+)$/);
  if(correction){const old=correction[1].replace(dayRe,'').replace(/^[要说]|[，,]$/g,'').trim();t=correction[2]+old;}
  if(/先别管|暂时不(?:用|做|管)|不用(?:再)?(?:发|交|打印|做)|不需要(?:再)?(?:发|交|打印|做)|\b(?:ignore|skip for now|no need to)\b/i.test(t))continue;
  let recurring=readCapturePlan(t,base);
  if(!recurring&&context?.plan&&!dayRe.test(t)){
   const p=context.plan,prefix=({daily:'每天',weekly:'每周',monthly:'每月'})[p.repeatFrequency];
   const inherited=readCapturePlan(prefix+' '+t,base);
   if(inherited?.kind==='plan'){
    const ownSchedule=/\d\s*[:：]|[点时]|(?:\d|[一二两三四五六七八九十])\s*(?:次|篇|遍)|\b(?:once|twice|times?)\b/i.test(t);
    inherited.plan=ownSchedule?{...inherited.plan,startDate:p.startDate,endDate:p.endDate,weekdaysOnly:p.weekdaysOnly}:structuredClone(p);recurring=inherited;
   }
  }
  if(recurring){recurring.source=source;if(metadata.priority)recurring.priority=metadata.priority;rows.push(recurring);context=recurring.kind==='plan'?{plan:recurring.plan,kind:'task'}:null;continue;}
  const last=rows.at(-1);
  const review=/[？?]|如果|要是|也许|可能|不确定|好像|本来|是不是|有没有|是否|差点|没能|原计划|每[天周月星期]|这周.{0,8}(?:[几一二三四五六七\d]+天|次)|\b(if|maybe|every|might)\b/i.test(t);
  const neg=/还没|没有|尚未|没(?:有)?(?:交|发|写|做|改|完成)|\b(?:not yet|haven't|didn't)\b/i.test(t);
  const done=/完了|过了|完成(?:了|$)|已经|已(?:交|发|做|写|改|提交)|(?:改|写|做|发|交|删|补|看|去|听|讨论|提交|联系|见到|见|读|学|整理|处理|背|开|打|跑|吃|修|复习)(?:完|好|过|给)?.{0,25}了|(?:发|交)给.{1,25}了|\b(?:finished|sent|submitted|completed|met|reviewed)\b/i.test(t);
  const dayMatch=t.match(dayRe);
  const day=readDay(dayMatch,base,done&&!neg),ownTiming=parseCaptureTiming(t,base,day||context?.date||'');
  const explicitDone=/已经|已(?:交|发|做|写|改|提交)|刚刚|刚才|\b(?:already|just)\b/i.test(t);
  const timing=ownTiming||(context?.date&&!dayMatch&&!(context.kind==='task'&&explicitDone)?{...context,text:t}:null);
  if(timing&&!timing.text)continue;
  const prospective=/^(?:我\s*)?(?:想要|打算|需要|准备|要(?!求))|(?:之前|以前|截止|[点分\d]前)\s*(?:要|把)|\b(?:need to|must|have to)\b/i.test(t)
   ||day&&day>base||context?.kind==='task'&&!dayMatch&&!explicitDone;
  let kind=review?'review':neg||prospective?'task':done?'record':timing||dayMatch||/待办|提醒我|记得|还要|需要|准备|打算|得去|要做|截止|计划|\b(?:need to|remember|due|by)\b/i.test(t)?'task':classify(t);
  if(kind==='record'&&last?.kind==='record'&&!dayMatch&&/^(?:删|补|加|给.{0,8}补)/.test(t)){last.text+='；'+t;last.source+='；'+source;continue;}
  const date=timing?.date||day,time=timing?timing.time:clock(t),period=timing?.period||'';
  const deadline=timing?timing.when==='due':/(?:截止|最晚|到期|之前|以前|[日天五四三二一六末午晚点分\d]前|\bby\b|\bdue\b)/i.test(t);
  const label=t.match(/(?:组会\s*)?\b(?:PPT|PDF|Excel|Word)\b|实验报告|演讲稿|设计稿/i)?.[0];if(label)subject=label;
  let text=(timing?timing.text:t).replace(/^我(?=(?:刚刚|刚才|刚|已经|完成|提交|打算|需要|要(?!求)|想要|(?:把|给|写|读|背|交|发|改|做|去|看|整理|练习|复习)))/,'');
  if(kind==='task')text=taskAction(text);
  if(subject&&!label&&/发给|交给/.test(text))text=text.replace(/(发给|交给)/,'把 '+subject+' $1');
  const options=kind==='record'?candidates(text,tasks):[];
  if(options.length)kind=options.length===1&&options[0].score===1?'complete':'choose';
  const row={kind,text,source,candidates:options,target:kind==='complete'?options[0].id:'',date:date||(kind==='record'?base:''),time,period,when:kind==='record'?'event':deadline||correction&&/交|到期|截止/.test(t)?'due':'scheduled',guarded:review||neg,...(metadata.priority?{priority:metadata.priority}:{}),...(timing?.scheduledDate?{scheduledDate:timing.scheduledDate,scheduledTime:timing.scheduledTime}: {})};
  rows.push(row);
  if(!row.guarded)context={kind:row.kind,date:row.date,time:row.time,period:row.period,when:row.when,...(row.scheduledDate?{scheduledDate:row.scheduledDate,scheduledTime:row.scheduledTime}:{})};
 }
 return rows;
}
export function applyCapture(data,rows,raw,{at=new Date().toISOString(),attachments=[],autoSyncRecord=false,project=''}={}){
 let next=structuredClone(data);const day=localDate(new Date(at)),seen=new Set();
 if(!rows.length)throw Error(tr('没有可保存的事项'));
 const keys=rows.map((r,i)=>r.previewKey||'capture-'+i),ids=rows.map(()=>crypto.randomUUID());
 if(new Set(keys).size!==keys.length)throw Error(tr('请检查后续任务的顺序'));
 const predecessors=rows.map((r,i)=>{
  if(r.afterIndex!==undefined&&r.afterIndex!==null&&r.afterIndex!==-1&&(!Number.isInteger(r.afterIndex)||r.afterIndex<0||r.afterIndex>=i))throw Error(tr('请检查后续任务的顺序'));
  const key=r.afterKey||(Number.isInteger(r.afterIndex)&&r.afterIndex>=0?keys[r.afterIndex]:'');
  if(!key)return '';
  const previous=keys.indexOf(key);
  if(r.kind!=='task'||previous<0||previous>=i||rows[previous].kind!=='task')throw Error(tr('前一步未保存，请重新选择后续任务的前一步'));
  return ids[previous];
 });
 for(const [rowIndex,r] of rows.entries()){
  if(!r.text.trim()||!['record','task','complete','plan'].includes(r.kind))throw Error(tr('请先选择这条内容的去向'));
  if(r.date&&!validDate(r.date))throw Error(tr('请检查日期'));
  if(r.kind==='complete'){
   const i=next.tasks.findIndex(t=>t.id===r.target),t=next.tasks[i];if(!t||!['next','today'].includes(t.status)||!r.candidates.some(c=>c.id===t.id&&c.title===t.title)||seen.has(t.id))throw Error(tr('待办已变化，请重新选择'));
   assertTaskReady(t,next.tasks);seen.add(t.id);next.tasks[i]={...setTaskStatus(t,'done',at),captureRaw:raw,completionNote:r.text,attachments:[...(t.attachments||[]),...attachments.filter(a=>!(t.attachments||[]).some(o=>o.id===a.id))]};syncTaskRecord(next,next.tasks[i]);continue;
  }
  const common={id:ids[rowIndex],createdAt:at,project,attachments:structuredClone(attachments),...(r.period?{timePeriod:r.period}:{})};
  if(r.kind==='record'){
   const o=r.recordOptions||{};
   next.records.push({...common,title:o.title?.trim()||r.text.slice(0,80),details:r.text,raw,date:r.date||day,time:r.time||'',suggestions:[],
    ...(o.durationMinutes!=null&&o.durationMinutes!==''?{durationMinutes:Number(o.durationMinutes)}:{}),...(o.effort?{effort:o.effort}:{}),...(typeof o.important==='boolean'?{important:o.important}:{})});
   continue;
  }
  const o=r.taskOptions||{},task={...common,...taskFields(r.text),captureRaw:raw,status:['today','paused'].includes(o.status)?o.status:'next',priority:r.priority||o.priority||'normal',recordId:o.recordId||'',startedAt:o.startedAt||at,completedAt:'',autoSyncRecord};
  if(r.kind==='plan'){
   const p=r.plan;if(!p)throw Error(tr('请检查计划次数和提前显示时间'));
   const plan={...task,planVersion:2,repeatFrequency:p.repeatFrequency,weekdaysOnly:p.weekdaysOnly??false,scheduling:p.scheduling,targetCount:p.targetCount,slots:p.slots,leadMinutes:p.leadMinutes??0,remind:p.remind??false,startDate:p.startDate||r.date||day,endDate:p.endDate||'',scheduleOnly:p.scheduleOnly===true,...(p.period?{timePeriod:p.period}:{}),due:'',dueTime:'',active:true};
   validateData({version:1,records:[],tasks:[],routines:[plan]});
   next=saveDailyPlan(next,plan,day,at);continue;
  }
  if(r.remind===true&&['due','scheduled'].includes(r.when)&&hasReminderTime(r.date,r.time))task.remind=true;
  next.tasks.push({...task,...(predecessors[rowIndex]?{afterTaskId:predecessors[rowIndex]}:{}),due:r.when==='due'?r.date:'',dueTime:r.when==='due'&&r.date?r.time:'',scheduledDate:r.scheduledDate||(r.when==='scheduled'?r.date:''),scheduledTime:r.scheduledTime||(r.when==='scheduled'&&r.date?r.time:'')});
 }
 return validateData(next);
}
