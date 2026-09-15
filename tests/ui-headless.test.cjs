// Node 桩加载真实 app.js：验证离线脚本可启动、夹具、HUD、暂停与重开。
// 不冒充真实浏览器视觉验收。
const {test}=require('node:test');
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const WEB=path.join(__dirname,'..','web'),html=fs.readFileSync(path.join(WEB,'index.html'),'utf8');
function classes(){const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),toggle:(x,on)=>on===undefined?(s.has(x)?s.delete(x):s.add(x)):on?s.add(x):s.delete(x),contains:x=>s.has(x)}}
function el(id){return{id,style:{},children:[],classList:classes(),className:'',innerHTML:'',textContent:'',disabled:false,appendChild(x){this.children.push(x)},addEventListener(t,f){this['on'+t]=f},querySelectorAll(){return[]},getBoundingClientRect(){return{left:0,top:0,width:1280,height:800}}}}
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
 const start=d.getEpoch();for(let i=0;i<3;i++)d.restart();A.equal(d.getEpoch(),start+3);s=d.getState();A.equal(s.revision,0);A.equal(s.units.some(u=>u.id==='block'),true);
});

test('页面含响应式窄屏、河界、九宫、技能与 P1-P8 入口',()=>{
 A.match(html,/@media\(max-width:700px\)/);A.match(html,/河界/);A.match(html,/九宫/);A.match(html,/技能/);for(let i=1;i<=8;i++)A.match(html,new RegExp(`fixture=P${i}`));
});
