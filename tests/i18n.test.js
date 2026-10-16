import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage={getItem:key=>key==='worklog.language'?'en':null};
const {tr,missingMessages}=await import('../src/lib/i18n.js');
const {esc}=await import('../src/lib/ui.js');
const {reportHtml}=await import('../src/lib/report.js');

test('English templates preserve literal user text, markup escaping and placeholder-like content',()=>{
 const user='删除 暂无记录 <script>alert(1)</script> {0}';
 assert.equal(tr`<p>${esc(user)}</p>`,'<p>'+esc(user)+'</p>');
 assert.equal(tr`<h2>工作记录</h2><p>${esc(user)}</p>`,'<h2>Journal</h2><p>'+esc(user)+'</p>');
 assert.equal(tr`${1} 条记录`,'1 entry');assert.equal(tr`${2} 条记录`,'2 entries');
 assert.equal(tr`<i>${'icon'}</i><small>${1} 条记录</small>`,'<i>icon</i><small>1 entry</small>');
});
test('English PDF content retains user titles, details and filenames, with localized metadata',()=>{
 const html=reportHtml([{kind:'record',id:'1',date:'2026-10-15',time:'11:23',status:'done',title:'工作记录',body:'删除 <b>原文</b> {5}',attachments:[{name:'中文附件.pdf'}],source:{durationMinutes:30,project:'工作空间'}}],'我的周报','day');
 assert.match(html,/<html lang="en">/);assert.match(html,/Exported /);assert.match(html,/Time spent: /);
 assert.match(html,/<h3>工作记录<\/h3>/);assert.match(html,/删除 &lt;b&gt;原文&lt;\/b&gt; \{5\}/);assert.match(html,/中文附件.pdf/);
 assert.deepEqual(missingMessages(),[]);
});
