import {esc} from './ui.js';
export const fileKind=name=>{const ext=name.split('.').pop().toLowerCase();return /^(pdf)$/.test(ext)?'PDF':/^(doc|docx|odt)$/.test(ext)?'WORD':/^(xls|xlsx|csv|ods)$/.test(ext)?'EXCEL':/^(ppt|pptx)$/.test(ext)?'PPT':ext.slice(0,5).toUpperCase()||'FILE';};
const sizeLabel=n=>n<1024*1024?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1024/1024).toFixed(1)} MB`;
export function attachmentList(items=[],editable=false){
 return `<div class="attachments">${items.map(a=>`<div class="attachment ${a.image?'picture':'document'}"><a href="/api/attachments/${esc(a.id)}" target="_blank" rel="noopener" ${a.image?'':`download="${esc(a.name)}"`} title="${esc(a.name)} · ${sizeLabel(a.size)}" aria-label="打开附件 ${esc(a.name)}">${a.image?`<img src="/api/attachments/${esc(a.id)}/thumbnail" alt="${esc(a.name)}" loading="lazy">`:`<span class="file-icon" data-kind="${fileKind(a.name)}">${fileKind(a.name)}</span><span class="file-caption"><strong>${esc(a.name)}</strong><small>${sizeLabel(a.size)}</small></span>`}</a>${editable?`<button type="button" class="attachment-remove" data-remove-attachment="${esc(a.id)}" aria-label="移除附件 ${esc(a.name)}">×</button>`:''}</div>`).join('')}</div>`;
}
export async function uploadFile(file){
 if(file.size>20*1024*1024)throw Error(`${file.name} 超过 20 MB`);
 const res=await fetch('/api/attachments?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const meta=await res.json();if(!res.ok)throw Error(meta.error||'上传失败');
 if(meta.image&&file.type!=='image/gif')try{
  const bitmap=await createImageBitmap(file),scale=Math.min(1,240/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const thumb=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.8));if(thumb)await fetch(`/api/attachments/${meta.id}/thumbnail`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:thumb});
 }catch{/* Original image remains available if thumbnail generation fails. */}
 return meta;
}
