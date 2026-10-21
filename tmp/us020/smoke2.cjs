// US-020 smoke: menu -> tutorial -> camp, checking console errors and key elements.
const A=require('node:assert/strict');
const path=require('node:path');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:720}});
 const errors=[];
 ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const p=await ctx.newPage();
 await p.goto(base+'/');
 await p.waitForFunction(()=>window.M0Campaign?.info().view==='menu',null,{timeout:20000});
 console.log('menu ok', JSON.stringify(await p.evaluate(()=>window.M0Campaign.info())));
 await p.locator('#flow-new').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
 console.log('tutorial screen', await p.locator('#flow-tutorial').isVisible(), 'skip disabled', await p.locator('#tutorial-skip').isDisabled());
 await p.screenshot({path:'tmp/us020/s1-tutorial.png'});
 await p.locator('#tutorial-enter').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='battle');
 const s=await p.evaluate(()=>window.__M0_DEBUG__.getState());
 console.log('battle state', JSON.stringify({phase:s.phase,turn:s.turn,wave:s.wave,map:s.mapName,units:s.units.map(u=>u.id+'@'+u.x+','+u.y)}));
 console.log('tutorial panel visible', await p.locator('#tutorial-hint').isVisible());
 await p.screenshot({path:'tmp/us020/s2-battle.png'});
 console.log('pageerrors', JSON.stringify(errors));
 await browser.close();
})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1;});
