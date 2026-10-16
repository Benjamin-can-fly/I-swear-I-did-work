import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const dir=path.resolve(process.env.DATA_DIR||'data','attachments');
const validId=id=>/^[a-f0-9-]{36}$/.test(id);
const imageType=b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.subarray(0,6).toString().match(/^GIF8[79]a$/)?'image/gif':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':null;
async function bytes(req,limit=20*1024*1024){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>limit)throw Error('单个文件不能超过 20 MB');parts.push(part);}return Buffer.concat(parts);}
export async function uploadAttachment(req,name){
 const content=await bytes(req);if(!content.length)throw Error('文件为空');
 const id=randomUUID(),safeName=String(name||'文件').replace(/[\\/\x00-\x1f]/g,'_').slice(0,200),type=imageType(content)||'application/octet-stream';
 const meta={id,name:safeName,size:content.length,type,image:type.startsWith('image/')};await mkdir(dir,{recursive:true});await writeFile(path.join(dir,id),content);await writeFile(path.join(dir,id+'.json'),JSON.stringify(meta));return meta;
}
export async function uploadThumbnail(req,id){
 if(!validId(id))throw Error('附件编号不正确');await readFile(path.join(dir,id+'.json'));
 const content=await bytes(req,300000);if(!imageType(content))throw Error('缩略图格式不正确');await writeFile(path.join(dir,id+'.thumb'),content);
}
export async function attachmentResponse(res,id,thumbnail=false){
 if(!validId(id))throw Error('附件编号不正确');const meta=JSON.parse(await readFile(path.join(dir,id+'.json')));
 let content;try{content=await readFile(path.join(dir,id+(thumbnail?'.thumb':'')));}catch(e){if(!thumbnail||e.code!=='ENOENT')throw e;content=await readFile(path.join(dir,id));}
 const type=imageType(content)||'application/octet-stream';
 res.writeHead(200,{'Content-Type':type,'Content-Length':content.length,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${type.startsWith('image/')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`});res.end(content);
}
export async function exportAttachments(data){
 const ids=[...new Set([...data.records,...data.tasks,...(data.routines||[])].flatMap(e=>(e.attachments||[]).map(a=>a.id)))];
 return Promise.all(ids.map(async id=>{if(!validId(id))throw Error('附件编号不正确');return {id,content:(await readFile(path.join(dir,id))).toString('base64')};}));
}
