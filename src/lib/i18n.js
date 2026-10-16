import {en} from '../locales/en.js';
import {zh} from '../locales/zh.js';

export const language=(()=>{try{return localStorage.getItem('worklog.language')==='en'?'en':'zh-CN';}catch{return 'zh-CN';}})();
export const locale=()=>language;
const han=/[\u3400-\u9fff]/;
const missing=new Set();
function normalized(source){const ids=[];return {key:source.replace(/\{(\d+)\}/g,(_,id)=>{if(!ids.includes(id))ids.push(id);return `{${ids.indexOf(id)}}`;}),ids};}
const catalog=new Map(Object.entries(language==='en'?en:zh).map(([key,value])=>{const n=normalized(key);return [n.key,value.replace(/\{(\d+)\}/g,(token,id)=>n.ids.includes(id)?`{${n.ids.indexOf(id)}}`:token)];}));
function phrase(source){
 const key=source.trim();
 const n=normalized(key),message=catalog.get(n.key);
 const translated=message?.replace(/\{(\d+)\}/g,(token,id)=>n.ids[id]!==undefined?`{${n.ids[id]}}`:token);
 if(translated!==undefined)return source.replace(key,translated);
 if(language==='en'&&han.test(key))missing.add(key);
 return source;
}
// Only developer-authored strings reach this function. Interpolated user content
// is inserted AFTER translation, including content that looks like a UI label.
export function messageParts(source,translate=phrase){
 if(!/<[a-z!][\s\S]*>/i.test(source))return translate(source);
 return source.replace(/<[^>]*>|[^<]+/g,part=>part.startsWith('<')
  ?part.replace(/\b(aria-label|aria-placeholder|placeholder|title|alt)="([^"]*)"/g,(_,name,value)=>`${name}="${translate(value)}"`)
  :translate(part));
}
export function tr(source,...values){
 if(typeof source==='string')return messageParts(source);
 const template=source.reduce((s,part,i)=>s+(i?`{${i-1}}`:'')+part,'');
 let message=messageParts(template);
 if(language==='en')message=message.replace(/\{(\d+)\} (tasks|entries|items|days|categories|saves|times)\b/g,(whole,i,unit)=>Number(values[i])===1?`{${i}} ${{tasks:'task',entries:'entry',items:'item',days:'day',categories:'category',saves:'save',times:'time'}[unit]}`:whole);
 return message.replace(/\{(\d+)\}/g,(match,i)=>Number(i)<values.length?String(values[i]??''):match);
}
// Called once on the static document before any user data is rendered.
export function localizeStatic(root=document.body){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let node;node=walker.nextNode();)if(!node.parentElement.closest('script,style'))node.textContent=phrase(node.textContent);
 for(const el of root.querySelectorAll('[placeholder],[aria-label],[title],[alt]'))for(const name of ['placeholder','aria-label','title','alt'])if(el.hasAttribute(name))el.setAttribute(name,phrase(el.getAttribute(name)));
 document.documentElement.lang=language;
}
export function missingMessages(){return [...missing];}
