import {tr} from '../lib/i18n.js';
import {esc,icon} from '../lib/ui.js';
import {localDate} from '../lib/dates.js';
export class PlanControls {
 constructor(editor){
  this.editor=editor;this.form=editor.form;this.slots=[];
  this.form.querySelector('.expand-fields').insertAdjacentHTML('beforebegin',tr(`<label class="repeat-option">安排方式<select name="repeatFrequency" aria-label="安排方式"><option value="none">普通待办</option><option value="daily">每日计划</option><option value="weekly">每周计划</option><option value="monthly">每月计划</option></select></label><div class="plan-count" hidden><span class="period-label"></span><button type="button" data-count-step="-1" aria-label="减少次数">−</button><input name="targetCount" aria-label="每周期次数" type="number" min="1" max="60" value="1"><button type="button" data-count-step="1" aria-label="增加次数">＋</button><span>次</span><button type="button" class="text-button arrange-times" aria-expanded="false">安排时间</button></div>`));
  this.form.querySelector('.composer-tools').insertAdjacentHTML('afterend',tr(`<section class="plan-times" hidden><div class="plan-times-heading"><strong>具体时间</strong><button type="button" class="text-button count-only">只定次数</button></div><div class="plan-slots"></div><button type="button" class="text-button add-plan-slot">＋ 添加一次安排</button><p class="hint">每个时刻单独完成。同一天可以添加多次。</p><p class="hint month-note" hidden>月份没有所选日期时，安排在最后一天；相同时刻只保留一次。</p></section><p class="plan-time-summary" hidden></p>`));
  this.form.querySelector('.composer-fields').insertAdjacentHTML('afterbegin',tr(`<div class="plan-options" hidden><div class="form-grid"><label class="form-field">开始日期<input type="date" name="startDate"></label><label class="form-field">结束日期 · 可不填<input type="date" name="endDate"></label></div><div class="form-grid"><label class="form-field">提前显示 · 分钟<input type="number" name="leadMinutes" min="0" max="1440" value="30"><small>0 表示准时显示，最多提前 24 小时。</small></label><label class="important-field"><input type="checkbox" name="remind">应用运行时提醒</label></div><p class="hint">关闭应用后不会提醒；下次打开会保留未完成事项。</p><label class="important-field apply-current" hidden><input type="checkbox" name="applyCurrent">同时更新本周期未完成的安排</label><p class="hint edit-plan-note" hidden>默认更新尚未到时的安排；已完成的记录保留。更改周期从下个周期生效。</p></div>`));
  this.form.querySelector('.arrange-times').onclick=()=>{const box=this.form.querySelector('.plan-times');box.hidden=!box.hidden;if(!box.hidden){this.mode='times';if(!this.slots.length)this.slots=Array.from({length:Number(this.form.elements.targetCount.value)||1},(_,i)=>this.newSlot(i));this.rows();}this.sync();this.editor.draft();};
  this.form.querySelector('.count-only').onclick=()=>{this.mode='count';this.form.querySelector('.plan-times').hidden=true;this.sync();this.editor.draft();};
  this.form.querySelector('.add-plan-slot').onclick=()=>{if(this.slots.length>=60)return;this.slots.push(this.newSlot(this.slots.length));this.rows();this.sync();this.editor.draft();};
  this.form.querySelectorAll('[data-count-step]').forEach(b=>b.onclick=()=>{this.form.elements.targetCount.value=Math.max(1,Math.min(60,Number(this.form.elements.targetCount.value)+Number(b.dataset.countStep)));this.editor.draft();});
  this.form.querySelector('.plan-slots').addEventListener('input',e=>{const row=e.target.closest('[data-slot-id]');if(!row)return;const slot=this.slots.find(s=>s.id===row.dataset.slotId);slot[e.target.dataset.slotField]=e.target.value;this.sync();this.editor.draft();});
  this.form.querySelector('.plan-slots').onclick=e=>{const b=e.target.closest('[data-remove-slot]');if(!b)return;this.slots=this.slots.filter(s=>s.id!==b.dataset.removeSlot);if(!this.slots.length)this.mode='count';this.rows();this.sync();this.editor.draft();};
  this.form.elements.repeatFrequency.addEventListener('change',()=>{this.slots=this.slots.map((s,i)=>({...s,day:this.frequency()==='weekly'?String(i%7):String(i%28+1)}));this.rows();this.sync();});
 }
 frequency(){return this.form.elements.repeatFrequency.value;}
 newSlot(i){return {id:crypto.randomUUID().slice(0,8),day:this.frequency()==='weekly'?String(i%7):String(i%28+1),time:String(8+Math.floor(i/2)%14).padStart(2,'0')+':'+(i%2?'30':'00')};}
 values(){return {scheduling:this.mode||'count',slots:structuredClone(this.slots),remind:this.form.elements.remind.checked,applyCurrent:this.form.elements.applyCurrent.checked};}
 fill(v){this.mode=v.scheduling||'count';this.slots=structuredClone(v.slots||[]);if(v.remind!==undefined)this.form.elements.remind.checked=v.remind;if(v.applyCurrent!==undefined)this.form.elements.applyCurrent.checked=v.applyCurrent;this.form.querySelector('.plan-times').hidden=true;this.rows();}
 rows(){const f=this.frequency(),days=f==='weekly'?[tr('周一'),tr('周二'),tr('周三'),tr('周四'),tr('周五'),tr('周六'),tr('周日')]:Array.from({length:31},(_,i)=>tr`${i+1} 日`).concat(tr('最后一天'));
 this.form.querySelector('.plan-slots').innerHTML=this.slots.map(s=>`<div class="plan-slot" data-slot-id="${esc(s.id)}">${f==='daily'?'':`<select aria-label="${tr(f==='weekly'?'星期':'日期')}" data-slot-field="day">${days.map((d,i)=>{const value=f==='weekly'?String(i):i===31?'last':String(i+1);return `<option value="${value}" ${String(s.day)===value?'selected':''}>${d}</option>`;}).join('')}</select>`}<input type="time" step="60" aria-label="${tr('计划时间')}" data-slot-field="time" value="${esc(s.time)}"><button type="button" class="icon-button" data-remove-slot="${esc(s.id)}" aria-label="${tr('删除这次安排')}">×</button></div>`).join('');}
 sync(){const f=this.frequency(),on=f!=='none',timed=this.mode==='times';this.form.classList.toggle('repeat-enabled',on);
 this.form.querySelector('.month-note').hidden=f!=='monthly';this.form.querySelector('.plan-count').hidden=!on;this.form.querySelector('.plan-options').hidden=!on;
 this.form.querySelector('.period-label').textContent={daily:tr('每天'),weekly:tr('每周'),monthly:tr('每月')}[f]||'';
 const count=this.form.elements.targetCount;count.disabled=timed;this.form.querySelectorAll('[data-count-step]').forEach(b=>b.disabled=timed);if(timed)count.value=this.slots.length||1;
 if(!on)this.form.querySelector('.plan-times').hidden=true;
 const open=!this.form.querySelector('.plan-times').hidden;this.form.querySelector('.arrange-times').setAttribute('aria-expanded',String(open));
 const arrange=this.form.querySelector('.arrange-times'),caption=timed?tr('修改时间'):tr('安排时间');if(arrange.textContent!==caption)arrange.textContent=caption;
 const summary=this.form.querySelector('.plan-time-summary');summary.hidden=!on||!timed||open;
 summary.textContent=this.slots.map(s=>(f==='weekly'?[tr('周一'),tr('周二'),tr('周三'),tr('周四'),tr('周五'),tr('周六'),tr('周日')][Number(s.day)]+' ':f==='monthly'?(s.day==='last'?tr('最后一天'):tr`${s.day} 日`)+' ':'')+s.time).join(' · ');
 this.form.querySelector('.apply-current').hidden=!this.editor.item?.startDate;this.form.querySelector('.edit-plan-note').hidden=!this.editor.item?.startDate;
 this.form.elements.leadMinutes.disabled=!on||!timed;this.form.elements.remind.disabled=!on||!timed;
 this.form.querySelector('.inline-date-control').hidden=on;this.form.querySelector('.inline-time-control').hidden=on;this.form.querySelector('.apply-time').hidden=on;
 this.form.querySelector('.action-label').textContent=on?tr('保存计划'):tr('保存待办');
 this.form.querySelector('.time-application-note').textContent=on?(timed?tr('按安排时间生成待办'):tr('不指定时间，完成一次勾一次')):this.editor.timingApplied?'':tr('不设截止时间');
 this.form.elements.repeatFrequency.disabled=Boolean(this.editor.item&&!this.editor.item.startDate);
 this.form.elements.repeatFrequency.querySelector('[value="none"]').disabled=Boolean(this.editor.item?.startDate);
 if(on&&!this.form.elements.startDate.value)this.form.elements.startDate.value=localDate();
 }
}
