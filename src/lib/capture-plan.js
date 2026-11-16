import {validDate} from './dates.js';
import {locale} from './i18n.js';
import {parseCaptureTiming} from './capture-time.js';
import {formatCaptureWhen} from './capture-display.js';

// Recognize an explicit repeat instruction. Unsupported constraints stay in review
// rather than becoming a different (and potentially endless) reminder.
const numberWord='(?:\\d{1,3}|[零〇一二两三四五六七八九十]+|one|once|two|twice|three|four|five|six|seven|eight|nine|ten)';
const enNumbers=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const cnDigits='零一二三四五六七八九';
function number(x){
 if(/^\d+$/.test(x))return Number(x);
 x=x.toLowerCase().replace('两','二').replace('〇','零');
 if(x==='once'||x==='twice')return x==='once'?1:2;
 if(enNumbers.includes(x))return enNumbers.indexOf(x);
 if(x.includes('十')){const [a,b]=x.split('十');return (a?cnDigits.indexOf(a):1)*10+(b?cnDigits.indexOf(b):0);}
 return cnDigits.indexOf(x);
}
const words='monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const weekdaysEn=words.split('|'), weekdaysZh='一二三四五六日';
const weekdaySpan=/(?:每(?:个)?(?:星期|周)|(?:星期|周))一\s*(?:到|至|[-~])\s*(?:星期|周)?五|\b(?:every\s+)?(?:weekday(?:s)?|monday\s+(?:through|to)\s+friday)\b|(?:每(?:个)?)?工作日/i;
const daily=new RegExp('每(?:一)?[天日]|每(?=[早晚])|一天(?=.{0,10}'+numberWord+'\\s*(?:次|遍|篇))|\\b(?:(?:each|every)\\s+(?:day|morning|evening|night)|daily|a day|per day)\\b','i');
const weekly=new RegExp('每(?:个)?(?:星期|礼拜|周)|一周(?=.{0,20}'+numberWord+'\\s*(?:次|篇|遍))|\\b(?:(?:each|every)\\s+(?:week|'+words+')|weekly|a week|per week)\\b','i');
const monthly=/每(?:个)?月|一个月(?=.{0,15}[次篇遍])|\b(?:(?:each|every)\s+month|monthly|a month|per month)\b/i;
const units=/(?:every other|every\s+\d+\s+(?:days|weeks|months)|biweekly|隔[天日周月]|每隔|每[两二三四五六七八九十\d]+[天周月])/i;
const boundDate='(?:20\\d{2}[-/年])?\\d{1,2}[-/月]\\d{1,2}[日号]?|大后天|后天|明天|今天|(?:下|本|这)?(?:周|星期)[一二三四五六日天]|today|tomorrow|20\\d{2}-\\d{2}-\\d{2}';
function readBound(value,base){return parseCaptureTiming(value+' 安排',base)?.date||'';}
const unsafe=/[?？]|如果|也许|可能|不确定|好像|不再|不用|不要|不是|没有|还没|尚未|取消|改成|改到|过了|(?:做|写|记|背|吃|读)(?:完|过)?了|已经|原来|曾经|了[。！]?$|之前|以后|截至|截止|除了|除外|节假日|\b(?:maybe|might|if|not|don't|never|used to|cancel|instead|until|except|finished|completed|wrote|studied|by)\b/i;
const timeSource='(?:(凌晨|早晨|早上|早|上午|中午|下午|傍晚|晚上|晚间|晚)\\s*)?('+numberWord+')(?:\\s*:\\s*(\\d{1,2})\\s*(?:钟)?|\\s*[点时](?:钟|半|一刻|三刻|[\\d零一二三四五六七八九十两]+分)?|\\s*(a\\.?m\\.?|p\\.?m\\.?)(?=\\s|$|[,.]))';
function timeOf(m){
 let h=number(m[2]),minute=m[3]===undefined?0:Number(m[3]);
 if(m[0].includes('半'))minute=30;
 if(m[0].includes('一刻'))minute=15;
 if(m[0].includes('三刻'))minute=45;
 const min=m[0].match(/[点时]([\d零一二三四五六七八九十两]+)分/);if(min)minute=number(min[1]);
 const meridian=m[1]||m[4]||'';
 if(h<0||h>23||minute<0||minute>59||/^[ap]/i.test(meridian)&&!(h>=1&&h<=12))return '';
 if((/下午|傍晚|晚|中午|^p/i.test(meridian)&&h<12))h+=12;
 if((/凌晨|^a/i.test(meridian)&&h===12))h=0;
 return String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
export function capturePlanLabel(plan,lang=locale()){
 if(!plan)return '';
 const en=lang==='en',f=plan.repeatFrequency,days=en?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:Array.from(weekdaysZh,d=>'周'+d);
 const head=plan.weekdaysOnly&&f==='daily'?(en?'Weekdays':'周一至周五'):({daily:en?'Daily':'每天',weekly:en?'Weekly':'每周',monthly:en?'Monthly':'每月'})[f];
 const suffix=plan.scheduling==='count'?(en?(plan.targetCount===1?'once':plan.targetCount+' times'):plan.targetCount+' 次'):(plan.slots||[]).map(s=>[f==='weekly'?days[Number(s.day)]:f==='monthly'?(s.day==='last'?(en?'last day':'最后一天'):en?'day '+s.day:s.day+' 日'):'',s.time].filter(Boolean).join(' ')).join(en?', ':'、');
 const part=plan.scheduling==='count'&&formatCaptureWhen({period:plan.period},{lang,includeDate:false});
 return [head,part,part&&plan.targetCount===1?'':suffix].filter(Boolean).join(' · ');
}
export function readCapturePlan(source,base){
 let text=source.normalize('NFKC').trim(),frequency,match,weekdaysOnly=false;
 const ambiguous=()=>({kind:'review',text:source,source,guarded:true,candidates:[],target:'',date:'',time:'',when:'scheduled'});
 if(units.test(text))return ambiguous();
 if((match=text.match(weekdaySpan))){frequency='daily';weekdaysOnly=true;}
 else if((match=text.match(monthly)))frequency='monthly';
 else if((match=text.match(weekly)))frequency='weekly';
 else if((match=text.match(daily)))frequency='daily';
 else return null;
 let startDate=base,endDate='',invalidBound=false;
 text=text.replace(new RegExp('(?:从\\s*)?('+boundDate+')\\s*(?:开始|起)|\\bstarting\\s+('+boundDate+')\\b','i'),(_,cn,en)=>{startDate=readBound(cn||en,base);return ' ';});
 text=text.replace(new RegExp('(?:[,，]\\s*)?(?:(?:到|至|截至|截止到)\\s*('+boundDate+')\\s*(?:结束|为止)?|('+boundDate+')\\s*结束|\\buntil\\s+('+boundDate+')\\b)\\s*[.!。！]?$','i'),(_,a,b,en)=>{endDate=readBound(a||b||en,base);invalidBound=!endDate;return ' ';});
 if(!validDate(startDate)||invalidBound||endDate&&!validDate(endDate)||endDate&&endDate<startDate)return ambiguous();
 // Unqualified multiple periods and unsupported future bounds must not be discarded.
 if(/从.{1,18}(?:开始|起)|明天起|下周起|(?:到|至).{1,18}(?:结束|为止)|\bstarting\b/i.test(text))return ambiguous();
 const token=match[0],englishDay=token.toLowerCase().match(new RegExp('('+words+')$'));
 if(/^a (?:day|week|month)$/i.test(token)&&!new RegExp('\\b(?:once|twice|'+numberWord+'\\s+times?)\\s+'+token+'\\b','i').test(text))return null;
 let body=text.replace(token,' ');
 let dayKeys=[];
 if(frequency==='weekly'){
  if(englishDay)dayKeys.push(String(weekdaysEn.indexOf(englishDay[0])));
  // In 每周一、周四 / 每周一和四 the first 周 was consumed as frequency.
  const ix=text.indexOf(token),tail=text.slice(ix+token.length);
  const list=tail.match(/^\s*([一二三四五六日天])((?:\s*(?:和|及|、|,|与)\s*(?:周|星期)?[一二三四五六日天])*)/);
  if(list){for(const d of list[0].match(/[一二三四五六日天]/g))dayKeys.push(String(weekdaysZh.indexOf(d.replace('天','日'))));body=text.slice(0,ix)+' '+tail.slice(list[0].length);}
  body=body.replace(new RegExp('\\b('+words+')s?\\b','gi'),d=>{dayKeys.push(String(weekdaysEn.indexOf(d.toLowerCase().replace(/s$/,''))));return ' ';});
 }
 if(frequency==='monthly'){
  body=body.replace(/(?:的)?(?:最后一天|月底)|\blast day\b/ig,()=>{dayKeys.push('last');return ' ';});
  body=body.replace(/([\d一二两三四五六七八九十]+)\s*[日号]|\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/ig,(_,cn,en)=>{dayKeys.push(String(number(cn||en)));return ' ';});
  if(dayKeys.some(d=>d!=='last'&&(Number(d)<1||Number(d)>31)))return ambiguous();
 }
 dayKeys=[...new Set(dayKeys)];
 let leadMinutes=0,remind=false;
 body=body.replace(new RegExp('提前\\s*(半|'+numberWord+')\\s*(分钟|小时)\\s*(显示|提醒)(?:我)?|\\bremind me\\s+('+numberWord+')\\s+(minutes?|hours?)\\s+(?:before|early)\\b','i'),(_,n,unit,action,eng,eu)=>{leadMinutes=(n==='半' ? 0.5 : number(n||eng))*(unit==='小时'||eu?.startsWith('hour')?60:1);remind=action==='提醒'||!!eng;return ' ';});
 if(!Number.isInteger(leadMinutes)||leadMinutes<0||leadMinutes>1440||/提前/.test(body))return ambiguous();
 let count=null;
 body=body.replace(new RegExp('('+numberWord+')\\s*(?:次|遍|篇)|\\b(once|twice|'+numberWord+'\\s+times?)\\b','ig'),(_,cn,en)=>{if(count!==null){count=0;return ' ';}count=number(cn||en.split(/\s/)[0]);return ' ';});
 if(count!==null&&(count<1||count>60))return ambiguous();
 // Keep a clock separate from the action for “每天晚上八点截止，背单词”
 // as well as “每天背单词，截止到晚上八点”. Counts still need no clock.
 let period='',scheduleOnly=false;
 const timing=parseCaptureTiming(body.trim(),base);
 if(timing&&(timing.time||timing.period)&&timing.date===base){
  period=timing.period;scheduleOnly=Boolean(timing.time&&timing.when==='scheduled');
  body=[timing.time,timing.text].filter(Boolean).join(' ');
 }
 if(unsafe.test(body))return ambiguous();
 const times=[];let invalidTime=false;
 // Consume a trailing AM/PM on a colon time together with its digits.
 body=body.replace(new RegExp('(?:\\bat\\s+)?'+timeSource+'(?:\\s*([ap])\\.?m\\.?(?=\\s|$|[,.]))?','gi'),(whole,period,h,min,ampm,suffix)=>{
  const value=timeOf([whole,period,h,min,ampm||suffix]);
  if(!value||times.includes(value))invalidTime=true;else times.push(value);return ' ';
 });
 if(!times.length){
  // English "every evening at 8" does not need a second AM/PM marker.
  body=body.replace(/\bat\s+(\d{1,2})\b/i,(s,h)=>{const period=/evening|night/i.test(token)?'晚上':/morning/i.test(token)?'上午':'';
   if(!period){invalidTime=true;return s;}const time=timeOf([s,period,h,undefined,undefined]);if(time)times.push(time);else invalidTime=true;return ' ';});
 }
 if(invalidTime||/\d\s*:|[点时]钟|周[一二三四五六日天]|星期[一二三四五六日天]|提前|每[天日周月隔]|早中晚|早晚|上下午|morning and evening|\bevery\b/i.test(body))return ambiguous();
 if(frequency!=='daily'&&(times.length>0)!==(dayKeys.length>0))return ambiguous();
 // Several days with different times could mean pairs or a cross product.
 if(dayKeys.length>1&&times.length>1)return ambiguous();
 const slots=(dayKeys.length?dayKeys:['']).flatMap(day=>times.map(time=>({day,time}))).map((slot,i)=>({...slot,id:'s'+(i+1)}));
 if(slots.length&&count!==null&&count!==slots.length||slots.length>60||!slots.length&&(leadMinutes||remind))return ambiguous();
 // Grammar words outside the schedule are kept; remove isolated joiners only.
 body=body.replace(/^(?:[\s,]*(?:and|on|at|the|of|each)\b)+|(?:\b(?:and|on|at|the|of|each)[,\s]*)+$/gi,' ')
  .replace(/(?:^|[\s,、])(?:和|与|及)(?=[\s,、]|$)/g,' ').replace(/^[\s,、:。]*(?:(?:我(?:想要|需要|想|要)?|需要|要(?!是|求)|计划|记得|打算|提醒我|的(?=\s))\s*)+/,'')
  .replace(/^[\s,、:。]+|[\s,、:。. …]+$/g,'').replace(/\s+/g,' ').replace(/(?<=\p{Script=Han}) (?=\p{Script=Han})/gu,'').trim();
 if(!body||/^(?:and|at|on|morning|evening|night)$/i.test(body))return ambiguous();
 if(!slots.length&&!period)period=/\b(?:morning|evening|night)\b/i.exec(token)?.[0].toLowerCase()||'';
 const plan={repeatFrequency:frequency,scheduling:slots.length?'times':'count',targetCount:slots.length||count||1,slots,weekdaysOnly,leadMinutes,remind,startDate,endDate,scheduleOnly,...(!slots.length&&period?{period}:{})};
 return {kind:'plan',text:body,source,plan,date:startDate,time:'',when:'scheduled',guarded:false,candidates:[],target:''};
}
