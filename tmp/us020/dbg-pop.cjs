// Debug: population persistence round-trip through the camp UI.
const path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../../web/js/rules.js');
const base='http://127.0.0.1:8777';
function campRecord(over){const s=R.newGame();s.phase='intermission';return Object.assign(R.journeyRecord(s),{firstEntryRewarded:true,buffs:{health:true,move:false,rescue:false}},over||{});}
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:720}});
 const save=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20})});
 await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
 const p=await ctx.newPage();
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto(base+'/');
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='camp');
 console.log('start population',(await p.evaluate(()=>window.__M0_DEBUG__.getState())).population);
 await p.locator('[data-camp-expand]').click();
 console.log('after expand',(await p.evaluate(()=>window.__M0_DEBUG__.getState())).population,
  'stored',await p.evaluate(()=>JSON.parse(localStorage.getItem('m0-journey-v1')).journey.population));
 await p.reload();
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='camp');
 console.log('after reload state',(await p.evaluate(()=>window.__M0_DEBUG__.getState())).population,
  'stored',await p.evaluate(()=>JSON.parse(localStorage.getItem('m0-journey-v1')).journey.population));
 console.log('record pop', await p.evaluate(()=>window.M0Campaign.info().population));
 await browser.close();
})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1;});

