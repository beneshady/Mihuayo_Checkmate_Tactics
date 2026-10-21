const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const headless=path.join(process.env.LOCALAPPDATA,'ms-playwright','chromium_headless_shell-1234','chrome-headless-shell-win64','chrome-headless-shell.exe');
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const combos=[
 {name:'A-shell',exe:headless,port:9341,args:['--headless','--no-sandbox','--single-process','--in-process-gpu','--disable-gpu','--disable-breakpad','--disable-crash-reporter','--no-crashpad']},
 {name:'B-chrome',exe:chrome,port:9342,args:['--headless=new','--no-sandbox','--single-process','--in-process-gpu','--disable-gpu','--disable-breakpad','--disable-crash-reporter','--no-crashpad','--no-first-run']},
 {name:'C-chrome',exe:chrome,port:9343,args:['--headless=new','--no-sandbox','--in-process-gpu','--disable-gpu','--disable-breakpad','--disable-crash-reporter','--no-crashpad','--no-first-run','--disable-features=NetworkService']},
];
function get(port,path){return new Promise((res,rej)=>{http.get('http://127.0.0.1:'+port+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
function waitPort(port,ms){return new Promise(res=>{const t0=Date.now();const poll=()=>{http.get('http://127.0.0.1:'+port+'/json/version',r=>{r.resume();res(true);}).on('error',()=>{if(Date.now()-t0>ms)res(false);else setTimeout(poll,250);});};poll();});}
async function test(c){
 const ud=path.join(process.cwd(),'tmp','profile-'+c.name);fs.rmSync(ud,{recursive:true,force:true});fs.mkdirSync(ud,{recursive:true});
 const log=fs.openSync(path.join(process.cwd(),'tmp','log-'+c.name+'.log'),'w');
 const ch=spawn(c.exe,[...c.args,'--remote-debugging-port='+c.port,'--user-data-dir='+ud,'about:blank'],{stdio:['ignore',log,log],windowsHide:true});
 let exited=null;ch.on('exit',(code,sig)=>{exited=code;});
 const up=await waitPort(c.port,8000);
 if(!up){console.log(c.name,'NO PORT, exit=',exited,fs.readFileSync(path.join(process.cwd(),'tmp','log-'+c.name+'.log'),'utf8').split('\n').filter(l=>/FATAL|ERROR|DevTools/.test(l)).slice(-3).join(' | '));try{ch.kill();}catch(e){};return;}
 let ok=false,detail='';
 try{
  const v=await get(c.port,'/json/version');const ws=new WebSocket(v.webSocketDebuggerUrl);
  let id=0;const pending=new Map();
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  const send=(method,params={},sessionId)=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})}));});
  const t=await send('Target.createTarget',{url:'http://127.0.0.1:8791/index.html'});
  const a=await send('Target.attachToTarget',{targetId:t.result.targetId,flatten:true});const sid=a.result.sessionId;
  const race=p=>Promise.race([p,new Promise(r=>setTimeout(()=>r({timeout:true}),5000))]);
  const en=await race(send('Page.enable',{},sid));detail+='enable='+JSON.stringify(en).slice(0,40)+' ';
  const ev=await race(send('Runtime.evaluate',{expression:'document.title',returnByValue:true},sid));detail+='eval='+JSON.stringify(ev).slice(0,80);
  ok=!ev.timeout&&ev.result?.result?.value!==undefined;
  ws.close();
 }catch(e){detail='ERR '+e.message;}
 const logtxt=fs.readFileSync(path.join(process.cwd(),'tmp','log-'+c.name+'.log'),'utf8');
 const fatal=logtxt.split('\n').filter(l=>/FATAL/.test(l)).slice(-1)[0]||'';
 console.log(c.name,ok?'OK':'FAIL',detail,'fatal:',fatal.slice(0,120));
 try{ch.kill();}catch(e){}
}
(async()=>{for(const c of combos){await test(c);}process.exit(0);})();
