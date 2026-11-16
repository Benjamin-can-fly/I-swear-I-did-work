import {propose,candidates,capturePlanLabel} from '../lib/capture.js';
import {localDate} from '../lib/dates.js';
import {localMinute} from '../lib/task-time.js';
import {formatCaptureWhen} from '../lib/capture-display.js';
import {esc,api} from '../lib/ui.js';
import {tr,locale} from '../lib/i18n.js';
import {hasReminderTime,hasScheduledReminders} from '../lib/plan-reminders.js';

const name=k=>tr(({record:'工作记录',task:'待办事项',plan:'计划',complete:'完成已有待办',review:'选择去向',choose:'选择对应待办',skip:'不保存'})[k]||'选择去向');
const freqText={daily:'每日计划',weekly:'每周计划',monthly:'每月计划'};
const option=(value,label,current)=>'<option value="'+esc(value)+'" '+(String(value)===String(current)?'selected':'')+'>'+esc(label)+'</option>';
const defaultPlan=(start=localDate())=>({repeatFrequency:'daily',scheduling:'count',weekdaysOnly:false,targetCount:1,slots:[],leadMinutes:0,remind:false,startDate:start,endDate:''});
const slot=(p)=>({id:crypto.randomUUID().slice(0,8),day:p.repeatFrequency==='monthly'?'1':'0',time:''});
const clockPattern=/^([01]\d|2[0-3]):[0-5]\d$/;
let modelStatusCache=null,modelStatusAt=0,modelStatusPending=false;
async function modelStatus(force=false){
 if(!modelStatusCache||!modelStatusPending&&(force||Date.now()-modelStatusAt>2000)){
  modelStatusAt=Date.now();modelStatusPending=true;
  modelStatusCache=api('/api/capture-status').finally(()=>{modelStatusPending=false;});
 }
 return modelStatusCache;
}
function keyedRows(rows){
 const result=rows.map((r,i)=>({...r,previewKey:r.previewKey||'capture-'+i}));
 for(const [i,r] of result.entries()){
  if(r.afterIndex!==undefined&&r.afterIndex!==null&&r.afterIndex!==-1){
   if(!Number.isInteger(r.afterIndex)||r.afterIndex<0||r.afterIndex>=i||r.kind!=='task'||result[r.afterIndex].kind!=='task')throw Error('Invalid task sequence');
   r.afterKey=result[r.afterIndex].previewKey;
  }
  delete r.afterIndex;
 }
 return result;
}
function restoreRow(fresh,saved,version){
 const fixed=saved.corrected||{},row={...fresh,corrected:{...fixed}};
 for(const k of ['text','date','time','when','period','priority','scheduledDate','scheduledTime','afterKey'])if(fixed[k]&&typeof saved[k]==='string')row[k]=saved[k];
 if(fixed.remind&&typeof saved.remind==='boolean')row.remind=saved.remind;
 // Older previews did not track kind changes. Only carry a decision across when
 // the new parser still needs one; stale automatic choices should not overrule it.
 if(fixed.kind||saved.kind==='skip'||version===2&&['review','choose'].includes(row.kind)&&['record','task','plan','complete'].includes(saved.kind)){
  if(saved.kind==='complete'){
   if(row.candidates?.some(c=>c.id===saved.target)){row.kind='complete';row.target=saved.target;}
  }else if(['task','record','plan','skip'].includes(saved.kind)){
   row.kind=saved.kind;if(row.kind==='record')row.when='event';else if(row.kind==='task'&&row.when==='event')row.when='scheduled';
  }
 }
 if(row.kind==='plan'&&saved.plan&&(fixed.plan||version===2||!row.plan))row.plan={...fresh.plan,...saved.plan};
 return row;
}
export class CaptureEditor{
 constructor(editor,tasks,save){
  this.editor=editor;this.tasks=tasks;this.save=save;this.form=editor.form;this.input=this.form.elements.content;this.key=editor.key+'-capture';this.revision=0;
  this.box=document.createElement('div');this.box.className='capture-preview';this.input.after(this.box);
  this.modelState=document.createElement('div');this.modelState.className='capture-model-state';this.modelState.setAttribute('role','status');this.modelState.setAttribute('aria-live','polite');this.box.after(this.modelState);
  this.configEntry=document.createElement('button');this.configEntry.type='button';this.configEntry.className='text-button capture-config-entry';this.configEntry.textContent=tr('配置在线模型');this.form.querySelector('.composer-fields').append(this.configEntry);this.configEntry.addEventListener('click',()=>this.openConfiguration());
  this.modelState.addEventListener('click',e=>{if(e.target.closest('[data-model-configure]'))this.configure();else if(e.target.closest('[data-model-retry]')){this.raw=null;this.prepare(true);}});
  this.modelState.addEventListener('change',e=>{if(e.target.matches('[data-model-provider]')){e.stopPropagation();this.updateConfigProvider();}});
  this.modelState.addEventListener('keydown',e=>{if(e.target.matches('[data-model-key]')&&e.key==='Enter'){e.preventDefault();e.stopPropagation();this.configure();}});
  this.input.addEventListener('focus',()=>{if(this.active&&!this.editor.saving)this.refreshMode(true);});
  for(const event of ['online','offline','focus'])window.addEventListener(event,()=>{if(this.active&&this.form.getClientRects().length)this.refreshMode(true);});
  this.input.addEventListener('compositionstart',()=>{this.composing=true;this.schedule();});
  this.input.addEventListener('compositionend',()=>{this.composing=false;this.schedule();});
  this.input.addEventListener('input',()=>this.schedule());
  this.box.addEventListener('input',e=>this.change(e.target));
  this.box.addEventListener('click',e=>{const b=e.target.closest('[data-slot-action]');if(!b)return;const r=this.rows[Number(b.dataset.row)],p=r?.plan;if(!p)return;
   if(b.dataset.slotAction==='add'&&p.slots.length<60)p.slots.push(slot(p));else if(b.dataset.slotAction==='remove')p.slots.splice(Number(b.dataset.index),1);
   if(!p.slots.length)p.scheduling='count';p.targetCount=p.slots.length||1;r.corrected={...r.corrected,plan:true};this.touched=true;this.remember();this.paintRows();
   if(b.dataset.slotAction==='add')this.box.querySelector(`[data-row="${b.dataset.row}"][data-field="slotTime"][data-index="${p.slots.length-1}"]`)?.focus();
  });
  this.sync();
 }
 get active(){return !this.editor.item;}
 syncPlaceholder(){
  if(this.active&&this.form.closest('#today-page'))this.input.removeAttribute('placeholder');
  else this.input.placeholder=this.active?tr('比如：刚交了报告。每天晚上 8 点记单词。'):this.editor.kind==='record'?tr('刚做了什么？'):tr('有什么要做的？');
 }
 sync(){
  const active=this.active,record=this.editor.kind==='record';this.configEntry.hidden=!active;this.form.classList.toggle('capture-on',active);this.box.hidden=!active;this.modelState.hidden=!active;
  if(!record){
   this.form.querySelector('.existing-plan-options').hidden=!this.editor.item?.startDate;
   this.form.elements.status.querySelector('[value="done"]').hidden=active;
   this.form.querySelector('.task-deadline .apply-time span:last-child').textContent=tr(active?'指定截止时间':'截止日期');
   this.form.querySelector('.task-execution-options').hidden=!!this.editor.item?.startDate;
   this.form.querySelector('.deadline-options').hidden=!!this.editor.item?.startDate;
  }
  const button=this.form.querySelector('[type=submit]');button.formNoValidate=active;
  button.querySelector('.action-label').textContent=active?tr('保存'):this.editor.item?.startDate?tr('保存计划'):record?tr('保存记录'):tr('保存待办');
  if(active)this.form.querySelector('.composer-title').textContent=tr('随手记');
  this.syncPlaceholder();
  if(active&&(this.raw!==this.input.value.trim()||this.fileKey!==this.fileSignature()))this.schedule();
  else if(active&&this.rows?.length)this.refreshSummaries();
  if(!active){clearTimeout(this.timer);this.abort?.abort();this.revision++;this.raw=null;this.pending=null;this.rows=[];this.modelState.replaceChildren();}
 }
 fileSignature(){return this.input.value.trim()?'':this.editor.attachments.map(a=>a.id).join(':');}
 suggestPlan(frequency){
  if(!this.active)return;const seeds={daily:'每天 ',weekly:'每周 ',monthly:'每月 '},english={daily:'Every day ',weekly:'Every week ',monthly:'Every month '};
  if(!this.input.value.trim()){this.input.value=(locale()==='en'?english:seeds)[frequency]||'';this.input.dispatchEvent(new Event('input',{bubbles:true}));}
  this.input.focus({preventScroll:true});this.input.setSelectionRange(this.input.value.length,this.input.value.length);
 }
 schedule(){
  clearTimeout(this.timer);this.abort?.abort();this.revision++;this.raw=null;this.pending=null;this.rows=[];this.touched=false;this.modelError=false;this.modelReview=false;this.modelEngine='';this.modelRetained=0;this.box.replaceChildren();this.modelState.replaceChildren();delete this.modelState.dataset.state;
  if(!this.active||this.composing)return;this.timer=setTimeout(()=>{if(!this.editor.saving)this.prepare();},900);
 }
 remember(){try{localStorage.setItem(this.key,JSON.stringify({version:5,provider:this.status?.provider||'',captureMode:this.captureMode||'model',raw:this.raw,day:this.day,fileKey:this.fileKey,rows:this.rows,modelEngine:this.modelEngine||'',modelReview:this.modelReview||false,modelRetained:this.modelRetained||0}));}catch{}}
 setModelState(state){
  const text=({working:'正在整理…',ready:'',partial:'部分内容需要你核对',offline:'离线记录 · 日期和次数请核对',setup:'',error:'暂时没有整理好，原文还在',edited:'已保留你的修改'})[state]||'';
  this.modelState.dataset.state=state;this.modelState.innerHTML=`<small>${esc(tr(text))}</small>${state==='error'?` <button type="button" class="text-button" data-model-retry>${tr('重试')}</button>`:''}`;
  if(state==='setup'||state==='error'||state==='configure'){
   const provider=this.status?.provider==='gemini'?'gemini':'siliconflow';
   this.modelState.insertAdjacentHTML('beforeend',`<details class="capture-cloud-config"><summary>${tr('配置在线模型')}</summary><small>${tr('密钥仅保存在本机；输入正文将发送给选定的服务商。')}</small><div><label>${tr('服务商')}<select data-model-provider>${option('siliconflow',tr('硅基流动 · 通义千问（国内）'),provider)}${option('gemini',tr('Gemini（海外）'),provider)}</select></label><a data-model-key-link target="_blank" rel="noopener noreferrer">${tr('获取密钥')}</a></div><div><input type="password" data-model-key autocomplete="off" spellcheck="false" aria-label="API key"><button type="button" class="text-button" data-model-configure>${tr('保存配置')}</button></div><small data-config-status></small></details>`);
   this.updateConfigProvider();
  }
 }
 async refreshMode(force=false){
  try{
   const status=await modelStatus(force);if(!this.active)return;
   const previous=this.captureMode,previousProvider=this.status?.provider;this.status=status;this.captureMode=status.mode==='manual'&&status.reason==='offline'?'manual':'model';
   this.form.dataset.captureMode=this.captureMode;
   if(previous&&(previous!==this.captureMode||previousProvider&&previousProvider!==status.provider)){
    this.abort?.abort();this.revision++;this.pending=null;
    // User corrections survive reconnection; automatic offline guesses are replaced by the model.
    if(!this.touched){this.raw=null;await this.prepare();return;}
    this.setModelState(this.captureMode==='manual'?'offline':'edited');
   }
   if(!this.input.value.trim())this.setModelState(this.captureMode==='manual'?'offline':status.available?'ready':'setup');
  }catch{if(this.active&&!this.input.value.trim())this.setModelState('error');}
 }
 updateConfigProvider(){
  const provider=this.modelState.querySelector('[data-model-provider]')?.value==='gemini'?'gemini':'siliconflow',input=this.modelState.querySelector('[data-model-key]'),link=this.modelState.querySelector('[data-model-key-link]');
  if(input){input.value='';input.placeholder=provider==='gemini'?'Gemini API key':'SiliconFlow API key';}
  if(link)link.href=provider==='gemini'?'https://aistudio.google.com/apikey':'https://cloud.siliconflow.cn/account/ak';
 }
 async openConfiguration(){
  try{this.status=await modelStatus(true);}catch{}
  if(!this.active)return;
  this.setModelState('configure');const details=this.modelState.querySelector('.capture-cloud-config');if(details)details.open=true;
  this.modelState.querySelector('[data-model-provider]')?.focus({preventScroll:true});
 }
 async configure(){
  if(this.configuring)return;
  const input=this.modelState.querySelector('[data-model-key]'),button=this.modelState.querySelector('[data-model-configure]'),note=this.modelState.querySelector('[data-config-status]'),providerInput=this.modelState.querySelector('[data-model-provider]');
  if(!input?.value.trim()){input?.focus();return;}this.configuring=true;button.disabled=true;providerInput.disabled=true;input.disabled=true;
  try{
   this.status=await api('/api/capture-config',{method:'POST',body:JSON.stringify({provider:providerInput.value,apiKey:input.value.trim()})});input.value='';modelStatusCache=null;
   if(this.touched){this.remember();this.setModelState('edited');}else{this.raw=null;await this.prepare(true);}if(!this.input.value.trim())await this.refreshMode(true);
  }catch{if(note)note.textContent=tr('配置未保存，请重试');}
  finally{this.configuring=false;if(button.isConnected)button.disabled=false;if(providerInput.isConnected)providerInput.disabled=false;if(input.isConnected)input.disabled=false;}
 }
 async prepare(force=false){
  clearTimeout(this.timer);const raw=this.input.value.trim(),day=localDate(),fileKey=this.fileSignature();
  if(!force&&this.raw===raw&&this.day===day&&this.fileKey===fileKey){await this.pending;return;}
  this.abort?.abort();const rev=++this.revision;this.raw=raw;this.day=day;this.fileKey=fileKey;this.rows=[];this.touched=false;this.modelError=false;this.modelReview=false;this.modelEngine='';this.modelRetained=0;
  this.paintRows();
  if(!raw){
   if(fileKey){const kind=this.editor.kind,text=this.editor.attachments.map(a=>a.name).join('；').slice(0,200);this.rows=keyedRows([{kind,text,source:text,date:'',time:'',when:kind==='record'?'event':'scheduled',candidates:[]}]);this.paintRows();}
   if(this.captureMode==='manual')this.setModelState('offline');return;
  }
  this.abort=new AbortController();const signal=this.abort.signal;
  this.setModelState('working');
  this.pending=(async()=>{let timeout;
   try{
    const status=await modelStatus(force);if(rev!==this.revision||signal.aborted)return;
    this.status=status;this.captureMode=status.mode==='manual'&&status.reason==='offline'?'manual':'model';this.form.dataset.captureMode=this.captureMode;
    if(this.captureMode==='manual')this.rows=keyedRows(propose(raw,this.tasks(),day));
    // Only reviewed drafts or model results resume online. Old automatic rule previews do not.
    try{const saved=JSON.parse(localStorage.getItem(this.key));if(saved?.raw===raw&&saved.day===day&&(saved.fileKey||'')===fileKey&&Array.isArray(saved.rows)){
     const corrected=saved.rows.some(r=>Object.values(r.corrected||{}).some(Boolean));
     if(corrected||saved.version===5&&saved.provider===status.provider&&saved.modelEngine&&saved.modelEngine!=='rules'&&saved.captureMode!=='manual'||this.captureMode==='manual'&&saved.version===5){
      this.rows=keyedRows(saved.rows);this.modelEngine=saved.modelEngine||'';this.modelRetained=Number(saved.modelRetained)||0;this.touched=corrected;
      this.setModelState(this.captureMode==='manual'?'offline':corrected?'edited':this.modelRetained?'partial':'ready');this.paintRows();return;
     }
     if(this.captureMode==='manual'&&saved.rows.length===this.rows.length&&this.rows.every((r,i)=>r.source===saved.rows[i].source))this.rows=this.rows.map((r,i)=>restoreRow(r,saved.rows[i],saved.version));
    }}catch{}
    if(this.captureMode==='manual'){this.modelEngine='rules';this.setModelState('offline');this.paintRows();this.remember();return;}
    if(!status.available){this.modelError=true;this.setModelState(status.reason==='missing-key'?'setup':'error');return;}
    timeout=setTimeout(()=>this.abort?.abort(),35000);
    const result=await api('/api/capture-parse',{method:'POST',signal,body:JSON.stringify({text:raw,day,language:locale()})});
    if(rev!==this.revision||this.touched||signal.aborted)return;
    if(!Array.isArray(result.rows)||result.rows.length>20||!result.engine)throw Error('Invalid model result');
    this.captureMode=result.mode==='manual'&&result.reason==='offline'?'manual':'model';this.form.dataset.captureMode=this.captureMode;
    this.rows=keyedRows(result.rows.map(r=>{
     const row={...r,source:r.source||raw,candidates:[],target:''};
     if(row.kind==='record'){row.date||=day;row.when='event';row.candidates=candidates(row.text,this.tasks());if(row.candidates.length){row.kind=row.candidates.length===1&&row.candidates[0].score===1?'complete':'choose';if(row.kind==='complete')row.target=row.candidates[0].id;}}
     return row;
    }));
    this.modelEngine=result.engine;this.modelRetained=Number(result.retained)||0;this.modelError=false;this.setModelState(this.captureMode==='manual'?'offline':this.modelRetained?'partial':'ready');this.remember();this.paintRows();
   }catch{if(rev!==this.revision||this.touched)return;this.modelError=true;this.setModelState('error');}
   finally{clearTimeout(timeout);}
  })();await this.pending;
 }
 change(el){
  const r=this.rows?.[Number(el.dataset.row)],f=el.dataset.field;if(!r||!f)return;
  const val=el.value;let repaint=false;
  if(f==='kind'){
   if(val.startsWith('id:')){r.kind='complete';r.target=val.slice(3);}else if(val.startsWith('plan:')){
    const frequency=val.slice(5),previous=r.plan?.repeatFrequency;r.kind='plan';r.target='';r.plan={...defaultPlan(),...r.plan,repeatFrequency:frequency};
    if(previous&&previous!==frequency){r.plan.slots=r.plan.slots.map(s=>({...s,day:frequency==='monthly'?'1':'0'}));r.plan.weekdaysOnly=false;}
    r.corrected={...r.corrected,plan:true};
   }else{r.kind=val;r.target='';if(val==='record'){r.date||=localDate();r.when='event';}if(val==='task'&&r.when==='event')r.when='scheduled';if(val==='plan')r.plan||=defaultPlan();}if(r.kind!=='task'){r.afterKey='';r.corrected={...r.corrected,afterKey:true};}
   r.corrected={...r.corrected,kind:true};repaint=true;
  }else if(f==='afterKey'){
   r.afterKey=val;r.corrected={...r.corrected,afterKey:true};
  }else if(f==='taskRemind'){
   r.remind=el.checked;r.corrected={...r.corrected,remind:true};
  }else if(['frequency','scheduling','count','slotTime','slotDay','start','end','lead','weekdays','remind'].includes(f)){
   const p=r.plan;if(!p)return;
   if(f==='frequency'){p.repeatFrequency=val;p.slots.forEach(s=>s.day=val==='monthly'?'1':'0');p.weekdaysOnly=false;repaint=true;}
   else if(f==='scheduling'){p.scheduling=val;if(val==='times'&&!p.slots.length)p.slots=[slot(p)];p.targetCount=val==='count'?1:p.slots.length;repaint=true;}
   else if(f==='count')p.targetCount=Number(val);
   else if(f==='slotTime'||f==='slotDay')p.slots[Number(el.dataset.index)][f==='slotTime'?'time':'day']=val;
   else if(f==='start'||f==='end')p[f==='start'?'startDate':'endDate']=val;
   else if(f==='lead')p.leadMinutes=Number(val);
   else p[f==='weekdays'?'weekdaysOnly':'remind']=el.checked;
   r.corrected={...r.corrected,plan:true};
  }else{r[f]=val;r.corrected={...r.corrected,[f]:true};}
  this.touched=true;this.abort?.abort();this.modelError=false;this.modelReview=true;this.setModelState(this.captureMode==='manual'?'offline':'edited');this.remember();if(repaint){this.paintRows();this.box.querySelector(`[data-row="${el.dataset.row}"][data-field="${f}"]`)?.focus({preventScroll:true});}else this.refreshSummaries();
 }
 effective(r,v=this.editor.values()){
  const row={...r};const e=this.editor,record=e.kind==='record',corrected=r.corrected||{};
  if(r.kind==='record'){
   if(record){row.recordOptions={title:v.title?.trim(),durationMinutes:v.durationMinutes?Number(v.durationMinutes):null,important:this.form.elements.important.checked,effort:v.effort};
    if(!this.active&&e.timingEdited){const current=localMinute(new Date());if(!corrected.date)row.date=e.timingApplied?v.date:current.slice(0,10);if(!corrected.time)row.time=e.timingApplied?v.time:current.slice(11);}}
   const current=localMinute(new Date());row.date||=current.slice(0,10);if(!row.time&&!row.period&&row.date===current.slice(0,10)&&!corrected.time)row.time=current.slice(11);
  }
  if(!record&&['task','plan'].includes(r.kind)){
   row.taskOptions={status:v.status==='done'?'next':v.status,priority:v.priority,recordId:v.recordId,startedAt:e.startedManually&&v.startedAt?new Date(v.startedAt).toISOString():undefined};
   if(!this.active&&r.kind==='task'&&e.timingApplied&&!corrected.when&&!corrected.date&&!corrected.time){row.when='due';row.date=v.due;row.time=v.dueTime;}
  }
  if(row.time&&row.time!==r.time||corrected.time&&row.time)row.period='';
  if(row.kind!=='task'||!hasReminderTime(row.date,row.time))row.remind=false;
  if(r.kind==='plan'&&r.plan?.scheduling==='count')row.plan={...r.plan,slots:[],leadMinutes:0,remind:false};
  return row;
 }
 description(row){const when=row.kind==='plan'?capturePlanLabel(row.plan,locale()).replace(' · ',' '):formatCaptureWhen(row),previous=this.rows?.find(r=>r.previewKey===row.afterKey);return [when,row.text,row.priority==='high'?tr('优先'):row.priority==='low'?tr('较低'):'',row.afterKey?tr('前一步')+'：'+(previous?.text||tr('前一步未保存')):''].filter(Boolean).join(' · ');}
 refreshSummaries(){const v=this.editor.values();this.box.querySelectorAll('.capture-line').forEach((line,i)=>{
  if(!this.rows[i])return;const row=this.effective(this.rows[i],v);line.querySelector('summary span').textContent=this.description(row);
  for(const key of ['date','time','when','priority']){const el=line.querySelector('[data-field="'+key+'"]');const value=key==='priority'?row.priority||row.taskOptions?.priority||'normal':row[key];if(el&&el!==document.activeElement&&el.value!==value)el.value=value||'';}
  if(this.rows[i].remind&&!row.remind){this.rows[i].remind=false;this.remember();}
  const control=line.querySelector('[data-field=taskRemind]');if(control){const exact=hasReminderTime(row.date,row.time);control.parentElement.hidden=!exact;control.disabled=!exact;control.checked=row.remind===true;}
 });}
 planFields(r,i){
  const p=r.plan,attrs=f=>`data-row="${i}" data-field="${f}"`,timed=p.scheduling==='times',weekly=p.repeatFrequency==='weekly',monthly=p.repeatFrequency==='monthly';
  const pick=(f,label,choices,value)=>`<label>${tr(label)}<select ${attrs(f)}>${choices.map(([v,t])=>option(v,t,value)).join('')}</select></label>`;
  const days=weekly?['周一','周二','周三','周四','周五','周六','周日'].map((d,n)=>[String(n),tr(d)]):Array.from({length:31},(_,n)=>[String(n+1),String(n+1)]).concat([['last',tr('最后一天')]]);
  const rows=p.slots.map((s,n)=>`<div class="capture-slot">${weekly||monthly?`<select aria-label="${tr(weekly?'星期':'日期')}" ${attrs('slotDay')} data-index="${n}">${days.map(([v,t])=>option(v,t,s.day)).join('')}</select>`:''}<input type="time" aria-label="${tr('计划时间')}" ${attrs('slotTime')} data-index="${n}" value="${esc(s.time)}"><button type="button" data-slot-action="remove" data-index="${n}" data-row="${i}" aria-label="${tr('删除这次安排')}">×</button></div>`).join('');
  return `<div class="capture-plan-fields">${pick('scheduling','安排方式',[['count',tr('只定次数')],['times',tr('具体时间')]],p.scheduling)}${timed?`<div class="capture-slots">${rows}<button type="button" class="text-button" data-slot-action="add" data-row="${i}">${tr('＋ 添加一次安排')}</button></div>`:`<label>${tr('每周期次数')}<input type="number" min="1" max="60" ${attrs('count')} value="${esc(p.targetCount)}"></label>`}${!monthly&&(!weekly||!timed)?`<label><input type="checkbox" ${attrs('weekdays')} ${p.weekdaysOnly?'checked':''}>${tr('周一至周五')}</label>`:''}
  <details class="plan-extra"><summary>${tr('起止日期与提醒')}</summary><div><label>${tr('开始日期')}<input type="date" ${attrs('start')} value="${esc(p.startDate)}"></label><label>${tr('结束日期 · 可不填')}<input type="date" ${attrs('end')} value="${esc(p.endDate)}"></label>${timed?`<label>${tr('提前显示 · 分钟')}<input type="number" min="0" max="1440" ${attrs('lead')} value="${esc(p.leadMinutes)}"></label><label><input type="checkbox" ${attrs('remind')} ${p.remind?'checked':''}>${tr(hasScheduledReminders(window)?'Windows 系统提醒':'应用运行时提醒')}</label>`:''}</div></details></div>`;
 }
 paintRows(){
  if(!this.rows?.length){this.box.replaceChildren();return;}
  const expanded=this.box.querySelector('.capture-results')?.open;
  const open=new Set([...this.box.querySelectorAll('.capture-line[open]')].map(el=>el.dataset.line));
  const options=(r,i)=>{
   const choices=[...(['choose','review'].includes(r.kind)?[[r.kind,name(r.kind)]]:[]),['task',tr('不重复')],...Object.entries(freqText).map(([k,t])=>['plan:'+k,tr(t)]),['record',name('record')],...(r.candidates||[]).map(c=>['id:'+c.id,tr('完成')+' · '+c.title]),['skip',name('skip')]];
   const value=r.kind==='complete'?'id:'+r.target:r.kind==='plan'?'plan:'+r.plan.repeatFrequency:r.kind;
   return '<label class="capture-arrangement">'+tr('安排')+'<select data-field="kind" data-row="'+i+'" aria-label="'+tr('安排')+'">'+choices.map(([v,t])=>option(v,t,value)).join('')+'</select></label>';
  };
  const v=this.editor.values();this.box.innerHTML=this.rows.map((r,i)=>{
   const row=this.effective(r,v),attrs=f=>`data-row="${i}" data-field="${f}"`;
   const start=r.kind==='task'&&r.scheduledDate?`<div class="capture-timing"><label>${tr('开始日期')}<input type="date" aria-label="${tr('开始日期')}" ${attrs('scheduledDate')} value="${esc(r.scheduledDate)}"></label><label>${tr('开始时间')}<input type="time" aria-label="${tr('开始时间')}" ${attrs('scheduledTime')} value="${esc(r.scheduledTime||'')}"></label></div>`:'';
   const date=['record','task'].includes(r.kind)?`<div class="capture-timing"><label>${r.kind==='task'?`<select aria-label="${tr('日期用途')}" ${attrs('when')}>${option('scheduled',tr('安排日期'),row.when)}${option('due',tr('截止日期'),row.when)}</select>`:tr('发生日期')}<input aria-label="${tr('日期')}" type="date" ${attrs('date')} value="${esc(row.date)}"></label><label>${tr('时间')}<input aria-label="${tr('时间')}" type="time" ${attrs('time')} value="${esc(row.time)}"></label></div>`:r.kind==='plan'?this.planFields(r,i):'';
   return `<details class="capture-line" data-line="${i}" ${open.has(String(i))?'open':''}><summary><span>${esc(this.description(row))}</span>${['review','choose','complete','skip'].includes(r.kind)?'<small>'+esc(name(r.kind))+'</small>':''}</summary><div class="capture-line-fields"><input data-field="text" data-row="${i}" value="${esc(r.text)}" aria-label="${tr('事项内容')}">${options(r,i)}${start}${date}</div></details>`;
  }).join('');
  for(const line of this.box.querySelectorAll('.capture-line')){const i=Number(line.dataset.line),r=this.rows[i];if(!['task','plan'].includes(r.kind))continue;
   line.querySelector('.capture-line-fields').insertAdjacentHTML('beforeend',`<label>${tr('优先级')}<select aria-label="${tr('优先级')}" data-row="${i}" data-field="priority">${[['normal',tr('普通')],['high',tr('优先')],['low',tr('较低')]].map(([value,label])=>option(value,label,r.priority||v.priority||'normal')).join('')}</select></label>`);
  }
  for(const line of this.box.querySelectorAll('.capture-line')){const i=Number(line.dataset.line),r=this.rows[i];if(r.kind!=='task'||!i)continue;
   const previous=this.rows.slice(0,i).filter(row=>row.kind==='task');
   const choices=[['',tr('独立任务')],...previous.map(row=>[row.previewKey,row.text])];
   if(r.afterKey&&!previous.some(row=>row.previewKey===r.afterKey))choices.push([r.afterKey,tr('前一步未保存')]);
   line.querySelector('.capture-line-fields').insertAdjacentHTML('beforeend',`<label>${tr('前一步')}<select aria-label="${tr('前一步')}" data-row="${i}" data-field="afterKey">${choices.map(([value,label])=>option(value,label,r.afterKey||'')).join('')}</select></label>`);
  }
  const results=document.createElement('details');results.className='capture-results';results.open=!!expanded;
  const summary=document.createElement('summary');summary.textContent=tr`${this.rows.filter(r=>r.kind!=='skip').length} 项 · 查看/修改`;results.append(summary,...this.box.childNodes);this.box.append(results);
  this.installTaskReminders();
 }
 installTaskReminders(){
  if(!hasScheduledReminders(window))return;
  for(const line of this.box.querySelectorAll('.capture-line')){const i=Number(line.dataset.line);if(this.rows[i].kind!=='task')continue;
   line.querySelector('.capture-line-fields').insertAdjacentHTML('beforeend',`<label hidden><input type="checkbox" data-row="${i}" data-field="taskRemind">${tr('Windows 系统提醒')}</label>`);
  }
  this.refreshSummaries();
 }
 async submit(){
  const origin=this.form.closest('.page-panel')?.id.replace(/-page$/,'');
  await this.prepare();if(this.modelError&&!this.modelReview)throw Error(tr('请等待整理完成，或点击重试；原文会保留'));const unresolved=this.rows.findIndex(r=>r.kind==='review'||r.kind==='choose');
  if(unresolved!==-1){
   const line=this.box.querySelector('[data-line="'+unresolved+'"]');if(line){line.closest('.capture-results').open=true;line.open=true;requestAnimationFrame(()=>line.querySelector('[data-field=kind]')?.focus({preventScroll:true}));}
   throw Error(tr('请先选择这条内容的去向'));
  }
  const selected=this.rows.filter(r=>r.kind!=='skip');
  const v=this.editor.values();
  if(!this.active&&this.editor.kind==='task'&&this.editor.timingApplied&&selected.some(r=>r.kind==='task')&&(!v.due||!v.dueTime)){
   this.editor.expand(true);requestAnimationFrame(()=>this.editor.deadlineControls?.focusMissing());throw Error(tr('补上日期和时间，或取消勾选截止日期'));
  }
  if(!this.active&&this.editor.kind==='record'&&this.editor.timingApplied&&this.editor.timingEdited&&selected.some(r=>r.kind==='record')&&(!v.date||!v.time)){this.editor.expand(true);throw Error(tr('请填写日期和时间（精确到分钟），或关闭“应用”'));}
  const rows=selected.map(r=>this.effective(r,v));for(const r of rows)if(r.kind==='plan'&&r.plan.scheduling==='times'&&(!r.plan.slots.length||r.plan.slots.some(s=>!clockPattern.test(s.time))))throw Error(tr('请给每次安排填写时间'));
  await this.save(rows,this.raw,this.editor,origin);try{localStorage.removeItem(this.key);}catch{}this.raw=null;
 }
}
