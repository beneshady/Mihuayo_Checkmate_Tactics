const path=require('node:path');
let pw;try{pw=require('playwright')}catch(e){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const R=require('../web/js/rules.js');
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8777';
const land=()=>{const t={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)t[x+','+y]='land';return t;};
function scenario(){const s=R.emptyState([R.unit('king','player','king',0,0),R.unit('boss','enemy','king',8,8),R.unit('h','player','horse',4,4),R.unit('n','enemy','pawn',4,1),R.unit('s','player','rook',4,3),R.unit('e','enemy','pawn',5,2)]);s.phase='player';s.tiles=land();s.teamSp=4;s.intents=[];return s;}
(async()=>{const browser=await pw.chromium.launch({headless:true});const p=await (await browser.newContext({viewport:{width:1400,height:900}})).newPage();
await p.goto(base+'/?device-preview=regression');await p.waitForFunction(()=>!!window.__M0_DEBUG__);
await p.evaluate(s=>window.__M0_DEBUG__.setState(s),scenario());
console.log('legalActions moves',R.legalActions(await p.evaluate(()=>window.__M0_DEBUG__.getState()),'h').map(a=>[a.type,a.to.x,a.to.y]));
await p.locator('[data-unit="h"]').click();
console.log('marks',JSON.stringify((await p.evaluate(()=>window.__M0_DEBUG__.getMarks())).map(m=>[m.x,m.y,m.layer])));
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
