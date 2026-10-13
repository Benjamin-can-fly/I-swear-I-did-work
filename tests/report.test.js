import test from 'node:test';
import assert from 'node:assert/strict';
import {reportGroup,reportEntries,reportHtml} from '../src/lib/report.js';
test('周分组跨年且以周一开始，月份与无日期分组',()=>{assert.equal(reportGroup('2027-01-01','week'),'2026-12-28 — 2027-01-03');assert.equal(reportGroup('2026-10-13','month'),'2026-10');assert.equal(reportGroup('','day'),'未确定日期');});
test('关联任务只导出一次并转义所有用户文字',()=>{const data={records:[{id:'r',sourceTaskId:'t',date:'2026-10-13',time:'12:34',title:'<img>',details:'逐行\n内容',attachments:[{name:'<附件>.pdf'}]}],tasks:[{id:'t',status:'done',completedAt:'2026-10-13T04:34:00Z'}]};const entries=reportEntries(data,new Set(['record:r','task:t']));assert.equal(entries.length,1);const html=reportHtml(entries,'<周报>','week');assert.ok(html.includes('&lt;周报&gt;'));assert.ok(html.includes('&lt;附件&gt;.pdf'));assert.ok(html.includes('逐行\n内容'));assert.ok(!html.includes('<img>'));});
