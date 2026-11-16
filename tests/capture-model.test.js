import test from 'node:test';
import assert from 'node:assert/strict';
import {propose} from '../src/lib/capture.js';
import {modelCleanedRows} from '../src/lib/capture-model-contract.js';
const day='2026-11-05';
test('model cleanup cannot drop rows, quantities, timing restrictions, or invent actions for bare subject labels',()=>{
 const raw='今晚21点前补完csp作业然后学数学，还有seminar（优先级高）',rows=propose(raw,[],day);
 assert.throws(()=>modelCleanedRows(rows,['交作业','seminar'],raw,day));
 const fixed=modelCleanedRows(rows,['补完CSP作业','学数学','参加Seminar'],raw,day);
 assert.equal(fixed.rows.length,3);assert.equal(fixed.rows[2].text,'seminar');assert.equal(fixed.retained,1);
 for(const row of fixed.rows){assert.equal(row.date,day);assert.equal(row.time,'21:00');}
 assert.equal(fixed.rows[2].priority,'high');
 for(const raw of ['打印两份报告','买一本笔记本','给王老师发报告','修改第8页的PPT','阅读《边城》','每天晚上八点背50个单词，周一到周五，明天开始']){
  const rows=propose(raw,[],day);const result=modelCleanedRows(rows,rows.map(()=> '整理资料'),raw,day);assert.deepEqual(result.rows,rows);assert.equal(result.retained,rows.length);
 }
});
test('model cannot remove negation or uncertainty; chain and structured metadata stay owned by source rows',()=>{
 const raw='我可能明天交报告，但不确定，不要安排',rows=propose(raw,[],day);
 assert.deepEqual(modelCleanedRows(rows,rows.map(()=> '提交报告'),raw,day).rows,rows);
 const chain=propose('写完作文之后检查一遍',[],day);const result=modelCleanedRows(chain,['写作文','检查作文'],'写完作文之后检查一遍',day);
 assert.equal(result.rows[1].afterIndex,0);assert.equal(result.rows[0].kind,'task');
 const english=propose('Please write the report',[],day);assert.deepEqual(modelCleanedRows(english,['写报告'],'Please write the report',day).rows,english);
});
