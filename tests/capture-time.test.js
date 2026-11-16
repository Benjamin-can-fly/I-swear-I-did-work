import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCaptureTiming} from '../src/lib/capture-time.js';

const day='2026-11-04',parse=(s,fallback='')=>parseCaptureTiming(s,day,fallback);
test('one-off precise times imply a deadline, while the displayed action stays clean',()=>{
 for(const s of ['我今天晚上八点背单词','晚上8：00钟记单词','今天晚上八点前背单词','今天晚上八点截止，背单词','晚上八点截止背单词','背单词，截止到今晚八点']){
  const action=s.includes('记单词')?'记单词':'背单词';
  assert.deepEqual(parse(s),{text:action,date:day,time:'20:00',period:'evening',when:'due'},s);
 }
});
test('dayparts without a clock stay unspecific, and partial clauses have no action',()=>{
 assert.deepEqual(parse('我今晚背单词'),{text:'背单词',date:day,time:'',period:'evening',when:'scheduled'});
 assert.deepEqual(parse('我今天晚上要和王老师见面'),{text:'和王老师见面',date:day,time:'',period:'evening',when:'scheduled'});
 assert.equal(parse('我今天晚上').text,'');
 assert.equal(parse('我明天晚上八点要').text,'');
 assert.deepEqual(parse('我昨天下午三点见了老师'),{text:'见了老师',date:'2026-11-03',time:'15:00',period:'afternoon',when:'due'});
 assert.equal(parse('我昨天上午').time,'');
});
test('scheduled starts and no-deadline statements take precedence over the implicit clock rule',()=>{
 for(const s of ['今天晚上8点开始背单词','安排在今天晚上8点背单词','今天晚上8点背单词，不设截止时间']){
  assert.deepEqual(parse(s),{text:'背单词',date:day,time:'20:00',period:'evening',when:'scheduled'},s);
 }
});
test('English dayparts, clock digits, hours in words, and standalone trailing modifiers',()=>{
 for(const s of ['Tonight at 8 pm study vocabulary','Study vocabulary tonight at 8 pm']){
  const r=parse(s);assert.equal(r.time,'20:00',s);assert.equal(r.text.toLowerCase(),'study vocabulary');assert.equal(r.when,'due');
 }
 assert.deepEqual(parse('Tomorrow evening at eight read the report'),{text:'read the report',date:'2026-11-05',time:'20:00',period:'evening',when:'due'});
 assert.deepEqual(parse('Send it by noon'),{text:'Send it',date:day,time:'12:00',period:'noon',when:'due'});
 assert.equal(parse('Practice tonight').time,'');
});
test('do not rewrite quoted text, embedded modifiers, or meaningful action pronouns',()=>{
 for(const s of ['看看“我今天晚上要做什么”','准备明天的演讲','Tomorrow’s meeting agenda','今天的会议总结','我记一下实验结果','今天以后改计划','下午茶订了两份','三点建议要写下来'])assert.equal(parse(s),null,s);
 assert.equal(parse('我今天上午要求查看原件').text,'要求查看原件');
 assert.equal(parse('今天我和王老师见面').text,'我和王老师见面');
 assert.equal(parse('晚上八点做  A & B').text,'做  A & B');
});
