import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readData,saveData} from './store.js';
import {uploadAttachment,uploadThumbnail,attachmentResponse,exportAttachments} from './attachments.js';
import {readUsage,trackUsage} from './usage.js';
import {VERSION} from '../src/lib/version.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4317);
if(process.env.PARENT_PID){const parent=Number(process.env.PARENT_PID);setInterval(()=>{try{process.kill(parent,0);}catch{if(!writing)process.exit(0);}},2000).unref();}
let revision=0;
let writing=false;
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req) {let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>8_000_000)throw Error('内容过大');}return JSON.parse(s);}
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return json(res,403,{error:'不允许的主机'});
  if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return json(res,403,{error:'不允许跨站请求'});
  if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{app:'work-journal',version:VERSION,dataDirectory:path.resolve(process.env.DATA_DIR||'data'),ai:false,instance:process.env.INSTANCE_TOKEN||null});
  if(['/api/organize','/api/summarize'].includes(url.pathname))return json(res,410,{error:'总结功能已下架'});
  if(url.pathname==='/api/attachments'&&req.method==='POST')return json(res,200,await uploadAttachment(req,url.searchParams.get('name')));
  const attachment=url.pathname.match(/^\/api\/attachments\/([a-f0-9-]{36})(\/thumbnail)?$/);
  if(attachment&&req.method==='GET')return await attachmentResponse(res,attachment[1],Boolean(attachment[2]));
  if(attachment&&attachment[2]&&req.method==='POST'){await uploadThumbnail(req,attachment[1]);return json(res,200,{ok:true});}
  if(url.pathname==='/api/backup'&&req.method==='GET'){const data=await readData();return json(res,200,{...data,attachmentFiles:await exportAttachments(data)});}
  if(url.pathname==='/api/usage'&&req.method==='GET')return json(res,200,await readUsage());
  if(url.pathname==='/api/usage'&&req.method==='POST'){
   const b=await body(req);if(!['session','today','journal','tasks','timeline','dashboard','save'].includes(b.event))throw Error('无效统计事件');
   return json(res,200,await trackUsage(b.event));
  }
  if(url.pathname==='/api/data'&&req.method==='GET')return json(res,200,{data:await readData(),revision});
  if(url.pathname==='/api/data'&&req.method==='PUT') {
   const incoming=await body(req);if(writing||incoming.revision!==revision)return json(res,409,{error:'另一窗口更新了数据。请刷新后再试，输入草稿仍保留。'});
   writing=true;try{await saveData(incoming.data);revision++;return json(res,200,{revision});}finally{writing=false;}
  }
  if(req.method!=='GET')return json(res,405,{error:'不支持的操作'});
  const target=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','report.html'].includes(target)&&!/^src\/[a-zA-Z0-9_./-]+\.(js|css)$/.test(target)&&!/^src\/assets\/[a-zA-Z0-9_-]+\.(svg|png)$/.test(target))return json(res,404,{error:'未找到'});
  const file=path.resolve(root,target);if(!file.startsWith(root+path.sep))return json(res,403,{error:'禁止访问'});
  const content=await readFile(file);const ext=path.extname(file);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[ext],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(content);
 }catch(e){if(!res.headersSent)json(res,e.code==='ENOENT'?404:400,{error:e.message||'操作失败'});else res.end();}
}).listen(port,'127.0.0.1',()=>{console.log(`工作日志已启动 http://127.0.0.1:${port}`);if(process.env.INSTANCE_TOKEN)console.log('WORKJOURNAL_READY '+process.env.INSTANCE_TOKEN);});
