// US-020 初始阵容调整（2026-10-21 确认：普通兵×2、马×1、车×1；主帅保留；无初始弓/枪/炮/仕）
// 浏览器补验 A01～A03。只跑受本次初始队伍影响的入口，不重跑 US020 全套 C01～C28。
// A01 独立上下文正常完成教学→主营地→第一关布阵；A02 曾完成教学跳过 + 新旅程重置 + 旧局不改写；
// A03 两个普通兵分别转职（专项注入公共 SP，仅验证 UI 转职链路；规则断言见 tests/us020-camp.test.cjs）。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const dir=path.resolve(process.env.M0_EVIDENCE_DIR||'docs/us/us020-evidence-r4-lineup');fs.mkdirSync(dir,{recursive:true});
const files=['web/index.html','web/js/rules.js','web/js/app.js','web/js/campaign.js','web/js/journey.js','tests/us020-camp.test.cjs','tests/us020-lineup-browser.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const results=[],shots=[],pageErrors=[];let browser;
const record=(id,type,ok,detail,evidence)=>{if(!evidence)throw Error(`证据不能为空：${id}`);results.push({id,type,result:ok?'通过':'失败',detail,evidence});console.log(`${ok?'PASS':'FAIL'} ${id} · ${type}`);};
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
const info=p=>p.evaluate(()=>window.M0Campaign.info());
const view=p=>p.evaluate(()=>window.M0Campaign.info().view);
async function shot(p,name){await p.screenshot({path:path.join(dir,name)});shots.push(name);return name;}
function evidenceJSON(name,data){const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(data,null,2));return name;}
async function newContext(opts={}){
 const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:720}});
 ctx.on('page',p=>{p.setDefaultNavigationTimeout(60000);p.setDefaultTimeout(45000);p.on('pageerror',e=>pageErrors.push({url:p.url(),message:e.message}));});
 // 只预置存档：后续刷新/继续必须读取真实持久化状态；不注入猫粮/SP（A03 的 SP 专项除外，已在结果中标注）。
 if(opts.save)await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(opts.save)});}catch(e){}`);
 return ctx;
}
async function openMenu(ctx){const p=await ctx.newPage();await p.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view!=='loading',null,{timeout:60000});return p;}
const waitView=(p,t)=>p.waitForFunction(t=>window.M0Campaign&&window.M0Campaign.info().view===t,t,{timeout:20000});
const cell=async(p,to)=>{const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.click(xy.x,xy.y);};
const selectUnit=(p,id)=>p.locator(`[data-unit="${id}"]`).click({timeout:8000});
const dismissGuide=async p=>{if(await p.locator('#camp-guide').isVisible()){await p.locator('#camp-guide-close').click();await p.waitForTimeout(60);}};
const saved=p=>p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('m0-journey-v1'));}catch(e){return null;}});
const EXPECT=['rook','starting-pawn','starting-pawn-2','starting-horse'];
const lineup=party=>party.map(u=>u.id);

// 与 US-020 验收脚本相同的真实教学操作序列（教学专用局面本身未随本次阵容调整改变）。
async function runTutorial(p){
 await p.locator('#flow-new').click();await waitView(p,'tutorial');
 const skipDisabled=await p.locator('#tutorial-skip').isDisabled();
 await p.locator('#tutorial-enter').click();await waitView(p,'battle');
 await p.locator('#tutorial-ack').click();
 const hu=await p.evaluate(()=>window.__M0_DEBUG__.grid.screenPoint({x:1,y:3}));await p.mouse.move(hu.x,hu.y);await p.waitForTimeout(120);
 await selectUnit(p,'tut-rook');await cell(p,{x:2,y:2});
 await p.locator('#btn-undo').click();
 await selectUnit(p,'tut-rook');await cell(p,{x:2,y:2});
 await selectUnit(p,'tut-spear');await cell(p,{x:6,y:3});
 await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();await p.waitForTimeout(200);
 const overlay=await p.locator('#ov-tutorial').isVisible();
 const reward=R.tutorialReward(await st(p));
 await p.locator('#tutorial-done-ok').click();await waitView(p,'camp');
 await dismissGuide(p);
 return{skipDisabled,overlay,reward};
}

(async()=>{
 browser=await pw.chromium.launch({headless:true});
 try{
  /* ---------- A01 正常完成教学 → 主营地 → 第一关布阵 ---------- */
  const c1=await newContext();const p1=await openMenu(c1);
  const tut=await runTutorial(p1);
  const camp=await st(p1);
  A.equal(tut.skipDisabled,true,'A01 首次教学仍无跳过捷径');
  A.equal(tut.overlay,true,'A01 教学完成提示出现');
  A.equal(await view(p1),'camp','A01 完成后先进入主营地');
  A.deepEqual(lineup(camp.party),EXPECT,'A01 名单：车×1、兵×2、马×1');
  A.deepEqual(camp.party.map(u=>u.kind),['rook','pawn','pawn','horse'],'A01 兵种：车×1、兵×2、马×1');
  A.equal(camp.party.some(u=>['archer','spearman','cannon','advisor'].includes(u.kind)),false,'A01 无初始弓/枪/炮/仕');
  A.equal(camp.population,4,'A01 人口 4');
  A.equal(new Set(camp.activeIds).size,4,'A01 ID 互异');
  A.equal(camp.teamSp,0,'A01 公共 SP 0');
  A.equal(camp.gold,tut.reward+8,'A01 教学猫粮 + 首营 8');
  A.deepEqual(camp.buffs,{health:true,move:false,rescue:false},'A01 首次入营免费坚守');
  A.deepEqual(camp.party.map(u=>[u.id,u.maxHp,u.hp,u.commanderHealth]),[['rook',3,3,1],['starting-pawn',2,2,1],['starting-pawn-2',2,2,1],['starting-horse',2,2,1]],'A01 满血且初营 HP 增益只加一次');
  const rosterText=(await p1.locator('#camp-roster').innerText()).replace(/\s+/g,' ');
  A.match(rosterText,/车 · rook ·/);A.match(rosterText,/兵 · starting-pawn ·/);A.match(rosterText,/兵 · starting-pawn-2 ·/);A.match(rosterText,/马 · starting-horse ·/);
  A.doesNotMatch(rosterText,/弓|枪|炮|仕/,'A01 营地名单不出现弓/枪/炮/仕');
  const campShot=await shot(p1,'a01-camp-roster.png');
  const campEvidence=evidenceJSON('a01-camp.json',{view:await view(p1),tutorialReward:tut.reward,gold:camp.gold,population:camp.population,teamSp:camp.teamSp,buffs:camp.buffs,activeIds:camp.activeIds,party:camp.party.map(u=>({id:u.id,kind:u.kind,hp:u.hp,maxHp:u.maxHp,commanderHealth:u.commanderHealth,level:u.level,kills:u.kills})),rosterText});
  await p1.locator('#camp-leave').click();await waitView(p1,'map');
  await p1.locator('#flow-enter').click();await waitView(p1,'battle');
  const deploy=await st(p1);
  A.equal(deploy.phase,'deploy','A01 第一关进入布阵');
  const deployPlayers=deploy.units.filter(u=>u.side==='player');
  A.deepEqual(deployPlayers.map(u=>u.id).sort(),['king','rook','starting-horse','starting-pawn','starting-pawn-2'],'A01 布阵名单含主帅');
  A.equal(deployPlayers.filter(u=>u.kind==='king').length,1,'A01 主帅保留');
  A.equal(new Set(deployPlayers.map(u=>u.x+','+u.y)).size,deployPlayers.length,'A01 站位无重叠');
  deployPlayers.forEach(u=>{A.equal(R.inside(u),true);A.equal(R.mountain(deploy,u),false,'A01 不站山');A.equal(R.isWater(deploy,u),false,'A01 不站水');A.ok(u.y<4,'A01 我方半场');A.equal(u.hp,u.maxHp,'A01 入关满血');});
  A.equal(deployPlayers.some(u=>['archer','spearman','cannon','advisor'].includes(u.kind)),false,'A01 布阵无弓枪炮仕');
  const deployShot=await shot(p1,'a01-deploy.png');
  await p1.locator('#btn-deploy-confirm').click();await p1.waitForTimeout(120);
  const battle=await st(p1);A.equal(battle.phase,'player','A01 确认布阵后进入我方行动');
  const deployEvidence=evidenceJSON('a01-deploy.json',{level:deploy.level,phase:deploy.phase,population:deploy.population,units:deployPlayers.map(u=>({id:u.id,kind:u.kind,x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp})),confirmedPhase:battle.phase});
  record('A01','正常浏览器',true,`独立上下文实际完成 7 步教学→主营地：名单车 rook / 兵 starting-pawn / 兵 starting-pawn-2 / 马 starting-horse，无弓枪炮仕，人口 ${camp.population}、ID 互异，猫粮 ${camp.gold}（教学 ${tut.reward}+首营 8），SP ${camp.teamSp}，坚守后满血（车 3/3、兵 2/2、兵 2/2、马 2/2）；第一关布阵 5 枚我方站位合法无重叠并经确认进入我方行动。`,`${campShot},${deployShot},${campEvidence},${deployEvidence}`);
  await c1.close();

  /* ---------- A02 曾完成教学：合法跳过、新旅程重置、旧局不改写 ---------- */
  const skipSave=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:null});
  const c2=await newContext({save:skipSave});const p2=await openMenu(c2);
  A.equal(await view(p2),'menu','A02 独立上下文从菜单开始');
  await p2.locator('#flow-new').click();await waitView(p2,'tutorial');
  const skipEnabled=await p2.locator('#tutorial-skip').isEnabled();
  A.equal(skipEnabled,true,'A02 曾完成教学可跳过');
  await p2.locator('#tutorial-skip').click();
  await p2.locator('#tutorial-skip-yes').click();await waitView(p2,'camp');
  await dismissGuide(p2);
  const skipCamp=await st(p2);
  A.equal(await view(p2),'camp','A02 跳过直接入营');
  A.deepEqual(lineup(skipCamp.party),EXPECT,'A02 跳过路径基础阵容一致');
  A.deepEqual(skipCamp.party.map(u=>u.kind),['rook','pawn','pawn','horse'],'A02 兵种与 A01 一致');
  A.equal(skipCamp.gold,8,'A02 跳过只发首营 8 猫粮');
  A.deepEqual([skipCamp.population,skipCamp.teamSp],[4,0],'A02 人口 4、SP 0');
  A.deepEqual(skipCamp.buffs,{health:true,move:false,rescue:false},'A02 增益规则不变');
  A.deepEqual(skipCamp.party.map(u=>[u.id,u.maxHp,u.hp,u.commanderHealth]),[['rook',3,3,1],['starting-pawn',2,2,1],['starting-pawn-2',2,2,1],['starting-horse',2,2,1]],'A02 满血与初营 HP 增益一致');
  const skipShot=await shot(p2,'a02-skip-camp.png');
  const skipEvidence=evidenceJSON('a02-skip.json',{view:await view(p2),skipEnabled,gold:skipCamp.gold,population:skipCamp.population,teamSp:skipCamp.teamSp,buffs:skipCamp.buffs,party:skipCamp.party.map(u=>({id:u.id,kind:u.kind,hp:u.hp,maxHp:u.maxHp,commanderHealth:u.commanderHealth}))});
  await p2.locator('#camp-menu').click();await waitView(p2,'menu');
  await p2.locator('#flow-new').click();
  await p2.locator('#flow-new-yes').click();await waitView(p2,'tutorial');
  const skipEnabled2=await p2.locator('#tutorial-skip').isEnabled();
  A.equal(skipEnabled2,true,'A02 新旅程保留教学跳过资格');
  await p2.locator('#tutorial-skip').click();
  await p2.locator('#tutorial-skip-yes').click();await waitView(p2,'camp');
  await dismissGuide(p2);
  const resetCamp=await st(p2);
  A.deepEqual(lineup(resetCamp.party),EXPECT,'A02 新旅程回到同一基础阵容');
  A.deepEqual([resetCamp.gold,resetCamp.teamSp,resetCamp.population,resetCamp.completed],[8,0,4,0],'A02 新旅程重置资源/人口/进度并重发首营 8');
  A.deepEqual(resetCamp.buffs,{health:true,move:false,rescue:false},'A02 新旅程坚守重新获得');
  const resetShot=await shot(p2,'a02-new-journey.png');
  const resetEvidence=evidenceJSON('a02-new-journey.json',{skipEnabled:skipEnabled2,gold:resetCamp.gold,teamSp:resetCamp.teamSp,population:resetCamp.population,completed:resetCamp.completed,buffs:resetCamp.buffs,party:resetCamp.party.map(u=>({id:u.id,kind:u.kind,hp:u.hp,maxHp:u.maxHp,commanderHealth:u.commanderHealth}))});
  record('A02','专项（预置曾完成教学）',true,`曾完成教学的独立上下文：跳过按钮可用，跳过直接入营，名单与 A01 一致（车/兵/兵/马）、猫粮 8（无教学收益）、SP 0、人口 4、坚守后满血；随后开新旅程仍可跳过，队伍回到同一基础阵容且猫粮重置为 8、进度 0。`,`${skipShot},${resetShot},${skipEvidence},${resetEvidence}`);
  await c2.close();

  /* 旧局边界：预置含旧自带弓/枪的旅程存档，载入后队伍不被迁移/替换 */
  const legacyJourney={gold:12,teamSp:3,population:5,buffs:{health:true,move:true,rescue:false},party:[R.unit('rook','player','rook',0,0),R.unit('starting-pawn','player','pawn',1,3),R.unit('starting-archer','player','archer',4,3),R.unit('starting-spearman','player','spearman',7,3)],activeIds:['rook','starting-pawn','starting-archer','starting-spearman'],bench:[],completed:1,tutorial:'completed',firstEntryRewarded:true};
  const oldSave=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:legacyJourney});
  const c2b=await newContext({save:oldSave});const p2b=await openMenu(c2b);await waitView(p2b,'camp');await dismissGuide(p2b);
  const oldCamp=await st(p2b);
  A.deepEqual(oldCamp.party.map(u=>u.id),['rook','starting-pawn','starting-archer','starting-spearman'],'A02 旧局队伍原样载入，不迁移成新阵容');
  A.equal(oldCamp.party.some(u=>u.id==='starting-pawn-2'||u.id==='starting-horse'),false,'A02 不向旧局注入新初始单位');
  A.equal(oldCamp.gold,12,'A02 旧局资源不变');
  const oldSaved=await saved(p2b);
  A.deepEqual(oldSaved.journey.party.map(u=>u.id),['rook','starting-pawn','starting-archer','starting-spearman'],'A02 存档队伍 ID 未被替换');
  const oldEvidence=evidenceJSON('a02-legacy-save.json',{party:oldCamp.party.map(u=>u.id),savedParty:oldSaved.journey.party.map(u=>u.id),completed:oldSaved.journey.completed,gold:oldSaved.journey.gold});
  record('A02-旧局边界','专项（规则/存档边界）',true,'预置含旧自带弓/枪的旅程存档载入后，营地队伍仍为车/兵/弓/枪，未被迁移或替换成新基础阵容；读取到的存档 party 仍保持旧 ID 与旧资源（不改写旧局、不迁移）。',oldEvidence);
  await c2b.close();

  /* ---------- A03 两个普通兵分别转职（专项：预置公共 SP 4） ---------- */
  const spBase=Object.assign(R.newGame(),{phase:'intermission',teamSp:4,gold:0,completed:0,firstEntryRewarded:true,buffs:{health:true,move:false,rescue:false}});
  const spJourney=R.journeyRecord(spBase);
  const c3=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:spJourney})});
  const p3=await openMenu(c3);await waitView(p3,'camp');await dismissGuide(p3);
  const before3=await st(p3);
  A.equal(before3.teamSp,4,'A03 专项预置公共 SP 4');
  A.equal(before3.party.filter(u=>u.kind==='pawn').length,2,'A03 两个普通兵均可转职');
  await p3.locator('[data-camp-skill="starting-pawn"][data-skill="promote-archer"]').click();
  await p3.waitForTimeout(80);
  const afterArcher=await st(p3);
  A.equal(afterArcher.teamSp,2,'A03 转职弓兵扣 2 SP');
  const archer=afterArcher.party.find(u=>u.id==='starting-pawn');
  A.deepEqual([archer.kind,archer.attack,archer.maxHp],['archer',2,2],'A03 弓攻击 +1，无额外加血（含坚守上限）');
  A.equal(afterArcher.party.find(u=>u.id==='starting-pawn-2').kind,'pawn','A03 另一兵未受影响');
  await p3.locator('[data-camp-skill="starting-pawn-2"][data-skill="promote-spearman"]').click();
  await p3.waitForTimeout(80);
  const afterSpear=await st(p3);
  A.equal(afterSpear.teamSp,0,'A03 第二兵独立扣 2 SP');
  const spear=afterSpear.party.find(u=>u.id==='starting-pawn-2');
  A.deepEqual([spear.kind,spear.hp,spear.maxHp],['spearman',3,3],'A03 枪当前/最大 HP 各 +1（含坚守）');
  A.equal(afterSpear.party.find(u=>u.id==='starting-pawn').kind,'archer','A03 两兵职业各自独立');
  A.equal(await p3.locator('[data-camp-skill="starting-pawn"][data-skill="promote-archer"]').count(),0,'A03 已转职兵不能再转职');
  const skillText=(await p3.locator('#camp-skills').innerText()).replace(/\s+/g,' ');
  A.match(skillText,/弓/);A.match(skillText,/枪/);
  const roster3=(await p3.locator('#camp-roster').innerText()).replace(/\s+/g,' ');
  A.match(roster3,/弓 · starting-pawn ·/);A.match(roster3,/枪 · starting-pawn-2 ·/);
  const a3Shot=await shot(p3,'a03-promote.png');
  const a3Evidence=evidenceJSON('a03-promote.json',{before:{teamSp:before3.teamSp,party:lineup(before3.party)},afterArcher:{teamSp:afterArcher.teamSp,party:afterArcher.party.map(u=>({id:u.id,kind:u.kind,attack:u.attack,hp:u.hp,maxHp:u.maxHp}))},afterSpear:{teamSp:afterSpear.teamSp,party:afterSpear.party.map(u=>({id:u.id,kind:u.kind,attack:u.attack,hp:u.hp,maxHp:u.maxHp}))},skillText,rosterText:roster3});
  record('A03','专项（预置 SP 4）',true,`专项注入公共 SP 4：营地先后为 starting-pawn 转弓兵（SP 4→2，攻击 ${archer.attack}，HP ${archer.hp}/${archer.maxHp}）、starting-pawn-2 转枪兵（SP 2→0，HP ${spear.hp}/${spear.maxHp}），两兵职业各自独立；已转职兵不再出现转职按钮。初始移除自带弓/枪不影响转职获取，费用 2 SP 沿用。`,a3Shot+','+a3Evidence);
  await c3.close();

  const out={scope:'US-020 初始阵容调整 A01～A03 浏览器补验（不重跑 C01～C28 全套）',branch:require('node:child_process').execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),head:require('node:child_process').execSync('git rev-parse HEAD').toString().trim(),base,viewport:'1280x720',results,shots,pageErrors,hashes:hashes(),finishedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(dir,'us020-lineup-result.json'),JSON.stringify(out,null,2));
  fs.writeFileSync(path.join(dir,'us020-lineup-browser.log'),results.map(r=>`${r.result} ${r.id} · ${r.type}\n${r.detail}\n证据：${r.evidence}`).join('\n\n')+`\n\npageerror：${JSON.stringify(pageErrors)}\n`);
  console.log(JSON.stringify({results:results.length,pageErrors:pageErrors.length,hashes:out.hashes},null,2));
  await browser.close();
  if(pageErrors.length||results.some(r=>r.result!=='通过'))process.exitCode=1;
 }catch(e){
  console.error('FAIL',e&&e.stack||e);
  try{fs.writeFileSync(path.join(dir,'us020-lineup-browser-fail.log'),String(e&&e.stack||e)+'\n'+JSON.stringify({results,pageErrors},null,2));}catch(_){}
  if(browser)await browser.close();
  process.exitCode=1;
 }
})();
