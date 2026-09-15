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

test('UI 桩加载 P2 blocked，显示 8×8 夹具并可连续重开',()=>{
 const d=window.__M0_DEBUG__;A.ok(d);let s=d.getState();A.equal(s.units.some(u=>u.id==='block'),true);A.equal(els['fixture-badge'].textContent,'测试夹具 P2 · blocked');A.equal(els.wave.textContent,'1/2');A.equal(els['king-hp'].textContent,'3/3');
 d.select('rook');A.match(els['selected-card'].innerHTML,/冲击 3 格/);A.match(els.skills.innerHTML,/解锁震退/);
 d.setRookMode('charge');d.target({x:4,y:4});A.match(els['preview-box'].innerHTML,/原起点 \(1,4\).*冲击目标 \(4,4\)/);A.match(els['preview-box'].innerHTML,/接近点 \(3,4\).*我车最终落点 \(3,4\)/);A.match(els['preview-box'].innerHTML,/震退：失败：目标格被占/);
 d.setState(M0.fixtureState('P8'));d.select('rook');d.setRookMode('charge');d.target({x:1,y:3});A.match(els['preview-box'].innerHTML,/接近点 无（目标为空）.*我车最终落点 \(1,3\)/);
 d.setState(M0.fixtureState('P8','kill'));d.select('rook');d.setRookMode('charge');d.target({x:4,y:1});A.match(els['preview-box'].innerHTML,/接近点 \(3,1\).*我车最终落点 \(4,1\)/);A.match(els['preview-box'].innerHTML,/敌军兵.*HP 1→0（阵亡）/);
 d.setState(M0.fixtureState('P8','survive'));d.select('rook');d.setRookMode('charge');d.target({x:4,y:1});A.match(els['preview-box'].innerHTML,/接近点 \(3,1\).*我车最终落点 \(3,1\)/);A.match(els['preview-box'].innerHTML,/敌军车.*HP 2→1/);
 d.setState(M0.fixtureState('P4'));d.select('cannon');d.upgrade('cannon','cannon-splash',4);d.target({x:4,y:4});A.match(els['preview-box'].innerHTML,/友军马.*\(4,3\).*HP 1→0（阵亡）/);A.match(els['preview-box'].innerHTML,/友军误伤风险/);
 d.setState(M0.fixtureState('P8','enemy-empty'));A.match(els['intent-list'].innerHTML,/车 · 冲击.*起点 \(0,4\) → 目标 \(0,3\) · <b>可执行<\/b>/);d.endTurn();A.deepEqual([d.getState().units.find(u=>u.id==='enemy-rook').x,d.getState().units.find(u=>u.id==='enemy-rook').y],[0,3]);
 els['btn-intents'].onclick();A.equal(els['intent-list'].classList.contains('show'),true);A.equal(els['btn-intents'].attributes['aria-expanded'],'true');
 const start=d.getEpoch();for(let i=0;i<3;i++)d.restart();A.equal(d.getEpoch(),start+3);s=d.getState();A.equal(s.revision,0);A.equal(s.units.some(u=>u.id==='block'),true);
});

test('页面含独立窄屏棋盘/操作/面板区、河界、九宫、技能与 P1-P8 入口',()=>{
 A.match(html,/#scene\{position:absolute;left:306px;right:160px/);A.match(html,/@media\(max-width:900px\)/);A.match(html,/#scene\{left:0;right:0;height:52vh/);A.match(html,/#actions\{top:52vh/);A.match(html,/#panel\{top:57vh/);A.match(html,/id="btn-intents"/);A.match(html,/河界/);A.match(html,/九宫/);A.match(html,/技能/);for(let i=1;i<=8;i++)A.match(html,new RegExp(`fixture=P${i}`));
});
