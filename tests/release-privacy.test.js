import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {scanRelease} from '../scripts/release-privacy.mjs';

test('release gate permits source and rejects private database/profile/credentials without printing values',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'worklog-release-gate-'));
 await mkdir(path.join(root,'src/lib'),{recursive:true});await mkdir(path.join(root,'data'));
 await writeFile(path.join(root,'src/lib/attachments.js'),'export const attachments=[];');
 await writeFile(path.join(root,'data/.gitkeep'),'');await writeFile(path.join(root,'package.json'),'{}');
 await writeFile(path.join(root,'.env.example'),'GEMINI_API_KEY=\n');
 assert.equal((await scanRelease(root)).passed,true);
 await writeFile(path.join(root,'data/journal.json'),'{}');
 await writeFile(path.join(root,'secret-export.json'),JSON.stringify({version:1,records:[],tasks:[]}));
 await writeFile(path.join(root,'.env'),'GEMINI_API_KEY=do-not-print-this');
 await mkdir(path.join(root,'WebView2'));await writeFile(path.join(root,'WebView2/Local State'),'{}');
 const report=await scanRelease(root);assert.equal(report.passed,false);
 assert.deepEqual(report.problems.map(p=>p.file).sort(),['.env','WebView2','data','secret-export.json']);
 assert.ok(!JSON.stringify(report).includes('do-not-print-this'));
});

test('release gate detects a secret embedded in otherwise allowed code',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'worklog-release-secret-'));
 const fake='gh'+'p_'+'A'.repeat(36);
 await writeFile(path.join(root,'example.js'),'const key="'+fake+'";');
 const report=await scanRelease(root);assert.equal(report.passed,false);assert.ok(!JSON.stringify(report).includes(fake));
});
