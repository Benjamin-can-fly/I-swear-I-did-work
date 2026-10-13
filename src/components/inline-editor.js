import {esc,icon,notify} from '../lib/ui.js';
import {localDate,addDays,parseDate} from '../lib/dates.js';
import {localMinute} from '../lib/task-time.js';
import {taskContent,taskFields} from '../lib/task-content.js';
import {attachmentList,uploadFile} from '../lib/attachments.js';
import {resizeTextareas} from '../lib/autosize.js';
import {refreshMotion,jellyRelease,waitForJelly,scatterIcon} from '../lib/motion.js';
const glyph='<span class="assemble-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const field=(label,name,type='text',attrs='')=>`<label class="form-field">${label}<input name="${name}" type="${type}" ${attrs}></label>`;
const select=(label,name,values)=>`<label class="form-field">${label}<select name="${name}">${values.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
export class InlineEditor{
 constructor(root,kind,save){
  this.root=root;this.kind=kind;this.save=save;this.key=`journal-inline-${kind}-v1`;this.item=null;this.attachments=[];this.uploading=false;this.timingApplied=true;this.timingEdited=false;const record=kind==='record';
  root.innerHTML=`<form id="${kind}-form" class="composer panel inline-composer"><div class="section-kicker">${icon('pen')}<span class="composer-title">新增${record?'记录':'待办'}</span><button type="button" class="icon-button cancel-edit" hidden aria-label="取消编辑">×</button></div><textarea id="${record?'raw-input':'task-input'}" name="content" maxlength="${record?20000:20201}" placeholder="${record?'输入做过的事，包括过程和结果。':'输入要做的事和补充说明。'}" aria-label="${record?'工作记录内容':'待办内容'}"></textarea><div class="editor-attachments"></div><div class="composer-tools"><label class="text-button file-button attachment-upload">${icon('download')}添加图片或文件<input type="file" multiple aria-label="添加图片或文件"></label><span class="draft-state" role="status"></span>${record?'':'<label class="sync-option" title="完成后生成记录，修改、回退和删除时同步。关闭会撤回已同步的记录。"><input type="checkbox" name="autoSyncRecord" role="switch"><span class="sync-track" aria-hidden="true"></span><span>自动同步至工作记录</span></label>'}<button type="button" class="text-button expand-fields" aria-expanded="false"><span class="expand-label">更多选项</span><svg class="expand-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button></div><div class="composer-fields" hidden>${record?field('标题 · 可留空','title','text','maxlength="200"'):''}<div class="form-grid">${field('项目 · 可留空','project','text','list="project-options" maxlength="80"')}${record?field('实际耗时 · 分钟','durationMinutes','number','min="1" max="1440" step="1"'):select('优先级','priority',[['normal','普通'],['high','优先'],['low','较低']])}</div>${record?`<div class="form-grid">${select('投入程度','effort',[['auto','按内容估算'],['light','较轻'],['normal','一般'],['high','较高']])}<label class="important-field"><input type="checkbox" name="important">设为重点</label></div>`:`<div class="form-grid">${select('状态','status',[['next','待处理'],['today','今天要做'],['paused','已搁置'],['done','已完成']])}${field('开始时间 · 可修改','startedAt','datetime-local')}</div><div class="form-grid">${field('完成时间 · 完成时自动记录','completedAt','datetime-local')}<label class="form-field">关联记录<select name="recordId"><option value="">不关联</option></select></label></div>`}</div><div class="composer-footer"><div class="composer-meta"><div class="inline-date-control"><span class="date-field-label">${record?'发生日期':'截止日期'}</span><button type="button" class="icon-button" data-inline-date-shift="-1" aria-label="日期前一天">‹</button><input id="${record?'entry-date':'task-due'}" name="${record?'date':'due'}" type="date" aria-label="${record?'发生日期':'截止日期'}"><button type="button" class="icon-button" data-inline-date-shift="1" aria-label="日期后一天">›</button><select class="inline-weekday" aria-label="选择星期"><option value="">星期</option>${['一','二','三','四','五','六','日'].map((w,i)=>`<option value="${i}">周${w}</option>`).join('')}</select></div><label class="inline-time-control">时间<input name="${record?'time':'dueTime'}" type="time" step="60" aria-label="${record?'发生时间':'截止时间'}"></label><button type="button" class="apply-time" aria-pressed="true"><span class="apply-indicator" aria-hidden="true"></span>应用</button><span class="time-application-note"></span></div><button type="submit" id="${record?'organize':'new-task'}" class="primary">${glyph}<span class="action-label">保存${record?'记录':'待办'}</span><span class="shortcut" title="Enter 保存，Ctrl + Enter 换行">Enter ↵</span></button></div></form>`;
  this.form=root.querySelector('form');this.reset(false);
  const cancel=this.form.querySelector('.cancel-edit');cancel.textContent='取消编辑';cancel.classList.replace('icon-button','text-button');
  const clear=document.createElement('button');clear.type='button';clear.className='icon-button clear-composer';clear.setAttribute('aria-label','清空输入');clear.title='清空当前输入，保留时间应用与同步开关';clear.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';this.form.querySelector('.section-kicker').append(clear);clear.onclick=()=>this.clearInput();
  const dateInput=this.form.elements[record?'date':'due'],weekday=this.form.querySelector('.inline-weekday');
  dateInput.addEventListener('input',()=>this.syncWeekday());dateInput.addEventListener('change',()=>this.syncWeekday());
  this.form.querySelectorAll('[data-inline-date-shift]').forEach(button=>button.onclick=()=>{dateInput.value=addDays(dateInput.value||localDate(),Number(button.dataset.inlineDateShift));this.timingEdited=true;this.syncWeekday();this.draft();});
  weekday.onchange=()=>{if(weekday.value==='')return;const base=dateInput.value||localDate(),day=(parseDate(base).getDay()+6)%7;dateInput.value=addDays(base,Number(weekday.value)-day);this.timingEdited=true;this.syncWeekday();this.draft();};
  try{const stored=JSON.parse(localStorage.getItem(this.key));if(stored){this.fill({...stored.values,...(!record&&stored.item&&stored.values.autoSyncRecord===undefined?{autoSyncRecord:stored.item.autoSyncRecord!==false}:{})});this.clearedTiming=stored.clearedTiming===true;this.timingApplied=stored.timingApplied??(stored.item?Boolean(record||stored.values.due):true);this.timingEdited=stored.timingEdited??Boolean(stored.item||stored.values[record?'date':'due']);if(!stored.item)this.ensureNewDate();this.attachments=stored.attachments||[];this.item=stored.item||null;this.startedManually=stored.startedManually??Boolean(stored.item);this.paint();this.state('已恢复草稿');}else{const old=JSON.parse(localStorage.getItem(record?'liubai-draft-v1':'journal-task-draft-v1'));if(old)this.fill(record?{content:old.raw,date:old.date}:{content:old.content,due:old.due});}}catch{}
  this.ensureNewDate();this.syncTiming();
  this.form.addEventListener('input',e=>{if(e.target.name==='startedAt')this.startedManually=true;if(['date','due','time','dueTime'].includes(e.target.name))this.timingEdited=true;this.draft();});this.form.addEventListener('change',e=>{if(e.target.name==='startedAt')this.startedManually=true;this.syncStatus();this.draft();});
  this.form.querySelector('.expand-fields').onclick=()=>this.expand();this.form.querySelector('.cancel-edit').onclick=()=>{if(this.uploading||this.saving)return notify('请等待当前保存或上传完成');this.reset();this.restoreNewDraft();};
  this.form.querySelector('[type=file]').onchange=e=>this.upload(e.target.files);
  this.form.querySelector('.apply-time').onclick=()=>{this.timingApplied=!this.timingApplied;this.ensureNewDate();this.syncTiming();this.draft();};
  let dragDepth=0;
  const isFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  this.form.addEventListener('dragenter',e=>{if(isFiles(e)){e.preventDefault();dragDepth++;this.form.classList.add('file-drag-over');}});
  this.form.addEventListener('dragover',e=>{if(isFiles(e)){e.preventDefault();e.dataTransfer.dropEffect=this.uploading||this.saving?'none':'copy';}});
  this.form.addEventListener('dragleave',e=>{if(isFiles(e)&&--dragDepth<=0){dragDepth=0;this.form.classList.remove('file-drag-over');}});
  this.form.addEventListener('drop',e=>{if(!isFiles(e))return;e.preventDefault();dragDepth=0;this.form.classList.remove('file-drag-over');if(this.uploading||this.saving)return notify('请等待当前保存或上传完成');void this.upload(e.dataTransfer.files);});
  this.form.querySelector('.editor-attachments').onclick=e=>{const b=e.target.closest('[data-remove-attachment]');if(b){this.attachments=this.attachments.filter(a=>a.id!==b.dataset.removeAttachment);this.paint();this.draft();}};
  const textarea=this.form.querySelector('textarea');let composing=false;
  textarea.title='Enter 保存，Ctrl + Enter 换行';
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
 ensureNewDate(){if(this.clearedTiming&&!this.timingApplied){this.syncWeekday();return;}const date=this.form.elements[this.kind==='record'?'date':'due'],time=this.form.elements[this.kind==='record'?'time':'dueTime'];if(!date.value)date.value=localDate();if(!time.value)time.value=localMinute(new Date()).slice(11);this.syncWeekday();}
 capture(){return structuredClone({values:{...this.values(),important:this.form.elements.important?.checked,autoSyncRecord:this.form.elements.autoSyncRecord?.checked},item:this.item,attachments:this.attachments,startedManually:this.startedManually,timingApplied:this.timingApplied,timingEdited:this.timingEdited,newDraft:this.newDraft,clearedTiming:this.clearedTiming});}
 clearInput(){
  if(this.uploading||this.saving)return notify('请等待当前保存或上传完成');
  const previous=this.capture(),record=this.kind==='record',now=localMinute(new Date());
  this.newDraft=null;this.reset();this.timingApplied=previous.timingApplied;this.timingEdited=record;this.clearedTiming=!record&&!this.timingApplied;
  this.fill(record?{date:previous.values.date,time:previous.values.time}:{due:this.timingApplied?now.slice(0,10):'',dueTime:this.timingApplied?now.slice(11):'',autoSyncRecord:previous.values.autoSyncRecord});
  this.syncWeekday();this.paint();this.draft();resizeTextareas(this.root);
  const cleared=JSON.stringify(this.capture());
  notify('输入已清空，已保存的条目不受影响',()=>{
   if(this.uploading||this.saving||JSON.stringify(this.capture())!==cleared)return notify('已继续编辑，未覆盖当前输入');
   this.form.reset();this.fill(previous.values);for(const key of ['item','attachments','startedManually','timingApplied','timingEdited','newDraft','clearedTiming'])this[key]=previous[key];this.paint();this.draft();resizeTextareas(this.root);
  });
 }
 reconcile(entries){
  if(!this.item||this.saving||entries.some(entry=>entry.id===this.item.id))return;
  // A deleted item's editing draft remains useful text, but must not keep its old identity.
  this.item=null;this.ensureNewDate();this.paint();this.draft();this.state('原条目已删除，内容已保留为新草稿');
 }
 syncTiming(){this.form.querySelector('.apply-time').setAttribute('aria-pressed',String(this.timingApplied));this.form.querySelector('.time-application-note').textContent=this.timingApplied?'':this.kind==='record'?'按保存时间记录':'不设截止时间';}
 values(){return Object.fromEntries(new FormData(this.form));}
 fill(values={}){for(const [name,value]of Object.entries(values)){const el=this.form.elements.namedItem(name);if(el&&el.type!=='file')el.type==='checkbox'?el.checked=Boolean(value):el.value=value??'';}this.syncStatus();this.syncWeekday();resizeTextareas(this.root);}
 syncWeekday(){const value=this.form.elements[this.kind==='record'?'date':'due'].value;this.form.querySelector('.inline-weekday').value=value?String((parseDate(value).getDay()+6)%7):'';}
 syncStatus(){if(this.kind==='task')this.form.elements.completedAt.disabled=this.form.elements.status.value!=='done';}
 state(message){this.form.querySelector('.draft-state').textContent=message;}
 paint(){this.form.querySelector('.editor-attachments').innerHTML=attachmentList(this.attachments,true);this.form.querySelector('.composer-title').textContent=(this.item?'编辑':'新增')+(this.kind==='record'?'记录':'待办');this.form.querySelector('.cancel-edit').hidden=!this.item;this.syncStatus();this.syncTiming();refreshMotion();}
 expand(force){const fields=this.form.querySelector('.composer-fields'),open=force??fields.hidden;fields.hidden=!open;this.form.querySelector('.expand-fields').setAttribute('aria-expanded',String(open));this.form.querySelector('.expand-label').textContent=open?'收起选项':'更多选项';resizeTextareas(this.root);}
 draft(){try{const values=this.values();delete values[''];values.important=this.form.elements.important?.checked;values.autoSyncRecord=this.form.elements.autoSyncRecord?.checked;localStorage.setItem(this.key,JSON.stringify({values,attachments:this.attachments,item:this.item,startedManually:this.startedManually,timingApplied:this.timingApplied,timingEdited:this.timingEdited,clearedTiming:this.clearedTiming}));this.state('草稿已保存');}catch{this.state('草稿保存失败，请先保存记录');}}
 reset(clear=true){this.clearedTiming=false;this.timingApplied=true;this.timingEdited=false;this.startedManually=false;this.item=null;this.attachments=[];this.form.reset();this.fill(this.kind==='record'?{date:localDate(),time:localMinute(new Date()).slice(11)}:{due:localDate(),dueTime:localMinute(new Date()).slice(11),startedAt:localMinute(new Date()),status:'next'});this.expand(false);this.state('');if(clear)try{localStorage.removeItem(this.key);}catch{}this.paint();}
 restoreNewDraft(){if(this.newDraft){this.fill(this.newDraft.values);this.attachments=this.newDraft.attachments;this.startedManually=this.newDraft.startedManually;this.timingApplied=this.newDraft.timingApplied;this.timingEdited=this.newDraft.timingEdited;this.clearedTiming=this.newDraft.clearedTiming;this.newDraft=null;this.paint();this.draft();}}
 edit(item){if(this.uploading||this.saving)return notify('请等待当前保存或上传完成');if(!this.item)this.newDraft={clearedTiming:this.clearedTiming,values:this.values(),attachments:structuredClone(this.attachments),startedManually:this.startedManually,timingApplied:this.timingApplied,timingEdited:this.timingEdited};this.clearedTiming=false;this.startedManually=true;this.timingApplied=this.kind==='record'||Boolean(item.due);this.timingEdited=true;this.item=structuredClone(item);this.attachments=structuredClone(item.attachments||[]);this.form.reset();this.fill(this.kind==='record'?{...item,content:item.details||item.raw}:{...item,autoSyncRecord:item.autoSyncRecord!==false,content:taskContent(item),startedAt:localMinute(item.startedAt),completedAt:localMinute(item.completedAt)});this.ensureNewDate();this.paint();this.draft();this.form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});this.form.querySelector('textarea').focus({preventScroll:true});}
 records(records){if(this.kind!=='task')return;const el=this.form.elements.recordId,value=el.value;el.innerHTML='<option value="">不关联</option>'+records.map(r=>`<option value="${esc(r.id)}">${esc(r.date+' · '+r.title)}</option>`).join('');el.value=value||this.item?.recordId||'';}
 async upload(files){if(this.uploading||this.saving)return;this.uploading=true;const input=this.form.querySelector('[type=file]'),button=this.form.querySelector('[type=submit]');input.disabled=button.disabled=true;let added=0;try{for(const file of files){if(this.attachments.length>=50)throw Error('每条最多添加 50 个附件');this.state(`正在上传 ${file.name}`);this.attachments.push(await uploadFile(file));added++;this.paint();this.draft();}}catch(e){notify(e.message);}finally{input.value='';input.disabled=button.disabled=false;this.uploading=false;if(added)this.state('附件已保存到草稿 · 保存后加入时间线');}}
 async submit(){
  const button=this.form.querySelector('[type=submit]');if(button.disabled||this.uploading)return;const v=this.values(),content=(v.content||'').trim();if(!content&&!this.attachments.length){notify('请输入内容或添加附件');return;}
  const current=localMinute(new Date());
  if(!this.item&&!this.timingEdited){v[this.kind==='record'?'date':'due']=current.slice(0,10);v[this.kind==='record'?'time':'dueTime']=current.slice(11);}
  if(this.kind==='record'&&!this.timingApplied){v.date=current.slice(0,10);v.time=current.slice(11);}
  if(this.kind==='task'&&!this.timingApplied){v.due='';v.dueTime='';}
  if(this.timingApplied&&(!v[this.kind==='record'?'date':'due']||!v[this.kind==='record'?'time':'dueTime']))return notify('请填写日期和时间（精确到分钟），或关闭“应用”');
  const title=v.title?.trim()||content.split('\n')[0].slice(0,80)||this.attachments[0].name.slice(0,80),at=new Date().toISOString();
  const base={...(this.item||{}),id:this.item?.id||crypto.randomUUID(),createdAt:this.item?.createdAt||at,project:v.project?.trim()||'',attachments:structuredClone(this.attachments)};
  const item=this.kind==='record'?{...base,title,details:content,raw:this.item?.raw??content,date:v.date,time:v.time,suggestions:this.item?.suggestions||[],durationMinutes:v.durationMinutes?Number(v.durationMinutes):null,effort:v.effort,important:this.form.elements.important.checked}:{...base,...taskFields(content||title),due:v.due,dueTime:v.dueTime,autoSyncRecord:this.form.elements.autoSyncRecord.checked,priority:v.priority,status:v.status,recordId:v.recordId,startedAt:v.startedAt?new Date(v.startedAt).toISOString():'',completedAt:v.status==='done'?(v.completedAt?new Date(v.completedAt).toISOString():this.item?.status==='done'?(this.item.completedAt||''):at):''};
  if(this.kind==='task'&&!this.item&&!this.startedManually)item.startedAt=at;
  jellyRelease(button);button.disabled=true;this.saving=true;this.form.inert=true;button.dataset.state='saving';button.setAttribute('aria-busy','true');
  try{await this.save(item,Boolean(this.item));await waitForJelly(button);button.dataset.state='saved';await scatterIcon(button,true);this.reset();this.restoreNewDraft();try{localStorage.removeItem(this.kind==='record'?'liubai-draft-v1':'journal-task-draft-v1');}catch{}}
  catch(e){notify(e.message);this.draft();}finally{this.saving=false;this.form.inert=false;button.disabled=false;button.removeAttribute('aria-busy');delete button.dataset.state;}
 }
}




