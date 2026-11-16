(async()=>{
 try{
  const response=await fetch('/api/data'),data=await response.json();
  if(!response.ok)throw Error(JSON.stringify({status:response.status,data}));
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PDF timeout')),25000);chrome.webview.addEventListener('message',e=>{if(e.data.type==='report-result'){clearTimeout(timer);e.data.success?resolve(e.data):reject(Error(e.data.message));}});});
  chrome.webview.postMessage({type:'export-report',html:'<!doctype html><html><body><h1>Work Log PDF window check</h1><p>Background export without an application switcher entry.</p></body></html>',title:'Window policy check'});
  await result;
  window.__desktopTestResult={success:true,records:data.data.records.length,initializationState:document.querySelector('#save-state')?.textContent,toast:document.querySelector('#toast')?.textContent,message:'Native PDF background window completed and returned success.'};
 }catch(e){window.__desktopTestResult={success:false,error:e.message};}
 window.__desktopTestDone=true;
})();
