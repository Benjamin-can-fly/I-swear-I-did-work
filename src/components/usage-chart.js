import {tr} from '../lib/i18n.js';
import {esc} from '../lib/ui.js';

export function usageScale(maximum){
 const max=Math.max(0,Number(maximum)||0);
 if(max<=2)return {max:2,ticks:[0,1,2]};
 const raw=max/2,power=10**Math.floor(Math.log10(raw));
 const step=[1,2,2.5,5,10].map(n=>n*power).find(n=>n>=raw&&Number.isInteger(n))||Math.ceil(raw);
 const top=Math.ceil(max/step)*step;
 return {max:top,ticks:Array.from({length:Math.round(top/step)+1},(_,i)=>i*step)};
}
export function usageChart(events){
 const scale=usageScale(Math.max(0,...events.map(e=>e.save||0)));
 return `<div class="frequency-chart" role="group" aria-label="${tr('每日保存次数')}"><div class="frequency-plot"><div class="frequency-grid" aria-hidden="true">${scale.ticks.map(t=>`<div class="frequency-line"><span>${t}</span></div>`).join('')}</div><div class="frequency-bars">${events.map((e,i)=>{const n=e.save||0,label=tr`${e.date} · ${n} 次`,height=n/scale.max*180;return `<div class="frequency-column"><button type="button" class="frequency-bar" aria-label="${esc(label)}" aria-describedby="usage-tip-${i}"><svg class="frequency-fill" viewBox="0 0 24 180" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="${180-height}" width="18" height="${height}" rx="4"/></svg></button><span class="frequency-tip ${i<events.length/3?'tip-start':i>=events.length*2/3?'tip-end':''}" role="tooltip" id="usage-tip-${i}"><span>${esc(e.date)}</span><strong>${tr`保存 ${n} 次`}</strong></span></div>`;}).join('')}</div></div><div class="frequency-dates">${events.map((e,i)=>`<span>${i===0||i===events.length-1||i===Math.floor((events.length-1)/2)?esc(e.date.slice(5).replace('-','/')):''}</span>`).join('')}</div></div>`;
}
