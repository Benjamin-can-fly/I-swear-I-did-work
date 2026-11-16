import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);let cached=null,checked=0,pending;
export async function captureProxy(){
 const env=process.env.HTTPS_PROXY||process.env.https_proxy;if(env)return env;
 if(process.platform!=='win32')return '';
 try{const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';if($p.ProxyEnable -eq 1){$p.ProxyServer}"],{windowsHide:true,timeout:1500});const value=stdout.trim();if(/^[\w.-]+:\d+$/.test(value))return 'http://'+value;const https=value.match(/(?:^|;)https=([^;]+)/);return https?'http://'+https[1]:'';}catch{return '';}
}
export async function captureOnline(force=false){
 if(process.env.WORKLOG_CAPTURE_OFFLINE==='1')return false;
 if(['online','offline'].includes(process.env.WORKLOG_NETWORK_MODE))return process.env.WORKLOG_NETWORK_MODE==='online';
 if(!force&&cached!==null&&Date.now()-checked<10000)return cached;
 if(pending)return pending;
 pending=(async()=>{
  const via=captureProxy(),args=['--silent','--show-error','--head','--location','--max-time','3','--output',process.platform==='win32'?'NUL':'/dev/null','--write-out','%{http_code}'];
  const sites=[['https://www.baidu.com',true],['https://siliconflow.cn',true],['https://www.microsoft.com',false],['https://www.google.com/generate_204',false]];
  cached=await Promise.any(sites.map(async([url,domestic])=>{const proxy=domestic?'':await via;const {stdout}=await run(process.platform==='win32'?'curl.exe':'curl',[...args,...(domestic?['--noproxy','*']:proxy?['--proxy',proxy]:[]),url],{windowsHide:true,timeout:4000,maxBuffer:8192});if(!/^(200|204)$/.test(stdout.trim()))throw Error('Offline probe');return true;})).catch(()=>false);
  checked=Date.now();return cached;
 })().finally(()=>{pending=null;});return pending;
}
