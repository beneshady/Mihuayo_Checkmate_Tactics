// 临时 UI 探针：核对 US-021 界面交互（马模式/预览/购买/撤回），不作为交付证据。
const path=require('node:path'),A=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const land=()=>{const t={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)t[x+','+y]='land';return t;};
function scenario(){const s=R.emptyState([R.unit('king','player','king',0,0),R.unit('boss','enemy','king',8,8),R.unit('h','player','horse',4,4),R.unit('n','enemy','pawn',4,1),R.unit('s','player','rook',4,3),R.unit('e','enemy','pawn',5,2)]);s.phase='player';s.tiles=land();s.teamSp=4;s.intents=[{actor:'boss',from:{x:8,y:8},to:{x:8,y:8},type:'standby',path:[],order:1}];return s;}
(async()=>{
 const browser=await pw.chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1400,height:900}});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(base+'/?device-preview=regression');
 await p.waitForFunction(()=>!!(window.__M0_DEBUG__));
 await p.evaluate(s=>window.__M0_DEBUG__.setState(s),scenario());
 await p.locator('[data-unit="h"]').click();
 const modes=await p.locator('#rook-modes button').allInnerTexts();console.log('modes',modes);
 const marks=await p.evaluate(()=>window.__M0_DEBUG__.getMarks().filter(m=>m.layer!=='selected'));
 console.log('marks(move mode)',marks.length);
 await p.locator('[data-mode="horse-jump"]').click();
 console.log('marks(jump mode)',(await p.evaluate(()=>window.__M0_DEBUG__.getMarks())).map(m=>[m.x,m.y,m.layer]).filter(m=>m[2]!=='selected'));
 const xy=await p.evaluate(to=>window.__M0_DEBUG__.grid.screenPoint(to),{x:4,y:2});
 await p.mouse.click(xy.x,xy.y);
 await p.waitForTimeout(120);
 const box=await p.locator('#preview-box').innerText();console.log('--- preview box\n'+box);
 const st=await p.evaluate(()=>window.__M0_DEBUG__.getState());
 console.log('after click auto-execute? units',st.units.map(u=>[u.id,u.x,u.y,u.hp]),'kills',st.kills,'sp',st.teamSp,'phase',st.phase);
 // 技能购买
 await p.locator('.upgrade-section').evaluate(n=>n.open=true);
 const skills=await p.locator('#skills button').allInnerTexts();console.log('skills',skills);
 console.log('errors',errs);
 await browser.close();
})().catch(e=>{console.error('PROBE FAIL',e);process.exit(1)});
