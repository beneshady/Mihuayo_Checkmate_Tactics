// Node 桩加载真实 app.js：验证离线脚本可启动、夹具、HUD、暂停与重开。
// 不冒充真实浏览器视觉验收。
const {test}=require('node:test');
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const WEB=path.join(__dirname,'..','web'),html=fs.readFileSync(path.join(WEB,'index.html'),'utf8');
function classes(){const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),toggle:(x,on)=>on===undefined?(s.has(x)?s.delete(x):s.add(x)):on?s.add(x):s.delete(x),contains:x=>s.has(x)}}
function el(id){return{id,style:{},children:[],classList:classes(),className:'',innerHTML:'',textContent:'',disabled:false,attributes:{},setAttribute(k,v){this.attributes[k]=v},appendChild(x){this.children.push(x)},addEventListener(t,f){this['on'+t]=f},querySelectorAll(){return[]},getBoundingClientRect(){return{left:0,top:0,width:814,height:800}}}}
const els={};for(const m of html.matchAll(/id="([^"]+)"/g))els[m[1]]=el(m[1]);
function ctx(){const noop=()=>{};return new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:10}):noop,set:()=>true})}
function canvas(){const x=el('canvas');x.width=x.height=128;x.getContext=()=>ctx();return x}
global.document={hidden:false,getElementById:id=>els[id],createElement:t=>t==='canvas'?canvas():el(t),addEventListener(){}};
global.window=global;window.location={search:'?fixture=P2&variant=blocked'};window.innerWidth=1280;window.innerHeight=800;window.devicePixelRatio=1;window.addEventListener=()=>{};global.requestAnimationFrame=()=>{};
const THREE=require(path.join(WEB,'vendor/three.min.js'));global.THREE=THREE;
THREE.WebGLRenderer=function(){this.domElement=canvas();this.shadowMap={};this.setPixelRatio=()=>{};this.setSize=()=>{};this.render=()=>{}};
global.M0=require(path.join(WEB,'js/rules.js'));
require(path.join(WEB,'js/app.js'));

test('UI 桩加载 P2 blocked，显示 9×9 夹具并可连续重开',()=>{
 const d=window.__M0_DEBUG__;A.ok(d);let s=d.getState();A.equal(s.units.some(u=>u.id==='block'),true);A.equal(els['fixture-badge'].textContent,'测试夹具 P2 · blocked');A.equal(els.wave.textContent,'1/2');A.equal(els['king-hp'].textContent,'3/3');
 d.select('rook');A.match(els['selected-card'].innerHTML,/冲击 3 格/);A.match(els.skills.innerHTML,/解锁震退/);
 d.setRookMode('charge');d.target({x:4,y:4});A.match(els['preview-box'].innerHTML,/原起点 \(1,4\).*冲击目标 \(4,4\)/);A.match(els['preview-box'].innerHTML,/接近点 \(3,4\).*我车最终落点 \(3,4\)/);A.match(els['preview-box'].innerHTML,/震退：失败：目标格被占/);
 d.setState(M0.fixtureState('P8'));d.select('rook');d.setRookMode('charge');d.target({x:1,y:3});A.match(els['preview-box'].innerHTML,/接近点 无（目标为空）.*我车最终落点 \(1,3\)/);
 d.setState(M0.fixtureState('P8','kill'));d.select('rook');d.setRookMode('charge');d.target({x:4,y:1});A.match(els['preview-box'].innerHTML,/接近点 \(3,1\).*我车最终落点 \(4,1\)/);A.match(els['preview-box'].innerHTML,/敌军兵.*HP 1→0（阵亡）/);
 d.setState(M0.fixtureState('P8','survive'));d.select('rook');d.setRookMode('charge');d.target({x:4,y:1});A.match(els['preview-box'].innerHTML,/接近点 \(3,1\).*我车最终落点 \(3,1\)/);A.match(els['preview-box'].innerHTML,/敌军车.*HP 2→1/);
 d.setState(M0.fixtureState('P4'));d.select('cannon');d.upgrade('cannon','cannon-splash',4);d.target({x:4,y:4});A.match(els['preview-box'].innerHTML,/友军马.*\(4,3\).*HP 1→0（阵亡）/);A.match(els['preview-box'].innerHTML,/友军误伤风险/);
 d.setState(M0.fixtureState('P3','basic-growth'));d.select('cannon');A.match(els['selected-card'].innerHTML,/基础攻击：单格 \/ 伤害 2 \/ 隔一子攻击/);A.match(els['selected-card'].innerHTML,/移动 .*可用.*攻击 .*可用/);A.match(els['selected-card'].innerHTML,/扩散 0\/8（不影响基础攻击）/);
 d.target({x:2,y:4});A.match(els['preview-box'].innerHTML,/炮架 友军马 @ \(2,2\)/);A.match(els['preview-box'].innerHTML,/攻击连线 \(2,1\) → \(2,2\) → \(2,3\) → \(2,4\)/);A.match(els['preview-box'].innerHTML,/主目标 敌军兵 @ \(2,4\) · 预期 −2/);d.execute();
 let cannon=d.getState().units.find(u=>u.id==='cannon');A.deepEqual([cannon.level,cannon.sp,cannon.ap,cannon.cannonMask],[2,1,0,0]);A.equal(M0.legalActions(d.getState(),'cannon').length,0);d.target({x:5,y:1});A.match(els['preview-box'].innerHTML,/炮本回合已攻击/);A.equal(els['btn-execute'].disabled,true);
 d.upgrade('cannon','cannon-splash',2);cannon=d.getState().units.find(u=>u.id==='cannon');A.deepEqual([cannon.sp,cannon.cannonMask],[0,4]);
 d.setState(M0.newGame());d.select('starting-cannon');A.match(els['selected-card'].innerHTML,/<b>炮<\/b> @ \(1,2\)/);d.target({x:1,y:7});A.match(els['preview-box'].innerHTML,/炮架 敌军兵 @ \(1,4\)/);A.match(els['preview-box'].innerHTML,/主目标 敌军炮 @ \(1,7\) · 预期 −2/);d.execute();cannon=d.getState().units.find(u=>u.id==='starting-cannon');A.deepEqual([cannon.level,cannon.sp,cannon.ap],[2,1,0]);A.equal(d.getState().units.some(u=>u.id==='w1-4'),false);
 d.setState(M0.fixtureState('P8','enemy-empty'));A.match(els['intent-list'].innerHTML,/车 · 冲击.*冻结 \(0,4\) → 当前落点 \(0,3\) · <b>可执行<\/b>/);d.endTurn();A.deepEqual([d.getState().units.find(u=>u.id==='enemy-rook').x,d.getState().units.find(u=>u.id==='enemy-rook').y],[0,0]);
 d.setState(M0.fixtureState('P6','mate'));A.deepEqual([d.getState().phase,d.getState().result],['player',undefined]);A.equal(els['ov-result'].classList.contains('show'),false);
 els['btn-intents'].onclick();A.equal(els['intent-list'].classList.contains('show'),false);A.equal(els['btn-intents'].attributes['aria-expanded'],'false');
 const start=d.getEpoch();for(let i=0;i<3;i++)d.restart();A.equal(d.getEpoch(),start+3);s=d.getState();A.equal(s.revision,0);A.equal(s.units.some(u=>u.id==='block'),true);
});

test('页面含独立窄屏棋盘/操作/面板区、河道、九宫、技能与 P1-P9 入口',()=>{
 A.match(html,/#scene\{position:absolute;left:306px;right:160px/);A.match(html,/@media\(max-width:900px\)/);A.match(html,/#scene\{left:0;right:0;height:52vh/);A.match(html,/#actions\{top:52vh/);A.match(html,/#panel\{top:57vh/);A.match(html,/id="btn-intents"/);A.match(html,/9×9/);A.match(html,/河道为 y=4/);A.match(html,/九宫/);A.match(html,/技能/);A.match(html,/variant=river-edge/);for(let i=1;i<=9;i++)A.match(html,new RegExp(`fixture=P${i}`));
});

test('PA-9-01 格盘纹理、棋子中心与点选换算共用内缩9×9区域',()=>{
 const g=window.__M0_DEBUG__.grid,near=g.cellSize*.45;
 A.equal(g.gridSize,g.boardSize*(1-112/1024));A.equal(g.cellSize*9,g.gridSize);A.ok(g.gridSize<g.boardSize);
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){
  const p=g.world(x,y);A.deepEqual(g.cellFromPoint(p),{x,y},`中心 ${x},${y}`);
  for(const dx of [-near,near])for(const dz of [-near,near])A.deepEqual(g.cellFromPoint({x:p.x+dx,z:p.z+dz}),{x,y},`内缩 ${x},${y}`);
 }
 A.equal(g.cellFromPoint({x:-g.gridSize/2-.01,z:0}),null);A.equal(g.cellFromPoint({x:g.gridSize/2+.01,z:0}),null);A.equal(g.cellFromPoint({x:0,z:g.gridSize/2+.01}),null);A.equal(g.cellFromPoint({x:0,z:-g.gridSize/2-.01}),null);
});

test('US-004 纯移动直执行、LIFO 撤销与攻击锁定',()=>{
 const d=window.__M0_DEBUG__;
 d.setState(M0.fixtureState('P1','river-edge'));d.select('rook');d.target({x:0,y:2});let s=d.getState();A.deepEqual([s.units.find(u=>u.id==='rook').x,s.units.find(u=>u.id==='rook').y],[0,2]);A.equal(d.getHistory(),1);A.equal(els['btn-execute'].disabled,true);d.select('pawn');d.target({x:4,y:4});A.equal(d.getHistory(),2);d.undo();A.deepEqual([d.getState().units.find(u=>u.id==='pawn').x,d.getState().units.find(u=>u.id==='pawn').y],[4,3]);d.undo();s=d.getState();A.deepEqual([s.units.find(u=>u.id==='rook').x,s.units.find(u=>u.id==='rook').y,s.units.find(u=>u.id==='rook').rookMoveAvailable],[0,0,true]);A.equal(d.getHistory(),0);
 s=M0.emptyState([M0.unit('king','player','king',4,0),M0.unit('rook','player','rook',0,0),M0.unit('pawn','player','pawn',4,4),M0.unit('boss','enemy','king',4,8),M0.unit('enemy','enemy','pawn',4,5)]);d.setState(s);d.select('rook');d.target({x:0,y:2});d.select('pawn');d.target({x:4,y:5});A.match(els['preview-box'].innerHTML,/攻击/);A.equal(d.getHistory(),1);d.undo();d.execute();A.ok(d.getState().units.find(u=>u.id==='enemy'));
 d.setState(s);d.select('rook');d.target({x:0,y:2});d.select('pawn');d.target({x:4,y:5});d.execute();A.equal(d.getHistory(),0);A.equal(d.getState().units.some(u=>u.id==='enemy'),false);
 s=M0.fixtureState('P1','river-edge');s.units.find(u=>u.id==='rook').sp=1;d.setState(s);d.select('rook');d.target({x:0,y:2});A.equal(d.getHistory(),1);d.upgrade('rook','fortify');A.equal(d.getHistory(),0);d.select('pawn');d.target({x:4,y:4});A.equal(d.getHistory(),1);d.endTurn();A.equal(d.getHistory(),0);
 s=M0.emptyState([M0.unit('king','player','king',4,0),M0.unit('rook','player','rook',1,1),M0.unit('boss','enemy','king',4,8)]);d.setState(s);d.select('rook');d.setRookMode('charge');d.target({x:1,y:2});A.match(els['preview-box'].innerHTML,/冲击/);A.equal(d.getHistory(),0);
});

test('US-004 危险纯移动可撤销、意图悬停只读且整格覆盖',()=>{
 const d=window.__M0_DEBUG__,U=M0.unit;
 let s=M0.emptyState([U('king','player','king',4,0),U('blocker','player','rook',4,1),U('boss','enemy','king',4,8),U('threat','enemy','rook',4,3)]);s.units.find(u=>u.id==='threat').rookChargeRange=3;s.intents=[{actor:'threat',from:{x:4,y:3},to:{x:4,y:0},type:'charge',path:[{x:4,y:2},{x:4,y:1},{x:4,y:0}],order:1}];d.setState(s);d.select('blocker');d.target({x:3,y:1});A.equal(d.getState().phase,'player');A.equal(d.getHistory(),1);d.undo();A.deepEqual([d.getState().units.find(u=>u.id==='blocker').x,d.getState().units.find(u=>u.id==='blocker').y],[4,1]);
 s=M0.fixtureState('P8','enemy-empty');const before=JSON.stringify(s);d.setState(s);d.hoverEnemy('enemy-rook');const marks=d.getMarks();A.equal(JSON.stringify(d.getState()),before);A.match(els['hover-intent'].innerHTML,/冲击.*可执行/);A.ok(marks.some(m=>m.layer==='intent-origin'));A.ok(marks.some(m=>m.layer==='intent-target'));A.ok(marks.filter(m=>m.layer!=='intent-line').every(m=>m.type==='PlaneGeometry'));d.hoverEnemy(null);A.ok(d.getMarks().some(m=>m.layer==='intent-overview'));A.equal(els['hover-intent'].classList.contains('show'),false);
});

test('US-005 炮移动后攻击、撤销与双额度 UI',()=>{
 const d=window.__M0_DEBUG__;
 d.setState(M0.fixtureState('P3','basic-growth'));d.select('cannon');d.target({x:2,y:0});let c=d.getState().units.find(u=>u.id==='cannon');A.deepEqual([c.x,c.y,c.cannonMoveAvailable,c.cannonAttackAvailable],[2,0,false,true]);A.equal(d.getHistory(),1);A.match(els['selected-card'].innerHTML,/移动 .*已用.*攻击 .*可用/);d.target({x:2,y:4});A.match(els['preview-box'].innerHTML,/炮架 友军马 @ \(2,2\)/);d.execute();c=d.getState().units.find(u=>u.id==='cannon');A.deepEqual([c.cannonMoveAvailable,c.cannonAttackAvailable],[false,false]);A.equal(d.getHistory(),0);d.target({x:2,y:1});A.match(els['preview-box'].innerHTML,/已攻击/);
 d.setState(M0.fixtureState('P3','basic-growth'));d.select('cannon');d.target({x:2,y:0});d.undo();c=d.getState().units.find(u=>u.id==='cannon');A.deepEqual([c.x,c.y,c.cannonMoveAvailable,c.cannonAttackAvailable],[2,1,true,true]);
 d.setState(M0.newGame());d.select('starting-cannon');d.target({x:1,y:7});d.execute();c=d.getState().units.find(u=>u.id==='starting-cannon');A.deepEqual([c.cannonMoveAvailable,c.cannonAttackAvailable],[false,false]);
});

test('US-006 默认威胁、方向平移、友伤与顺序链 UI',()=>{
 const d=window.__M0_DEBUG__;
 d.setState(M0.fixtureState('P9','push-line'));A.ok(d.getMarks().some(m=>m.layer==='intent-overview'));A.match(els['intent-list'].innerHTML,/冻结 \(3,3\).*当前落点 \(3,2\)/);d.hoverEnemy('enemy-rook');A.match(els['hover-intent'].innerHTML,/冻结起点 \(3,3\).*当前 \(3,3\).*落点 \(3,2\)/);d.select('rook');d.setRookMode('charge');d.target({x:3,y:3});d.execute();A.deepEqual([d.getState().units.find(u=>u.id==='enemy-rook').x,d.getState().units.find(u=>u.id==='enemy-rook').y],[4,3]);A.match(els['intent-list'].innerHTML,/当前落点 \(4,2\)/);d.endTurn();A.deepEqual([d.getState().units.find(u=>u.id==='enemy-rook').x,d.getState().units.find(u=>u.id==='enemy-rook').y],[4,1]);
 d.setState(M0.fixtureState('P9','friendly-fire'));d.endTurn();A.equal(d.getState().units.some(u=>u.id==='friend'),false);A.equal(d.getState().kills,0);
 d.setState(M0.fixtureState('P9','chain'));d.endTurn();A.equal(d.getState().units.some(u=>u.id==='rack'),false);A.equal(d.getState().units.some(u=>u.id==='target'),false);
});
