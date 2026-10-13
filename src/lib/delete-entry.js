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
 return {data:next,removed:structuredClone(removed)};
}
export function restoreDeleted(data,removed){
 const next=structuredClone(data);
 for(const key of ['records','tasks'])for(const item of removed[key])if(!next[key].some(x=>x.id===item.id))next[key].push(structuredClone(item));
 for(const ref of removed.references){const t=next.tasks.find(t=>t.id===ref.id);if(t&&!t.recordId&&next.records.some(r=>r.id===ref.recordId))t.recordId=ref.recordId;}
 return next;
}
