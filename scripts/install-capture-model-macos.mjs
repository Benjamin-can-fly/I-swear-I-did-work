// Installs only public, pinned model/runtime components in the current user's home.
// No log database or application profile is read or copied.
import {spawn,execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,stat,lstat,readFile,writeFile,rename,readdir,chmod,cp,rm,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const revision='91cad51170dc346986eccefdc2dd33a9da36ead9';
const base='https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/'+revision+'/';
export const manifest={
 model:{name:'qwen25-1.5b.gguf',url:base+'qwen2.5-1.5b-instruct-q4_k_m.gguf',bytes:1117320736,sha256:'6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'},
 license:{name:'MODEL-LICENSE.txt',url:base+'LICENSE',sha256:'832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e'},
 runtime:{
  arm64:{name:'runtime-macos-arm64.zip',url:'https://github.com/ggml-org/llama.cpp/releases/download/b6500/llama-b6500-bin-macos-arm64.zip',bytes:10699243,sha256:'4f34ae19823ee22e8036d6da91f083ca62ab926c2a0a4a5ce9df34897360087b'},
  x64:{name:'runtime-macos-x64.zip',url:'https://github.com/ggml-org/llama.cpp/releases/download/b6500/llama-b6500-bin-macos-x64.zip',bytes:29665445,sha256:'6ff7ba3d9f8150735bae762bc3040cced6fd5a6de8997bf6af2fc840a3b27327'}
 }
};
export async function sha256(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export function safeZipNames(names){
 return names.length>0&&names.every(name=>name&&!name.includes('\\')&&!name.startsWith('/')&&!name.split('/').includes('..')&&!/^[a-z]:/i.test(name));
}
const emit=data=>process.stdout.write(JSON.stringify(data)+'\n');
let child=null,cancelled=false;
const checkCancelled=()=>{if(cancelled)throw Error('Installation cancelled.');};
function command(file,args){checkCancelled();return new Promise((resolve,reject)=>{const proc=spawn(file,args,{stdio:['ignore','ignore','ignore']});child=proc;proc.once('error',reject);proc.once('exit',code=>{if(child===proc)child=null;code===0?resolve():reject(Error(path.basename(file)+' failed ('+code+'); please check network and disk space.'));});});}
function proxyArgs(){
 if(process.env.HTTPS_PROXY||process.env.https_proxy||process.env.ALL_PROXY||process.env.all_proxy)return [];
 try{
  const text=execFileSync('/usr/sbin/scutil',['--proxy'],{encoding:'utf8',timeout:3000});
  const value=k=>text.match(new RegExp('^\\s*'+k+'\\s*:\\s*(\\S+)','m'))?.[1];
  for(const [prefix,scheme] of [['HTTPS','http'],['HTTP','http'],['SOCKS','socks5h']])if(value(prefix+'Enable')==='1'){
   const host=value(prefix+'Proxy'),port=value(prefix+'Port');
   if(host&&/^[a-z0-9.:[\]-]+$/i.test(host)&&/^\d{1,5}$/.test(port||''))return ['--proxy',scheme+'://'+host+':'+port];
  }
 }catch{}
 return [];
}
async function verifiedDownload(dir,item,phase){
 checkCancelled();
 const file=path.join(dir,item.name);
 try{if((await sha256(file))===item.sha256){emit({phase,ready:true,received:(await stat(file)).size,total:item.bytes||0});return file;}}catch{}
 const partial=file+'.part';let timer;
 try{
  emit({phase,received:0,total:item.bytes||0});
  timer=setInterval(()=>stat(partial).then(s=>emit({phase,received:s.size,total:item.bytes||0})).catch(()=>{}),1000).unref();
  await command('/usr/bin/curl',['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','1200','--proto','=https','--proto-redir','=https',...proxyArgs(),'--output',partial,item.url]);
  if((await sha256(partial))!==item.sha256)throw Error('Downloaded '+item.name+' failed SHA-256 verification.');checkCancelled();
  await rename(partial,file);emit({phase,ready:true,received:(await stat(file)).size,total:item.bytes||0});return file;
 }finally{clearInterval(timer);await rm(partial,{force:true});}
}
async function locateServer(directory,depth=0){
 const entries=await readdir(directory,{withFileTypes:true});
 if(entries.some(e=>e.name==='llama-server'&&e.isFile()))return directory;
 if(depth<4)for(const entry of entries)if(entry.isDirectory()){const found=await locateServer(path.join(directory,entry.name),depth+1);if(found)return found;}
 return null;
}
export async function install({destination,arch=process.arch}={}){
 if(process.platform!=='darwin')throw Error('This installer requires macOS.');
 const runtime=manifest.runtime[arch];if(!runtime)throw Error('Unsupported Mac architecture: '+arch);
 const dir=path.resolve(destination||path.join(homedir(),'Library/Application Support/WorkJournal/capture-model'));
 if(dir===path.parse(dir).root||dir===homedir())throw Error('Choose a dedicated component directory.');
 await mkdir(dir,{recursive:true});if((await lstat(dir)).isSymbolicLink())throw Error('Component directory must not be a symbolic link.');
 const lock=path.join(dir,'.install-lock');
 try{await mkdir(lock);}catch(e){
  if(e.code!=='EEXIST')throw e;
  let alive=false;try{const owner=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));if(Number.isInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);alive=true;}catch{}}}catch{alive=Date.now()-(await stat(lock)).mtimeMs<30000;}
  if(alive)throw Error('Another installation is already running; wait for it to finish.');
  if(path.dirname(lock)!==dir)throw Error('Unexpected lock path.');await rm(lock,{recursive:true,force:true});await mkdir(lock);
 }
 await writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));
 let work;
 const terminate=()=>{cancelled=true;child?.kill('SIGTERM');process.exitCode=130;};
 process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
 try{
  const model=await verifiedDownload(dir,manifest.model,'model');
  await verifiedDownload(dir,manifest.license,'license');
  const archive=await verifiedDownload(dir,runtime,'runtime');
  const names=execFileSync('/usr/bin/unzip',['-Z1',archive],{encoding:'utf8',maxBuffer:4*1024*1024}).trim().split(/\r?\n/);
  if(!safeZipNames(names))throw Error('Runtime archive contains an unsafe path.');
  work=await mkdtemp(path.join(dir,'.install-'));const unpacked=path.join(work,'unpacked');await mkdir(unpacked);
  emit({phase:'installing'});await command('/usr/bin/ditto',['-x','-k',archive,unpacked]);
  const binaries=await locateServer(unpacked);if(!binaries)throw Error('Runtime archive has no llama-server.');checkCancelled();
  const ready=path.join(work,'runtime');await cp(binaries,ready,{recursive:true,dereference:false});
  for(const entry of await readdir(ready,{withFileTypes:true}))if(entry.isFile()&&(entry.name.startsWith('llama-')||entry.name.endsWith('.dylib')))await chmod(path.join(ready,entry.name),0o755);
  checkCancelled();const target=path.join(dir,'runtime'),prior=path.join(work,'previous-runtime');let moved=false;
  try{await rename(target,prior);moved=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await rename(ready,target);}catch(e){if(moved)await rename(prior,target);throw e;}
  const component={model:'Qwen2.5-1.5B-Instruct-Q4_K_M',source:'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',revision,sha256:manifest.model.sha256,runtime:'llama.cpp b6500',arch,idleSeconds:120};
  const temp=path.join(dir,'component.json.tmp');await writeFile(temp,JSON.stringify(component,null,2));await rename(temp,path.join(dir,'component.json'));
  emit({phase:'ready',ready:true,model:path.basename(model)});
 }finally{
  process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);
  if(work&&path.dirname(work)===dir&&path.basename(work).startsWith('.install-'))await rm(work,{recursive:true,force:true});
  await rm(lock,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--inspect'))console.log(JSON.stringify(manifest,null,2));
 else{const index=process.argv.indexOf('--destination');try{if(index>=0&&!process.argv[index+1])throw Error('Missing destination.');await install({destination:index<0?undefined:process.argv[index+1]});}catch(e){emit({phase:'error',error:e.message});process.exitCode=1;}}
}
