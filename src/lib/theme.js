import {openDialog,closeDialog} from './motion.js';
const DEFAULT='#466453', KEY='worklog.accent';
const valid=s=>/^#[0-9a-f]{6}$/i.test(s||'');
export const logoSVG=color=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="62" fill="${color}"/><rect x="57" y="47" width="132" height="159" rx="25" fill="#fff" opacity=".18" transform="rotate(-9 123 126)"/><rect x="70" y="49" width="133" height="161" rx="25" fill="#f2f6f2"/><path d="M100 87v83" fill="none" stroke="${color}" stroke-width="5" opacity=".3"/><g fill="${color}"><circle cx="100" cy="87" r="8"/><circle cx="100" cy="126" r="8"/><circle cx="100" cy="166" r="8"/><rect x="122" y="82" width="52" height="10" rx="5"/><rect x="122" y="121" width="39" height="10" rx="5"/><rect x="122" y="161" width="47" height="10" rx="5"/></g></svg>`;
const root=document.documentElement;
function hsl(hex){let [r,g,b]=hex.match(/\w\w/g).slice(0,3).map(v=>parseInt(v,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2,h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;h*=60;}return [h,s*100,l*100];}
let accent=DEFAULT;try{const saved=localStorage.getItem(KEY);if(valid(saved))accent=saved;}catch{}
function apply(color){
 if(!valid(color))return;accent=color.toLowerCase();const [h,s,l]=hsl(accent);
 // Keep the original lightness hierarchy: pale surfaces remain pale, text remains legible.
 for(const sheet of document.styleSheets){let rules;try{rules=sheet.cssRules;}catch{continue;}const visit=items=>{for(const rule of items){if(rule.cssRules)visit(rule.cssRules);if(!rule.style)continue;for(const name of rule.style){const text=rule.style.getPropertyValue(name);for(const match of text.matchAll(/--tone-([0-9a-f]{6,8})/gi)){const hex=match[1],[,os,ol]=hsl(hex);root.style.setProperty('--tone-'+hex,accent===DEFAULT?'#'+hex:`hsla(${h}, ${Math.min(s,os+12)}%, ${ol}%, ${hex.length===8?parseInt(hex.slice(6),16)/255:1})`);}}}};visit(rules);}
 root.style.setProperty('--green',accent);root.style.setProperty('--accent',accent);
 const rgb=accent.slice(1).match(/../g).map(x=>{const c=parseInt(x,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
 root.style.setProperty('--on-accent',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#18251e':'#ffffff');
 const svg=logoSVG(accent),url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 document.querySelectorAll('.brand-mark,.theme-logo').forEach(i=>i.src=url);const favicon=document.querySelector('link[rel=icon]');if(favicon){favicon.type='image/svg+xml';favicon.href=url;}
 document.querySelector('meta[name=theme-color]')?.setAttribute('content',accent);
 try{localStorage.setItem(KEY,accent);}catch{}
 document.querySelectorAll('[data-accent]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.accent===accent)));
 for(const id of ['accent-color','accent-hex']){const input=document.getElementById(id);if(input&&document.activeElement!==input)input.value=accent;}
 document.dispatchEvent(new CustomEvent('worklog-theme',{detail:{color:accent,svg}}));
}
function nativeTheme(){if(!window.chrome?.webview)return;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const img=new Image(),color=accent;img.onload=()=>{canvas.getContext('2d').drawImage(img,0,0,256,256);window.chrome.webview.postMessage({type:'set-theme',color,png:canvas.toDataURL('image/png').split(',')[1]});};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(logoSVG(accent));}
export function installAppearance(){
 const dialog=document.createElement('dialog');dialog.id='appearance';dialog.innerHTML=`<div class="dialog-heading"><h2>调色盘</h2><button class="icon-button" aria-label="关闭调色盘">×</button></div><div class="theme-preview"><img class="theme-logo" width="56" height="56" alt="应用图标"><div><strong>Work Log</strong><p>选择你喜欢的颜色</p></div></div><div class="theme-swatches">${[['#466453','松绿'],['#3566a0','湖蓝'],['#76619a','鸢紫'],['#a15d45','陶红'],['#786633','麦金'],['#46545e','岩灰']].map(([c,n])=>`<button data-accent="${c}" style="--swatch:${c}" aria-label="${n}" aria-pressed="false"><i></i><span>${n}</span></button>`).join('')}</div><label class="theme-custom">自选颜色<input id="accent-color" type="color" value="${accent}"><input id="accent-hex" aria-label="颜色代码" value="${accent}" maxlength="7" spellcheck="false"></label><p class="hint">按钮、选中状态与应用图标一起换色，选择自动保存。</p><button class="secondary" id="reset-accent">恢复默认绿色</button>`;document.body.append(dialog);
 dialog.querySelector('.icon-button').onclick=()=>closeDialog(dialog);
 document.querySelectorAll('[data-appearance]').forEach(b=>b.onclick=()=>openDialog(dialog));
 dialog.querySelectorAll('[data-accent]').forEach(b=>b.onclick=()=>{apply(b.dataset.accent);nativeTheme();});
 const picker=dialog.querySelector('#accent-color'),hex=dialog.querySelector('#accent-hex');picker.oninput=()=>apply(picker.value);picker.onchange=nativeTheme;hex.oninput=()=>{hex.setCustomValidity(valid(hex.value)?'':'请输入 # 加六位颜色代码');if(valid(hex.value))apply(hex.value);};hex.onchange=nativeTheme;hex.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();hex.reportValidity();if(valid(hex.value))nativeTheme();}};
 dialog.querySelector('#reset-accent').onclick=()=>{apply(DEFAULT);picker.value=hex.value=DEFAULT;nativeTheme();};apply(accent);nativeTheme();
 if(window.workJournalDesktop){
  const platform=window.workJournalPlatform||'windows';root.dataset.desktop=platform;
  if(platform==='windows'){
   const bar=document.querySelector('.topbar'),controls=document.createElement('div');controls.className='window-controls';controls.innerHTML='<button data-window="minimize" aria-label="最小化">−</button><button data-window="maximize" aria-label="最大化或还原">□</button><button data-window="close" aria-label="关闭窗口">×</button>';bar.append(controls);
   controls.addEventListener('click',e=>{const b=e.target.closest('[data-window]');if(b)window.chrome.webview.postMessage({type:'window',action:b.dataset.window});});
   bar.addEventListener('pointerdown',e=>{if(e.button===0&&!e.target.closest('button,input,select'))window.chrome.webview.postMessage({type:'window',action:'drag'});});
  }
 }
}
