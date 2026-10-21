// Capability probe: normal playwright launch vs CDP attach.
const path=require('node:path');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
(async()=>{
  const t0=Date.now();
  const browser=await pw.chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');
  await page.waitForFunction(()=>window.M0Campaign?.info().view==='menu',null,{timeout:20000});
  const info=await page.evaluate(()=>window.M0Campaign.info());
  console.log(JSON.stringify({ok:true,launchMs:Date.now()-t0,title:await page.title(),info,errors}));
  await page.screenshot({path:path.join(process.cwd(),'tmp','us020','smoke-menu.png')});
  await browser.close();
})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1;});
