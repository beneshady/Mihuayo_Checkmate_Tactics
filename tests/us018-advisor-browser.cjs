// US-018 A18-01/S15：正常入口实点（新旅程→正常打完关卡赚自然金币与公共 SP→商店买一座仕→下关布阵侧位→结束回合自动开火→用实际公共 SP 升级）。
// 运行：先在 web 目录启动 localhost 服务（如 `python -m http.server 8783 --bind 127.0.0.1`），再 `node tests/us018-advisor-browser.cjs`。
// 说明：本脚本不注入战局、金币或公共 SP；技能/碰撞/两座上限等边界由 tests/us018-advisor.test.cjs 的专项夹具覆盖。
// 2026-10-18 修正：旧版错误要求“首关后买两座”，与自然收益不符；正常流程只需自然赚金买一座并用真实公共 SP 升级，两座上限/交换改由专项验证。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('../web/js/rules.js');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8783',dir=path.resolve(process.env.M0_EVIDENCE_DIR||'docs/us/us018-evidence/round-20261018-dsh/browser');fs.mkdirSync(dir,{recursive:true});
const report={scope:'正常入口实际点选：正常关卡自然赚金币与公共 SP→商店买一座仕→下关布阵侧位→结束回合自动开火→实际公共 SP 升级；未注入资源',premise:'自然收益跨关累计；买一座即可，两座上限/交换为专项',steps:[],errors:[]};let browser;
const state=p=>p.evaluate(()=>window.__M0_DEBUG__.getState()),mobile=p=>p.evaluate(()=>window.M0Display.isMobile());
async function cell(p,to){const xy=await p.evaluate(to=>window.__M0_DEBUG__.grid.screenPoint(to),to);await p.mouse.click(xy.x,xy.y);}
async function select(p,id){if(await mobile(p))await p.locator('#mobile-tools [data-ui-view="units"]').click();await p.locator('[data-unit="'+id+'"]').click();if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}
async function skills(p){if(await mobile(p))await p.locator('#mobile-tools [data-ui-view="skills"]').click();else await p.locator('.upgrade-section').evaluate(e=>e.open=true);}
async function close(p){if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}
async function end(p){await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();}
async function action(p,a){await select(p,a.actor);if(a.type==='directional'){if(await mobile(p)){await p.locator('[data-dir="'+a.direction+'"]').click();await p.locator('#btn-execute').click();}else{const s=await state(p);await cell(p,s.units.find(u=>a.targets.includes(u.id))||a.mountains[0]);}}else{if(['charge','charge-corpse','pull','pull-collision'].includes(a.type))await p.locator('[data-mode="'+(a.type.startsWith('charge')?'charge':'pull')+'"]').click();await cell(p,a.to);if(await mobile(p)&&!['move','rook-move'].includes(a.type))await p.locator('#btn-execute').click();}}
function score(s){const k=R.king(s,'player');return !k||s.result==='dead'?-1e6:(s.phase==='intermission'?10000:0)+k.hp*1000+s.kills*45+s.units.filter(u=>u.side==='player'&&u.kind!=='king').reduce((n,u)=>n+u.hp*5+8,0);}
// 与真实流水线一致：预览使用 R.preview（内部含仕阶段），不使用旧 enemyPhase。
function choice(s){const baseline=score(R.enemyTurn(s,true).state),king=R.king(s,'player');let best;for(const u of s.units.filter(u=>u.side==='player'))for(const a of R.legalActions(s,u.id)){if(u.id===king?.id&&a.to&&!R.inPalace('player',a.to))continue;const r=a.type==='directional'?R.previewDirection(s,u.id,a.direction):R.preview(s,u.id,a.to,a.type);if(!r||s.turn<11&&r.prediction.state.phase==='intermission')continue;const v=score(r.prediction.state);if(v>baseline&&(!best||v>best.v))best={a,v};}return best?.a;}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function save(){report.finishedAt=new Date().toISOString();report.versions=Object.fromEntries(['web/index.html','web/js/app.js','web/js/rules.js'].map(f=>[f,sha(f)]));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));}
const towers=s=>s.units.filter(u=>u.side==='player'&&u.kind==='advisor');
const advisorParty=s=>s.party.filter(u=>u.kind==='advisor');
async function playLevel(p){for(let guard=0;guard<16;guard++){let s=await state(p);if(s.phase!=='player')break;for(let q=0;q<24;q++){s=await state(p);if(s.phase!=='player')break;const a=choice(s);if(!a)break;await action(p,a);}s=await state(p);if(s.phase==='player')await end(p);}return await state(p);}
async function nextLevel(p){await p.locator('#btn-next-wave').click();await p.locator('#flow-enter').click();return await state(p);}
(async()=>{
 browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();
 p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto(base+'/');
 await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.M0Campaign)&&window.M0Campaign.info().view==='menu');
 await p.locator('#flow-new').click();
 await p.locator('#flow-enter').click();
 let s=await state(p);
 A.equal(s.phase,'deploy');
 A.equal(towers(s).length,0,'新旅程没有仕');
 A.equal(advisorParty(s).length,0,'新旅程队伍中没有仕');
 await p.locator('#btn-deploy-confirm').click();
 await p.locator('#btn-buff-health').click();
 A.equal((await state(p)).phase,'player');
 // 1. 正常打完关卡：真实击杀赚金币与公共 SP；金币不足买仕则按正常流程继续下一关累计，不注入资源。
 s=await playLevel(p);
 A.equal(s.phase,'intermission','首关正常结算');
 const levels=[];
 const recordLevel=()=>({level:s.level,phase:s.phase,gold:s.gold,teamSp:s.teamSp,kills:s.kills});
 levels.push(recordLevel());
 report.steps.push({step:'首关正常打完两波',...levels[0]});
 while(advisorParty(s).length===0&&s.gold<5){
  // 自然金币不足 5：按正常流程进入下一关继续赚取（最多到第 2 关关间；第 3 关为最后一关）
  A.ok(s.level<2,'自然收益不足以在进入第 3 关前买仕（实际金币 '+s.gold+'）');
  s=await nextLevel(p);
  A.equal(s.level,levels[levels.length-1].level+1);
  A.equal(s.phase,'deploy');
  await p.locator('#btn-deploy-confirm').click();
  await p.locator('#btn-buff-health').click();
  A.equal((await state(p)).phase,'player');
  s=await playLevel(p);
  A.equal(s.phase,'intermission','第 '+s.level+' 关正常结算');
  levels.push(recordLevel());
  report.steps.push({step:'第 '+s.level+' 关正常打完',...levels[levels.length-1]});
 }
 const earned=levels[levels.length-1];
 A.ok(s.gold>=5,'自然结算金币足够买一座仕（实际 '+s.gold+'，来源：'+JSON.stringify(levels)+'）');
 // 2. 商店买一座仕：5 金币/座，第三座由专项覆盖，这里的正常流程只买一座
 const buy=p.locator('[data-buy="advisor"]');
 A.ok(await buy.isVisible(),'商店提供仕');
 const g0=(await state(p)).gold;
 await buy.click();
 s=await state(p);
 A.equal(s.gold,g0-5,'买一座扣 5 金币');
 A.equal(towers(s).length,0,'关间商店买到的仕在下一关才上阵');
 A.equal(advisorParty(s).length,1,'队伍中新增一座仕');
 A.ok(s.activeIds.includes(advisorParty(s)[0].id),'仕固定上阵（不占 8 人名额）');
 A.match(await p.locator('#shop-status').innerText(),/仕 1\/2/,'商店显示仕 1/2 与不占名额');
 A.match(await p.locator('#shop-roster').innerText(),/固定上阵/,'仕固定上阵，不能被换下');
 await p.screenshot({path:path.join(dir,'shop-advisor-bought.png')});
 report.steps.push({step:'商店按自然金币买一座仕',goldBefore:g0,goldAfter:s.gold,teamSp:s.teamSp});
 // 3. 进入下一关布阵：默认左侧，可换右侧再换回；两座交换由专项覆盖
 const shopState=await state(p);
 s=await nextLevel(p);
 A.equal(s.level,shopState.level+1,'进入下一关');
 A.equal(s.phase,'deploy');
 const t1=towers(s)[0];
 A.ok(t1,'下一关仕上阵');
 const left=R.CONFIG.advisorCells[0],right=R.CONFIG.advisorCells[1];
 A.deepEqual([t1.x,t1.y],[left.x,left.y],'第一座默认左侧（玩家坐标 4,2）');
 A.equal((s.pendingAdvisorIds||[]).length,0,'侧位无占位冲突，无需待布置');
 A.equal(s.units.filter(u=>u.side==='player').length,shopState.activeIds.length+1,'仕不占 8 人名额（含额外主帅）');
 await p.waitForSelector('#advisor-deploy [data-advisor-side]');
 await p.locator(`#advisor-deploy [data-advisor-side="${t1.id}"][data-x="${right.x}"][data-y="${right.y}"]`).click();
 s=await state(p);
 A.deepEqual([s.units.find(u=>u.id===t1.id).x,s.units.find(u=>u.id===t1.id).y],[right.x,right.y],'UI 可换到右侧');
 A.equal(await p.locator(`#advisor-deploy [data-advisor-side="${t1.id}"][data-x="${right.x}"]`).isDisabled(),true,'当前侧位按钮不再重复提交');
 A.equal(await p.locator(`#advisor-deploy [data-advisor-side="${t1.id}"][data-x="${left.x}"]`).isDisabled(),false,'可再换回左侧，本脚本保留右侧实战');
 report.steps.push({step:'下关布阵默认左侧并换到右侧实战',from:[left.x,left.y],to:[right.x,right.y]});
 await p.screenshot({path:path.join(dir,'deploy-advisor-side.png')});
 await p.locator('#btn-deploy-confirm').click();
 await p.locator('#btn-buff-health').click();
 s=await state(p);
 A.equal(s.phase,'player');
 const tower=s.units.find(u=>u.id===t1.id);
 A.deepEqual([tower.hp,tower.maxHp,tower.attack,tower.towerInterval],[2,2,1,3],'实战 2HP / 伤害 1 / 初始间隔 3');
 A.deepEqual(R.legalActions(s,tower.id),[],'仕不能主动移动');
 // 4. 选中仕：目标/冷却/费用可读，技能只有间隔升级
 await select(p,t1.id);
 let card=await p.locator('#selected-card').innerText();
 A.match(card,/固定防御装置/);A.match(card,/射程八邻格/);A.match(card,/攻击间隔 3 回合/);A.match(card,/冷却就绪/);
 A.ok(/射程内无敌人|本回合锁定/.test(card),'区分就绪与有无目标');
 await skills(p);
 A.equal(await p.locator('#skills [data-skill]').count(),1,'仕只有一个升级项');
 A.match(await p.locator('#skills').innerText(),/攻击间隔/);
 A.doesNotMatch(await p.locator('#skills').innerText(),/强健/,'仕不能买强健');
 const before=await state(p);
 const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks().map(m=>m.layer));
 A.equal(JSON.stringify(await state(p)),JSON.stringify(before),'选中/预览不改战局');
 report.steps.push({step:'选中仕与技能入口',card:card.replace(/\s+/g,' ').slice(0,180),skillButtons:1,marks});
 await close(p);
 await p.screenshot({path:path.join(dir,'advisor-selected.png')});
 // 5. 结束回合确认提示包含仕阶段；连续结束回合直到仕实际开火（敌人自然逼近）
 await p.locator('#btn-end').click();
 const confirm=await p.locator('#confirm-text').innerText();
 A.match(confirm,/仕阶段/,'结束回合确认提示仕先于敌攻');
 await p.locator('#btn-confirm-no').click();
 let firedTurn=null,beforeFire=null;
 for(let turn=0;turn<9&&firedTurn===null;turn++){
  s=await state(p);
  if(s.phase!=='player')break;
  beforeFire=s;
  await end(p);
  const after=await state(p);
  const fired=towers(after).filter(u=>Number.isInteger(u.lastFireTurn));
  if(fired.length)firedTurn=fired[0].lastFireTurn;
  if(after.phase!=='player')break;
 }
 A.ok(firedTurn!==null,'实战中仕按结束回合自动开火（未注入敌人位置）');
 A.ok(firedTurn>=1);
 report.steps.push({step:'实战自动开火',firedTurn,hp:beforeFire&&towers(beforeFire).map(u=>u.hp)});
 // 6. 用实际公共 SP 升级间隔：3→2 扣 3 公共 SP，血量/上限不增长；有自然 5 SP 时再升 1 档
 s=await state(p);
 const towerId=towers(s)[0].id;
 A.equal(s.phase,'player','开火后仍在我方行动阶段，可用真实 SP 升级');
 A.ok(s.teamSp>=3,'实际公共 SP 足够升 2 档（实际 '+s.teamSp+'）');
 await select(p,towerId);
 await skills(p);
 const sp0=s.teamSp,hp0=towers(s)[0].hp,maxHp0=towers(s)[0].maxHp;
 await p.locator('[data-skill="advisor-interval"]').click();
 s=await state(p);
 A.equal(s.units.find(u=>u.id===towerId).towerInterval,2,'实际公共 SP 3 点升到 2 档');
 A.equal(s.teamSp,sp0-3,'只扣公共池 3 点');
 A.deepEqual([s.units.find(u=>u.id===towerId).hp,s.units.find(u=>u.id===towerId).maxHp],[hp0,maxHp0],'升级不增加血量/上限（仍为 2 上限）');
 if(s.teamSp>=5){
  const sp1=s.teamSp;
  await p.locator('[data-skill="advisor-interval"]').click();
  s=await state(p);
  A.equal(s.units.find(u=>u.id===towerId).towerInterval,1,'再花 5 点升到 1 档');
  A.equal(s.teamSp,sp1-5,'只扣公共池 5 点');
  A.equal(await p.locator('[data-skill="advisor-interval"]').isDisabled(),true,'满级后按钮禁用');
 }
 report.steps.push({step:'实际公共 SP 升级仕间隔',from:sp0,to:s.teamSp,interval:s.units.find(u=>u.id===towerId).towerInterval,maxHp:maxHp0,hpBefore:hp0});
 await p.screenshot({path:path.join(dir,'advisor-upgraded.png')});
 await close(p);
 // 7. 手机竖屏：同规则可读可操作
 await p.setViewportSize({width:390,height:844});
 A.equal(await mobile(p),true,'切换为手机版显示');
 await select(p,towerId);
 const mcard=await p.locator('#mobile-selected').innerText();
 A.match(mcard,/八邻格/);A.match(mcard,/间隔/);A.match(mcard,/固定装置不可移动/);
 await skills(p);
 A.equal(await p.locator('#skills [data-skill]').count(),1,'窄屏同样只有间隔升级');
 await close(p);
 report.steps.push({step:'390 窄屏仕信息与升级入口',card:mcard.replace(/\s+/g,' ').slice(0,140)});
 await p.screenshot({path:path.join(dir,'390-advisor-selected.png')});
 A.deepEqual(report.errors,[],'无页面脚本错误');
 report.result='PASS';save();
 console.log(JSON.stringify({result:report.result,steps:report.steps,evidence:dir}));
 await browser.close();
})().catch(async e=>{report.result='FAIL';report.failure={message:e.message,stack:e.stack};save();console.error(e);if(browser)await browser.close();process.exitCode=1;});
