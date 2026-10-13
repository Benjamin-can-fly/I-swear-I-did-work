import { inferDate } from './dates.js';
import { compactText } from './summary.js';
const nums={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function number(s) { if(/^\d+$/.test(s))return +s; if(s.includes('十')) {const [a,b]=s.split('十');return (a?nums[a]:1)*10+(b?nums[b]:0);} return nums[s]; }
export function inferTime(text) {
  const m=text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*([零一二两三四五六七八九十\d]{1,3})(?:[:：]([0-5]\d)|点(半|[一二三四五六七八九十\d]{1,3}分?)?)/);
  if(!m) return '';
  let h=number(m[2]),min=m[3]?+m[3]:m[4]==='半'?30:m[4]?number(m[4].replace('分','')):0;
  const period=m[1]||text.match(/凌晨|早上|上午|中午|下午|晚上/)?.[0];
  if(/下午|晚上/.test(period)&&h<12)h+=12;
  if(period==='中午'&&h<11)h+=12;
  if(period==='凌晨'&&h===12)h=0;
  if(h>23||min>59||!Number.isFinite(h)||!Number.isFinite(min))return '';
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
export function organizeLocal(raw,date) {
  const sentences=raw.trim().split(/[。；;\n]+/).map(s=>s.trim()).filter(Boolean);
  const first=sentences[0]||raw.trim();
  const title=first.replace(/^(今天|昨天|前天|刚刚|刚才)?\s*(早上|上午|中午|下午|晚上)?\s*([一二两三四五六七八九十\d:：]+点?半?分?)?\s*/,'').slice(0,32)||'工作记录';
  const suggestions=sentences.filter(s=>/明天|后天|待办|接下来|还需要|需要|得先|记得|尚未|还没/.test(s)).map(s=>({title:s.slice(0,120),due:/明天|后天/.test(s)?inferDate(s,date):''}));
  const occurrence=first.split(/明天|后天|接下来/)[0];
  return {title,details:sentences.join('。\n')+(sentences.length?'。':''),summary:compactText(raw),summaryMode:'local',date:inferDate(occurrence,date),time:inferTime(occurrence),project:'',suggestions,mode:'local'};
}
