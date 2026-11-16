import {addDays,localDate,parseDate,validDate} from './dates.js';

const relative={大后天:3,后天:2,明天:1,明:1,今天:0,今:0,昨天:-1,昨:-1,前天:-2,today:0,tonight:0,tomorrow:1,yesterday:-1};
const weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const cnPeriods={凌晨:'dawn',清晨:'dawn',早晨:'morning',早上:'morning',上午:'morning',中午:'noon',下午:'afternoon',傍晚:'evening',晚上:'evening',晚间:'evening',夜间:'night',夜里:'night',夜晚:'night'};
const enPeriods={dawn:'dawn',morning:'morning',noon:'noon',afternoon:'afternoon',evening:'evening',night:'night'};
const chineseDigits='零一二三四五六七八九';
function numeral(s){
 if(/^\d+$/.test(s))return Number(s);
 s=s.replace('两','二').replace('〇','零');
 if(/^[零一二三四五六七八九]?十[零一二三四五六七八九]?$/.test(s)){const [a,b]=s.split('十');return (a?chineseDigits.indexOf(a):1)*10+(b?chineseDigits.indexOf(b):0);}
 if(/^零[一二三四五六七八九]$/.test(s))return chineseDigits.indexOf(s[1]);
 if(s.length===1&&chineseDigits.includes(s))return chineseDigits.indexOf(s);
 return 'zero one two three four five six seven eight nine ten eleven twelve'.split(' ').indexOf(s.toLowerCase());
}
function weekdayDate(index,mark,base,fallback){
 if(validDate(fallback))return fallback;
 const current=(parseDate(base).getDay()+6)%7,offset=index-current;
 return addDays(base,/^(下|next)/i.test(mark)?offset+7:/^(这|本|this)/i.test(mark)?offset:(offset+7)%7);
}
// Consume only a leading date/time expression and adjacent syntax. The action is
// sliced from the user's original text, including case, spacing and punctuation.
function leading(source,base,fallback){
 let s=source.trim().replace(/^(?:我(?=\S)|我\s+|I\s+)/i,''),date='',period='',time='',shortDay=false;
 const take=n=>{s=s.slice(n).trimStart();};
 const prep=s.match(/^(?:安排(?:在|到)\s*|计划在\s*|从\s*|(?:scheduled for|starting(?: at)?|start at|by|on|before)\s+|截止(?:到|至|于)?\s*|截至\s*|最晚(?:在)?\s*|在(?=\S))/i);
 const explicitDue=prep&&/^(?:by|before|截止|截至|最晚)/i.test(prep[0]);
 let explicitSchedule=prep&&/^(?:安排|计划在|从|scheduled|starting|start at)/i.test(prep[0]);
 if(prep)take(prep[0].length);
 const noDue=s.match(/[,，\s]*(?:不设(?:置)?截止(?:时间|日期)?|没有截止(?:时间|日期)|no deadline)[。.!]?$/i);
 if(noDue){s=s.slice(0,noDue.index).trimEnd();explicitSchedule=true;}
 let m=s.match(/^(大后天|后天|明天|今天|昨天|前天|[今明昨](?=[早晚晨夜])|today\b|tonight\b|tomorrow\b|yesterday\b)/i);
 if(m){const key=m[0].toLowerCase();date=addDays(base,relative[key]);shortDay=/^[今明昨]$/.test(key);if(key==='tonight')period='evening';take(m[0].length);}
 else if((m=s.match(/^(?:(20\d\d)[年/\-])?(\d{1,2})[月/\-](\d{1,2})(?:日|号)?(?!\d)/))){
  date=(m[1]||base.slice(0,4))+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');if(!validDate(date))return null;take(m[0].length);
 }else if((m=s.match(/^(下|这|本)?(?:星期|周)([一二三四五六日天])/))){
  date=weekdayDate('一二三四五六日'.indexOf(m[2].replace('天','日')),m[1]||'',base,fallback);take(m[0].length);
 }else if((m=s.match(/^(?:(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i))){
  date=weekdayDate(weekdays.indexOf(m[2].toLowerCase()),m[1]||'',base,fallback);take(m[0].length);
 }
 m=s.match(/^(凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|夜里|夜晚)/);
 if(m){period=cnPeriods[m[0]];take(m[0].length);}
 else if(shortDay&&(m=s.match(/^(早|晨|晚|夜)/))){period=({早:'morning',晨:'dawn',晚:'evening',夜:'night'})[m[0]];take(m[0].length);}
 else if((m=s.match(/^(?:(?:this|in the|at)\s+)?(dawn|morning|noon|afternoon|evening|night)\b/i))){period=enPeriods[m[1].toLowerCase()];take(m[0].length);}
 const at=s.match(/^at\s+/i),clock=at?s.slice(at[0].length):s;
 m=clock.match(/^(\d{1,2}|[零〇一二两三四五六七八九十]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*[:：]\s*(\d{1,2})(?!\d)\s*(?:钟)?|\s*[点时](?:钟|半|([\d零〇一二两三四五六七八九十]+)分|([一三])刻)?|(?=\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z]))|(?=\b))/i);
 if(m){
  const suffix=clock.slice(m[0].length).match(/^\s*([ap])\.?m\.?(?![a-z])/i);
  const syntax=!!suffix||/[:：点时]/.test(m[0])||!!at;
  if(syntax){
   let hour=numeral(m[1]),minute=m[2]?Number(m[2]):m[3]?numeral(m[3]):m[4]?numeral(m[4])*15:m[0].includes('半')?30:0;
   if(hour<0||hour>23||minute<0||minute>59||suffix&&(hour<1||hour>12))return null;
   if(at&&!suffix&&!period&&hour>=1&&hour<=12&&!m[2])return null; // "at eight" alone doesn't specify morning or evening.
   const pm=suffix?suffix[1].toLowerCase()==='p':['afternoon','evening','night'].includes(period)||period==='noon'&&hour<=6;
   const am=suffix?suffix[1].toLowerCase()==='a':period==='dawn';
   if(hour<12&&pm)hour+=12;else if(hour===12&&am)hour=0;
   time=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');take((at?.[0].length||0)+m[0].length+(suffix?.[0].length||0));
  }
 }
 if(!date&&!period&&!time)return null;
 // These are titles/durations, not detached scheduling modifiers.
 if(/^(?:的|['’]s\b|小时|分钟|天后|前景|后果|之后|以后|左右|多钟|来钟)/i.test(s)
    ||period==='afternoon'&&s.startsWith('茶')
    ||!date&&!period&&/[点]/.test(m?.[0]||'')&&/^(?:建议|意见|原因|理由|要求|说明|看法|不同|区别|问题|注意事项)/.test(s))return null;
 const before=s.match(/^\s*(之前|以前|为止|截止|前(?!台|排|面|进|往|来|线|言)|\bbeforehand\b)/i);
 if(before)take(before[0].length);
 const start=s.match(/^\s*(?:开始(?!时间|日期)|开工(?=[\s,，])|\bstart(?:ing)?\b)/i);
 if(start){explicitSchedule=true;take(start[0].length);}
 const when=explicitDue||before||time&&!explicitSchedule?'due':'scheduled';
 if(!time&&period==='noon'&&(when==='due'||/^at noon\b/i.test(source)))time='12:00';
 s=s.replace(/^[，,：:、\s]+/,'').replace(/^(?:想要|打算|需要|准备要|要(?!求|点|紧|素|领|不|约|闻))\s*/,'');
 return {text:s.trim().replace(/^[.…。]+$/,''),date:date||(validDate(fallback)?fallback:base),time,period,when};
}
export function parseCaptureTiming(text,base=localDate(),defaultDate=''){
 if(typeof text!=='string'||!validDate(base))return null;
 const source=text.trim();const first=leading(source,base,defaultDate);
 if(first){
  for(const sep of first.text.matchAll(/[,，]\s*|\s+(?=(?:by|before)\b)/gi)){
   const action=first.text.slice(0,sep.index).trim(),tail=first.text.slice(sep.index+sep[0].length).trim().replace(/[.!。！]+$/,'');
   const end=leading(tail,base,first.date);
   if(!action||!end||end.text)continue;
   if(first.when==='scheduled'&&end.when==='due')return {...end,text:action,scheduledDate:first.date,scheduledTime:first.time};
  }
  return first;
 }
 // A suffix is recognized only when it consumes the entire tail; never strip
 // dates buried inside titles or quotations such as “评审明天的演讲”.
 for(const sep of source.matchAll(/[,，]\s*|\s+(?=(?:by|on|at|before|today|tonight|tomorrow|yesterday|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/gi)){
  const action=source.slice(0,sep.index).trim();if(!action)continue;
  const tail=source.slice(sep.index+sep[0].length).trim().replace(/[.!。！]+$/,'');
  const candidate=leading(tail,base,defaultDate);
  if(candidate&&!candidate.text)return {...candidate,text:action};
 }
 return null;
}
