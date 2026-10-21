// US-019 A19-01/A19-02/A19-04/A19-05 浏览器验收：正常走位为主；重试换 buff 与队友 SP 消费用夹具标注专项。
// 运行：先启动 localhost 服务（工作目录 web），再 `set M0_TEST_URL=http://127.0.0.1:8792` 并运行本脚本。
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('../web/js/rules.js');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8792',dir=path.resolve(process.env.M0_EVIDENCE_DIR||'docs/us/us019-evidence/round-20261019-dsh/browser-a19');fs.mkdirSync(dir,{recursive:true});
const report={scope:'US-019 A19-01/02/04/05 浏览器验收；正常入口走位与专项夹具分开标注',viewports:{desktop:'1280x900',mobileLandscape:'844x390'},cases:[],errors:[],steps:[]};let browser;
const state=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
const setState=(p,s)=>p.evaluate(s=>window.__M0_DEBUG__.setState(s),s);
const mobile=p=>p.evaluate(()=>window.M0Display.isMobile());
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function save(){report.finishedAt=new Date().toISOString();report.files=Object.fromEntries(['web/index.html','web/js/app.js','web/js/rules.js'].map(f=>[f,sha(f)]));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));}
function note(rec,text,data){rec.steps.push({text,...(data||{})});report.steps.push({case:rec.id,text,...(data||{})});}
async function shot(p,rec,name){const file=path.join(dir,name);await p.screenshot({path:file});rec.evidence.push(path.relative(process.cwd(),file).replace(/\\/g,'/'));}
async function cell(p,to){const xy=await p.evaluate(to=>window.__M0_DEBUG__.grid.screenPoint(to),to);await p.mouse.click(xy.x,xy.y);}
async function select(p,id){if(await mobile(p)){await p.locator('#mobile-tools [data-ui-view="units"]').click();await p.locator('[data-unit="'+id+'"]').click();if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}else await p.locator('[data-unit="'+id+'"]').click();}
async function skills(p){if(await mobile(p))await p.locator('#mobile-tools [data-ui-view="skills"]').click();else await p.locator('.upgrade-section').evaluate(e=>e.open=true);}
async function closeSheet(p){if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();}
async function end(p){await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();await p.waitForTimeout(100);}
async function newPage(viewport={width:1280,height:900}){const context=await browser.newContext({viewport}),p=await context.newPage();p.__errors=[];p.on('pageerror',e=>{p.__errors.push(e.message);report.errors.push({message:e.message});});await p.goto(base+'/');await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.M0Campaign)&&window.M0Campaign.info().view==='menu');return{context,p};}
async function start(p,buff='move'){await p.locator('#flow-new').click();await p.locator('#flow-enter').click();let s=await state(p);A.equal(s.phase,'deploy');await p.locator('#btn-deploy-confirm').click();await p.locator('#btn-buff-'+buff).click();s=await state(p);A.equal(s.phase,'player');return s;}
function kp(s){const k=s.units.find(u=>u.id==='king');return[k.x,k.y];}
function assertNoPageErrors(p,rec){A.deepEqual(p.__errors,[],rec.id+' 无页面脚本错误');}
async function runCase(id,type,title,fn){const rec={id,type,title,status:'running',steps:[],evidence:[]};report.cases.push(rec);try{await fn(rec);rec.status='pass';}catch(e){rec.status='fail';rec.error=e.message;rec.stack=e.stack;console.error('FAIL '+id+': '+e.message);}await save();return rec;}
async function checkIllegal(p,rec,to,expectPos,label,expectPattern){const before=await state(p);await cell(p,to);const after=await state(p);A.deepEqual(kp(after),expectPos,label+' 位置不变');A.equal(after.units.find(u=>u.id==='king').ap,before.units.find(u=>u.id==='king').ap,label+' 不消耗 AP');if(expectPattern)A.match(await p.locator('#preview-box').innerText(),expectPattern,label+' 提示');return after;}

(async()=>{
 browser=await pw.chromium.launch({headless:true});

 await runCase('A19-01','正常流程','K01-K03/K08 正常入口：帅无攻击/吃子/升级，非法点击不耗 AP/SP，buff 生效且排除帅，队友仍有升级入口',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'move');
  A.equal(s.commanderBuff,'move');const king=s.units.find(u=>u.id==='king'),rook=s.units.find(u=>u.id==='rook');
  A.equal(king.maxHp,3,'帅 HP 不因增益变化');A.equal(rook.maxHp,2,'疾行不加 HP');A.equal(rook.commanderMove,1,'队友获得移动 +1');A.equal(king.commanderMove,0,'帅排除在增益外');
  await select(p,'king');const card=await p.locator('#selected-card').innerText();A.match(card,/纯辅助（无攻击）/);A.match(card,/不能攻击或吃子/);
  A.equal(await p.locator('#skills [data-skill]').count(),0,'帅没有任何个人升级入口');A.match(await p.locator('#skills').textContent(),/不能购买任何个人升级/);
  note(rec,'新旅程选“疾行”buff：帅 3HP、队友移动 +1、帅无升级入口',{kingHp:king.maxHp,rookHp:rook.maxHp,rookMove:rook.commanderMove});await shot(p,rec,'a19-01-king-selected.png');
  const enemy=s.units.find(u=>u.side==='enemy'&&u.kind==='pawn');const before=await state(p);await cell(p,{x:enemy.x,y:enemy.y});const after=await state(p);
  A.equal(after.revision,before.revision,'帅点击敌兵不提交动作');A.equal(after.units.find(u=>u.id==='king').ap,1,'不消耗 AP');A.equal(after.teamSp,before.teamSp,'不消耗公共 SP');A.match(await p.locator('#preview-box').innerText(),/不能攻击或吃子/);
  note(rec,'帅点击敌兵：无攻击/吃子、AP 与 SP 不变',{revision:after.revision,ap:after.units.find(u=>u.id==='king').ap,sp:after.teamSp});
  await select(p,'starting-spearman');const n=await p.locator('#skills [data-skill]').count();A.ok(n>0,'队友仍有升级入口');A.match(await p.locator('#skills').textContent(),/强健/);
  const dis=await p.locator('#skills [data-skill="fortify"]').isDisabled();A.equal(dis,true,'公共 SP 0 时队友升级按钮禁用');
  note(rec,'队友仍有强健等升级项（SP 0 时禁用）',{skillButtons:n});assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A19-02','正常流程+专项','K04/K05 正常走位：宫内米字斜走、横竖出宫/回宫、斜向跨宫禁止、宫外直向、高亮提示一致',async rec=>{
  const {context,p}=await newPage();await start(p,'move');
  await select(p,'king');let s=await state(p);A.deepEqual(kp(s),[4,0]);
  // T1: 宫内非法斜走 -> 横竖到中心
  let after=await checkIllegal(p,rec,{x:3,y:1},[4,0],'起点(5,1)非中心/角的斜走',/斜走/);
  A.equal(after.units.find(u=>u.id==='king').ap,1);await cell(p,{x:4,y:1});s=await state(p);A.deepEqual(kp(s),[4,1],'横竖一步到九宫中心');A.equal(R.inPalace('player',s.units.find(u=>u.id==='king')),true);
  note(rec,'T1 非法斜走不耗 AP；横竖到中心',{pos:kp(s)});await shot(p,rec,'a19-02-palace-center.png');
  await end(p);
  // T2: 中心 -> 角（米字）
  await select(p,'king');await cell(p,{x:3,y:2});s=await state(p);A.deepEqual(kp(s),[3,2],'中心↔角米字斜走');
  note(rec,'T2 中心(4,1)→角(3,2) 米字斜走合法',{pos:kp(s)});await end(p);
  // T3: 角 -> 宫外斜走非法；横竖一步出宫
  await select(p,'king');await checkIllegal(p,rec,{x:2,y:1},[3,2],'角向宫外斜走',/斜走/);await cell(p,{x:3,y:3});s=await state(p);A.deepEqual(kp(s),[3,3],'横竖一步出宫');A.equal(R.inPalace('player',s.units.find(u=>u.id==='king')),false);
  await select(p,'king');const outCard=await p.locator('#selected-card').innerText();A.match(outCard,/九宫外：仅上下左右一步/);
  note(rec,'T3 斜向出宫被拒；横竖一步出宫并显示宫外提示',{pos:kp(s),card:outCard.replace(/\s+/g,' ').slice(0,120)});await shot(p,rec,'a19-02-outside-palace.png');await end(p);
  // T4: 宫外斜走非法；横竖一步回宫
  await select(p,'king');await checkIllegal(p,rec,{x:4,y:2},[3,3],'宫外斜向回宫',/斜走/);await cell(p,{x:3,y:2});s=await state(p);A.deepEqual(kp(s),[3,2],'横竖一步回宫');A.equal(R.inPalace('player',s.units.find(u=>u.id==='king')),true);
  note(rec,'T4 宫外斜走被拒；横竖一步回宫',{pos:kp(s)});await end(p);
  // T5: 角 -> 中心斜走
  await select(p,'king');await cell(p,{x:4,y:1});s=await state(p);A.deepEqual(kp(s),[4,1],'回宫后恢复中心↔角斜走');A.equal(s.units.find(u=>u.id==='king').ap,0,'回宫不额外赠送行动');
  note(rec,'T5 回宫后角(3,2)→中心(4,1)斜走合法且仅一次行动',{pos:kp(s),ap:0});await shot(p,rec,'a19-02-back-center.png');await end(p);
  // T6: 跨波 buff 保留（A19-04 关联）
  s=await state(p);A.equal(s.turn,6,'进入第 6 回合');A.equal(s.wave,2,'第二波已到');A.equal(s.commanderBuff,'move','跨波保留疾行 buff');A.equal(s.units.find(u=>u.id==='rook').commanderMove,1,'宫外不关闭 buff');
  note(rec,'T6 跨波 buff 保留（供 A19-04）',{turn:s.turn,wave:s.wave,buff:s.commanderBuff});await shot(p,rec,'a19-02-turn6-buff.png');
  assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A19-04','正常流程+专项','K02/K08/K11 失败重试恢复；下一关换 buff 不叠加；网页/手机横版切换与帅无攻击/升级回归',async rec=>{
  const {context,p}=await newPage();await start(p,'move');
  // 正常操作：弓方向攻击清掉桥头敌兵，随后逐回合让路；帅沿桥前压，正常结束回合直到阵亡（不注入血量/资源）
  let s=await state(p);await select(p,'starting-archer');await cell(p,{x:4,y:5});s=await state(p);A.ok(!s.units.some(u=>u.side==='enemy'&&u.x===4&&u.y===5),'弓方向攻击清掉桥头敌兵');
  await end(p);
  let died=(await state(p)).phase==='result'&&(await state(p)).result==='dead';
  async function moveIfAlive(id,to){s=await state(p);if(s.phase!=='player'||!s.units.some(u=>u.id===id))return false;await select(p,id);await cell(p,to);return true;}
  // T2: 弓让到 (4,4)，帅到中心
  await moveIfAlive('starting-archer',{x:4,y:4});await moveIfAlive('king',{x:4,y:1});s=await state(p);if(s.phase==='player')A.deepEqual(kp(s),[4,1],'T2 帅到中心');await end(p);
  // T3: 弓到 (4,5)，帅到 (4,2)
  if((await state(p)).phase==='player'){await moveIfAlive('starting-archer',{x:4,y:5});await moveIfAlive('king',{x:4,y:2});A.deepEqual(kp(await state(p)),[4,2],'T3 帅到 (4,2)');await end(p);}
  // T4/T5: 尝试让弓横移、帅继续沿桥前压；若被自然出现的敌方单位占格则不强制断言，继续正常结束回合
  if((await state(p)).phase==='player'){await moveIfAlive('starting-archer',{x:5,y:5});await moveIfAlive('king',{x:4,y:3});const at=await state(p);note(rec,'T4 前压尝试（正常占格可能阻挡）',{king:kp(at),ap:at.units.find(u=>u.id==='king').ap,turn:at.turn});await end(p);}
  if((await state(p)).phase==='player'){await moveIfAlive('king',{x:4,y:4});const at=await state(p);note(rec,'T5 桥面前压尝试',{king:kp(at),turn:at.turn,hp:at.units.find(u=>u.id==='king').hp});await end(p);}
  s=await state(p);if(s.phase==='result'&&s.result==='dead')died=true;
  if(!died){for(let i=0;i<7;i++){s=await state(p);if(s.phase!=='player')break;await end(p);s=await state(p);if(s.phase==='result'&&s.result==='dead'){died=true;break;}}}
  if(died){
   const dead=await state(p);A.equal(dead.result,'dead');A.equal(await p.locator('#ov-result').isVisible(),true);A.match(await p.locator('#result-title').innerText(),/主帅阵亡/);
   note(rec,'正常操作下主帅阵亡进入失败结算（未注入血量/资源）',{turn:dead.turn,wave:dead.wave,hp:0});await shot(p,rec,'a19-04-defeat.png');
   await p.locator('#btn-restart-2').click();await p.waitForTimeout(150);s=await state(p);
   A.equal(s.phase,'deploy','重试回到本关入口布阵');A.equal(s.result,undefined);A.equal(s.commanderBuff,null,'重试重新选择 buff');A.deepEqual(kp(s),[4,0],'帅回本关出生位');A.equal(s.units.find(u=>u.id==='king').attack,0);
   note(rec,'重试恢复本关入口快照、清除本关 buff、帅仍无攻击',{phase:s.phase,king:kp(s),buff:s.commanderBuff});await shot(p,rec,'a19-04-retry-deploy.png');
  }else{
   const alive=await state(p);rec.steps.push({text:'正常结束回合未在 11 回合前阵亡，改用专项失败夹具补验重试 UI',last:{phase:alive.phase,turn:alive.turn,result:alive.result}});
   s=alive;Object.assign(s,{phase:'result',result:'dead',level:1});await setState(p,s);await p.locator('#btn-restart-2').click();await p.waitForTimeout(150);s=await state(p);
   A.equal(s.phase,'deploy');A.deepEqual(kp(s),[4,0]);
   note(rec,'专项失败夹具：重试恢复入口快照（正常失败路径未达成，已如实标注）',{phase:s.phase,king:kp(s)});await shot(p,rec,'a19-04-retry-deploy.png');
  }
  // 失败重试后：确认布阵、选坚守；再以专项关间状态进入下一关，选疾行验证换 buff 不叠加
  await p.locator('#btn-deploy-confirm').click();await p.locator('#btn-buff-health').click();s=await state(p);
  A.equal(s.commanderBuff,'health');A.equal(s.units.find(u=>u.id==='rook').maxHp,3,'本关坚守生效');
  // 专项：构造关间整备（不冒充正常胜利），走真实地图/进入下一关 UI
  s=await state(p);Object.assign(s,{phase:'intermission',level:1,gold:5,teamSp:2,turn:11,wave:2,result:'victory',settled:true,intents:[],pendingSpawns:[]});await setState(p,s);await p.waitForTimeout(60);
  await p.locator('#btn-next-wave').click();await p.waitForSelector('#flow-map:not([hidden])');await p.locator('#flow-enter').click();s=await state(p);
  A.equal(s.level,2,'进入第 2 关');A.equal(s.phase,'deploy');A.equal(s.commanderBuff,null,'下一关重新选择 buff');
  await p.locator('#btn-deploy-confirm').click();await p.locator('#btn-buff-move').click();s=await state(p);
  A.equal(s.commanderBuff,'move','下关替换为疾行');A.equal(s.units.find(u=>u.id==='rook').maxHp,2,'上关 HP +1 不跨关叠加');A.equal(s.units.find(u=>u.id==='rook').commanderMove,1,'新 buff 生效');A.equal(R.king(s,'player').attack,0,'跨关后帅仍无攻击');
  await select(p,'king');A.equal(await p.locator('#skills [data-skill]').count(),0,'跨关后帅仍无个人升级');
  note(rec,'下一关换 buff：坚守不叠加、疾行生效；帅攻击/升级仍禁用（关间状态为专项夹具）',{level:s.level,buff:s.commanderBuff,rookHp:s.units.find(u=>u.id==='rook').maxHp});
  // 双显示：1280 网页横版 + 844x390 手机横版
  await shot(p,rec,'a19-04-level2-desktop.png');
  await p.setViewportSize({width:844,height:390});await p.waitForTimeout(150);A.equal(await mobile(p),true,'844x390 手机横版');
  await select(p,'king');const mcard=await p.locator('#mobile-selected').innerText();A.match(mcard,/纯辅助/);A.match(mcard,/不能攻击或升级/);
  await shot(p,rec,'a19-04-mobile-landscape.png');
  note(rec,'844x390 手机横版：帅纯辅助可读',{card:mcard.replace(/\s+/g,' ').slice(0,120),viewport:'844x390'});
  // 暂停菜单实际切显示模式：手机 -> 网页 -> 手机
  const before=await state(p);await p.locator('#btn-pause').click();await p.locator('#btn-menu-pause').click();await p.locator('[data-display-mode="desktop"]').click();A.equal(await mobile(p),false,'菜单切网页版');await p.locator('[data-display-mode="mobile"]').click();A.equal(await mobile(p),true,'菜单切手机版');await p.locator('#flow-continue').click();A.equal(await mobile(p),true);await p.waitForTimeout(100);A.deepEqual(await state(p),before,'切换显示不改变战局');
  await p.setViewportSize({width:1280,height:900});await p.waitForTimeout(120);A.equal(await mobile(p),true,'手动手机模式在放大视口后保持');
  await p.locator('#btn-pause').click();await p.locator('#btn-menu-pause').click();await p.locator('[data-display-mode="desktop"]').click();A.equal(await mobile(p),false,'1280x900 切回网页版');await shot(p,rec,'a19-04-desktop-after-switch.png');await p.locator('#flow-continue').click();await p.waitForTimeout(100);A.deepEqual(await state(p),before,'切回网页版不改变战局');
  note(rec,'显示模式菜单切换手机/网页，战局不变',{stateRevision:before.revision});assertNoPageErrors(p,rec);await context.close();
 });

 await runCase('A19-05','专项','K09/共享 SP：队友可用公共 SP 升级，帅即使有 SP 也不能消费；敌将/敌士规则由定向回归覆盖',async rec=>{
  const {context,p}=await newPage();let s=await start(p,'move');
  // 专项注入 1 点公共 SP，验证实际 UI 队友消费
  s=await state(p);s.teamSp=1;await setState(p,s);await p.waitForTimeout(50);
  await select(p,'rook');await skills(p);const cost=await p.locator('#skills [data-skill="fortify"]').innerText();A.match(cost,/1 公共 SP/);
  const sp0=(await state(p)).teamSp,hp0=(await state(p)).units.find(u=>u.id==='rook').maxHp;
  await p.locator('[data-skill="fortify"]').click();s=await state(p);
  A.equal(s.teamSp,sp0-1,'队友消费公共 SP');A.equal(s.units.find(u=>u.id==='rook').maxHp,hp0+1,'队友强健生效');
  note(rec,'专项注入 1 SP：队友可消费并强健（夹具，不是正常收益）',{spBefore:sp0,spAfter:s.teamSp,maxHpBefore:hp0,maxHpAfter:s.units.find(u=>u.id==='rook').maxHp});await shot(p,rec,'a19-05-ally-spend.png');
  // 帅有 SP 也不能购买/扣除
  s=await state(p);s.teamSp=5;await setState(p,s);await select(p,'king');const sp1=(await state(p)).teamSp;
  A.equal(await p.locator('#skills [data-skill]').count(),0,'帅没有可购买项');A.equal((await state(p)).teamSp,sp1,'选中/查看帅不扣 SP');
  note(rec,'帅即使有公共 SP 也无升级入口、不扣 SP',{teamSp:sp1});assertNoPageErrors(p,rec);await context.close();
 });

 report.result=report.cases.every(c=>c.status==='pass')?'PASS':'FAIL';save();console.log(JSON.stringify({result:report.result,cases:report.cases.map(c=>({id:c.id,status:c.status,evidence:c.evidence,error:c.error})),errors:report.errors,dir}));await browser.close();
})().catch(async e=>{report.result='FAIL';report.failure={message:e.message,stack:e.stack};save();console.error(e);if(browser)await browser.close();process.exitCode=1;});
