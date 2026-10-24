// 替换 acceptance 测试中的手机横版步骤（不作为交付物）。
const fs=require('node:fs');
const p='tests/us021-acceptance-browser.cjs';
let c=fs.readFileSync(p,'utf8');
const start='async function mobileFlow(browser){';
const end='(async()=>{';
const i=c.indexOf(start);const j=c.indexOf(end,i);
if(i<0||j<0)throw Error('markers');
const body=[
"async function mobileFlow(browser){",
" const {ctx,p}=await openWithSave(browser,playerSave(),{width:844,height:390});",
" await p.waitForFunction(()=>window.M0Campaign&&window.M0Campaign.info().view==='menu',null,{timeout:25000});",
" await step('H20-手机横版','手机横版 844x390：招募/营地/布阵/跳跃预览与执行/普通移动可达',async()=>{",
"  const layout=await p.evaluate(()=>document.getElementById('game-viewport').dataset.layoutMode);",
"  A.equal(layout,'mobile','手机横版布局生效');",
"  await p.locator('#flow-new').click();",
"  await p.waitForFunction(()=>window.M0Campaign.info().view==='tutorial');",
"  await p.locator('#tutorial-skip').click();",
"  await p.locator('#tutorial-skip-yes').click();",
"  await campView(p);",
"  await p.locator('[data-recruit=\"horse\"]').click();",
"  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().party.some(u=>u.id==='recruit-horse-0'));",
"  const campShot=await shot(p,'h20-mobile-camp.png');",
"  await p.locator('#camp-leave').click();",
"  await p.waitForFunction(()=>window.M0Campaign.info().view==='map');",
"  await p.locator('#flow-enter').click();",
"  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='deploy');",
"  await p.locator('#btn-deploy-confirm').click();",
"  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().phase==='player');",
"  await p.waitForTimeout(300);",
"  await selectBattleUnit(p,'starting-horse');",
"  const modes=await p.locator('#rook-modes button').allInnerTexts();",
"  A.deepEqual(modes,['普通移动','跳跃攻击 2 格'],'手机版马的模式按钮可达');",
"  await p.locator('[data-mode=\"horse-jump\"]').click();",
"  await cell(p,{x:7,y:5});",
"  await p.waitForTimeout(350);",
"  A.equal(await p.locator('#btn-execute').isEnabled(),true,'手机版选中技能落点后执行按钮可用');",
"  const previewSummary=await p.locator('#mobile-preview').innerText();",
"  A.ok(previewSummary.includes('跳跃攻击'),'手机版动作预览显示跳跃攻击');",
"  const previewShot=await shot(p,'h20-mobile-jump-preview.png');",
"  await p.locator('#btn-execute').click();",
"  await p.waitForTimeout(350);",
"  let s=await st(p);",
"  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[7,5],'手机版跳跃执行落点正确');",
"  A.equal(unit(s,'w1-2'),undefined,'手机版跳跃击杀四邻敌方兵');",
"  A.equal(s.teamSp,1,'手机版跳跃击杀获得 SP');",
"  const shotName=await shot(p,'h20-mobile-jump.png');",
"  await selectBattleUnit(p,'starting-horse');",
"  await p.locator('#mobile-tools [data-ui-view=\"skills\"]').click();",
"  const sheetSkills=await p.locator('#mobile-sheet-content').innerText();",
"  A.ok(sheetSkills.includes('技能距离')&&sheetSkills.includes('推动＋解除绊马脚'),'手机版技能面板可达并列出马成长');",
"  if(await p.locator('#btn-mobile-info-close').isVisible())await p.locator('#btn-mobile-info-close').click();",
"  await p.locator('#btn-end').click();",
"  await p.locator('#btn-confirm-yes').click();",
"  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===2,null,{timeout:20000});",
"  await p.waitForTimeout(300);",
"  await selectBattleUnit(p,'starting-horse');",
"  await p.locator('[data-mode=\"horse-move\"]').click();",
"  await cell(p,{x:6,y:3});",
"  await p.waitForTimeout(350);",
"  s=await st(p);",
"  A.deepEqual([unit(s,'starting-horse').x,unit(s,'starting-horse').y],[6,3],'手机版普通日字移动可达');",
"  A.equal(unit(s,'starting-horse').ap,0,'手机版普通移动消耗额度');",
"  const moveShot=await shot(p,'h20-mobile-move.png');",
"  return `手机横版(844x390, layout=${layout})：招募→营地→布阵确认→跳跃预览(执行按钮可用)→执行落点 (7,5) 击杀 SP 1→第2回合普通移动 (6,3)；截图 ${campShot},${previewShot},${shotName},${moveShot}`;",
" });",
" await ctx.close();",
"}",
""
].join('\n');
c=c.slice(0,i)+body+c.slice(j);
fs.writeFileSync(p,c);
console.log('mobile step replaced');
