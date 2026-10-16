import {tr} from '../lib/i18n.js';
import {taskTimingStats} from '../lib/task-time.js';
export function deadlineStats(tasks,start,end){
 const t=taskTimingStats(tasks,start,end);
 return tr`<section class="dashboard-card deadline-stats"><div class="card-heading"><h2>截止时间表现</h2><span>${start} — ${end}</span></div><div class="deadline-rates"><div><span>超时率</span><strong>${t.lateRate===null?'—':t.lateRate+'%'}</strong><small>${t.late} 项超时</small></div><div><span>提前率</span><strong>${t.earlyRate===null?'—':t.earlyRate+'%'}</strong><small>${t.early} 项提前</small></div><div><span>按时完成</span><strong>${t.onTime}<small> 项</small></strong><small>${t.total} 项可统计</small></div></div><p class="hint">以本时段内已完成、有截止日期和完成时间的任务为分母；未完成任务不计入。只填截止日期时按当天 23:59 计算，精确到分钟。${t.missing?tr`另有 ${t.missing} 项旧任务缺少完成时间，未纳入。`:''}</p></section>`;
}
