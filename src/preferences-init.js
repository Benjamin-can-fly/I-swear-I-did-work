// Runs before styles and the first frame to avoid a light flash on dark startup.
try {
 const root=document.documentElement;
 root.dataset.mode=localStorage.getItem('worklog.mode')==='dark'?'dark':'light';
 root.lang=localStorage.getItem('worklog.language')==='en'?'en':'zh-CN';
 const accent=localStorage.getItem('worklog.accent');
 if(/^#[0-9a-f]{6}$/i.test(accent||'')){
  root.style.setProperty('--accent',accent);root.style.setProperty('--green',accent);
 }
} catch {}
