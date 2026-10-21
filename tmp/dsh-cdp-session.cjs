const http=require('node:http');
function get(path){return new Promise((res,rej)=>{http.get('http://127.0.0.1:9333'+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{
 const v=await get('/json/version');
 const ws=new WebSocket(v.webSocketDebuggerUrl);
 let id=0;const pending=new Map();
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method==='Target.attachedToTarget'){console.log('attached',m.params.sessionId,m.params.targetInfo.type,m.params.targetInfo.url);}else if(m.method){/*log others*/}};
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 const send=(method,params={},sessionId)=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})}));});
 const t=await send('Target.createTarget',{url:'http://127.0.0.1:8791/index.html'});
 const targetId=t.result.targetId;console.log('target',targetId);
 const a=await send('Target.attachToTarget',{targetId,flatten:true});
 console.log('attach',JSON.stringify(a));const sid=a.result.sessionId;
 console.log('Page.enable',JSON.stringify(await Promise.race([send('Page.enable',{},sid),new Promise(r=>setTimeout(()=>r({timeout:true}),4000))])));
 console.log('Runtime.evaluate',JSON.stringify(await Promise.race([send('Runtime.evaluate',{expression:'document.title+"|"+location.href',returnByValue:true},sid),new Promise(r=>setTimeout(()=>r({timeout:true}),4000))])));
 ws.close();
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
