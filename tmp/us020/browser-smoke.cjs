// Smoke: launch headless chrome with ignore stdio, connect over CDP.
const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const exe=path.join(process.env.LOCALAPPDATA,'ms-playwright','chromium_headless_shell-1234','chrome-headless-shell-win64','chrome-headless-shell.exe');
const ud=path.join(process.cwd(),'tmp','us020','profile');
fs.mkdirSync(ud,{recursive:true});
const port=9401;
const child=spawn(exe,['--headless','--no-sandbox','--disable-gpu','--single-process','--remote-debugging-port='+port,'--user-data-dir='+ud,'about:blank'],{detached:true,stdio:'ignore',windowsHide:true});
child.unref();
const waitCdp=()=>new Promise((res,rej)=>{const t0=Date.now();const poll=()=>http.get('http://127.0.0.1:'+port+'/json/version',r=>{r.resume();res(Date.now()-t0);}).on('error',()=>{if(Date.now()-t0>20000)return rej(Error('cdp timeout'));setTimeout(poll,250);});poll();});
(async()=>{
  const ms=await waitCdp();
  const browser=await pw.chromium.connectOverCDP('http://127.0.0.1:'+port);
  const ctx=browser.contexts()[0]||await browser.newContext();
  const page=await ctx.newPage();
  await page.setViewportSize({width:1280,height:720});
  await page.goto('http://127.0.0.1:8777/');
  await page.waitForFunction(()=>window.M0Campaign?.info().view==='menu',null,{timeout:15000});
  const info=await page.evaluate(()=>window.M0Campaign.info());
  console.log(JSON.stringify({cdpMs:ms,title:await page.title(),info}));
  fs.writeFileSync(path.join(process.cwd(),'tmp','us020','smoke.png'),await page.screenshot());
  await browser.close();
  process.kill(child.pid);
})().catch(e=>{console.error('FAIL',e.stack);try{process.kill(child.pid);}catch(_){}process.exitCode=1;});
