// 只读冷加载诊断。不会覆盖既有ui-result，不提交游戏命令，不修改运行文件。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8773';
const files=['web/index.html','web/js/app.js','web/js/rules.js','web/js/ui.js','web/preview.html','web/js/preview.js','docs/us/us010-r3-evidence/ui-result.json'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const before=hashes(),runs=[];let browser;
const routes=[
 {name:'root-desktop',url:'/?diagnostic=load-20261005',width:1280,height:800},
 {name:'root-mobile',url:'/?diagnostic=load-mobile-20261005',width:448,height:924},
 {name:'preview-mate40pro',url:'/preview.html?device=mate40pro&acceptance=final-20261005',width:1280,height:800},
 {name:'preview-desktop',url:'/preview.html?device=desktop&diagnostic=load-20261005',width:1280,height:800}
];
(async()=>{
 browser=await pw.chromium.launch({headless:true});
 for(const instrument of [false,true])for(const route of routes)for(let iteration=1;iteration<=(instrument?1:3);iteration++){
  const context=await browser.newContext({viewport:{width:route.width,height:route.height},serviceWorkers:'block'});
  const page=await context.newPage(),entry={route:route.name,instrument,iteration,url:base+route.url,pageErrors:[],exceptions:[],console:[],requestFailures:[],badResponses:[],frames:[]};
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown',e=>entry.exceptions.push(e.exceptionDetails));
  page.on('pageerror',e=>entry.pageErrors.push({name:e.name,message:e.message,stack:e.stack}));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))entry.console.push({type:m.type(),text:m.text(),location:m.location()})});
  page.on('requestfailed',r=>entry.requestFailures.push({url:r.url(),failure:r.failure()}));
  page.on('response',r=>{if(r.status()>=400)entry.badResponses.push({url:r.url(),status:r.status()})});
  if(instrument)await context.addInitScript(()=>{
   window.__LOAD_DIAG__={observations:[],errors:[]};
   const nativeObserve=MutationObserver.prototype.observe;
   MutationObserver.prototype.observe=function(target,options){
    const call={href:location.href,readyState:document.readyState,target:target?{id:target.id||null,nodeType:target.nodeType,nodeName:target.nodeName}:null,stack:new Error('observe call').stack};
    window.__LOAD_DIAG__.observations.push(call);
    try{return nativeObserve.call(this,target,options)}catch(e){call.error={name:e.name,message:e.message,stack:e.stack};throw e}
   };
   addEventListener('error',e=>window.__LOAD_DIAG__.errors.push({message:e.message,filename:e.filename,line:e.lineno,column:e.colno,stack:e.error?.stack}));
  });
  await page.goto(entry.url,{waitUntil:'load'});await page.waitForTimeout(400);
  for(const frame of page.frames()){
   entry.frames.push(await frame.evaluate(()=>{
    const ids=['ally-list','selected-card','preview-box','skills','rook-modes','directions','btn-execute','ov-deploy','banner'];
    return {url:location.href,readyState:document.readyState,scripts:[...document.scripts].map(s=>s.src),gameReady:!!window.__M0_DEBUG__,phase:window.__M0_DEBUG__?.getState().phase,observedNodes:Object.fromEntries(ids.map(id=>[id,document.getElementById(id)?.nodeName||null])),diagnostic:window.__LOAD_DIAG__||null};
   }));
  }
  const game=entry.frames.find(f=>f.gameReady);entry.gameReady=!!game;
  runs.push(entry);console.log(JSON.stringify({route:entry.route,instrument,iteration,gameReady:entry.gameReady,pageErrors:entry.pageErrors,cdpExceptions:entry.exceptions.length,invalidObserve:entry.frames.reduce((n,f)=>n+(f.diagnostic?.observations.filter(o=>o.error).length||0),0)}));
  await context.close();
 }
 const after=hashes();const result={startedVersion:before,finishedVersion:after,sourceAndOriginalEvidenceUnchanged:JSON.stringify(before)===JSON.stringify(after),browserVersion:browser.version(),finishedAt:new Date().toISOString(),scope:'12 fresh-context cache-disabled baseline cold loads + 4 separate observe-instrumented loads; no gameplay/actions or resource injection',runs};
 const out='docs/us/us010-r3-evidence/load-diagnostic-20261005.json';fs.writeFileSync(out,JSON.stringify(result,null,2));
 console.log(JSON.stringify({output:path.resolve(out),runs:runs.length,errors:runs.reduce((n,r)=>n+r.pageErrors.length,0),exceptions:runs.reduce((n,r)=>n+r.exceptions.length,0),allGameReady:runs.every(r=>r.gameReady),unchanged:result.sourceAndOriginalEvidenceUnchanged},null,2));
 if(!result.sourceAndOriginalEvidenceUnchanged||runs.some(r=>r.pageErrors.length||!r.gameReady))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{await browser?.close()});
