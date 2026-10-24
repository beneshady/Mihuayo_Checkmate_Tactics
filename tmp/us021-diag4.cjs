const path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
async function cell(p,to){const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.click(xy.x,xy.y);}
(async()=>{const browser=await pw.chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:844,height:390}});
 const save=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:null,battle:null});
 await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
 const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto(base+'/');
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu');
 await p.locator('#flow-new').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
 await p.locator('#tutorial-skip').click();await p.locator('#tutorial-skip-yes').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='camp');
 await p.locator('#camp-leave').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
 await p.locator('#flow-enter').click();await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
 await p.locator('#btn-deploy-confirm').click();
 await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
 await p.waitForTimeout(300);
 console.log('overlay hidden',await p.evaluate(()=>document.getElementById('ov-deploy').hidden));
 await p.locator('#mobile-tools [data-ui-view="units"]').click();
 await p.locator('[data-unit="starting-horse"]').click();
 if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();
 console.log('modes',await p.locator('#rook-modes button').allInnerTexts());
 await p.locator('[data-mode="horse-jump"]').click();
 await p.waitForTimeout(200);
 console.log('marks',JSON.stringify((await p.evaluate(()=>window.__M0_DEBUG__.getMarks())).map(m=>[m.x,m.y,m.layer])));
 for(const c of [{x:8,y:3},{x:8,y:1},{x:7,y:2}]){
  const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),c);
  const el=await p.evaluate(t=>{const e=document.elementFromPoint(t.x,t.y);return e?(e.id||e.className||e.tagName):null;},xy);
  console.log('cell',JSON.stringify(c),JSON.stringify(xy),'el',el);
 }
 await cell(p,{x:8,y:3});await p.waitForTimeout(350);
 console.log('preview',JSON.stringify(await p.locator('#preview-box').innerText()));
 console.log('mobile-preview',JSON.stringify(await p.locator('#mobile-preview').innerText()));
 console.log('execute enabled',await p.locator('#btn-execute').isEnabled());
 await p.locator('#btn-execute').click();await p.waitForTimeout(350);
 const s=await st(p);
 console.log('horse after',JSON.stringify(s.units.find(u=>u.id==='starting-horse')));
 await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
