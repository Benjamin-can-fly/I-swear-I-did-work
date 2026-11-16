const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>value===undefined?undefined:structuredClone(value);
export class DataConflict extends Error {
 constructor(){super('这条内容也在另一窗口修改了。最新内容已同步，你的输入草稿仍保留；请对照后再修改。');this.name='DataConflict';}
}
function mergeEntry(base,local,remote){
 if(equal(local,base))return clone(remote);
 if(equal(remote,base)||equal(local,remote))return clone(local);
 if(!base||!local||!remote){
  // Two windows may generate the same recurring occurrence at the same instant.
  // The saved occurrence owns its completion state and original timestamps.
  if(!base&&local?.routineId&&local.routineId===remote?.routineId&&local.routineDate===remote.routineDate&&local.occurrenceKey===remote.occurrenceKey)return clone(remote);
  throw new DataConflict();
 }
 const result={};
 for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  const before=base[key],ours=local[key],theirs=remote[key];
  let value;
  if(equal(ours,before))value=theirs;
  else if(equal(theirs,before)||equal(ours,theirs))value=ours;
  else if(key==='generatedPeriods')value=[...new Set([...(ours||[]),...(theirs||[])])].sort().slice(-3);
  else if(key==='lastGeneratedDate'||key==='historyTrackedThrough')value=[ours,theirs].sort().at(-1);
  else throw new DataConflict();
  if(value!==undefined)result[key]=clone(value);
 }
 return result;
}
export function mergeDataChanges(base,local,remote){
 const merged={...structuredClone(remote)};
 for(const collection of ['records','tasks','routines']){
  if(!base[collection]&&!local[collection]&&!remote[collection])continue;
  const before=new Map((base[collection]||[]).map(e=>[e.id,e])),ours=new Map((local[collection]||[]).map(e=>[e.id,e])),theirs=new Map((remote[collection]||[]).map(e=>[e.id,e]));
  const ids=new Set([...theirs.keys(),...ours.keys(),...before.keys()]);
  merged[collection]=[...ids].map(id=>mergeEntry(before.get(id),ours.get(id),theirs.get(id))).filter(Boolean);
 }
 return merged;
}
export async function commitDataChanges({base,next,revision,read,write,validate,reconcile}){
 let candidate=next,currentRevision=revision;
 for(let attempt=0;attempt<4;attempt++){
  try{validate(candidate);const result=await write(candidate,currentRevision);return {data:candidate,revision:result.revision};}
  catch(error){
   if(error.status!==409)throw error;
   const latest=await read();
   try{candidate=mergeDataChanges(base,next,latest.data);reconcile?.(candidate,latest.data);currentRevision=latest.revision;}
   catch(conflict){conflict.latest=latest;throw conflict;}
  }
 }
 throw Error('数据正在连续更新，你的草稿已保留，请稍后再保存。');
}
