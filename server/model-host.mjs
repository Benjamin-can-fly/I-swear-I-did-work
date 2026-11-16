// POSIX lifetime guard: native inference must not outlive the app's server.
import {spawn} from 'node:child_process';
const parent=Number(process.argv[2]),file=process.argv[3];
if(!Number.isInteger(parent)||parent<1||!file)process.exit(2);
const alive=()=>{try{process.kill(parent,0);return true;}catch{return false;}};
if(!alive())process.exit(0);
const child=spawn(file,process.argv.slice(4),{stdio:'ignore'});
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);child.kill('SIGTERM');setTimeout(()=>{child.kill('SIGKILL');process.exit(0);},1000).unref();};
const timer=setInterval(()=>{if(!alive())stop();},250);
child.once('error',()=>process.exit(1));child.once('exit',()=>{clearInterval(timer);process.exit(0);});
process.once('SIGTERM',stop);process.once('SIGINT',stop);process.once('exit',()=>child.kill());
