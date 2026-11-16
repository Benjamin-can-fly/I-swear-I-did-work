// Dependencies use task identity, never a title. Waiting is derived from the
// current predecessor so reopening or undoing completion needs no repair job.
const tasksOf=value=>Array.isArray(value)?value:value?.tasks||[];
export const dependencyIndex=tasks=>tasks instanceof Map?tasks:new Map(tasksOf(tasks).map(t=>[t.id,t]));
export function prerequisite(task,tasks){return task?.afterTaskId?dependencyIndex(tasks).get(task.afterTaskId)||null:null;}
export function dependencyState(task,tasks){
 const predecessor=prerequisite(task,tasks),missing=Boolean(task?.afterTaskId&&!predecessor);
 return {predecessor,missing,blocked:Boolean(task?.afterTaskId&&task.status!=='done'&&(!predecessor||predecessor.status!=='done'))};
}
export const isTaskBlocked=(task,tasks)=>dependencyState(task,tasks).blocked;
export function assertTaskReady(task,tasks){
 const state=dependencyState(task,tasks);
 if(state.blocked)throw Error(state.missing?'前一步已删除，请先修改关联任务':'请先完成前一步任务');
}
export function newlyReadyTasks(before,after){
 const previous=dependencyIndex(before),current=dependencyIndex(after);
 return [...current.values()].filter(task=>task.afterTaskId&&['next','today'].includes(task.status)&&previous.has(task.id)&&isTaskBlocked(previous.get(task.id),previous)&&!isTaskBlocked(task,current));
}
export function assertReadyTransitions(before,after){
 const previous=dependencyIndex(before),current=dependencyIndex(after);
 for(const task of current.values())if(task.status==='done'&&previous.get(task.id)?.status!=='done')assertTaskReady({...task,status:'next'},current);
}

// Validate iteratively: a long imported chain must not exhaust the JS stack.
// A missing predecessor is a recoverable, visibly blocked relation; cycles are
// not recoverable by completing work and must never be saved.
export function validateDependencies(tasks){
 const index=dependencyIndex(tasks),settled=new Set();
 for(const task of index.values()){
  if(task.afterTaskId!==undefined&&(typeof task.afterTaskId!=='string'||task.afterTaskId.length>100))throw Error('前一步任务关联不正确');
  if(task.afterTaskId===task.id)throw Error('任务不能等待自己完成');
  const parent=index.get(task.afterTaskId);
  if(task.afterTaskId&&[task,parent].some(t=>t&&(t.routineId||t.repeatDaily||['daily','weekly','monthly'].includes(t.repeatFrequency))))throw Error('周期计划暂不支持前后任务关联');
 }
 for(const task of index.values()){
  const path=new Set();let current=task;
  while(current&&!settled.has(current.id)){
   if(path.has(current.id))throw Error('前后任务不能形成循环');
   path.add(current.id);current=current.afterTaskId?index.get(current.afterTaskId):null;
  }
  for(const id of path)settled.add(id);
 }
}
