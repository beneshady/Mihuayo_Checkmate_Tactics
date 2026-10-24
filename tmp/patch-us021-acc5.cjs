// 在正常入口主链路补充第 3 回合普通移动 + 撤回（H20 的“移动”环节）。
const fs=require('node:fs');
const p='tests/us021-acceptance-browser.cjs';
let c=fs.readFileSync(p,'utf8');
const anchor=" A.equal(report.pageErrors.length,0,'正常链路无页面错误：'+JSON.stringify(report.pageErrors));";
if(!c.includes(anchor))throw Error('anchor missing');
const add=[
" await step('H20-7','正常入口：第 3 回合普通移动与撤回',async()=>{",
"  await p.locator('#btn-end').click();",
"  await p.locator('#btn-confirm-yes').click();",
"  await p.waitForFunction(()=>window.__M0_DEBUG__.getState().turn===3,null,{timeout:20000});",
"  await p.waitForTimeout(300);",
"  let s=await st(p);",
"  const before={kills:s.kills,teamSp:s.teamSp};",
"  await selectBattleUnit(p,'recruit-horse-0');",
"  const modes=await p.locator('#rook-modes button').allInnerTexts();",
"  A.ok(modes.includes('普通移动'),'第 3 回合普通移动入口可用');",
"  await p.locator('[data-mode=\"horse-move\"]').click();",
"  await cell(p,{x:5,y:3});",
"  await p.waitForTimeout(250);",
"  s=await st(p);",
"  A.deepEqual([unit(s,'recruit-horse-0').x,unit(s,'recruit-horse-0').y],[5,3],'普通日字移动到 (5,3)');",
"  A.equal(unit(s,'recruit-horse-0').ap,0,'普通移动消耗额度');",
"  A.equal(s.kills,before.kills,'普通移动击杀数不变');",
"  A.equal(s.teamSp,before.teamSp,'普通移动不产生 SP');",
"  A.equal(await p.locator('#btn-undo').isEnabled(),true,'普通移动后可撤回');",
"  const shotMove=await shot(p,'h20-normal-move.png');",
"  await p.locator('#btn-undo').click();",
"  await p.waitForTimeout(250);",
"  s=await st(p);",
"  A.deepEqual([unit(s,'recruit-horse-0').x,unit(s,'recruit-horse-0').y],[4,5],'撤回恢复移动前位置');",
"  A.equal(unit(s,'recruit-horse-0').ap,1,'撤回恢复普通移动额度');",
"  const shotUndo=await shot(p,'h20-normal-undo.png');",
"  return `第 3 回合普通移动到 (5,3)（击杀/SP 不变、可撤回），撤回后回到 (4,5) 且 AP 恢复；截图 ${shotMove},${shotUndo}`;",
" });",
""
].join('\n');
c=c.replace(anchor,add+anchor);
fs.writeFileSync(p,c);
console.log('added H20-7');
