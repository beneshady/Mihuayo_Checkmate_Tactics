// 在 H05/H07/H14 专项步骤中加入“本次直接伤害新产生的友军尸体同次外推”验证。
const fs=require('node:fs');
const p='tests/us021-acceptance-browser.cjs';
let c=fs.readFileSync(p,'utf8');
function must(a,b,label){if(!c.includes(a))throw Error('miss '+label);c=c.split(a).join(b);}
must("  const state=fixture([R.unit('h','player','horse',4,4),R.unit('enemyRook','enemy','rook',4,1),R.unit('allyRook','player','rook',3,2)],\n   {teamSp:2,corpses:[{id:'c',x:5,y:2,unit:R.unit('deadAlly','player','pawn',5,2)}]});",
"  const state=fixture([R.unit('h','player','horse',4,4),R.unit('enemyRook','enemy','rook',4,1),R.unit('allyRook','player','rook',3,2),R.unit('allyPawn','player','pawn',4,3)],\n   {teamSp:2,corpses:[{id:'c',x:5,y:2,unit:R.unit('deadAlly','player','pawn',5,2)}]});",'add allyPawn');
must("  A.deepEqual([s.corpses[0].x,s.corpses[0].y],[6,2],'既有尸体被外推到 (6,2)');",
"  A.equal(unit(s,'allyPawn'),undefined,'四邻格友军兵被直接击杀');\n  const freshBody=s.corpses.find(b=>b.unit.id==='allyPawn');\n  A.ok(freshBody,'本次伤害新产生的友军尸体保留');\n  A.deepEqual([freshBody.x,freshBody.y],[4,4],'新友军尸体在同次推动阶段外推到 (4,4)');\n  A.deepEqual([s.corpses.find(b=>b.unit.id==='deadAlly').x,s.corpses.find(b=>b.unit.id==='deadAlly').y],[6,2],'既有尸体被外推到 (6,2)');\n  A.equal(s.kills,0,'击杀友军不计入战绩');",'corpse asserts');
fs.writeFileSync(p,c);
console.log('patched H14 corpse');
