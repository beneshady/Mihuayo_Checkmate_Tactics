// US-019 K08：正常入口实际点选（新建旅程→布阵确认→选 buff→主帅走位出宫→切换选中），不注入战局或资源。
// 运行：先启动服务 `python -m http.server 8783 --bind 127.0.0.1`（工作目录 web），再 `node tests/us019-king-browser.cjs`
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('../web/js/rules.js');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.M0_TEST_URL||'http://127.0.0.1:8783',dir=path.resolve('docs/us/us019-evidence');fs.mkdirSync(dir,{recursive:true});
const report={scope:'正常入口仅实际点选：新建旅程→布阵确认→选择 buff→主帅走位与选中检查；未注入战局/资源',steps:[],errors:[]};let browser;
const state=p=>p.evaluate(()=>window.__M0_DEBUG__.getState());
async function cell(p,to){const xy=await p.evaluate(to=>window.__M0_DEBUG__.grid.screenPoint(to),to);await p.mouse.click(xy.x,xy.y);}
const kingPos=s=>{const k=s.units.find(u=>u.id==='king');return[k.x,k.y]};
function save(){report.finishedAt=new Date().toISOString();report.versions=Object.fromEntries(['web/index.html','web/js/app.js','web/js/rules.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));}
(async()=>{
 browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();
 p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto(base+'/');
 await p.waitForFunction(()=>!!(window.__M0_DEBUG__&&window.M0Campaign)&&window.M0Campaign.info().view==='menu');
 await p.locator('#flow-new').click();
 await p.locator('#flow-enter').click();
 let s=await state(p);
 A.equal(s.phase,'deploy');
 await p.locator('#btn-deploy-confirm').click();
 await p.locator('#btn-buff-health').click();
 s=await state(p);
 A.equal(s.phase,'player');
 A.equal(s.commanderBuff,'health');
 A.deepEqual(kingPos(s),[4,0],'新旅程帅位固定');
 report.steps.push({step:'新旅程+选择坚守 buff',phase:s.phase,buff:s.commanderBuff,king:kingPos(s)});
 // 1. 主帅选中：无攻击数值、无任何个人升级入口
 await p.locator('[data-unit="king"]').click();
 const card=await p.locator('#selected-card').innerText(),skills=await p.locator('#skills').textContent();
 A.match(card,/纯辅助（无攻击）/,'主帅信息不显示攻击数值');
 A.match(card,/不能攻击或吃子/);
 A.match(skills,/不能购买任何个人升级/);
 A.equal(await p.locator('#skills [data-skill]').count(),0,'主帅没有任何可购买技能项');
 report.steps.push({step:'选中主帅',card:card.replace(/\s+/g,' ').slice(0,140),skillButtons:0});
 await p.screenshot({path:path.join(dir,'king-selected-no-upgrade.png')});
 // 2. 队友仍可看到强健：证明只排除主帅
 await p.locator('[data-unit="rook"]').click();
 A.ok(await p.locator('#skills [data-skill]').count()>0,'队友仍有升级入口');
 A.match(await p.locator('#skills').textContent(),/强健/);
 report.steps.push({step:'选中基础车',skillButtons:await p.locator('#skills [data-skill]').count()});
 // 3. 主帅点击敌方棋子：不产生攻击预览、不消耗行动
 await p.locator('[data-unit="king"]').click();
 let before=await state(p);
 const enemy=s.units.find(u=>u.side==='enemy'&&u.kind==='pawn');
 await cell(p,{x:enemy.x,y:enemy.y});
 let after=await state(p);
 A.equal(after.revision,before.revision,'点击敌人不提交任何动作');
 A.equal(after.units.find(u=>u.id==='king').ap,1,'不消耗行动');
 A.match(await p.locator('#preview-box').innerText(),/不能攻击或吃子/,'界面提示为主帅不能攻击');
 report.steps.push({step:'主帅点击敌兵',revision:after.revision,ap:after.units.find(u=>u.id==='king').ap});
 // 4. 第一回合：宫内横竖一步
 await cell(p,{x:3,y:0});
 s=await state(p);
 A.deepEqual(kingPos(s),[3,0],'实际点击完成宫内一步');
 await p.locator('#btn-end').click();
 await p.locator('#btn-confirm-yes').click();
 await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');
 s=await state(p);
 A.equal(s.turn,2);
 // 5. 第二回合：斜向出宫被拒绝，横竖一步出宫成功
 await p.locator('[data-unit="king"]').click();
 await cell(p,{x:2,y:1});
 s=await state(p);
 A.deepEqual(kingPos(s),[3,0],'斜向出宫被拒绝且不移动');
 A.equal(s.units.find(u=>u.id==='king').ap,1,'拒绝不消耗行动');
 A.match(await p.locator('#preview-box').innerText(),/斜走/);
 await cell(p,{x:2,y:0});
 s=await state(p);
 A.deepEqual(kingPos(s),[2,0],'实际点击横竖一步走出九宫');
 A.equal(R.inPalace('player',s.units.find(u=>u.id==='king')),false,'主帅已在宫外');
 await p.locator('[data-unit="king"]').click();
 const outCard=await p.locator('#selected-card').innerText();
 A.match(outCard,/九宫外：仅上下左右一步/,'宫外提示与规则一致');
 A.match(outCard,/纯辅助（无攻击）/);
 A.equal(await p.locator('#skills [data-skill]').count(),0,'宫外仍无升级入口');
 report.steps.push({step:'主帅走位出宫',to:kingPos(s),inPalace:false,card:outCard.replace(/\s+/g,' ').slice(0,140)});
 await p.screenshot({path:path.join(dir,'king-outside-palace.png')});
 // 6. 宫外斜向点击不移动（此时行动已用，仍应保持原位）
 before=await state(p);
 await cell(p,{x:1,y:1});
 after=await state(p);
 A.deepEqual(kingPos(after),[2,0],'宫外位置不变');
 report.steps.push({step:'宫外斜向点击',passed:true});
 A.equal(report.errors.length,0,'无页面脚本错误');
 report.result='PASS';save();
 console.log(JSON.stringify({result:report.result,steps:report.steps,evidence:dir}));
 await browser.close();
})().catch(async e=>{report.result='FAIL';report.failure={message:e.message,stack:e.stack};save();console.error(e);if(browser)await browser.close();process.exitCode=1;});
