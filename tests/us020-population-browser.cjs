// US-020 R04（2026-10-21 再确认）普通队友持有数量、部署人口与招募：P01～P08 浏览器验收。
// 正常入口仅一条真实链路：菜单→实际完成教学→主营地→真实招募/换人→进入第一关布阵；
// 其余人数/余额/存档/失败重试边界使用独立上下文预置旅程存档（专项夹具，结果中明确标注）。
// 双横版：1280×720 网页版、844×390 手机横版，核对人口文字、按钮与名单可读可操作。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const dir=path.resolve(process.env.M0_EVIDENCE_DIR||'docs/us/us020-evidence-r5-population');fs.mkdirSync(dir,{recursive:true});
const files=['web/index.html','web/js/rules.js','web/js/app.js','web/js/campaign.js','web/js/journey.js','tests/us020-camp.test.cjs','tests/us020-population-browser.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const results=[],shots=[],pageErrors=[];let browser;
const record=(id,type,ok,detail,evidence)=>{if(!evidence)throw Error(`证据不能为空：${id}`);results.push({id,type,result:ok?'通过':'失败',detail,evidence});console.log(`${ok?'PASS':'FAIL'} ${id} · ${type}`);};
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
const info=p=>p.evaluate(()=>window.M0Campaign.info());
const view=p=>p.evaluate(()=>window.M0Campaign.info().view);
async function shot(p,name){await p.screenshot({path:path.join(dir,name)});shots.push(name);return name;}
function evidenceJSON(name,data){const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(data,null,2));return name;}
const waitView=(p,t)=>p.waitForFunction(t=>window.M0Campaign&&window.M0Campaign.info().view===t,t,{timeout:20000});
const cell=async(p,to)=>{const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.click(xy.x,xy.y);};
const selectUnit=(p,id)=>p.locator(`[data-unit="${id}"]`).click({timeout:8000});
const saved=p=>p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('m0-journey-v1'));}catch(e){return null;}});
const campText=p=>p.locator('#camp-summary').innerText();
const rosterHint=p=>p.locator('#camp-roster-hint').innerText();
const banner=p=>p.locator('#banner').innerText();
const counts=(state)=>({total:state.party.filter(u=>u.kind!=='advisor'&&u.kind!=='king').length,active:R.activeOrdinary(state).length,advisors:state.party.filter(u=>u.kind==='advisor').length,limit:R.populationLimit(state)});
const plain=s=>s.replace(/\s+/g,' ');
const num=s=>s.replace(/[\s：:]/g,'');

// 专项夹具：预置旅程存档，不预置猫粮以外的战斗收益，不改用户旧局（独立上下文）。
function journeySave(state,flags){return JSON.stringify({version:1,player:Object.assign({tutorialCompleted:true,campGuideSeen:true},flags||{}),journey:R.journeyRecord(state),battle:null});}
function baseState(gold=0){let s=R.newGame();s.phase='intermission';s.firstEntryRewarded=true;s.buffs={health:true,move:false,rescue:false};s.gold=gold;return s;}
// P01/P07 通用夹具：持有 7、上阵 4、后备 3、部署上限 4。
function sevenHeld(gold=0){let s=baseState(gold);s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='starting-horse'));for(let i=0;i<3;i++)s=R.buy(s,'pawn');s.gold=gold;return s;}
async function newContext(save,viewport){const ctx=await browser.newContext({viewport:viewport||{width:1280,height:720}});ctx.on('page',p=>{p.setDefaultNavigationTimeout(60000);p.setDefaultTimeout(45000);p.on('pageerror',e=>pageErrors.push({url:p.url(),message:e.message}));});if(save)await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);return ctx;}
async function open(ctx){const p=await ctx.newPage();await p.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view!=='loading',null,{timeout:60000});return p;}
const dismissGuide=async p=>{if(await p.locator('#camp-guide').isVisible()){await p.locator('#camp-guide-close').click();await p.waitForTimeout(60);}};
// 元素可读可点：滚动到可见、视口内完整显示、中心命中自身（缩放后的实际视觉坐标）。
async function reachable(p,sel){const loc=p.locator(sel).first();await loc.scrollIntoViewIfNeeded();const box=await loc.boundingBox();const hit=await p.evaluate(s=>{const el=document.querySelector(s);if(!el)return{found:false};const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,at=document.elementFromPoint(x,y);return{found:true,inside:r.left>=0&&r.top>=0&&r.right<=window.innerWidth&&r.bottom<=window.innerHeight,hit:!!at&&(el===at||el.contains(at)),disabled:!!el.disabled,rect:{left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom)},viewport:{w:window.innerWidth,h:window.innerHeight}};},sel);return Object.assign({},hit,{box});}

// 与既有 US-020 验收相同的真实教学操作序列（首次教学无跳过捷径）。
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
 return{skipDisabled,overlay,reward};
}

(async()=>{
 browser=await pw.chromium.launch({headless:true});
 try{
  /* ---------- P01/P02/P07刷新/P08首次指引：正常入口真实招募 ---------- */
  const c1=await newContext();const p1=await open(c1);
  const tut=await runTutorial(p1);
  A.equal(tut.skipDisabled,true,'首次教学无跳过捷径');
  A.equal(tut.overlay,true,'教学完成提示出现');
  A.equal(await view(p1),'camp','完成后先进入主营地');
  const guideVisible=await p1.locator('#camp-guide').isVisible();
  const guideText=plain(await p1.locator('#camp-guide').innerText());
  A.equal(guideVisible,true,'首次入营自动显示指引');
  for(const kw of ['队友总数','部署人口','部署上限 +1 · 5猫粮','最高 8','有空余部署名额','进入后备','主帅与仕'])A.ok(guideText.includes(kw),`指引解释人口概念：${kw}`);
  const guideShot=await shot(p1,'p08-first-guide.png');
  await p1.locator('#camp-guide-close').click();await p1.waitForTimeout(60);
  const before=await st(p1);
  A.equal(before.gold,tut.reward+8,'首营猫粮＝教学实得＋8');
  A.equal(R.populationLimit(before),4,'初始部署上限 4');
  A.equal(R.activeOrdinary(before).length,4,'初始上阵普通队友 4');
  let text=plain(await campText(p1));
  A.ok(num(text).includes('队友总数4（其中后备0）'),'初始队友总数 4（其中后备 0）');
  A.ok(num(text).includes('部署人口4／4'),'初始部署人口 4／4');
  A.ok(/主帅1·自动上场/.test(num(text)),'主帅单独显示且不计入');
  A.ok(num(text).includes('仕0/2座'),'仕单独显示（0/2 座）');
  A.ok(/部署上限 \+1 · 5猫粮/.test(await p1.locator('#camp-growth').innerText()),'按钮文案：部署上限 +1 · 5猫粮');
  const campStartShot=await shot(p1,'p01-camp-start.png');

  // 真实操作：换下 1 人（空出部署名额）→ 招募 3 名普通兵（自然猫粮 9→6→3→0）
  await p1.locator('[data-camp-roster="starting-horse"]').click();await p1.waitForTimeout(80);
  const afterBench=await st(p1);
  A.equal(R.activeOrdinary(afterBench).length,3,'换下 1 人后上阵 3');
  A.equal(afterBench.bench.length,1,'后备 1');
  A.equal(afterBench.gold,before.gold,'换人不扣猫粮');
  const activeBeforeRecruit=R.activeOrdinary(afterBench).slice();

  await p1.locator('[data-recruit="pawn"]').click();await p1.waitForTimeout(80);
  const rec1=await st(p1);
  A.equal(rec1.gold,6,'招募兵扣 3 猫粮（9→6）');
  A.equal(R.activeOrdinary(rec1).length,4,'有空位时新招募默认上阵');
  A.ok(rec1.activeIds.includes('recruit-pawn-0'),'新招募计入上阵名单');
  A.deepEqual(R.activeOrdinary(rec1).slice(0,activeBeforeRecruit.length),activeBeforeRecruit,'不替换原有上阵队友');
  text=plain(await campText(p1));
  A.ok(num(text).includes('队友总数5（其中后备1）'),'空位招募后队友总数 5（其中后备 1）');
  A.ok(num(text).includes('部署人口4／4'),'空位招募后部署人口 4／4');

  await p1.locator('[data-recruit="pawn"]').click();await p1.waitForTimeout(80);
  const rec2=await st(p1);
  A.equal(rec2.gold,3,'第二次招募 6→3');
  A.deepEqual(rec2.activeIds,rec1.activeIds,'满员招募不替换任何已上阵队友');
  A.ok(rec2.bench.includes('recruit-pawn-1'),'满员招募进入后备');

  await p1.locator('[data-recruit="pawn"]').click();await p1.waitForTimeout(80);
  const rec3=await st(p1);
  A.equal(rec3.gold,0,'第三次招募 3→0');
  A.deepEqual(rec3.activeIds,rec1.activeIds,'满员后仍不替换上阵名单');
  A.equal(rec3.bench.length,3,'后备 3');
  text=plain(await campText(p1));
  A.ok(num(text).includes('队友总数7（其中后备3）'),'显示「队友总数：7（其中后备3）」');
  A.ok(num(text).includes('部署人口4／4'),'显示「部署人口：4／4」');
  A.ok(num(text).includes('主帅1·自动上场'),'主帅单独显示');
  A.ok(num(text).includes('仕0/2座'),'仕单独显示');
  A.notEqual(R.populationLimit(rec3),7,'部署上限仍为 4，不被持有数撑大');
  const rosterText=plain(await p1.locator('#camp-roster').innerText());
  A.equal((rosterText.match(/上阵 ·/g)||[]).length,4,'名单上阵 4 名普通队友');
  A.equal((rosterText.match(/后备 ·/g)||[]).length,3,'名单后备 3 名普通队友');
  const sevenShot=await shot(p1,'p01-camp-seven.png');
  const sevenEvidence=evidenceJSON('p01-camp-seven.json',{gold:rec3.gold,population:R.populationLimit(rec3),activeOrdinary:R.activeOrdinary(rec3),bench:rec3.bench,party:rec3.party.map(u=>({id:u.id,kind:u.kind})),summary:plain(await campText(p1)),rosterHint:plain(await rosterHint(p1)),rosterText});
  record('P01','正常浏览器（真实教学+真实招募）',true,`独立上下文实际完成 7 步教学→主营地：初始部署上限 4、上阵 4；真实换下马后以自然猫粮 9 连续招募 3 名兵（9→6→3→0）。营地显示「队友总数：7（其中后备3）」「部署人口：4／4」，主帅与仕单独显示（仕 0/2 座），部署上限仍 4；名单上阵 4、后备 3。`,guideShot+','+campStartShot+','+sevenShot+','+sevenEvidence);

  // P02 汇总（同一真实链路）：空位默认上阵 / 满员进后备不替换
  record('P02','正常浏览器（真实招募）',true,`同一正常链路：换下马空出名额后招募 recruit-pawn-0 → 默认上阵且不改变原上阵顺序；随后两次招募（recruit-pawn-1/2）在上阵 4/4 满员时进入后备，activeIds 与满员时完全一致（${JSON.stringify(rec1.activeIds)}），未替换任何旧队友。`,sevenShot+','+sevenEvidence);

  // P07 刷新：营地显示与名单、部署上限一致恢复
  await p1.reload({waitUntil:'domcontentloaded'});await waitView(p1,'camp');
  const restored=await st(p1);
  A.equal(R.populationLimit(restored),4,'刷新后部署上限仍 4');
  A.equal(R.activeOrdinary(restored).length,4,'刷新后上阵仍 4');
  A.equal(restored.party.length-R.activeOrdinary(restored).length,3,'刷新后后备仍 3');
  A.deepEqual(restored.activeIds.slice().sort(),rec3.activeIds.slice().sort(),'刷新后上阵名单一致');
  text=plain(await campText(p1));
  A.ok(num(text).includes('队友总数7（其中后备3）'),'刷新后仍显示 7（其中后备 3）');
  A.ok(num(text).includes('部署人口4／4'),'刷新后仍显示 4／4');
  const refreshShot=await shot(p1,'p07-refresh-camp.png');
  const refreshEvidence=evidenceJSON('p07-refresh.json',{saved:await saved(p1),activeIds:restored.activeIds,bench:restored.bench,summary:plain(await campText(p1))});

  // P05 上限人数（同一正常链路）：4／4 可开战；布阵文案分别显示主帅/仕
  await p1.locator('#camp-leave').click();await waitView(p1,'map');
  await p1.locator('#flow-enter').click();await waitView(p1,'battle');
  const deploy=await st(p1);
  A.equal(deploy.phase,'deploy','进入第一关布阵');
  A.equal(deploy.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,4,'布阵上阵 4 名普通队友');
  const deployIds=deploy.units.filter(u=>u.side==='player').map(u=>u.id);
  A.ok(deployIds.includes('recruit-pawn-0'),'新招募的普通队友可用于下一关布阵（上阵 4 中的 recruit-pawn-0）');
  A.equal(deployIds.includes('recruit-pawn-1')||deployIds.includes('recruit-pawn-2'),false,'后备队友不自动带入布阵');
  const deployRosterIds=await p1.locator('#deploy-roster [data-deploy]').evaluateAll(els=>els.map(e=>e.dataset.deploy));
  A.ok(deployRosterIds.includes('recruit-pawn-0'),'布阵名单出现新招募队友');
  const deployPop=plain(await p1.locator('#deploy-population').innerText());
  A.ok(num(deployPop).includes('部署人口4／4'),'布阵显示「部署人口：4／4」');
  A.ok(deployPop.includes('主帅 1')&&deployPop.includes('仕 0 座'),'布阵单独显示主帅与仕数量');
  const deployShot=await shot(p1,'p01-deploy.png');
  await p1.locator('#btn-deploy-confirm').click();await p1.waitForTimeout(120);
  A.equal((await st(p1)).phase,'player','部署人口等于上限时允许开战');
  const deployEvidence=evidenceJSON('p01-deploy.json',{deployPopulation:deployPop,ordinaryOnBoard:4,deployIds,deployRosterIds,phase:(await st(p1)).phase,banner:await banner(p1)});
  record('P07','正常浏览器（刷新）',true,`同一旅程刷新后：部署上限 4、上阵 4、后备 3 与上阵名单全部恢复，营地仍显示「队友总数：7（其中后备3）」「部署人口：4／4」。`,refreshShot+','+refreshEvidence);
  record('P05','正常浏览器（上限人数）',true,`同一正常链路进入第一关布阵：上阵普通队友 4 名等于部署上限 4，布阵文案「部署人口：4／4」并单独显示主帅 1、仕 0 座；新招募的 recruit-pawn-0 已带入布阵名单，后备 recruit-pawn-1/2 未自动上阵；确认布阵后进入我方行动（允许等于上限）。`,deployShot+','+deployEvidence);
  await c1.close();

  /* ---------- P04 专项：5 猫粮只提高部署上限，不增加队友/赠棋 ---------- */
  const c2=await newContext(journeySave(baseState(10)));const p2=await open(c2);await waitView(p2,'camp');await dismissGuide(p2);
  const base4=await st(p2);
  const beforeIds={party:base4.party.map(u=>u.id),active:base4.activeIds.slice(),bench:base4.bench.slice()};
  A.equal(plain(await p2.locator('[data-camp-expand]').innerText()),'部署上限 +1 · 5猫粮','按钮文案「部署上限 +1 · 5猫粮」');
  await p2.locator('[data-camp-expand]').click();await p2.waitForTimeout(80);
  const exp1=await st(p2);
  A.equal(exp1.gold,5,'扩编扣 5 猫粮（10→5）');
  A.equal(R.populationLimit(exp1),5,'部署上限 4→5');
  A.deepEqual(exp1.party.map(u=>u.id),beforeIds.party,'不增加持有队友');
  A.deepEqual(exp1.activeIds,beforeIds.active,'不赠送棋子/不加上阵');
  A.deepEqual(exp1.bench,beforeIds.bench,'不改后备');
  text=plain(await campText(p2));
  A.ok(num(text).includes('队友总数4（其中后备0）'),'扩编后队友总数不变');
  A.ok(num(text).includes('部署人口4／5'),'扩编后部署人口 4／5');
  await p2.locator('[data-camp-expand]').click();await p2.waitForTimeout(80);
  const exp2=await st(p2);
  A.equal(exp2.gold,0,'第二次扩编 5→0');
  A.equal(R.populationLimit(exp2),6,'部署上限 5→6');
  A.deepEqual(exp2.party.map(u=>u.id),beforeIds.party,'第二次扩编仍不加队友');
  A.equal(await p2.locator('[data-camp-expand]').isDisabled(),true,'余额不足按钮禁用且保留文案');
  A.equal(plain(await p2.locator('[data-camp-expand]').innerText()),'部署上限 +1 · 5猫粮','禁用时仍显示价格');
  const p4Shot=await shot(p2,'p04-expand.png');
  const p4Evidence=evidenceJSON('p04-expand.json',{gold:exp2.gold,population:R.populationLimit(exp2),party:exp2.party.map(u=>u.id),activeIds:exp2.activeIds,bench:exp2.bench,summary:plain(await campText(p2)),expandText:plain(await p2.locator('[data-camp-expand]').innerText())});
  record('P04','专项（预置猫粮 10）',true,`专项夹具余额 10：连续两次点击「部署上限 +1 · 5猫粮」→ 余额 10→5→0、部署上限 4→5→6，持有队友/上阵/后备名单完全不变；余额不足按钮禁用但仍显示价格。`,p4Shot+','+p4Evidence);
  await c2.close();

  /* ---------- P03 专项：上限 8 仍可持有 9 名以上普通队友 ---------- */
  let ten=baseState(200);for(let i=0;i<4;i++)ten=R.expandPopulation(ten);for(let i=0;i<6;i++)ten=R.buy(ten,'pawn');ten.gold=5;
  const c3=await newContext(journeySave(ten));const p3=await open(c3);await waitView(p3,'camp');await dismissGuide(p3);
  const eight=await st(p3);
  A.equal(R.populationLimit(eight),8,'部署上限 8');
  A.equal(R.activeOrdinary(eight).length,8,'上阵 8');
  A.equal(eight.party.length-R.activeOrdinary(eight).length,2,'后备 2（持有 10）');
  text=plain(await campText(p3));
  A.ok(num(text).includes('队友总数10（其中后备2）'),'显示持有 10（其中后备 2）');
  A.ok(num(text).includes('部署人口8／8'),'显示部署人口 8／8');
  A.equal(await p3.locator('[data-camp-expand]').isDisabled(),true,'上限 8 后扩编按钮禁用');
  const active8=eight.activeIds.slice();
  await p3.locator('[data-recruit="pawn"]').click();await p3.waitForTimeout(80);
  const eleven=await st(p3);
  A.equal(eleven.gold,2,'招募兵扣 3（5→2）');
  A.equal(eleven.party.filter(u=>u.kind!=='advisor'&&u.kind!=='king').length,11,'持有 11 名普通队友');
  A.equal(R.activeOrdinary(eleven).length,8,'上阵仍 8');
  A.deepEqual(eleven.activeIds,active8,'满上限/满部署继续招募不替换上阵');
  A.equal(eleven.bench.length,3,'后备 3');
  text=plain(await campText(p3));
  A.ok(num(text).includes('队友总数11（其中后备3）'),'招募后显示持有 11（其中后备 3）');
  A.ok(num(text).includes('部署人口8／8'),'招募后部署人口仍 8／8');
  const p3Shot=await shot(p3,'p03-nine-held.png');
  const p3Evidence=evidenceJSON('p03-nine-held.json',{gold:eleven.gold,population:R.populationLimit(eleven),activeIds:eleven.activeIds,bench:eleven.bench,summary:plain(await campText(p3)),expandDisabled:await p3.locator('[data-camp-expand]').isDisabled()});
  record('P03','专项（预置上限 8）',true,`专项夹具部署上限 8、持有 10（上阵 8、后备 2）：营地显示「队友总数：10（其中后备2）」「部署人口：8／8」，扩编按钮禁用；继续招募 1 名兵后持有 11（后备 3），上阵名单与 8／8 完全不变。`,p3Shot+','+p3Evidence);
  await c3.close();

  /* ---------- P05 专项：0 人 / 超限拒绝，1 人允许 ---------- */
  // 0 人显示：旅程存档 activeIds 为空 → 营地显示部署人口 0／4（确认布阵需用下面的关卡续局夹具，因为
  // startLevel 对空 activeIds 会按“全员上阵”初始化；0 人不能来自正常入关，属构造边界）。
  const zeroState=baseState(0);zeroState.activeIds=[];zeroState.bench=zeroState.party.map(u=>u.id);
  const c4=await newContext(journeySave(zeroState));const p4=await open(c4);await waitView(p4,'camp');await dismissGuide(p4);
  A.equal(R.activeOrdinary(await st(p4)).length,0,'0 人专项：营地上阵 0');
  text=plain(await campText(p4));A.ok(num(text).includes('部署人口0／4'),'营地显示 0／4');
  const zeroCampShot=await shot(p4,'p05-zero-camp.png');
  await c4.close();
  // 0 人布阵拒绝：续局夹具直接把布阵局面改成 0 名普通队友，验证 UI 拒绝与提示。
  const zeroJourney=baseState(0);
  const zeroBoard=R.startLevel(zeroJourney,R.defaultMap());
  zeroBoard.units=zeroBoard.units.filter(u=>u.side==='enemy'||u.kind==='king');
  const zeroBattleSave=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:R.journeyRecord(zeroJourney),battle:{version:1,state:zeroBoard,savedAt:new Date().toISOString(),reason:'专项夹具：0 名普通队友布阵'}});
  const c4b=await newContext(zeroBattleSave);const p4b=await open(c4b);await waitView(p4b,'battle');
  await p4b.waitForTimeout(100);
  const zeroDeploy=await st(p4b);
  A.equal(zeroDeploy.phase,'deploy','0 人布阵续局恢复布阵');
  A.equal(zeroDeploy.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,0,'场上无普通队友');
  await p4b.locator('#btn-deploy-confirm').click();await p4b.waitForTimeout(120);
  const zeroBanner=await banner(p4b);
  A.ok(/至少部署 1 名普通队友/.test(zeroBanner),'0 名普通队友拒绝开战并提示');
  A.equal((await st(p4b)).phase,'deploy','仍停留在布阵');
  const zeroShot=await shot(p4b,'p05-zero.png');
  const zeroEvidence=evidenceJSON('p05-zero.json',{campSummary:text,deployText:plain(await p4b.locator('#deploy-population').innerText()),banner:zeroBanner,phase:(await st(p4b)).phase,zeroCampShot});
  record('P05','专项（构造 0 名普通队友）',true,`专项夹具上阵 0 名普通队友：营地显示「部署人口：0／4」；布阵续局中确认布阵被拒绝并提示「${zeroBanner}」，主帅不能代替这 1 名，仍停留在布阵。`,zeroCampShot+','+zeroShot+','+zeroEvidence);
  await c4b.close();

  let overState=baseState(20);overState=R.buy(overState,'pawn');overState=R.buy(overState,'pawn');
  overState.activeIds=overState.party.map(u=>u.id);overState.bench=[];
  const c5=await newContext(journeySave(overState));const p5=await open(c5);await waitView(p5,'camp');await dismissGuide(p5);
  A.equal(R.activeOrdinary(await st(p5)).length,6,'超限专项：营地上阵 6＞上限 4');
  await p5.locator('#camp-leave').click();await waitView(p5,'map');
  await p5.locator('#flow-enter').click();await waitView(p5,'battle');
  const overDeploy=await st(p5);
  A.equal(overDeploy.phase,'deploy','超限仍进入布阵但不得开战');
  await p5.locator('#btn-deploy-confirm').click();await p5.waitForTimeout(120);
  const overBanner=await banner(p5);
  A.ok(/超过部署人口/.test(overBanner),'超限拒绝开战并提示部署人口');
  A.equal((await st(p5)).phase,'deploy','超出部署人口仍停留在布阵');
  const overShot=await shot(p5,'p05-over.png');
  const overEvidence=evidenceJSON('p05-over.json',{onBoard:overDeploy.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,deployText:plain(await p5.locator('#deploy-population').innerText()),banner:overBanner,phase:(await st(p5)).phase});
  record('P05','专项（构造超出部署人口名单）',true,`专项夹具上阵 6 名普通队友／上限 4：布阵显示 6／4，确认被拒绝并提示「${overBanner}」，仍停留在布阵；1 人路径与等于上限路径由专项规则与正常链路覆盖。`,overShot+','+overEvidence);
  await c5.close();

  const oneState=baseState(0);oneState.activeIds=['starting-pawn'];oneState.bench=oneState.party.filter(u=>u.id!=='starting-pawn').map(u=>u.id);
  const c6=await newContext(journeySave(oneState));const p6=await open(c6);await waitView(p6,'camp');await dismissGuide(p6);
  await p6.locator('#camp-leave').click();await waitView(p6,'map');
  await p6.locator('#flow-enter').click();await waitView(p6,'battle');
  const oneDeploy=await st(p6);
  A.equal(oneDeploy.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,1,'1 名普通队友上阵');
  await p6.locator('#btn-deploy-confirm').click();await p6.waitForTimeout(150);
  const onePhase=(await st(p6)).phase;
  A.equal(onePhase,'player','不满编但至少 1 名普通队友允许开战');
  const oneShot=await shot(p6,'p05-one.png');
  const oneEvidence=evidenceJSON('p05-one.json',{onBoard:1,deployText:plain(await p6.locator('#deploy-population').innerText()),phase:onePhase});
  record('P05','专项（仅 1 名普通队友）',true,`专项夹具仅 1 名普通队友上阵：布阵显示 1／4，确认布阵后进入我方行动（允许不满编，但至少 1 名普通队友）。`,oneShot+','+oneEvidence);
  await c6.close();

  /* ---------- P06 专项：主帅与两座仕单独计数 ---------- */
  let withAdvisors=baseState(20);withAdvisors=R.buy(withAdvisors,'advisor');withAdvisors=R.buy(withAdvisors,'advisor');withAdvisors.gold=10;
  const c7=await newContext(journeySave(withAdvisors));const p7=await open(c7);await waitView(p7,'camp');await dismissGuide(p7);
  const adv=await st(p7);
  A.equal(adv.party.filter(u=>u.kind==='advisor').length,2,'两座仕');
  A.equal(adv.party.filter(u=>u.kind!=='advisor'&&u.kind!=='king').length,4,'普通队友总数不含仕');
  A.equal(R.activeOrdinary(adv).length,4,'仕不计入部署人口');
  text=plain(await campText(p7));
  A.ok(num(text).includes('队友总数4（其中后备0）'),'队友总数仍 4');
  A.ok(num(text).includes('部署人口4／4'),'部署人口仍 4／4');
  A.ok(num(text).includes('主帅1·自动上场'),'主帅单独显示');
  A.ok(num(text).includes('仕2/2座'),'仕单独显示 2/2 座');
  const advisorRecruit=await p7.locator('[data-recruit="advisor"]').isDisabled();
  A.equal(advisorRecruit,true,'仕满两座后招募按钮禁用');
  const rosterText7=plain(await p7.locator('#camp-roster').innerText());
  A.equal((rosterText7.match(/固定上阵 · 仕/g)||[]).length,2,'名单单独列出两座仕');
  await p7.locator('#camp-leave').click();await waitView(p7,'map');
  await p7.locator('#flow-enter').click();await waitView(p7,'battle');
  const advDeploy=await st(p7);
  A.equal(advDeploy.units.filter(u=>u.side==='player'&&u.kind==='advisor').length,2,'入关两座仕单独上阵');
  A.equal(advDeploy.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,4,'部署人口仍只算普通队友');
  const advDeployText=plain(await p7.locator('#deploy-population').innerText());
  A.ok(advDeployText.includes('主帅 1')&&advDeployText.includes('仕 2 座'),'布阵文案单独显示主帅 1 与仕 2 座');
  const p6Shot=await shot(p7,'p06-advisors.png');
  const p6Evidence=evidenceJSON('p06-advisors.json',{summary:plain(await campText(p7)),rosterText:rosterText7,advisorRecruitDisabled:advisorRecruit,deployText:advDeployText,onBoard:{ordinary:4,advisors:2,king:1}});
  record('P06','专项（预置两座仕）',true,`专项夹具两座仕：营地「队友总数：4（其中后备0）」「部署人口：4／4」保持不变，主帅 1 与仕 2/2 座单独显示，仕招募按钮禁用；入关后两座仕单独上阵，布阵文案「${advDeployText}」，均不计入部署人口。`,p6Shot+','+p6Evidence);
  await c7.close();

  /* ---------- P07 专项：失败重试恢复名单与部署上限 ---------- */
  let retryState=baseState(30);retryState=R.expandPopulation(retryState);retryState=R.expandPopulation(retryState);
  retryState=R.setActiveRoster(retryState,retryState.activeIds.filter(id=>id!=='starting-horse'));
  for(let i=0;i<4;i++)retryState=R.buy(retryState,'pawn');
  A.equal(R.populationLimit(retryState),6,'失败重试夹具部署上限 6');
  const levelBoard=R.startLevel(retryState,R.defaultMap());
  const dead=R.copy(levelBoard);dead.phase='result';dead.result='dead';
  const battleSave=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:R.journeyRecord(retryState),battle:{version:1,state:dead,savedAt:new Date().toISOString(),reason:'专项夹具：失败结算'}});
  const c8=await newContext(battleSave);const p8=await open(c8);await waitView(p8,'battle');
  await p8.waitForTimeout(150);
  A.equal(await p8.locator('#ov-result').isVisible(),true,'失败结算界面出现');
  A.equal(await p8.locator('#camp-guide').isVisible(),false,'关卡内不能回营');
  const deadShot=await shot(p8,'p07-failure.png');
  await p8.locator('#btn-restart-2').click();await p8.waitForTimeout(200);
  const retried=await st(p8);
  A.equal(retried.phase,'deploy','失败重试回到布阵');
  A.equal(R.populationLimit(retried),6,'失败重试恢复部署上限 6');
  A.equal(R.activeOrdinary(retried).length,6,'失败重试恢复上阵 6');
  A.equal(retried.party.length-R.activeOrdinary(retried).length,2,'失败重试恢复后备 2');
  A.deepEqual(retried.activeIds.slice().sort(),retryState.activeIds.slice().sort(),'失败重试上阵名单与入关时一致');
  const retriedDeployText=plain(await p8.locator('#deploy-population').innerText());
  A.ok(num(retriedDeployText).includes('部署人口6／6'),'布阵显示 6／6');
  const retryShot=await shot(p8,'p07-retry.png');
  const retryEvidence=evidenceJSON('p07-retry.json',{phase:retried.phase,population:R.populationLimit(retried),activeIds:retried.activeIds,bench:retried.bench,deployText:retriedDeployText});
  record('P07','专项（预置失败续局）',true,`专项夹具部署上限 6、持有 8（上阵 6、后备 2）的失败续局：加载后显示失败结算且不能回营；点击「从本关布阵重试」回到布阵，部署上限 6、上阵 6、后备 2 与入关名单一致，布阵显示 6／6。`,deadShot+','+retryShot+','+retryEvidence);
  await c8.close();

  /* ---------- P08 帮助重看 + 双横版关键 UI ---------- */
  for(const spec of [{mode:'desktop',viewport:{width:1280,height:720},shot:'p08-desktop.png'},{mode:'mobile',viewport:{width:844,height:390},shot:'p08-mobile.png'}]){
   const ctx=await newContext(journeySave(sevenHeld(20)),spec.viewport);const p=await ctx.newPage();
   p.setDefaultNavigationTimeout(60000);p.setDefaultTimeout(45000);
   await p.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});
   await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='camp',null,{timeout:60000});
   await dismissGuide(p);
   // 从菜单用实际「网页版/手机版」按钮切到目标显示模式，再返回营地。
   await p.locator('#camp-menu').click();await waitView(p,'menu');
   await p.locator(`[data-display-mode="${spec.mode}"]`).click();await p.waitForTimeout(180);
   const layout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
   A.equal(layout,spec.mode,`${spec.mode} 显示模式生效`);
   const viewport=await p.evaluate(()=>({w:innerWidth,h:innerHeight}));
   await p.locator('#flow-continue').click();await waitView(p,'map');
   await p.locator('#flow-back').click();await waitView(p,'camp');
   let summary=plain(await campText(p)),hint=plain(await rosterHint(p));
   A.ok(num(summary).includes('队友总数7（其中后备3）'),`${spec.mode} 队友总数：7（其中后备3）`);
   A.ok(num(summary).includes('部署人口4／4'),`${spec.mode} 部署人口：4／4`);
   A.ok(num(summary).includes('主帅1·自动上场')&&num(summary).includes('仕0/2座'),`${spec.mode} 主帅与仕单独显示`);
   const expand=await reachable(p,'[data-camp-expand]'),recruit=await reachable(p,'[data-recruit="pawn"]'),roster=await reachable(p,'#camp-roster [data-camp-roster]'),help=await reachable(p,'#camp-help');
   for(const [name,el] of [['扩编按钮',expand],['招募按钮',recruit],['名单按钮',roster],['帮助按钮',help]]){
    A.equal(el.found,true,`${spec.mode} ${name}存在`);A.equal(el.inside,true,`${spec.mode} ${name}在视口内`);A.equal(el.hit,true,`${spec.mode} ${name}命中自身`);A.equal(el.disabled,false,`${spec.mode} ${name}可点击`);
   }
   // 名单可操作：换下 starting-pawn → 两个数字同步更新
   await p.locator('[data-camp-roster="starting-pawn"]').click();await p.waitForTimeout(100);
   let s=await st(p);
   A.equal(R.activeOrdinary(s).length,3,`${spec.mode} 换下后上阵 3`);
   summary=plain(await campText(p));
   A.ok(num(summary).includes('队友总数7（其中后备4）'),`${spec.mode} 后备同步 4`);
   A.ok(num(summary).includes('部署人口3／4'),`${spec.mode} 部署人口同步 3／4`);
   // 按钮可用：部署上限 +1（20→15）
   await p.locator('[data-camp-expand]').click();await p.waitForTimeout(100);
   s=await st(p);
   A.equal(R.populationLimit(s),5,`${spec.mode} 扩编后上限 5`);
   A.equal(s.gold,15,`${spec.mode} 扣 5 猫粮`);
   summary=plain(await campText(p));
   A.ok(num(summary).includes('部署人口3／5'),`${spec.mode} 部署人口 3／5`);
   // 帮助可重看且解释两个概念
   await p.locator('#camp-help').click();await p.waitForTimeout(80);
   A.equal(await p.locator('#camp-guide').isVisible(),true,`${spec.mode} 帮助可重看`);
   const helpText=plain(await p.locator('#camp-guide').innerText());
   for(const kw of ['队友总数','部署人口','部署上限 +1 · 5猫粮','最高 8','有空余部署名额','进入后备'])A.ok(helpText.includes(kw),`${spec.mode} 帮助解释：${kw}`);
   const balance=await st(p);
   await p.locator('#camp-guide-close').click();await p.waitForTimeout(60);
   A.deepEqual(await st(p),balance,`${spec.mode} 查看帮助不扣资源`);
   const campShotName=await shot(p,spec.shot);
   // 布阵入口同样核对部署人口文字与「确认布阵」按钮可读可点。
   await p.locator('#camp-leave').click();await waitView(p,'map');
   await p.locator('#flow-enter').click();await waitView(p,'battle');
   const deployText=plain(await p.locator('#deploy-population').innerText());
   A.ok(num(deployText).includes('部署人口3／5'),`${spec.mode} 布阵显示 3／5`);
   const confirmBtn=await reachable(p,'#btn-deploy-confirm');
   A.equal(confirmBtn.found,true,`${spec.mode} 确认布阵按钮存在`);
   A.equal(confirmBtn.inside,true,`${spec.mode} 确认布阵按钮在视口内`);
   A.equal(confirmBtn.hit,true,`${spec.mode} 确认布阵按钮命中自身`);
   await p.locator('#btn-deploy-confirm').click();await p.waitForTimeout(150);
   A.equal((await st(p)).phase,'player',`${spec.mode} 确认布阵进入我方行动`);
   const deployShotName=await shot(p,spec.mode==='desktop'?'p08-desktop-deploy.png':'p08-mobile-deploy.png');
   const ev=evidenceJSON(spec.mode==='desktop'?'p08-desktop.json':'p08-mobile.json',{mode:spec.mode,layout,viewport,summary,hint,reachable:{expand,recruit,roster,help},summaryAfterActions:plain(await campText(p)),helpText,gold:(await st(p)).gold,expandText:plain(await p.locator('[data-camp-expand]').innerText()),rosterButtons:await p.locator('#camp-roster [data-camp-roster]').count(),deployText,confirmBtn,deployPhase:(await st(p)).phase});
   record('P08/*'+spec.mode,'专项（真实按钮切换显示模式）',true,`${spec.viewport.width}×${spec.viewport.height}（${layout}，实际视口 ${viewport.w}×${viewport.h}）：营地「队友总数：7（其中后备3）」「部署人口：4／4」，主帅与仕单独显示；扩编/招募/名单/帮助按钮均在视口内、命中自身且可点击（bbox ${JSON.stringify(expand.rect)}）。实际点击换人后两个数字同步（3／4、后备 4），点击「部署上限 +1 · 5猫粮」后 3／5、余额 20→15；帮助可重看且解释两个概念，查看帮助不扣资源；进入布阵显示「部署人口：3／5」且确认布阵按钮可点并成功进入我方行动。`,`${campShotName},${deployShotName},${ev}`);
   await ctx.close();
  }

  const out={scope:'US-020 R04 人口方案 P01～P08 浏览器验收（正常入口真实招募 1 条；其余边界专项夹具；双横版关键 UI）',branch:require('node:child_process').execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),head:require('node:child_process').execSync('git rev-parse HEAD').toString().trim(),base,results,shots,pageErrors,hashes:hashes(),finishedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(dir,'us020-population-result.json'),JSON.stringify(out,null,2));
  fs.writeFileSync(path.join(dir,'us020-population-browser.log'),results.map(r=>`${r.result} ${r.id} · ${r.type}\n${r.detail}\n证据：${r.evidence}`).join('\n\n')+`\n\npageerror：${JSON.stringify(pageErrors)}\n`);
  console.log(JSON.stringify({results:results.length,pageErrors:pageErrors.length,hashes:out.hashes},null,2));
  await browser.close();
  if(pageErrors.length||results.some(r=>r.result!=='通过'))process.exitCode=1;
 }catch(e){
  console.error('FAIL',e&&e.stack||e);
  try{fs.writeFileSync(path.join(dir,'us020-population-browser-fail.log'),String(e&&e.stack||e)+'\n'+JSON.stringify({results,pageErrors},null,2));}catch(_){}
  if(browser)await browser.close();
  process.exitCode=1;
 }
})();
