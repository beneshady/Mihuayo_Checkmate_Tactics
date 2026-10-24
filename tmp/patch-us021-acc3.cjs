// 增补两段专项界面步骤（H01 先移后跳、H15 双王同亡终局）到 acceptance 测试。
const fs=require('node:fs');
const p='tests/us021-acceptance-browser.cjs';
let c=fs.readFileSync(p,'utf8');
const anchor=" await step('H02/H03-专项界面'";
const i=c.indexOf(anchor);
if(i<0)throw Error('anchor missing');
const add=[
" await step('H01-专项界面','先普通移动再释放跳跃：普通移动不伤害、跳跃照常结算',async()=>{",
"  const s1=fixture([R.unit('h','player','horse',4,4),R.unit('near','enemy','pawn',6,6),R.unit('t','enemy','pawn',6,5)]);",
"  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),s1);",
"  await p.locator('[data-unit=\"h\"]').click();",
"  await cell(p,{x:5,y:6});await p.waitForTimeout(200);",
"  let s=await st(p);",
"  A.deepEqual([unit(s,'h').x,unit(s,'h').y],[5,6],'普通移动到达 (5,6)');",
"  A.equal(unit(s,'near').hp,1,'普通移动不伤害落点四邻敌人');",
"  A.equal(s.units.find(u=>u.id==='t').hp,1);",
"  A.equal(unit(s,'h').ap,0,'普通移动消耗额度');",
"  await p.locator('[data-unit=\"h\"]').click();",
"  await p.locator('[data-mode=\"horse-jump\"]').click();",
"  await cell(p,{x:5,y:5});await p.waitForTimeout(250);",
"  s=await st(p);",
"  A.equal(unit(s,'t'),undefined,'先移后跳仍可击杀四邻目标');",
"  A.equal(unit(s,'h').horseJumpUsed,true);",
"  A.equal(s.teamSp,1,'跳跃击杀累计公共 SP');",
"  const shotName=await shot(p,'h01-move-then-jump.png');",
"  return `普通移动 (4,4)→(5,6) 不造成伤害，随后跳跃 (5,5) 击杀 t、SP 1；截图 ${shotName}`;",
" });",
" await step('H15-专项界面','双王同亡：完整结算后失败优先（终局截图）',async()=>{",
"  const s1=fixture([R.unit('h','player','horse',4,3),R.unit('side','enemy','pawn',5,2)]);",
"  const king=s1.units.find(u=>u.id==='king');king.x=4;king.y=1;king.hp=1;",
"  const boss=s1.units.find(u=>u.id==='boss');boss.x=3;boss.y=2;boss.hp=1;",
"  await p.evaluate(s=>window.__M0_DEBUG__.setState(s),s1);",
"  await p.locator('[data-unit=\"h\"]').click();",
"  await p.locator('[data-mode=\"horse-jump\"]').click();",
"  await cell(p,{x:4,y:2});await p.waitForTimeout(300);",
"  const s=await st(p);",
"  A.equal(s.result,'dead','双方主将同亡时失败优先');",
"  A.equal(s.phase,'result');",
"  A.equal(unit(s,'side'),undefined,'其他方向目标同样被结算');",
"  const overlay=await p.locator('#ov-result').innerText().catch(()=>'');",
"  const shotName=await shot(p,'h15-both-kings.png');",
"  return `同次技能击杀双方主将与其他方向目标，结果 ${s.result}/${s.phase}；结算浮层含“${overlay.split('\\n')[0].slice(0,20)}”；截图 ${shotName}`;",
" });",
""
].join('\n');
c=c.slice(0,i)+add+c.slice(i);
fs.writeFileSync(p,c);
console.log('added H01/H15 fixture steps');
