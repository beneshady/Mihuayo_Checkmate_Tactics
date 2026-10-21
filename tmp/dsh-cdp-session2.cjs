const http=require('node:http');
const port=Number(process.argv[2]||9335);
function get(path){return new Promise((res,rej)=>{http.get('http://127.0.0.1:'+port+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{
 const v=await get('/json/version');console.log('browser',v.Browser);
 const ws=new WebSocket(v.webSocketDebuggerUrl);
 let id=0;const pending=new Map();
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 const send=(method,params={},sessionId)=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})}));});
 const t=await send('Target.createTarget',{url:'http://127.0.0.1:8791/index.html'});
 const targetId=t.result.targetId;
 const a=await send('Target.attachToTarget',{targetId,flatten:true});const sid=a.result.sessionId;
 const race=(p)=>Promise.race([p,new Promise(r=>setTimeout(()=>r({timeout:true}),5000))]);
 console.log('Page.enable',JSON.stringify(await race(send('Page.enable',{},sid))));
 console.log('eval',JSON.stringify(await race(send('Runtime.evaluate',{expression:'document.title+"|"+location.href+"|"+(!!window.__M0_DEBUG__)',returnByValue:true},sid))));
 ws.close();
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
