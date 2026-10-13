// Mouse / clickable trackpad only. Touch keeps its normal scrolling behavior.
export function installTaskGesture(root,complete){
 let gesture=null,suppressUntil=0;
 root.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.pointerType!=='mouse')return;
  const row=e.target.closest('.task-row:not(.completed)');
  if(!row||e.target.closest('a,input,select,.task-check,.task-more,.task-meta'))return;
  gesture={row,id:row.dataset.task,x:e.clientX,y:e.clientY,pointer:e.pointerId,active:false,cancelled:false};
 });
 const clear=()=>{if(gesture){gesture.row.classList.remove('swipe-ready','swiping');gesture.row.style.removeProperty('--swipe-progress');}gesture=null;};
 document.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;
  if(!(e.buttons&1)){clear();return;}
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(Math.hypot(dx,dy)>12)gesture.moved=true;
  if(Math.abs(dy)>28)gesture.cancelled=true;
  if(gesture.cancelled)return;
  const bounds=gesture.row.getBoundingClientRect();
  if(e.clientY<bounds.top||e.clientY>bounds.bottom){gesture.cancelled=true;return;}
  if(Math.abs(dx)>12){gesture.active=true;gesture.row.classList.add('swiping');e.preventDefault();}
  const progress=Math.min(1,Math.abs(dx)/Math.min(150,Math.max(65,bounds.width*.18)));
  gesture.ready=progress===1;gesture.row.classList.toggle('swipe-ready',gesture.ready);gesture.row.style.setProperty('--swipe-progress',String(progress));
 });
 document.addEventListener('pointerup',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;
  const {id,row,active,ready,cancelled,moved}=gesture;
  if(moved)suppressUntil=performance.now()+600;
  clear();if(active&&ready&&!cancelled)void complete(id,row);
 });
 document.addEventListener('pointercancel',clear);window.addEventListener('blur',clear);
 root.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
}
