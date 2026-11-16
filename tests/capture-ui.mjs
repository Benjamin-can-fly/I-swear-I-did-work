import {chromium, webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.env.WORKLOG_TEST_APP || process.cwd();
const out = path.resolve(process.env.WORKLOG_TEST_OUTPUT || 'artifacts/capture-first-20261104/screens');
await mkdir(out, {recursive:true});
const engines=[[chromium, {channel:'msedge'}], [webkit, {}]].filter(([engine])=>!process.env.WORKLOG_TEST_BROWSER||process.env.WORKLOG_TEST_BROWSER===engine.name());
for (const [index, [engine, options]] of engines.entries()) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'worklog-capture-'));
  const port = 43423 + index, url = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, ['server/index.js'], {cwd:root, windowsHide:true, stdio:'pipe',
    env:{...process.env,WORKLOG_CAPTURE_OFFLINE:'1', PORT:String(port), DATA_DIR:dir, WORKLOG_CAPTURE_HOME:path.join(dir, 'no-model')}});
  let browser;
  try {
    await new Promise((resolve,reject)=>{server.stdout.once('data',resolve); server.once('error',reject);server.once('exit',code=>reject(Error('Server exit '+code)));});
    browser = await engine.launch({headless:true, ...options});
    const page = await browser.newPage({viewport:{width:1080,height:820},timezoneId:'Asia/Shanghai',locale:'zh-CN',reducedMotion:'reduce'});
    page.setDefaultTimeout(6500);
    const errors = [];
    page.on('pageerror', e=>errors.push(e.message));
    // Existing installations that opted out of yesterday's experiment must get the same entry.
    await page.addInitScript(()=>localStorage.setItem('worklog.capture-mode','off'));
    const read = async()=>(await(await fetch(url+'/api/data')).json()).data;
    const nav = async name=>{await page.locator('.sidebar [data-page='+name+']').click();await page.locator('#'+name+'-page').waitFor({state:'visible'});};
    const form = page.locator('#task-form'), field = page.locator('#task-input');
    const record = page.locator('#record-form'), input = page.locator('#raw-input');
    const review = async f=>{const summary=f.locator('.capture-results>summary');await summary.waitFor();if(!await f.locator('.capture-results').getAttribute('open'))await summary.click();};
    const saved = async selector=>page.waitForFunction(s=>{const el=document.querySelector(s);return el && !el.value && !el.form.querySelector('[type=submit]').disabled;},selector);
    await page.goto(url);
    await page.locator('#today-page #task-input').waitFor();
    assert.equal(await field.getAttribute('placeholder'),null);
    await field.fill('帮我记一下，我今天晚上');await field.press('Enter');
    assert.equal(await form.locator('.capture-line').count(),0);assert.equal((await read()).tasks.length,0);
    const daily = '帮我记一下，每天晚上8：00钟记单词';
    await field.fill(daily);
    await review(form);await form.locator('.capture-line summary').filter({hasText:'20:00'}).waitFor();
    assert.equal(await page.locator('.capture-toggle, [data-new-today]').count(), 0);
    assert.equal(await form.locator('.composer-fields').isVisible(), false);
    await nav('tasks');
    assert.equal(await page.locator('#tasks-page #task-input').inputValue(), daily);
    await nav('today');
    assert.equal(await page.locator('#today-page #task-input').inputValue(), daily);
    await page.screenshot({path:path.join(out, engine.name()+'-today-plan.png')});
    await field.press('Enter'); await saved('#task-input');
    let d = await read();
    assert.equal(d.routines.length,1); const plan=d.routines[0];
    assert.equal(plan.title,'记单词'); assert.equal(plan.repeatFrequency,'daily');
    assert.equal(plan.slots[0].time,'20:00'); assert.equal(plan.scheduling,'times');
    assert.ok(d.tasks.some(t=>t.routineId===plan.id));
    assert.ok(d.tasks.every(t=>t.routineId===plan.id && t.due && t.dueTime==='20:00'));
    // Undo must remove both the plan and any occurrences created in the same save.
    await page.locator('#toast button').click();
    await page.waitForFunction(async()=>!((await(await fetch('/api/data')).json()).data.routines||[]).length);
    assert.equal((await read()).tasks.length,0);

    const spoken='今天晚上21： 00前要把csp作业补完然后把数学学了，还有seminar（优先级高）';
    await field.fill(spoken);await review(form);await form.locator('.capture-line').nth(2).waitFor();
    assert.equal(await form.locator('.capture-line').count(),3);
    await form.locator('.capture-line').nth(2).locator('summary').click();
    assert.equal(await form.locator('[data-field=priority]').nth(2).inputValue(),'high');
    // A per-item correction survives a draft reload and does not alter its siblings.
    await form.locator('[data-field=priority]').nth(1).evaluate(el=>{el.value='low';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.reload();await field.waitFor();await review(form);await form.locator('.capture-line').nth(2).waitFor();
    assert.equal(await form.locator('[data-field=priority]').nth(1).inputValue(),'low');
    await form.screenshot({path:path.join(out,engine.name()+'-multi-action-preview.png')});
    await field.press('Enter');await saved('#task-input');d=await read();
    assert.deepEqual(d.tasks.map(t=>[t.title,t.dueTime,t.priority]),[['补完csp作业','21:00','normal'],['学数学','21:00','low'],['seminar','21:00','high']]);
    assert.equal(d.records.length,0);assert.ok(d.tasks.every(t=>t.captureRaw===spoken));
    await page.locator('#toast button').click();await page.waitForFunction(async()=>!(await(await fetch('/api/data')).json()).data.tasks.length);

    await field.fill('帮我记一下，我今天晚上八点截止，背单词');
    const preview=form.locator('.capture-line summary').first();await review(form);await preview.waitFor();let caption=await preview.innerText();
    assert.match(caption,/20:00/);assert.match(caption,/背单词/);assert.doesNotMatch(caption,/帮我|待办事项|安排日期|截止/);
    await form.screenshot({path:path.join(out,engine.name()+'-deadline-preview.png')});
    await field.press('Enter');await saved('#task-input');d=await read();
    assert.equal(d.tasks[0].title,'背单词');assert.equal(d.tasks[0].dueTime,'20:00');assert.equal(d.tasks[0].due,await page.evaluate(()=>new Date().toLocaleDateString('sv-SE')));
    await page.locator('#toast button').click();await page.waitForFunction(async()=>!(await(await fetch('/api/data')).json()).data.tasks.length);
    await field.fill('我今晚背单词');await review(form);await preview.waitFor();caption=await preview.innerText();assert.match(caption,/晚/);assert.match(caption,/背单词/);assert.doesNotMatch(caption,/\d{1,2}:\d{2}|待办事项|安排日期/);
    await field.fill('');
    await nav('journal');
    const raw='下午把组会 PPT 改完了，删了第 8 页，给第 12 页补了实验图。明天中午前发给王老师。打印先别管。';
    await input.fill(raw); await review(record);await record.locator('.capture-line summary').nth(1).waitFor();
    await input.press('Control+Enter'); assert.equal(await input.inputValue(),raw+'\n');
    await input.press('Enter'); await saved('#raw-input'); d=await read();
    assert.equal(d.records.length,1); assert.equal(d.tasks.length,1); assert.equal(d.records[0].raw,raw); assert.equal(d.tasks[0].dueTime,'12:00');

    await nav('tasks');
    await field.fill('周五写报告');
    await form.locator('.expand-fields').click();
    await form.locator('[name=project]').fill('课堂');
    await form.locator('[name=autoSyncRecord]').check();
    await form.locator('[type=file]').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('source')});
    await form.locator('.attachment').waitFor();
    await form.locator('.expand-fields').click();
    await field.press('Enter');await saved('#task-input'); d=await read();
    const scheduled=d.tasks.find(t=>t.title.includes('写报告'));
    assert.equal(scheduled.project,'课堂');assert.ok(scheduled.autoSyncRecord);assert.equal(scheduled.attachments.length,1);assert.equal(scheduled.due,'');assert.ok(scheduled.scheduledDate);

    // Guarded language cannot be committed before review; preserve a corrected draft across reloads.
    await field.fill('也许要写日记？'); await field.press('Enter');
    const kind=form.locator('[data-field=kind]').first();
    await kind.waitFor(); assert.equal((await read()).tasks.length,2);
    await kind.selectOption('task');
    const line=form.locator('.capture-line').first();
    if (!await line.getAttribute('open') && !await line.locator('[data-field=text]').isVisible()) await line.locator('summary').click();
    await line.locator('[data-field=text]').fill('这周挑三天写日记');
    await page.reload(); await nav('tasks');await review(form);await line.locator('summary').waitFor();assert.ok((await line.innerText()).includes('这周挑三天写日记'));
    await field.fill('明天交作业');await field.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal((await read()).tasks.length,2);

    const current=await(await fetch(url+'/api/data')).json(), stamp=new Date().toISOString();
    const mk=(id,title)=>({id,title,createdAt:stamp,status:'next',due:'',dueTime:'',notes:'',recordId:'',project:'',priority:'normal',autoSyncRecord:true});
    current.data.tasks.push(mk('draft','把 PPT 初稿发给王老师'),mk('final','把 PPT 终稿发给王老师'));
    assert.ok((await fetch(url+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)})).ok);
    await page.reload();await nav('tasks');await field.fill('刚把 PPT 发给王老师了');await field.press('Enter');
    await kind.waitFor(); assert.ok((await read()).tasks.every(t=>t.status==='next'));
    await kind.selectOption('id:final');await field.press('Enter');await saved('#task-input');d=await read();
    assert.equal(d.records.filter(r=>r.sourceTaskId==='final').length,1);assert.equal(d.tasks.find(t=>t.id==='draft').status,'next');

    await nav('journal');await input.fill('昨天下午做完了实验');await input.press('Enter');await saved('#raw-input');
    const loose=(await read()).records.find(r=>r.title==='做完了实验');
    assert.ok(loose);assert.equal(loose.time,'');assert.equal(loose.timePeriod,'afternoon');
    await page.locator('#records [data-entry-id="'+loose.id+'"]').click();await page.getByRole('menuitem',{name:'修改',exact:true}).click();
    await input.fill('做完了实验，已复核结果');await input.press('Enter');await saved('#raw-input');
    const edited=(await read()).records.find(r=>r.id===loose.id);
    assert.equal(edited.time,'');assert.equal(edited.timePeriod,'afternoon');assert.equal(edited.details,'做完了实验，已复核结果');
    await nav('settings');await page.locator('[data-mode=dark]').click();await page.locator('[data-language=en]').click();
    await page.waitForFunction(()=>document.documentElement.lang==='en');await page.setViewportSize({width:390,height:780});
    await nav('today');await field.fill('Practice vocabulary every day at 8 pm');
    await review(form);await form.locator('.capture-line summary').filter({hasText:/20:00|8:00\s?PM/i}).waitFor();
    await form.locator('.expand-fields').click();await form.locator('[type=submit]').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const button=await form.locator('[type=submit]').boundingBox();assert.ok(button.x>=0 && button.x+button.width<=390);
    await form.screenshot({path:path.join(out, engine.name()+'-options-en.png')});
    assert.deepEqual(errors,[]);
    console.log(engine.name()+': Today + Tasks shared draft, Journal mixed capture, real daily plan and undo, schedule vs deadline, attachment and settings, review, IME, English and narrow screen passed');
  } finally {await browser?.close();server.kill();}
}
