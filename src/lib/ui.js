import {tr} from './i18n.js';
export const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icons={book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M13 7a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2',check:'M9 11l3 3 8-9 M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',pen:'M15 4l5 5 M4 20l4-1L21 6l-4-4L4 15z',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',sun:'M12 2v2 m0 16v2 M2 12h2 m16 0h2 M5 5l1 1 m12 12 1 1 M5 19l1-1 M18 6l1-1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'};
icons.timeline='M4 12h16 M7 9v6 M12 6v12 M17 9v6';
icons.chart='M4 4v16h16 M8 15l4-5 4 2 4-7';
icons.palette='M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.8 1.8 0 0 1 1-3.3h3a3 3 0 0 0 3-3c0-4.4-4-8-9-8 M7 9h.01 M10 6h.01 M15 6h.01 M18 9h.01';
icons.settings='M4 7h16 M4 17h16 M9 4v6 M15 14v6';
icons.calendar='M3 5h18v16H3z M7 3v4 M17 3v4 M3 11h18 M8 15h2 M14 15h2';
export const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.book}"/></svg>`;
export function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
export function notify(message,undo){const t=document.querySelector('#toast');t.querySelector('span').textContent=tr(message);t.hidden=false;const b=t.querySelector('button');b.hidden=!undo;b.onclick=async()=>{b.disabled=true;try{await undo();t.hidden=true;}catch(e){notify(e.message);}finally{b.disabled=false;}};clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.hidden=true,undo?15000:5500);}
export async function api(url,options={}) {const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await res.json();if(!res.ok)throw Error(tr(data.error||'请求失败'));return data;}
export function download(name,content,type){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
