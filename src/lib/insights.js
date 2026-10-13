import {localDate,parseDate,addDays,rangeFor} from './dates.js';

export function reviewRange(date,view){
 if(view==='day')return [date,date];
 if(view==='week')return rangeFor(date,'month');
 return [`${date.slice(0,4)}-01-01`,`${date.slice(0,4)}-12-31`];
}
export function shiftReview(date,view,n){
 if(view==='day')return addDays(date,n);
 const d=parseDate(date);
 return localDate(new Date(d.getFullYear()+(view==='month'?n:0),d.getMonth()+(view==='week'?n:0),1));
}
export function monthWeeks(date){
 const [first,last]=rangeFor(date,'month'),weeks=[];
 let start=first;
 while(start<=last){const end=[rangeFor(start,'week')[1],last].sort()[0];weeks.push({start,end});start=addDays(end,1);}
 return weeks;
}

// Small transparent classifier, not an LLM or a measure of personal performance.
export function inferEffort(record){
 const text=[record.title,record.details].join(' ');
 if(/编程|调试|建模|推导|设计|论文|分析|研究/.test(text))return {level:'high',label:'分析 / 创作',weight:1.25};
 if(/整理|归档|录入|报销|预约|签到/.test(text))return {level:'light',label:'事务处理',weight:.8};
 return {level:'normal',label:'一般工作',weight:1};
}
export const effortOptions={auto:'按内容估算',light:'较轻',normal:'一般',high:'较高'};
export function effortFor(r){
 if(r.effort&&r.effort!=='auto')return {level:r.effort,label:effortOptions[r.effort],weight:{light:.8,normal:1,high:1.25}[r.effort],source:'手动'};
 return {...inferEffort(r),source:'内容估算'};
}
export function dailyLoad(records){
 const timed=records.filter(r=>Number.isFinite(r.durationMinutes)&&r.durationMinutes>0);
 const minutes=timed.reduce((s,r)=>s+r.durationMinutes,0);
 const weighted=timed.reduce((s,r)=>s+r.durationMinutes*effortFor(r).weight,0);
 return {score:timed.length?Math.min(100,Math.round(weighted/480*100)):null,minutes,weighted,covered:timed.length,total:records.length,partial:timed.length<records.length};
}
export function dailySeries(records,today,days=14){
 const byDate=new Map();for(const r of records){if(!byDate.has(r.date))byDate.set(r.date,[]);byDate.get(r.date).push(r);}
 return Array.from({length:days},(_,i)=>{const date=addDays(today,i-days+1);return {date,...dailyLoad(byDate.get(date)||[])};});
}
