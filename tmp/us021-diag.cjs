// 临时诊断：定位验收失败原因（不交付）。
const path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
async function cell(p,to){const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.click(xy.x,xy.y);}
async function hover(p,to){const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.move(xy.x,xy.y);}
function save(){return {version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:null,battle:null};}
async function open(browser,s,viewport){
 const ctx=await browser.newContext({viewport});
 if(s)await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(s))});}catch(e){}`);
 const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto(base+'/');
 return {ctx,p};
}
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 // 1) 手机横版
 {
  const {ctx,p}=await open(browser,save(),{width:844,height:390});
  await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu');
  await p.locator('#flow-new').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
  await p.locator('#tutorial-skip').click();await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(()=>window.M0Campaign.info().view==='camp');
  await p.locator('[data-recruit="horse"]').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().party.some(u=>u.id==='recruit-horse-0'));
  await p.locator('[data-camp-roster="starting-horse"]').click();await p.waitForTimeout(150);
  await p.locator('[data-camp-roster="recruit-horse-0"]').click();await p.waitForTimeout(150);
  await p.locator('#camp-leave').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
  await p.locator('#flow-enter').click();await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
  await p.locator('[data-deploy="recruit-horse-0"]').click();
  await cell(p,{x:7,y:3});
  await p.locator('#btn-deploy-confirm').click();await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
  console.log('MOBILE phase',(await st(p)).phase);
  console.log('mobile units visible?',await p.locator('[data-unit="recruit-horse-0"]').first().isVisible());
  await p.locator('#mobile-tools [data-ui-view="units"]').click();
  await p.locator('[data-unit="recruit-horse-0"]').first().click();
  if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();
  console.log('MOBILE selected?',(await st(p)).phase);
  console.log('MOBILE modes',await p.locator('#rook-modes button').allInnerTexts());
  const jumpBtn=p.locator('[data-mode="horse-jump"]');
  console.log('MOBILE jump btn visible',await jumpBtn.isVisible(),'enabled',await jumpBtn.isEnabled());
  await jumpBtn.click();await p.waitForTimeout(150);
  console.log('MOBILE marks',JSON.stringify((await p.evaluate(()=>window.__M0_DEBUG__.getMarks())).map(m=>[m.x,m.y,m.layer])));
  const xy=await p.evaluate(()=>window.__M0_DEBUG__.grid.screenPoint({x:7,y:5}));console.log('MOBILE target xy',xy);
  await cell(p,{x:7,y:5});await p.waitForTimeout(300);
  console.log('MOBILE preview box',JSON.stringify(await p.locator('#preview-box').innerText()));
  console.log('MOBILE mobile-preview',JSON.stringify(await p.locator('#mobile-preview').innerText()));
  console.log('MOBILE execute enabled',await p.locator('#btn-execute').isEnabled());
  console.log('MOBILE state after click',JSON.stringify((await st(p)).units.map(u=>[u.id,u.x,u.y])));
  await ctx.close();
 }
 // 2) H20-6 预览
 {
  const {ctx,p}=await open(browser,save(),{width:1400,height:900});
  await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu');
  await p.locator('#flow-new').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
  await p.locator('#tutorial-skip').click();await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(()=>window.M0Campaign.info().view==='camp');
  await p.locator('[data-recruit="horse"]').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().party.some(u=>u.id==='recruit-horse-0'));
  await p.locator('[data-camp-roster="starting-horse"]').click();await p.waitForTimeout(150);
  await p.locator('[data-camp-roster="recruit-horse-0"]').click();await p.waitForTimeout(150);
  await p.locator('#camp-leave').click();await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
  await p.locator('#flow-enter').click();await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
  await p.locator('[data-deploy="recruit-horse-0"]').click();await cell(p,{x:7,y:3});
  await p.locator('#btn-deploy-confirm').click();await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
  await p.locator('[data-unit="recruit-horse-0"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:7,y:5});await p.waitForTimeout(300);
  console.log('D1 sp',(await st(p)).teamSp,'horse',JSON.stringify((await st(p)).units.find(u=>u.id==='recruit-horse-0')));
  await p.locator('.upgrade-section').evaluate(n=>n.open=true);
  console.log('skills count',await p.locator('#skills [data-skill]').count(),'camp count',await p.locator('#camp-skills [data-skill]').count());
  await p.locator('#skills [data-skill="horse-jump-distance"]').click();await p.waitForTimeout(250);
  console.log('after buy',JSON.stringify((await st(p)).units.find(u=>u.id==='recruit-horse-0')));
  await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===2);await p.waitForTimeout(300);
  console.log('turn2 horse',JSON.stringify((await st(p)).units.find(u=>u.id==='recruit-horse-0')));
  await p.locator('[data-unit="recruit-horse-0"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await hover(p,{x:4,y:5});await p.waitForTimeout(300);
  console.log('D1 preview',JSON.stringify(await p.locator('#preview-box').innerText()));
  console.log('D1 marks',JSON.stringify((await p.evaluate(()=>window.__M0_DEBUG__.getMarks())).map(m=>[m.x,m.y,m.layer])));
  await ctx.close();
 }
 // 3) H13 营地技能
 {
  let camp=R.newGame();camp.phase='intermission';camp=R.enterCamp(camp);camp.teamSp=5;camp.gold=0;camp=R.buy(camp,'horse');
  const journey=R.journeyRecord(camp);
  console.log('journey party',JSON.stringify(journey.party.map(u=>[u.id,u.kind])),'bench',JSON.stringify(journey.bench),'active',JSON.stringify(journey.activeIds));
  const {ctx,p}=await open(browser,{version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey,battle:null},{width:1400,height:900});
  await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='camp',null,{timeout:25000}).catch(e=>console.log('campview fail',e.message));
  await p.waitForTimeout(500);
  console.log('H13 state party',JSON.stringify((await st(p)).party.map(u=>[u.id,u.kind])));
  console.log('H13 campSkills text',JSON.stringify((await p.locator('#camp-skills').innerText()).slice(0,400)));
  console.log('H13 camp-skill count',await p.locator('#camp-skills [data-skill]').count());
  console.log('H13 target count',await p.locator('[data-camp-skill="recruit-horse-0"]').count());
  await ctx.close();
 }
 await browser.close();
})().catch(e=>{console.error('PROBE FAIL',e);process.exit(1)});
