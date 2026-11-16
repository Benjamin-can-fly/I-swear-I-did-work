import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {manifest,safeZipNames,sha256} from '../scripts/install-capture-model-macos.mjs';
test('Mac model assets are fixed official HTTPS downloads with exact digest and architecture',()=>{
 assert.deepEqual(Object.keys(manifest.runtime).sort(),['arm64','x64']);
 for(const asset of [manifest.model,manifest.license,...Object.values(manifest.runtime)]){const url=new URL(asset.url);assert.equal(url.protocol,'https:');assert.ok(['huggingface.co','github.com'].includes(url.hostname));assert.match(asset.sha256,/^[a-f0-9]{64}$/);assert.ok(!asset.url.includes('/main/'));}
 assert.equal(manifest.model.bytes,1117320736);
});
test('Mac archive checks reject traversal and hash uses exact file bytes',async()=>{
 assert.equal(safeZipNames(['build/bin/llama-server','build/bin/libllama.dylib']),true);
 for(const value of ['../file','/private/file','C:/file','foo/../../bar','foo\\bar'])assert.equal(safeZipNames([value]),false);
 const dir=await mkdtemp(path.join(tmpdir(),'worklog-hash-'));const file=path.join(dir,'test');await writeFile(file,'abc');assert.equal(await sha256(file),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
