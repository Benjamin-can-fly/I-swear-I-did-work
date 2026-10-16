import {tr} from './i18n.js';
import {esc} from './ui.js';
let anchor=null,menu=null;
function positionMenu(){
 if(!anchor?.isConnected||!menu||menu.hidden)return;
 const r=anchor.getBoundingClientRect();
 menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.right-menu.offsetWidth))+'px';
 menu.style.top=(r.bottom+menu.offsetHeight+8<innerHeight?r.bottom+5:Math.max(8,r.top-menu.offsetHeight-5))+'px';
}
export function closeEntryMenu(focus=false){
 if(!menu)return;menu.hidden=true;anchor?.setAttribute('aria-expanded','false');
 if(focus&&anchor?.isConnected)anchor.focus({preventScroll:true});anchor=null;
}
export function openEntryMenu(button,actions){
 if(anchor===button){closeEntryMenu(true);return;}
 closeEntryMenu();anchor=button;
 if(!menu){
  menu=document.createElement('div');menu.id='entry-menu';menu.className='entry-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',tr('条目操作'));document.body.append(menu);
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!anchor?.contains(e.target))closeEntryMenu();});
  document.addEventListener('keydown',e=>{if(!anchor)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeEntryMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...menu.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:items.length-1))%items.length].focus();}else if(e.key==='Tab')closeEntryMenu();},true);
  window.addEventListener('resize',positionMenu);document.addEventListener('scroll',positionMenu,true);
 }
 menu.innerHTML=actions.map((a,i)=>`<button type="button" role="menuitem" data-menu-index="${i}" class="${a.danger?'danger':''}">${esc(a.label)}</button>`).join('');
 menu.onclick=e=>{const item=e.target.closest('[data-menu-index]');if(!item)return;const action=actions[Number(item.dataset.menuIndex)];closeEntryMenu();action.run();};
 menu.hidden=false;button.setAttribute('aria-expanded','true');positionMenu();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)menu.animate([{opacity:0,transform:'translateY(-4px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:180,easing:'ease-out'});
 menu.querySelector('button').focus({preventScroll:true});
}
