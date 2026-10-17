import {resizeTextareas} from './autosize.js';
import {refreshDateHints} from './date-hints.js';
import {taskCheck} from '../components/tasks.js';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const running=new WeakMap(),folds=new WeakMap();
const interactive='button,summary,a[href],input,select,textarea,[role="button"],.file-button';
const selectors=[['new-today','[data-new-today]'],['organize','#organize'],['summary','#generate-summary'],['complete','.task-check'],['chart','[data-chart-date]'],['nav','.nav-item,.brand'],['create','#new-task'],['save','button[type=submit],[data-suggest]'],['close','[data-close],.cancel-edit,.attachment-remove,.clear-composer'],['danger','.danger'],['date-arrow','[data-shift],[data-task-shift],[data-history-shift],[data-inline-date-shift],[data-calendar-shift],[data-data-offset]'],['date','[data-calendar],#go-today,#calendar-open'],['segment','[data-view],[data-task-view],[data-history-layout],[data-task-filter],[data-stat-days],[data-data-tab],[data-calendar-mode],[data-calendar-unit],[data-calendar-layout]'],['fold','summary'],['checkbox','input[type=checkbox]'],['select','select'],['field','input,textarea'],['download','#export-json,#export-md'],['upload','.file-button'],['edit','[data-edit-record],[data-edit-task]'],['link','[data-link-record],.recap-entry,.next-task'],['secondary','.secondary'],['text','.text-button,button,a']];
const classify=el=>el.id==='export-report-pdf'?'save':el.hasAttribute('data-report-close')?'close':el.matches('button,input')&&el.form&&el.type==='submit'?'save':selectors.find(([,s])=>el.matches(s))?.[0]||'text';
const target=e=>{const el=e.target.closest(interactive)||e.target.closest('label')?.querySelector('input,select,textarea');return el?.closest('.file-button')||el;};
function play(el,frames,duration=280,options={}){
 if(!el||reduced())return null;
 running.get(el)?.cancel();const a=el.animate(frames,{duration,easing:'cubic-bezier(.22,1,.36,1)',...options});running.set(el,a);return a;
}
const finished=a=>a?.finished.catch(()=>{});
const jelly=new WeakMap();
function jellyPress(el){
 const animation=play(el,[{transform:getComputedStyle(el).transform,borderRadius:getComputedStyle(el).borderRadius},{transform:'translateY(2px) scale(1.065,.85)',borderRadius:'14px'}],150,{fill:'forwards',easing:'cubic-bezier(.2,.65,.3,1)'});
 jelly.set(el,{animation,phase:'press'});
}
export function jellyRelease(el){
 if(reduced())return;
 const current=jelly.get(el);if(current?.phase==='release'&&current.animation?.playState==='running')return current.animation;
 const from=getComputedStyle(el).transform;
 const frame=(transform,offset,radius)=>({transform,offset,borderRadius:radius+'px',easing:'cubic-bezier(.35,0,.25,1)'});
 const animation=play(el,[frame(from,0,11),frame('translateY(2px) scale(1.065,.85)',.10,14),frame('translateY(-1.2px) scale(.955,1.09)',.36,8),frame('translateY(.6px) scale(1.028,.958)',.60,11),frame('translateY(-.2px) scale(.987,1.022)',.79,8),frame('translateY(0) scale(1.006,.993)',.91,9),frame('translateY(0) scale(1,1)',1,8)],660,{easing:'linear'});
 void scatterIcon(el);const label=el.querySelector('.action-label'),kind=classify(el);
 const lift=kind==='create'?-5:kind==='save'?-3:-4;
 play(label,[{transform:'translateY(2px) scale(.97)',offset:0},{transform:`translateY(${lift}px) scale(1.04)`,offset:.36},{transform:'translateY(1.2px) scale(.99)',offset:.65},{transform:'translateY(-.5px) scale(1.01)',offset:.84},{transform:'translateY(0) scale(1)',offset:1}],560,{delay:45,easing:'linear'});
 jelly.set(el,{animation,phase:'release'});return animation;
}
export async function waitForJelly(el){await finished(jelly.get(el)?.animation);}
export async function scatterIcon(button,exit=false){
 const glyph=button.querySelector('.assemble-icon');
 if(!exit)play(glyph,[{transform:'rotate(-8deg) scale(1)'},{transform:'rotate(110deg) scale(.92)',offset:.3},{transform:'rotate(286deg) scale(1.12)',offset:.64},{transform:'rotate(371deg) scale(.98)',offset:.85},{transform:'rotate(352deg) scale(1)'}],680,{easing:'cubic-bezier(.22,.6,.25,1)'});
 const pieces=[...button.querySelectorAll('.assemble-icon i')],vectors=[[-8,-7],[8,-6],[-7,8],[9,7]];
 await Promise.all(pieces.map((piece,i)=>{const [x,y]=vectors[i];return finished(play(piece,exit?[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${x*2}px,${y*2}px) rotate(${i%2?80:-80}deg) scale(.35)`,opacity:0}]:[{transform:'translate(0,0) rotate(0)'},{transform:`translate(${x}px,${y}px) rotate(${i%2?55:-55}deg) scale(.75)`,offset:.28},{transform:`translate(${-x*.18}px,${-y*.18}px) rotate(-8deg) scale(1.15)`,offset:.68},{transform:'translate(0,0) rotate(0) scale(1)'}],exit?310:620,{easing:'cubic-bezier(.25,.7,.25,1)'}));}));
}
function resolve(el){
 if(el.isConnected)return el;
 if(el.id)return document.getElementById(el.id);
 const key=[...el.attributes].find(a=>a.name.startsWith('data-')&&a.name!=='data-motion');
 return key?document.querySelector(`[${key.name}="${CSS.escape(key.value)}"]`):null;
}
function glider(group){
 const selected=group?.querySelector('button.selected');if(!selected)return;
 let slider=group.querySelector('.segment-glider');if(!slider){slider=document.createElement('span');slider.className='segment-glider';slider.setAttribute('aria-hidden','true');group.prepend(slider);}
 group.classList.add('has-glider');
 Object.assign(slider.style,{left:selected.offsetLeft+'px',top:selected.offsetTop+'px',width:selected.offsetWidth+'px',height:selected.offsetHeight+'px'});
 return slider;
}
function underline(el){
 el.classList.remove('ink-action');void el.offsetWidth;el.classList.add('ink-action');
 setTimeout(()=>el.classList.remove('ink-action'),420);
}
function activate(el,kind,previous){
 if(reduced()||!el)return;
 el.dataset.lastMotion=kind;
 switch(kind){
  case 'close':play(el.querySelector('svg')||el,[{transform:'rotate(0)'},{transform:'rotate(-9deg)',offset:.25},{transform:'rotate(6deg)',offset:.55},{transform:'rotate(-2deg)',offset:.8},{transform:'rotate(0)'}],180);break;
  case 'segment':{const slider=glider(el.closest('.segmented'));if(slider&&previous){const now=el.getBoundingClientRect();play(slider,[{transform:`translateX(${previous.left-now.left}px) scaleX(${previous.width/now.width})`},{transform:'translateX(0) scaleX(1)'}],320);}break;}
  case 'date-arrow':{const n=Number(el.dataset.shift||el.dataset.taskShift||el.dataset.historyShift||el.dataset.inlineDateShift||el.dataset.calendarShift||1);play(el,[{transform:'translateX(0)'},{transform:`translateX(${n<0?-5:5}px)`,offset:.45},{transform:'translateX(0)'}],260);break;}
  case 'chart':{const svg=el.closest('svg'),point=svg?.querySelector(`circle[data-date="${el.dataset.chartDate}"]`);play(point,[{transform:'scale(.55)',opacity:.5},{transform:'scale(1.35)',opacity:1,offset:.55},{transform:'scale(1)'}],340);play(document.querySelector('.chart-readout'),[{opacity:.35},{opacity:1}],220);break;}
  case 'create':jellyRelease(el);play(el.querySelector('.add-glyph'),[{transform:'rotate(0) scale(1)'},{transform:'rotate(100deg) scale(1.2)',offset:.6},{transform:'rotate(90deg) scale(1)'}],500);break;
  case 'organize':jellyRelease(el);if(el.dataset.state!=='working')play(el.querySelector('svg'),[{transform:'rotate(0)'},{transform:'rotate(180deg)'}],420);break;
  case 'summary':jellyRelease(el);break;
  case 'save':jellyRelease(el);play(el.querySelector('.submit-glyph'),[{transform:'translateY(2px) scale(.65)'},{transform:'translateY(-2px) scale(1.2)',offset:.45},{transform:'translateY(0) scale(1)'}],480);break;
  case 'date':play(el,[{backgroundColor:'var(--tone-d4e6cf,#d4e6cf)',clipPath:'inset(10% round 6px)'},{backgroundColor:'transparent',clipPath:'inset(0% round 6px)'}],280);break;
  case 'checkbox':play(el,[{transform:'scale(.8)'},{transform:'scale(1.15)',offset:.6},{transform:'scale(1)'}],240);break;
  case 'field':play(el,[{boxShadow:'inset 0 -2px var(--tone-658b70,#658b70)',backgroundColor:'var(--tone-f1f7ef,#f1f7ef)'},{boxShadow:'inset 0 0 var(--tone-658b7000,#658b7000)',backgroundColor:'#ffffff'}],400);break;
  case 'select':play(el,[{borderColor:'var(--tone-567f61,#567f61)',backgroundColor:'var(--tone-e7f1e3,#e7f1e3)'},{borderColor:'var(--tone-e7ece8,#e7ece8)',backgroundColor:'#fff'}],380);break;
  case 'download':case 'upload':play(el.querySelector('svg')||el,[{translate:'0 0',opacity:1},{translate:`0 ${kind==='download'?7:-7}px`,opacity:.35,offset:.5},{translate:'0 0',opacity:1}],360);break;
  case 'edit':case 'link':underline(el);break;
  case 'danger':play(el,[{backgroundColor:'#f5dfd6',color:'#963f29'},{backgroundColor:'transparent',color:'#b07d60'}],420);break;
  case 'secondary':play(el,[{boxShadow:'inset 0 0 0 1px var(--tone-7e9b74,#7e9b74)',backgroundColor:'var(--tone-edf4e9,#edf4e9)'},{boxShadow:'inset 0 0 0 0px var(--tone-7e9b7400,#7e9b7400)',backgroundColor:'#fff'}],260);break;
  case 'text':underline(el);break;
  // Navigation, completion, folding and closing animate the affected content.
 }
}
async function fold(summary){
 const details=summary.parentElement,old=folds.get(details),open=!(old?.open??details.open),start=details.getBoundingClientRect().height;
 old?.animation?.cancel();
 if(reduced()){details.open=open;return;}
 details.open=true;const end=open?details.scrollHeight:summary.getBoundingClientRect().height;
 details.style.overflow='hidden';details.dataset.folding=open?'open':'closed';
 const animation=play(details,[{height:start+'px'},{height:end+'px'}],280);const state={animation,open};folds.set(details,state);await finished(animation);
 if(folds.get(details)!==state)return;
 details.open=open;details.style.overflow='';delete details.dataset.folding;folds.delete(details);
}
function navGlider(){const nav=document.querySelector('.sidebar nav'),active=nav?.querySelector('.nav-item.active'),slider=nav?.querySelector('.nav-indicator');if(active&&slider)Object.assign(slider.style,{transform:`translate(${active.offsetLeft}px,${active.offsetTop}px)`,width:active.offsetWidth+'px',height:active.offsetHeight+'px'});}
export function refreshMotion(){refreshDateHints();document.querySelectorAll(interactive).forEach(el=>el.dataset.motion=classify(el));document.querySelectorAll('.segmented').forEach(glider);navGlider();resizeTextareas();}
export function installMotion(){
 refreshMotion();
 document.addEventListener('pointerdown',e=>{const el=target(e);if(!el||el.disabled)return;if(['organize','save','create','summary'].includes(classify(el))){if(e.button===0)try{el.setPointerCapture(e.pointerId);}catch{}jellyPress(el);}});
 const release=e=>{const el=target(e);if(el&&['organize','save','create','summary'].includes(classify(el)))jellyRelease(el);};
 document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);
 document.addEventListener('pointerout',e=>{const el=target(e);if(e.buttons&&el&&!el.contains(e.relatedTarget))release(e);});
 document.addEventListener('click',e=>{
  const el=target(e);if(!el||el.disabled||el.hasAttribute('data-window'))return;const kind=classify(el);
  if(e.detail===0&&['organize','save','create','summary'].includes(kind))jelly.delete(el);
  if(kind==='fold'){e.preventDefault();void fold(el);return;}
  const previous=kind==='segment'?el.closest('.segmented')?.querySelector('button.selected')?.getBoundingClientRect():null;
  queueMicrotask(()=>activate(resolve(el),kind,previous));
 },true);
 document.addEventListener('change',e=>{const el=target(e);if(el)queueMicrotask(()=>activate(resolve(el),classify(el)));},true);
 window.addEventListener('resize',()=>{document.querySelectorAll('.segmented').forEach(glider);navGlider();});
}

let pageAnimation,currentTransition,transitionVersion=0;
export function transitionPage(update,direction=1){
 const version=++transitionVersion;currentTransition?.skipTransition();
 if(reduced()||!document.startViewTransition){update();pageTransition(document.querySelector('.page-panel:not([hidden])'),direction);return;}
 document.documentElement.dataset.pageDirection=direction<0?'back':'forward';
 currentTransition=document.startViewTransition(()=>{if(version===transitionVersion)update();});currentTransition.ready.catch(()=>{});currentTransition.finished.catch(()=>{});
}
export function pageTransition(el,direction=1){pageAnimation?.cancel();pageAnimation=play(el,[{opacity:0,transform:`translateX(${direction*24}px)`},{opacity:1,transform:'translateX(0)'}],320);}
export function openDialog(dialog){
 dialog.showModal();refreshMotion();
 const mode=dialog.dataset.mode||'calendar';
 if(mode==='create'||mode==='edit'){
  const frame=(transform,offset,opacity=1)=>({transform,offset,opacity,easing:'cubic-bezier(.25,.55,.3,1)'});
  play(dialog,[frame('translateY(26px) scale(.91,.86)',0,0),frame('translateY(-5px) scale(1.025,1.045)',.36),frame('translateY(2px) scale(.99,.976)',.61),frame('translateY(-1px) scale(1.004,1.01)',.81),frame('translateY(0) scale(1,1)',1)],560,{easing:'linear'});
 }else play(dialog,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],240);
}
const closing=new WeakSet();
export async function closeDialog(dialog){if(closing.has(dialog))return;closing.add(dialog);try{await finished(play(dialog,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(8px)'}],170));dialog.close();}finally{closing.delete(dialog);}}
export function listTransition(el,kind='fade',direction=1){return play(el,kind==='date'?[{opacity:.2,transform:`translateX(${direction*18}px)`},{opacity:1,transform:'translateX(0)'}]:[{opacity:.35},{opacity:1}],220);}

export function beginProcessing(button,label){
 const caption=button.querySelector('.action-label'),old=caption.textContent,start=performance.now();jellyRelease(button);button.disabled=true;button.dataset.state='working';button.setAttribute('aria-busy','true');caption.textContent=label;
 return async(success=true)=>{
  if(success&&!reduced()){await waitForJelly(button);await new Promise(r=>setTimeout(r,Math.max(0,320-(performance.now()-start))));button.dataset.state='success';caption.textContent='已完成';await new Promise(r=>setTimeout(r,160));}
  delete button.dataset.state;button.removeAttribute('aria-busy');button.disabled=false;caption.textContent=old;
 };
}
export async function taskCompletion(row,done){
 if(!row||reduced())return;
 const button=row.querySelector('.task-check');button.disabled=true;row.classList.toggle('finishing',done);
 if(done){button.innerHTML=taskCheck;button.setAttribute('aria-pressed','true');await finished(play(button.querySelector('path'),[{strokeDasharray:'28',strokeDashoffset:'28'},{strokeDasharray:'28',strokeDashoffset:'0'}],240));}
 else await finished(play(button,[{opacity:1},{opacity:.25}],160));
 await finished(play(row,[{height:row.getBoundingClientRect().height+'px',minHeight:0,opacity:1,paddingTop:'25px',paddingBottom:'25px'},{height:'0px',minHeight:0,paddingTop:0,paddingBottom:0,opacity:0}],230));
}


export async function newTaskFeedback(button){
 button.dataset.lastMotion='new-today';
 play(button,[{transform:'scale(1)'},{transform:'scale(.96)',offset:.35},{transform:'scale(1.015)',offset:.7},{transform:'scale(1)'}],190);
 await finished(play(button.querySelector('svg'),[{transform:'rotate(0)'},{transform:'rotate(-14deg) translateY(-2px)',offset:.35},{transform:'rotate(7deg)',offset:.7},{transform:'rotate(0)'}],190));
}
export function composerEntrance(form){return play(form,[{opacity:.65,transform:'translateY(8px) scale(.99)'},{opacity:1,transform:'translateY(-1px) scale(1.003)',offset:.7},{opacity:1,transform:'translateY(0) scale(1)'}],230);}
