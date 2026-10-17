import {tr,locale} from '../lib/i18n.js';
import {localDate,validDate,addDays,parseDate} from '../lib/dates.js';

// Native date inputs cannot represent a year/month without inventing a day.
// Keep partial input in the draft, and serialize a deadline only when complete.
export class DeadlineControls {
 constructor(editor){
  this.editor=editor;this.form=editor.form;
  const meta=this.form.querySelector('.composer-meta');meta.classList.add('task-deadline');
  this.button=meta.querySelector('.apply-time');
  this.button.innerHTML='<span class="deadline-check" aria-hidden="true">✓</span><span>'+tr('截止日期')+'</span>';
  this.button.setAttribute('role','checkbox');
  meta.prepend(this.button);
  this.box=document.createElement('div');this.box.className='deadline-segments';
  const parts=[['Year','年',4,1900,9999],['Month','月',2,1,12],['Day','日',2,1,31],['Hour','时',2,0,23],['Minute','分',2,0,59]];
  this.box.innerHTML=parts.map(([key,label,size,min,max])=>`<label class="deadline-part part-${key.toLowerCase()}"><input type="text" inputmode="numeric" name="deadline${key}" maxlength="${size}" aria-label="${tr('截止'+label)}" placeholder="${locale()==='en'?{Year:'YYYY',Month:'MM',Day:'DD',Hour:'hh',Minute:'mm'}[key]:tr(label)}" data-min="${min}" data-max="${max}" autocomplete="off"><span aria-hidden="true">${locale()==='en'?{Year:'/',Month:'/',Day:'',Hour:':',Minute:''}[key]:tr(label)}</span></label>`).join('')+`<span class="deadline-weekday"></span><div class="deadline-shifts"><button type="button" data-deadline-shift="-1" aria-label="${tr('日期前一天')}">‹</button><button type="button" data-deadline-shift="1" aria-label="${tr('日期后一天')}">›</button></div>`;
  this.button.after(this.box);
  this.weekday=meta.querySelector('.inline-weekday');this.weekday.classList.add('deadline-weekday');this.box.querySelector('.deadline-weekday').replaceWith(this.weekday);
  this.box.addEventListener('input',e=>{if(!e.target.name)return;e.target.value=e.target.value.replace(/\D/g,'');this.write();editor.timingEdited=true;});
  this.box.addEventListener('focusout',e=>{const el=e.target;if(!el.name||el.value==='')return;if(el.name!=='deadlineYear')el.value=el.value.padStart(2,'0');this.write();editor.draft();});
  this.box.querySelectorAll('[data-deadline-shift]').forEach(b=>b.onclick=()=>{const date=this.form.elements.due.value;if(!date)return;this.fill({due:addDays(date,Number(b.dataset.deadlineShift)),dueTime:this.form.elements.dueTime.value,deadlineHour:this.form.elements.deadlineHour.value,deadlineMinute:this.form.elements.deadlineMinute.value});editor.timingEdited=true;editor.draft();});
 }
 fill(values){
  if(!('due' in values)&&!('dueTime' in values))return;
  const date=(values.due||localDate().slice(0,7)).split('-'),time=(values.dueTime||'').split(':');
  for(const [i,key] of ['Year','Month','Day','Hour','Minute'].entries())this.form.elements['deadline'+key].value=values['deadline'+key]??([...date.slice(0,2),date[2]||'',time[0]||'',time[1]||''][i]);
  this.write();
 }
 write(){
  const value=key=>this.form.elements['deadline'+key].value;
  const date=[value('Year'),value('Month').padStart(2,'0'),value('Day').padStart(2,'0')].join('-');
  this.form.elements.due.value=value('Day')&&Number(value('Year'))>=1900&&validDate(date)?date:'';
  const hour=value('Hour'),minute=value('Minute');
  this.form.elements.dueTime.value=hour!==''&&minute!==''&&Number(hour)<=23&&Number(minute)<=59?hour.padStart(2,'0')+':'+minute.padStart(2,'0'):'';
  this.weekday.value=this.form.elements.due.value?String((parseDate(date).getDay()+6)%7):'';
  this.weekday.disabled=!this.form.elements.due.value;
  this.box.querySelectorAll('[data-deadline-shift]').forEach(b=>b.disabled=!this.form.elements.due.value);
 }
 sync(){
  const plan=this.editor.planControls?.frequency()!=='none';
  this.form.querySelector('.task-deadline').hidden=plan;
  this.box.hidden=!this.editor.timingApplied;
  this.button.setAttribute('aria-checked',String(this.editor.timingApplied));
  for(const input of this.box.querySelectorAll('input'))input.disabled=!this.editor.timingApplied||plan;
 }
 values(){return Object.fromEntries([...this.box.querySelectorAll('input')].map(el=>[el.name,el.value]));}
 focusMissing(){const input=[...this.box.querySelectorAll('input')].find(el=>!el.value||Number(el.value)<Number(el.dataset.min)||Number(el.value)>Number(el.dataset.max));(input||this.form.elements.deadlineDay).focus();}
}
