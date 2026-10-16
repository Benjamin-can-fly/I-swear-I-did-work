import {tr,localizeStatic} from './lib/i18n.js';
localizeStatic();
const key=new URLSearchParams(location.search).get('key'),html=key?.startsWith('workjournal-report-')?sessionStorage.getItem(key):null;
if(html){
 const doc=new DOMParser().parseFromString(html,'text/html');document.title=doc.title;
 document.querySelector('#report-preview').innerHTML=doc.body.innerHTML;
}else document.querySelector('#report-preview').textContent=tr('预览内容已失效，请回到时间线重新导出。');
document.querySelector('#print-report').onclick=()=>window.print();
