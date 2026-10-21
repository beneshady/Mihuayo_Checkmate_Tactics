// Probe: can a headless chrome start and serve CDP when spawned with ignored stdio?
const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const exe=path.join(process.env.LOCALAPPDATA,'ms-playwright','chromium_headless_shell-1234','chrome-headless-shell-win64','chrome-headless-shell.exe');
const ud=path.join(process.cwd(),'tmp','us020','probe-profile');
fs.rmSync(ud,{recursive:true,force:true});fs.mkdirSync(ud,{recursive:true});
const port=9411;
const args=['--headless','--no-sandbox','--disable-gpu','--single-process','--remote-debugging-port='+port,'--user-data-dir='+ud,'about:blank'];
const child=spawn(exe,args,{detached:true,stdio:'ignore',windowsHide:true});
child.unref();
let exited=null;child.on('exit',(c)=>{exited=c;});
const get=url=>new Promise((res,rej)=>{http.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({status:r.statusCode,body:d}));}).on('error',rej);});
const wait=async()=>{const t0=Date.now();for(;;){if(exited!==null)throw Error('chrome exited '+exited);try{await get('http://127.0.0.1:'+port+'/json/version');return Date.now()-t0;}catch(e){if(Date.now()-t0>15000)throw Error('timeout: '+e.message);await new Promise(r=>setTimeout(r,300));}}};
(async()=>{
  const ms=await wait();
  const list=await get('http://127.0.0.1:'+port+'/json/list');
  console.log(JSON.stringify({ok:true,cdpMs:ms,version:JSON.parse((await get('http://127.0.0.1:'+port+'/json/version')).body).Browser,targets:JSON.parse(list.body).length}));
  try{process.kill(child.pid);}catch(e){}
})().catch(e=>{console.error('PROBE FAIL',e.message);try{process.kill(child.pid);}catch(_){}process.exitCode=1;});
