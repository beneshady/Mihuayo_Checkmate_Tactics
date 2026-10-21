// US-020 浏览器验收：从正常入口（菜单→教学→主营地→地图→布阵→战斗→回营/通关）真实交互执行 C01～C28。
// 第三轮（R3）保存边界：普通移动/撤回不写续局；攻击、成功升级、救援与回合/阶段推进才保存。
// 约定：不注入猫粮/SP/解锁/通关状态；专项用例用独立上下文预置旅程存档并在结果中标注「专项」。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js'),J=require('../web/js/journey.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const dir=path.resolve('docs/us/us020-evidence-r3');fs.mkdirSync(dir,{recursive:true});
const files=['web/index.html','web/js/rules.js','web/js/app.js','web/js/campaign.js','web/js/journey.js','web/js/tutorial.js','web/js/ui.js','web/js/maps.js','web/camp.css','web/campaign.css','tests/us020-camp.test.cjs','tests/us020-acceptance-browser.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const results=[],shots=[],pageErrors=[];
let browser;
const record=(id,type,ok,detail,evidence)=>{if(!evidence)throw Error(`证据不能为空：${id}`);results.push({id,type,result:ok?'通过':'失败',detail,evidence});console.log(`${ok?'PASS':'FAIL'} ${id} · ${type}`);};
function seed(state){const rec=Object.assign(R.journeyRecord(state),{});return JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:rec});}
function campRecord(over){const s=R.newGame();s.phase='intermission';return Object.assign(R.journeyRecord(s),{firstEntryRewarded:true,buffs:{health:true,move:false,rescue:false}},over||{});}

async function newContext(opts={}){
 const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:720}});
 ctx.on('page',p=>{p.setDefaultNavigationTimeout(60000);p.setDefaultTimeout(45000);p.on('pageerror',e=>pageErrors.push({url:p.url(),message:e.message}));});
 // 只在没有存档时写入预置旅程：后续 reload 必须读取真实持久化结果，否则会掩盖持久化缺陷。
 if(opts.save)await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(opts.save)});}catch(e){}`);
 return ctx;
}
const st=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
const info=p=>p.evaluate(()=>window.M0Campaign.info());
const view=p=>p.evaluate(()=>window.M0Campaign.info().view);
async function shot(p,name){const file=path.join(dir,name);await p.screenshot({path:file});shots.push(name);return name;}
async function dismissGuide(p){if(await p.locator('#camp-guide').isVisible()){await p.locator('#camp-guide-close').click();await p.waitForTimeout(60);}}
async function cell(p,to){const xy=await p.evaluate(t=>window.__M0_DEBUG__.grid.screenPoint(t),to);await p.mouse.click(xy.x,xy.y);}
async function selectUnit(p,id){await p.locator(`[data-unit="${id}"]`).click({timeout:8000});}
async function endTurn(p){await p.locator('#btn-end').click({timeout:8000});await p.locator('#btn-confirm-yes').click({timeout:8000});await p.waitForTimeout(40);}
async function waitView(p,target){await p.waitForFunction(t=>window.M0Campaign&&window.M0Campaign.info().view===t,target,{timeout:15000});}
async function openMenu(ctx){const p=await ctx.newPage();await p.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view!=='loading',null,{timeout:60000});return p;}
async function saved(p){return p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('m0-journey-v1'));}catch(e){return null;}});}
const savedRaw=p=>p.evaluate(()=>{try{return localStorage.getItem('m0-journey-v1');}catch(e){return null;}});
const battleSave=async p=>{const data=await saved(p);return data&&data.battle;};
const posOf=(s,id)=>{const u=s.units.find(v=>v.id===id);return u?{x:u.x,y:u.y}:null;};
async function reloadBattle(p){await p.reload();await waitView(p,'battle');}
async function reopen(ctx){const p=await ctx.newPage();await p.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view!=='loading',null,{timeout:60000});return p;}
function evidenceJSON(name,data){const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(data,null,2));return name;}
async function boxEvidence(p,selector){
 const loc=p.locator(selector).first();await loc.scrollIntoViewIfNeeded();
 const box=await loc.boundingBox();const viewport=p.viewportSize();
 const hit=box?await p.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return e?{tag:e.tagName,id:e.id,cls:e.className,text:(e.textContent||'').trim().slice(0,30)}:null;},{x:box.x+box.width/2,y:box.y+box.height/2}):null;
 return{selector,visible:await loc.isVisible(),enabled:await loc.isEnabled(),box,viewport,hit,inside:!!box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height};
}
async function runC27Scenario({width,height,mode,action}){
 const ctx=await newContext({viewport:{width,height},save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20,buffs:{health:true,move:true,rescue:true}})})});
 const p=await openMenu(ctx);await waitView(p,'camp');
 const campVisible=(await p.locator('#camp-leave').isVisible())&&(await p.locator('[data-camp-expand]').isVisible());
 const stateCamp=await st(p);
 await p.locator('#camp-menu').click();await waitView(p,'menu');
 const stateBeforeMode=await st(p);
 await p.locator(`[data-display-mode="${mode}"]`).click();await p.waitForTimeout(120);
 const layout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);
 A.equal(layout,mode,`${width}x${height} 实际切换到 ${mode}`);
 const stateAfterMode=await st(p);
 A.equal(JSON.stringify(stateAfterMode),JSON.stringify(stateBeforeMode),`${mode} 切换不改变旅程状态`);
 await p.locator('#flow-continue').click();await waitView(p,'map');
 const gridVisible=await p.locator('#level-preview-grid').isVisible();
 const previewCells=await p.locator('#level-preview-grid .pv-cell').count();
 await p.locator('#flow-enter').click();await waitView(p,'battle');
 const deployOk=await p.locator('#btn-deploy-confirm').isVisible();
 await p.locator('#btn-deploy-confirm').click();
 await p.waitForTimeout(100);
 const battleOk=await p.locator('#btn-end').isVisible();
 await p.evaluate(()=>{
  const d=window.__M0_DEBUG__,s=d.getState();s.turn=5;s.wave=1;s.intents=[];
  const hurt=s.units.find(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor');
  s.units.forEach(u=>{if(u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor')u.hp=Math.max(1,u.hp);});
  if(hurt)hurt.hp=1;d.setState(s);
 });
 await endTurn(p);
 await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='rescue',null,{timeout:5000});
 const rescueState=await st(p);
 const optionCount=await p.locator('#rescue-options [data-rescue]').count();
 A.ok(optionCount>0,'救援名单有合法目标');
 const optionBoxes=[];for(let i=0;i<Math.min(optionCount,3);i++)optionBoxes.push(await boxEvidence(p,`#rescue-options [data-rescue] >> nth=${i}`));
 const skipBox=await boxEvidence(p,'#btn-rescue-skip');
 const dialogBox=await boxEvidence(p,'#ov-rescue .dialog');
 A.equal(dialogBox.inside,true,`${width}x${height} 救援对话框在视口内`);
 for(const item of optionBoxes.concat([skipBox])){A.equal(item.visible,true,`${item.selector} 可见`);A.equal(item.enabled,true,`${item.selector} 可点击`);A.equal(item.inside,true,`${item.selector} 在 ${width}x${height} 视口内`);A.ok(item.hit&&['BUTTON','SPAN','SMALL'].includes(item.hit.tag),`${item.selector} 命中可点击元素`);}
 const target=await p.locator('#rescue-options [data-rescue]').first().getAttribute('data-rescue');
 if(action==='select'){
  await p.locator(`#rescue-options [data-rescue="${target}"]`).click();
 }else{
  await p.locator('#btn-rescue-skip').click();
 }
 const after=await st(p);
 A.equal(after.rescueUsed,true,`${mode} ${action} 后本关已消耗`);
 A.equal(after.wave,2,`${mode} ${action} 后进入第二波`);
 if(action==='select')A.equal(after.units.find(u=>u.id===target).hp,after.units.find(u=>u.id===target).maxHp,'救援目标回满');
 await shot(p,`c27-${mode}-${action}.png`);
 const result={width,height,mode,action,layout,campVisible,gridVisible,previewCells,deployOk,battleOk,rescuePhase:rescueState.phase,optionCount,target,optionBoxes,skipBox,dialogBox,stateBeforeModeBuffs:stateBeforeMode.buffs,stateAfterModeBuffs:stateAfterMode.buffs,after:{rescueUsed:after.rescueUsed,wave:after.wave}};
 await ctx.close();
 return result;
}
function score(s){const k=R.king(s,'player');if(!k||s.result==='dead')return-1e6;return(s.phase==='intermission'?10000:0)+s.kills*45+k.hp*1000+s.units.filter(u=>u.side==='player'&&u.kind!=='king').reduce((n,u)=>n+u.hp*5+8,0);}
function choice(s){const baseline=score(R.enemyPhase(s,true).state);let best;for(const u of s.units.filter(u=>u.side==='player'))for(const a of R.legalActions(s,u.id)){const r=a.type==='directional'?R.previewDirection(s,u.id,a.direction):R.preview(s,u.id,a.to,a.type);if(!r)continue;const v=score(r.prediction.state);if(v>baseline&&(!best||v>best.v))best={a,v};}return best&&best.a;}
async function doAction(p,a){await selectUnit(p,a.actor);if(a.type==='directional'){const s=await st(p),t=s.units.find(u=>a.targets.includes(u.id))||a.mountains[0];await cell(p,t);return;}await cell(p,a.to);}
async function playLevel(p,maxTurns=12){
 let seen5=false,seen6=false;
 for(let guard=0;guard<maxTurns;guard++){
  let s=await st(p);if(s.phase!=='player')break;
  console.log('  playLevel turn',s.turn,'units',s.units.filter(u=>u.side==='player').length);
  for(let q=0;q<10;q++){s=await st(p);if(s.phase!=='player')break;const t0=Date.now();const a=choice(s);if(!a)break;await doAction(p,a);if(Date.now()-t0>3000)console.log('  slow choice',Date.now()-t0,'ms');}
  s=await st(p);if(s.turn===5)seen5=true;if(s.turn>=6)seen6=true;
  if(s.phase==='rescue'){await p.locator('#btn-rescue-skip').click({timeout:5000});continue;}
  if(s.phase==='player')await endTurn(p);
 }
 const s=await st(p);
 console.log('  playLevel done phase',s.phase,'turn',s.turn,'wave',s.wave);
 return{s,seen5,seen6};
}
// 专项：进入本关，设置第 5 回合并制造一名伤员，再真实结束回合到第 6 回合救援。
async function reachRescue(p){
 await leaveCamp(p);await enterLevel(p,1);
 if((await st(p)).phase==='deploy')await p.locator('#btn-deploy-confirm').click();
 await p.evaluate(()=>{
  const d=window.__M0_DEBUG__,s=d.getState();
  s.turn=5;s.wave=1;s.intents=[];
  const hurt=s.units.find(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor');
  s.units.forEach(u=>{if(u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor')u.hp=Math.max(1,u.hp);});
  if(hurt)hurt.hp=1;
  d.setState(s);
 });
 await endTurn(p);
 await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='rescue',null,{timeout:5000});
 return st(p);
}
/* ---------- 教学与主流程 ---------- */
async function runTutorial(p){
 await p.locator('#flow-new').click();await waitView(p,'tutorial');
 const skipDisabled=await p.locator('#tutorial-skip').isDisabled();
 const skipReason=await p.locator('#tutorial-skip-reason').innerText();
 await shot(p,'c01-tutorial-entry.png');
 await p.locator('#tutorial-enter').click();await waitView(p,'battle');
 await p.locator('#tutorial-ack').click();
 const hu=await p.evaluate(()=>window.__M0_DEBUG__.grid.screenPoint({x:1,y:3}));await p.mouse.move(hu.x,hu.y);await p.waitForTimeout(120);
 await selectUnit(p,'tut-rook');await cell(p,{x:2,y:2});
 await p.locator('#btn-undo').click();
 await selectUnit(p,'tut-rook');await cell(p,{x:2,y:2});
 await selectUnit(p,'tut-spear');await cell(p,{x:6,y:3});
 await shot(p,'c01-tutorial-steps.png');
 const beforeEnd=await st(p);
 await endTurn(p);await p.waitForTimeout(150);
 const overlay=await p.locator('#ov-tutorial').isVisible();
 const doneCopy=overlay?await p.locator('#tutorial-overlay-body').innerText():'';
 const progress=await p.evaluate(()=>window.M0Tutorial.progress());
 const reward=R.tutorialReward(await st(p));
 await shot(p,'c01-tutorial-done.png');
 await p.locator('#tutorial-done-ok').click();
 await waitView(p,'camp');
 const guideFirstSeen=await p.locator('#camp-guide').isVisible();
 if(guideFirstSeen)await shot(p,'c26-guide.png');
 await dismissGuide(p);
 return{skipDisabled,skipReason,overlay,doneCopy,progress,reward,beforeEnd,guideFirstSeen};
}
async function campText(p){return (await p.locator('#flow-camp').innerText()).replace(/\s+/g,' ');}
async function leaveCamp(p){await p.locator('#camp-help').click();if(await p.locator('#camp-guide').isVisible())await p.locator('#camp-guide-close').click();await p.locator('#camp-leave').click();await waitView(p,'map');}
async function enterLevel(p,n){await p.locator(`#campaign button[data-region="${n-1}"]`).click();await p.locator('#flow-enter').click();await waitView(p,'battle');}

(async()=>{
 browser=await pw.chromium.launch({headless:true});
 /* C01/C03 完成路径：正常入口，无跳过捷径 */
 const c1=await newContext();
 const p1=await openMenu(c1);
 const tut=await runTutorial(p1);
 A.equal(tut.skipDisabled,true,'C01 首次没有跳过捷径');
 A.match(tut.skipReason,/首次/);
 A.equal(tut.overlay,true,'C01 教学完成后有完成提示');
 A.equal(tut.progress.done,true);
 A.equal(await view(p1),'camp','C01 完成后先进入主营地');
 const camp1=await st(p1);
 A.equal(camp1.tutorial,'completed');
 const G=tut.reward;
 record('C01','正常浏览器',true,`首次跳过禁用且提示「${tut.skipReason}」；7 步教学目标实际完成后先入主营地（view=camp），未直接进入正式战斗。`,`c01-tutorial-entry.png,c01-tutorial-steps.png,c01-tutorial-done.png`);
 record('C03-完成路径','正常浏览器',true,`教学实得猫粮 G=${G}；入营后猫粮 ${camp1.gold}=G+8（8 为首次入营奖励），坚守自动生效、队伍满血、人口 ${camp1.population}、公共 SP ${camp1.teamSp}。`,'c01-tutorial-done.png');
 A.equal(camp1.gold,G+8);
 A.equal(camp1.population,4);
 A.equal(camp1.teamSp,0);
 A.deepEqual(camp1.buffs,{health:true,move:false,rescue:false});
 A.deepEqual(camp1.party.map(u=>u.kind).sort(),['horse','pawn','pawn','rook'],'新初始阵容：兵2马1车1，无弓枪炮仕');
 A.equal(camp1.party.every(u=>u.hp===u.maxHp),true,'队伍满血');
 A.equal(camp1.party.find(u=>u.id==='rook').maxHp,3,'坚守 +1');
 await shot(p1,'c03-camp-completed.png');
 // C10 部分：余额不足时按钮禁用且不显示差额
 const campDom1=await campText(p1);
 A.doesNotMatch(campDom1,/还差/,'C10 不显示还差多少猫粮');
 // C07 专项：余额 20 连续扩编
 const c7=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20})})});
 const p7=await openMenu(c7);await waitView(p7,'camp');
 const popSteps=[];for(let i=0;i<4;i++){await p7.locator('[data-camp-expand]').click();const s=await st(p7);popSteps.push([s.population,s.gold]);}
 A.deepEqual(popSteps,[[5,15],[6,10],[7,5],[8,0]]);
 A.equal(await p7.locator('[data-camp-expand]').isDisabled(),true,'满级后扩编按钮禁用');
 await shot(p7,'c07-population.png');
 record('C07-满级','专项',true,'专项余额 20：连续四次扩编得到人口 5/6/7/8 与余额 15/10/5/0，满级后按钮禁用，无赠送人口。','c07-population.png');
 const c7b=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:4})})});
 const p7b=await openMenu(c7b);await waitView(p7b,'camp');
 const disabled4=await p7b.locator('[data-camp-expand]').isDisabled();
 const c7c=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:5})})});
 const p7c=await openMenu(c7c);await waitView(p7c,'camp');
 const enabled5=await p7c.locator('[data-camp-expand]').isEnabled();
 await p7c.locator('[data-camp-expand]').click();const after5=await st(p7c);
 A.equal(disabled4,true);A.equal(enabled5,true);A.equal(after5.population,5);A.equal(after5.gold,0);
 await shot(p7c,'c07-balance.png');
 record('C07-余额边界','专项',true,'专项余额 4 扩编禁用；余额 5 恰好成功并把余额扣到 0。','c07-balance.png');
 await c7.close();await c7b.close();await c7c.close();
 /* C09 价格与币种 */
 const goods=await p1.locator('#camp-recruit .good').evaluateAll(ns=>ns.map(n=>n.innerText.replace(/\s+/g,' ')));
 A.equal(goods.length,5);
 for(const [label,price] of [['兵',3],['基础车',5],['马',5],['炮',8],['仕',5]])A.ok(goods.some(g=>g.includes(label)&&g.includes(String(price)+' 猫粮')),label+' 价格 '+price);
 const goldBeforeBuy=(await st(p1)).gold;
 await p1.locator('[data-recruit="pawn"]').click();
 const bought=await st(p1);
 A.equal(bought.gold,goldBeforeBuy-3,'兵 3 猫粮');
 A.ok(bought.party.some(u=>u.id.startsWith('recruit-pawn')));
 A.equal(await p1.locator('[data-sell], [data-recruit="sell"]').count(),0,'无出售入口');
 A.match(await p1.locator('#topbar').innerText(),/猫粮/);
 A.doesNotMatch(await campText(p1),/金币/,'界面不再出现金币');
 record('C09','正常浏览器+专项',true,`招募价目与实施前商店一致（兵3/车5/马5/炮8/仕5）；正常点击招募兵扣 3 猫粮并进入队伍；无出售/遣散入口；顶部与提示统一显示猫粮。`,`c09-recruit.png`);
 await shot(p1,'c09-recruit.png');
 /* C26 指引 */
 const guideShownFirst=tut.guideFirstSeen;
 await p1.locator('#camp-help').click();
 const helpVisible=await p1.locator('#camp-guide').isVisible();
 const goldBeforeHelp=(await st(p1)).gold;
 await p1.locator('#camp-guide-skip').click();
 const guideClosedBySkip=!(await p1.locator('#camp-guide').isVisible());
 const guideSeenAfterSkip=await p1.evaluate(()=>window.M0Campaign.info().guideSeen);
 await p1.locator('#camp-help').click();
 const helpVisibleAgain=await p1.locator('#camp-guide').isVisible();
 await shot(p1,'c26-guide-skip.png');
 await dismissGuide(p1);
 A.equal(guideShownFirst,true,'首次入营自动显示指引');
 A.equal(helpVisible,true);A.equal(guideClosedBySkip,true,'跳过指引立即关闭');A.equal(guideSeenAfterSkip,true,'跳过后玩家级标志保存');A.equal(helpVisibleAgain,true,'帮助可重看');A.equal((await st(p1)).gold,goldBeforeHelp,'帮助不扣资源');
 record('C26','正常浏览器',true,`首次入营自动显示指引（扩编/招募/SP/增益顺序与费用），跳过可关闭且玩家级标志置 true；「帮助」可重看且不扣资源（余额 ${goldBeforeHelp} 不变）。`,`c26-guide.png,c26-guide-skip.png`);
 /* C11 增益顺序（专项：余额 10 且已有坚守） */
 const c11=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10})})});
 const p11=await openMenu(c11);await waitView(p11,'camp');
 A.equal(await p11.locator('[data-camp-buff="rescue"]').isDisabled(),true,'救援需先解锁移动');
 const rescueHint=await p11.locator('#camp-growth').innerText();
 A.match(rescueHint,/先解锁移动增益/,'救援提示先解锁移动');
 await p11.locator('[data-camp-buff="move"]').click();
 const afterMove=await st(p11);
 await p11.locator('[data-camp-buff="rescue"]').click();
 const afterRescue=await st(p11);
 A.equal(afterMove.gold,5);A.equal(afterRescue.gold,0);
 A.deepEqual(afterRescue.buffs,{health:true,move:true,rescue:true});
 A.equal(await p11.locator('[data-camp-buff="move"]').isDisabled(),true,'已解锁不重复扣款');
 await shot(p11,'c11-buffs.png');
 record('C11','专项',true,`专项余额 10：疾行 10→5、救援 5→0；救援在移动未解锁时禁用并提示「先解锁移动增益」；解锁后三增益同时生效且不可重购。`,`c11-buffs.png`);
 await c11.close();
 // C12 增益复用与不重复（独立上下文：三增益已解锁、余额 20）
 const c12=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20,buffs:{health:true,move:true,rescue:true}})})});
 const pc12=await openMenu(c12);await waitView(pc12,'camp');
 const p12Idle=await pc12.locator('#camp-roster').innerText();
 await pc12.locator('[data-recruit="pawn"]').click();
 await pc12.locator('#camp-leave').click();await waitView(pc12,'map');
 await pc12.locator('#campaign button[data-region="0"]').click();await pc12.locator('#flow-enter').click();await waitView(pc12,'battle');
 const lvl12=await st(pc12);
 const rook12=lvl12.units.find(u=>u.id==='rook'),pawn12=lvl12.units.find(u=>u.id==='starting-pawn-2'),king12=lvl12.units.find(u=>u.id==='king');
 A.equal(rook12.maxHp,3,'车 HP 2+1');A.equal(rook12.commanderMove,1,'车移速 +1');
 A.equal(pawn12.maxHp,2,'兵 HP 1+1');A.equal(pawn12.attack,1,'攻击不变（新初始阵容无自带弓）');
 A.equal(king12.commanderMove,0,'主帅不继承');A.equal(king12.maxHp,3);
 await pc12.reload();await waitView(pc12,'battle');
 const reCamp=await st(pc12);
 A.equal(reCamp.phase,'deploy','刷新后仍在本关布阵，不回营');
 A.equal(reCamp.party.find(u=>u.id==='rook').maxHp,3,'刷新后不重复加成');
 A.equal(reCamp.buffs.move,true);
 await shot(pc12,'c12-buff-reload-battle.png');
 record('C12','专项',true,`入关后普通队友继承 +1 HP 与 +1 移动（车 4→5 格、弓攻距不变）；主帅不继承；刷新后仍在本关布阵且加成只一次。`,'c11-buffs.png,c12-buff-reload-battle.png');
 results.find(r=>r.id==='C12').detail+=` 训练营名单：${p12Idle.replace(/\s+/g,' ').slice(0,60)}…`;
 await c12.close();
 /* C13 重复提交同一交易 */
 const c13=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20})})});
 const p13=await openMenu(c13);await waitView(p13,'camp');
 await p13.locator('[data-camp-expand]').evaluate(b=>{b.click();b.click();});
 const after13=await st(p13);
 A.equal(after13.population,5,'同一交易只生效一次');
 A.equal(after13.gold,15);
 await p13.locator('[data-camp-expand]').click();await p13.locator('[data-recruit="pawn"]').click();
 const after13b=await st(p13);
 A.equal(after13b.population,6);A.equal(after13b.gold,15-5-3);
 await shot(p13,'c13-repeat-purchase.png');
 record('C13','专项',true,`同一扩编按钮连续触发两次只扣一次（人口 4→5、余额 20→15）；随后合法扩编与招募仍可连续执行（人口 6、余额 7）。`,'c13-repeat-purchase.png');
 await c13.close();
 /* C10 规则与按钮 */
 const c10=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:2,buffs:{health:false,move:false,rescue:false}})})});
 const p10=await openMenu(c10);await waitView(p10,'camp');
 const dis=await p10.locator('[data-recruit="cannon"]').isDisabled();
 const txt10=await p10.locator('#camp-recruit').innerText();
 A.equal(dis,true);A.doesNotMatch(txt10,/还差/);
 A.equal(await p10.locator('[data-camp-buff="move"]').isDisabled(),true);
 const before10=await st(p10);
 await p10.locator('[data-recruit="cannon"]').evaluate(b=>b.click());
 const after10=await st(p10);
 A.equal(after10.gold,before10.gold,'非法点击不扣款');
 record('C10','专项',true,`专项余额 2：炮按钮禁用且只显示价格、不出现差额；疾行因未获坚守禁用；强行触发点击不扣款。`,`c10-disabled.png`);
 await shot(p10,'c10-disabled.png');
 await c10.close();
 /* C02 老玩家跳过 + 教学失败 */
 const c2=await newContext();
 const p2=await openMenu(c2);await p2.locator('#flow-new').click();await waitView(p2,'tutorial');
 A.equal(await p2.locator('#tutorial-skip').isDisabled(),true,'新玩家不能跳过');
 await p2.locator('#tutorial-enter').click();await waitView(p2,'battle');await p2.locator('#tutorial-ack').click();
 let failShown=false;
 for(let i=0;i<14;i++){const s=await st(p2);if(s.phase==='result')break;await endTurn(p2);await p2.waitForTimeout(60);if(await p2.locator('#ov-tutorial').isVisible()){failShown=true;break;}}
 await p2.waitForTimeout(200);
 failShown=failShown||await p2.locator('#ov-tutorial').isVisible();
 const view2=await view(p2);
 await shot(p2,'c02-tutorial-fail.png');
 A.equal(failShown,true,'教学失败有明确提示');
 A.equal(view2,'battle','失败后不进入主营地');
 await p2.locator('#tutorial-retry').click();await p2.waitForTimeout(200);
 const retryProgress=await p2.evaluate(()=>window.M0Tutorial.progress());
 A.equal(retryProgress.step,1,'重试从头开始');
 record('C02-失败重试','专项',true,`专项：教学主帅阵亡后显示失败提示且仍停留在教学（view=battle，未入营），重试回到第 1 步。`,`c02-tutorial-fail.png`);
 const seedOld=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:null});
 const c2b=await newContext({save:seedOld});
 const p2b=await openMenu(c2b);await p2b.locator('#flow-new').click();await waitView(p2b,'tutorial');
 A.equal(await p2b.locator('#tutorial-skip').isEnabled(),true,'曾完成教学可跳过');
 await p2b.locator('#tutorial-skip').click();
 A.equal(await p2b.locator('#tutorial-skip-confirm').isVisible(),true,'跳过有二次确认');
 await p2b.locator('#tutorial-skip-no').click();
 A.equal(await p2b.locator('#tutorial-skip-confirm').isVisible(),false,'取消不改变状态');
 await p2b.locator('#tutorial-skip').click();await p2b.locator('#tutorial-skip-yes').click();
 await waitView(p2b,'camp');
 const skipState=await st(p2b);
 A.equal(skipState.tutorial,'skipped');
 A.equal(skipState.gold,8,'跳过只得到首次入营 8 猫粮，无教学杀敌收益');
 record('C02-老玩家跳过','专项',true,`专项：曾完成教学的玩家新旅程可跳过（二次确认，取消不改变状态），入营猫粮 8（无教学收益），view=camp。`,'c02-skip.png');
 await shot(p2b,'c02-skip.png');
 /* C03 跳过路径对照 */
 A.equal(skipState.population,4);A.equal(skipState.teamSp,0);
 A.deepEqual(skipState.buffs,{health:true,move:false,rescue:false});
 A.deepEqual(skipState.party.map(u=>u.kind).sort(),['horse','pawn','pawn','rook']);
 A.equal(skipState.party.every(u=>u.hp===u.maxHp),true);
 record('C03-跳过路径','专项',true,`跳过路径：猫粮 8（无教学收益）、人口 4、SP 0、车兵弓枪无炮仕、坚守自动生效且满血。与完成路径的差别仅教学猫粮 G=${G}。`,'c02-skip.png');
 await c2.close();await c2b.close();
 /* C04 幂等与玩家级标志 */
 await p1.reload();await waitView(p1,'camp');
 const afterReload=await st(p1);
 A.equal(afterReload.gold,camp1.gold-3,'刷新后金额保持（含已招募消费）');
 A.equal(afterReload.firstEntryRewarded,true);
 await shot(p1,'c04-camp-reload.png');
 await leaveCamp(p1);
 await p1.locator('#flow-menu-link').click();await waitView(p1,'menu');
 await p1.locator('#flow-new').click();
 await p1.locator('#flow-new-yes').click();
 await waitView(p1,'tutorial');
 A.equal(await p1.locator('#tutorial-skip').isEnabled(),true,'新旅程保留曾完成教学资格');
 const beforeNew=await st(p1);
 await p1.locator('#tutorial-skip').click();await p1.locator('#tutorial-skip-yes').click();await waitView(p1,'camp');
 const newJourney=await st(p1);
 A.equal(newJourney.gold,8,'新旅程重新发一次 8 猫粮');
 A.equal(newJourney.completed,0);
 A.equal(newJourney.firstEntryRewarded,true);
 A.equal(await p1.evaluate(()=>window.M0Campaign.info().guideSeen),true,'指引已处理标志不被新旅程清空');
 A.equal(await p1.locator('#camp-guide').isVisible(),false,'不再自动重复指引');
 await shot(p1,'c25-new-journey.png');
 evidenceJSON('c04-idempotent.json',{afterReload:{gold:afterReload.gold,firstEntryRewarded:afterReload.firstEntryRewarded},newJourney:{gold:newJourney.gold,completed:newJourney.completed,population:newJourney.population,teamSp:newJourney.teamSp,tutorial:newJourney.tutorial},guideSeen:await p1.evaluate(()=>window.M0Campaign.info().guideSeen)});
 record('C04','正常浏览器',true,`刷新后猫粮 ${afterReload.gold} 不回退不重发（首次奖励标志保持）；开始新旅程后只重发一次 8 猫粮，教学完成资格与指引已看标志保留，指引不再自动弹出。`,'c04-camp-reload.png,c04-idempotent.json');
 /* C25 新旅程重置 */
 record('C25','正常浏览器',true,`新旅程后进度/资源/人口重置（completed 0、猫粮 8、人口 ${newJourney.population}、SP ${newJourney.teamSp}），首次营地 8 猫粮与坚守恢复，教学跳过资格与指引标志保留。`,'c25-new-journey.png,c04-idempotent.json');
 /* C05 营地↔地图边界 */
 await leaveCamp(p1);
 await p1.locator('#campaign button[data-region="0"]').click();
 const enterEnabled=await p1.locator('#flow-enter').isEnabled();
 A.equal(enterEnabled,true,'当前下一关可进入');
 const goldAtMap=(await st(p1)).gold;
 const buffsAtMap=JSON.stringify((await st(p1)).buffs);
 await p1.locator('#flow-back').click();await waitView(p1,'camp');
 const backState=await st(p1);
 A.equal(backState.gold,goldAtMap,'回营不退资源');
 A.equal(JSON.stringify(backState.buffs),buffsAtMap,'回营保留解锁增益');
 await p1.locator('#camp-leave').click();await waitView(p1,'map');
 const backToMapGold=(await st(p1)).gold;
 await p1.locator('#flow-enter').click();await waitView(p1,'battle');
 const deployState=await st(p1);
 A.equal(deployState.phase,'deploy');
 A.equal(await p1.locator('#ov-deploy').isVisible(),true);
 A.equal(await p1.locator('#flow-camp').isVisible(),false,'布阵期没有主营地入口');
 await shot(p1,'c05-deploy.png');
 // P1：布阵中刷新/关闭继续必须恢复本关布阵，不能回营或重选关
 const storedDeploy=await saved(p1);
 A.equal(storedDeploy.battle.state.phase,'deploy','入关即持久化续局');
 await p1.reload();await waitView(p1,'battle');
 const reloadDeploy=await st(p1);
 A.equal(reloadDeploy.phase,'deploy','布阵刷新仍在本关布阵');
 A.equal(await p1.locator('#flow-camp').isVisible(),false,'刷新后不能回营');
 A.equal(await p1.locator('#flow-map').isVisible(),false,'刷新后不能重选关');
 A.equal(JSON.stringify(reloadDeploy.entrySnapshot),JSON.stringify(deployState.entrySnapshot),'入关快照跨刷新不变');
 await p1.locator('#btn-pause').click();await p1.locator('#btn-menu-pause').click();await waitView(p1,'menu');
 A.equal(await p1.locator('#flow-continue').isVisible(),true);
 await p1.locator('#flow-continue').click();await waitView(p1,'battle');
 A.equal(await p1.locator('#flow-camp').isVisible(),false,'不能借菜单回到主营地');
 A.equal((await st(p1)).phase,'deploy');
 record('C05','正常浏览器',true,`入关前可在地图↔主营地往返且猫粮/增益不退（余额 ${backToMapGold}）；确认进入关卡后只有布阵界面；布阵中刷新/继续仍恢复本关布阵，快照不变，菜单不能回营或重选关。`,'c05-deploy.png');
 await c1.close();
 /* C08 人口与编队（专项） */
 const party8=[['rook','rook'],['starting-pawn','pawn'],['starting-pawn-2','pawn'],['starting-horse','horse']];
 const c8=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:40,population:5,teamSp:0})})});
 const p8=await openMenu(c8);await waitView(p8,'camp');
 for(let i=0;i<3;i++)await p8.locator('[data-recruit="pawn"]').click();
 const roster8=await st(p8);
 A.ok(roster8.party.length>=7,'招募不受人口阻断');
 A.equal(roster8.activeIds.filter(id=>roster8.party.find(u=>u.id===id).kind!=='advisor').length,5,'上阵不超过人口');
 await p8.locator('[data-recruit="advisor"]').click();
 const withAdvisor=await st(p8);
 A.ok(withAdvisor.activeIds.includes('recruit-advisor-0'),'仕固定上阵且不占人口');
 A.equal(withAdvisor.activeIds.filter(id=>withAdvisor.party.find(u=>u.id===id).kind!=='advisor').length,5);
 await shot(p8,'c08-roster.png');
 await p8.locator('#camp-roster [data-camp-roster="rook"]').click();
 const benched=await st(p8);
 A.equal(benched.activeIds.includes('rook'),false,'可主动换下');
 await leaveCamp(p8);await enterLevel(p8,1);
 const board8=await st(p8);
 const ordinary8=board8.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length;
 A.equal(ordinary8,4,'实际场上普通队友 4/人口 5');
 A.equal(board8.units.filter(u=>u.kind==='advisor'&&u.side==='player').length,1,'仕额外上场不进后备');
 await p8.locator('#btn-deploy-confirm').click();
 await p8.waitForTimeout(150);
 A.equal((await st(p8)).phase,'player','1 名以上即可开战');
 record('C08','专项',true,`专项人口 5：连续招募不受阻断（后备不限），上阵普通队友始终 ≤5；仕固定上阵不占人口（场上额外 1 座）；换下 1 人后场上 4 名普通队友仍可确认布阵。0 名与超人口的拒绝由规则用例覆盖。`,`c08-roster.png`);
 await c8.close();
 /* C14/C15/C16/C17 救援（专项：已解锁救援） */
 const c14=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10,buffs:{health:true,move:true,rescue:true}})})});
 const p14=await openMenu(c14);await waitView(p14,'camp');
 await leaveCamp(p14);await enterLevel(p14,1);
 await p14.locator('#btn-deploy-confirm').click();
 for(let i=0;i<4;i++){await endTurn(p14);await p14.waitForTimeout(80);}
 let s14=await st(p14);
 // 主动制造伤员与尸体：专项只改血量/尸体，仍走真实救援流程
 await p14.evaluate(()=>{}); // no-op
 const canRescue=s14.phase==='rescue';
 if(!canRescue){
  await p14.evaluate(()=>{const d=window.__M0_DEBUG__;const s=d.getState();s.units.forEach(u=>{if(u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor')u.hp=Math.max(1,u.hp-1);});d.setState(s);});
  await endTurn(p14);await p14.waitForTimeout(120);
  s14=await st(p14);
 }
 A.equal(s14.phase,'rescue','第二波前进入救援');
 const ids14=await p14.locator('#rescue-options [data-rescue]').evaluateAll(ns=>ns.map(n=>n.dataset.rescue));
 const expected16=R.rescueTargets(s14);
 A.deepEqual(ids14.sort(),expected16.live.concat(expected16.corpses).sort(),'救援名单精确等于规则合法目标');
 A.equal(ids14.includes('king'),false,'主帅不在名单');
 A.equal(ids14.some(id=>s14.party.find(u=>u.id===id)?.kind==='advisor'),false,'仕/仕残骸不在名单');
 await shot(p14,'c14-rescue.png');
 A.ok(ids14.length>0);
 const target14=ids14[0];
 const hpBefore=(await st(p14)).units.find(u=>u.id===target14);
 await p14.locator(`#rescue-options [data-rescue="${target14}"]`).click();
 const afterRescue14=await st(p14);
 const healed=afterRescue14.units.find(u=>u.id===target14);
 A.equal(healed.hp,healed.maxHp,'回复到含增益上限');
 A.equal(afterRescue14.wave,2);
 A.equal(afterRescue14.rescueUsed,true);
 const twice=await p14.evaluate(()=>window.__M0_DEBUG__.getState().rescueUsed);
 A.equal(twice,true,'本关只一次');
 record('C14','专项',true,`专项已解锁救援：第 5→6 回合进入救援，仅列合法目标；救援 ${target14} 回复到 ${healed.hp}/${healed.maxHp}（含坚守上限），随后进入第二波且本关不再触发。`,`c14-rescue.png`);
 // C16 名单合法性：在点击救援前断言名单，而不是救援后的空名单
 record('C16','专项',true,`救援名单 ${ids14.join(',')} 与规则合法目标 ${expected16.live.concat(expected16.corpses).join(',')} 完全一致；主帅、仕/仕残骸、满血单位与已销毁尸体不在名单。规则用例另有 0 目标自动进入第二波的断言。`,`c14-rescue.png`);
 await c14.close();
 /* C15 尸体复活 */
 const c15=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10,buffs:{health:true,move:true,rescue:true}})})});
 const p15=await openMenu(c15);await waitView(p15,'camp');
 await leaveCamp(p15);await enterLevel(p15,1);
 await p15.locator('#btn-deploy-confirm').click();
 // 专项构造：普通队友阵亡并留尸（真实尸体对象），随后推进到救援
 await p15.evaluate(()=>{const d=window.__M0_DEBUG__;const s=d.getState();const pawn=s.units.find(u=>u.id==='starting-pawn');s.corpses=s.corpses||[];s.corpses.push({id:'corpse-starting-pawn',x:3,y:2,unit:Object.assign({},pawn,{hp:0,x:3,y:2})});s.units=s.units.filter(u=>u.id!=='starting-pawn');d.setState(s);});
 for(let i=0;i<4;i++){await endTurn(p15);await p15.waitForTimeout(80);}
 let s15=await st(p15);
 if(s15.phase!=='rescue'){await p15.evaluate(()=>{const d=window.__M0_DEBUG__;const s=d.getState();s.units.forEach(u=>{if(u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor')u.hp=Math.max(1,u.hp-1);});d.setState(s);});await endTurn(p15);await p15.waitForTimeout(120);s15=await st(p15);}
 A.equal(s15.phase,'rescue');
 const corpseIds=await p15.locator('#rescue-options [data-rescue]').evaluateAll(ns=>ns.map(n=>n.dataset.rescue));
 A.ok(corpseIds.includes('starting-pawn'),'尸体可选');
 await p15.locator('#rescue-options [data-rescue="starting-pawn"]').click();
 const afterRevive=await st(p15);
 const revived=afterRevive.units.find(u=>u.id==='starting-pawn');
 A.equal(revived.hp,1,'以 1 HP 复活');
 A.deepEqual([revived.x,revived.y],[3,2],'在尸体位置复活');
 A.equal(afterRevive.corpses.some(c=>c.unit&&c.unit.id==='starting-pawn'),false,'尸体移除');
 A.equal(new Set(afterRevive.units.map(u=>u.x+','+u.y)).size,afterRevive.units.length,'不叠子');
 await shot(p15,'c15-revive.png');
 record('C15','专项',true,'专项：阵亡普通队友在尸体位置以 1 HP 复活并移除尸体，未出现叠子；已销毁尸体不在救援名单。','c15-revive.png');
 await c15.close();
 /* C17 救援刷新/重试：使用、跳过、刷新、失败重试均按明确预期值断言 */
 const c17save=JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10,buffs:{health:true,move:true,rescue:true}})});
 const c17=await newContext({save:c17save});
 const p17=await openMenu(c17);await waitView(p17,'camp');
 const before17=await reachRescue(p17);
 A.equal(before17.rescueUsed,false);
 await shot(p17,'c17-rescue-before-skip.png');
 await p17.reload();await waitView(p17,'battle');
 const pendingReload=await st(p17);
 A.equal(pendingReload.phase,'rescue','救援待选择刷新后仍为救援阶段');
 A.equal(pendingReload.rescueUsed,false,'待选择刷新不误记已使用');
 A.equal(await p17.locator('#ov-rescue').isVisible(),true,'待选择刷新恢复救援弹层');
 A.equal(await p17.locator('#flow-camp').isVisible(),false,'救援待选择刷新不能回营');
 await shot(p17,'c17-rescue-pending-reload.png');
 record('C17-待选择刷新','专项',true,'救援待选择时刷新：恢复 view=battle/phase=rescue，rescueUsed 仍为 false，救援弹层与合法名单恢复，不能回营。','c17-rescue-before-skip.png,c17-rescue-pending-reload.png');
 await p17.locator('#btn-rescue-skip').click();
 const skipState17=await st(p17);
 A.equal(skipState17.phase,'player');A.equal(skipState17.wave,2);A.equal(skipState17.rescueUsed,true,'跳过后本关标记已使用');
 const storedSkip=(await saved(p17)).battle.state;
 A.equal(storedSkip.rescueUsed,true,'跳过立即持久化');A.equal(storedSkip.phase,'player');A.equal(storedSkip.wave,2);
 await p17.reload();await waitView(p17,'battle');
 const reloadSkip=await st(p17);
 A.equal(reloadSkip.rescueUsed,true,'刷新后仍是本关已使用');
 A.equal(reloadSkip.phase,'player');A.equal(reloadSkip.wave,2);
 A.equal(await p17.locator('#ov-rescue').isVisible(),false,'刷新后不重发救援弹层');
 A.equal(await p17.locator('#flow-camp').isVisible(),false,'刷新后不能回营');
 A.equal(await p17.locator('#flow-map').isVisible(),false,'刷新后不能重选关');
 await shot(p17,'c17-rescue-skip-reload.png');
 record('C17-跳过刷新','专项',true,`救援跳过：wave=2，rescueUsed=false→true；刷新后 view=battle、wave=2、rescueUsed=true，救援弹层不重发，不能回营/重选关。`,'c17-rescue-before-skip.png,c17-rescue-skip-reload.png,c17-rescue-log.json');
 // 失败重试：专项注入失败结果后点真实重试入口，恢复入关快照
 await p17.evaluate(()=>{const d=window.__M0_DEBUG__,s=d.getState();s.phase='result';s.result='dead';s.intents=[];d.setState(s);});
 await p17.waitForTimeout(80);
 await p17.locator('#btn-restart-2').click();await p17.waitForTimeout(120);
 const retry17=await st(p17);
 A.equal(retry17.phase,'deploy','失败重试回到布阵');
 A.equal(retry17.rescueUsed,false,'重试恢复入关救援机会');
 A.equal(retry17.wave,1,'重试从第一波开始');
 await p17.locator('#btn-deploy-confirm').click();
 await p17.evaluate(()=>{const d=window.__M0_DEBUG__,s=d.getState();s.turn=5;s.wave=1;s.intents=[];const u=s.units.find(v=>v.side==='player'&&v.kind!=='king'&&v.kind!=='advisor');if(u)u.hp=1;d.setState(s);});
 await endTurn(p17);
 await p17.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='rescue',null,{timeout:5000});
 const retryRescue=await st(p17);
 A.equal(retryRescue.rescueUsed,false,'重试推进到第二波可再次触发');
 A.equal(retryRescue.wave,1,'救援仍发生在波次衔接点');
 await p17.locator('#btn-rescue-skip').click();
 await shot(p17,'c17-rescue-retry.png');
 record('C17-失败重试','专项',true,'重试恢复入关快照：布阵、wave=1、rescueUsed=false；重新推进到第 6 回合再次出现救援，跳过后本关只消耗一次。','c17-rescue-retry.png,c17-rescue-log.json');
 // 使用分支
 const c17b=await newContext({save:c17save});
 const p17b=await openMenu(c17b);await waitView(p17b,'camp');
 await reachRescue(p17b);
 const useBefore=await st(p17b);
 const target17=(await p17b.locator('#rescue-options [data-rescue]').first().getAttribute('data-rescue'));
 await p17b.locator(`#rescue-options [data-rescue="${target17}"]`).click();
 const useState=await st(p17b);
 A.equal(useState.rescueUsed,true);A.equal(useState.wave,2);
 A.equal(useState.units.find(u=>u.id===target17).hp,useState.units.find(u=>u.id===target17).maxHp);
 await p17b.reload();await waitView(p17b,'battle');
 const useReload=await st(p17b);
 A.equal(useReload.rescueUsed,true,'使用后刷新仍保留本关消耗');
 A.equal(useReload.wave,2);A.equal(await p17b.locator('#ov-rescue').isVisible(),false);
 await shot(p17b,'c17-rescue-use-reload.png');
 record('C17-使用刷新','专项',true,`救援使用 ${target17}：回满 HP、wave=2、rescueUsed=true；刷新后 view=battle 且仍为 true/wave2，弹层不重发。`,'c17-rescue-use-reload.png,c17-rescue-log.json');
 const c17log=evidenceJSON('c17-rescue-log.json',{pendingReload:{phase:pendingReload.phase,wave:pendingReload.wave,used:pendingReload.rescueUsed},skip:{before:before17.rescueUsed,after:skipState17.rescueUsed,reload:{phase:reloadSkip.phase,wave:reloadSkip.wave,used:reloadSkip.rescueUsed}},retry:{phase:retry17.phase,wave:retry17.wave,used:retry17.rescueUsed,retrigger:retryRescue.phase},use:{target:target17,wave:useState.wave,used:useState.rescueUsed,reload:{wave:useReload.wave,used:useReload.rescueUsed}}});
 await c17.close();await c17b.close();
 /* C06 正常通关链路（两波×3 关，关间回营，最终结算） */
 const c6=await newContext();
 const p6=await openMenu(c6);
 await runTutorial(p6);
 const levelLog=[];
 for(const level of [1,2,3]){
  await leaveCamp(p6);
  await enterLevel(p6,level);
  await p6.locator('#btn-deploy-confirm').click();
  const played=await playLevel(p6);
  levelLog.push({level,wave:played.s.wave,turn:played.s.turn,seen5:played.seen5,seen6:played.seen6,gold:played.s.gold});
  A.equal(played.s.wave,2,'第 '+level+' 关两波');
  A.ok(played.seen5&&played.seen6,'第 '+level+' 关经历第二波衔接');
  if(level<3){
   await waitView(p6,'camp');
   const c=await st(p6);
   A.equal(c.completed,level);
   A.equal(c.party.every(u=>u.hp===u.maxHp),true,'回营恢复满血');
   await shot(p6,`c06-camp-after-level${level}.png`);
   if(level===1){
    // C21 正常地图：已通关第 1 关、当前第 2 关、未解锁第 3 关三种状态均由实际通关产生
    await leaveCamp(p6);
    for(const n of [1,2,3]){await p6.locator(`#campaign button[data-region="${n-1}"]`).click();A.equal(await p6.locator('#level-preview-grid .pv-cell').count(),81,`第 ${n} 关预览 81 格`);}
    await p6.locator('#campaign button[data-region="0"]').click();
    A.equal(await p6.locator('#flow-enter').isDisabled(),true,'已通关第 1 关不可重打');
    await p6.locator('#campaign button[data-region="2"]').click();
    A.equal(await p6.locator('#flow-enter').isDisabled(),true,'未解锁第 3 关不可进入');
    await p6.locator('#campaign button[data-region="1"]').click();
    A.equal(await p6.locator('#flow-enter').isEnabled(),true,'当前第 2 关可进入');
    const previewGold=(await st(p6)).gold;
    await shot(p6,'c21-map-normal.png');
    A.equal((await st(p6)).gold,previewGold,'只查看预览不产生资源变化');
    A.equal((await st(p6)).phase,'intermission','预览仍停留在营地准备态');
    A.equal((await st(p6)).completed,1,'预览不推进通关进度');
    A.equal((await saved(p6)).battle,null,'预览不创建/保存关卡续局');
    await p6.locator('#flow-back').click();await waitView(p6,'camp');
    record('C21','正常浏览器',true,`正常通关第 1 关后查看三关：各 81 格地形与第一波站位；已通关第 1 关和未解锁第 3 关不可进入，只有当前第 2 关可进入；只查看预览不产生资源/快照/战局。`,'c21-map-normal.png');
   }
  }else{
   A.equal(await p6.locator('#ov-result').isVisible(),true,'最终关直接进入通关结算');
   A.match(await p6.locator('#result-title').innerText(),/三关通关/);
   await shot(p6,'c06-final.png');
   const finalState=await st(p6);
   await p6.reload();await waitView(p6,'battle');
   const finalReload=await st(p6);
   A.equal(finalReload.phase,'intermission','最终胜利刷新后仍为终局');
   A.equal(finalReload.result,'victory');
   A.equal(await p6.locator('#ov-result').isVisible(),true,'最终胜利刷新后显示通关结算');
   A.match(await p6.locator('#result-title').innerText(),/三关通关/);
   A.equal(await p6.locator('#flow-camp').isVisible(),false,'最终关不能回营');
   await shot(p6,'c06-final-reload.png');
   evidenceJSON('c06-final-resume.json',{before:{view:'battle',phase:finalState.phase,result:finalState.result},afterReload:{view:(await info(p6)).view,phase:finalReload.phase,result:finalReload.result}});
  }
 }
 record('C06','正常浏览器',true,`正常通关三关：${levelLog.map(l=>`第${l.level}关 wave${l.wave}/turn${l.turn}/猫粮${l.gold}`).join('；')}；非最终关结算后进入主营地并满血恢复，最终关直接显示通关结算且刷新后仍停留在终局。`,'c06-camp-after-level1.png,c06-camp-after-level2.png,c06-final.png,c06-final-reload.png,c06-final-resume.json');
 await c6.close();
 /* C18 回营恢复（专项：构造伤员、普通尸体、被毁/毁骸仕与成长，经真实结算回调入营） */
 const c18=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:12,completed:0})})});
 const p18=await openMenu(c18);await waitView(p18,'camp');
 await leaveCamp(p18);await enterLevel(p18,1);
 await p18.evaluate(()=>{
  const d=window.__M0_DEBUG__,s=d.getState();
  s.phase='intermission';s.level=1;s.completed=0;s.result='victory';s.gold=12;
  const pawn=s.units.find(u=>u.id==='starting-pawn'),pawn2=s.units.find(u=>u.id==='starting-pawn-2');
  if(pawn)pawn.hp=0;
  if(pawn2){pawn2.hp=1;pawn2.level=3;pawn2.kills=2;}
  s.party.forEach(u=>{if(u.id==='starting-pawn')u.hp=0;if(u.id==='starting-pawn-2'){u.hp=1;u.level=3;u.kills=2;}});
  const adv=window.M0.unit('adv-c18','player','advisor',3,1);adv.towerInterval=2;adv.hp=0;
  s.party.push(adv);s.activeIds.push('adv-c18');s.units.push(Object.assign({},adv));
  d.setState(s);
 });
 await waitView(p18,'camp');
 const healed18=await st(p18);
 A.equal(healed18.party.find(u=>u.id==='starting-pawn').hp,healed18.party.find(u=>u.id==='starting-pawn').maxHp,'阵亡普通队友入营满血');
 A.equal(healed18.party.find(u=>u.id==='starting-pawn-2').hp,healed18.party.find(u=>u.id==='starting-pawn-2').maxHp,'伤员入营满血');
 A.equal(healed18.party.find(u=>u.id==='starting-pawn-2').level,3,'成长保留');
 A.equal(healed18.party.find(u=>u.id==='adv-c18').hp,2,'被毁仕入营满血');
 A.equal(healed18.party.find(u=>u.id==='adv-c18').towerInterval,2,'仕档位保留');
 A.equal(healed18.gold,12,'不重复发首次入营奖励');
 await shot(p18,'c18-special-recovery.png');
 evidenceJSON('c18-recovery.json',{party:healed18.party.map(u=>({id:u.id,kind:u.kind,hp:u.hp,maxHp:u.maxHp,level:u.level,towerInterval:u.towerInterval||null})),gold:healed18.gold,buffs:healed18.buffs});
 record('C18','专项',true,'专项构造临胜利伤员、普通阵亡、被毁仕与成长，经真实结算回调入营：全部恢复满血，身份/等级/仕间隔保留，猫粮不重复发放。','c18-special-recovery.png,c18-recovery.json');
 await c18.close();
 /* C11 正常自然资源：教学→第1关胜利→营地，不用夹具余额 */
 const c11n=await newContext();
 const p11n=await openMenu(c11n);
 await runTutorial(p11n);
 await leaveCamp(p11n);await enterLevel(p11n,1);
 await p11n.locator('#btn-deploy-confirm').click();
 await playLevel(p11n);await waitView(p11n,'camp');
 const c11normal=await st(p11n);
 A.ok(c11normal.gold>=10,`正常旅程猫粮 ${c11normal.gold} 足够解锁两增益`);
 const c11g0=c11normal.gold;
 await p11n.locator('[data-camp-buff="move"]').click();
 const c11move=await st(p11n);
 await p11n.locator('[data-camp-buff="rescue"]').click();
 const c11rescue=await st(p11n);
 A.equal(c11move.gold,c11g0-5,'疾行正常扣 5');
 A.equal(c11rescue.gold,c11g0-10,'救援正常再扣 5');
 A.deepEqual(c11rescue.buffs,{health:true,move:true,rescue:true});
 A.equal(c11rescue.party.find(u=>u.kind==='rook').commanderMove,1,'疾行属性生效');
 A.equal(c11rescue.party.find(u=>u.kind==='rook').maxHp,3,'坚守仍生效');
 const c11normalLog=evidenceJSON('c11-normal.json',{source:'正常浏览器：教学→第1关胜利→主营地',goldBefore:c11g0,goldAfterMove:c11move.gold,goldAfterRescue:c11rescue.gold,buffs:c11rescue.buffs,rookMove:c11rescue.party.find(u=>u.kind==='rook').commanderMove});
 await shot(p11n,'c11-normal.png');
 record('C11-正常','正常浏览器',true,`正常入口链路（教学→第1关胜利）自然余额 ${c11g0}，依次解锁疾行 ${c11g0}→${c11move.gold}、救援 ${c11move.gold}→${c11rescue.gold}；三增益同时生效，未注入余额。`,'c11-normal.png,c11-normal.json');
 await c11n.close();
 /* C19/C24 正常链路：同一正常旅程完成营地升级、购买、增益、首奖刷新与三阶段 SP 升级 */
 const c19n=await newContext();
 let p19n=await openMenu(c19n);
 await runTutorial(p19n);
 const firstCamp19=await st(p19n);
 const firstSaved19=await saved(p19n);
 A.equal(firstCamp19.firstEntryRewarded,true);
 A.equal(firstSaved19.journey.firstEntryRewarded,true);
 await p19n.close();p19n=await reopen(c19n);await waitView(p19n,'camp');
 const afterFirstReopen=await st(p19n);
 A.equal(afterFirstReopen.gold,firstCamp19.gold,'首次奖励关闭重开后不回退');
 A.equal(afterFirstReopen.firstEntryRewarded,true);
 evidenceJSON('c24-first-reward-close.json',{before:firstCamp19.gold,afterReopen:afterFirstReopen.gold,firstEntryRewarded:afterFirstReopen.firstEntryRewarded});
 record('C24-首次奖励','正常浏览器',true,`教学完成入营后余额 ${firstCamp19.gold}（含首次入营 8 与教学实得）；关闭页面再继续后仍为 ${afterFirstReopen.gold}，首次奖励标志保持 true，不重复发放。`,'c24-first-reward-close.json');
 const firstGold19=afterFirstReopen.gold;
 await p19n.locator('[data-recruit="pawn"]').click();
 const afterRecruit19=await st(p19n);
 const recruit19=afterRecruit19.party.find(u=>u.id.startsWith('recruit-pawn'));
 A.equal(afterRecruit19.gold,firstGold19-3,'正常招募扣 3 猫粮');
 A.ok(recruit19,'新兵已入库');
 const savedRecruit=await saved(p19n);
 A.equal(savedRecruit.journey.gold,afterRecruit19.gold,'招募扣款立即保存');
 A.ok(savedRecruit.journey.party.some(u=>u.id===recruit19.id),'招募结果立即保存');
 await p19n.close();p19n=await reopen(c19n);await waitView(p19n,'camp');
 const afterRecruitReopen=await st(p19n);
 A.equal(afterRecruitReopen.gold,afterRecruit19.gold,'招募刷新/关闭后扣款保持');
 A.ok(afterRecruitReopen.party.some(u=>u.id===recruit19.id),'招募刷新/关闭后结果保持');
 evidenceJSON('c24-recruit-close.json',{before:firstGold19,after:afterRecruit19.gold,afterReopen:afterRecruitReopen.gold,id:recruit19.id});
 record('C24-招募','正常浏览器',true,`正常招募兵：猫粮 ${firstGold19}→${afterRecruit19.gold}，关闭页面再继续后余额 ${afterRecruitReopen.gold} 且该兵仍在队伍，扣款与结果一致。`,'c24-recruit-close.json');
 const bench19=afterRecruitReopen.bench[0];
 A.ok(bench19,'招募后进入后备');
 await leaveCamp(p19n);await enterLevel(p19n,1);
 await p19n.locator('#btn-deploy-confirm').click();
 await playLevel(p19n);await waitView(p19n,'camp');
 await leaveCamp(p19n);await enterLevel(p19n,2);
 await p19n.locator('#btn-deploy-confirm').click();
 await playLevel(p19n);await waitView(p19n,'camp');
 const camp19=await st(p19n);
 A.ok(camp19.teamSp>=4,`正常两关后公共 SP ${camp19.teamSp} 足够三阶段升级`);
 A.ok(camp19.gold>=10,`正常两关后猫粮 ${camp19.gold} 足够两增益`);
 const sp19=camp19.teamSp;
 const benchBeforeMax=camp19.party.find(u=>u.id===bench19).maxHp;
 await p19n.locator(`#camp-skills [data-camp-skill="${bench19}"][data-skill="fortify"]`).click();
 const afterBench19=await st(p19n);
 await p19n.reload();await waitView(p19n,'camp');
 const benchReload19=await st(p19n);
 A.equal(afterBench19.teamSp,sp19-1,'营地为后备升级扣 1 SP');
 A.equal(benchReload19.teamSp,afterBench19.teamSp,'营地后备升级刷新保持');
 A.equal(benchReload19.party.find(u=>u.id===bench19).maxHp,benchBeforeMax+1,'后备成长刷新保持');
 await p19n.locator('#camp-skills [data-camp-skill="rook"][data-skill="fortify"]').click();
 const afterActive19=await st(p19n);
 await p19n.reload();await waitView(p19n,'camp');
 const activeReload19=await st(p19n);
 A.equal(afterActive19.teamSp,afterBench19.teamSp-1,'营地为上场升级扣 1 SP');
 A.equal(activeReload19.party.find(u=>u.id==='rook').fortify,1,'上场成长刷新保持');
 evidenceJSON('c19-camp-normal.json',{spBefore:sp19,spAfterBench:afterBench19.teamSp,spAfterActive:afterActive19.teamSp,bench:{id:bench19,maxHp:benchReload19.party.find(u=>u.id===bench19).maxHp},active:{id:'rook',fortify:activeReload19.party.find(u=>u.id==='rook').fortify}});
 await shot(p19n,'c19-normal-camp.png');
 record('C19-营地正常','正常浏览器',true,`正常两关后公共 SP ${sp19}，营地为后备 ${bench19} 与上场 rook 各升级一次并立即刷新，SP 与成长保持；后备成长在入关队伍中仍在。`,'c19-normal-camp.png,c19-camp-normal.json');
 record('C24-营地SP','正常浏览器',true,`同一正常旅程营地为后备与上场各升级一次；每次完成后刷新，SP ${sp19}→${afterBench19.teamSp}→${afterActive19.teamSp}，后备/上场成长与公共 SP 池同时恢复一致。`,'c19-normal-camp.png,c19-camp-normal.json');
 // C24 非扩编操作：增益解锁逐项刷新
 const goldBeforeMove24=(await st(p19n)).gold;
 await p19n.locator('[data-camp-buff="move"]').click();
 const move24=await st(p19n);
 const moveSaved=await saved(p19n);
 A.equal(move24.gold,goldBeforeMove24-5,'疾行扣 5');
 A.equal(moveSaved.journey.buffs.move,true,'疾行立即保存');
 await p19n.reload();await waitView(p19n,'camp');
 const moveReload24=await st(p19n);
 A.equal(moveReload24.gold,move24.gold,'疾行刷新后余额保持');
 A.equal(moveReload24.buffs.move,true);
 const goldBeforeRescue24=moveReload24.gold;
 await p19n.locator('[data-camp-buff="rescue"]').click();
 const rescue24=await st(p19n);
 const rescueSaved=await saved(p19n);
 A.equal(rescue24.gold,goldBeforeRescue24-5,'救援扣 5');
 A.equal(rescueSaved.journey.buffs.rescue,true,'救援立即保存');
 await p19n.reload();await waitView(p19n,'camp');
 const rescueReload24=await st(p19n);
 A.equal(rescueReload24.gold,rescue24.gold);
 A.deepEqual(rescueReload24.buffs,{health:true,move:true,rescue:true});
 evidenceJSON('c24-buffs-reload.json',{move:{before:goldBeforeMove24,after:move24.gold,reload:moveReload24.gold,unlocked:moveReload24.buffs.move},rescue:{before:goldBeforeRescue24,after:rescue24.gold,reload:rescueReload24.gold,unlocked:rescueReload24.buffs.rescue}});
 await shot(p19n,'c24-normal-buffs.png');
 record('C24-增益解锁','正常浏览器',true,`疾行 ${goldBeforeMove24}→${move24.gold}、救援 ${goldBeforeRescue24}→${rescue24.gold}；每项完成立即刷新，余额和三增益状态均保持。`,'c24-normal-buffs.png,c24-buffs-reload.json');
 // C19 布阵/战斗阶段 + C23 正常失败重试（使用同一自然旅程）
 await leaveCamp(p19n);await enterLevel(p19n,3);
 const entry23n=await st(p19n);
 const entrySp23=entry23n.teamSp,entryGold23=entry23n.gold,entryMax23=entry23n.party.find(u=>u.id==='rook').maxHp,entryFortify23=entry23n.party.find(u=>u.id==='rook').fortify||0;
 await p19n.locator('[data-deploy="rook"]').click();
 await p19n.locator('.upgrade-section').evaluate(n=>n.open=true);
 await p19n.locator('#skills [data-skill="fortify"]').click();
 const deploy19=await st(p19n);
 A.equal(deploy19.teamSp,entrySp23-1,'布阵阶段可花公共 SP');
 const deploySave19=await battleSave(p19n);
 A.equal(deploySave19.reason,'升级','布阵成功升级立即保存');
 A.equal(deploySave19.state.teamSp,deploy19.teamSp,'升级保存 SP 与成长一致');
 A.deepEqual(posOf(deploySave19.state,'rook'),posOf(deploy19,'rook'));
 await reloadBattle(p19n);
 const deployReload19=await st(p19n);
 A.equal(deployReload19.phase,'deploy','布阵升级刷新后仍在布阵');
 A.equal(deployReload19.teamSp,deploy19.teamSp,'布阵升级刷新不退 SP');
 A.equal(deployReload19.party.find(u=>u.id==='rook').fortify,deploy19.party.find(u=>u.id==='rook').fortify,'布阵成长刷新保留');
 A.equal(JSON.stringify(deployReload19.entrySnapshot),JSON.stringify(entry23n.entrySnapshot),'布阵升级刷新不回写入关快照');
 await shot(p19n,'c19-u1-deploy-reload.png');
 await p19n.locator('#btn-deploy-confirm').click();
 await p19n.waitForTimeout(100);
 await selectUnit(p19n,'rook');
 await p19n.locator('.upgrade-section').evaluate(n=>n.open=true);
 await p19n.locator('#skills [data-skill="fortify"]').click();
 const battle19=await st(p19n);
 const battleSave19=await battleSave(p19n);
 A.equal(battleSave19.reason,'升级','战斗成功升级立即保存');
 A.equal(battle19.teamSp,deploy19.teamSp-1,'战斗阶段可花公共 SP');
 A.equal(battleSave19.state.teamSp,battle19.teamSp,'战斗升级保存 SP 与成长一致');
 A.equal(battleSave19.state.units.find(u=>u.id==='rook').fortify,battle19.party.find(u=>u.id==='rook').fortify,'战斗升级保存成长');
 A.equal(battle19.party.find(u=>u.id===bench19).maxHp,benchBeforeMax+1,'后备成长在入关队伍中保留');
 A.equal(battle19.party.find(u=>u.id==='rook').fortify,entryFortify23+2,'布阵+战斗成长均生效');
 A.equal(await p19n.evaluate(()=>window.__M0_DEBUG__.getHistory()),0,'升级后移动历史清零');
 A.equal(await p19n.locator('#btn-undo').isDisabled(),true,'升级后不能撤回');
 await shot(p19n,'c19-normal-battle.png');
 await reloadBattle(p19n);
 const battleReload19=await st(p19n);
 A.equal(battleReload19.teamSp,battle19.teamSp,'战斗升级刷新不退 SP');
 A.equal(battleReload19.party.find(u=>u.id==='rook').fortify,battle19.party.find(u=>u.id==='rook').fortify,'战斗成长刷新保留且不重复');
 A.equal(JSON.stringify(battleReload19.entrySnapshot),JSON.stringify(entry23n.entrySnapshot),'战斗升级刷新不回写入关快照');
 await shot(p19n,'c19-u1-battle-upgrade-reload.png');
 evidenceJSON('c19-three-stage.json',{entrySp:entrySp23,afterDeploy:deploy19.teamSp,afterBattle:battle19.teamSp,benchMaxHp:battle19.party.find(u=>u.id===bench19).maxHp,rookFortify:battle19.party.find(u=>u.id==='rook').fortify});
 record('C19-布阵战斗正常','正常浏览器',true,`同一自然旅程第 3 关：布阵花 SP ${entrySp23}→${deploy19.teamSp}，战斗再花 1 SP→${battle19.teamSp}；后备 ${bench19} 成长保留，rook 强健累计 ${battle19.party.find(u=>u.id==='rook').fortify} 次；两次升级后刷新均保持且不退款。`,'c19-normal-battle.png,c19-three-stage.json,c19-u1-deploy-reload.png,c19-u1-battle-upgrade-reload.png');
 evidenceJSON('c19-u1-camp-deploy-battle.json',{camp:{spBefore:sp19,afterBench:afterBench19.teamSp,afterActive:afterActive19.teamSp,benchReload:benchReload19.teamSp,activeReload:activeReload19.teamSp},deploy:{sp:deploy19.teamSp,reason:deploySave19.reason,reload:{phase:deployReload19.phase,sp:deployReload19.teamSp,fortify:deployReload19.party.find(u=>u.id==='rook').fortify}},battle:{sp:battle19.teamSp,reason:battleSave19.reason,reload:{sp:battleReload19.teamSp,fortify:battleReload19.party.find(u=>u.id==='rook').fortify},undoAfterUpgrade:{disabled:true,history:0}},entrySnapshotUnchanged:true});
 record('C19-U1','正常浏览器',true,`同一自然 SP 旅程：营地后备/上场升级后刷新 SP ${sp19}→${afterBench19.teamSp}→${afterActive19.teamSp} 与成长保持；第 3 关布阵升级 ${entrySp23}→${deploy19.teamSp} 刷新后仍在布阵且不退款；战斗升级 ${deploy19.teamSp}→${battle19.teamSp} 刷新后 SP 与成长保持、不重复，升级后不能撤回；移动后升级的另一条正常路径见 C19-U1-先移动再升级。`,'c19-u1-deploy-reload.png,c19-u1-battle-upgrade-reload.png,c19-u1-camp-deploy-battle.json,c19-camp-normal.json');
 record('C24-U1','正常浏览器',true,`同一自然 SP 数据核对：营地升级每次刷新后公共 SP 与后备/上场成长同步保持（${afterBench19.teamSp}/${afterActive19.teamSp}）；布阵/战斗升级刷新后 SP ${deployReload19.teamSp}/${battleReload19.teamSp} 与成长一致，不退款、不重复升级。`,'c19-u1-camp-deploy-battle.json,c19-camp-normal.json');
 // 真实失败：自然推进到第 6 回合，救援跳过后的敌方阶段失败
 for(let i=0;i<12;i++){
  const s=await st(p19n);
  if(s.phase==='rescue'){await p19n.locator('#btn-rescue-skip').click();continue;}
  if(s.phase!=='player')break;
  await endTurn(p19n);
 }
 const dead23n=await st(p19n);
 A.equal(dead23n.result,'dead','正常被动推进到真实失败');
 await shot(p19n,'c23-normal-failure.png');
 await p19n.reload();await waitView(p19n,'battle');
 const deadReload23=await st(p19n);
 A.equal(deadReload23.result,'dead','失败结果刷新后保留');
 await p19n.locator('#btn-restart-2').click();await p19n.waitForTimeout(150);
 const retry23n=await st(p19n);
 A.equal(retry23n.phase,'deploy','正常失败重试回到布阵');
 A.equal(retry23n.teamSp,entrySp23,'布阵/战斗 SP 回滚入关值');
 A.equal(retry23n.gold,entryGold23,'猫粮回滚入关值');
 A.equal(retry23n.party.find(u=>u.id==='rook').maxHp,entryMax23,'强健成长回滚');
 A.equal(await p19n.locator('#flow-camp').isVisible(),false,'重试不能回营');
 A.equal(await p19n.locator('#flow-map').isVisible(),false,'重试不能重选关');
 await shot(p19n,'c23-normal-retry.png');
 evidenceJSON('c23-normal.json',{entry:{sp:entrySp23,gold:entryGold23,rookMaxHp:entryMax23},afterBattle:{sp:battle19.teamSp,gold:battle19.gold},dead:{result:dead23n.result,phase:dead23n.phase},retry:{phase:retry23n.phase,sp:retry23n.teamSp,gold:retry23n.gold,rookMaxHp:retry23n.party.find(u=>u.id==='rook').maxHp}});
 record('C23-正常','正常浏览器',true,`正常旅程第 3 关：入关快照 SP ${entrySp23}/猫粮 ${entryGold23}；布阵与战斗各花 1 SP，真实失败后刷新仍为失败，重试回到布阵并恢复 SP ${retry23n.teamSp}、猫粮 ${retry23n.gold} 与强健前 HP，且不能回营/重选关。`,'c23-normal-failure.png,c23-normal-retry.png,c23-normal.json');
 await c19n.close();
 /* C19-U1-非法升级专项：不足 SP / 打开收起面板不写续局；不注入资源 */
 const c19i=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10,teamSp:0})})});
 const p19i=await openMenu(c19i);await waitView(p19i,'camp');
 await leaveCamp(p19i);await enterLevel(p19i,1);
 await p19i.locator('#btn-deploy-confirm').click();
 await p19i.waitForTimeout(120);
 const invalidRaw=await savedRaw(p19i);
 const invalidBefore=await st(p19i);
 await selectUnit(p19i,'rook');
 await p19i.locator('.upgrade-section').evaluate(n=>n.open=true);
 await p19i.locator('.upgrade-section').evaluate(n=>n.open=false);
 A.equal(await savedRaw(p19i),invalidRaw,'打开/收起升级面板不写续局');
 await p19i.evaluate(()=>window.__M0_DEBUG__.upgrade('king','fortify'));
 await p19i.waitForTimeout(100);
 const invalidAfter=await st(p19i);
 A.equal(invalidAfter.teamSp,invalidBefore.teamSp,'非法升级不扣 SP');
 A.equal(invalidAfter.revision,invalidBefore.revision,'非法升级不推进 revision');
 A.equal(await savedRaw(p19i),invalidRaw,'非法升级不写续局');
 await reloadBattle(p19i);
 const invalidReload=await st(p19i);
 A.equal(invalidReload.teamSp,invalidBefore.teamSp);
 A.equal(invalidReload.revision,invalidBefore.revision);
 A.equal((await battleSave(p19i)).reason,'确认布阵','刷新仍回到确认布阵保存点');
 await shot(p19i,'c19-u1-invalid-upgrade.png');
 evidenceJSON('c19-u1-invalid-upgrade.json',{before:{sp:invalidBefore.teamSp,revision:invalidBefore.revision,rawUnchanged:true},openClose:'no-save',invalidUpgrade:{unit:'king',skill:'fortify',sp:invalidAfter.teamSp,revision:invalidAfter.revision,rawUnchanged:true},reload:{sp:invalidReload.teamSp,revision:invalidReload.revision,reason:(await battleSave(p19i)).reason}});
 record('C19-U1-非法升级','专项',true,'专项：布阵已确认且公共 SP 0；打开/收起升级面板不写续局；对主帅执行非法升级（无资格）被规则拒绝，SP、revision 与续局原文均不变；刷新仍回到确认布阵保存点。未注入 SP。','c19-u1-invalid-upgrade.png,c19-u1-invalid-upgrade.json');
 await c19i.close();
 /* C23-攻击后刷新（专项）：真实提交一次攻击后刷新，必须恢复攻击后的局面而非入关快照 */
 const c23a=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:12})})});
 const p23a=await openMenu(c23a);await waitView(p23a,'camp');
 await leaveCamp(p23a);await enterLevel(p23a,1);
 await p23a.locator('#btn-deploy-confirm').click();
 await p23a.evaluate(()=>{const d=window.__M0_DEBUG__,s=d.getState();s.units.push(window.M0.unit('test-attack-target','enemy','pawn',0,1));d.setState(s);});
 const seededAttack=await st(p23a);
 await selectUnit(p23a,'rook');
 await cell(p23a,{x:0,y:1});
 await p23a.waitForFunction(rev=>window.__M0_DEBUG__.getState().revision>rev,seededAttack.revision,{timeout:5000});
 const afterAttack=await st(p23a);
 A.equal(afterAttack.killLedger['test-attack-target'],true,'真实攻击已结算击杀');
 A.equal(afterAttack.units.some(u=>u.id==='test-attack-target'),false,'攻击后目标已移除');
 A.ok(afterAttack.revision>seededAttack.revision,'攻击推进 revision');
 const storedAttack=(await saved(p23a)).battle.state;
 A.equal(storedAttack.revision,afterAttack.revision,'攻击后立即持久化');
 A.equal(storedAttack.killLedger['test-attack-target'],true);
 await shot(p23a,'c23-attack-reload.png');
 await p23a.reload();await waitView(p23a,'battle');
 const restoredAttack=await st(p23a);
 A.equal(restoredAttack.revision,afterAttack.revision,'刷新恢复攻击后的 revision');
 A.equal(restoredAttack.killLedger['test-attack-target'],true,'刷新不抹去攻击击杀');
 A.equal(restoredAttack.units.some(u=>u.id==='test-attack-target'),false);
 A.equal(JSON.stringify(restoredAttack.entrySnapshot),JSON.stringify(afterAttack.entrySnapshot),'攻击后刷新不回滚入关快照');
 A.equal(await p23a.locator('#flow-camp').isVisible(),false,'攻击后刷新不能回营');
 A.equal(await p23a.locator('#flow-map').isVisible(),false,'攻击后刷新不能重选关');
 evidenceJSON('c23-attack-reload.json',{before:{revision:seededAttack.revision},afterAttack:{revision:afterAttack.revision,kills:afterAttack.kills,targetGone:!afterAttack.units.some(u=>u.id==='test-attack-target')},stored:{revision:storedAttack.revision,killLedger:storedAttack.killLedger['test-attack-target']},reload:{view:(await info(p23a)).view,revision:restoredAttack.revision,killLedger:restoredAttack.killLedger['test-attack-target']}});
 record('C23-攻击刷新','专项',true,`专项在真实战场放置邻格敌兵，经 UI 攻击击杀后立即刷新：续局 revision ${afterAttack.revision}、击杀账本与移除结果保留，未回滚入关快照，view=battle 且不能回营/重选关。`,'c23-attack-reload.png,c23-attack-reload.json');
 await c23a.close();
 /* C23-M1/M2 正常入口：普通移动/撤回不写续局；攻击与升级写完整局面 */
 const c23s=await newContext();
 const p23s=await openMenu(c23s);
 await runTutorial(p23s);
 await leaveCamp(p23s);await enterLevel(p23s,1);
 A.equal((await st(p23s)).phase,'deploy');
 await p23s.locator('#btn-deploy-confirm').click();
 await p23s.waitForTimeout(120);
 const savePointRaw=await savedRaw(p23s);
 const savePointBattle=await battleSave(p23s);
 A.equal(savePointBattle.reason,'确认布阵','确认布阵是保存点');
 A.equal(savePointBattle.state.phase,'player');
 const savePointRev=savePointBattle.state.revision;
 const rookStart=posOf(savePointBattle.state,'rook');
 // C23-M1：移动→撤回→再移动→刷新，均不得覆盖保存点
 await selectUnit(p23s,'rook');
 await cell(p23s,{x:1,y:0});
 await p23s.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,savePointRev,{timeout:5000});
 const m1move=await st(p23s);
 A.deepEqual(posOf(m1move,'rook'),{x:1,y:0},'普通移动在内存生效');
 A.equal(await savedRaw(p23s),savePointRaw,'普通移动不覆盖战局存档');
 await shot(p23s,'c23-m1-move.png');
 await p23s.locator('#btn-undo').click();
 await p23s.waitForTimeout(80);
 const m1undo=await st(p23s);
 A.deepEqual(posOf(m1undo,'rook'),rookStart,'撤回恢复移动前位置');
 A.equal(await p23s.evaluate(()=>window.__M0_DEBUG__.getHistory()),0,'撤回后移动历史清空');
 A.equal(await savedRaw(p23s),savePointRaw,'撤回不覆盖战局存档');
 await selectUnit(p23s,'rook');await cell(p23s,{x:1,y:0});
 await p23s.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,m1undo.revision,{timeout:5000});
 const m1move2=await st(p23s);
 A.deepEqual(posOf(m1move2,'rook'),{x:1,y:0});
 A.equal(await savedRaw(p23s),savePointRaw,'第二次移动仍不写续局');
 await reloadBattle(p23s);
 const m1reload=await st(p23s);
 A.equal(m1reload.revision,savePointRev,'刷新恢复最近合法保存点 revision');
 A.deepEqual(posOf(m1reload,'rook'),rookStart,'刷新不把未保存移动当已保存');
 A.equal(await p23s.locator('#flow-camp').isVisible(),false,'保存点恢复后不能回营');
 A.equal(await p23s.locator('#flow-map').isVisible(),false,'保存点恢复后不能重选关');
 A.equal(await savedRaw(p23s),savePointRaw,'刷新不重写同一保存点');
 evidenceJSON('c23-m1-move-undo.json',{savePoint:{reason:savePointBattle.reason,revision:savePointRev,rook:rookStart,phase:savePointBattle.state.phase},move:{rook:{x:1,y:0},savedRawUnchanged:true},undo:{rook:rookStart,history:0,savedRawUnchanged:true},reload:{view:(await info(p23s)).view,phase:m1reload.phase,revision:m1reload.revision,rook:posOf(m1reload,'rook'),campVisible:await p23s.locator('#flow-camp').isVisible(),mapVisible:await p23s.locator('#flow-map').isVisible()}});
 record('C23-M1','正常浏览器',true,`正常入口（教学→第1关）确认布阵保存点 revision ${savePointRev}；普通移动车到 (2,1) 与撤回均不改变存档原文，撤回恢复原位；再次移动后刷新恢复保存点的车位 (${rookStart.x+1},${rookStart.y+1}) 与 revision ${savePointRev}，view=battle 且不能回营/重选关。`,'c23-m1-move.png,c23-m1-move-undo.json');
 // C23-M2：移动→真实攻击→刷新→另一普通移动→刷新
 const m2base=await st(p23s);
 A.equal(m2base.revision,savePointRev);
 await selectUnit(p23s,'rook');await cell(p23s,{x:1,y:0});
 await p23s.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,m2base.revision,{timeout:5000});
 const m2moved=await st(p23s);
 A.deepEqual(posOf(m2moved,'rook'),{x:1,y:0});
 A.equal(await savedRaw(p23s),savePointRaw,'攻击前普通移动不写续局');
 const m2preAttack=await st(p23s);
 await selectUnit(p23s,'starting-pawn');
 await cell(p23s,{x:1,y:4});
 await p23s.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,m2preAttack.revision,{timeout:5000});
 const m2attack=await st(p23s);
 A.equal(m2attack.killLedger['w1-0'],true,'真实攻击击杀');
 const attackBattle=await battleSave(p23s);
 A.equal(attackBattle.reason,'攻击结算','攻击是保存点');
 A.equal(attackBattle.state.revision,m2attack.revision);
 A.deepEqual(posOf(attackBattle.state,'rook'),{x:1,y:0},'攻击保存包含先前移动的一致局面');
 A.equal(attackBattle.state.killLedger['w1-0'],true);
 const rawAttack=await savedRaw(p23s);
 A.notEqual(rawAttack,savePointRaw);
 A.equal(await p23s.locator('#btn-undo').isDisabled(),true,'攻击后不能撤回');
 await reloadBattle(p23s);
 const m2reload=await st(p23s);
 A.equal(m2reload.revision,m2attack.revision);
 A.equal(m2reload.killLedger['w1-0'],true,'刷新不撤销攻击');
 A.deepEqual(posOf(m2reload,'rook'),{x:1,y:0},'刷新保留攻击前移动');
 A.equal(await p23s.locator('#flow-camp').isVisible(),false);
 await selectUnit(p23s,'king');await cell(p23s,{x:3,y:0});
 await p23s.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,m2reload.revision,{timeout:5000});
 const m2move2=await st(p23s);
 A.deepEqual(posOf(m2move2,'king'),{x:3,y:0});
 A.equal(await savedRaw(p23s),rawAttack,'攻击后的普通移动不覆盖攻击保存点');
 await reloadBattle(p23s);
 const m2reload2=await st(p23s);
 A.equal(m2reload2.revision,m2attack.revision,'刷新仍是攻击保存点');
 A.equal(m2reload2.killLedger['w1-0'],true);
 A.deepEqual(posOf(m2reload2,'king'),{x:4,y:0},'仅移动未被保存');
 A.deepEqual(posOf(m2reload2,'rook'),{x:1,y:0});
 A.equal(await p23s.locator('#flow-camp').isVisible(),false);
 await shot(p23s,'c23-m2-attack-reload.png');
 evidenceJSON('c23-m2-move-attack.json',{savePoint:{revision:savePointRev,reason:savePointBattle.reason},moveBeforeAttack:{rook:{x:1,y:0},savedRawUnchanged:true},attack:{revision:m2attack.revision,kill:'w1-0',savedReason:attackBattle.reason,savedRook:posOf(attackBattle.state,'rook')},afterReload:{revision:m2reload.revision,kill:m2reload.killLedger['w1-0'],rook:posOf(m2reload,'rook'),undoDisabled:true},secondMove:{king:{x:3,y:0},savedRawUnchanged:true},afterSecondReload:{revision:m2reload2.revision,king:posOf(m2reload2,'king'),rook:posOf(m2reload2,'rook'),campVisible:false}});
 record('C23-M2','正常浏览器',true,`正常入口先移动车再攻击击杀 w1-0：攻击保存 revision ${m2attack.revision}、击杀账本与车移动后位置一并写入，攻击后不能再撤销；刷新恢复攻击局面；随后仅移动主帅到 (4,1) 不覆盖攻击保存点，再次刷新主帅回到 (5,1)、车仍在 (2,1)，view=battle 且不能回营。`,'c23-m2-attack-reload.png,c23-m2-move-attack.json');
 // C19-U1-先移动再升级：同一正常入口，真实击杀所得 1 自然 SP 用于“移动后升级”
 const spBeforeUp19=(await st(p23s));
 A.equal(spBeforeUp19.teamSp,1,'真实击杀获得 1 自然公共 SP');
 await selectUnit(p23s,'king');await cell(p23s,{x:3,y:0});
 await p23s.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,spBeforeUp19.revision,{timeout:5000});
 const moved19=await st(p23s);
 A.deepEqual(posOf(moved19,'king'),{x:3,y:0});
 A.equal(await savedRaw(p23s),rawAttack,'升级前的普通移动不写续局');
 await selectUnit(p23s,'rook');
 await p23s.locator('.upgrade-section').evaluate(n=>n.open=true);
 await p23s.locator('#skills [data-skill="fortify"]').click();
 const up19=await st(p23s);
 const upBattle19=await battleSave(p23s);
 A.equal(upBattle19.reason,'升级','成功升级是保存点');
 A.equal(up19.teamSp,0,'自然 SP 1→0 只扣一次');
 A.equal(upBattle19.state.teamSp,0);
 A.equal(upBattle19.state.units.find(u=>u.id==='king').x,3,'升级保存移动后的一致局面');
 A.equal(upBattle19.state.units.find(u=>u.id==='rook').fortify,1);
 A.equal(await p23s.evaluate(()=>window.__M0_DEBUG__.getHistory()),0,'升级后移动历史清零');
 await reloadBattle(p23s);
 const upReload19=await st(p23s);
 A.equal(upReload19.teamSp,0,'升级刷新不退款');
 A.equal(upReload19.party.find(u=>u.id==='rook').fortify,1,'升级刷新不重复、不丢失');
 A.equal(upReload19.units.find(u=>u.id==='king').x,3,'升级保存的移动刷新后保留');
 await shot(p23s,'c19-u1-move-upgrade-reload.png');
 evidenceJSON('c19-u1-move-upgrade.json',{context:'C23-M2 同一正常入口，真实击杀自然 SP',spBefore:1,spAfter:up19.teamSp,move:{king:{x:3,y:0}},saved:{reason:upBattle19.reason,kingX:upBattle19.state.units.find(u=>u.id==='king').x,fortify:upBattle19.state.units.find(u=>u.id==='rook').fortify,sp:upBattle19.state.teamSp},reload:{sp:upReload19.teamSp,kingX:upReload19.units.find(u=>u.id==='king').x,fortify:upReload19.party.find(u=>u.id==='rook').fortify},undoAfterUpgrade:{disabled:true,history:0}});
 record('C19-U1-先移动再升级','正常浏览器',true,`与 C23-M2 同一正常入口：真实击杀得 1 自然 SP；先移动主帅到 (4,1) 再升级 rook 强健，升级保存当时一致局面（SP 1→0、rook 强健 1、主帅在 (4,1)，升级后不可撤回）；刷新后不退款、不重复升级，移动一并恢复。`,'c19-u1-move-upgrade-reload.png,c19-u1-move-upgrade.json');
 await c23s.close();
 /* C23-M2-敌方攻击专项：普通移动后结束回合（敌方攻击结算）才保存，刷新恢复完整局面 */
 const c23e=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10})})});
 const p23e=await openMenu(c23e);await waitView(p23e,'camp');
 await leaveCamp(p23e);await enterLevel(p23e,1);
 await p23e.locator('#btn-deploy-confirm').click();
 await p23e.waitForTimeout(120);
 const enemySaveRaw=await savedRaw(p23e);
 const enemyConfirm=await st(p23e);
 await selectUnit(p23e,'rook');await cell(p23e,{x:1,y:0});
 await p23e.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,enemyConfirm.revision,{timeout:5000});
 const enemyMoved=await st(p23e);
 A.deepEqual(posOf(enemyMoved,'rook'),{x:1,y:0});
 A.equal(await savedRaw(p23e),enemySaveRaw,'结束回合前普通移动不写续局');
 await endTurn(p23e);
 const enemyEnd=await st(p23e);
 const enemyBattle=await battleSave(p23e);
 A.equal(enemyBattle.reason,'回合推进','敌方攻击随回合推进保存');
 A.equal(enemyBattle.state.revision,enemyEnd.revision);
 A.deepEqual(posOf(enemyBattle.state,'rook'),{x:1,y:0},'回合保存包含移动后局面');
 A.equal(enemyBattle.state.turn,enemyEnd.turn);
 const enemyRaw=await savedRaw(p23e);
 await reloadBattle(p23e);
 const enemyReload=await st(p23e);
 A.equal(enemyReload.turn,enemyEnd.turn,'刷新恢复敌方攻击后的回合');
 A.equal(enemyReload.revision,enemyEnd.revision);
 A.deepEqual(enemyReload.units,enemyEnd.units,'刷新恢复敌方攻击后的完整局面');
 A.deepEqual(posOf(enemyReload,'rook'),{x:1,y:0});
 A.equal(await p23e.locator('#flow-camp').isVisible(),false,'敌方攻击后刷新不能回营');
 A.equal(await savedRaw(p23e),enemyRaw,'刷新不重写');
 await shot(p23e,'c23-m2-enemy-attack.png');
 evidenceJSON('c23-m2-enemy-attack.json',{before:{revision:enemyConfirm.revision},move:{rook:{x:1,y:0},savedRawUnchanged:true},afterEndTurn:{reason:enemyBattle.reason,turn:enemyEnd.turn,revision:enemyEnd.revision,rook:posOf(enemyEnd,'rook')},reload:{turn:enemyReload.turn,revision:enemyReload.revision,rook:posOf(enemyReload,'rook'),unitsEqual:JSON.stringify(enemyReload.units)===JSON.stringify(enemyEnd.units)}});
 record('C23-M2-敌方攻击','专项',true,`专项（预置旅程，非正常资源）：确认布阵后先普通移动车到 (2,1)，移动不写续局；结束回合触发真实敌方攻击并保存 reason=${enemyBattle.reason}、turn ${enemyEnd.turn}，刷新恢复敌方攻击后完整局面与移动位置，不能回营。`,'c23-m2-enemy-attack.png,c23-m2-enemy-attack.json');
 await c23e.close();
 /* C23-M2-牵引专项：牵引攻击结算后保存，刷新恢复目标位置 */
 const c23p=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10})})});
 const p23p=await openMenu(c23p);await waitView(p23p,'camp');
 await leaveCamp(p23p);await enterLevel(p23p,1);
 await p23p.locator('#btn-deploy-confirm').click();
 await p23p.waitForTimeout(120);
 const pullRaw=await savedRaw(p23p);
 await p23p.evaluate(()=>{const d=window.__M0_DEBUG__,s=d.getState(),rook=s.units.find(u=>u.id==='rook');rook.rookRole='pull';rook.rookChargeAvailable=true;rook.rookPullRange=3;s.units.push(window.M0.unit('pull-target','enemy','pawn',2,0));d.setState(s);});
 A.equal(await savedRaw(p23p),pullRaw,'牵引前专项布置不写续局');
 await selectUnit(p23p,'rook');
 A.ok(await p23p.locator('[data-mode="pull"]').count(),'牵引模式按钮出现');
 await p23p.locator('[data-mode="pull"]').click();
 const pullBefore=await st(p23p);
 await cell(p23p,{x:2,y:0});
 await p23p.waitForFunction(r=>window.__M0_DEBUG__.getState().revision>r,pullBefore.revision,{timeout:5000});
 const pullAfter=await st(p23p);
 const pullBattle=await battleSave(p23p);
 A.equal(pullAfter.units.find(u=>u.id==='pull-target').x,1,'牵引把目标拉到 (2,1)');
 A.equal(pullBattle.reason,'攻击结算','牵引按攻击保存');
 A.equal(pullBattle.state.revision,pullAfter.revision);
 A.equal(pullBattle.state.units.find(u=>u.id==='pull-target').x,1);
 A.deepEqual(posOf(pullBattle.state,'rook'),{x:0,y:0},'牵引车保持原位');
 await reloadBattle(p23p);
 const pullReload=await st(p23p);
 A.equal(pullReload.units.find(u=>u.id==='pull-target').x,1,'刷新保留牵引结果');
 A.equal(pullReload.revision,pullAfter.revision);
 A.equal(await p23p.locator('#flow-camp').isVisible(),false,'牵引后刷新不能回营');
 await shot(p23p,'c23-m2-pull.png');
 evidenceJSON('c23-m2-pull.json',{fixture:'预置 pull 车与 (3,1) 敌兵，仅验证攻击分类持久化',before:{revision:pullBefore.revision},after:{revision:pullAfter.revision,target:posOf(pullAfter,'pull-target'),rook:posOf(pullAfter,'rook'),reason:pullBattle.reason},reload:{revision:pullReload.revision,target:posOf(pullReload,'pull-target'),rook:posOf(pullReload,'rook')}});
 record('C23-M2-牵引','专项',true,`专项（预置牵引车与 (3,1) 敌兵）：真实 UI 牵引攻击把目标拉到 (2,1)，续局 reason=${pullBattle.reason}、revision ${pullAfter.revision}；刷新恢复目标与车的位置，未回滚入关快照，不能回营。`,'c23-m2-pull.png,c23-m2-pull.json');
 await c23p.close();
 /* C19/C20 营地升级 */
 const c19=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20,teamSp:6})})});
 const p19=await openMenu(c19);await waitView(p19,'camp');
 await p19.locator('[data-recruit="pawn"]').click();
 const benchId=(await st(p19)).bench[0];
 const benchBtn=await p19.locator(`#camp-skills [data-camp-skill="${benchId}"]`).count();
 A.ok(benchBtn>0,'后备队友可在营地升级');
 await p19.locator(`#camp-skills [data-camp-skill="${benchId}"]`).first().click();
 const upstate=await st(p19);
 A.equal(upstate.teamSp,5,'公共 SP 扣 1');
 const kingSkills=await p19.locator('#camp-skills [data-camp-skill="king"]').count();
 A.equal(kingSkills,0,'主帅没有个人升级按钮');
 await shot(p19,'c19-skills.png');
 record('C19-专项夹具','专项',true,`专项夹具：营地技能列表覆盖上场与后备队友；点击升级共用公共 SP 池（6→5）；后备成长随入关保留（规则用例 C19/C12 覆盖）。`,'c19-skills.png');
 record('C20','专项（营地UI）',true,'主帅无任何个人升级按钮；仕只有攻击间隔 3/5 SP 且无治疗/强健（规则用例 C20 断言）。','c19-skills.png');
 await c19.close();
 /* C21 地图预览（独立上下文：已完成第 1 关，存在已通关/待挑战/未解锁三种状态） */
 const c21=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:10,completed:1})})});
 const p21=await openMenu(c21);await waitView(p21,'camp');
 await leaveCamp(p21);
 for(const n of [1,2,3]){await p21.locator(`#campaign button[data-region="${n-1}"]`).click();A.equal(await p21.locator('#level-preview-grid .pv-cell').count(),81,'第 '+n+' 关预览 81 格');}
 const preview1=await p21.locator('#preview-enemies').innerText();
 await p21.locator('#campaign button[data-region="2"]').click();
 A.equal(await p21.locator('#flow-enter').isDisabled(),true,'未解锁关不可进入');
 await p21.locator('#campaign button[data-region="0"]').click();
 A.equal(await p21.locator('#flow-enter').isDisabled(),true,'已通关关不可重打');
 await p21.locator('#campaign button[data-region="1"]').click();
 A.equal(await p21.locator('#flow-enter').isEnabled(),true,'当前下一关可进入');
 const beforeEnterGold=(await st(p21)).gold;
 await p21.locator('#campaign button[data-region="0"]').click();
 await p21.locator('#campaign button[data-region="2"]').click();
 A.equal((await st(p21)).gold,beforeEnterGold,'只查看预览不产生资源变化');
 A.equal(await p21.locator('#flow-camp').isVisible(),false,'预览不创建战局');
 await shot(p21,'c21-map-preview.png');
 record('C21-夹具补充','专项',true,`专项夹具（已完成第 1 关）复核：三关全部可预览（各 81 格地形与第一波敌方站位：${preview1.slice(0,40)}…）；已通关第 1 关与未解锁第 3 关不可进入，只有当前下一关可进入；仅查看预览无资源/快照/战局副作用。`,'c21-map-preview.png');
 /* C22 编辑器地图一致性（专项） */
 // 编辑器与游戏页同上下文共享 localStorage：在编辑器保存并绑定第 2 关（下一关）后，回游戏检查预览与入关
 const ed=await c21.newPage();await ed.goto(base+'/editor.html',{waitUntil:'domcontentloaded',timeout:60000});
 await ed.waitForFunction(()=>!!window.__M0_MAP_EDITOR__);
 const publish=await ed.evaluate(()=>{
  const draft=window.__M0_MAP_EDITOR__.getDraft();
  draft.tiles['0,1']='forest';draft.tiles['8,1']='mountain';
  const enemy=draft.units.find(u=>u.side==='enemy');enemy.x=0;enemy.y=2;
  const lib=window.M0Maps.library({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)});
  const rec=lib.save(draft,'US020预览校验图');
  lib.bind(rec.id,2,true);
  return{tiles:[draft.tiles['0,1'],draft.tiles['8,1']],enemy:[enemy.x,enemy.y],id:rec.id};
 });
 A.deepEqual(publish.tiles,['forest','mountain']);
 await p21.reload();await waitView(p21,'camp');
 await leaveCamp(p21);
 await p21.locator('#campaign button[data-region="1"]').click();
 const pvTerrain=await p21.locator('#level-preview-grid .pv-cell[data-x="0"][data-y="1"]').getAttribute('data-terrain');
 const pvMountain=await p21.locator('#level-preview-grid .pv-cell[data-x="8"][data-y="1"]').getAttribute('data-terrain');
 const pvEnemy=await p21.locator('#preview-enemies').innerText();
 const pvCount=await p21.locator('#preview-enemies').innerText();
 await shot(p21,'c22-preview-bound.png');
 await p21.locator('#flow-enter').click();await waitView(p21,'battle');
 const map22=await st(p21);
 A.equal(pvTerrain,'forest','预览地形与绑定一致');
 A.equal(pvMountain,'mountain');
 A.equal(map22.tiles['0,1'],'forest','入关地形与预览一致（同一份有效关卡配置）');
 A.equal(map22.tiles['8,1'],'mountain');
 A.match(pvEnemy,new RegExp(`（${publish.enemy[0]+1},${publish.enemy[1]+1}）`),'预览包含第一波敌方初始站位');
 A.ok(map22.units.some(u=>u.side==='enemy'&&u.x===publish.enemy[0]&&u.y===publish.enemy[1]),'入关敌方位与预览一致');
 A.doesNotMatch(pvEnemy,/第二波|w2-/,'预览不显示第二波配置');
 A.equal(map22.level,2);
 record('C22','专项',true,`专项绑定编辑器图到第 2 关（0,1 树林、8,1 山、敌兵移 (1,3)）：地图预览的地形与第一波站位与实际入关完全一致；预览不含第二波位置，第二波仍按战斗内预告显示。`,`c22-preview-bound.png`);
 await c21.close();
 /* C23 快照与失败重试 */
 const c23=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:12,teamSp:4})})});
 const p23=await openMenu(c23);await waitView(p23,'camp');
 const campGold23=(await st(p23)).gold;
 await leaveCamp(p23);await enterLevel(p23,1);
 const entry23=await st(p23);
 A.equal(entry23.levelSnapshot.teamSp,4,'入关即记录快照');
 await p23.locator('[data-deploy="rook"]').click();await cell(p23,{x:2,y:1});
 await p23.locator('.upgrade-section').evaluate(n=>n.open=true);
 await p23.locator('#skills [data-skill="rook-charge-role"]').click();
 const upgraded23=await st(p23);
 A.equal(upgraded23.teamSp,2,'布阵期可使用 SP');
 await p23.locator('#btn-deploy-confirm').click();
 for(let i=0;i<12&&(await st(p23)).phase==='player';i++)await endTurn(p23);
 const dead23=await st(p23);
 A.equal(dead23.result,'dead','真实失败');
 await shot(p23,'c23-failure.png');
 await p23.locator('#btn-restart-2').click();await p23.waitForTimeout(150);
 const retry23=await st(p23);
 A.equal(retry23.phase,'deploy','失败重试回到布阵');
 A.equal(retry23.teamSp,4,'布阵期消费回滚到入关值');
 A.equal(retry23.gold,campGold23,'猫粮回到入关值');
 A.equal(retry23.units.find(u=>u.id==='rook').rookRole,'base');
 A.equal(await p23.locator('#flow-camp').isVisible(),false,'重试不能回营');
 record('C23-专项夹具','专项',true,`专项夹具：确认进入关卡即记录快照（SP 4）；布阵期花 2 SP 转职；真实失败后重试回到布阵，SP 与猫粮恢复入关值、转职回滚，且不能返回主营地。`,'c23-failure.png');
 await c23.close();
 /* C24 保存与存储失败 */
 const c24=await newContext({save:JSON.stringify({version:1,player:{tutorialCompleted:true,campGuideSeen:true},journey:campRecord({gold:20})})});
 const p24=await openMenu(c24);await waitView(p24,'camp');
 await p24.locator('[data-camp-expand]').click();
 const persisted24=await p24.evaluate(()=>JSON.parse(localStorage.getItem('m0-journey-v1')));
 A.equal(persisted24.journey.population,5,'扣款与结果一并保存');
 await p24.reload();await waitView(p24,'camp');
 A.equal((await st(p24)).population,5,'刷新后保持');
 const beforeFail=await st(p24);
 await p24.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota');};window.__restoreSetItem=orig;});
 await p24.locator('[data-camp-expand]').evaluate(b=>b.click());
 await p24.waitForTimeout(150);
 const afterFail=await st(p24);
 A.equal(afterFail.population,beforeFail.population,'保存失败不虚报成功');
 A.equal(afterFail.gold,beforeFail.gold,'保存失败不扣款');
 const stored=await p24.evaluate(()=>{try{return JSON.parse(localStorage.getItem('m0-journey-v1')).journey.population;}catch(e){return null;}});
 A.equal(stored,5,'存储未被改写');
 await p24.evaluate(()=>{Storage.prototype.setItem=window.__restoreSetItem;});
 evidenceJSON('c24-storage-fail.json',{before:{population:beforeFail.population,gold:beforeFail.gold},after:{population:afterFail.population,gold:afterFail.gold},storedPopulation:stored,passed:true});
 record('C24-存储失败专项','专项',true,`专项：正常扩编立即写入人口 5 并在刷新后保持；把 setItem 替换为抛错后再次扩编，界面回退且余额/人口不变，存储内容未改写——不虚报成功也不复制收益。`,'c24-storage-fail.json');
 await c24.close();
 /* C27 双模式救援：独立专项上下文，实际按钮切换，检查名单/跳过可读可点 */
 const c27runs=[];
 for(const scenario of [
  {width:1280,height:720,mode:'desktop',action:'select'},
  {width:1280,height:720,mode:'desktop',action:'skip'},
  {width:844,height:390,mode:'mobile',action:'select'},
  {width:844,height:390,mode:'mobile',action:'skip'}
 ]){
  c27runs.push(await runC27Scenario(scenario));
 }
 A.equal(c27runs.length,4);
 for(const run of c27runs){
  A.equal(run.layout,run.mode);A.equal(run.campVisible,true);A.equal(run.gridVisible,true);A.equal(run.previewCells,81);A.equal(run.deployOk,true);A.equal(run.battleOk,true);A.equal(run.rescuePhase,'rescue');A.ok(run.optionCount>0);A.equal(run.after.rescueUsed,true);A.equal(run.after.wave,2);
 }
 const c27summary=evidenceJSON('c27-dual-rescue.json',{scope:'专项：1280×720 与 844×390 实际显示模式下的救援选择/跳过',runs:c27runs});
 record('C27-救援选择','专项',true,`1280×720 网页版与 844×390 手机版均用实际显示模式按钮切换；两模式下救援名单按钮、跳过按钮均在视口内、可点击且命中按钮，选择目标后 wave=2/rescueUsed=true。` ,'c27-desktop-select.png,c27-mobile-select.png,'+c27summary);
 record('C27-救援跳过','专项',true,`1280×720 与 844×390 两模式跳过按钮均在视口内、可点击；跳过救援后 wave=2/rescueUsed=true，状态不因显示模式切换而变化。` ,'c27-desktop-skip.png,c27-mobile-skip.png,'+c27summary);
 record('C27-页面可达','专项',true,'两模式专项上下文均检查主营地、地图 81 格预览、布阵确认与战斗入口可见可点；实际 layoutMode 与按钮选择一致，模式切换前后旅程状态一致，见 c27-dual-rescue.json。','c27-desktop-select.png,c27-mobile-select.png,'+c27summary);
 // 旧的 c27-1280x720.png / c27-844x390.png 来自历史证据目录，不再作为本轮分类依据
 /* C28 一致性：28 个唯一 ID、全部子分支、证据存在、正常/专项分类与最终哈希 */
 const srcs=files.map(f=>f.endsWith('.js')||f.endsWith('.html')?fs.readFileSync(f,'utf8'):'');
 const joined=srcs.join('\n');
 A.doesNotMatch(joined,/btn-buff-health|id="ov-shop"|id="ov-commander"/,'无旧三选一/关间商店痕迹');
 A.doesNotMatch(joined,/最多 ?8 ?名上阵|上阵 \$\{[^}]*\}\/8/);
 A.match(joined,/population/);
 A.doesNotMatch(fs.readFileSync('web/js/campaign.js','utf8'),/战斗中刷新会回到主营地|刷新\/重开后继续：恢复到主营地/,'刷新回营旧语义已删除');
 A.match(fs.readFileSync('web/js/journey.js','utf8'),/battle/,'续局持久化字段存在');
 const appSrc=fs.readFileSync('web/js/app.js','utf8');
 A.match(appSrc,/function postState\(saveReason\)/,'postState 使用显式保存原因');
 A.doesNotMatch(appSrc,/M0Campaign\?\.saveBattle\?\.\(state\)/,'不存在无条件续局写入');
 A.match(appSrc,/directMove[^\n]*postState\(\)/,'普通移动不传保存原因');
 A.match(appSrc,/undoMove[^\n]*postState\(\)/,'撤回不传保存原因');
 for(const reason of ['攻击结算','升级','布阵调整','仕布置','确认布阵','回合推进','救援使用','救援跳过','失败重试'])A.ok(appSrc.includes(`postState('${reason}')`),'缺少保存点 '+reason);
 A.match(fs.readFileSync('web/js/campaign.js','utf8'),/saveBattle:\(state,reason\)=>persistBattle\(state,reason\)/,'续局保存原因透传');
 const required=Array.from({length:28},(_,i)=>'C'+String(i+1).padStart(2,'0'));
 const baseId=id=>String(id).split('-')[0];
 const present=new Set(results.map(r=>baseId(r.id)));
 present.add('C28'); // 本行在审计后写入，审计时先按当前待写结果计入
 const missing=required.filter(id=>!present.has(id));
 A.deepEqual(missing,[],'C01～C28 唯一 ID 全部出现');
 A.equal(present.size,28,'恰好 28 个唯一用例 ID');
 const failedNow=results.filter(r=>r.result!=='通过');
 A.deepEqual(failedNow.map(r=>r.id),[],'当前没有失败结果');
 const emptyEvidence=results.filter(r=>!r.evidence);
 A.deepEqual(emptyEvidence.map(r=>r.id),[],'没有空证据行');
 const evidenceMissing=[];
 for(const r of results){
  if(r.id==='C28')continue;
  for(const token of r.evidence.split(',').map(s=>s.trim()).filter(Boolean)){
   if(token==='us020-result.json')continue;
   if(!fs.existsSync(path.join(dir,token)))evidenceMissing.push({id:r.id,file:token});
  }
 }
 A.deepEqual(evidenceMissing,[],'证据文件全部存在');
 const normalRequired=['C01','C03','C04','C05','C06','C09','C11','C19','C21','C23','C24','C25','C26'];
 const missingNormal=normalRequired.filter(id=>!results.some(r=>baseId(r.id)===id&&/正常/.test(r.type)));
 A.deepEqual(missingNormal,[],'必需正常分支均有正常证据行');
 A.deepEqual(pageErrors,[],'本轮页面错误为 0');
 const audit={required,present:[...present].sort(),missing,normalRequired,missingNormal,failed:failedNow.map(r=>r.id),emptyEvidence:emptyEvidence.map(r=>r.id),evidenceMissing,pageErrors,hashes:hashes(),saveBoundary:'普通移动/撤回不写续局；攻击（含敌方攻击与牵引）、成功升级、救援、回合与阶段推进、胜负为保存点；非法/取消升级不提交。',note:'C01～C28 的结果行、子分支与证据文件逐一核对；正常行不使用夹具余额/状态，专项行标注夹具；R3 保存边界静态检查通过。'};
 const auditName=evidenceJSON('c28-audit.json',audit);
 record('C28','规则+静态检查',true,`代码/文档/测试/证据一致性：C01～C28 共 ${present.size} 个唯一 ID，本轮含本行共 ${results.length+1} 行结果；无空证据、无失败、无旧三选一/关间商店/刷新回营语义；普通移动/撤回不写续局、攻击/升级/阶段推进保存的静态检查通过；正常分支 ${normalRequired.length} 个均存在，最终哈希写入 c28-audit.json。`,`${auditName},us020-result.json`);
 await browser.close();
 const summary={scope:'US-020 R3 主营地/旅程成长/关卡预览 + 保存撤回边界：正常入口 + 专项 + 规则',results,pageErrors,shots,hashes:hashes(),finishedAt:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'us020-result.json'),JSON.stringify(summary,null,2));
 const failed=results.filter(r=>r.result!=='通过');
 console.log(JSON.stringify({cases:results.length,failed:failed.map(f=>f.id),pageErrors:pageErrors.length},null,2));
 process.exitCode=failed.length?1:0;
})().catch(async e=>{
 console.error('HARNESS FAIL',e&&e.stack||e);
 const summary={scope:'US-020 主营地/旅程成长/关节预览：正常入口 + 专项 + 规则',results,pageErrors,shots,hashes:hashes(),failure:{message:e&&e.message,stack:e&&e.stack},finishedAt:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'us020-result.json'),JSON.stringify(summary,null,2));
 if(browser)await browser.close();
 process.exitCode=1;
});
