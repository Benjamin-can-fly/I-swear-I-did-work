(async()=>{
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('等待界面超时: '+String(fn));};
 const click=s=>{const el=document.querySelector(s);if(!el)throw Error('未找到 '+s);el.click();};
 try{
  if(document.querySelector('#save-state')?.textContent.includes('数据读取失败'))throw Error('初始化失败：'+document.querySelector('#toast')?.textContent);
  if(!window.workJournalDesktop)throw Error('桌面桥接未注入');
  if(document.querySelector('#today-page').hidden||document.querySelector('#page-title').textContent!=='今天该做些什么')throw Error('今日首页未生效');
  if(document.title!=='Work Log')throw Error('名称未统一');
  click('.sidebar [data-page=settings]');await wait(()=>!document.querySelector('#settings-page').hidden);click('[data-accent="#3566a0"]');
  await wait(()=>getComputedStyle(document.documentElement).getPropertyValue('--green').trim()==='#3566a0');
  click('button[data-mode=dark]');await wait(()=>document.documentElement.dataset.mode==='dark');
  if(window.workJournalPlatform==='windows'&&document.querySelectorAll('.window-controls button').length!==3)throw Error('窗口按钮不完整');
  click('.sidebar [data-page=journal]');await wait(()=>!document.querySelector('#journal-page').hidden);
  const raw='刚完成了桌面保存验证，保留详细过程';
  const content=document.querySelector('#raw-input');content.value=raw;content.dispatchEvent(new Event('input',{bubbles:true}));click('#organize');await wait(()=>content.value==='');
  const first=(await(await fetch('/api/data')).json()).data;
  if(first.records.length!==1||first.records[0].raw!==raw||!first.records[0].details.includes('保留详细过程'))throw Error('记录与原文未完整保存');
  click('.sidebar [data-page=tasks]');await wait(()=>!document.querySelector('#tasks-page').hidden);
  const taskForm=document.querySelector('#task-form');
  if(!taskForm.querySelector('.composer-fields').hidden)throw Error('新建事项的低频选项应默认折叠');
  taskForm.elements.content.value='今天16:32前核对截止日期';taskForm.elements.content.dispatchEvent(new Event('input',{bubbles:true}));
  click('#new-task');await wait(()=>taskForm.elements.content.value==='');
  const taskData=(await(await fetch('/api/data')).json()).data.tasks.find(t=>t.title==='核对截止日期');if(!taskData||taskData.dueTime!=='16:32')throw Error('桌面截止日期保存失败');
  click('#tasks [data-task="'+taskData.id+'"] [data-entry-menu]');
  const edit=[...document.querySelectorAll('#entry-menu button')].find(b=>b.textContent==='修改');if(!edit)throw Error('修改入口缺失');edit.click();
  await wait(()=>taskForm.querySelector('.composer-title').textContent.includes('编辑'));
  if(taskForm.querySelector('.composer-fields').hidden)click('#task-form .expand-fields');
  if(taskForm.elements.deadlineHour.value!=='16'||taskForm.elements.deadlineMinute.value!=='32')throw Error('修改未恢复分钟级时间');
  // WebKit may reject a partial native time value before dispatching submit.
  // Accept that real validation path too, but only for the deadline being edited.
  const deadlineNames=new Set(['due','dueTime','deadlineYear','deadlineMonth','deadlineDay','deadlineHour','deadlineMinute']);
  const invalidDeadline=new Set(),captureInvalid=e=>{if(!e.target.validity.valid)invalidDeadline.add(e.target.name);};
  taskForm.addEventListener('invalid',captureInvalid,true);
  taskForm.elements.deadlineMinute.value='';taskForm.elements.deadlineMinute.dispatchEvent(new Event('input',{bubbles:true}));
  if(taskForm.elements.dueTime.value!=='')throw Error('缺失分钟未清空待保存的截止时间');
  click('#new-task');
  try{await wait(()=>document.querySelector('#toast span').textContent.includes('补上日期和时间')||invalidDeadline.size>0);}
  finally{taskForm.removeEventListener('invalid',captureInvalid,true);}
  if([...invalidDeadline].some(name=>!deadlineNames.has(name)))throw Error('其他字段意外阻止截止日期校验: '+[...invalidDeadline].join(', '));
  if(!taskForm.querySelector('.composer-title').textContent.includes('编辑')||taskForm.elements.deadlineMinute.value!=='')throw Error('无效截止日期不应结束编辑或补填分钟');
  if((await(await fetch('/api/data')).json()).data.tasks.find(t=>t.id===taskData.id).dueTime!=='16:32')throw Error('不完整日期不应保存');
  for(const [key,value] of Object.entries({deadlineHour:'17',deadlineMinute:'05'})){const input=taskForm.elements[key];input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
  click('#new-task');await wait(()=>taskForm.elements.content.value==='');
  if((await(await fetch('/api/data')).json()).data.tasks.find(t=>t.id===taskData.id).dueTime!=='17:05')throw Error('分钟级修改未保存');
  click('.sidebar [data-page=timeline]');await wait(()=>document.querySelector('#open-report'));
  const now=new Date(),month=document.querySelector('#history-month');month.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');month.dispatchEvent(new Event('change',{bubbles:true}));click('#open-report');click('[data-report-unit=week]');click('[data-report-all]');
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PDF timeout')),15000);chrome.webview.addEventListener('message',e=>{if(e.data.type==='report-result'){clearTimeout(timer);e.data.success?resolve(e.data):reject(Error(e.data.message));}});});
  click('#export-report-pdf');await result;
  chrome.webview.postMessage({type:'plan-reminder',message:'12:00 计划提醒测试'});
  const response=await fetch('/api/data'),data=(await response.json()).data;
  if(!data.records.some(r=>r.details.includes('桌面保存验证')))throw Error('保存未持久化');
  click('.sidebar [data-page=today]');await wait(()=>!document.querySelector('#today-page').hidden);await new Promise(r=>setTimeout(r,650));
  window.__desktopTestResult={success:true,records:data.records.length,message:'Native offline capture, raw preservation, deadline edit and validation, palette, integrated window controls and direct PDF verified'};
 }catch(e){window.__desktopTestResult={success:false,error:e.message+'\n'+e.stack};}
 window.__desktopTestDone=true;
})();
