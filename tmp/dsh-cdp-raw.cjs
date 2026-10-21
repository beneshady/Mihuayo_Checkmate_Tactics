const http=require('node:http');
function get(path){return new Promise((res,rej)=>{http.get('http://127.0.0.1:9333'+path,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
(async()=>{
 const v=await get('/json/version');console.log('version',v.Browser, v.webSocketDebuggerUrl);
 const targets=await get('/json/list');console.log('targets',targets.map(t=>[t.type,t.url]));
 const ws=new WebSocket(v.webSocketDebuggerUrl);
 let id=0;const pending=new Map();
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method){console.log('event',m.method);}};
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 const send=(method,params={})=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
 console.log('getVersion',JSON.stringify(await send('Browser.getVersion')).slice(0,150));
 console.log('getTargets',JSON.stringify(await send('Target.getTargets')).slice(0,300));
 const t=await send('Target.createTarget',{url:'http://127.0.0.1:8791/index.html'});
 console.log('createTarget',JSON.stringify(t));
 await new Promise(r=>setTimeout(r,1500));
 const list=await get('/json/list');console.log('targets2',list.map(t=>[t.type,t.url,t.title]));
 ws.close();
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
