import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validDate} from '../src/lib/dates.js';
import {propose} from '../src/lib/capture.js';
import {captureOnline,captureProxy} from './capture-network.js';
import {capturePrompt,captureContext,structuredCapture} from './capture-structured.js';
const engine='Gemini 2.5 Flash',model='gemini-2.5-flash';
const configFile=path.join(process.platform==='win32'?process.env.LOCALAPPDATA||os.homedir():path.join(os.homedir(),'Library','Application Support'),'WorkJournal','capture-provider.json');
const fail=(code,message,status=503)=>Object.assign(new Error(message),{code,status});
async function apiKey(){if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY;try{return JSON.parse(await readFile(configFile,'utf8')).apiKey||'';}catch{return '';}}
export async function captureComponentStatus(){return {installed:false,configured:Boolean(await apiKey()),engine,loaded:false};}
export async function captureModelStatus(){const [online,key]=await Promise.all([captureOnline(),apiKey()]);return {available:online&&Boolean(key),configured:Boolean(key),installed:false,online,mode:online&&key?'model':'manual',engine:online&&key?engine:'rules',loaded:false,setupSupported:false,...(!online?{reason:'offline'}:!key?{reason:'missing-key'}:{})};}
export async function configureCaptureModel(input){
 if(!input||typeof input.apiKey!=='string'||input.apiKey.length>256)throw fail('INVALID_KEY','请填写有效的 API 密钥',400);
 const key=input.apiKey.trim();if(key&&!/^[A-Za-z0-9_-]{20,256}$/.test(key))throw fail('INVALID_KEY','API 密钥格式不正确',400);
 await mkdir(path.dirname(configFile),{recursive:true});if(!key){await unlink(configFile).catch(e=>{if(e.code!=='ENOENT')throw e;});}else{const tmp=configFile+'.tmp';await writeFile(tmp,JSON.stringify({provider:'gemini',model,apiKey:key}),{mode:0o600});await rename(tmp,configFile);}return captureModelStatus();
}
export const setupCaptureModel=()=>captureModelStatus();
export const warmCaptureModel=()=>captureModelStatus();
export function stopCaptureModel(){}
export async function inferCapture(){return {labels:[]};}
const quote=s=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r')+'"';
async function generate(key,body,signal){
 if(signal?.aborted)throw fail('MODEL_CANCELLED','已取消整理',499);
 const via=await captureProxy();
 return new Promise((resolve,reject)=>{
  const child=spawn(process.platform==='win32'?'curl.exe':'curl',['--silent','--show-error','--fail-with-body','--max-time','25','--connect-timeout','10','--request','POST','--url',`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,'--config','-',...(via?['--proxy',via]:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',done=false;const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
  const abort=()=>{child.kill();finish(fail('MODEL_CANCELLED','已取消整理',499));};signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',part=>{output+=part.toString();if(output.length>1_000_000){child.kill();finish(fail('MODEL_INVALID_RESPONSE','整理结果过长，请分段填写'));}});child.stderr.on('data',()=>{});
  child.once('error',()=>finish(fail('MODEL_NETWORK_FAILED','无法连接模型服务，请检查网络')));
  child.once('exit',code=>{if(done)return;let parsed;try{parsed=JSON.parse(output);}catch{return finish(fail('MODEL_NETWORK_FAILED','模型服务未返回有效结果，请稍后重试'));}if(code!==0||parsed.error){const status=parsed.error?.code;return finish(fail(status===429?'MODEL_QUOTA':status===400||status===401||status===403?'MODEL_AUTH':'MODEL_NETWORK_FAILED',status===429?'模型额度已用完或请求太频繁，请稍后重试':status===400||status===401||status===403?'模型密钥无效或尚未开通服务，请检查密钥':'模型服务暂时不可用，请稍后重试'));}finish(null,parsed);});
  child.stdin.on('error',()=>{});child.stdin.end('header = '+quote('Content-Type: application/json')+'\nheader = '+quote('x-goog-api-key: '+key)+'\ndata-binary = '+quote(JSON.stringify(body))+'\n');
 });
}
export async function parseCapture(input,signal){
 if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>3000||!validDate(input.day))throw fail('INVALID_CAPTURE','请填写不超过 3000 字的内容和有效日期',400);
 const raw=input.text.trim();if(!await captureOnline())return {rows:propose(raw,[],input.day),engine:'rules',mode:'manual',reason:'offline',timingMs:0};
 const key=await apiKey();if(!key)throw fail('MODEL_KEY_REQUIRED','请先在输入框中配置自己的 Gemini API 密钥');
 const start=performance.now();const response=await generate(key,{systemInstruction:{parts:[{text:capturePrompt+'\n'+captureContext(input.day)}]},contents:[{role:'user',parts:[{text:raw}]}],generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:2048,thinkingConfig:{thinkingBudget:0}}},signal);
 const candidate=response.candidates?.[0];if(candidate?.finishReason==='MAX_TOKENS')throw fail('MODEL_TRUNCATED','内容较长，请分段填写');
 let answer;try{answer=JSON.parse(candidate?.content?.parts?.map(p=>p.text||'').join('')||'');}catch{throw fail('MODEL_INVALID_RESPONSE','模型返回内容无法读取，原文已保留');}
 let result;try{result=structuredCapture(answer,raw,input.day);}catch{throw fail('MODEL_INVALID_RESPONSE','模型返回的事项字段不完整，请重试或修改原文');}
 return {...result,engine,mode:'model',timingMs:Math.round(performance.now()-start)};
}
