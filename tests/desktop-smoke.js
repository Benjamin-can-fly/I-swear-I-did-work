(async()=>{
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('等待界面超时: '+String(fn));};
 const click=s=>{const el=document.querySelector(s);if(!el)throw Error('未找到 '+s);el.click();};
 try{
  if(!window.workJournalDesktop)throw Error('桌面桥接未注入');
  if(document.title!=='Work Log')throw Error('名称未统一');
  click('.sidebar [data-appearance]');click('[data-accent="#3566a0"]');
  await wait(()=>getComputedStyle(document.documentElement).getPropertyValue('--green').trim()==='#3566a0');
  click('[aria-label="关闭调色盘"]');
  if(window.workJournalPlatform==='windows'&&document.querySelectorAll('.window-controls button').length!==3)throw Error('窗口按钮不完整');
  const content=document.querySelector('#raw-input');content.value='桌面保存验证\n保留详细过程与 16:32 的时间';content.dispatchEvent(new Event('input',{bubbles:true}));click('#organize');await wait(()=>content.value==='');
  click('.sidebar [data-page=timeline]');await wait(()=>document.querySelector('#open-report'));
  const now=new Date(),month=document.querySelector('#history-month');month.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');month.dispatchEvent(new Event('change',{bubbles:true}));click('#open-report');click('[data-report-unit=week]');click('[data-report-all]');
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PDF timeout')),15000);chrome.webview.addEventListener('message',e=>{if(e.data.type==='report-result'){clearTimeout(timer);e.data.success?resolve(e.data):reject(Error(e.data.message));}});});
  click('#export-report-pdf');await result;
  const response=await fetch('/api/data'),data=(await response.json()).data;
  if(!data.records.some(r=>r.details.includes('桌面保存验证')))throw Error('保存未持久化');
  window.__desktopTestResult={success:true,records:data.records.length,message:'Native save, palette, integrated window controls and direct PDF verified'};
 }catch(e){window.__desktopTestResult={success:false,error:e.message+'\n'+e.stack};}
 window.__desktopTestDone=true;
})();
