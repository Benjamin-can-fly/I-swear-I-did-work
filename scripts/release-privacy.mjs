// Fail a release before any personal database, profile, credentials or cache ships.
// This scans filenames and text; it cannot prove arbitrary prose/screenshots public.
import {readdir,readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const blockedDirs=new Set(['data','attachments','backups','backup','webview2','appearance','capture-model','profiles','profile','cache','caches','local storage','session storage','indexeddb','tmp','rollback','artifacts','test-results','node_modules','.build-tools','release-prep']);
const blockedFiles=/^(?:journal(?:\.[^.]+)*\.json|usage\.json|ai-settings\.json|desktop-settings\.json|provider-config\.json|capture-provider\.json(?:\.tmp)?|worklog-desktop\.json|local state|cookies|login data|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:log|pid|sqlite|sqlite3|db|ldb|pem|key|pfx|p12))$/i;
const textTypes=new Set(['.js','.mjs','.cjs','.json','.md','.txt','.html','.css','.yml','.yaml','.ps1','.py','.cs','.swift','.example','.nsi','.xml','.manifest']);
const secretPatterns=[/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/,/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{28,}\b/,/\bAIza[0-9A-Za-z_-]{30,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];

export async function scanRelease(directory,{mode='source'}={}){
 const root=path.resolve(directory),problems=[],files=[];
 if(!['source','runtime'].includes(mode))throw Error('Unknown release scan mode');
 async function visit(relative=''){
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
   if(entry.name==='.git'&&mode==='source')continue;
   const rel=path.posix.join(relative,entry.name),name=entry.name.toLowerCase(),file=path.join(root,rel);
   if(entry.isSymbolicLink()){problems.push({file:rel,reason:'symlink can include files outside release'});continue;}
   if(entry.isDirectory()){
    if(blockedDirs.has(name)){
     const members=await readdir(file);
     if(name==='data'&&members.every(n=>n==='.gitkeep'))continue;
     problems.push({file:rel,reason:'personal/generated directory'});continue;
    }
    await visit(rel);continue;
   }
   if(!entry.isFile()){problems.push({file:rel,reason:'unsupported filesystem entry'});continue;}
   files.push(rel);
   if(blockedFiles.test(name)||(name.startsWith('.env')&&name!=='.env.example')){problems.push({file:rel,reason:'private state or credentials filename'});continue;}
   if(mode==='runtime'&&/\.(?:zip|7z|bak|backup)$/i.test(name)){problems.push({file:rel,reason:'unexpected archive/backup in application'});continue;}
   if(!textTypes.has(path.extname(name)))continue;
   const info=await lstat(file);if(info.size>8_000_000){problems.push({file:rel,reason:'unexpectedly large text file requires review'});continue;}
   const contents=await readFile(file,'utf8');
   if(secretPatterns.some(pattern=>pattern.test(contents)))problems.push({file:rel,reason:'possible credential; value withheld'});
   if(path.extname(name)==='.json'){
    try{
     const json=JSON.parse(contents.replace(/^\uFEFF/,''));
     if(json&&(['records','tasks','routines'].some(k=>Array.isArray(json[k]))||Array.isArray(json.attachmentFiles)))problems.push({file:rel,reason:'database or exported backup is not release source'});
    }catch{/* Non-JSON source is not treated as a backup. */}
   }
   if(name==='.env.example'&&/^(?:AI_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|CAPTURE_API_KEY)\s*=\s*[^\s#]+/m.test(contents))problems.push({file:rel,reason:'example configuration has a credential value'});
  }
 }
 await visit();return {passed:problems.length===0,mode,files:files.length,problems};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const index=process.argv.findIndex(v=>['--source','--runtime'].includes(v));
 if(index<0||!process.argv[index+1]){console.error('Usage: node scripts/release-privacy.mjs --source <clean-source> | --runtime <app-folder>');process.exitCode=2;}
 else{const result=await scanRelease(process.argv[index+1],{mode:process.argv[index].slice(2)});console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}
}
