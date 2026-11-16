import {localDate} from './dates.js';
// sourceTaskId is identity; recordId is only a reference and must not cascade.
export function deleteEntry(data,collection,id){
 const item=data[collection].find(x=>x.id===id);if(!item)return null;
 const next=structuredClone(data),taskIds=new Set(),recordIds=new Set();
 if(collection==='tasks')taskIds.add(id);
 else recordIds.add(id);
 for(const r of data.records)if(taskIds.has(r.sourceTaskId))recordIds.add(r.id);
 const removed={records:data.records.filter(r=>recordIds.has(r.id)),tasks:data.tasks.filter(t=>taskIds.has(t.id)),references:[]};
 next.records=next.records.filter(r=>!recordIds.has(r.id));
 next.tasks=next.tasks.filter(t=>!taskIds.has(t.id)).map(t=>{
  if(!recordIds.has(t.recordId))return t;
  removed.references.push({id:t.id,recordId:t.recordId});return {...t,recordId:''};
 });
 // Imported/older plans can have real occurrences but no generation marker.
 // Record that their period already existed before removing an occurrence, so
 // the next refresh does not regenerate it. Undo restores the item, not stale
 // generation bookkeeping; future periods continue as usual.
 for(const task of removed.tasks){
  const plan=next.routines?.find(p=>p.id===task.routineId),period=task.routinePeriod||task.routineDate;
  if(!plan||!/^\d{4}-\d{2}-\d{2}$/.test(period||''))continue;
  plan.generatedPeriods=[...new Set([...(plan.generatedPeriods||[]),period])].sort().slice(-3);
  plan.lastGeneratedDate=[plan.lastGeneratedDate||'',period].sort().at(-1);
 }
 return {data:next,removed:structuredClone(removed)};
}
export function restoreDeleted(data,removed){
 const next=structuredClone(data);
 for(const key of ['records','tasks','routines'])for(const item of removed[key]||[]){next[key]??=[];if(!next[key].some(x=>x.id===item.id))next[key].push(structuredClone(item));}
 for(const ref of removed.references||[]){const t=next.tasks.find(t=>t.id===ref.id);if(t&&!t.recordId&&next.records.some(r=>r.id===ref.recordId))t.recordId=ref.recordId;}
 return next;
}
export function deleteEntries(data,collection,ids){
 let next=data;const removed={records:[],tasks:[],references:[]};
 for(const id of new Set(ids)){
  const change=deleteEntry(next,collection,id);if(!change)continue;
  next=change.data;
  for(const key of Object.keys(removed))removed[key].push(...change.removed[key]);
 }
 return next===data?null:{data:next,removed};
}

// A plan owns both its template and already generated upcoming occurrences.
// Removing only the template leaves those occurrences waiting to reappear on
// their dates. Keep completed work and past missed occurrences as history.
export function deletePlan(data,id,day=localDate()){
 const plan=data.routines?.find(p=>p.id===id);if(!plan)return null;
 const ids=data.tasks.filter(t=>t.routineId===id&&t.status!=='done'&&(t.routineEnd||t.routineDate||t.scheduledDate||t.due)>=day).map(t=>t.id);
 const change=deleteEntries(data,'tasks',ids)||{data:structuredClone(data),removed:{records:[],tasks:[],references:[]}};
 change.data.routines=change.data.routines.filter(p=>p.id!==id);
 change.removed.routines=[structuredClone(plan)];
 return change;
}
