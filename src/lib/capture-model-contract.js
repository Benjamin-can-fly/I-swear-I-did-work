import {propose} from './capture.js';

const quantities=text=>text.match(/(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*(?:个|份|篇|本|页|次|遍|分钟|小时|字|words?\b|pages?\b)/gi)||[];
const normalize=s=>s.toLowerCase().replace(/[\s，,。.!！:：]/g,'').replaceAll('两','二');
const uncertain=/(?:如果|可能|也许|不确定|好像|不要|不用|不能|还没|没有|是否|[?？]|\b(?:maybe|might|not|never|don't|if)\b)/i;
const timingTokens=text=>text.match(/今天|明天|后天|昨天|前天|周[一二三四五六日天](?:到|至|—|-)(?:周)?[一二三四五六日天]|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}|\d{1,2}[:：]\s*\d{2}|[零一二两三四五六七八九十\d]+点(?:半)?/g)||[];
function protectedFacts(text){
 const facts=[...(text.match(/[“「《][^”」》]+[”」》]|[￥$]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元/g)||[])];
 for(const match of text.matchAll(/(?:给|找|联系|通知|和|向)([\p{Script=Han}]{1,5}(?:老师|同学|教授|经理|主任))/gu))facts.push(match[1]);
 if(/\p{Script=Han}/u.test(text))facts.push(...(text.match(/[a-z][a-z0-9._+-]{1,}/gi)||[]));
 return facts;
}
export function modelCleanedRows(sourceRows,texts,raw,day){
 if(!Array.isArray(texts)||texts.length!==sourceRows.length||texts.some(s=>typeof s!=='string'||!s.trim()||s.length>3000))throw Error('Invalid language-model rows');
 let retained=0;
 const rows=sourceRows.flatMap((original,index)=>{
  const text=texts[index].trim();
  // Never let prose cleanup override source dates, quantities, priority, or a
  // negated/uncertain instruction. Keeping a line verbatim is better than loss.
  const namedLabel=/^[a-z][a-z0-9_ -]{0,30}$/i.test(original.text)&&! /\b(?:i|need|please|write|read|study|finish|send|buy|call|check|review|prepare)\b/i.test(original.text);
  const translated=!/\p{Script=Han}/u.test(original.text)&&/\p{Script=Han}/u.test(text);
  const unsafe=translated||uncertain.test(original.text)||[...quantities(original.text),...timingTokens(original.text),...protectedFacts(original.text)].some(q=>!normalize(text).includes(normalize(q)))||namedLabel&&normalize(text)!==normalize(original.text)||text.length>original.text.length*1.7+20;
  if(unsafe){retained++;return [{...original}];}
  const reparsed=propose(text,[],day);
  if(sourceRows.length===1&&!original.plan&&original.afterIndex==null&&reparsed.length&&reparsed.every(r=>['task','record','plan'].includes(r.kind))&&(reparsed.length>1||original.kind==='review'))return reparsed.map(r=>({...r,source:raw}));
  // A model that accidentally repeats another item's action must not duplicate
  // the task graph. The source row retains ownership of all structured fields.
  if(reparsed.length>1){retained++;return [{...original}];}
  return [{...original,text:reparsed[0]?.text||text,source:original.source||raw}];
 });
 return {rows,retained};
}
