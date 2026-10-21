// US-018 A18-02/A18-03/A18-04/A18-06/A18-07 专项浏览器验收（夹具与注入仅作专项证据，不冒充正常流程）。
// 运行：先启动 localhost 服务（工作目录 web），再 `set M0_TEST_URL=http://127.0.0.1:8792` 并运行本脚本。
// A18-01 正常入口链路由 tests/us018-advisor-browser.cjs 独立执行，本文件不重复声称正常赚金/购买。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('../web/js/rules.js');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8792',dir=path.resolve(process.env.M0_EVIDENCE_DIR||'docs/us/us018-evidence/round-20261019-dsh/browser-special');fs.mkdirSync(dir,{recursive:true});
const report={scope:'US-018 A18-02/03/04/06/07 浏览器专项；夹具注入状态/RNG/SP 均标注专项，不冒充 A18-01 正常流程',viewports:{desktop:'1280x900',mobileLandscape:'844x390'},cases:[],errors:[],steps:[]};let browser;
const state=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
const setState=(p,s)=>p.evaluate(s=>window.__M0_DEBUG__.setState(s),s);
const plan=p=>p.evaluate(()=>window.M0.advisorPlan(window.__M0_DEBUG__.getState()));
const mobile=p=>p.evaluate(()=>window.M0Display.isMobile());
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function save(){report.finishedAt=new Date().toISOString();report.head=process.env.M0_HEAD||null;report.files=Object.fromEntries(['web/index.html','web/js/app.js','web/js/rules.js'].map(f=>[f,sha(f)]));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));}
function note(rec,text,data){rec.steps.push({text,...(data||{})});report.steps.push({case:rec.id,text,...(data||{})});}
async function shot(p,rec,name){const file=path.join(dir,name);await p.screenshot({path:file});rec.evidence.push(path.relative(process.cwd(),file).replace(/\\/g,'/'));return file;}
async function cell(p,to){const xy=await p.evaluate(to=>window.__M0_DEBUG__.grid.screenPoint(to),to);await p.mouse.click(xy.x,xy.y);}
async function select(p,id){if(await mobile(p)){await p.locator('#mobile-tools [data-ui-view="units"]').click();await p.locator('[data-unit="'+id+'"]').click();if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}else await p.locator('[data-unit="'+id+'"]').click();}
async function skills(p){if(await mobile(p))await p.locator('#mobile-tools [data-ui-view="skills"]').click();else await p.locator('.upgrade-section').evaluate(e=>e.open=true);}
async function closeSheet(p){if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}
async function end(p){await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();await p.waitForTimeout(80);}
async function newPage(viewport={width:1280,height:900}){
 const context=await browser.newContext({viewport}),p=await context.newPage();p.__errors=[];p.on('pageerror',e=>{p.__errors.push(e.message);report.errors.push({case:'pageerror',message:e.message});});
 await p.goto(base+'/');await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.M0Campaign)&&window.M0Campaign.info().view==='menu');
 return{context,p};
}
async function start(p,buff='health'){
 await p.locator('#flow-new').click();await p.locator('#flow-enter').click();
 let s=await state(p);A.equal(s.phase,'deploy');
 await p.locator('#btn-deploy-confirm').click();await p.locator('#btn-buff-'+buff).click();
 s=await state(p);A.equal(s.phase,'player');return s;
}
async function runCase(id,type,title,fn){const rec={id,type,title,status:'running',steps:[],evidence:[]};report.cases.push(rec);try{await fn(rec);rec.status='pass';}catch(e){rec.status='fail';rec.error=e.message;rec.stack=e.stack;console.error('FAIL '+id+': '+e.message);}await save();return rec;}
function assertNoPageErrors(p,rec){A.deepEqual(p.__errors,[],rec.id+' 无页面脚本错误');}
function fixtureCells(s,cells){for(const [x,y] of cells)s.tiles[x+','+y]='land';}
function advisor(id,x,y){return R.unit(id,'player','advisor',x,y);}
function enemyKing(x=4,y=8){return R.unit('fix-enemy-king','enemy','king',x,y);}
function standby(s){s.intents=s.units.filter(u=>u.side==='enemy').map(u=>({actor:u.id,kind:u.kind,from:{x:u.x,y:u.y},to:{x:u.x,y:u.y},type:'standby',path:[],order:1}));}

(async()=>{
 browser=await pw.chromium.launch({headless:true});

 await runCase('A18-02','专项','S01/S02 两座上限、第三座拒绝、8 人名额、侧位交换、初始化冲突/待布置/手动腾格、开战后不可移动',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'health');
  // 关间商店夹具：不足金币
  s=await state(p);Object.assign(s,{phase:'intermission',level:1,gold:4,teamSp:0,turn:11,wave:2,result:'victory',settled:true,intents:[],pendingSpawns:[]});await setState(p,s);await p.waitForTimeout(60);
  const buy=p.locator('[data-buy="advisor"]');
  A.equal(await buy.isDisabled(),true,'金币 4 < 5 时仕不可买');
  await buy.evaluate(b=>b.click());s=await state(p);
  A.equal(s.gold,4);A.equal(s.party.filter(u=>u.kind==='advisor').length,0,'无效购买不扣款');
  note(rec,'不足金币：按钮禁用且点击不扣款',{gold:s.gold,advisors:0});await shot(p,rec,'a18-02-shop-insufficient.png');
  // 足够金币：买两座，第三座禁用且不扣款
  s=await state(p);Object.assign(s,{gold:12,teamSp:9});await setState(p,s);await p.waitForTimeout(60);
  await p.locator('[data-buy="advisor"]').click();await p.locator('[data-buy="advisor"]').click();s=await state(p);
  A.equal(s.gold,2,'两座各扣 5 金币');A.equal(s.party.filter(u=>u.kind==='advisor').length,2);
  A.equal(await p.locator('[data-buy="advisor"]').isDisabled(),true,'两座后第三座禁用');
  A.match(await p.locator('#shop-status').innerText(),/仕 2\/2/);
  await p.locator('[data-buy="advisor"]').evaluate(b=>b.click());const afterThird=await state(p);
  A.equal(afterThird.gold,2);A.equal(afterThird.party.filter(u=>u.kind==='advisor').length,2,'第三座拒绝且不扣金币');
  note(rec,'两座上限与第三座拒绝',{gold:afterThird.gold,advisors:2});await shot(p,rec,'a18-02-shop-two-third-disabled.png');
  // 8 名队友 + 两座仕，不占名额、不进后备
  s=await state(p);Object.assign(s,{gold:40});await setState(p,s);await p.waitForTimeout(60);
  for(let i=0;i<4;i++)await p.locator('[data-buy="pawn"]').click();
  s=await state(p);const activeNonAdv=s.activeIds.filter(id=>s.party.find(u=>u.id===id)?.kind!=='advisor');
  A.equal(activeNonAdv.length,8,'8 名队友上阵');A.equal(s.activeIds.filter(id=>s.party.find(u=>u.id===id)?.kind==='advisor').length,2,'两座仕仍上阵');
  A.equal(s.bench.length,0,'无额外后备');A.match(await p.locator('#shop-status').innerText(),/上阵 8\/8/);A.match(await p.locator('#shop-status').innerText(),/仕 2\/2/);
  A.match(await p.locator('#shop-roster').innerText(),/固定上阵/);
  note(rec,'8 名队友 + 两座仕：仕不占 8 人额、固定上阵',{activeIds:s.activeIds.length,bench:s.bench.length});await shot(p,rec,'a18-02-shop-eight-roster.png');
  // 下关布阵：两座左右侧位、交换
  await p.locator('#btn-next-wave').click();await p.waitForSelector('#flow-map:not([hidden])');await p.locator('#flow-enter').click();
  s=await state(p);A.equal(s.level,2);A.equal(s.phase,'deploy');
  const towers=()=>s.units.filter(u=>u.side==='player'&&u.kind==='advisor');
  A.equal(towers().length,2);
  const left=R.CONFIG.advisorCells[0],right=R.CONFIG.advisorCells[1];
  const leftTower=s.units.find(u=>u.x===left.x&&u.y===left.y),rightTower=s.units.find(u=>u.x===right.x&&u.y===right.y);
  A.ok(leftTower&&rightTower,'两座分别占左右侧位');
  await p.waitForSelector('#advisor-deploy [data-advisor-side]');await shot(p,rec,'a18-02-deploy-two-desktop.png');
  await p.locator(`#advisor-deploy [data-advisor-side="${leftTower.id}"][data-x="${right.x}"][data-y="${right.y}"]`).click();
  s=await state(p);A.equal(s.units.find(u=>u.id===leftTower.id).x,right.x,'点击对侧完成交换');A.equal(s.units.find(u=>u.id===rightTower.id).x,left.x);
  note(rec,'两座左右侧位可交换',{leftTower:leftTower.id,rightTower:rightTower.id});await shot(p,rec,'a18-02-deploy-swapped.png');
  // 手机横版检查侧位按钮可读可操作
  await p.setViewportSize({width:844,height:390});await p.waitForTimeout(120);A.equal(await mobile(p),true,'844x390 为手机版');
  await p.locator('#advisor-deploy').scrollIntoViewIfNeeded();
  A.equal(await p.locator('#advisor-deploy [data-advisor-side]').count(),4,'窄屏仍有两座×两侧按钮');
  A.match(await p.locator('#advisor-deploy').innerText(),/左右|左侧|右侧/);
  await shot(p,rec,'a18-02-deploy-two-844x390.png');
  note(rec,'844x390 手机横版侧位按钮可读',{buttons:await p.locator('#advisor-deploy [data-advisor-side]').count(),viewport:'844x390'});
  await p.setViewportSize({width:1280,height:900});await p.waitForTimeout(120);A.equal(await mobile(p),false);
  // 初始化冲突/待布置夹具：队友占左侧，一座仕待布置、另一座在右侧；不覆盖、不自动挤走
  s=await state(p);const towerUnits=s.units.filter(u=>u.side==='player'&&u.kind==='advisor');A.equal(towerUnits.length,2);
  const pending=towerUnits[0],other=towerUnits[1];const rook=s.units.find(u=>u.id==='rook');
  s.units=s.units.filter(u=>u.id!==pending.id);other.x=right.x;other.y=right.y;rook.x=left.x;rook.y=left.y;s.pendingAdvisorIds=[pending.id];fixtureCells(s,[[left.x,left.y],[4,1]]);
  await setState(p,s);await p.waitForTimeout(80);
  const adv=pending;
  A.match(await p.locator('#advisor-deploy').innerText(),/仕待布置/);A.match(await p.locator('#advisor-deploy').innerText(),/车占位/);
  const pendingLeft=p.locator(`#advisor-deploy [data-advisor-side="${adv.id}"][data-x="${left.x}"]`);
  A.equal(await pendingLeft.isDisabled(),true,'被队友占据的侧位按钮禁用');
  A.deepEqual([(await state(p)).units.find(u=>u.id==='rook').x,(await state(p)).units.find(u=>u.id==='rook').y],[left.x,left.y],'初始化不挤走队友');
  await p.locator('#btn-deploy-confirm').click();s=await state(p);A.equal(s.phase,'deploy','待布置未清空不能开战');A.match(await p.locator('#banner').innerText(),/仍有仕待布置/);
  note(rec,'待布置冲突提示与确认拦截',{pending:s.pendingAdvisorIds});await shot(p,rec,'a18-02-conflict-pending.png');
  // 手动腾格后放置
  await p.locator('[data-deploy="rook"]').click();await cell(p,{x:4,y:1});s=await state(p);
  A.deepEqual([s.units.find(u=>u.id==='rook').x,s.units.find(u=>u.id==='rook').y],[4,1],'手动腾出侧位');
  A.equal(await pendingLeft.isDisabled(),false,'腾格后侧位按钮启用');
  await pendingLeft.click();s=await state(p);
  A.deepEqual(s.pendingAdvisorIds,[],'放置后待布置清空');const placed=s.units.find(u=>u.id===adv.id);
  A.deepEqual([placed.x,placed.y],[left.x,left.y]);A.equal(new Set(s.units.map(u=>u.x+','+u.y)).size,s.units.length,'无叠子');
  await shot(p,rec,'a18-02-conflict-cleared.png');
  await p.locator('#btn-deploy-confirm').click();s=await state(p);A.equal(s.phase,'commander');
  await p.locator('#btn-buff-health').click();s=await state(p);
  A.equal(s.commanderBuff,'health');A.equal(s.units.find(u=>u.id===adv.id).maxHp,2,'仕不享受主帅 HP buff');A.equal(R.king(s,'player').maxHp,3,'帅不享受自身 HP buff');
  A.equal(s.units.find(u=>u.id==='rook').maxHp,3,'队友享受 HP buff');
  // 开战后不可移动
  await select(p,adv.id);const b=await state(p);await cell(p,{x:0,y:0});const a=await state(p);
  A.equal(a.revision,b.revision,'仕开战后点击棋盘不产生行动');A.equal(JSON.stringify(a.units.find(u=>u.id===adv.id)),JSON.stringify(b.units.find(u=>u.id===adv.id)),'仕位置与状态不变');
  note(rec,'开战后仕不可移动；buff 排除帅与仕',{advisorMaxHp:2,kingMaxHp:3,rookMaxHp:3});await shot(p,rec,'a18-02-battle-advisor-immovable.png');
  assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A18-03','专项','S03-S06/S10 八邻格、单目标、三级排序、无目标就绪、冷却显示、冷却中升级',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'health');
  const king=s.units.find(u=>u.id==='king');king.x=0;king.y=0;king.ap=1;
  const adv=advisor('fix-advisor',3,1);
  const cells=[[2,0],[3,0],[4,0],[2,1],[4,1],[2,2],[3,2],[4,2]];const foes=cells.map(([x,y],i)=>R.unit('fix-e'+i,'enemy','pawn',x,y));
  const far=R.unit('fix-far','enemy','archer',5,1);
  s.units=[king,adv,...foes,far,enemyKing()];s.party=s.party.concat(adv);s.activeIds=s.activeIds.concat(adv.id);s.corpses=[];s.pendingSpawns=[];s.phase='player';s.turn=1;s.wave=1;s.commanderBuff='health';s.intents=[];fixtureCells(s,[[0,0],...cells,[5,1],[4,8]]);
  await setState(p,s);await p.waitForTimeout(60);
  let pl=(await plan(p))[0];
  A.equal(pl.enemyIds.length,8,'八邻格共 8 个敌人进入射程');A.ok(!pl.enemyIds.includes('fix-far'),'第二格敌人不在射程');
  A.equal(pl.targetId,'fix-e0','距离/HP 完全平局按行升序（(2,0) 先）');
  // 三级排序：完全平局按行/列；低 HP 优先
  s=await state(p);s.units.filter(u=>u.kind==='pawn').forEach(u=>u.hp=2);await setState(p,s);pl=(await plan(p))[0];
  A.equal(pl.targetId,'fix-e0','距离相同且 HP 相同按行升序（(2,0) 先于 (2,1)/(2,2)）');
  s=await state(p);s.units.find(u=>u.id==='fix-e3').hp=1;await setState(p,s);pl=(await plan(p))[0];
  A.equal(pl.targetId,'fix-e3','距离相同优先低 HP');
  note(rec,'八邻格/第二格/距帅/低HP/行列排序',{enemyIds:pl.enemyIds.length,target:pl.targetId});
  // 目标线、就绪/开火标签
  await select(p,adv.id);let card=await p.locator('#selected-card').innerText();
  A.match(card,/射程八邻格/);A.match(card,/攻击间隔 3/);A.match(card,/冷却就绪/);A.match(card,/本回合锁定/);
  const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks().map(m=>m.layer));
  A.ok(marks.includes('advisor-target'),'棋盘显示仕目标格');A.ok(marks.filter(x=>x==='intent-line').length>=1,'棋盘显示目标连线');
  A.match(await p.locator('#piece-hp-layer').innerText(),/仕 开火/);
  note(rec,'选中仕：射程/冷却/锁定与目标线',{card:card.replace(/\s+/g,' ').slice(0,160)});await shot(p,rec,'a18-03-range-eight.png');
  // 帅移动改变排序：帅在 (4,0) 时 (4,1) 最近；移到 (3,0) 后 (2,1)/(4,1) 同距，低 HP 决定
  s=await state(p);s.units=s.units.filter(u=>!['fix-e0','fix-e1','fix-e2'].includes(u.id));s.units.find(u=>u.id==='king').x=4;s.units.find(u=>u.id==='king').y=0;s.units.find(u=>u.id==='fix-e3').hp=1;s.units.find(u=>u.id==='fix-e4').hp=2;await setState(p,s);
  const before=await plan(p);A.equal(before[0].targetId,'fix-e4','帅在 (4,0) 时 (4,1) 距离 1 优先');
  await select(p,'king');await cell(p,{x:3,y:0});s=await state(p);A.deepEqual([s.units.find(u=>u.id==='king').x,s.units.find(u=>u.id==='king').y],[3,0]);
  const afterMove=await plan(p);A.equal(afterMove[0].targetId,'fix-e3','帅移动后同距按低 HP 改锁 (2,1)');
  note(rec,'实际移动帅后目标重排',{before:before[0].targetId,after:afterMove[0].targetId});await shot(p,rec,'a18-03-king-moved-target.png');
  // 无目标：就绪不消耗
  s=await state(p);s.units=s.units.filter(u=>u.side==='player'||u.id==='fix-enemy-king');await setState(p,s);await select(p,adv.id);
  card=await p.locator('#selected-card').innerText();A.match(card,/射程内无敌人/);A.match(await p.locator('#piece-hp-layer').innerText(),/仕 待敌/);
  await end(p);s=await state(p);A.equal(s.units.find(u=>u.id===adv.id).lastFireTurn,null,'无目标不进入冷却（仍为初始 null）');
  note(rec,'无目标保持就绪，结束回合不进冷却',{lastFireTurn:s.units.find(u=>u.id===adv.id).lastFireTurn});await shot(p,rec,'a18-03-no-target-ready.png');
  // 冷却显示：lastFireTurn=1, turn=2, interval=3 -> 还需 2
  s=await state(p);s.turn=2;s.units.find(u=>u.id===adv.id).lastFireTurn=1;s.units.push(R.unit('fix-target','enemy','pawn',4,1));fixtureCells(s,[[4,1]]);standby(s);await setState(p,s);await select(p,adv.id);
  card=await p.locator('#selected-card').innerText();A.match(card,/冷却中：还需 2 回合/);A.match(await p.locator('#piece-hp-layer').innerText(),/仕 冷却2/);
  note(rec,'冷却标签 2 回合',{card:card.replace(/\s+/g,' ').slice(0,120)});await shot(p,rec,'a18-03-cooldown-2.png');
  // 冷却中升级：第 3 回合 lastFireTurn=1、间隔 3，升到 2 后本回合满足间隔且不即时开火
  s=await state(p);s.turn=3;s.teamSp=3;s.units.find(u=>u.id===adv.id).towerInterval=3;s.units.find(u=>u.id===adv.id).lastFireTurn=1;await setState(p,s);
  A.equal((await plan(p))[0].willFire,false,'升级前第 3 回合仍差 1 回合');
  await select(p,adv.id);await skills(p);const targetHp0=(await state(p)).units.find(u=>u.id==='fix-target').hp;
  await p.locator('[data-skill="advisor-interval"]').click();s=await state(p);
  A.equal(s.units.find(u=>u.id===adv.id).towerInterval,2);A.equal(s.teamSp,0);A.equal(s.units.find(u=>u.id==='fix-target').hp,targetHp0,'升级不即时开火');
  A.equal((await plan(p))[0].ready,true,'冷却途中升级保留已等待回合');A.equal(s.units.find(u=>u.id===adv.id).lastFireTurn,1);
  note(rec,'冷却途中升级 3→2，立即满足间隔但不即时开火',{interval:2,teamSp:0,targetHp:targetHp0});
  await end(p);s=await state(p);A.equal(s.units.find(u=>u.id===adv.id).lastFireTurn,3,'本回合末按新间隔开火');A.ok(!s.units.some(u=>u.id==='fix-target'),'目标被击杀');
  await shot(p,rec,'a18-03-upgrade-fired.png');assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A18-04','专项','S07-S09/S14 两座同局面集火、树林 0/1/2 次独立命中、奖励去重、预览纯净、独立升档与满级/不足',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'health');
  const base={};
  function forestState(src,seed,teamSp){const n=R.copy(src);const king=n.units.find(u=>u.id==='king');king.x=4;king.y=0;king.ap=1;
   const a1=advisor('fix-a1',3,1),a2=advisor('fix-a2',5,1),foe=R.unit('fix-foe','enemy','pawn',4,1);foe.hp=1;
   n.units=[king,a1,a2,foe,enemyKing()];n.party=n.party.filter(u=>!['fix-a1','fix-a2'].includes(u.id)).concat([R.copy(a1),R.copy(a2)]);n.activeIds=n.activeIds.filter(id=>!['fix-a1','fix-a2'].includes(id)).concat(['fix-a1','fix-a2']);
   n.corpses=[];n.pendingSpawns=[];n.phase='player';n.turn=1;n.wave=1;n.commanderBuff='health';n.intents=[];n.rng=seed;n.teamSp=teamSp==null?9:teamSp;
   fixtureCells(n,[[3,1],[5,1],[4,0],[4,1],[4,8]]);n.tiles['4,1']='forest';return n;}
  s=forestState(s,8,9);await setState(p,s);await p.waitForTimeout(60);
  let pl=await plan(p);A.equal(pl.length,2);A.deepEqual([pl[0].targetId,pl[1].targetId],['fix-foe','fix-foe'],'两座从同一局面锁定同一敌人');A.deepEqual([pl[0].willFire,pl[1].willFire],[true,true]);A.equal(pl[0].forest,true);A.equal(pl[1].forest,true);
  await select(p,'fix-a1');let card=await p.locator('#selected-card').innerText();
  A.match(card,/本回合锁定/);A.match(card,/树林：30% 闪避，非必杀/);
  const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks().map(m=>m.layer));
  A.ok(marks.filter(x=>x==='advisor-target').length>=2,'两座都指向同一目标');
  note(rec,'两座同局面锁定同一片树林目标',{targets:pl.map(x=>x.targetId),marks:marks.filter(x=>x==='advisor-target').length});await shot(p,rec,'a18-04-two-towers-forest.png');
  // 预览/选中不改变状态与 RNG
  const before=await state(p);for(let i=0;i<3;i++){await select(p,'fix-a1');await select(p,'fix-a2');await select(p,'fix-a1');}
  const after=await state(p);A.equal(after.revision,before.revision,'预览/选中不改 revision');A.equal(after.rng,before.rng,'预览/选中不消耗随机数');A.deepEqual(after.units,before.units,'预览/选中不改战局');
  // 树林独立判定：0/1/2 次命中，均消耗两座攻击、奖励只发一次
  const baseState=forestState(await state(p),8,9);
  const scenarios=[{seed:8,toast:/仕阶段：2 座被树林闪避/,hp:1,sp:9,kills:0,name:'零次命中'},{seed:1,toast:/仕阶段：1 座命中、1 座被树林闪避/,hp:0,sp:10,kills:1,name:'一次命中'},{seed:166,toast:/仕阶段：2 座命中/,hp:0,sp:10,kills:1,name:'两次命中'}];
  const forestRuns=[];
  for(const sc of scenarios){const st=forestState(baseState,sc.seed,9);await setState(p,st);await p.waitForTimeout(40);await end(p);const out=await state(p);const toast=await p.locator('#banner').innerText();A.match(toast,sc.toast,sc.name+' toast 与命中数');const foe=out.units.find(u=>u.id==='fix-foe');A.equal(foe?foe.hp:0,sc.hp,sc.name+' 目标 HP');A.equal(out.teamSp,sc.sp,sc.name+' 奖励去重');A.equal(out.kills,sc.kills,sc.name+' 击杀只记一次');A.deepEqual(out.units.filter(u=>u.kind==='advisor').map(u=>u.lastFireTurn),[1,1],sc.name+' 两座都消耗攻击');forestRuns.push({name:sc.name,seed:sc.seed,toast:toast.replace(/ · 敌方阶段.*/,''),foeHp:foe?foe.hp:0,sp:out.teamSp,kills:out.kills});}
  note(rec,'树林独立 0/1/2 次命中与奖励去重',{runs:forestRuns});await shot(p,rec,'a18-04-forest-two-towers.png');
  // 独立升档、余额不足、满级、重复提交
  s=forestState(baseState,8,9);s.turn=1;s.teamSp=9;await setState(p,s);await select(p,'fix-a1');await skills(p);
  A.equal(await p.locator('#skills [data-skill]').count(),1,'仕只有攻击间隔一项');A.doesNotMatch(await p.locator('#skills').innerText(),/强健/);
  await p.locator('[data-skill="advisor-interval"]').click();s=await state(p);
  A.deepEqual([s.units.find(u=>u.id==='fix-a1').towerInterval,s.units.find(u=>u.id==='fix-a2').towerInterval],[2,3],'只升级所选仕');A.equal(s.teamSp,6);
  await p.locator('[data-skill="advisor-interval"]').click();s=await state(p);
  A.equal(s.units.find(u=>u.id==='fix-a1').towerInterval,1);A.equal(s.units.find(u=>u.id==='fix-a2').towerInterval,3);A.equal(s.teamSp,1,'第二档扣 5');
  A.equal(await p.locator('[data-skill="advisor-interval"]').isDisabled(),true,'满级按钮禁用');
  const maxed=await state(p);await p.locator('[data-skill="advisor-interval"]').evaluate(b=>b.click());A.equal((await state(p)).teamSp,maxed.teamSp,'满级重复提交不扣 SP');
  note(rec,'分别升级、只升级所选仕、满级与重复提交',{left:1,right:3,teamSp:maxed.teamSp});await shot(p,rec,'a18-04-upgrade-maxed.png');
  s=forestState(baseState,8,2);await setState(p,s);await select(p,'fix-a1');await skills(p);
  A.equal(await p.locator('[data-skill="advisor-interval"]').isDisabled(),true,'SP 2 不足升第一档');A.match(await p.locator('#skills').innerText(),/缺 1/);
  const short=await state(p);await p.locator('[data-skill="advisor-interval"]').evaluate(b=>b.click());A.equal((await state(p)).teamSp,short.teamSp,'不足不扣 SP');
  note(rec,'余额不足不扣款',{teamSp:short.teamSp});await shot(p,rec,'a18-04-upgrade-insufficient.png');
  assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A18-06','专项','R1 救援：仅仕残骸直接第二波不卡死；有普通队友残骸只列合法对象',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'rescue');
  const king=s.units.find(u=>u.id==='king');const deadAdv=advisor('fix-advisor',3,1);deadAdv.hp=0;
  s.units=[king,enemyKing()];s.corpses=[{id:'corpse-fix-advisor',x:3,y:1,unit:deadAdv}];s.turn=5;s.phase='player';s.wave=1;s.commanderBuff='rescue';s.rescueUsed=false;s.intents=[];s.pendingSpawns=[];s.result=undefined;s.settled=false;
  await setState(p,s);await p.waitForTimeout(50);await end(p);s=await state(p);
  A.equal(s.turn,6,'进入第 6 回合');A.equal(s.wave,2,'仅仕残骸直接进入第二波');A.equal(s.phase,'player','不进入救援阶段');A.ok(s.pendingSpawns.some(w=>w.status==='spawned'),'第二波正常出场');A.equal(await p.locator('#ov-shop').isVisible(),false,'无救援弹窗');
  note(rec,'仅仕残骸：不卡救援，直接第二波',{turn:s.turn,wave:s.wave,phase:s.phase,spawned:s.pendingSpawns.filter(w=>w.status==='spawned').length});await shot(p,rec,'a18-06-advisor-only-wave2.png');
  // 有普通队友残骸：进入救援，名单不含仕
  s.units=[king,enemyKing()];const deadPawn=R.unit('fix-pawn','player','pawn',2,2);deadPawn.hp=0;
  s.corpses=[{id:'corpse-fix-advisor',x:3,y:1,unit:deadAdv},{id:'corpse-fix-pawn',x:2,y:2,unit:deadPawn}];s.turn=5;s.phase='player';s.wave=1;s.commanderBuff='rescue';s.rescueUsed=false;s.intents=[];s.pendingSpawns=[];s.result=undefined;s.settled=false;
  await setState(p,s);await p.waitForTimeout(50);await end(p);s=await state(p);
  A.equal(s.turn,6);A.equal(s.phase,'rescue','有普通队友残骸进入救援');A.equal(await p.locator('#ov-shop').isVisible(),true);
  const opts=await p.locator('#rescue-options').innerText();A.match(opts,/兵/);A.doesNotMatch(opts,/仕/,'救援名单不显示仕');A.equal(await p.locator('[data-rescue="fix-advisor"]').count(),0);A.equal(await p.locator('[data-rescue="fix-pawn"]').count(),1);
  note(rec,'有普通队友时救援名单只含合法对象',{options:opts.replace(/\s+/g,' ')});await shot(p,rec,'a18-06-rescue-list.png');
  await p.locator('[data-rescue="fix-pawn"]').click();s=await state(p);
  A.equal(s.phase,'player');A.equal(s.wave,2);const revived=s.units.find(u=>u.id==='fix-pawn');A.ok(revived&&revived.hp===1,'普通队友可救援');A.ok(!s.units.some(u=>u.id==='fix-advisor'),'仕未被复活');A.equal(s.rescueUsed,true);
  note(rec,'完成合法救援后进入第二波，仕不复活',{phase:s.phase,wave:s.wave,revivedHp:revived&&revived.hp});await shot(p,rec,'a18-06-after-rescue.png');
  assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A18-07','专项（双端UI）','S14 网页与手机横版：侧位按钮、选中卡、目标线、冷却、成长、移动帅后目标更新',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'health');
  const king=s.units.find(u=>u.id==='king');king.x=4;king.y=0;king.ap=1;
  const a1=advisor('fix-a1',3,1),a2=advisor('fix-a2',5,1);const e1=R.unit('fix-e1','enemy','pawn',2,1);e1.hp=1;const e2=R.unit('fix-e2','enemy','pawn',4,1);e2.hp=2;
  s.units=[king,a1,a2,e1,e2,enemyKing()];s.party=s.party.concat([R.copy(a1),R.copy(a2)]);s.activeIds=s.activeIds.concat(['fix-a1','fix-a2']);s.corpses=[];s.pendingSpawns=[];s.phase='player';s.turn=1;s.wave=1;s.commanderBuff='health';s.intents=[];s.teamSp=9;fixtureCells(s,[[3,1],[5,1],[4,0],[2,1],[4,1],[4,8]]);
  await setState(p,s);await p.waitForTimeout(60);
  A.equal(await mobile(p),false,'1280x900 为网页版');A.equal((await plan(p))[0].targetId,'fix-e2','移动前帅 (4,0) 锁 (4,1)');
  await select(p,'fix-a1');let card=await p.locator('#selected-card').innerText();A.match(card,/射程八邻格/);A.match(card,/攻击间隔 3/);
  const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks().map(m=>m.layer));A.ok(marks.includes('advisor-target'));A.ok(marks.includes('intent-line'));
  A.match(await p.locator('#piece-hp-layer').innerText(),/仕 开火/);
  note(rec,'网页横版：选中卡/目标线/开火标签',{target:(await plan(p))[0].targetId,card:card.replace(/\s+/g,' ').slice(0,120)});await shot(p,rec,'a18-07-desktop-before-move.png');
  // 实际移动帅，观察目标更新
  await select(p,'king');await cell(p,{x:3,y:0});s=await state(p);A.deepEqual([s.units.find(u=>u.id==='king').x,s.units.find(u=>u.id==='king').y],[3,0]);
  A.equal((await plan(p))[0].targetId,'fix-e1','移动帅后按同距低 HP 改锁 (2,1)');
  await select(p,'fix-a1');card=await p.locator('#selected-card').innerText();A.match(card,/本回合锁定/);
  note(rec,'网页横版：移动帅后目标更新',{king:[3,0],target:(await plan(p))[0].targetId});await shot(p,rec,'a18-07-desktop-after-move.png');
  // 冷却标签
  s=await state(p);s.turn=2;s.units.find(u=>u.id==='fix-a1').lastFireTurn=1;s.units.find(u=>u.id==='fix-a1').towerInterval=3;await setState(p,s);await select(p,'fix-a1');
  A.match(await p.locator('#piece-hp-layer').innerText(),/仕 冷却2/);
  // 手机横版
  await p.setViewportSize({width:844,height:390});await p.waitForTimeout(150);A.equal(await mobile(p),true,'844x390 为手机横版');
  await select(p,'fix-a1');const mcard=await p.locator('#mobile-selected').innerText();
  A.match(mcard,/八邻格/);A.match(mcard,/间隔/);A.match(mcard,/固定装置不可移动/);
  await skills(p);A.equal(await p.locator('#skills [data-skill]').count(),1);A.match(await p.locator('#skills').innerText(),/攻击间隔/);await closeSheet(p);
  A.match(await p.locator('#piece-hp-layer').innerText(),/仕 冷却2/);
  note(rec,'844x390 手机横版：选中卡/冷却/成长可读',{card:mcard.replace(/\s+/g,' ').slice(0,120),viewport:'844x390'});await shot(p,rec,'a18-07-mobile-landscape-cooldown.png');
  await p.setViewportSize({width:1280,height:900});await p.waitForTimeout(120);A.equal(await mobile(p),false);A.equal((await plan(p))[0].targetId,'fix-e1','显示切换不改变战局');
  note(rec,'侧位按钮双端证据见 A18-02（1280x900 与 844x390 截图）',{});assertNoPageErrors(p,rec);await context.close();
 });

 report.result=report.cases.every(c=>c.status==='pass')?'PASS':'FAIL';
 report.finishedAt=new Date().toISOString();
 report.files=Object.fromEntries(['web/index.html','web/js/app.js','web/js/rules.js'].map(f=>[f,sha(f)]));
 save();
 console.log(JSON.stringify({result:report.result,cases:report.cases.map(c=>({id:c.id,status:c.status,evidence:c.evidence})),errors:report.errors,dir}));
 await browser.close();
})().catch(async e=>{report.result='FAIL';report.failure={message:e.message,stack:e.stack};save();console.error(e);if(browser)await browser.close();process.exitCode=1;});
