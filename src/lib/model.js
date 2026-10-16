import { validDate } from './dates.js';
export const emptyData=()=>({version:1,records:[],tasks:[]});
const str=(v,n)=>typeof v==='string'&&v.length<=n;
const optionalDate=v=>v===''||validDate(v);
export function validateData(d) {
  if(!d||d.version!==1||!Array.isArray(d.records)||!Array.isArray(d.tasks)||d.records.length>20000||d.tasks.length>20000)throw Error('备份格式不正确或条目过多');
  if(d.routines!==undefined){
   if(!Array.isArray(d.routines)||d.routines.length>1000)throw Error('每日计划格式不正确或数量过多');
   validateData({version:1,records:[],tasks:d.routines});
   for(const p of d.routines)if(!str(p.id,60)||!validDate(p.startDate)||!optionalDate(p.endDate)||p.endDate&&p.endDate<p.startDate||typeof p.active!=='boolean'||p.repeatDaily!==true||!optionalDate(p.lastGeneratedDate||''))throw Error('每日计划日期或设置不正确');
  }
  const ids=new Set();
  for(const entry of [...d.records,...d.tasks])if(entry.attachments!==undefined){
   if(!Array.isArray(entry.attachments)||entry.attachments.length>50)throw Error('每条最多添加 50 个附件');
   for(const a of entry.attachments)if(!a||!str(a.id,36)||!/^[a-f0-9-]{36}$/.test(a.id)||!str(a.name,200)||!Number.isInteger(a.size)||a.size<1||a.size>20*1024*1024||typeof a.image!=='boolean'||!str(a.type,100))throw Error('附件信息不正确');
  }
  for(const r of d.records) {
    if(r.sourceTaskId!==undefined&&!str(r.sourceTaskId,100))throw Error('待办来源不正确');
    if(r.taskSyncOwned!==undefined&&typeof r.taskSyncOwned!=='boolean')throw Error('待办同步标记不正确');
    if(r.durationMinutes!=null&&(!Number.isInteger(r.durationMinutes)||r.durationMinutes<1||r.durationMinutes>1440))throw Error('耗时应为 1—1440 分钟的整数');
    if(r.effort!==undefined&&!['auto','light','normal','high'].includes(r.effort))throw Error('投入程度不正确');
    if(r.important!==undefined&&typeof r.important!=='boolean')throw Error('重点标记不正确');
    if(r.summary !== undefined && !str(r.summary,20000))throw Error('总结内容不正确');
    if(!str(r.id,100)||!r.id||ids.has(r.id)||!str(r.title,200)||!r.title.trim()||!str(r.details,20201)||!str(r.raw,20201)||!validDate(r.date)||!str(r.time,5)||!(r.time===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))||!str(r.project,80)||!str(r.createdAt,100)||!Number.isFinite(Date.parse(r.createdAt))||!Array.isArray(r.suggestions)||r.suggestions.length>100)throw Error('记录字段不正确');
    ids.add(r.id);
    for(const s of r.suggestions)if(!str(s.title,200)||!s.title.trim()||!optionalDate(s.due))throw Error('待办建议格式不正确');
  }
  const tids=new Set();
  for(const t of d.tasks) {
    if(t.routineId!==undefined&&(!str(t.routineId,60)||!t.routineId||!validDate(t.routineDate)))throw Error('每日任务来源不正确');
    if(t.scheduledDate!==undefined&&!optionalDate(t.scheduledDate))throw Error('安排日期不正确');
    if(t.autoSyncRecord!==undefined&&typeof t.autoSyncRecord!=='boolean')throw Error('自动同步设置不正确');
    for(const key of ['startedAt','completedAt'])if(t[key]!==undefined&&t[key]!==''&&(!str(t[key],100)||!Number.isFinite(Date.parse(t[key]))))throw Error('任务时间不正确');
    if(t.startedAt&&t.completedAt&&new Date(t.completedAt)<new Date(t.startedAt))throw Error('完成时间不能早于开始时间');
    if(t.content!==undefined&&!str(t.content,20201))throw Error('事项内容不正确');
    if(t.dueTime !== undefined && (typeof t.dueTime!=='string'||!(t.dueTime===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime))||(t.dueTime&&!t.due)))throw Error('截止时间需要有效日期和时分');
    if(!str(t.id,100)||!t.id||tids.has(t.id)||!str(t.title,200)||!t.title.trim()||!str(t.notes,20201)||!str(t.project,80)||!optionalDate(t.due)||!['today','next','paused','done'].includes(t.status)||!['normal','high','low'].includes(t.priority)||!str(t.recordId,100)||!str(t.createdAt,100)||!Number.isFinite(Date.parse(t.createdAt)))throw Error('待办字段不正确');
    tids.add(t.id);
  }
  return d;
}
export function mergeData(current,incoming) {
  validateData(incoming);
  return validateData({version:1,records:[...current.records,...incoming.records.filter(r=>!current.records.some(x=>x.id===r.id))],tasks:[...current.tasks,...incoming.tasks.filter(t=>!current.tasks.some(x=>x.id===t.id))],...((current.routines||incoming.routines)?{routines:[...(current.routines||[]),...(incoming.routines||[]).filter(p=>!(current.routines||[]).some(x=>x.id===p.id))]}:{})});
}
