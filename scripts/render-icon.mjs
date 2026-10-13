import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});await page.setContent('<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{width:100%;height:100%}</style>'+await readFile('src/assets/app-icon.svg','utf8'));await page.screenshot({path:'src/assets/app-icon.png',omitBackground:true});}finally{await browser.close();}
