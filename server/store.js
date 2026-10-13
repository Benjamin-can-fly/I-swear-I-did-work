import { mkdir,readFile,writeFile,rename,copyFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyData,validateData } from '../src/lib/model.js';
const dir=path.resolve(process.env.DATA_DIR||'data');
const file=path.join(dir,'journal.json');
let queue=Promise.resolve();
export async function readData() { await mkdir(dir,{recursive:true}); try {return validateData(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code==='ENOENT')return emptyData();throw Error('数据文件无法读取，已保留原文件，请检查或从备份恢复');} }
export function saveData(data) {validateData(data); const job=queue.catch(()=>{}).then(async()=>{await mkdir(dir,{recursive:true});try{await copyFile(file,path.join(dir,'journal.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(file+'.tmp',JSON.stringify(data,null,2),'utf8');await rename(file+'.tmp',file);});queue=job;return job;}
