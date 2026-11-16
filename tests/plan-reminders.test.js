import test from 'node:test';
import assert from 'node:assert/strict';
import {createReminderSync,hasScheduledReminders,planReminderQueue} from '../src/lib/plan-reminders.js';
import {saveDailyPlan} from '../src/lib/daily.js';

const date=(d,time='12:00')=>new Date(`${d}T${time}:00`);
const iso=(d,time)=>date(d,time).toISOString();
const plan=(extra={})=>({id:'read',title:'阅读',startDate:'2026-10-01',endDate:'',active:true,repeatFrequency:'daily',scheduling:'times',slots:[{id:'a',time:'08:15'}],targetCount:1,leadMinutes:30,scheduleOnly:true,remind:true,...extra});
const fresh=(...routines)=>({tasks:[],records:[],routines});

test('projects future slots without materializing tasks; preserves schedule-only times, month-end dedup and plan boundaries',()=>{
 const p=plan({repeatFrequency:'monthly',slots:[{id:'a',day:'31',time:'08:15'},{id:'also-last',day:'last',time:'08:15'}],startDate:'2026-11-10',endDate:'2026-11-30'});
 const data=fresh(p),before=structuredClone(data),items=planReminderQueue(data,date('2026-11-03'));
 assert.deepEqual(items,[{id:'plan:read:2026-11-10:a',title:'阅读',time:'08:15',at:iso('2026-11-30','07:45'),scheduledAt:iso('2026-11-30','08:15')}]);
 assert.deepEqual(data,before);
 const week=plan({repeatFrequency:'weekly',startDate:'2026-11-05',endDate:'2026-11-13',slots:[{id:'wed',day:'2',time:'08:15'},{id:'fri',day:'4',time:'08:15'}]});
 assert.deepEqual(planReminderQueue(fresh(week),date('2026-11-03')).map(i=>i.scheduledAt),['2026-11-06','2026-11-11','2026-11-13'].map(d=>iso(d,'08:15')));
});

test('weekdays and overnight lead use the same release boundary as Today',()=>{
 const work=plan({weekdaysOnly:true,slots:[{id:'early',time:'00:10'}],endDate:'2026-11-10'});
 const items=planReminderQueue(fresh(work),date('2026-11-07','12:00'));
 assert.deepEqual(items.map(i=>[i.at,i.scheduledAt]),[[iso('2026-11-09','00:00'),iso('2026-11-09','00:10')],[iso('2026-11-09','23:40'),iso('2026-11-10','00:10')]]);
 assert.equal(planReminderQueue(fresh({...work,weekdaysOnly:false}),date('2026-11-07','12:00')).find(i=>i.scheduledAt===iso('2026-11-09','00:10')).at,iso('2026-11-08','23:40'));
});

test('stored occurrences win: deleted, paused and completed slots stay gone; saved edits update time and text',()=>{
 const day='2026-11-04',at=date(day,'01:00'),p=plan({slots:['08:00','09:00','10:00','11:00'].map((time,i)=>({id:String(i),time}))});
 let data=saveDailyPlan(fresh(),p,day,at.toISOString());
 data.tasks[0].status='done';data.tasks[1].status='paused';data.tasks.splice(2,1);
 data=saveDailyPlan(data,{...data.routines[0],title:'新标题',slots:p.slots.map((s,i)=>i===3?{...s,time:'12:30'}:s)},day,at.toISOString());
 const items=planReminderQueue(data,at),today=items.filter(i=>i.id.includes(day));
 assert.equal(today.length,1);assert.equal(today[0].title,'新标题');assert.equal(today[0].at,iso(day,'12:00'));
 assert.equal(items.some(i=>i.id.includes('2026-11-05')),true);
 for(const off of [{active:false},{remind:false},{scheduling:'count'}])assert.deepEqual(planReminderQueue({...data,routines:[{...data.routines[0],...off}]},at),[]);
 assert.deepEqual(planReminderQueue({...data,routines:[]},at),[]);
});

test('caps future schedules separately from today’s catch-up, includes overnight leads at the horizon and omits stale tasks',()=>{
 const morning=Array.from({length:80},(_,i)=>plan({id:String(i).padStart(2,'0')}));
 const now=date('2026-11-04','10:00'),items=planReminderQueue(fresh(...morning),now),past=items.filter(i=>Date.parse(i.at)<=now.getTime()),future=items.filter(i=>Date.parse(i.at)>now.getTime());
 assert.equal(past.length,64);assert.ok(past.every(i=>i.at===iso('2026-11-04','07:45')));
 assert.equal(future.length,64);assert.ok(future.every(i=>i.at===iso('2026-11-05','07:45')));
 assert.ok(!planReminderQueue(fresh(...morning),now,new Set(past.map(i=>i.id))).some(i=>past.some(p=>p.id===i.id)));
 const sparse=fresh(plan({startDate:'2026-12-04',slots:[{id:'early',time:'00:10'}]}));
 const edge=planReminderQueue(sparse,now);assert.equal(edge.length,1);assert.equal(edge[0].at,iso('2026-12-03','23:40'));
});

test('one-off reminders require opt-in and an exact pending time; prefer deadline, fall back to scheduled time, update and cancel',()=>{
 const day='2026-11-04',now=date(day,'12:00'),t={id:'one',title:'提交报告',status:'today',remind:true,due:day,dueTime:'14:30',scheduledDate:day,scheduledTime:'09:00'};
 const build=(patch={})=>planReminderQueue({tasks:[{...t,...patch}]},now);
 assert.deepEqual(build(),[{id:'one',title:'提交报告',time:'14:30',at:iso(day,'14:30'),scheduledAt:iso(day,'14:30')}]);
 assert.equal(build({dueTime:'',leadMinutes:20})[0].at,iso(day,'08:40'));
 assert.equal(build({due:'2026-11-05',dueTime:'00:15',leadMinutes:30})[0].at,iso(day,'23:45'));
 assert.equal(build({title:'新报告',dueTime:'15:45'})[0].title,'新报告');
 for(const change of [{remind:false},{remind:undefined},{status:'done'},{status:'paused'},{dueTime:'',scheduledTime:''},{due:'2026-11-03'}])assert.deepEqual(build(change),[]);
 assert.deepEqual(planReminderQueue({tasks:[]},now),[]);
});

test('replaces schedules on change, refills after firing, retries failures or lost acknowledgement without repeated error notices',()=>{
 const now=date('2026-11-04','07:43'),data=fresh(plan()),posted=[],errors=[];
 const sync=createReminderSync(msg=>posted.push(structuredClone(msg)),()=>errors.push(true));
 sync.update(data,now);sync.result(false,1);sync.update(data,new Date(+now+30000));assert.equal(posted.length,1);
 sync.update(data,new Date(+now+60000));sync.result(false,2);assert.equal(posted.length,2);assert.equal(errors.length,1);
 sync.update(data,new Date(+now+120000));assert.equal(posted.length,3);sync.result(true,3);
 sync.update(data,new Date(+now+240000));assert.equal(posted.length,3);
 sync.update(fresh(),now);assert.deepEqual(posted.at(-1),{type:'sync-reminders',requestId:4,items:[]});sync.result(true,3);
 sync.update(fresh(),new Date(+now+70000));assert.equal(posted.length,5,'retry an unacknowledged clear');
 assert.equal(hasScheduledReminders({workJournalPlatform:'windows',chrome:{webview:{postMessage(){}}}}),false);
 assert.equal(hasScheduledReminders({workJournalPlatform:'windows',workJournalScheduledReminders:true,chrome:{webview:{postMessage(){}}}}),true);
});
