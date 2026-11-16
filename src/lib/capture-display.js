import {addDays,localDate,parseDate,validDate} from './dates.js';
import {locale} from './i18n.js';

const zh={dawn:'凌晨',morning:'早上',noon:'中午',afternoon:'下午',evening:'晚上',night:'夜里'};
const en={dawn:'dawn',morning:'morning',noon:'noon',afternoon:'afternoon',evening:'evening',night:'night'};
const compact={
 '今天早上':'今早','今天晚上':'今晚','今天夜里':'今晚',
 '明天早上':'明早','明天晚上':'明晚','明天夜里':'明晚',
 '昨天早上':'昨早','昨天晚上':'昨晚','昨天夜里':'昨晚'
};
// Calendar labels use local dates, so daylight saving and month/year boundaries are harmless.
// Never turn a part of the day into an invented clock time.
export function formatCaptureWhen({date='',time='',period=''}={}, {today=localDate(),lang=locale(),includeDate=true}={}){
 const english=/^en\b/i.test(lang),part=(english?en:zh)[period]||'',clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)?time:'';
 const displayClock=clock&&english?(Number(clock.slice(0,2))%12||12)+clock.slice(2)+(Number(clock.slice(0,2))>=12?' PM':' AM'):clock;
 if(!includeDate)return displayClock||part;
 let day='',offset;
 if(validDate(date)){
  offset=[-2,-1,0,1,2].find(n=>addDays(today,n)===date);
  if(english&&offset!=null&&Math.abs(offset)<=1)day=['Yesterday','Today','Tomorrow'][offset+1];
  else if(!english&&offset!=null)day=['前天','昨天','今天','明天','后天'][offset+2];
  else day=parseDate(date).toLocaleDateString(english?'en-US':'zh-CN',{...(date.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{}),month:english?'short':'long',day:'numeric'});
 }
 if(!day)return displayClock||part;
 if(!english){const stamp=day+part;return [compact[stamp]||stamp,displayClock].filter(Boolean).join(' ');}
 let stamp=day;
 if(part&&!(displayClock&&(period==='dawn'||period==='noon'))){
  if(offset===0)stamp=period==='night'||period==='evening'?'Tonight':period==='noon'?'Today at noon':period==='dawn'?'Today at dawn':'This '+part;
  else if(offset===-1&&(period==='night'||period==='evening'))stamp='Last night';
  else if(offset===-1||offset===1)stamp=period==='dawn'||period==='noon'?day+' at '+part:day+' '+part;
  else stamp=day+', '+part;
 }
 return stamp+(displayClock?' at '+displayClock:'');
}
