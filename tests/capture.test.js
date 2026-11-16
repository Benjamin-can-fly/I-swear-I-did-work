import test from 'node:test';import assert from 'node:assert/strict';
import {propose,applyCapture} from '../src/lib/capture.js';
import {validateData} from '../src/lib/model.js';import {mergeDataChanges} from '../src/lib/data-sync.js';
const day='2026-11-03',empty={version:1,tasks:[],records:[]},at=day+'T10:00:00+08:00';
const task=(title,id='t1',sync=true)=>({id,title,notes:'',project:'',due:'',dueTime:'',priority:'normal',recordId:'',createdAt:at,status:'next',autoSyncRecord:sync});
test('a capture prompt or unfinished time is not an item; a real action survives it',()=>{
 for(const s of ['帮我记一下','帮我记一下，我今天晚上','麻烦你帮我记录一下：明天晚上8点','我记一下，','Note to self: tomorrow evening']){
  assert.deepEqual(propose(s,[],day),[],s);
 }
 const raw='帮我记一下，我今天晚上8点背单词';
 const d=applyCapture(empty,propose(raw,[],day),raw,{at});
 assert.deepEqual(d.tasks.map(t=>[t.title,t.due,t.dueTime,t.scheduledDate]),[['背单词',day,'20:00','']]);
 assert.equal(d.tasks[0].captureRaw,raw);
});
test('introductory dictation commands are ignored for plans, mixed captures and task matching',()=>{
 const rows=propose('帮我记一下，每天晚上8：00钟背单词。请帮我记录一下：已经交了报告。帮我记一下，明天打印表格',[],day);
 assert.deepEqual(rows.map(r=>[r.kind,r.text]),[['plan','背单词'],['record','已经交了报告'],['task','打印表格']]);
 assert.equal(rows[0].plan.slots[0].time,'20:00');
 const item=task('把 PPT 发给王老师');const [done]=propose('帮我记一下，刚把 PPT 发给王老师了',[item],day);
 assert.equal(done.kind,'complete');assert.equal(done.target,item.id);
 for(const s of ['记一下实验结果','我记一下实验结果','老师说“帮我记一下”','请润色“帮我记一下”']){
  assert.equal(propose(s,[],day)[0].text,s);
 }
});
test('a spoken period is kept outside the action without inventing a minute',()=>{
 const raw='我今晚要背单词。昨天下午三点见了老师';
 const d=applyCapture(empty,propose(raw,[],day),raw,{at});
 assert.deepEqual([d.tasks[0].title,d.tasks[0].timePeriod,d.tasks[0].due,d.tasks[0].scheduledDate],['背单词','evening','',day]);
 assert.deepEqual([d.records[0].title,d.records[0].time,d.records[0].date],['见了老师','15:00','2026-11-02']);
});
test('mixed capture preserves details and original, resolves referenced PPT, skips non-action',()=>{
 const raw='下午把组会 PPT 改完了，删了第 8 页，给第 12 页补了实验图。明天中午前发给王老师。打印先别管。',rows=propose(raw,[],day),data=applyCapture(empty,rows,raw,{at});
 validateData(data);assert.deepEqual(rows.map(r=>r.kind),['record','task']);assert.equal(data.records[0].raw,raw);assert.match(data.records[0].details,/第 12 页/);assert.equal(data.records[0].time,'');assert.match(data.tasks[0].title,/PPT/);assert.equal(data.tasks[0].due,'2026-11-04');assert.equal(data.tasks[0].dueTime,'12:00');assert.equal(data.tasks[0].captureRaw,raw);
});
test('schedule vs deadline, correction, quota, negation and literal questions',()=>{
 const rows=propose('周五写报告。周五前交报告。本来说明天交，现在改周五。这周找三天写日记。改完了，还没发。报告发了吗？',[],day);
 assert.deepEqual(rows.map(r=>r.kind),['task','task','task','review','record','task','review']);assert.deepEqual(rows.slice(0,3).map(r=>[r.date,r.when]),[['2026-11-06','scheduled'],['2026-11-06','due'],['2026-11-06','due']]);
 const [r]=propose('明天下午3点写报告',[],day);const data=applyCapture(empty,[r],r.text,{at});assert.equal(data.tasks[0].due,'2026-11-04');assert.equal(data.tasks[0].dueTime,'15:00');
});
test('exact completion reuses task; ambiguous, already-done and stale matches never accidentally complete',()=>{
 for(const sync of [false,true]){const data={...empty,tasks:[task('把 PPT 发给王老师','a',sync)]},raw='刚把 PPT 发给王老师了',rows=propose(raw,data.tasks,day);
 assert.equal(rows[0].kind,'complete');const next=applyCapture(data,rows,raw,{at});validateData(next);assert.equal(next.tasks.length,1);assert.equal(next.records.length,Number(sync));assert.equal(next.tasks[0].status,'done');assert.throws(()=>applyCapture(next,rows,raw,{at}));assert.deepEqual(mergeDataChanges(next,data,next),data);}
 const data={...empty,tasks:[task('把 PPT 初稿发给王老师','a'),task('把 PPT 终稿发给王老师','b')]},rows=propose('刚把 PPT 发给王老师了',data.tasks,day);assert.equal(rows[0].kind,'choose');assert.equal(rows[0].candidates.length,2);assert.throws(()=>applyCapture(data,rows,'原话',{at}));assert.deepEqual(data.tasks.map(t=>t.status),['next','next']);
});
test('undo preserves unrelated concurrent work and refuses to delete subsequently edited entries',()=>{
 const next=applyCapture(empty,propose('明天写笔记',[],day),'明天写笔记',{at});const remote=structuredClone(next);remote.tasks.push(task('独立任务'));assert.deepEqual(mergeDataChanges(next,empty,remote).tasks.map(t=>t.id),['t1']);remote.tasks[0].title='edited';assert.throws(()=>mergeDataChanges(next,empty,remote));
});
test('spoken task list shares its deadline and extracts only the named task priority',()=>{
 const raw='今天晚上21： 00前要把csp作业补完然后把数学学了，还有seminar（优先级高）';
 const rows=propose(raw,[],day),data=applyCapture(empty,rows,raw,{at});
 assert.deepEqual(rows.map(r=>r.kind),['task','task','task']);
 assert.deepEqual(data.tasks.map(t=>[t.title,t.due,t.dueTime,t.priority]),[
  ['补完csp作业',day,'21:00','normal'],['学数学',day,'21:00','normal'],['seminar',day,'21:00','high']
 ]);
 assert.equal(data.records.length,0);assert.ok(data.tasks.every(t=>t.captureRaw===raw));
});
test('a local time overrides the shared time; sentence boundaries reset temporal context',()=>{
 const rows=propose('今晚21点前写报告，然后22点交作业（优先级低）。明天整理资料',[],day);
 assert.deepEqual(rows.map(r=>[r.text,r.date,r.time,r.priority||'normal']),[
  ['写报告',day,'21:00','normal'],['交作业',day,'22:00','low'],['整理资料','2026-11-04','','normal']
 ]);
 assert.equal(propose('明天把数学学了',[],day)[0].kind,'task');
});
test('quoted conjunctions, priority labels, punctuation and existing detail clauses stay intact',()=>{
 const raw='今晚21点前读《然后，我们就出发》，还有摘录“任务（优先级高）；然后继续”';
 const rows=propose(raw,[],day);assert.equal(rows.length,2);
 assert.equal(rows[0].text,'读《然后，我们就出发》');assert.equal(rows[1].text,'摘录“任务（优先级高）；然后继续”');
 assert.ok(rows.every(r=>!r.priority));
 const details=propose('刚把 PPT 改完了，删了第8页，给第12页补了图',[],day);assert.equal(details.length,1);assert.match(details[0].text,/第12页/);
});
test('an explicit scheduled start and deadline are saved independently, not in the title',()=>{
 const raw='明天9点开始整理资料，后天18点截止';
 const data=applyCapture(empty,propose(raw,[],day),raw,{at});const [t]=data.tasks;
 assert.deepEqual([t.title,t.scheduledDate,t.scheduledTime,t.due,t.dueTime],['整理资料','2026-11-04','09:00','2026-11-05','18:00']);
});
test('English list actions share time but retain their own priority',()=>{
 const raw='Tomorrow at 9 pm finish homework and study mathematics, also review seminar (high priority)';
 const rows=propose(raw,[],day);assert.deepEqual(rows.map(r=>r.text),['finish homework','study mathematics','review seminar']);
 assert.ok(rows.every(r=>r.date==='2026-11-04'&&r.time==='21:00'&&r.kind==='task'));assert.equal(rows[2].priority,'high');
});

test('model task chains map preview identities after filtering and cannot lose a skipped prerequisite',()=>{
 const rows=[{kind:'task',text:'写作文',date:day,time:'',when:'scheduled',previewKey:'essay'},
  {kind:'task',text:'检查作文',date:day,time:'',when:'scheduled',previewKey:'check',afterKey:'essay'}];
 const data=applyCapture(empty,rows,'先写作文，完成后检查一遍',{at});
 assert.equal(data.tasks[1].afterTaskId,data.tasks[0].id);assert.equal(data.tasks[1].captureRaw,'先写作文，完成后检查一遍');
 assert.throws(()=>applyCapture(empty,[rows[1]],'原文',{at}),/前一步/);
 assert.throws(()=>applyCapture(empty,[{...rows[0],afterIndex:2},rows[1]],'原文',{at}),/顺序/);
 assert.throws(()=>applyCapture(empty,[{...rows[0],kind:'record'},rows[1]],'原文',{at}),/前一步/);
 const direct=applyCapture(empty,[{...rows[0],previewKey:undefined},{...rows[1],afterKey:undefined,previewKey:undefined,afterIndex:0}],'原文',{at});
 assert.equal(direct.tasks[1].afterTaskId,direct.tasks[0].id);
});

test('quick capture cannot complete a blocked existing task',()=>{
 const a=task('写作文','a'),b={...task('检查作文','b'),afterTaskId:'a'};
 const rows=[{kind:'complete',text:'检查作文',target:'b',candidates:[{id:'b',title:'检查作文'}]}];
 assert.throws(()=>applyCapture({...empty,tasks:[a,b]},rows,'检查作文完成了',{at}),/前一步/);
 assert.equal(applyCapture({...empty,tasks:[{...a,status:'done',completedAt:at},b]},rows,'检查作文完成了',{at}).tasks[1].status,'done');
});

test('explicit completion order creates a chain; independent lists and quoted instructions do not',()=>{
 for(const raw of ['写完作文之后检查一遍','先写作文，再检查一遍','帮我记一下，我得先把作文写完，写完之后再检查一遍']){
  const rows=propose(raw,[],day);assert.deepEqual(rows.map(r=>[r.kind,r.text,r.afterIndex??null]),[['task','写作文',null],['task','检查作文',0]],raw);
  const saved=applyCapture(empty,rows,raw,{at});assert.equal(saved.tasks[1].afterTaskId,saved.tasks[0].id);
 }
 const rows=propose('明天先写作文，再检查一遍',[],day);assert.ok(rows.every(r=>r.date==='2026-11-04'));
 assert.deepEqual(propose('first write the essay, then proofread it',[],day).map(r=>[r.text,r.afterIndex??null]),[['write the essay',null],['proofread the essay',0]]);
 assert.deepEqual(propose('Please write the essay, then proofread it',[],day).map(r=>[r.text,r.afterIndex??null]),[['write the essay',null],['proofread the essay',0]]);
 assert.ok(propose('I wrote an essay, then read it',[],day).every(r=>r.afterIndex===undefined));
 assert.ok(propose('明天写作文，还有背单词',[],day).every(r=>r.afterIndex===undefined));
 assert.equal(propose('读《先写作文再检查》',[],day).length,1);
 assert.equal(propose('先研究再生能源',[],day).length,1);
 assert.ok(propose('如果写完作文之后检查一遍',[],day).every(r=>r.kind==='review'&&r.afterIndex===undefined));
});
