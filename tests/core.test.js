import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeFor,movePeriod,validDate} from '../src/lib/dates.js';
import {organizeLocal,inferTime} from '../src/lib/organize.js';
import {emptyData,validateData,mergeData} from '../src/lib/model.js';
import {sortTasks,countdown} from '../src/lib/deadlines.js';
import {compactText} from '../src/lib/summary.js';
import {summarize} from '../server/ai.js';
import {reviewRange,shiftReview,monthWeeks,dailyLoad} from '../src/lib/insights.js';
import {renderRetrospective} from '../src/components/retrospective.js';
import {renderRecords} from '../src/components/records.js';
import {setTaskStatus,completionDelta,taskTimingStats} from '../src/lib/task-time.js';
import {countdown as taskCountdown} from '../src/lib/deadlines.js';

test('完成时间、恢复待处理与截止比例按分钟计算，不编造历史时间',()=>{
 const base={id:'timing',status:'next',due:'2026-10-10',dueTime:'08:00'};
 const late=setTaskStatus(base,'done','2026-10-12T11:32:00');assert.equal(completionDelta(late),3092);assert.equal(taskCountdown(late).text,'2 天 3 小时');
 const early=setTaskStatus(base,'done','2026-10-09T08:00:00');assert.equal(completionDelta(early),-1440);
 const same=setTaskStatus(base,'done','2026-10-10T08:00:59');assert.equal(completionDelta(same),0);
 const reopened=setTaskStatus(late,'next');assert.equal(reopened.completedAt,'');assert.equal(completionDelta(reopened),null);
 const stats=taskTimingStats([late,early,same,reopened,{...base,status:'done'}],'2026-10-01','2026-10-31');assert.equal(stats.total,3);assert.equal(stats.lateRate,33.3);assert.equal(stats.earlyRate,33.3);assert.equal(stats.missing,1);
 assert.equal(taskTimingStats([reopened],'2026-10-01','2026-10-31').lateRate,null);
 assert.equal(completionDelta({...same,dueTime:'',completedAt:'2026-10-10T23:59:30'}),0);
});

test('周按月分组无遗漏、无重复，月按年展示 12 个月',()=>{
 for(const date of ['2026-07-01','2026-03-01','2024-02-01']){const w=monthWeeks(date);assert.equal(w[0].start,date);assert.equal(w.at(-1).end,reviewRange(date,'week')[1]);for(let i=1;i<w.length;i++)assert.equal(new Date(w[i].start)-new Date(w[i-1].end),86400000);}
 assert.equal(monthWeeks('2026-03-01').length,6);assert.deepEqual(reviewRange('2026-07-12','month'),['2026-01-01','2026-12-31']);assert.equal(shiftReview('2026-12-31','week',1),'2027-01-01');assert.equal(shiftReview('2026-07-31','month',1),'2027-07-01');
 assert.equal((renderRetrospective([],'2026-07-01','month').match(/class="recap-group"/g)||[]).length,12);
 assert.ok(!renderRecords([],[],'day',false,false).includes('fill-example'));assert.ok(renderRecords([],[],'day',false,true).includes('fill-example'));
});
test('强度由耗时和投入决定，缺失耗时保留为空，不按数量打分',()=>{
 const a={title:'分析模型',details:'',durationMinutes:120,effort:'normal'};
 assert.equal(dailyLoad([a]).score,25);assert.equal(dailyLoad(Array.from({length:100},()=>({...a,durationMinutes:null}))).score,null);
 assert.equal(dailyLoad([{...a,durationMinutes:60},{...a,durationMinutes:60}]).score,dailyLoad([a]).score);
 assert.ok(dailyLoad([a]).score>dailyLoad([{...a,durationMinutes:10,effort:'high'}]).score);
 assert.equal(dailyLoad([a,{...a,durationMinutes:null}]).partial,true);assert.equal(dailyLoad([{...a,durationMinutes:1440}]).score,100);
 const base={id:'duration',title:'报告',details:'',raw:'',date:'2026-10-12',time:'',project:'',createdAt:new Date().toISOString(),suggestions:[]};
 for(const durationMinutes of [-1,0,1441,1.5,'60'])assert.throws(()=>validateData({version:1,records:[{...base,durationMinutes}],tasks:[]}));
});
test('日周月范围正确跨年、跨月和闰日',()=>{assert.deepEqual(rangeFor('2026-01-01','week'),['2025-12-29','2026-01-04']);assert.deepEqual(rangeFor('2024-02-15','month'),['2024-02-01','2024-02-29']);assert.equal(movePeriod('2026-01-31','month',1),'2026-02-01');assert.equal(validDate('2026-02-30'),false);});
test('过去事件日期不被明日待办覆盖，未知时间不虚构',()=>{const r=organizeLocal('昨天下午两点讨论海报。明天需要完成文案。','2026-10-11');assert.equal(r.date,'2026-10-10');assert.equal(r.time,'14:00');assert.equal(r.suggestions[0].due,'2026-10-12');assert.equal(organizeLocal('昨天下午看资料','2026-10-11').time,'');assert.equal(inferTime('晚上八点半'),'20:30');assert.equal(inferTime('上午09:20'),'09:20');});
test('备份拒绝无效日期、重复编号、无效状态；合并不覆盖原文',()=>{const r={id:'r1',title:'报告',details:'细节',raw:'原始内容',date:'2026-10-11',time:'',project:'学习',createdAt:new Date().toISOString(),suggestions:[]};const d={version:1,records:[r],tasks:[]};assert.equal(validateData(d),d);assert.equal(mergeData(d,d).records.length,1);assert.equal(mergeData(d,{...d,records:[{...r,raw:'不同内容'}]}).records[0].raw,'原始内容');assert.throws(()=>validateData({...d,records:[r,r]}));assert.throws(()=>validateData({...d,records:[{...r,date:'2026-02-30'}]}));assert.deepEqual(mergeData(emptyData(),d),d);});
test('待办按日期和分钟排序，旧数据排在当日具体时间之后',()=>{const base={createdAt:'2026-10-12T00:00:00Z',status:'next'};const tasks=[{...base,id:'none',due:''},{...base,id:'late',due:'2026-10-12',dueTime:'18:00'},{...base,id:'old',due:'2026-10-12'},{...base,id:'early',due:'2026-10-12',dueTime:'07:21'}];assert.deepEqual(sortTasks(tasks).map(t=>t.id),['early','late','old','none']);const time=new Date('2026-10-12T07:00:00');assert.equal(countdown(tasks[3],time).text,'21 分钟');assert.equal(countdown(tasks[2],time).text,'今天截止');assert.equal(countdown(tasks[0],time).text,'未设置');assert.equal(countdown({...tasks[3],dueTime:'06:00'},time).label,'已逾期');assert.equal(countdown({...tasks[3],status:'done'},time).text,'已完成');});
test('本地总结保留时间、金额、分工、否定和未完成事项',()=>{const raw='嗯，今天14:00到15:30和小王在教室讨论招新。预算300元，我负责蓝白海报，小王申请场地，场地还没批。明天18:00前交文案，不确定能否增加预算。';const text=compactText(raw);assert.ok(!text.startsWith('嗯'));for(const fact of ['14:00到15:30','小王','教室','300元','我负责蓝白海报','小王申请场地','场地还没批','明天18:00','不确定能否增加预算'])assert.ok(text.includes(fact));assert.ok(!text.includes('\n'));});
test('连续口头词可移除，引用、纠正、重复事件和链接保留',()=>{
 assert.equal(compactText('嗯，然后呢，和小王进行了讨论。预算300元。重复一下，预算300元。'),'和小王进行了讨论。预算300元。');
 const raw='我打了电话。我打了电话。小王说“嗯，然后呢，我没有答应”。不是300元，是500元。成功率约30%，日期2026-10-12，参考https://example.com/a?cost=300。';
 assert.equal(compactText(raw),raw);
 assert.equal(compactText('预算300元。预算500元。'),'预算300元。预算500元。');
 assert.equal(compactText('我还没有完成。明天可能完成，但不是承诺。'),'我尚未完成。明天可能完成，但不是承诺。');
});
test('总结适配器请求正文约束，拒绝错误返回，失败不回传伪总结',async()=>{const oldFetch=globalThis.fetch;const keys=['AI_API_KEY','AI_BASE_URL','AI_MODEL'];const previous=keys.map(k=>process.env[k]);try{process.env.AI_API_KEY='test-only';process.env.AI_BASE_URL='https://example.invalid/v1';process.env.AI_MODEL='test-model';globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);assert.ok(body.messages[0].content.includes('保留原文全部事实'));assert.ok(body.messages[0].content.includes('不要标题、列表'));return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'与小王讨论招新，场地尚未获批。'})}}]})};};assert.equal((await summarize('测试原文')).mode,'ai');globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"summary":[]}'}}]})});await assert.rejects(()=>summarize('测试原文'),/格式不正确/);globalThis.fetch=async()=>({ok:false,status:503});await assert.rejects(()=>summarize('测试原文'),/503/);}finally{globalThis.fetch=oldFetch;keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}});


test('合并待办输入保留原文和旧数据，包括长段落',async()=>{
 const {taskContent,taskFields}=await import('../src/lib/task-content.js');
 assert.equal(taskContent({title:'事项',notes:'补充说明\n第二行'}),'事项\n补充说明\n第二行');
 for(const content of ['事项\n补充说明\n第二行','长'.repeat(20201),'  保留空格\n\n保留段落  ']){
  const fields=taskFields(content);assert.equal(taskContent(fields),content);assert.ok(fields.title.length<=200&&fields.notes.length<=20201);
 }
 assert.throws(()=>taskFields('  \n  '));
});
