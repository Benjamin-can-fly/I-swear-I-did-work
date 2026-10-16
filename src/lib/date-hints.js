import {locale} from './i18n.js';
import {tr} from './i18n.js';
// Localize the empty hint without replacing the native calendar or keyboard editor.
export function refreshDateHints(root=document){
 for(const input of root.querySelectorAll('input[type="date"],input[type="datetime-local"],input[type="month"]')){
  let wrap=input.parentElement;
  if(!wrap.classList.contains('date-hint-wrap')){
   wrap=document.createElement('span');wrap.className='date-hint-wrap';
   input.before(wrap);wrap.append(input);
   const hint=document.createElement('span');hint.className='date-empty-hint';hint.textContent=input.type==='datetime-local'?tr('年/月/日 时:分'):input.type==='month'?tr('年/月'):tr('年/月/日');hint.setAttribute('aria-hidden','true');wrap.append(hint);
   input.lang=locale();input.setAttribute('aria-placeholder',tr('年/月/日'));
   const sync=()=>wrap.classList.toggle('date-empty',!input.value);
   input.addEventListener('input',sync);input.addEventListener('change',sync);input.addEventListener('blur',sync);
  }
  wrap.classList.toggle('date-empty',!input.value);
 }
}
