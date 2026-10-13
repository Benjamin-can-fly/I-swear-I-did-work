export function resizeTextarea(el){
 if(!el?.matches('textarea')||!el.getClientRects().length)return;
 const style=getComputedStyle(el),min=parseFloat(style.minHeight)||80,max=parseFloat(style.maxHeight)||320;
 const border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),scroll=el.scrollTop;
 el.style.overflowY='hidden';el.style.height=min+'px';
 const natural=el.scrollHeight+border;
 el.style.height=Math.min(max,Math.max(min,natural))+'px';
 el.style.overflowY=natural>max?'auto':'hidden';el.scrollTop=scroll;
}
export function resizeTextareas(root=document){root.querySelectorAll('textarea').forEach(resizeTextarea);}
export function installAutosize(){
 document.addEventListener('input',e=>resizeTextarea(e.target));
 window.addEventListener('resize',()=>resizeTextareas());
 resizeTextareas();
}
