const path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
(async()=>{const browser=await pw.chromium.launch({headless:true});
for(const vp of [{width:844,height:390},{width:390,height:844},{width:900,height:500}]){
 const ctx=await browser.newContext({viewport:vp});const p=await ctx.newPage();
 const save=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:null,battle:null});
 await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
 await p.goto(base+'/');
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu');
 await p.locator('#flow-new').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
 await p.locator('#tutorial-skip').click();await p.locator('#tutorial-skip-yes').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='camp');
 await p.locator('#camp-leave').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
 await p.locator('#flow-enter').click();await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
 const rects=await p.evaluate(()=>{const g=id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),hidden:e.hidden};};
  const c=document.querySelector('#scene canvas');const cr=c.getBoundingClientRect();
  return {viewport:document.getElementById('game-viewport').dataset.layoutMode,shell:g('game-shell'),scene:g('scene'),canvas:{x:Math.round(cr.x),y:Math.round(cr.y),w:Math.round(cr.width),h:Math.round(cr.height)},panel:g('panel'),ovDeploy:g('ov-deploy'),topbar:g('topbar'),actions:g('actions')};});
 console.log(vp,JSON.stringify(rects));
 await ctx.close();
}
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
