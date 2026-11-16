// Split independent instructions, but keep quoted text, parenthetical details,
// weekday lists and ordinary comma-separated elaboration attached to the action.
const pairs={'“':'”','‘':'’','「':'」','『':'』','《':'》','（':'）','(' :')','[':']','【':'】','"':'"'};
function maskQuotes(text){let close='',masked='';for(const c of text){if(close){masked+=' ';if(c===close)close='';}else if('“‘「『《"'.includes(c)){close=pairs[c];masked+=' ';}else masked+=c;}return masked;}
export function captureClauses(raw){
 const result=[];let start=0,group=0,stack=[];
 const push=end=>{const text=raw.slice(start,end).trim();if(text)result.push({text,group});};
 for(let i=0;i<raw.length;i++){
  const c=raw[i];if(stack.length){if(c===stack.at(-1))stack.pop();else if(pairs[c]&&pairs[c]!==c)stack.push(pairs[c]);continue;}
  if(pairs[c]){stack.push(pairs[c]);continue;}
  if(/[。！!；;\n]/.test(c)||c==='.'&&/\s/.test(raw[i+1]||'')||/[？?]/.test(c)){
   const include=/[？?]/.test(c)?1:0;push(i+include);start=i+1;group++;continue;
  }
  const rest=raw.slice(i),join=rest.match(/^(?:[,，]\s*)?(?:然后|接着|另外(?:还(?:要)?)?|还有|还要)(?:再|也)?\s*/);
  const en=rest.match(/^(?:,\s*)?\b(?:and then|then|also|and also)\s+/i)
   ||rest.match(/^\s+and\s+(?=(?:write|read|study|finish|complete|send|email|submit|review|practice|revise|buy|call|prepare|meet|exercise)\b)/i);
  const separator=join||en;
  if(separator&&i>start){push(i);i+=separator[0].length-1;start=i+1;continue;}
  if(/[,，]/.test(c)&&/^\s*(?:还没|尚未|明天|后天|下周|周[一二三四五六日]|接下来|但|but |tomorrow|need to)/i.test(raw.slice(i+1))){
   const left=raw.slice(start,i);
   if(/每(?:个)?(?:周|星期)[一二三四五六日天](?:\s*[,，、和及]\s*(?:周|星期)?[一二三四五六日天])*\s*$/.test(left)&&/^\s*周[一二三四五六日天]/.test(raw.slice(i+1)))continue;
   // A trailing deadline or start modifier belongs to this action, not a new one.
   if(/^\s*(?:明天|后天|下周|周[一二三四五六日]).{0,18}(?:截止|之前|以前|前|开始)\s*[。.!！]?\s*$/.test(raw.slice(i+1)))continue;
   push(i);start=i+1;
  }
 }
 push(raw.length);return result;
}
const priorityValue=s=>/高|high|urgent/i.test(s)?'high':/低|low/i.test(s)?'low':'normal';
// Priority is metadata only with an explicit label. “学习高优先级队列” stays content.
export function capturePriority(source){
 let text=source,priority='';
 const label='(?:优先级\\s*(?:(?:设|设置)(?:置)?为|为|[:：])?\\s*[高中低]|(?:高|中|低)优先级|(?:high|normal|medium|low)\\s+priority|priority\\s*[:=]?\\s*(?:high|normal|medium|low))';
 const remove=()=>{const found=maskQuotes(text).match(new RegExp('(?:[（(\\[]\\s*('+label+')\\s*[）)\\]])|(?:[,，]\\s*('+label+')\\s*$)','i'));if(!found)return false;priority=priorityValue(found[1]||found[2]);text=text.slice(0,found.index)+text.slice(found.index+found[0].length);return true;};
 while(remove()){}
 const lead=maskQuotes(text).match(new RegExp('^('+label+')(?:\\s*[:：,，]\\s*|\\s+)','i'));
 if(lead){priority=priorityValue(lead[1]);text=text.slice(lead[0].length);}
 return {text:text.trim(),...(priority?{priority}:{})};
}
export function taskAction(source){
 let text=source.replace(/^(?:(?:请|麻烦)(?:你)?\s*)?(?:我(?:想要|需要|打算|准备|要)?\s*)?(?:还要|需要|想要|打算|准备要|得(?=把|写|读|做|交|检查)|要(?!求|点|素|领))\s*/,'').trim();
 // 把…补完 / 把…学了 are prospective commands, not completion reports.
 const disposal=text.match(/^把\s*(.+?)\s*(补完|学了|学完|写完|做完|读完|背完|完成|复习完)([。.!！]?)$/);
 if(disposal){const action=({补完:'补完',学了:'学',学完:'学完',写完:'写完',做完:'做完',读完:'读完',背完:'背完',完成:'完成',复习完:'复习完'})[disposal[2]];text=action+disposal[1];}
 return text;
}

// A dependency requires explicit order. A plain “还有” / “and” remains a list.
// Quoted or conditional instructions are left for the editable model preview.
export function captureChain(source){
 const text=source.trim().replace(/[。.!！]+$/,'').replace(/[,，]\s*(?:写完|做完|完成)(?:之后|以后|后)\s*再/g,'，再');
 if(/[“”‘’「」『』《》"\n；;。]/.test(text)||/如果|要是|可能|不确定|已经|刚刚|刚才|还没|没有|\b(?:if|maybe|already)\b/i.test(text))return null;
 const action='(?:把|给|写|读|背|做|学|整理|检查|提交|发|交|复习|练|买|去|打开|关闭|完成|修改|核对|准备|看|听|记|联系|打印|吃|喝|休息|[a-zA-Z])';
 const join='(?:然后再|然后|再)\\s*(?='+action+')';
 let match=text.match(new RegExp('^(.*?)先\\s*(.+?)[，,]?\\s*'+join+'(.+)$')),parts;
 if(match){parts=[match[1]+match[2],...match[3].split(new RegExp('[，,]?\\s*'+join))].map(s=>s.replace(/[,，]\s*$/,'').trim());}
 else if((match=text.match(/^(.*?(?:写完|读完|背完|做完|学完|整理完|检查完|完成)[^，,]{0,100}?)(?:之后|以后|后)[，,]?\s*(?:再|接着|就)?\s*(.+)$/))){
  const first=taskAction(match[1]).replace(/(写|读|背|做|学|整理|检查)完/,'$1');parts=[first,match[2]];
 }else if((match=text.match(/^(?:please\s+)?(?:first\s+)?((?:write|read|study|finish|complete|send|email|submit|review|proofread|practice|revise|buy|call|prepare|meet|exercise|check|edit)\b.+?)[,;]?\s+(?:and\s+)?then\s+(.+)$/i))){parts=[match[1],match[2]];}
 else if((match=text.match(/^after\s+(?:I\s+)?(?:finish(?:ing)?\s+)?(writing|reading|completing|finishing)\s+(.+?),\s*(.+)$/i))){parts=[({writing:'write',reading:'read',completing:'complete',finishing:'finish'})[match[1].toLowerCase()]+' '+match[2],match[3]];}
 if(!parts||parts.length<2||parts.length>10||parts.some(s=>!s.trim()))return null;
 return parts;
}
