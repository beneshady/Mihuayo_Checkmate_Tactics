// 临时诊断 2：手机横版点击为何未生效。
const path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
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
 console.log('layout',await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode));
 console.log('canvas rect',JSON.stringify(await p.evaluate(()=>{const c=document.querySelector('#scene canvas');const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})));
 console.log('topbar rect',JSON.stringify(await p.evaluate(()=>{const r=document.getElementById('topbar').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})));
 for(const c of [{x:0,y:0},{x:8,y:0},{x:0,y:3},{x:7,y:3},{x:4,y:2}]){
  const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),c);
  const el=await p.evaluate(t=>{const e=document.elementFromPoint(t.x,t.y);return e?e.id||e.className||e.tagName:null;},xy);
  console.log('cell',JSON.stringify(c),'->',JSON.stringify(xy),'element',el);
 }
 await p.locator('[data-deploy="starting-horse"]').click();
 const xy=await p.evaluate(()=>window.__M0_DEBUG__.grid.screenPoint({x:7,y:3}));
 await p.mouse.click(xy.x,xy.y);
 await p.waitForTimeout(300);
 console.log('after click horse pos',JSON.stringify((await st(p)).units.find(u=>u.id==='starting-horse')));
 console.log('banner',JSON.stringify(await p.locator('#banner').innerText()),'cls',await p.locator('#banner').getAttribute('class'));
 // 直接用移动端 target 调试 API 对照
 await p.evaluate(()=>window.__M0_DEBUG__.target({x:7,y:3}));
 await p.waitForTimeout(200);
 console.log('after debug target horse pos',JSON.stringify((await st(p)).units.find(u=>u.id==='starting-horse')));
 await browser.close();
})().catch(e=>{console.error('PROBE FAIL',e);process.exit(1)});
