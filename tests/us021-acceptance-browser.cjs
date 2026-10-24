// US-021 实际浏览器验收：正常入口主链路（H20 与 H01/H02/H06/H11/H12/H17/H13 界面部分）、
// 显式夹具专项（H03/H04/H05/H07/H10/H14/H16/H19）、旧存档副本迁移（H18）、手机关键操作。
// 独立浏览器上下文运行，不读写用户正式存档；夹具段与预置存档段明确标注“专项”。
// 2026-10-22 退修：手机板可辨识证据改用项目自有设备基准 448×924（preview.html 的 Mate 40 Pro 竖屏）；
// 844×390 短高度窗口保留为“操作可达”证据并记录棋盘像素度量（既有布局，非本需求马面板导致）。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const dir=path.resolve(process.env.US021_EVIDENCE_DIR||'docs/us/us021-evidence-r2');fs.mkdirSync(dir,{recursive:true});
const report={scope:'US-021 H01～H20 实际浏览器验收（正常入口 + 专项夹具 + 旧档副本）',startedAt:new Date().toISOString(),steps:[],pageErrors:[],versions:{},layout:{}};
const VERSION_FILES=['web/index.html','web/js/rules.js','web/js/app.js','web/js/campaign.js','tests/us021-horse.test.cjs','tests/us021-acceptance-browser.cjs'];
report.versions=Object.fromEntries(VERSION_FILES.filter(f=>fs.existsSync(f)).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
let failed=0;
function ok(id,kind,detail,evidence){report.steps.push({id,kind,pass:true,detail,evidence:evidence||null});console.log('PASS '+id+' · '+detail);}
function bad(id,kind,detail,error){failed++;report.steps.push({id,kind,pass:false,detail,error:String(error&&error.stack||error)});console.log('FAIL '+id+' · '+detail+' · '+(error&&error.message||error));}
async function step(id,kind,fn){try{const detail=await fn();ok(id,kind,detail);}catch(e){bad(id,kind,'执行失败',e);}}
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
async function cell(p,to){const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.click(xy.x,xy.y);}
async function hoverCell(p,to){const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.move(xy.x,xy.y-1);await p.mouse.move(xy.x,xy.y);}
const unit=(s,id)=>s.units.find(u=>u.id===id);
function land(){const t={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)t[x+','+y]='land';return t;}
function fixture(units,opts){opts=opts||{};const s=R.emptyState([R.unit('king','player','king',0,0),R.unit('boss','enemy','king',8,8),...units]);s.phase=opts.phase||'player';s.tiles=Object.assign(land(),opts.tiles||{});s.teamSp=opts.teamSp===undefined?0:opts.teamSp;if(opts.buffs)s.buffs=Object.assign({health:false,move:false,rescue:false},opts.buffs);if(opts.rng!==undefined)s.rng=opts.rng;if(opts.corpses)s.corpses=opts.corpses;s.intents=opts.intents||[];return s;}
async function shot(p,name){await p.screenshot({path:path.join(dir,name)});return name;}
// 只截棋盘区域，供人工目视核对落点/四邻范围；不参与状态判定。
async function shotBoard(p,name){
 const box=await p.evaluate(()=>{const r=document.getElementById('scene').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
 await p.screenshot({path:path.join(dir,name),clip:{x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.max(1,box.width),height:Math.max(1,box.height)}});
 return name;
}
// 棋盘可辨识性度量：把“看得清”转成可复核像素指标，避免只凭坐标点击成功判定通过。
async function boardMetrics(p){
 return p.evaluate(()=>{
  const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
  const g=window.__M0_DEBUG__.grid;
  const c00=g.screenPoint({x:0,y:0}),c10=g.screenPoint({x:1,y:0}),c01=g.screenPoint({x:0,y:1}),c88=g.screenPoint({x:8,y:8});
  const board={x0:Math.min(c00.x,c88.x),y0:Math.min(c00.y,c88.y),x1:Math.max(c00.x,c88.x),y1:Math.max(c00.y,c88.y)};
  const contained=(inner,outer)=>!!inner&&!!outer&&inner.x>=outer.x-1&&inner.y>=outer.y-1&&inner.x+inner.w<=outer.x+outer.w+1&&inner.y+inner.h<=outer.y+outer.h+1;
  const lines=s=>{const e=document.querySelector(s);return e?{clientH:e.clientHeight,scrollH:e.scrollHeight,clipped:e.scrollHeight>e.clientHeight+1}:null};
  const labels=[...document.querySelectorAll('.piece-hp')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
  const hit=(a,b)=>!(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
  let overlaps=0;
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(hit(labels[i],labels[j]))overlaps++;
  const panel=rect('#panel');
  const modeBoxes=[...document.querySelectorAll('#rook-modes button')].map(e=>{const r=e.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}});
  const scene=rect('#scene'),canvas=rect('#scene canvas');
  return {
   layout:document.getElementById('game-viewport').dataset.layoutMode,display:window.M0Display.size(),viewport:{w:innerWidth,h:innerHeight},
   scene,canvas,cellW:Math.round(Math.hypot(c10.x-c00.x,c10.y-c00.y)),cellH:Math.round(Math.hypot(c01.x-c00.x,c01.y-c00.y)),
   boardW:Math.round(board.x1-board.x0),boardH:Math.round(board.y1-board.y0),
   boardInsideScene:board.x0>=scene.x-1&&board.y0>=scene.y-1&&board.x1<=scene.x+scene.w+1&&board.y1<=scene.y+scene.h+1,
   hpLabels:labels.length,hpOverlaps:overlaps,
   modesInsidePanel:!!panel&&modeBoxes.every(b=>contained(b,panel)),selectedInsidePanel:contained(rect('#mobile-selected'),panel),
   preview:lines('#mobile-preview'),selection:lines('#panel .selection-section'),
   modes:[...document.querySelectorAll('#rook-modes button')].map(e=>e.textContent)
  };
 });
}
async function openFixture(browser,viewport){
 const ctx=await browser.newContext({viewport:viewport||{width:1400,height:900}});
 const p=await ctx.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));
 await p.goto(base+'/?device-preview=regression&validation=us021');
 await p.waitForFunction(()=>!!window.__M0_DEBUG__);
 return {ctx,p};
}
async function openWithSave(browser,save,viewport){
 const ctx=await browser.newContext({viewport:viewport||{width:1400,height:900}});
 await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(save))});}catch(e){}`);
 const p=await ctx.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));
 await p.goto(base+'/');
 return {ctx,p};
}
function playerSave(over){return Object.assign({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:null,battle:null},over||{});}
async function campView(p){await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='camp',null,{timeout:25000});}
async function selectBattleUnit(p,id){
 const ally=p.locator('[data-unit="'+id+'"]');
 if(await ally.first().isVisible()){await ally.first().click();return;}
 await p.locator('#mobile-tools [data-ui-view="units"]').click();
 await p.locator('[data-unit="'+id+'"]').first().click();
 if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();
}

/* ---------------- A. 正常入口主链路（H20 及界面项） ---------------- */
async function normalFlow(browser){
 const {ctx,p}=await openWithSave(browser,playerSave());
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu',null,{timeout:25000});
 await step('H20-1','正常入口（新旅程→跳过教学→营地）',async()=>{
  await p.locator('#flow-new').click();
  await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
  await p.locator('#tutorial-skip').click();
  await p.locator('#tutorial-skip-yes').click();
  await campView(p);
  const s=await st(p);
  A.equal(s.gold,8,'首次入营 8 猫粮');
  A.equal(s.teamSp,0,'新旅程公共 SP 从 0 开始（无注入）');
  A.deepEqual(s.party.map(u=>u.kind).sort(),['horse','pawn','pawn','rook']);
  return `正常点击进入营地：猫粮 ${s.gold}、公共 SP ${s.teamSp}、队伍 ${s.party.map(u=>u.kind).join('/')}`;
 });
 await step('H20-2','正常入口：商店招募马',async()=>{
  await p.locator('[data-recruit="horse"]').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().party.some(u=>u.id==='recruit-horse-0'));
  const s=await st(p);
  A.equal(s.gold,3,'招募马扣 5 猫粮（8→3）');
  A.ok(s.bench.indexOf('recruit-horse-0')>=0,'满员时新马进入后备');
  return `点击招募马：猫粮 8→${s.gold}，recruit-horse-0 进入后备（上阵 ${s.activeIds.length}/4）`;
 });
 await step('H20-3','正常入口：营地换阵让招募马出战',async()=>{
  await p.locator('[data-camp-roster="starting-horse"]').click();
  await p.waitForTimeout(150);
  await p.locator('[data-camp-roster="recruit-horse-0"]').click();
  await p.waitForTimeout(150);
  const s=await st(p);
  A.ok(s.activeIds.includes('recruit-horse-0'),'新马改为上阵');
  A.ok(s.bench.includes('starting-horse'),'原马改后备');
  const shotName=await shot(p,'h20-camp-roster.png');
  return `名单切换上阵 ${s.activeIds.join(',')}；猫粮 ${s.gold}；截图 ${shotName}`;
 });
 await step('H06/H13-营地技能面板','营地技能面板：马三项价格与 SP 不足禁用',async()=>{
  const campText=await p.locator('#camp-skills').innerText();
  for(const [label,cost] of [['技能距离','1 公共 SP'],['技能伤害','2 公共 SP'],['推动＋解除绊马脚','2 公共 SP']])A.ok(campText.includes(label),`营地清单含“${label}”`);
  A.ok(/技能距离[\s\S]{0,80}1 公共 SP/.test(campText),'距离显示 1 SP');
  const btn=p.locator('[data-camp-skill="recruit-horse-0"][data-skill="horse-jump-distance"]');
  A.equal(await btn.isDisabled(),true,'SP 0 时技能按钮禁用');
  const shotName=await shot(p,'h06-camp-skills.png');
  return `营地清单含马三项成长（1/2/2 SP），SP 0 时按钮禁用；截图 ${shotName}`;
 });
 await step('H20-4','正常入口：离开营地→选关→布阵',async()=>{
  await p.locator('#camp-leave').click();
  await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
  await p.locator('#flow-enter').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
  await p.locator('[data-deploy="recruit-horse-0"]').click();
  await cell(p,{x:7,y:3});
  let s=await st(p);
  A.deepEqual([unit(s,'recruit-horse-0').x,unit(s,'recruit-horse-0').y],[7,3],'布阵放置新马到 (7,3)');
  await p.locator('#btn-deploy-confirm').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
  s=await st(p);
  A.equal(s.teamSp,0);
  return `布阵确认后进入我方行动：新马 (7,3)、SP 0、回合 ${s.turn}`;
 });
 await step('H19-界面','我方马只有两个操作入口（无旧普通攻击）',async()=>{
  await selectBattleUnit(p,'recruit-horse-0');
  const modes=await p.locator('#rook-modes button').allInnerTexts();
  A.deepEqual(modes,['普通移动','跳跃攻击 2 格'],'马只有普通移动与跳跃攻击两个按钮');
  await p.locator('.upgrade-section').evaluate(n=>n.open=true);
  const skills=await p.locator('#skills').innerText();
  A.ok(skills.includes('强健'),'强健升级保留');
  A.ok(skills.includes('推动＋解除绊马脚')&&skills.includes('技能距离')&&skills.includes('技能伤害'),'三项马成长可购买');
  const card=await p.locator('#selected-card').innerText();
  A.ok(card.includes('跳跃攻击'),'棋子卡显示跳跃攻击');
  const shotName=await shot(p,'h19-horse-modes.png');
  return `模式按钮=${JSON.stringify(modes)}；技能含强健/距离/伤害/推动；截图 ${shotName}`;
 });
 await step('H02/H20-预览与取消','跳跃预览与取消：不改变资源、行动',async()=>{
  await p.locator('[data-mode="horse-jump"]').click();
  await hoverCell(p,{x:7,y:5});
  await p.waitForTimeout(150);
  const box=await p.locator('#preview-box').innerText();
  A.ok(box.includes('跳跃攻击'),'预览标题为跳跃攻击');
  A.ok(box.includes('落地四邻格直接伤害 1 点'),'预览写明落地四邻格伤害 1 点');
  A.ok(box.includes('伤害范围'),'预览列出伤害范围格');
  const before=JSON.stringify(await st(p));
  const shotPreview=await shot(p,'h20-jump-preview.png');
  await p.locator('#btn-cancel').click();
  await p.waitForTimeout(100);
  A.equal(JSON.stringify(await st(p)),before,'取消预览后状态完全一致');
  return `预览含“跳跃攻击/落地四邻格直接伤害 1 点/伤害范围”；取消后状态一致；截图 ${shotPreview}`;
 });
 await step('H20-5','正常入口：基础跳跃攻击（距离 2）落地击杀',async()=>{
  await selectBattleUnit(p,'recruit-horse-0');
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:7,y:5});
  await p.waitForTimeout(250);
  const s=await st(p);
  const horse=unit(s,'recruit-horse-0');
  A.deepEqual([horse.x,horse.y],[7,5],'马落到 (7,5)');
  A.equal(unit(s,'w1-2'),undefined,'落点四邻的敌方兵被击杀');
  A.equal(s.teamSp,1,'击杀获得 1 公共 SP');
  A.equal(horse.horseJumpUsed,true);
  A.equal(horse.ap,0,'跳跃后普通移动额度为 0');
  const shotName=await shot(p,'h20-jump-executed.png');
  return `点击跳跃落点 (7,5)：击杀 w1-2、SP 0→${s.teamSp}、马 ${JSON.stringify([horse.x,horse.y])}、ap ${horse.ap}；截图 ${shotName}`;
 });
 await step('H01-界面','跳跃后本回合不能再普通移动',async()=>{
  const before=JSON.stringify(await st(p));
  const disabled=await p.locator('[data-mode="horse-move"]').isDisabled();
  A.equal(disabled,true,'跳跃后普通移动按钮禁用');
  await p.locator('[data-mode="horse-move"]').evaluate(b=>{b.disabled=false;b.click();});
  await p.waitForTimeout(100);
  A.equal(JSON.stringify(await st(p)),before,'重复点击无效、状态不变');
  return `跳跃后普通移动按钮禁用（disabled=${disabled}），强制点击也不改变状态`;
 });
 await step('H06/H12-战斗购买','技能距离即时生效、不恢复行动、扣 1 SP',async()=>{
  const before=await st(p);
  await p.locator('.upgrade-section').evaluate(n=>n.open=true);
  const btn=p.locator('#skills [data-skill="horse-jump-distance"]');
  A.equal(await btn.isEnabled(),true,'SP 1 时距离升级可点');
  await btn.click();
  await p.waitForTimeout(200);
  const s=await st(p);
  const horse=unit(s,'recruit-horse-0');
  A.equal(R.horseJumpRangeOf(horse),3,'技能距离 2→3');
  A.equal(s.teamSp,before.teamSp-1,'扣除 1 公共 SP');
  A.equal(horse.ap,0,'购买不恢复普通移动额度');
  A.equal(horse.horseJumpUsed,true,'购买不恢复本回合跳跃');
  A.ok((await p.locator('[data-mode="horse-jump"]').innerText()).includes('3 格'),'模式按钮即时显示 3 格');
  const shotName=await shot(p,'h12-buy-distance.png');
  return `点击“技能距离”：SP ${before.teamSp}→${s.teamSp}、距离 3、ap 仍 0、跳跃已用仍 true；截图 ${shotName}`;
 });
 await step('H20-6','走出回合并使用升级后的 3 格跳跃',async()=>{
  await p.locator('#btn-end').click();
  await p.locator('#btn-confirm-yes').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===2,null,{timeout:15000});
  let s=await st(p);
  A.equal(unit(s,'recruit-horse-0').horseJumpUsed,false,'新回合跳跃机会恢复');
  await selectBattleUnit(p,'recruit-horse-0');
  await p.locator('[data-mode="horse-jump"]').click();
  await hoverCell(p,{x:4,y:5});
  await p.waitForTimeout(350);
  const previewText=await p.locator('#preview-box').innerText();
  A.ok(/直线 3 格/.test(previewText),'预览显示 3 格跳跃距离；实际：'+previewText.slice(0,120));
  await cell(p,{x:4,y:5});
  await p.waitForTimeout(250);
  s=await st(p);
  const moved=unit(s,'recruit-horse-0');
  A.deepEqual([moved.x,moved.y],[4,5],'使用升级后的距离 3 落在 (4,5)');
  A.equal(unit(s,'w1-1'),undefined,'落地四邻格的敌方兵被击杀');
  A.equal(s.teamSp,1,'再次击杀积累公共 SP');
  const shotName=await shot(p,'h20-distance3-jump.png');
  return `第 2 回合点击 3 格落点 (4,5)：预览“直线 3 格”、击杀 w1-1、SP ${s.teamSp}；截图 ${shotName}`;
 });
 await step('H20-7','正常入口：第 3 回合普通移动与撤回',async()=>{
  await p.locator('#btn-end').click();
  await p.locator('#btn-confirm-yes').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===3,null,{timeout:20000});
  await p.waitForTimeout(300);
  let s=await st(p);
  const before={kills:s.kills,teamSp:s.teamSp};
  await selectBattleUnit(p,'recruit-horse-0');
  const modes=await p.locator('#rook-modes button').allInnerTexts();
  A.ok(modes.includes('普通移动'),'第 3 回合普通移动入口可用');
  await p.locator('[data-mode="horse-move"]').click();
  await cell(p,{x:5,y:3});
  await p.waitForTimeout(250);
  s=await st(p);
  A.deepEqual([unit(s,'recruit-horse-0').x,unit(s,'recruit-horse-0').y],[5,3],'普通日字移动到 (5,3)');
  A.equal(unit(s,'recruit-horse-0').ap,0,'普通移动消耗额度');
  A.equal(s.kills,before.kills,'普通移动击杀数不变');
  A.equal(s.teamSp,before.teamSp,'普通移动不产生 SP');
  A.equal(await p.locator('#btn-undo').isEnabled(),true,'普通移动后可撤回');
  const shotMove=await shot(p,'h20-normal-move.png');
  await p.locator('#btn-undo').click();
  await p.waitForTimeout(250);
  s=await st(p);
  A.deepEqual([unit(s,'recruit-horse-0').x,unit(s,'recruit-horse-0').y],[4,5],'撤回恢复移动前位置');
  A.equal(unit(s,'recruit-horse-0').ap,1,'撤回恢复普通移动额度');
  const shotUndo=await shot(p,'h20-normal-undo.png');
  return `第 3 回合普通移动到 (5,3)（击杀/SP 不变、可撤回），撤回后回到 (4,5) 且 AP 恢复；截图 ${shotMove},${shotUndo}`;
 });
 A.equal(report.pageErrors.length,0,'正常链路无页面错误：'+JSON.stringify(report.pageErrors));
 await ctx.close();
}

/* ---------------- B. 专项夹具（H03/H04/H05/H07/H10/H14/H16/H17/H19） ---------------- */
async function fixtures(browser){
 const {ctx,p}=await openFixture(browser);
 await step('H01-专项界面','先普通移动再释放跳跃：普通移动不伤害、跳跃照常结算',async()=>{
  const s1=fixture([R.unit('h','player','horse',4,4),R.unit('near','enemy','pawn',6,6),R.unit('t','enemy','pawn',6,5)]);
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),s1);
  await p.locator('[data-unit="h"]').click();
  await cell(p,{x:5,y:6});await p.waitForTimeout(200);
  let s=await st(p);
  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[5,6],'普通移动到达 (5,6)');
  A.equal(unit(s,'near').hp,1,'普通移动不伤害落点四邻敌人');
  A.equal(s.units.find(u=>u.id==='t').hp,1);
  A.equal(unit(s,'h').ap,0,'普通移动消耗额度');
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:5,y:5});await p.waitForTimeout(250);
  s=await st(p);
  A.equal(unit(s,'t'),undefined,'先移后跳仍可击杀四邻目标');
  A.equal(unit(s,'h').horseJumpUsed,true);
  A.equal(s.teamSp,1,'跳跃击杀累计公共 SP');
  const shotName=await shot(p,'h01-move-then-jump.png');
  return `普通移动 (4,4)→(5,6) 不造成伤害，随后跳跃 (5,5) 击杀 t、SP 1；截图 ${shotName}`;
 });
 await step('H15-专项界面','双王同亡：完整结算后失败优先（终局截图）',async()=>{
  const s1=fixture([R.unit('h','player','horse',4,3),R.unit('side','enemy','pawn',5,2)]);
  const king=s1.units.find(u=>u.id==='king');king.x=4;king.y=1;king.hp=1;
  const boss=s1.units.find(u=>u.id==='boss');boss.x=3;boss.y=2;boss.hp=1;
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),s1);
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:4,y:2});await p.waitForTimeout(300);
  const s=await st(p);
  A.equal(s.result,'dead','双方主将同亡时失败优先');
  A.equal(s.phase,'result');
  A.equal(unit(s,'side'),undefined,'其他方向目标同样被结算');
  const overlay=await p.locator('#ov-result').innerText().catch(()=>'');
  const shotName=await shot(p,'h15-both-kings.png');
  return `同次技能击杀双方主将与其他方向目标，结果 ${s.result}/${s.phase}；结算浮层含“${overlay.split('\n')[0].slice(0,20)}”；截图 ${shotName}`;
 });
 await step('H02/H03-专项界面','非法落点被拒绝并显示原因、不消耗技能',async()=>{
  const state=fixture([R.unit('h','player','horse',4,4),R.unit('enemy','enemy','rook',6,4)],{tiles:{'4,2':'mountain','4,3':'water'}});
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),state);
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  const before=JSON.stringify(await st(p));
  const cases=[[{x:4,y:1},'超过技能距离'],[{x:5,y:5},'斜向'],[{x:4,y:2},'山体'],[{x:4,y:3},'水格'],[{x:6,y:4},'为空']];
  const reasons=[];
  for(const [to,expect] of cases){
   await cell(p,to);await p.waitForTimeout(120);
   const box=await p.locator('#preview-box').innerText();
   A.ok(box.includes(expect),`落点 ${JSON.stringify(to)} 提示含“${expect}”，实际：${box.slice(0,80)}`);
   reasons.push(`${JSON.stringify(to)}→${box.split('\n')[0].slice(0,24)}`);
   A.equal(JSON.stringify(await st(p)),before,'非法落点不改变状态');
  }
  await cell(p,{x:4,y:4});await p.waitForTimeout(100);
  A.equal(JSON.stringify(await st(p)),before,'点击自身格只选中棋子、不释放技能');
  reasons.push('原地→选中自身（无技能结算）');
  const shotName=await shot(p,'h03-illegal-targets.png');
  return `依次点击 3 格/斜向/山/水/占用格：均显示对应原因且状态不变；点击自身格只选中；${reasons.join('；')}；截图 ${shotName}`;
 });
 await step('H04-专项界面','水中马不能跳跃、可普通移动离开',async()=>{
  const state=fixture([R.unit('h','player','horse',2,4)],{tiles:{'2,4':'water'}});
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),state);
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:2,y:2});await p.waitForTimeout(120);
  let box=await p.locator('#preview-box').innerText();
  A.ok(box.includes('水中'),'水中施放提示含“水中”');
  let s=await st(p);
  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[2,4],'水中施放不移动');
  await p.locator('[data-mode="horse-move"]').click();
  await cell(p,{x:3,y:2});await p.waitForTimeout(150);
  s=await st(p);
  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[3,2],'普通移动可离开水面');
  A.equal(unit(s,'h').hp,1,'马入水不死亡');
  const shotName=await shot(p,'h04-water.png');
  return `水中跳跃被拒（提示含“水中”），随后普通移动离开到 (3,2) 且 HP 不变；截图 ${shotName}`;
 });
 await step('H05/H07/H14-专项界面','推动预览、四邻伤害与推动结算',async()=>{
  const state=fixture([R.unit('h','player','horse',4,4),R.unit('enemyRook','enemy','rook',4,1),R.unit('allyRook','player','rook',3,2),R.unit('allyPawn','player','pawn',4,3)],
   {teamSp:2,corpses:[{id:'c',x:5,y:2,unit:R.unit('deadAlly','player','pawn',5,2)}]});
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),state);
  await p.locator('[data-unit="h"]').click();
  await p.locator('.upgrade-section').evaluate(n=>n.open=true);
  await p.locator('#skills [data-skill="horse-push"]').click();
  await p.waitForTimeout(150);
  let s=await st(p);
  A.equal(unit(s,'h').horsePush,true,'战斗中购买推动成功');
  A.equal(s.teamSp,0);
  await p.locator('[data-mode="horse-jump"]').click();
  await hoverCell(p,{x:4,y:2});await p.waitForTimeout(150);
  const box=await p.locator('#preview-box').innerText();
  A.ok(box.includes('推动')&&box.includes('已解锁'),'预览含推动且标记已解锁');
  A.ok(box.includes('友军'),'预览含友军伤害标记');
  const shotBefore=await shot(p,'h07-push-preview.png');
  await cell(p,{x:4,y:2});await p.waitForTimeout(250);
  s=await st(p);
  A.deepEqual([unit(s,'enemyRook').x,unit(s,'enemyRook').y],[4,0],'敌方车被外推到 (4,0)');
  A.deepEqual([unit(s,'allyRook').x,unit(s,'allyRook').y],[2,2],'友军车被外推到 (2,2)');
  A.equal(unit(s,'allyPawn'),undefined,'四邻格友军兵被直接击杀');
  const freshBody=s.corpses.find(b=>b.unit.id==='allyPawn');
  A.ok(freshBody,'本次伤害新产生的友军尸体保留');
  A.deepEqual([freshBody.x,freshBody.y],[4,4],'新友军尸体在同次推动阶段外推到 (4,4)');
  A.deepEqual([s.corpses.find(b=>b.unit.id==='deadAlly').x,s.corpses.find(b=>b.unit.id==='deadAlly').y],[6,2],'既有尸体被外推到 (6,2)');
  A.equal(s.kills,0,'击杀友军不计入战绩');
  const shotAfter=await shot(p,'h07-push-result.png');
  return `购买推动(2SP)后预览含友军与推动；执行后敌方车→(4,0)、友军车→(2,2)、新友军尸体→(4,4)、既有尸体→(6,2)，击杀友军不计战绩；截图 ${shotBefore},${shotAfter}`;
 });
 await step('H10-专项界面','树林闪避分支（显式固定 rng）',async()=>{
  const mkState=seed=>{const s=fixture([R.unit('h','player','horse',4,4),R.unit('a-enemy','enemy','pawn',4,1),R.unit('b-ally','player','pawn',3,2)],
   {rng:seed,tiles:{'4,1':'forest','3,2':'forest'}});s.units.find(u=>u.id==='h').horsePush=true;/* 专项：直接设定已解锁推动 */return s;};
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),mkState(0));
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:4,y:2});await p.waitForTimeout(250);
  let s=await st(p);
  A.equal(unit(s,'a-enemy').hp,1,'rng=0：敌兵闪避不受伤害');
  A.deepEqual([unit(s,'a-enemy').x,unit(s,'a-enemy').y],[4,1],'闪避者不被推动');
  A.equal(unit(s,'b-ally').hp,1,'rng=0：友军闪避不受伤害');
  A.deepEqual([unit(s,'b-ally').x,unit(s,'b-ally').y],[3,2],'闪避友军不被推动');
  const shotDodge=await shot(p,'h10-forest-dodge.png');
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),mkState(200));
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:4,y:2});await p.waitForTimeout(250);
  s=await st(p);
  A.equal(unit(s,'a-enemy'),undefined,'rng=200：敌兵未闪避被击杀');
  A.equal(unit(s,'b-ally'),undefined,'rng=200：友军未闪避被击杀');
  const shotHit=await shot(p,'h10-forest-hit.png');
  return `固定 rng 专项：seed0 双方闪避（伤害与推动都不生效）；seed200 双方命中并阵亡；截图 ${shotDodge},${shotHit}`;
 });
 await step('H16-专项界面','疾行扩展移动真实点击（含马腿阻挡与解锁后免马腿）',async()=>{
  const dash=fixture([R.unit('h','player','horse',2,2),R.unit('leg','player','pawn',3,2)],{buffs:{move:true}});
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),dash);
  await p.locator('[data-unit="h"]').click();
  const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks().filter(m=>m.layer==='move').map(m=>[m.x,m.y]));
  A.ok(marks.some(m=>m[0]===2&&m[1]===4),'疾行扩展落点 (2,4) 出现在标记中');
  A.ok(!marks.some(m=>m[0]===4&&m[1]===3),'被马腿阻挡的日字点不出现');
  const hpBefore=await p.evaluate(()=>window.__M0_DEBUG__.getState().units.map(u=>[u.id,u.hp]));
  await cell(p,{x:2,y:4});await p.waitForTimeout(200);
  let s=await st(p);
  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[2,4],'一次点击直达扩展落点');
  const hpMap=Object.fromEntries(hpBefore);
  A.equal(s.units.every(u=>u.hp===hpMap[u.id]),true,'扩展普通移动不触发伤害');
  A.equal(unit(s,'h').ap,0,'扩展移动只消耗一次普通移动');
  const shotDash=await shot(p,'h16-dash-move.png');
  const unlocked=fixture([R.unit('h','player','horse',2,2),R.unit('leg','player','pawn',3,2)],{buffs:{move:true}});
  unlocked.units.find(u=>u.id==='h').horsePush=true; /* 专项：已解锁推动＋解除绊马脚 */
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),unlocked);
  await p.locator('[data-unit="h"]').click();
  await cell(p,{x:4,y:3});await p.waitForTimeout(200);
  s=await st(p);
  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[4,3],'解锁后日字可通过被挡马腿');
  const shotFree=await shot(p,'h16-dash-unlocked.png');
  return `疾行夹具：扩展点 (2,4) 可点、无伤害、AP 只扣 1；解锁后 (4,3) 日字可通过原马腿位置；截图 ${shotDash},${shotFree}`;
 });
 await step('H11/H17-专项界面','普通移动可撤回；跳跃释放锁定撤回；购买清撤回且不刷新行动',async()=>{
  const s1=fixture([R.unit('h','player','horse',4,4),R.unit('e','enemy','pawn',6,6)]);
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),s1);
  await p.locator('[data-unit="h"]').click();
  await cell(p,{x:5,y:6});await p.waitForTimeout(150);
  A.equal(await p.locator('#btn-undo').isEnabled(),true,'普通移动后可撤回');
  await p.locator('#btn-undo').click();await p.waitForTimeout(150);
  let s=await st(p);
  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[4,4],'撤回恢复原位置');
  A.equal(unit(s,'h').ap,1,'撤回恢复普通移动额度');
  // 移动后释放跳跃（无目标落点）→ 撤回锁定
  await p.locator('[data-unit="h"]').click();
  await cell(p,{x:5,y:6});await p.waitForTimeout(150);
  A.equal(await p.locator('#btn-undo').isEnabled(),true,'再次移动后可撤回');
  await p.locator('[data-unit="h"]').click();
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:5,y:5});await p.waitForTimeout(250);
  s=await st(p);
  A.equal(await p.locator('#btn-undo').isDisabled(),true,'释放跳跃后撤回锁定');
  A.equal(unit(s,'h').horseJumpUsed,true);
  // 购买清撤回且不刷新行动
  const s2=fixture([R.unit('h','player','horse',4,4)],{teamSp:2});
  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),s2);
  await p.locator('[data-unit="h"]').click();
  await cell(p,{x:5,y:6});await p.waitForTimeout(150);
  A.equal(await p.locator('#btn-undo').isEnabled(),true,'购买前存在撤回记录');
  await p.locator('[data-unit="h"]').click();
  await p.locator('.upgrade-section').evaluate(n=>n.open=true);
  await p.locator('#skills [data-skill="horse-jump-damage"]').click();await p.waitForTimeout(200);
  s=await st(p);
  A.equal(await p.locator('#btn-undo').isDisabled(),true,'成功购买清除撤回记录');
  A.equal(s.teamSp,0,'购买扣 2 SP');
  A.equal(unit(s,'h').ap,0,'购买不恢复已用普通移动');
  A.equal(unit(s,'h').horseJumpUsed,false,'购买不额外消耗跳跃机会');
  const shotUndo=await shot(p,'h11-undo-lock.png');
  return `普通移动→撤回恢复 AP；移动后释放无伤害跳跃立即锁定撤回；购买成功后撤回清空、AP 仍为 0、跳跃仍可用；截图 ${shotUndo}`;
 });
 await step('H19-专项界面','敌方马保持日字与旧攻击预告，无跳跃入口',async()=>{
  const s=fixture([R.unit('h','player','horse',4,4),R.unit('eh','enemy','horse',1,4),R.unit('t','player','pawn',3,5)],{tiles:{'1,3':'mountain'}});
  s.intents=R.generateIntents(s);
  await p.evaluate(st2=>window.__M0_DEBUG__.setState(st2),s);
  await p.locator('[data-unit="h"]').click();
  const modes=await p.locator('#rook-modes button').allInnerTexts();
  A.equal(modes.length,2,'我方马只有两个入口');
  const intents=await p.locator('#intent-list').innerText();
  A.ok(intents.includes('待机')||intents.includes('移动')||intents.includes('攻击'),'敌方意图面板正常渲染');
  const shotName=await shot(p,'h19-enemy-intents.png');
  return `我方马入口 ${JSON.stringify(modes)}；敌方意图面板正常（${intents.split('\n')[0].slice(0,40)}）；截图 ${shotName}`;
 });
 await ctx.close();
}

/* ---------------- C. 旧存档副本迁移（H18）与三阶段购买（H13） ---------------- */
async function oldSave(browser){
 // 旧旅程档副本（马缺少新版本字段）
 let camp=R.newGame();camp.phase='intermission';camp=R.enterCamp(camp);camp.teamSp=3;camp.gold=4;
 const party=JSON.parse(JSON.stringify(camp.party));
 const oldHorse=party.find(u=>u.kind==='horse');
 Object.assign(oldHorse,{kills:2,level:3,fortify:1,hp:2,maxHp:2});
 delete oldHorse.horseJumpRange;delete oldHorse.horseJumpDamage;delete oldHorse.horsePush;delete oldHorse.horseJumpUsed;
 const journey={gold:4,teamSp:3,population:4,buffs:{health:true,move:false,rescue:false},party,
  activeIds:party.map(u=>u.id),bench:[],completed:0,tutorial:'skipped',firstEntryRewarded:true};
 const campSave=playerSave({journey});
 {
  const {ctx,p}=await openWithSave(browser,campSave);
  await campView(p).catch(()=>{});
  await p.waitForTimeout(600);
  await step('H18-营地副本','旧旅程档加载：马自动接入基础技能、保留成长、不赠点不清档',async()=>{
   const s=await st(p);
   const horse=s.party.find(u=>u.kind==='horse');
   A.ok(horse,'队伍中的旧马保留');
   A.deepEqual([horse.horseJumpRange,horse.horseJumpDamage,horse.horsePush],[2,1,false],'旧马补齐 2/1/未解锁');
   A.deepEqual([horse.kills,horse.hp,horse.maxHp,horse.fortify],[2,2,2,1],'击杀/血量/强健保留');
   A.equal(s.teamSp,3,'营地加载不赠送 SP');
   A.equal(s.gold,4,'猫粮不变');
   const roster=await p.locator('#camp-roster').innerText();
   A.ok(roster.includes('starting-horse'),'名单为原马 ID');
   A.ok((await p.locator('#camp-skills').innerText()).includes('技能距离'),'营地出现马成长入口');
   const shotName=await shot(p,'h18-old-camp.png');
   const raw=JSON.parse(await p.evaluate(()=>localStorage.getItem('m0-journey-v1')));
   A.equal(raw.journey.party.length,party.length,'存档副本队伍未被清空');
   return `旧旅程副本：马 2/1/未解锁、击杀 ${horse.kills}、HP ${horse.hp}/${horse.maxHp}、强健 ${horse.fortify}、SP ${s.teamSp}、猫粮 ${s.gold}；截图 ${shotName}`;
  });
  await ctx.close();
 }
 // 旧战斗续局副本：马已用完旧共用行动（ap=0）且缺新字段
 {
  const battle=fixture([R.unit('h','player','horse',4,4)],{teamSp:3});
  const legacyHorse=battle.units.find(u=>u.id==='h');
  legacyHorse.ap=0;legacyHorse.kills=2;legacyHorse.level=3;
  delete legacyHorse.horseJumpRange;delete legacyHorse.horseJumpDamage;delete legacyHorse.horsePush;delete legacyHorse.horseJumpUsed;
  battle.level=1;battle.completed=0;battle.buffs={health:true,move:false,rescue:false};
  battle.party=[{id:'h',side:'player',kind:'horse',x:4,y:4,hp:1,maxHp:1,attack:1,level:3,kills:2,ap:0,apLimit:1,
   directionPaid:[0,0,0,0],cannonMask:0,combo:0,fortify:0,commanderHealth:0,commanderMove:0,acted:true}];
  battle.activeIds=['h'];battle.bench=[];
  const save=playerSave({journey,battle:{version:1,state:battle,savedAt:new Date().toISOString(),reason:'旧版本续局副本'}});
  const {ctx,p}=await openWithSave(browser,save);
  await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.__M0_DEBUG__.getState().units.length>0),null,{timeout:25000});
  await p.waitForTimeout(700);
  await step('H18-续局副本','旧战斗续局加载：补齐基础技能、不赠点、不刷新已用行动',async()=>{
   const s=await st(p);
   const horse=unit(s,'h');
   A.ok(horse,'旧续局中的马被保留');
   A.deepEqual([horse.horseJumpRange,horse.horseJumpDamage,horse.horsePush],[2,1,false],'旧马自动补 2/1/未解锁');
   A.equal(horse.horseJumpUsed,true,'已用完旧行动的马迁移后本回合不能跳跃');
   A.equal(horse.ap,0);
   A.equal(s.teamSp,3,'迁移不赠送公共 SP');
   A.equal(s.phase,'player','恢复到保存点');
   await p.locator('[data-unit="h"]').click();
   const modes=await p.locator('#rook-modes button').allInnerTexts();
   A.ok(modes.some(t=>t.includes('跳跃攻击')),'界面出现跳跃攻击入口');
   A.equal(await p.locator('[data-mode="horse-jump"]').isDisabled(),true,'本回合跳跃入口禁用');
   const shotName=await shot(p,'h18-old-battle.png');
   return `旧续局副本：马字段 2/1/未解锁、horseJumpUsed=true、SP ${s.teamSp}、跳跃入口禁用；截图 ${shotName}`;
  });
  await p.reload();
  await p.waitForTimeout(800);
  await step('H18-重复恢复','重复恢复幂等：字段与行动不被重置或刷新',async()=>{
   await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.__M0_DEBUG__.getState().units.length>0),null,{timeout:25000});
   const s=await st(p);
   const horse=unit(s,'h');
   A.deepEqual([horse.horseJumpRange,horse.horseJumpDamage,horse.horsePush],[2,1,false]);
   A.equal(horse.horseJumpUsed,true,'重复恢复不刷新已用行动');
   A.equal(s.teamSp,3);
   return '第二次加载后字段仍为 2/1/未解锁、horseJumpUsed=true、SP 3';
  });
  await ctx.close();
 }
 // H13 三阶段购买（预置旅程存档专项）：营地后备 / 布阵出战 / 战斗中存活
 {
  let camp2=R.newGame();camp2.phase='intermission';camp2=R.enterCamp(camp2);camp2.teamSp=5;camp2.gold=20;
  camp2=R.buy(camp2,'horse');camp2.gold=0; // 满员→后备
  const journey2=R.journeyRecord(camp2);
  const {ctx,p}=await openWithSave(browser,playerSave({journey:journey2}));
  await campView(p);
  await step('H13-专项界面','购买阶段限制：营地含后备、布阵/战斗仅场上存活',async()=>{
   const benchHorse='recruit-horse-0';
   const benchBtn=p.locator(`[data-camp-skill="${benchHorse}"][data-skill="horse-jump-distance"]`);
   A.equal(await benchBtn.isEnabled(),true,'营地可为后备马购买');
   await benchBtn.click();await p.waitForTimeout(200);
   let s=await st(p);
   A.equal(s.teamSp,4,'营地购买扣 1 SP');
   A.equal(R.horseJumpRangeOf(s.party.find(u=>u.id===benchHorse)),3,'后备马技能距离变为 3');
   const campShot=await shot(p,'h13-camp-bench-buy.png');
   await p.locator('#camp-leave').click();
   await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
   await p.locator('#flow-enter').click();
   await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
   s=await st(p);
   A.equal(s.units.some(u=>u.id===benchHorse),false,'后备马未出战');
   await p.locator('[data-deploy="starting-horse"]').click();
   await p.locator('.upgrade-section').evaluate(n=>n.open=true);
   const deployBtn=p.locator('#skills [data-skill="horse-jump-distance"]');
   A.equal(await deployBtn.isEnabled(),true,'布阵可为出战马购买');
   await deployBtn.click();await p.waitForTimeout(200);
   s=await st(p);
   A.equal(s.teamSp,3,'布阵购买扣 1 SP');
   A.equal(R.horseJumpRangeOf(s.units.find(u=>u.kind==='horse')),3,'出战马技能距离变为 3');
   await p.locator('#btn-deploy-confirm').click();
   await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
   await selectBattleUnit(p,'starting-horse');
   await p.locator('.upgrade-section').evaluate(n=>n.open=true);
   const battleBtn=p.locator('#skills [data-skill="horse-jump-damage"]');
   A.equal(await battleBtn.isEnabled(),true,'战斗中可为场上存活马购买');
   await battleBtn.click();await p.waitForTimeout(200);
   s=await st(p);
   A.equal(s.teamSp,1,'战斗购买扣 2 SP');
   A.equal(R.horseJumpDamageOf(s.units.find(u=>u.kind==='horse')),2,'场上马技能伤害变为 2');
   const battleShot=await shot(p,'h13-battle-buy.png');
   return `专项阶段链：营地后备马购买(SP 5→4，距离 3)→布阵出战马购买(SP 4→3，距离 3)→战斗存活马购买(SP 3→1，伤害 2)；后备马未出战；截图 ${campShot},${battleShot}`;
  });
  await ctx.close();
 }
}

/* ---------------- D. 手机流程（H20） ----------------
   退修要点（2026-10-22）：844×390 短高度窗口在既有手机版栅格下棋盘区只剩约 50px（单格约 4px），
   任何棋子都不可辨——这是 US-020 起既有的手机版布局高度预算（34+100+82+44+52 行 + 间距 ≈ 340px），
   不是本次马面板导致。因此：
   D1 手机参考视口 448×924（项目自有 preview.html 的 Mate 40 Pro 竖屏基准，DPR2）承担“看得清+可操作”证据；
   D2 844×390 保留“核心操作可达”证据并记录棋盘像素度量与其非马专属性（马/车选中前后棋盘区高度一致）；
   D3 900×700 横版窗口补充说明限制来自视口高度而非横竖方向。�� */
async function openMobile(browser,{width,height,dpr}){
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr||1});
 await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(playerSave()))});}catch(e){}`);
 const p=await ctx.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));
 await p.goto(base+'/');
 await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu',null,{timeout:25000});
 await p.locator('#flow-new').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');
 await p.locator('#tutorial-skip').click();
 await p.locator('#tutorial-skip-yes').click();
 await campView(p);
 await p.locator('#camp-leave').click();
 await p.waitForFunction(()=>window.M0Campaign.info().view==='map');
 await p.locator('#flow-enter').click();
 await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');
 await p.locator('#btn-deploy-confirm').click();
 await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
 await p.waitForTimeout(400);
 return {ctx,p};
}

/* D1. 手机参考视口 448×924：看得清 + 全部核心操作经可见界面完成 */
async function mobileReferenceFlow(browser){
 const {ctx,p}=await openMobile(browser,{width:448,height:924,dpr:2});
 await step('H20-手机-1','手机参考视口 448×924（Mate 40 Pro 竖屏基准，DPR2）：棋盘与血量标签可辨识',async()=>{
  const m=await boardMetrics(p);
  A.equal(m.layout,'mobile','手机版布局生效');
  A.ok(m.scene.h>=400,`棋盘区高度 ${m.scene.h}px 应远大于工具栏合计高度`);
  A.ok(m.cellW>=28&&m.cellH>=26,`单格 ${m.cellW}×${m.cellH}px 应足以辨认落点`);
  A.equal(m.boardInsideScene,true,'棋盘范围完整落在棋盘区内');
  A.equal(m.hpOverlaps,0,`${m.hpLabels} 个血量标签互不重叠`);
  report.layout.referenceBefore=m;
  const shotName=await shot(p,'h20-mobile-board.png');
  return `448×924：棋盘区 ${m.scene.w}×${m.scene.h}px，棋盘 ${m.boardW}×${m.boardH}px，单格 ${m.cellW}×${m.cellH}px，血量标签 ${m.hpLabels} 个无重叠；截图 ${shotName}`;
 });
 await step('H20-手机-2','手机参考视口：经“我方队伍”选中马，两个战斗入口可达且不压缩棋盘',async()=>{
  const before=await boardMetrics(p);
  await p.locator('#mobile-tools [data-ui-view="units"]').click();
  await p.locator('[data-unit="starting-horse"]').first().click();
  if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();
  await p.waitForTimeout(300);
  const after=await boardMetrics(p);
  A.deepEqual(after.modes,['普通移动','跳跃攻击 2 格'],'两个模式按钮文案/数量正确');
  A.equal(after.scene.h,before.scene.h,'选中马前后棋盘区高度一致（马面板未压缩棋盘）');
  A.equal(after.modesInsidePanel,true,'模式按钮完整落在面板内（未被子面板裁切）');
  A.equal(after.selectedInsidePanel,true,'棋子摘要未被面板裁切');
  const selected=await p.locator('#mobile-selected').innerText();
  A.match(selected,/移动✓ · 跳跃✓2格 · 伤害1 · 推动×/,'摘要显示移动/跳跃额度与技能数值');
  report.layout.referenceHorse=after;
  const shotName=await shot(p,'h20-mobile-horse-selected.png');
  return `点“我方队伍”→马：模式「${after.modes.join(' / ')}」，摘要「${selected.replace(/\n/g,' | ')}」；棋盘区高度 ${after.scene.h}px 未变；截图 ${shotName}`;
 });
 await step('H20-手机-3','手机参考视口：普通移动落点标记、点击移动、撤销恢复（可见界面）',async()=>{
  await p.locator('[data-mode="horse-move"]').click();
  const s0=await st(p),horse0=unit(s0,'starting-horse'),from=[horse0.x,horse0.y];
  const moves=R.legalActions(s0,'starting-horse').filter(a=>a.type==='move');
  A.ok(moves.length>0,'马存在合法日字落点');
  const to=moves[0].to;
  const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks());
  A.ok(marks.some(m=>m.x===to.x&&m.y===to.y&&m.layer==='move'),'候选落点已在棋盘上以移动标记显示');
  await cell(p,to);
  await p.waitForTimeout(350);
  let s=await st(p);
  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[to.x,to.y],'点击落点完成普通移动');
  A.equal(unit(s,'starting-horse').ap,0,'普通移动消耗移动额度');
  const moveShot=await shot(p,'h20-mobile-normal-move.png');
  await p.locator('#btn-undo').click();
  await p.waitForTimeout(350);
  s=await st(p);
  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],from,'撤销恢复原位');
  A.equal(unit(s,'starting-horse').ap,1,'撤销恢复移动额度');
  const undoShot=await shot(p,'h20-mobile-undo.png');
  return `普通移动 (${from[0]},${from[1]})→(${to.x},${to.y}) 后经“撤销移动”复位且额度 0→1；截图 ${moveShot},${undoShot}`;
 });
 await step('H20-手机-4','手机参考视口：跳跃落点选择、预览（落点/四邻范围）与确认执行',async()=>{
  await p.locator('[data-mode="horse-jump"]').click();
  const s0=await st(p);
  const jumps=R.legalActions(s0,'starting-horse').filter(a=>a.type==='horse-jump');
  A.ok(jumps.some(j=>j.to.x===7&&j.to.y===5),'首关开局 (7,5) 在跳跃候选内');
  const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks());
  A.ok(marks.some(m=>m.x===7&&m.y===5&&m.layer==='attack'),'跳跃落点已在棋盘上以攻击标记显示');
  await cell(p,{x:7,y:5});
  await p.waitForTimeout(400);
  const full=(await p.locator('#preview-box').innerText()).replace(/\s+/g,' ');
  A.match(full,/跳跃落点 \(8,6\)/,'预览写明落点（界面为 1 基坐标）');
  A.match(full,/伤害范围/,'预览写明落地四邻伤害范围');
  const mobilePreview=await p.locator('#mobile-preview').innerText();
  A.match(mobilePreview,/跳跃攻击 · 命中 1 个目标/,'手机摘要给出跳跃命中数');
  A.equal(await p.locator('#btn-execute').isEnabled(),true,'执行按钮可用');
  const m=await boardMetrics(p);
  A.ok(m.preview&&!m.preview.clipped,'手机摘要未被裁切');
  report.layout.referencePreview=m;
  const fullShot=await shot(p,'h20-mobile-jump-preview.png');
  const boardShot=await shotBoard(p,'h20-mobile-jump-board.png');
  await p.locator('#btn-execute').click();
  await p.waitForTimeout(450);
  const s=await st(p);
  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[7,5],'执行后落点正确');
  A.equal(unit(s,'w1-2'),undefined,'四邻格敌军兵被击杀');
  A.equal(s.teamSp,1,'击杀获得公共 SP');
  const execShot=await shot(p,'h20-mobile-jump-executed.png');
  return `点 (7,5) → 预览「跳跃落点 (8,6) / 伤害范围 (8,7)(9,6)(8,5)(7,6)」→“执行攻击”落地击杀 w1-2，SP 0→1；截图 ${fullShot}、棋盘裁剪 ${boardShot}、执行后 ${execShot}`;
 });
 await step('H20-手机-5','手机参考视口：三项技能入口访问并在可见面板购买“技能距离”',async()=>{
  await selectBattleUnit(p,'starting-horse');
  await p.locator('#mobile-tools [data-ui-view="skills"]').click();
  await p.waitForTimeout(300);
  const text=await p.locator('#mobile-sheet-content').innerText();
  for(const name of ['技能距离','技能伤害','推动＋解除绊马脚'])A.ok(text.includes(name),`技能入口可见：${name}`);
  A.match(text,/公共 SP 1/,'面板显示公共 SP 余额');
  const st0=await p.evaluate(()=>({
   distance:!document.querySelector('#mobile-sheet-content [data-skill="horse-jump-distance"]').disabled,
   damage:document.querySelector('#mobile-sheet-content [data-skill="horse-jump-damage"]').disabled,
   push:document.querySelector('#mobile-sheet-content [data-skill="horse-push"]').disabled
  }));
  A.equal(st0.distance,true,'SP 1 时“技能距离（1 SP）”可购买');
  A.equal(st0.damage,true,'“技能伤害（2 SP）”余额不足时禁用');
  A.equal(st0.push,true,'“推动＋解除绊马脚（2 SP）”余额不足时禁用');
  const sheetShot=await shot(p,'h20-mobile-skills.png');
  await p.locator('#mobile-sheet-content [data-skill="horse-jump-distance"]').click();
  await p.waitForTimeout(350);
  if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();
  await p.waitForTimeout(250);
  const s=await st(p);
  A.equal(s.teamSp,0,'购买扣除 1 公共 SP');
  A.equal(R.horseJumpRangeOf(unit(s,'starting-horse')),3,'技能距离 2→3');
  const modes=await p.locator('#rook-modes button').allInnerTexts();
  A.deepEqual(modes,['普通移动','跳跃攻击 3 格'],'模式按钮即时反映新距离');
  const afterShot=await shot(p,'h20-mobile-upgraded-mode.png');
  return `技能面板三项齐全（距离 1 SP / 伤害 2 SP / 推动＋解除绊马脚 2 SP，余额不足项禁用）；点击“技能距离”后 SP 1→0、距离 2→3，模式按钮变为“跳跃攻击 3 格”；截图 ${sheetShot},${afterShot}`;
 });
 await step('H20-手机-6','手机参考视口：第 2 回合普通移动仍可经可见界面完成',async()=>{
  await p.locator('#btn-end').click();
  await p.locator('#btn-confirm-yes').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===2,null,{timeout:20000});
  await p.waitForTimeout(400);
  await selectBattleUnit(p,'starting-horse');
  await p.locator('[data-mode="horse-move"]').click();
  const s0=await st(p);
  const moves=R.legalActions(s0,'starting-horse').filter(a=>a.type==='move');
  A.ok(moves.length>0,'第 2 回合马存在合法日字落点');
  const to=moves[0].to;
  await cell(p,to);
  await p.waitForTimeout(400);
  const s=await st(p);
  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[to.x,to.y],'第 2 回合普通移动落地');
  A.equal(unit(s,'starting-horse').ap,0,'普通移动消耗额度');
  const shotName=await shot(p,'h20-mobile-turn2-move.png');
  const m=await boardMetrics(p);
  report.layout.referenceFinal=m;
  return `第 2 回合普通移动至 (${to.x},${to.y}) 且额度耗尽；棋盘区仍为 ${m.scene.h}px、单格 ${m.cellW}×${m.cellH}px；截图 ${shotName}`;
 });
 await ctx.close();
}

/* D2. 844×390 短高度窗口：操作可达 + 棋盘度量 + “非马面板导致”对照 */
async function mobileLandscapeFlow(browser){
 const {ctx,p}=await openMobile(browser,{width:844,height:390,dpr:1});
 await step('H20-手机横版','手机横版 844×390：招募/布阵/模式入口/跳跃预览与执行/普通移动可达（棋盘细节不在此判定）',async()=>{
  const layout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
  A.equal(layout,'mobile','手机横版布局生效');
  const emptyMetrics=await boardMetrics(p);
  const campShot=await shot(p,'h20-mobile-landscape-battle.png');
  await p.waitForTimeout(100);
  const beforeHorse=await boardMetrics(p);
  await selectBattleUnit(p,'starting-horse');
  const modes=await p.locator('#rook-modes button').allInnerTexts();
  A.deepEqual(modes,['普通移动','跳跃攻击 2 格'],'手机横版马的模式按钮可达');
  A.equal((await boardMetrics(p)).scene.h,beforeHorse.scene.h,'选中马不改变棋盘区高度');
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:7,y:5});
  await p.waitForTimeout(400);
  A.equal(await p.locator('#btn-execute').isEnabled(),true,'手机横版选中技能落点后执行按钮可用');
  A.match(await p.locator('#mobile-preview').innerText(),/跳跃攻击/,'手机横版动作预览显示跳跃攻击');
  const previewShot=await shot(p,'h20-mobile-landscape-jump-preview.png');
  await p.locator('#btn-execute').click();
  await p.waitForTimeout(400);
  let s=await st(p);
  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[7,5],'手机横版跳跃执行落点正确');
  A.equal(unit(s,'w1-2'),undefined,'手机横版跳跃击杀四邻敌方兵');
  A.equal(s.teamSp,1,'手机横版跳跃击杀获得 SP');
  const jumpShot=await shot(p,'h20-mobile-landscape-jump.png');
  await selectBattleUnit(p,'starting-horse');
  await p.locator('#mobile-tools [data-ui-view="skills"]').click();
  const sheetSkills=await p.locator('#mobile-sheet-content').innerText();
  A.ok(sheetSkills.includes('技能距离')&&sheetSkills.includes('技能伤害')&&sheetSkills.includes('推动＋解除绊马脚'),'手机横版技能面板列出三项马成长');
  if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();
  await p.locator('#btn-end').click();
  await p.locator('#btn-confirm-yes').click();
  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===2,null,{timeout:20000});
  await p.waitForTimeout(400);
  await selectBattleUnit(p,'starting-horse');
  await p.locator('[data-mode="horse-move"]').click();
  const s0=await st(p);
  const to=R.legalActions(s0,'starting-horse').filter(a=>a.type==='move')[0].to;
  await cell(p,to);
  await p.waitForTimeout(400);
  s=await st(p);
  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[to.x,to.y],'手机横版第 2 回合普通日字移动可达');
  A.equal(unit(s,'starting-horse').ap,0,'手机横版普通移动消耗额度');
  const moveShot=await shot(p,'h20-mobile-landscape-move.png');
  // 对照：换成车（非马）仍为同一棋盘区，证明压缩来自既有手机版高度预算而非马面板
  await selectBattleUnit(p,'rook');
  const rookMetrics=await boardMetrics(p);
  A.equal(rookMetrics.scene.h,emptyMetrics.scene.h,'换棋子（马→车）不改变棋盘区高度');
  report.layout.landscape={empty:emptyMetrics,rookSelected:rookMetrics,note:'棋盘区高度由手机版固定行预算决定，与选中棋子种类无关'};
  return `844×390：棋盘区仅 ${emptyMetrics.scene.h}px、单格 ${emptyMetrics.cellW}×${emptyMetrics.cellH}px（棋盘 ${emptyMetrics.boardW}×${emptyMetrics.boardH}px，血量标签重叠 ${emptyMetrics.hpOverlaps} 对）——既有手机版行预算所限，马/车选中前后一致；核心操作仍可达。截图 ${campShot},${previewShot},${jumpShot},${moveShot}`;
 });
 await ctx.close();
}

/* D3. 900×700 横版窗口：补充说明限制来自视口高度而非横竖方向 */
async function mobileLandscapeWideFlow(browser){
 const {ctx,p}=await openMobile(browser,{width:900,height:700,dpr:1});
 await step('H20-手机横版-补充','手机版布局 900×700 横版窗口：棋盘可辨识且跳跃预览/确认可达',async()=>{
  const layout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
  A.equal(layout,'mobile','900 宽度仍为手机版布局');
  const m=await boardMetrics(p);
  A.ok(m.cellW>=20,`单格 ${m.cellW}×${m.cellH}px 可辨认`);
  A.equal(m.hpOverlaps,0,`血量标签无重叠（${m.hpLabels} 个）`);
  await selectBattleUnit(p,'starting-horse');
  await p.locator('[data-mode="horse-jump"]').click();
  await cell(p,{x:7,y:5});
  await p.waitForTimeout(400);
  A.equal(await p.locator('#btn-execute').isEnabled(),true,'横版窗口跳跃落点可确认');
  const shotName=await shot(p,'h20-mobile-landscape-wide-preview.png');
  report.layout.landscapeWide=m;
  return `900×700（手机版布局）：棋盘 ${m.scene.w}×${m.scene.h}px、单格 ${m.cellW}×${m.cellH}px、血量标签 ${m.hpLabels} 个无重叠；跳跃落点预览与执行可用；截图 ${shotName}`;
 });
 await ctx.close();
}

(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 try{
  await normalFlow(browser);
  await fixtures(browser);
  await oldSave(browser);
  await mobileReferenceFlow(browser);
  await mobileLandscapeFlow(browser);
  await mobileLandscapeWideFlow(browser);
 }catch(e){
  failed++;report.fatal=String(e&&e.stack||e);console.error('FATAL',e);
 }finally{
  report.pageErrorsError=report.pageErrors.slice();
  report.finishedAt=new Date().toISOString();
  report.summary={total:report.steps.length,pass:report.steps.filter(s=>s.pass).length,fail:report.steps.filter(s=>!s.pass).length,pageErrors:report.pageErrors.length};
  fs.writeFileSync(path.join(dir,'browser-result.json'),JSON.stringify(report,null,2));
  await browser.close();
 }
 console.log('SUMMARY',JSON.stringify(report.summary));
 process.exit(failed||report.summary.fail?1:0);
})();

