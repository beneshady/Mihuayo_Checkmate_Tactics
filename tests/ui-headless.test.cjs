// US012/US020：历史 UI 专项探针，使用显式隔离起点（?device-preview=regression）真实点击。
// US-020 已把关间商店、三选一与 8 人固定编队改为主营地（招募/扩编/旅程增益），
// 相关购买、编队、跨关与失败重试改由 tests/us020-acceptance-browser.cjs 从正常入口覆盖；
// 本文件保留不依赖商店的战斗与展示回归，失效断言按 US-020 合同替换并在此说明。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const {generate,R}=require('./normal-playthrough.cjs');
const url=process.env.M0_TEST_URL||'http://127.0.0.1:8771';
const evidence=path.resolve('docs/us/us007-us011-evidence/ui-regression');fs.mkdirSync(evidence,{recursive:true});
const crypto=require('node:crypto'),versionFiles=['web/index.html','web/js/rules.js','web/js/app.js','web/js/ui.js','web/ui.css','web/desktop.css','web/mobile.css'];
const hashes=()=>Object.fromEntries(versionFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const versions=hashes();
let browser,page,errors=[],passed=0;
async function state(){return page.evaluate(()=>window.__M0_DEBUG__.getState())}
async function clickCell(to){const p=await page.evaluate(p=>window.__M0_DEBUG__.grid.screenPoint(p),to);await page.mouse.click(p.x,p.y)}
async function select(id){if((await state()).phase==='deploy'){await page.locator('[data-deploy="'+id+'"]').click();return}
 if(page.viewportSize().width<=900){await page.locator('#mobile-tools [data-ui-view="units"]').click();await page.locator('[data-unit="'+id+'"]').click();if(await page.locator('#btn-mobile-info-close').isVisible())await page.locator('#btn-mobile-info-close').click();}
 else await page.locator('[data-unit="'+id+'"]').click();
}
async function end(){await page.locator('#btn-end').click();await page.locator('#btn-confirm-yes').click()}
async function inject(s){await page.evaluate(s=>window.__M0_DEBUG__.setState(s),s)}
async function action(a){await select(a.actor);if(a.type==='directional'&&page.viewportSize().width<=900){await page.locator('[data-dir="'+a.direction+'"]').click();await page.locator('#btn-execute').click();return}
 if(['charge','charge-corpse','pull','pull-collision'].includes(a.type))await page.locator('[data-mode="'+(a.type.startsWith('charge')?'charge':'pull')+'"]').click();
 await clickCell(a.to);if(page.viewportSize().width<=900&&!['move','rook-move'].includes(a.type))await page.locator('#btn-execute').click();
}
function snapshot(s){return {phase:s.phase,wave:s.wave,turn:s.turn,gold:s.gold,teamSp:s.teamSp,kills:s.kills,units:s.units.map(u=>[u.id,u.x,u.y,u.hp,u.kills])}}
async function open(width=1280,height=800){await page.setViewportSize({width,height});await page.goto(url+'/?device-preview=regression&validation=us020-r1-'+width);await page.waitForFunction(()=>!!window.__M0_DEBUG__);A.equal((await state()).phase,'deploy');A.equal(await page.locator('#scene').evaluate(n=>n.inert),false)}
async function formal(width,height){
 await open(width,height);const oldMap=R.defaultMap();oldMap.name='US010历史UI专项地图';for(const k of Object.keys(oldMap.tiles))if(['mountain','forest'].includes(oldMap.tiles[k]))oldMap.tiles[k]='land';oldMap.units.splice(2,0,{id:'starting-cannon',side:'player',kind:'cannon',x:1,y:2});const oldStart=R.newTestGame(oldMap);oldStart.phase='deploy';await page.evaluate(s=>window.__M0_DEBUG__.setState(s),oldStart);const {steps}=generate('move',oldStart);let shot=false;
 for(const step of steps){if(step.type==='deploy'){await select(step.actor);await clickCell(step.to)}else if(step.type==='confirmDeployment')await page.locator('#btn-deploy-confirm').click();else if(step.type==='buff')await page.evaluate(b=>window.__M0_DEBUG__.chooseBuff(b),step.buff);else if(step.type==='action')await action(step.action);else if(step.type==='end')await end();else throw Error('unexpected step');
 const s=await state();A.deepEqual(snapshot(s),step.expected,'normal '+width+' '+JSON.stringify({type:step.type,action:step.action?.actor,turn:step.expected.turn}));
 if(s.turn===5&&!shot){A.equal(await page.locator('.board-forecast.spawn').count(),6);A.ok(await page.locator('#spawn-status').isVisible());await page.screenshot({path:path.join(evidence,width+'-turn5.png')});shot=true;}
 }
 // US-020：胜利结算后进入主营地托管，购买/编队/跨关/失败重试由正常入口的 US-020 验收覆盖（C06/C07/C09/C23）。
 let s=await state();A.equal(s.phase,'intermission');A.equal(s.gold,steps.at(-1).expected.gold);A.equal(s.kills,steps.at(-1).expected.kills);A.equal(s.gold,s.kills);await page.screenshot({path:path.join(evidence,width+'-victory-shop.png')});
}
function f(...units){const s=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',4,8),...units]);s.intents=s.units.filter(u=>u.side==='enemy').map((u,i)=>({actor:u.id,kind:u.kind,from:{x:u.x,y:u.y},to:{x:u.x,y:u.y},type:'standby',path:[],order:i+1}));return s}
async function suite(name,fn){await fn();passed++;console.log('PASS '+name)}
(async()=>{browser=await pw.chromium.launch({headless:true});page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await suite('历史地图隔离桌面两波→真实杀敌结算',()=>formal(1280,800));
 await suite('历史地图隔离390px窄屏同流程；出生提示可见',()=>formal(390,844));
 await suite('PA-C5-01正常移动端：炮移动→攻击预览→撤销，旧执行禁用、额度完整恢复',async()=>{
  await open(390,844);const cannonMap=R.defaultMap();cannonMap.units.splice(2,0,{id:'starting-cannon',side:'player',kind:'cannon',x:1,y:2});const cannonProbe=R.newTestGame(cannonMap);cannonProbe.phase='deploy';await inject(cannonProbe);await page.locator('#btn-deploy-confirm').click();const before=await state();await select('starting-cannon');await clickCell({x:1,y:1});await clickCell({x:1,y:4});A.equal(await page.locator('#btn-execute').isEnabled(),true);A.match(await page.locator('#mobile-preview').innerText(),/命中 1/);await page.locator('#btn-undo').click();A.deepEqual(await state(),before);A.equal(await page.locator('#btn-execute').isDisabled(),true);A.doesNotMatch(await page.locator('#mobile-preview').innerText(),/攻击 · 命中/);await page.screenshot({path:path.join(evidence,'390-cannon-undo.png')});
 });
 await page.setViewportSize({width:1280,height:800});
 await suite('旧回归：炮架、移动后攻、额度、友伤扩散、旧预览和撤销',async()=>{
  await inject(R.fixtureState('P3','basic-growth'));await select('cannon');await clickCell({x:2,y:0});A.equal(await page.evaluate(()=>window.__M0_DEBUG__.getHistory()),1);await page.locator('#btn-undo').click();A.equal((await state()).units.find(u=>u.id==='cannon').y,1);await select('cannon');await clickCell({x:2,y:0});await clickCell({x:2,y:4});let c=(await state()).units.find(u=>u.id==='cannon');A.deepEqual([c.cannonMoveAvailable,c.cannonAttackAvailable,(await state()).teamSp],[false,false,1]);A.equal(await page.evaluate(()=>window.__M0_DEBUG__.getHistory()),0);
  await inject(R.fixtureState('P4'));await select('cannon');await page.locator('.upgrade-section summary').click();await page.locator('[data-skill="cannon-splash"][data-index="4"]').click();
  const p=await page.evaluate(()=>window.__M0_DEBUG__.grid.screenPoint({x:4,y:4}));await page.mouse.move(p.x,p.y);A.match(await page.locator('#preview-box').innerText(),/友军误伤/);await clickCell({x:4,y:4});A.ok(!(await state()).units.some(u=>u.id==='screen'));
 });
 await suite('旧回归：冻结意图平移、炮架失效、敌方友伤、顺序链',async()=>{
  await inject(R.fixtureState('P9','push-line'));await action(R.legalActions(await state(),'rook').find(a=>a.type==='charge'&&a.to.x===3));A.match(await page.locator('#intent-list').innerText(),/当前落点 \(5,3\)/);await end();A.equal((await state()).units.find(u=>u.id==='enemy-rook').y,1);
  await inject(R.fixtureState('P9','friendly-fire'));await end();A.ok(!(await state()).units.some(u=>u.id==='friend'));A.equal((await state()).kills,0);
  await inject(R.fixtureState('P9','chain'));await end();A.ok((await state()).units.some(u=>u.id==='target'));A.ok(!(await state()).units.some(u=>u.id==='rack'));
  const s=R.fixtureState('P9','cannon-rack');s.units.find(u=>u.id==='rack').x=3;await inject(s);A.match(await page.locator('#intent-list').innerText(),/缺少炮架/);
 });
 await suite('职业UI：基础说明、两条转职、1SP震退、碰撞完整预览与8格封顶',async()=>{
  const s=f(R.unit('car','player','rook',1,3),R.unit('b','enemy','rook',2,3),R.unit('c','enemy','rook',3,3));s.teamSp=12;s.units.find(u=>u.id==='b').hp=4;await inject(s);await select('car');A.match(await page.locator('#selected-card').innerText(),/基础车/);await page.locator('.upgrade-section').evaluate(n=>n.open=true);await page.locator('[data-skill="rook-charge-role"]').click();await page.locator('[data-skill="rook-push"]').click();A.equal((await state()).teamSp,9);await page.locator('[data-mode="charge"]').click();
  const p=await page.evaluate(()=>window.__M0_DEBUG__.grid.screenPoint({x:2,y:3}));await page.mouse.move(p.x,p.y);const text=await page.locator('#preview-box').innerText();A.match(text,/−3/);A.match(text,/直接−1 \/ 碰撞−2/);A.match(text,/结算落点/);A.match(text,/三体碰撞/);await page.screenshot({path:path.join(evidence,'collision-preview.png')});await clickCell({x:2,y:3});const after=await state();A.deepEqual(after.units.filter(u=>['car','b','c'].includes(u.id)).map(u=>u.hp),[1,1,1]);
  await page.locator('.upgrade-section').evaluate(n=>n.open=true);for(let i=0;i<7;i++)await page.locator('[data-skill="rook-charge"]').click();A.equal((await state()).units.find(u=>u.id==='car').rookChargeRange,8);A.equal(await page.locator('[data-skill="rook-charge"]').isDisabled(),true);
  const body=f(R.unit('car','player','rook',1,2));Object.assign(body.units.find(u=>u.id==='car'),{rookRole:'charge',rookPush:true});body.corpses=[{id:'body',x:1,y:3,unit:R.unit('dead','player','pawn',1,3)}];await inject(body);await action(R.legalActions(body,'car').find(a=>a.type==='charge-corpse'));A.equal((await state()).corpses[0].y,4);A.equal((await state()).units.find(u=>u.id==='car').y,2);
 });
 await suite('牵引UI：友军、尸体、贴身敌碰撞；窄屏完整详情',async()=>{
  const s=f(R.unit('car','player','rook',0,2),R.unit('friend','player','horse',3,2));s.teamSp=3;await inject(s);await select('car');await page.locator('.upgrade-section').evaluate(n=>n.open=true);await page.locator('[data-skill="rook-pull-role"]').click();await page.locator('[data-mode="pull"]').click();await clickCell({x:3,y:2});A.equal((await state()).units.find(u=>u.id==='friend').x,2);A.equal((await state()).units.find(u=>u.id==='car').x,0);
  await page.setViewportSize({width:390,height:844});const n=f(R.unit('car','player','rook',1,3),R.unit('enemy','enemy','pawn',2,3));n.units.find(u=>u.id==='car').rookRole='pull';await inject(n);await select('car');await page.locator('[data-mode="pull"]').click();await clickCell({x:2,y:3});A.equal((await state()).units.length,n.units.length);await page.locator('.mobile-preview-detail').click();A.match(await page.locator('#preview-box').innerText(),/贴身双方各受1/);await page.locator('#btn-mobile-info-close').click();await page.locator('#btn-execute').click();A.ok(!(await state()).units.some(u=>u.id==='enemy'));
  for(const x of [0,1]){const body=f(R.unit('car','player','rook',x,3));body.units.find(u=>u.id==='car').rookRole='pull';body.corpses=[{id:'body',x,y:5,unit:R.unit('dead','player','pawn',x,5)}];await inject(body);await select('car');await page.locator('[data-mode="pull"]').click();await clickCell({x,y:5});A.match(await page.locator('#mobile-preview').innerText(),/无伤害/);await page.locator('.mobile-preview-detail').click();A.match(await page.locator('#preview-box').innerText(),x===0?/落水销毁/:/目标落点 \(2,5\)/);await page.locator('#btn-mobile-info-close').click();await page.locator('#btn-execute').click();A.equal((await state()).corpses.length,x===1?1:0);}
 });
 await suite('US020 救援UI：只列合法对象、跳过进入第二波、仕残骸不可选',async()=>{
  const s=f(R.unit('friend','player','horse',2,5),R.unit('hurt','player','rook',4,5),R.unit('adv','player','advisor',3,1));
  s.buffs={health:false,move:false,rescue:true};s.turn=5;s.units.find(u=>u.id==='hurt').hp=1;
  s.corpses=[{id:'corpse-adv',x:5,y:1,unit:Object.assign(R.copy(s.units.find(u=>u.id==='adv')),{hp:0})}];
  await inject(s);await end();A.equal((await state()).phase,'rescue');
  A.equal(await page.locator('#ov-rescue').isVisible(),true);
  const ids=await page.locator('#rescue-options [data-rescue]').evaluateAll(ns=>ns.map(n=>n.dataset.rescue));
  A.deepEqual(ids,['hurt'],'仅受伤普通队友可选，仕残骸与满血单位不可选');
  await page.screenshot({path:path.join(evidence,'us020-rescue.png')});
  await page.locator('#rescue-options [data-rescue="hurt"]').click();A.equal((await state()).phase,'player');A.equal((await state()).wave,2);A.equal(await page.locator('#ov-rescue').isVisible(),false);
  A.equal((await state()).units.find(u=>u.id==='hurt').hp,(await state()).units.find(u=>u.id==='hurt').maxHp);
 });
 await suite('US007隔离UI：车敌山碰撞分列与树林条件预览/未消耗随机',async()=>{
  await page.setViewportSize({width:390,height:844});const s=f(R.unit('car','player','rook',1,3),R.unit('b','enemy','rook',2,3));Object.assign(s.units.find(u=>u.id==='car'),{rookRole:'charge',rookPush:true});s.units.find(u=>u.id==='b').hp=4;s.tiles=Object.fromEntries(Array.from({length:81},(_,i)=>[`${i%9},${Math.floor(i/9)}`,'land']));s.tiles['3,3']='mountain';await inject(s);await select('car');await page.locator('[data-mode="charge"]').click();await clickCell({x:2,y:3});await page.locator('.mobile-preview-detail').click();A.match(await page.locator('#preview-box').innerText(),/车−1.*目标−2.*山一次命中/);A.match(await page.locator('#preview-box').innerText(),/直接−1 \/ 碰撞−2/);await page.locator('#btn-mobile-info-close').click();await page.locator('#btn-execute').click();A.equal((await state()).tiles['3,3'],'cracked');A.equal((await state()).units.find(u=>u.id==='car').hp,1);
  s.tiles['3,3']='land';s.tiles['2,3']='forest';s.rng=1;await inject(s);const before=await state();await select('car');await page.locator('[data-mode="charge"]').click();await clickCell({x:2,y:3});A.match(await page.locator('#mobile-preview').innerText(),/树林：30% 闪避/);A.match(await page.locator('#mobile-preview').innerText(),/可能命中/);A.deepEqual(await state(),before);await page.screenshot({path:path.join(evidence,'390-forest-conditional.png')});await page.locator('#btn-execute').click();A.equal((await state()).units.find(u=>u.id==='b').hp,4);A.equal((await state()).units.find(u=>u.id==='b').x,2);
 });
 await suite('旧回归：桥尸、水销尸、弓盲区、网格中心及夹具重开',async()=>{
  await inject(R.fixtureState('P1','bridge-death'));await end();A.equal((await state()).corpses.length,1);await inject(R.fixtureState('P1','water-death'));await end();A.equal((await state()).corpses.length,0);await inject(R.fixtureState('P7','archer-blind'));await select('archer');await page.locator('[data-dir="0"]').click();A.equal(await page.locator('#btn-execute').isDisabled(),true);A.match(await page.locator('#mobile-preview').innerText(),/盲区/);
  A.equal(await page.evaluate(()=>{const g=window.__M0_DEBUG__.grid;for(let x=0;x<9;x++)for(let y=0;y<9;y++){const p=g.cellFromPoint(g.world(x,y));if(p.x!==x||p.y!==y)return false}return true}),true);
  await page.goto(url+'/?fixture=P2&variant=blocked');await page.waitForFunction(()=>!!window.__M0_DEBUG__);await page.locator('#btn-pause').click();await page.locator('#btn-restart-1').click();A.ok((await state()).units.some(u=>u.id==='block'));
 });
 await suite('切页专项：停止渲染、自动恢复，无自动暂停框或规则变化',async()=>{
  const before=await state();const result=await page.evaluate(async()=>{let calls=0;const original=window.requestAnimationFrame;
   window.requestAnimationFrame=cb=>original.call(window,t=>{calls++;cb(t)});
   Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,100));const hiddenCalls=calls;
   Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,250));const restoredCalls=calls;delete document.hidden;window.requestAnimationFrame=original;return {hiddenCalls,restoredCalls,pause:document.getElementById('ov-pause').classList.contains('show')};
  });A.equal(result.hiddenCalls,0);A.ok(result.restoredCalls>0);A.equal(result.pause,false);A.deepEqual(await state(),before);
 });
 A.deepEqual(errors,[]);const versions2=hashes();A.deepEqual(versions2,versions,'验证期间主原型版本必须保持不变');const report={passed,failed:0,browserErrors:errors,versions:versions2,finishedAt:new Date().toISOString(),scope:'2 historical-map isolated chains (two waves + real kills only) + battle UI probes + US020 rescue list; camp purchase/roster/cross-level/retry now covered by us020-acceptance-browser.cjs normal entry'};console.log(JSON.stringify({...report,evidence},null,2));fs.writeFileSync(path.join(evidence,'ui-result.json'),JSON.stringify(report,null,2));
})().catch(async e=>{console.error(e.stack);if(page)await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
