import test from 'node:test';
import assert from 'node:assert/strict';
import {todayCompletedCount} from '../src/lib/today-count.js';
import {usageScale,usageChart} from '../src/components/usage-chart.js';
import {localDate} from '../src/lib/dates.js';
import {sortTasks,taskListOrder,deadlineTone,countdown} from '../src/lib/deadlines.js';
const date='2026-10-17',at=new Date(2026,9,17,9,30).toISOString();
test('today stays above an older active weekly quota, even with descending dates',()=>{
 const day='2026-11-04',base={status:'next',createdAt:at};
 const rows=[
  {...base,id:'weekly',routineId:'writing',routineDate:'2026-11-03',routineEnd:'2026-11-08',priority:'high'},
  {...base,id:'words',routineId:'words',routineDate:day,routineEnd:day,priority:'high'},
  {...base,id:'evening',due:day,dueTime:'20:00'},
  {...base,id:'morning',scheduledDate:day,scheduledTime:'08:30'},
  {...base,id:'later',due:'2026-11-06',priority:'high'},
  {...base,id:'no-clock',status:'today'},
  {...base,id:'low',due:day,dueTime:'07:00',priority:'low'}];
 const today=['words','morning','evening','no-clock','low'];
 for(const order of ['asc','desc'])assert.deepEqual(taskListOrder(rows,day,order).map(t=>t.id),
  [...today,...(order==='asc'?['weekly','later']:['later','weekly'])]);
 assert.equal(rows[0].id,'weekly');
});
test('list sorting uses scheduled times; starting a timed routine is not a deadline',()=>{
 const plain={id:'a',status:'next',createdAt:at,scheduledDate:date,scheduledTime:'08:00'};
 const routine={...plain,id:'b',scheduling:'times',scheduleOnly:true,routineId:'p',routineDate:date,routineEnd:date,scheduledTime:'20:00'};
 const due={id:'c',status:'next',createdAt:at,due:date,dueTime:'12:00'};
 assert.deepEqual(sortTasks([routine,due,plain]).map(t=>t.id),['a','c','b']);
 const late=new Date(date+'T20:01:00');
 assert.equal(deadlineTone(plain,late),'neutral');assert.equal(deadlineTone(routine,late),'neutral');
 assert.equal(countdown(routine,late).text,'20:00');assert.equal(deadlineTone(due,late),'overdue');
 assert.equal(deadlineTone(routine,new Date('2026-10-18T00:01:00')),'overdue');
});
test('Today counts event dates, not entry dates or deadlines',()=>{
 const data={records:[{id:'old',date:'2026-10-16',createdAt:at},{id:'today',date,createdAt:'2026-10-16'}],tasks:[
 {id:'future-due',status:'done',due:'2026-10-20',completedAt:at},
 {id:'old-done',status:'done',due:date,completedAt:new Date(2026,9,16,23,59).toISOString()},
 {id:'pending',status:'next',due:date},
 {id:'unknown',status:'done',due:date,createdAt:at}]};
 assert.equal(todayCompletedCount(data,date),2);
});
test('Mirrors count once; undo and local midnight use actual completion',()=>{
 const task={id:'task',status:'done',completedAt:at};
 const data={tasks:[task],records:[{id:'mirror1',date,sourceTaskId:'task'},{id:'mirror2',date,sourceTaskId:'task'},{id:'independent',date,recordId:'task'}]};
 assert.equal(todayCompletedCount(data,date),2);
 task.status='next';task.completedAt='';assert.equal(todayCompletedCount(data,date),1);
 task.status='done';task.completedAt=new Date(2026,9,18,0,1).toISOString();assert.equal(todayCompletedCount(data,date),1);
 assert.equal(todayCompletedCount(data,localDate(new Date(task.completedAt))),1);
});
test('Orphaned records remain counted and generic associations do not merge events',()=>{
 assert.equal(todayCompletedCount({records:[{id:'a',date,sourceTaskId:'missing'},{id:'b',date,sourceTaskId:'missing'},{id:'c',date}],tasks:[]},date),2);
});
test('Usage scale is sparse, integral, bounded above all bars and grows with data',()=>{
 assert.deepEqual(usageScale(10),{max:10,ticks:[0,5,10]});assert.deepEqual(usageScale(50),{max:50,ticks:[0,25,50]});
 for(const max of [0,1,2,3,8,11,38,51,600,9999]){const s=usageScale(max);assert.ok(s.max>=max);assert.ok(s.ticks.length<=4);assert.equal(s.ticks[0],0);assert.equal(s.ticks.at(-1),s.max);assert.ok(s.ticks.every(Number.isInteger));}
});
test('Usage tooltips are themed markup, keyboard accessible and not native titles',()=>{
 const html=usageChart([{date,save:10},{date:'2026-10-18',save:0}]);
 assert.doesNotMatch(html,/\btitle=|<title>|style=/);assert.match(html,/role="tooltip"/);assert.match(html,/aria-describedby="usage-tip-0"/);assert.match(html,/height="0"/);
});
