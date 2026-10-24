// 修补 tests/us021-acceptance-browser.cjs（不作为交付物）。
const fs=require('node:fs');
const p='tests/us021-acceptance-browser.cjs';
let c=fs.readFileSync(p,'utf8');
function must(a,b,label){if(!c.includes(a))throw Error('miss '+label+': '+a.slice(0,70));c=c.split(a).join(b);}
// 1) 技能按钮作用域：避免营地与战斗两处同名 data-skill
must("p.locator('[data-skill=\"horse-jump-distance\"]')","p.locator('#skills [data-skill=\"horse-jump-distance\"]')",'scope distance');
must("p.locator('[data-skill=\"horse-push\"]')","p.locator('#skills [data-skill=\"horse-push\"]')",'scope push');
must("p.locator('[data-skill=\"horse-jump-damage\"]')","p.locator('#skills [data-skill=\"horse-jump-damage\"]')",'scope damage');
// 2) H02/H03 原地点击应选中己方棋子，不进入非法落点提示
must("const cases=[[{x:4,y:1},'超过技能距离'],[{x:5,y:5},'斜向'],[{x:4,y:4},'原地'],[{x:4,y:2},'山体'],[{x:4,y:3},'水格'],[{x:6,y:4},'为空']];",
"const cases=[[{x:4,y:1},'超过技能距离'],[{x:5,y:5},'斜向'],[{x:4,y:2},'山体'],[{x:4,y:3},'水格'],[{x:6,y:4},'为空']];",'cases');
must("  const shotName=await shot(p,'h03-illegal-targets.png');\n  return `依次点击 3 格/斜向/原地/山/水/占用格：均显示对应原因且状态不变；${reasons.join('；')}；截图 ${shotName}`;",
"  await cell(p,{x:4,y:4});await p.waitForTimeout(100);\n  A.equal(JSON.stringify(await st(p)),before,'点击自身格只选中棋子、不释放技能');\n  reasons.push('原地→选中自身（无技能结算）');\n  const shotName=await shot(p,'h03-illegal-targets.png');\n  return `依次点击 3 格/斜向/山/水/占用格：均显示对应原因且状态不变；点击自身格只选中；${reasons.join('；')}；截图 ${shotName}`;",'self click');
// 3) H19 敌方意图夹具补充真实意图
must("  const s=fixture([R.unit('h','player','horse',4,4),R.unit('eh','enemy','horse',1,4)],{tiles:{'1,3':'mountain'}});",
"  const s=fixture([R.unit('h','player','horse',4,4),R.unit('eh','enemy','horse',1,4),R.unit('t','player','pawn',3,5)],{tiles:{'1,3':'mountain'}});\n  s.intents=R.generateIntents(s);",'H19 intents');
// 4) H18 旧战斗续局：修正 unit 参数顺序
must("const battle=fixture([R.unit('h','horse',4,4)],{teamSp:3});","const battle=fixture([R.unit('h','player','horse',4,4)],{teamSp:3});",'H18 unit');
// 5) H13 营地存档：余额足够招募
must("camp2.teamSp=5;camp2.gold=0;\n  camp2=R.buy(camp2,'horse');","camp2.teamSp=5;camp2.gold=20;\n  camp2=R.buy(camp2,'horse');camp2.gold=0;",'H13 gold');
// 6) H20-6 预览等待与诊断
must("  await hoverCell(p,{x:4,y:5});\n  await p.waitForTimeout(150);\n  const previewText=await p.locator('#preview-box').innerText();\n  A.ok(/直线 3 格/.test(previewText),'预览显示 3 格跳跃距离');",
"  await hoverCell(p,{x:4,y:5});\n  await p.waitForTimeout(350);\n  const previewText=await p.locator('#preview-box').innerText();\n  A.ok(/直线 3 格/.test(previewText),'预览显示 3 格跳跃距离；实际：'+previewText.slice(0,120));",'H20-6 preview');
fs.writeFileSync(p,c);
console.log('patched');
