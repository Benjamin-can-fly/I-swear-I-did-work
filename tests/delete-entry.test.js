import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteEntry,restoreDeleted} from '../src/lib/delete-entry.js';
const fixture=()=>({version:1,records:[{id:'auto',sourceTaskId:'task'},{id:'standalone'},{id:'orphan',sourceTaskId:'missing'}],tasks:[{id:'task',recordId:''},{id:'reference',recordId:'auto'},{id:'solo',recordId:''}]});
for(const collection of ['records','tasks'])test(`从 ${collection} 删除自动关联项，遵循待办单向同步且撤销完整`,()=>{
 const data=fixture(),change=deleteEntry(data,collection,collection==='records'?'auto':'task');
 assert.deepEqual(change.data.records.map(r=>r.id),['standalone','orphan']);assert.deepEqual(change.data.tasks.map(t=>t.id),collection==='records'?['task','reference','solo']:['reference','solo']);assert.equal(change.data.tasks.find(t=>t.id==='reference').recordId,'');
 const restored=restoreDeleted(change.data,change.removed);for(const key of ['records','tasks'])assert.deepEqual(restored[key].sort((a,b)=>a.id.localeCompare(b.id)),data[key].sort((a,b)=>a.id.localeCompare(b.id)));
 assert.equal(restoreDeleted(restored,change.removed).records.length,3);
});
test('独立项及已失去来源的条目仅删除自身；引用不是身份',()=>{
 const data=fixture();assert.equal(deleteEntry(data,'records','standalone').data.tasks.length,3);assert.equal(deleteEntry(data,'records','orphan').data.tasks.length,3);assert.equal(deleteEntry(data,'tasks','reference').data.records.length,3);assert.equal(deleteEntry(data,'tasks','solo').data.records.length,3);
 assert.equal(deleteEntry(data,'records','missing'),null);assert.equal(data.records.length,3);
});
