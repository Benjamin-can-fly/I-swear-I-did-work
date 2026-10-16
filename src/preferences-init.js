// Runs before styles and the first frame to avoid a light flash on dark startup.
try {
 const root=document.documentElement;
 root.dataset.mode=localStorage.getItem('worklog.mode')==='dark'?'dark':'light';
 root.lang=localStorage.getItem('worklog.language')==='en'?'en':'zh-CN';
} catch {}
