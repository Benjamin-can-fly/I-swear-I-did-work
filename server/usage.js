import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {localDate} from '../src/lib/dates.js';
const dir=path.resolve(process.env.DATA_DIR||'data'),file=path.join(dir,'usage.json');
let queue=Promise.resolve();
export async function readUsage(){
 try{return JSON.parse(await readFile(file,'utf8'));}
 catch(e){if(e.code==='ENOENT')return {since:localDate(),days:{}};throw e;}
}
export function trackUsage(event){
 if(!['session','today','journal','tasks','timeline','dashboard','organize','summary','save'].includes(event))throw Error('无效统计事件');
 const job=queue.catch(()=>{}).then(async()=>{
  const data=await readUsage(),date=localDate();data.days[date]??={};data.days[date][event]=(data.days[date][event]||0)+1;
  await mkdir(dir,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(data),'utf8');await rename(file+'.tmp',file);return data;
 });queue=job;return job;
}
