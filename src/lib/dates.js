export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const parseDate = s => new Date(`${s}T12:00:00`);
export const addDays = (s,n) => { const d=parseDate(s); d.setDate(d.getDate()+n); return localDate(d); };
export const validDate = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s)) && localDate(parseDate(s))===s;
export const prettyDate = s => parseDate(s).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
export function rangeFor(date,view) {
  if(view==='day') return [date,date];
  const d=parseDate(date);
  if(view==='week') { const start=addDays(date,-((d.getDay()+6)%7)); return [start,addDays(start,6)]; }
  return [localDate(new Date(d.getFullYear(),d.getMonth(),1)),localDate(new Date(d.getFullYear(),d.getMonth()+1,0))];
}
export function movePeriod(date,view,n) {
  if(view!=='month') return addDays(date,n*(view==='week'?7:1));
  const d=parseDate(date); return localDate(new Date(d.getFullYear(),d.getMonth()+n,1));
}
export function inferDate(text,base) {
  const explicit=text.match(/(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/);
  if(explicit) { const s=`${explicit[1]}-${explicit[2].padStart(2,'0')}-${explicit[3].padStart(2,'0')}`; if(validDate(s)) return s; }
  if(/后天/.test(text)) return addDays(base,2);
  if(/明天/.test(text)) return addDays(base,1);
  if(/前天/.test(text)) return addDays(base,-2);
  if(/昨天/.test(text)) return addDays(base,-1);
  return base;
}
