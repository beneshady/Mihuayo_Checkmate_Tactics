// US-019 A19-03 专项浏览器：现有冲击接口强制出宫/强制入水、主动入水拒绝、桥格通行。
// 本文件只作专项证据；不新增敌方技能、不冒充正常试玩。规则层推拉/撞击/阻挡由 Node 定向回归覆盖。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('../web/js/rules.js');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8792',dir=path.resolve(process.env.M0_EVIDENCE_DIR||'docs/us/us019-evidence/round-20261019-dsh/browser-special');fs.mkdirSync(dir,{recursive:true});
const report={scope:'US-019 A19-03 强制出宫/强制入水/主动入水/桥格；专项注入局面，不新增敌方技能',cases:[],errors:[]};let browser;
const state=p=>p.evaluate(()=>window.__M0_DEBUG__.getState()),setState=(p,s)=>p.evaluate(s=>window.__M0_DEBUG__.setState(s),s),mobile=p=>p.evaluate(()=>window.M0Display.isMobile());
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function save(){report.finishedAt=new Date().toISOString();report.files=Object.fromEntries(['web/index.html','web/js/app.js','web/js/rules.js'].map(f=>[f,sha(f)]));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));}
function note(rec,text,data){rec.steps.push({text,...(data||{})});}
async function shot(p,rec,name){const file=path.join(dir,name);await p.screenshot({path:file});rec.evidence.push(path.relative(process.cwd(),file).replace(/\\/g,'/'));}
async function cell(p,to){const xy=await p.evaluate(to=>window.__M0_DEBUG__.grid.screenPoint(to),to);await p.mouse.click(xy.x,xy.y);}
async function select(p,id){if(await mobile(p)){await p.locator('#mobile-tools [data-ui-view="units"]').click();await p.locator('[data-unit="'+id+'"]').click();if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}else await p.locator('[data-unit="'+id+'"]').click();}
async function end(p){await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();await p.waitForTimeout(120);}
async function newPage(){const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();p.__errors=[];p.on('pageerror',e=>{p.__errors.push(e.message);report.errors.push({message:e.message});});await p.goto(base+'/');await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.M0Campaign)&&window.M0Campaign.info().view==='menu');return{context,p};}
async function start(p){await p.locator('#flow-new').click();await p.locator('#flow-enter').click();await p.locator('#btn-deploy-confirm').click();await p.locator('#btn-buff-move').click();}
const kp=s=>{const k=s.units.find(u=>u.id==='king');return k?[k.x,k.y]:null;};
async function runCase(id,type,title,fn){const rec={id,type,title,status:'running',steps:[],evidence:[]};report.cases.push(rec);try{await fn(rec);rec.status='pass';}catch(e){rec.status='fail';rec.error=e.message;rec.stack=e.stack;console.error('FAIL '+id+': '+e.message);}await save();return rec;}
function fixture(src,kingAt,rookAt){const s=R.copy(src);const king=s.units.find(u=>u.id==='king')||R.unit('king','player','king',kingAt.x,kingAt.y),rook=R.unit('fix-rook','enemy','rook',rookAt.x,rookAt.y);rook.rookPush=true;
 king.x=kingAt.x;king.y=kingAt.y;king.hp=3;king.ap=1;s.units=[king,rook,R.unit('fix-enemy-king','enemy','king',4,8)];s.corpses=[];s.pendingSpawns=[];s.phase='player';s.turn=1;s.wave=1;s.commanderBuff='move';s.result=undefined;s.settled=false;s.intents=R.generateIntents(s);s.tiles=Object.assign({},s.tiles);for(const [x,y] of [[kingAt.x,kingAt.y],[rookAt.x,rookAt.y],[2,0],[3,0],[4,0],[0,3],[0,2],[0,4],[4,3],[4,4]])s.tiles[x+','+y]=s.tiles[x+','+y]||'land';return s;}

(async()=>{browser=await pw.chromium.launch({headless:true});
 await runCase('A19-03a','专项','K06/K07 现有冲击接口把帅从宫内推出宫，正常扣血，出宫后立即用宫外走法',async rec=>{
  const {context,p}=await newPage();await start(p);let s=fixture(await state(p),{x:3,y:0},{x:4,y:0});
  A.ok(s.intents.some(i=>i.actor==='fix-rook'&&i.type==='charge'),'冲击意图由现有敌方车接口生成');
  await setState(p,s);await p.waitForTimeout(80);const before=await state(p);await end(p);s=await state(p);
  A.deepEqual(kp(s),[2,0],'帅被推到宫外 (2,0)');A.equal(R.inPalace('player',s.units.find(u=>u.id==='king')),false);A.equal(s.units.find(u=>u.id==='king').hp,2,'冲击正常扣 1 血');
  note(rec,'冲击推出宫：位置/血量/宫内外',{before:before.units.find(u=>u.id==='king')&&[before.units.find(u=>u.id==='king').x,before.units.find(u=>u.id==='king').y],after:kp(s),hp:s.units.find(u=>u.id==='king').hp,inPalace:false});await shot(p,rec,'a19-03-forced-out.png');
  await select(p,'king');const card=await p.locator('#selected-card').innerText();A.match(card,/九宫外：仅上下左右一步/);
  const ap0=s.units.find(u=>u.id==='king').ap;await cell(p,{x:1,y:1});s=await state(p);A.deepEqual(kp(s),[2,0],'宫外斜走被拒');A.equal(s.units.find(u=>u.id==='king').ap,ap0,'斜走被拒不耗 AP');A.match(await p.locator('#preview-box').innerText(),/斜走/);
  await cell(p,{x:1,y:0});s=await state(p);A.deepEqual(kp(s),[1,0],'宫外横竖一步实际移动');A.equal(s.units.find(u=>u.id==='king').hp,2,'移动不额外扣血');
  note(rec,'出宫后立即采用宫外直向走法',{afterMove:kp(s),hp:s.units.find(u=>u.id==='king').hp});await shot(p,rec,'a19-03-forced-out-walk.png');
  A.deepEqual(p.__errors,[]);await context.close();
 });
 await runCase('A19-03b','专项','K06/K10 同一冲击接口把帅推入水格：立即死亡并失败，不等回合末；主动入水拒绝、桥格通行',async rec=>{
  const {context,p}=await newPage();await start(p);let s=fixture(await state(p),{x:0,y:3},{x:0,y:2});
  s.tiles['0,4']='water';s.intents=R.generateIntents(s);A.ok(s.intents.some(i=>i.actor==='fix-rook'&&i.type==='charge'),'冲击入水意图生成');await setState(p,s);await p.waitForTimeout(80);
  const turn0=(await state(p)).turn;await end(p);s=await state(p);
  A.equal(s.phase,'result');A.equal(s.result,'dead','强制入水立即判负');A.equal(s.turn,turn0,'失败发生在回合递增前，未等到回合末');A.ok(!s.units.some(u=>u.id==='king'),'帅已死亡移除');
  A.equal(await p.locator('#ov-result').isVisible(),true);A.match(await p.locator('#result-title').innerText(),/主帅阵亡/);
  note(rec,'强制入水：立即失败，回合未递增',{turn:s.turn,phase:s.phase,result:s.result});await shot(p,rec,'a19-03-forced-water.png');
  // 主动入水拒绝（独立夹具）
  s=fixture(await state(p),{x:3,y:3},{x:8,y:8});s.intents=[];await setState(p,s);await select(p,'king');
  const ap0=s.units.find(u=>u.id==='king').ap;await cell(p,{x:3,y:4});const wetState=await state(p);
  A.deepEqual(kp(wetState),[3,3],'主动入水位置不变');A.equal(wetState.units.find(u=>u.id==='king').ap,ap0,'主动入水拒绝不耗 AP');A.match(await p.locator('#preview-box').innerText(),/不能主动进入水格/);
  note(rec,'主动入水拒绝且不耗行动',{ap:wetState.units.find(u=>u.id==='king').ap});await shot(p,rec,'a19-03-active-water-rejected.png');
  // 桥格通行
  s=fixture(await state(p),{x:4,y:3},{x:8,y:8});s.intents=[];s.tiles['4,4']='bridge';await setState(p,s);await select(p,'king');
  await cell(p,{x:4,y:4});const bridgeState=await state(p);
  A.deepEqual(kp(bridgeState),[4,4],'桥格按陆地一步通行');A.equal(bridgeState.units.find(u=>u.id==='king').hp,3,'过桥不判入水');A.equal(bridgeState.result,undefined);
  note(rec,'桥格通行不判死',{pos:kp(bridgeState),hp:bridgeState.units.find(u=>u.id==='king').hp});await shot(p,rec,'a19-03-bridge.png');
  A.deepEqual(p.__errors,[]);await context.close();
 });
 report.result=report.cases.every(c=>c.status==='pass')?'PASS':'FAIL';save();console.log(JSON.stringify({result:report.result,cases:report.cases.map(c=>({id:c.id,status:c.status,evidence:c.evidence,error:c.error})),dir}));await browser.close();
})().catch(async e=>{report.result='FAIL';report.failure={message:e.message,stack:e.stack};save();console.error(e);if(browser)await browser.close();process.exitCode=1;});
