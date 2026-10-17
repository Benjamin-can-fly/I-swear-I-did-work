import {spawn} from 'node:child_process';
import {mkdtemp,readFile,mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(),stage=path.resolve(process.argv[2]||'dist/stage');
const version=JSON.parse(await readFile('package.json','utf8')).version;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
for(const reuse of [false,true]){
 const temp=await mkdtemp(path.join(os.tmpdir(),'journal-native-'));
 const port=reuse?43174:43173,origin=`http://127.0.0.1:${port}`;
 const env={...process.env,WORKJOURNAL_TEST_MODE:'1',WORKJOURNAL_DATA_DIR:temp,WORKJOURNAL_PORT:String(port),WORKJOURNAL_TEST_SCRIPT:path.join(root,'tests/desktop-smoke.js')};
 delete env.NODE_OPTIONS;delete env.PARENT_PID;
 let backend,app;
 try{
  if(reuse){
   backend=spawn(path.join(stage,'runtime/node.exe'),[path.join(stage,'app/server/index.js')],{cwd:path.join(stage,'app'),env:{...env,PORT:String(port),DATA_DIR:temp},windowsHide:true,stdio:'ignore'});
   let status;
   for(let i=0;i<60;i++){try{status=await(await fetch(origin+'/api/status')).json();break;}catch{await delay(100);}}
   assert.equal(status?.version,version);assert.equal(path.resolve(status.dataDirectory),temp);
  }
  app=spawn(path.join(stage,'WorkJournal.exe'),['--data-dir',temp,'--port',String(port)],{env,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{app.kill();reject(Error('Native test timeout'));},60000);app.on('error',e=>{clearTimeout(timer);reject(e);});app.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native exit '+code));});});
  const result=JSON.parse(await readFile(path.join(temp,'smoke-result.json'),'utf8'));
  assert.equal(result.success,true,JSON.stringify(result));assert.equal(await readFile(path.join(temp,'reminder-test.txt'),'utf8'),'12:00 计划提醒测试');
  assert.equal((await readFile(path.join(temp,'appearance/color.txt'),'utf8')).trim(),'#3566a0');
  assert.ok((await readFile(path.join(temp,'appearance/icon-3566a0.ico'))).length>1000);
  assert.equal((await readFile(path.join(temp,'appearance/mode.txt'),'utf8')).trim(),'dark');
  assert.equal((await readFile(path.join(temp,'appearance/language.txt'),'utf8')).trim(),'zh-CN');
  const shellIcon=await readFile(path.join(temp,'appearance/desktop-v2-3566a0.ico'));
  assert.equal(shellIcon.readUInt16LE(4),9,'Desktop icon must include all nine shell sizes');
  for(let i=0;i<9;i++){const entry=6+16*i,offset=shellIcon.readUInt32LE(entry+12),size=shellIcon.readUInt32LE(entry+8);assert.ok(offset+size<=shellIcon.length);assert.equal(shellIcon.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a');}
  const pdf=await readFile(path.join(temp,'report.pdf'));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  if(reuse)assert.equal((await(await fetch(origin+'/api/status')).json()).version,version,'Reused server must survive window close');
  const evidence=path.join(root,'artifacts',`native-${version}-${reuse?'shared':'standalone'}`);await mkdir(evidence,{recursive:true});
  for(const name of ['smoke-result.json','desktop.png','report.pdf','startup.json'])await copyFile(path.join(temp,name),path.join(evidence,name));
  console.log(`PASS native ${version} ${reuse?'shared backend':'standalone'}: save, PDF, data location and shutdown`);
 }finally{
  if(app?.exitCode===null)app.kill();if(backend?.exitCode===null)backend.kill();await delay(700);
  if(path.dirname(temp)!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('journal-native-'))throw Error('Unsafe temporary path');
  await rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:300});
 }
}
