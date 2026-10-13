import {spawn} from 'node:child_process';
import {mkdtemp,readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const root=process.cwd(),stage=path.resolve(process.argv[2]||'dist/stage'),label=process.argv[3]||'startup';
const data=await mkdtemp(path.join(os.tmpdir(),'journal-speed-')),results=[];
const evidence=path.join(root,'artifacts',label);await mkdir(evidence,{recursive:true});
for(let i=0;i<2;i++){
 const env={...process.env,WORKJOURNAL_TEST_MODE:'1',WORKJOURNAL_DATA_DIR:data,WORKJOURNAL_PORT:'43176',WORKJOURNAL_TEST_SCRIPT:path.join(root,'tests/desktop-startup.js')};delete env.NODE_OPTIONS;
 const start=performance.now(),app=spawn(path.join(stage,'WorkJournal.exe'),[],{env,windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{app.kill();reject(Error('Startup timeout'));},60000);app.on('error',reject);app.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Startup exit '+code));});});
 const phases=JSON.parse(await readFile(path.join(data,'startup.json'),'utf8').catch(()=>'{}')),view=JSON.parse(await readFile(path.join(data,'smoke-result.json'),'utf8'));
 if(!view.success)throw Error(JSON.stringify(view));
 results.push({run:i?'reopen':'fresh-profile',phases,view,processMs:Math.round(performance.now()-start)});
 await copyFile(path.join(data,'desktop.png'),path.join(evidence,`window-${i}.png`));
 await new Promise(r=>setTimeout(r,1200));
}
await writeFile(path.join(evidence,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));

