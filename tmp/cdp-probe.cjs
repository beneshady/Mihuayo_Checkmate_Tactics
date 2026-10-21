const path=require('node:path');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const b=await pw.chromium.connectOverCDP('http://127.0.0.1:9333');
  console.log('contexts',b.contexts().length);
  try{
    const c=await b.newContext({viewport:{width:1280,height:900}});
    const p=await c.newPage();await p.goto('http://127.0.0.1:8785/');console.log('newContext title',await p.title(),await p.viewportSize());await c.close();
  }catch(e){console.log('newContext FAIL',e.message.split('\n')[0]);}
  const c0=b.contexts()[0];const p=await c0.newPage();await p.goto('http://127.0.0.1:8785/');console.log('shared title',await p.title());
  await p.setViewportSize({width:390,height:844});console.log('vp',await p.viewportSize());
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
