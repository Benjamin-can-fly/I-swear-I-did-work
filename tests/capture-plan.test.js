import test from 'node:test';
import assert from 'node:assert/strict';
import {propose,applyCapture,capturePlanLabel} from '../src/lib/capture.js';
import {materializeDaily,todayTasks} from '../src/lib/daily.js';
import {mergeDataChanges} from '../src/lib/data-sync.js';
import {emptyData} from '../src/lib/model.js';

const base='2026-11-04';
const at=(day,hour)=>new Date(day+'T'+hour+':00').toISOString();
const save=(s,day=base)=>applyCapture(emptyData(),propose(s,[],day),s,{at:at(day,'10:00')});
test('a typed daily time sets each occurrence’s deadline; the next day is independent',()=>{
 const raw='每天晚上8：00钟记单词.....';
 const [r]=propose(raw,[],base);assert.equal(r.kind,'plan');assert.equal(r.text,'记单词');assert.equal(capturePlanLabel(r.plan,'en'),'Daily · 20:00');
 const data=save(raw),[plan]=data.routines,[occurrence]=data.tasks;
 assert.equal(plan.captureRaw,raw);assert.equal(occurrence.routineId,plan.id);
 assert.deepEqual([occurrence.due,occurrence.dueTime,occurrence.title],[base,'20:00','记单词']);
 assert.equal(todayTasks(data.tasks,base,at(base,'19:59')).daily.length,1);
 assert.equal(todayTasks(data.tasks,base,at(base,'20:00')).daily.length,1);
 occurrence.status='done';const next=materializeDaily(data,'2026-11-05',at('2026-11-05','20:01'));
 assert.equal(next.tasks[0].status,'done');assert.equal(todayTasks(next.tasks,'2026-11-05',at('2026-11-05','20:01')).daily[0].status,'next');
});
test('weekly and monthly quotas set flexible counts, keep action details, never invent times or deadlines',()=>{
 for(const [s,frequency,n,title] of [
  ['我一周需要写3篇日记','weekly',3,'写日记'],['每月复盘两次','monthly',2,'复盘'],
  ['Write in my journal three times a week','weekly',3,'Write in my journal'],['每天背50个单词','daily',1,'背50个单词']
 ]){
  const data=save(s),[p]=data.routines;assert.deepEqual([p.repeatFrequency,p.targetCount,p.title,p.scheduling],[frequency,n,title,'count']);
  assert.equal(data.tasks.length,n);assert.ok(data.tasks.every(t=>!t.due&&!t.scheduledAt));
 }
});
test('recurring deadlines leave the action clean; a start time or fuzzy evening is not a deadline',()=>{
 for(const raw of ['每天晚上八点截止，背单词','每天背单词，晚上八点截止']){
  const [t]=save(raw).tasks;assert.deepEqual([t.title,t.due,t.dueTime],['背单词',base,'20:00']);
 }
 const [start]=save('每天晚上八点开始练琴').tasks;
 assert.deepEqual([start.title,start.scheduledTime,start.due],['练琴','20:00','']);
 const [fuzzy]=save('每天晚上背单词').tasks;
 assert.deepEqual([fuzzy.title,fuzzy.timePeriod,fuzzy.due,fuzzy.dueTime],['背单词','evening','','']);
});
test('weekday restrictions, multiple daily reminders and monthly dates survive materialization',()=>{
 const school=save('每周一到周五晚上八点背单词','2026-11-06');
 const sat=materializeDaily(school,'2026-11-07',at('2026-11-07','21:00'));
 assert.equal(todayTasks(sat.tasks,'2026-11-07',at('2026-11-07','21:00')).daily.length,0);
 const [dose]=save('每天8点、12点和晚上8点吃药，提前半小时提醒我').routines;
 assert.deepEqual(dose.slots.map(t=>t.time),['08:00','12:00','20:00']);assert.equal(dose.leadMinutes,30);assert.equal(dose.remind,true);
 for(const s of ['每周一和周四下午3点练口语','Every Monday and Thursday at 3 PM practice speaking']){
  const [p]=save(s).routines;assert.deepEqual(p.slots.map(t=>[t.day,t.time]),[['0','15:00'],['3','15:00']]);
 }
 const [m]=save('每月最后一天晚上八点做月报').tasks;assert.deepEqual([m.routineDate,m.dueTime],['2026-11-30','20:00']);
 assert.equal(propose('从明天起每天晚上8点背单词',[],base)[0].plan.startDate,'2026-11-05');
});
test('uncertain, negated and unsupported repetitions do not write a plan or complete a task',()=>{
 for(const s of ['可能每天晚上八点写日记','不要每天提醒我','每隔两天整理资料','每天25:99记单词','每周一和四写日记','每天早中晚吃药','每天三次但只在早上8点吃药']){
  const [r]=propose(s,[],base);assert.equal(r?.kind,'review',s);assert.equal(r.guarded,true);assert.throws(()=>applyCapture(emptyData(),[r],s));
 }
 assert.notEqual(propose('今天过了美好的一天',[],base)[0].kind,'plan');
});
test('one capture saves mixed content and can undo the plan and its generated occurrences together',()=>{
 const raw='写完了报告。明天交报告。每天20:00记单词',before=emptyData();
 const rows=propose(raw,[],base);assert.deepEqual(rows.map(r=>r.kind),['record','task','plan']);
 rows[0].recordOptions={title:'实验报告',durationMinutes:35,important:true,effort:'high'};
 rows[1].taskOptions={priority:'high',recordId:'linked',status:'paused',startedAt:at(base,'08:30')};
 const saved=applyCapture(before,rows,raw,{at:at(base,'10:00')});
 assert.deepEqual([saved.records[0].title,saved.records[0].durationMinutes,saved.records[0].effort,saved.records[0].important],['实验报告',35,'high',true]);
 assert.deepEqual([saved.tasks[0].priority,saved.tasks[0].status,saved.tasks[0].recordId],['high','paused','linked']);
 const undo=mergeDataChanges(saved,before,saved);
 assert.equal(undo.tasks.length,0);assert.equal(undo.records.length,0);assert.equal(undo.routines?.length||0,0);
});
test('explicit plan bounds, recurrence counts and local priority are extracted into fields',()=>{
 const raw='从11月6日开始每周写3篇日记（优先级高），到11月30日结束';
 const [p]=save(raw).routines;
 assert.deepEqual([p.title,p.startDate,p.endDate,p.targetCount,p.priority],['写日记','2026-11-06','2026-11-30',3,'high']);
 for(const s of ['从11月30日起每天记单词，到11月6日结束','每天记单词，到11月31日结束'])assert.equal(propose(s,[],base)[0].kind,'review');
});
test('multiple plans share a daily clock or weekly frequency, while local counts stay separate',()=>{
 const daily=save('每天晚上8点背单词，然后复习数学').routines;
 assert.deepEqual(daily.map(p=>[p.title,p.slots[0].time]),[['背单词','20:00'],['复习数学','20:00']]);
 const weekly=save('每周写三篇日记，还有跑步两次').routines;
 assert.deepEqual(weekly.map(p=>[p.title,p.repeatFrequency,p.targetCount]),[['写日记','weekly',3],['跑步','weekly',2]]);
});
