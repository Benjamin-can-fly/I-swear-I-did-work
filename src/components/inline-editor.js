import {DeadlineControls} from './deadline-controls.js';
import {PlanControls} from './plan-controls.js';
import {tr,locale} from '../lib/i18n.js';
import {esc,icon,notify} from '../lib/ui.js';
import {localDate,addDays,parseDate,validDate} from '../lib/dates.js';
import {localMinute} from '../lib/task-time.js';
import {taskContent,taskFields} from '../lib/task-content.js';
import {attachmentList,uploadFile} from '../lib/attachments.js';
import {resizeTextareas} from '../lib/autosize.js';
import {refreshMotion,jellyRelease,waitForJelly,scatterIcon} from '../lib/motion.js';
const glyph='<span class="assemble-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const placeholders={title:tr('给这件事起个名，也可以留空'),project:tr('比如：毕业论文'),durationMinutes:tr('大概花了几分钟？')};
const field=(label,name,type='text',attrs='')=>`<label class="form-field">${label}<input name="${name}" type="${type}" placeholder="${esc(placeholders[name]||'')}" ${attrs}></label>`;
const select=(label,name,values)=>`<label class="form-field">${label}<select name="${name}">${values.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
export class InlineEditor{
 constructor(root,kind,save){
  this.root=root;this.kind=kind;this.save=save;this.key=`journal-inline-${kind}-v1`;this.item=null;this.attachments=[];this.uploading=false;this.timingApplied=true;this.timingEdited=false;const record=kind==='record';
  root.innerHTML=tr`<form id="${kind}-form" class="composer panel inline-composer"><div class="section-kicker">${icon('pen')}<span class="composer-title">新增${record?tr('记录'):tr('待办')}</span><button type="button" class="icon-button cancel-edit" hidden aria-label="取消编辑">×</button></div><textarea id="${record?'raw-input':'task-input'}" name="content" maxlength="${record?20000:20201}" placeholder="${record?tr('输入做过的事，包括过程和结果。'):tr('输入要做的事和补充说明。')}" aria-label="${record?tr('工作记录内容'):tr('待办内容')}"></textarea><div class="editor-attachments"></div><div class="composer-tools"><label class="text-button file-button attachment-upload">${icon('download')}添加图片或文件<input type="file" multiple aria-label="添加图片或文件"></label><span class="draft-state" role="status"></span>${record?'':tr('<label class="sync-option" title="完成后生成记录，修改、回退和删除时同步。关闭会撤回已同步的记录。"><input type="checkbox" name="autoSyncRecord" role="switch"><span class="sync-track" aria-hidden="true"></span><span>自动同步至工作记录</span></label>')}<button type="button" class="text-button expand-fields" aria-expanded="false"><span class="expand-label">更多选项</span><svg class="expand-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button></div><div class="composer-fields" hidden>${record?field(tr('标题 · 可留空'),'title','text','maxlength="200"'):''}<div class="form-grid">${field(tr('项目 · 可留空'),'project','text','list="project-options" maxlength="80"')}${record?field(tr('实际耗时 · 分钟'),'durationMinutes','number','min="1" max="1440" step="1"'):select(tr('优先级'),'priority',[['normal',tr('普通')],['high',tr('优先')],['low',tr('较低')]])}</div>${record?tr`<div class="form-grid">${select(tr('投入程度'),'effort',[['auto',tr('按内容估算')],['light',tr('较轻')],['normal',tr('一般')],['high',tr('较高')]])}<label class="important-field"><input type="checkbox" name="important">设为重点</label></div>`:tr`<div class="form-grid">${select(tr('状态'),'status',[['next',tr('待处理')],['today',tr('今天要做')],['paused',tr('已搁置')],['done',tr('已完成')]])}${field(tr('开始时间 · 可修改'),'startedAt','datetime-local')}</div><div class="form-grid">${field(tr('完成时间 · 完成时自动记录'),'completedAt','datetime-local')}<label class="form-field">关联记录<select name="recordId"><option value="">不关联</option></select></label></div>`}</div><div class="composer-footer"><div class="composer-meta"><div class="inline-date-control"><span class="date-field-label">${record?tr('发生日期'):tr('截止日期')}</span><button type="button" class="icon-button" data-inline-date-shift="-1" aria-label="日期前一天">‹</button><input id="${record?'entry-date':'task-due'}" name="${record?'date':'due'}" type="date" aria-label="${record?tr('发生日期'):tr('截止日期')}"><button type="button" class="icon-button" data-inline-date-shift="1" aria-label="日期后一天">›</button><select class="inline-weekday" aria-label="选择星期"><option value="">星期</option>${[tr('一'),tr('二'),tr('三'),tr('四'),tr('五'),tr('六'),locale()==='en'?'Sun':tr('日')].map((w,i)=>tr`<option value="${i}">周${w}</option>`).join('')}</select></div><label class="inline-time-control">时间<input name="${record?'time':'dueTime'}" type="time" step="60" aria-label="${record?tr('发生时间'):tr('截止时间')}"></label><button type="button" class="apply-time" aria-pressed="true"><span class="apply-indicator" aria-hidden="true"></span>应用</button><span class="time-application-note"></span></div><button type="submit" id="${record?'organize':'new-task'}" class="primary">${glyph}<span class="action-label">保存${record?tr('记录'):tr('待办')}</span><span class="shortcut" title="Enter 保存，Ctrl + Enter 换行">Enter ↵</span></button></div></form>`;
  this.form=root.querySelector('form');
  if(!record)this.planControls=new PlanControls(this);
  // Keep everyday entry to one text area and one action row. Existing controls
  // move intact into the options panel, so their values and handlers survive.
  const options=this.form.querySelector('.composer-fields'),footer=this.form.querySelector('.composer-footer');
  const meta=this.form.querySelector('.composer-meta');
  if(record)options.prepend(meta);else this.form.insertBefore(meta,options);
  const sync=this.form.querySelector('.sync-option');if(sync)options.prepend(sync);
  if(!record){
   const plans=document.createElement('section');plans.className='composer-plan-settings';
   for(const selector of ['.repeat-option','.plan-count','.plan-times','.plan-time-summary','.plan-options'])plans.append(this.form.querySelector(selector));
   options.append(plans);
  }
  footer.prepend(this.form.querySelector('.composer-tools'));
  const context=document.createElement('span');context.className='composer-context';this.form.querySelector('.composer-title').after(context);
  this.form.querySelector('textarea').placeholder=record?tr('刚做了什么？'):tr('有什么要做的？');
  if(!record)this.deadlineControls=new DeadlineControls(this);
  this.reset(false);
  const cancel=this.form.querySelector('.cancel-edit');cancel.textContent=tr('取消编辑');cancel.classList.replace('icon-button','text-button');
  const clear=document.createElement('button');clear.type='button';clear.className='icon-button clear-composer';clear.setAttribute('aria-label',tr('清空输入'));clear.title=tr('清空当前输入，保留时间应用与同步开关');clear.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';this.form.querySelector('.section-kicker').append(clear);clear.onclick=()=>this.clearInput();
  const dateInput=this.form.elements[record?'date':'due'],weekday=this.form.querySelector('.inline-weekday');
  dateInput.addEventListener('input',()=>this.syncWeekday());dateInput.addEventListener('change',()=>this.syncWeekday());
  this.form.querySelectorAll('[data-inline-date-shift]').forEach(button=>button.onclick=()=>{dateInput.value=addDays(dateInput.value||localDate(),Number(button.dataset.inlineDateShift));this.timingEdited=true;this.syncWeekday();this.draft();});
  weekday.onchange=()=>{if(weekday.value==='')return;const base=dateInput.value||localDate(),day=(parseDate(base).getDay()+6)%7;dateInput.value=addDays(base,Number(weekday.value)-day);if(this.deadlineControls)this.deadlineControls.fill({due:dateInput.value,dueTime:this.form.elements.dueTime.value,deadlineHour:this.form.elements.deadlineHour.value,deadlineMinute:this.form.elements.deadlineMinute.value});this.timingEdited=true;this.syncWeekday();this.draft();};
  try{const stored=JSON.parse(localStorage.getItem(this.key));if(stored){this.fill({...stored.values,...(!record&&stored.item&&stored.values.autoSyncRecord===undefined?{autoSyncRecord:stored.item.autoSyncRecord!==false}:{})});this.newDraft=stored.newDraft;this.clearedTiming=stored.clearedTiming===true;this.timingApplied=stored.timingApplied??(stored.item?Boolean(record||stored.values.due):true);this.timingEdited=stored.timingEdited??Boolean(stored.item||stored.values[record?'date':'due']);if(!stored.item)this.ensureNewDate();this.attachments=stored.attachments||[];this.item=stored.item||null;this.startedManually=stored.startedManually??Boolean(stored.item);this.paint();this.state(tr('已恢复草稿'));}else{const old=JSON.parse(localStorage.getItem(record?'liubai-draft-v1':'journal-task-draft-v1'));if(old)this.fill(record?{content:old.raw,date:old.date}:{content:old.content,due:old.due});}}catch{}
  this.ensureNewDate();this.syncTiming();if(this.item?.startDate)this.expand(true);
  this.form.addEventListener('input',e=>{if(e.target.name==='startedAt')this.startedManually=true;if(['date','due','time','dueTime'].includes(e.target.name))this.timingEdited=true;this.draft();});this.form.addEventListener('change',e=>{this.syncRepeat();if(e.target.name==='startedAt')this.startedManually=true;this.syncStatus();this.draft();});
  this.form.querySelector('.expand-fields').onclick=()=>this.expand();this.form.querySelector('.cancel-edit').onclick=()=>{if(this.uploading||this.saving)return notify(tr('请等待当前保存或上传完成'));this.reset();this.restoreNewDraft();};
  this.form.querySelector('[type=file]').onchange=e=>this.upload(e.target.files);
  this.form.querySelector('.apply-time').onclick=()=>{this.timingApplied=!this.timingApplied;this.ensureNewDate();this.syncTiming();this.draft();};
  let dragDepth=0;
  const isFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  this.form.addEventListener('dragenter',e=>{if(isFiles(e)){e.preventDefault();dragDepth++;this.form.classList.add('file-drag-over');}});
  this.form.addEventListener('dragover',e=>{if(isFiles(e)){e.preventDefault();e.dataTransfer.dropEffect=this.uploading||this.saving?'none':'copy';}});
  this.form.addEventListener('dragleave',e=>{if(isFiles(e)&&--dragDepth<=0){dragDepth=0;this.form.classList.remove('file-drag-over');}});
  this.form.addEventListener('drop',e=>{if(!isFiles(e))return;e.preventDefault();dragDepth=0;this.form.classList.remove('file-drag-over');if(this.uploading||this.saving)return notify(tr('请等待当前保存或上传完成'));void this.upload(e.dataTransfer.files);});
  this.form.querySelector('.editor-attachments').onclick=e=>{const b=e.target.closest('[data-remove-attachment]');if(b){this.attachments=this.attachments.filter(a=>a.id!==b.dataset.removeAttachment);this.paint();this.draft();}};
  const textarea=this.form.querySelector('textarea');let composing=false;
  textarea.title=tr('Enter 保存，Ctrl + Enter 换行');
  textarea.addEventListener('compositionstart',()=>{composing=true;});textarea.addEventListener('compositionend',()=>{composing=false;});
  textarea.onkeydown=e=>{
   if(e.key!=='Enter'||e.isComposing||composing||e.keyCode===229)return;
   e.preventDefault();if(e.repeat)return;
   if(e.ctrlKey||e.metaKey){
    const {selectionStart:start,selectionEnd:end}=textarea;
    if(textarea.maxLength>=0&&textarea.value.length-(end-start)+1>textarea.maxLength)return;
    textarea.setRangeText('\n',start,end,'end');
    textarea.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertLineBreak',data:null}));
   }else this.form.requestSubmit();
  };
  this.form.onsubmit=e=>{e.preventDefault();void this.submit();};this.paint();
 }
 ensureNewDate(){if(this.kind==='task'){this.syncWeekday();return;}if(this.clearedTiming&&!this.timingApplied){this.syncWeekday();return;}const date=this.form.elements[this.kind==='record'?'date':'due'],time=this.form.elements[this.kind==='record'?'time':'dueTime'];if(!date.value)date.value=localDate();if(!time.value)time.value=localMinute(new Date()).slice(11);this.syncWeekday();}
 capture(){return structuredClone({values:{...this.values(),important:this.form.elements.important?.checked,autoSyncRecord:this.form.elements.autoSyncRecord?.checked},item:this.item,attachments:this.attachments,startedManually:this.startedManually,timingApplied:this.timingApplied,timingEdited:this.timingEdited,newDraft:this.newDraft,clearedTiming:this.clearedTiming});}
 clearInput(){
  if(this.uploading||this.saving)return notify(tr('请等待当前保存或上传完成'));
  const previous=this.capture(),record=this.kind==='record',now=localMinute(new Date());
  this.newDraft=null;this.reset();this.timingApplied=previous.timingApplied;this.timingEdited=record;this.clearedTiming=!record&&!this.timingApplied;
  this.fill(record?{date:previous.values.date,time:previous.values.time}:{due:'',dueTime:'',autoSyncRecord:previous.values.autoSyncRecord});
  this.syncWeekday();this.paint();this.draft();resizeTextareas(this.root);
  const cleared=JSON.stringify(this.capture());
  notify(tr('输入已清空，已保存的条目不受影响'),()=>{
   if(this.uploading||this.saving||JSON.stringify(this.capture())!==cleared)return notify(tr('已继续编辑，未覆盖当前输入'));
   this.form.reset();this.fill(previous.values);for(const key of ['item','attachments','startedManually','timingApplied','timingEdited','newDraft','clearedTiming'])this[key]=previous[key];this.paint();this.draft();resizeTextareas(this.root);
  });
 }
 reconcile(entries){
  if(!this.item||this.saving||entries.some(entry=>entry.id===this.item.id))return;
  // A deleted item's editing draft remains useful text, but must not keep its old identity.
  this.item=null;this.ensureNewDate();this.paint();this.draft();this.state(tr('原条目已删除，内容已保留为新草稿'));
 }
 syncTiming(){this.form.querySelector('.apply-time').setAttribute('aria-pressed',String(this.timingApplied));this.form.querySelector('.time-application-note').textContent=this.timingApplied?'':this.kind==='record'?tr('按保存时间记录'):tr('不设截止时间');this.syncRepeat();this.deadlineControls?.sync();this.context();}
 context(){const el=this.form.querySelector('.composer-context');if(!el)return;const f=this.planControls?.frequency();if(f&&f!=='none'){el.textContent=tr`${{daily:tr('每天'),weekly:tr('每周'),monthly:tr('每月')}[f]} · ${this.form.elements.targetCount.value||1} 次`;return;}const record=this.kind==='record',date=this.form.elements[record?'date':'due'].value,time=this.form.elements[record?'time':'dueTime'].value;if(!record){el.textContent='';return;}el.textContent=!this.timingApplied?(record?tr('按保存时间记录'):tr('不设截止时间')):(record?'':tr('截止 '))+(date===localDate()?tr('今天'):date)+' '+time;}
 syncRepeat(){this.planControls?.sync();this.deadlineControls?.sync();}
 values(){const values=Object.fromEntries(new FormData(this.form));if(this.kind==='task')Object.assign(values,{repeatFrequency:this.form.elements.repeatFrequency.value,targetCount:this.form.elements.targetCount.value},this.planControls.values(),this.deadlineControls?.values());return values;}
 fill(values={}){if(this.kind==='task'&&values.repeatDaily!==undefined&&!values.repeatFrequency)values={...values,repeatFrequency:values.repeatDaily?'daily':'none'};for(const [name,value]of Object.entries(values)){const el=this.form.elements.namedItem(name);if(el&&el.type!=='file')el.type==='checkbox'?el.checked=Boolean(value):el.value=value??'';}this.deadlineControls?.fill(values);if(this.planControls&&('scheduling' in values||'slots' in values))this.planControls.fill(values);this.syncStatus();this.syncWeekday();this.syncRepeat();resizeTextareas(this.root);}
 syncWeekday(){const value=this.form.elements[this.kind==='record'?'date':'due'].value;this.form.querySelector('.inline-weekday').value=value?String((parseDate(value).getDay()+6)%7):'';}
 syncStatus(){if(this.kind==='task')this.form.elements.completedAt.disabled=this.form.elements.status.value!=='done';}
 state(message){this.form.querySelector('.draft-state').textContent=message;}
 paint(){this.form.querySelector('.editor-attachments').innerHTML=attachmentList(this.attachments,true);this.form.querySelector('.composer-title').textContent=(this.item?tr('编辑'):tr('新增'))+(this.kind==='record'?tr('记录'):tr('待办'));this.form.querySelector('.cancel-edit').hidden=!this.item;this.syncStatus();this.syncTiming();refreshMotion();}
 expand(force){const fields=this.form.querySelector('.composer-fields'),open=force??fields.hidden;fields.hidden=!open;this.form.querySelector('.expand-fields').setAttribute('aria-expanded',String(open));this.form.querySelector('.expand-label').textContent=open?tr('收起选项'):tr('选项');resizeTextareas(this.root);}
 draft(){this.context();try{const values=this.values();delete values[''];values.important=this.form.elements.important?.checked;values.autoSyncRecord=this.form.elements.autoSyncRecord?.checked;localStorage.setItem(this.key,JSON.stringify({values,attachments:this.attachments,item:this.item,startedManually:this.startedManually,timingApplied:this.timingApplied,timingEdited:this.timingEdited,clearedTiming:this.clearedTiming,newDraft:this.newDraft}));this.state(tr('草稿已保存'));}catch{this.state(tr('草稿保存失败，请先保存记录'));}}
 reset(clear=true){this.clearedTiming=false;this.timingApplied=this.kind==='record';this.timingEdited=false;this.startedManually=false;this.item=null;this.attachments=[];this.form.reset();this.fill(this.kind==='record'?{date:localDate(),time:localMinute(new Date()).slice(11)}:{due:'',dueTime:'',startedAt:localMinute(new Date()),status:'next',startDate:localDate(),endDate:'',repeatFrequency:'none',scheduling:'count',slots:[],targetCount:1,leadMinutes:30,remind:false,applyCurrent:false});this.expand(false);this.state('');if(clear)try{localStorage.removeItem(this.key);}catch{}this.paint();}
 restoreNewDraft(){if(this.newDraft){this.fill(this.newDraft.values);this.attachments=this.newDraft.attachments;this.startedManually=this.newDraft.startedManually;this.timingApplied=this.newDraft.timingApplied;this.timingEdited=this.newDraft.timingEdited;this.clearedTiming=this.newDraft.clearedTiming;this.newDraft=null;this.paint();this.draft();}}
 edit(item){if(this.uploading||this.saving)return notify(tr('请等待当前保存或上传完成'));if(!this.item)this.newDraft={clearedTiming:this.clearedTiming,values:this.values(),attachments:structuredClone(this.attachments),startedManually:this.startedManually,timingApplied:this.timingApplied,timingEdited:this.timingEdited};this.clearedTiming=false;this.startedManually=true;this.timingApplied=this.kind==='record'||Boolean(item.due);this.timingEdited=true;this.item=structuredClone(item);this.attachments=structuredClone(item.attachments||[]);this.form.reset();this.fill(this.kind==='record'?{...item,content:item.details||item.raw}:{...item,scheduling:item.scheduling||'count',slots:item.slots||[],targetCount:item.targetCount||1,leadMinutes:item.leadMinutes??30,remind:item.remind??false,applyCurrent:false,autoSyncRecord:item.autoSyncRecord!==false,repeatFrequency:item.startDate?(item.repeatFrequency||(item.repeatDaily?'daily':'none')):'none',content:taskContent(item),startedAt:localMinute(item.startedAt),completedAt:localMinute(item.completedAt)});this.ensureNewDate();this.paint();this.expand(true);this.draft();this.form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});this.form.querySelector('textarea').focus({preventScroll:true});}
 records(records){if(this.kind!=='task')return;const el=this.form.elements.recordId,value=el.value;el.innerHTML=tr('<option value="">不关联</option>')+records.map(r=>`<option value="${esc(r.id)}">${esc(r.date+' · '+r.title)}</option>`).join('');el.value=value||this.item?.recordId||'';}
 async upload(files){if(this.uploading||this.saving)return;this.uploading=true;const input=this.form.querySelector('[type=file]'),button=this.form.querySelector('[type=submit]');input.disabled=button.disabled=true;let added=0;try{for(const file of files){if(this.attachments.length>=50)throw Error(tr('每条最多添加 50 个附件'));this.state(tr`正在上传 ${file.name}`);this.attachments.push(await uploadFile(file));added++;this.paint();this.draft();}}catch(e){notify(e.message);}finally{input.value='';input.disabled=button.disabled=false;this.uploading=false;if(added)this.state(tr('附件已保存到草稿 · 保存后加入时间线'));}}
 async submit(){
  const button=this.form.querySelector('[type=submit]');if(button.disabled||this.uploading)return;const v=this.values(),content=(v.content||'').trim();if(!content&&!this.attachments.length){notify(tr('请输入内容或添加附件'));return;}
  const current=localMinute(new Date());
  if(this.kind==='record'&&!this.item&&!this.timingEdited){v[this.kind==='record'?'date':'due']=current.slice(0,10);v[this.kind==='record'?'time':'dueTime']=current.slice(11);}
  if(this.kind==='record'&&!this.timingApplied){v.date=current.slice(0,10);v.time=current.slice(11);}
  if(this.kind==='task'&&!this.timingApplied){v.due='';v.dueTime='';}
  const daily=this.kind==='task'&&v.repeatFrequency!=='none';
  if(!daily&&this.timingApplied&&(!v[this.kind==='record'?'date':'due']||!v[this.kind==='record'?'time':'dueTime'])){this.deadlineControls?.focusMissing();return notify(this.kind==='task'?tr('补上日期和时间，或取消勾选截止日期'):tr('请填写日期和时间（精确到分钟），或关闭“应用”'));}
  if(daily&&(!validDate(v.startDate)||(v.endDate&&(!validDate(v.endDate)||v.endDate<v.startDate))))return notify(tr('请填写有效的计划起止日期'));
  const title=v.title?.trim()||content.split('\n')[0].slice(0,80)||this.attachments[0].name.slice(0,80),at=new Date().toISOString();
  const base={...(this.item||{}),id:this.item?.id||crypto.randomUUID(),createdAt:this.item?.createdAt||at,project:v.project?.trim()||'',attachments:structuredClone(this.attachments)};
  const item=this.kind==='record'?{...base,title,details:content,raw:this.item?.raw??content,date:v.date,time:v.time,suggestions:this.item?.suggestions||[],durationMinutes:v.durationMinutes?Number(v.durationMinutes):null,effort:v.effort,important:this.form.elements.important.checked}:{...base,...taskFields(content||title),due:v.due,dueTime:v.dueTime,autoSyncRecord:this.form.elements.autoSyncRecord.checked,priority:v.priority,status:v.status,recordId:v.recordId,startedAt:v.startedAt?new Date(v.startedAt).toISOString():'',completedAt:v.status==='done'?(v.completedAt?new Date(v.completedAt).toISOString():this.item?.status==='done'?(this.item.completedAt||''):at):''};
  if(daily){
   const slots=this.planControls.slots,frequency=v.repeatFrequency;
   if(v.scheduling==='times'&&(!slots.length||slots.some(s=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))))return notify(tr('请给每次安排填写时间'));
   if(v.scheduling==='times'&&new Set(slots.map(s=>(frequency==='daily'?'':s.day)+s.time)).size!==slots.length)return notify(tr('同一天的安排时间不能重复'));
   Object.assign(item,{planVersion:2,repeatDaily:frequency==='daily',repeatFrequency:frequency,startDate:v.startDate,endDate:v.endDate||'',due:'',dueTime:'',scheduling:v.scheduling,targetCount:v.scheduling==='times'?slots.length:Number(v.targetCount),slots:v.scheduling==='times'?structuredClone(slots):[],leadMinutes:Number(v.leadMinutes)||0,remind:v.remind===true,applyCurrent:v.applyCurrent===true});
  }
  if(this.kind==='task'&&!this.item&&!this.startedManually)item.startedAt=at;
  jellyRelease(button);button.disabled=true;this.saving=true;this.form.inert=true;button.dataset.state='saving';button.setAttribute('aria-busy','true');
  try{await this.save(item,Boolean(this.item));await waitForJelly(button);button.dataset.state='saved';await scatterIcon(button,true);this.reset();this.restoreNewDraft();try{localStorage.removeItem(this.kind==='record'?'liubai-draft-v1':'journal-task-draft-v1');}catch{}}
  catch(e){notify(e.message);this.draft();}finally{this.saving=false;this.form.inert=false;button.disabled=false;button.removeAttribute('aria-busy');delete button.dataset.state;}
 }
}




