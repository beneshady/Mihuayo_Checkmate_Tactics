// US-020 C27 补充：只验证显示模式切换前后状态一致与关键操作可达；C27 救援选择/跳过双模式见 acceptance。
// 复用既有 display.js 按钮，不修改布局；仅检查主营地、地图预览、布阵与战斗入口。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const dir=path.resolve('docs/us/us020-evidence-r2');fs.mkdirSync(dir,{recursive:true});
function campRecord(over){const s=R.newGame();s.phase='intermission';return Object.assign(R.journeyRecord(s),{firstEntryRewarded:true,buffs:{health:true,move:true,rescue:true}},over||{});}
const out={scope:'C27 显示模式切换（网页版/手机版）',checks:[],pageErrors:[]};
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:720}});
 ctx.on('page',p=>p.on('pageerror',e=>out.pageErrors.push(e.message)));
 const save=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20})});
 await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
 const p=await ctx.newPage();
 const st=()=>p.evaluate(()=>window.__M0_DEBUG__.getState());
 await p.goto(base+'/');
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='camp',null,{timeout:20000});
 const campState=JSON.stringify(await st());
 const campVisible=(await p.locator('#camp-leave').isVisible())&&(await p.locator('[data-camp-expand]').isVisible());
 await p.locator('#camp-menu').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='menu');
 for(const mode of ['desktop','mobile']){
  await p.locator(`[data-display-mode="${mode}"]`).click();
  await p.waitForTimeout(150);
  const layout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
  A.equal(layout,mode,`${mode} 模式生效`);
  out.checks.push({mode,layout,menu:await p.locator('#flow-new').isVisible()});
 }
 // 手机版下继续本次旅程→主营地，核对状态与操作可达
 await p.locator('[data-display-mode="mobile"]').click();
 await p.locator('#flow-continue').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
 const mobileMap=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
 const previewVisible=await p.locator('#level-preview-grid').isVisible();
 const previewCells=await p.locator('#level-preview-grid .pv-cell').count();
 await p.locator('#flow-back').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='camp');
 const afterToggle=JSON.stringify(await st());
 A.equal(afterToggle,campState,'切换显示模式不改变旅程状态');
 const campVisibleMobile=await p.locator('#camp-leave').isVisible();
 await p.screenshot({path:path.join(dir,'c27-mode-mobile-camp.png')});
 await p.locator('#camp-leave').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
 await p.locator('#flow-enter').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='battle');
 const deployOk=await p.locator('#btn-deploy-confirm').isVisible();
 await p.locator('#btn-deploy-confirm').click();
 await p.waitForTimeout(150);
 const endOk=await p.locator('#btn-end').isVisible();
 await p.screenshot({path:path.join(dir,'c27-mode-mobile-battle.png')});
 // 桌面模式复查
 await p.locator('#btn-pause').click();
 await p.locator('#btn-menu-pause').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='menu');
 await p.locator('[data-display-mode="desktop"]').click();
 await p.waitForTimeout(120);
 const desktopLayout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
 await p.locator('#flow-continue').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='battle');
 const desktopBattle=await p.locator('#btn-end').isVisible();
 A.equal(desktopLayout,'desktop');
 A.deepEqual(out.pageErrors,[]);
 const result={...out,result:'PASS',campVisible,campVisibleMobile,previewVisible,previewCells,mobileMap,deployOk,endOk,desktopBattle,finishedAt:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'c27-mode-switch-r2.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({result:result.result,checks:out.checks,previewCells,campVisible,campVisibleMobile,deployOk,endOk,pageErrors:out.pageErrors.length}));
 await browser.close();
})().catch(e=>{console.error('FAIL',e.stack);out.result='FAIL';out.failure={message:e.message};fs.writeFileSync(path.join(dir,'c27-mode-switch-r2.json'),JSON.stringify(out,null,2));process.exitCode=1;});

