(async()=>{
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('等待界面超时: '+String(fn));};
 const click=s=>{const el=document.querySelector(s);if(!el)throw Error('未找到 '+s);el.click();};
 try{
  if(!window.workJournalDesktop)throw Error('桌面桥接未注入');
  if(document.querySelector('#today-page').hidden||document.querySelector('#page-title').textContent!=='今天该做些什么')throw Error('今日首页未生效');
  if(document.title!=='Work Log')throw Error('名称未统一');
  click('.sidebar [data-page=settings]');await wait(()=>!document.querySelector('#settings-page').hidden);click('[data-accent="#3566a0"]');
  await wait(()=>getComputedStyle(document.documentElement).getPropertyValue('--green').trim()==='#3566a0');
  click('button[data-mode=dark]');await wait(()=>document.documentElement.dataset.mode==='dark');
  if(window.workJournalPlatform==='windows'&&document.querySelectorAll('.window-controls button').length!==3)throw Error('窗口按钮不完整');
  click('.sidebar [data-page=journal]');await wait(()=>!document.querySelector('#journal-page').hidden);
  const content=document.querySelector('#raw-input');content.value='桌面保存验证\n保留详细过程与 16:32 的时间';content.dispatchEvent(new Event('input',{bubbles:true}));click('#organize');await wait(()=>content.value==='');
  click('.sidebar [data-page=tasks]');await wait(()=>!document.querySelector('#tasks-page').hidden);
  const taskForm=document.querySelector('#task-form');if(taskForm.querySelector('.composer-fields').contains(taskForm.querySelector('.apply-time')))throw Error('截止日期仍被折叠');
  click('#task-form .apply-time');if(taskForm.elements.deadlineDay.value||taskForm.elements.deadlineHour.value||taskForm.elements.deadlineMinute.value)throw Error('新待办不应预填日和时分');
  const taskNow=new Date();for(const [key,value] of Object.entries({deadlineDay:String(taskNow.getDate()),deadlineHour:'16',deadlineMinute:'32',content:'桌面待办截止日期验证'})){const input=taskForm.elements[key];input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
  click('#new-task');await wait(()=>taskForm.elements.content.value==='');
  const taskData=(await(await fetch('/api/data')).json()).data.tasks.find(t=>t.title==='桌面待办截止日期验证');if(!taskData||taskData.dueTime!=='16:32')throw Error('桌面截止日期保存失败');
  click('.sidebar [data-page=timeline]');await wait(()=>document.querySelector('#open-report'));
  const now=new Date(),month=document.querySelector('#history-month');month.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');month.dispatchEvent(new Event('change',{bubbles:true}));click('#open-report');click('[data-report-unit=week]');click('[data-report-all]');
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PDF timeout')),15000);chrome.webview.addEventListener('message',e=>{if(e.data.type==='report-result'){clearTimeout(timer);e.data.success?resolve(e.data):reject(Error(e.data.message));}});});
  click('#export-report-pdf');await result;
  chrome.webview.postMessage({type:'plan-reminder',message:'12:00 计划提醒测试'});
  const response=await fetch('/api/data'),data=(await response.json()).data;
  if(!data.records.some(r=>r.details.includes('桌面保存验证')))throw Error('保存未持久化');
  click('.sidebar [data-page=today]');await wait(()=>!document.querySelector('#today-page').hidden);await new Promise(r=>setTimeout(r,650));
  window.__desktopTestResult={success:true,records:data.records.length,message:'Native record/task save, partial deadline, palette, integrated window controls and direct PDF verified'};
 }catch(e){window.__desktopTestResult={success:false,error:e.message+'\n'+e.stack};}
 window.__desktopTestDone=true;
})();
