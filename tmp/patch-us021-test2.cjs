// 一次性修补 tests/us021-horse.test.cjs（不作为交付物）。
const fs=require('node:fs');
const p='tests/us021-horse.test.cjs';
let c=fs.readFileSync(p,'utf8');
function mustReplace(a,b){if(!c.includes(a))throw Error('missing: '+a.slice(0,70));c=c.split(a).join(b);}
// H02 状态比较用 JSON（R.copy 会丢弃 undefined 字段）
mustReplace("   assert.deepEqual(s,before,'非法目标不改变状态');","   assert.equal(JSON.stringify(s),JSON.stringify(before),'非法目标不改变状态');");
// H03 界外单独判定，循环体只复用非法落点
mustReplace(" for(const s of [occupied,ally,wall,water,edge]){"," for(const s of [occupied,ally,wall,water]){");
// H09 强化伤害用例：显式 SP，避免 withPush 覆盖余额
mustReplace(" const strong=withPush(mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)],{tiles:{'4,1':'mountain'},teamSp:4}));\n const s3=R.purchaseUpgrade(R.purchaseUpgrade(strong,'h','horse-jump-damage'),'h','horse-jump-damage');",
" let strong=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)],{tiles:{'4,1':'mountain'},teamSp:6});\n strong=R.purchaseUpgrade(strong,'h','horse-push');\n const s3=R.purchaseUpgrade(R.purchaseUpgrade(strong,'h','horse-jump-damage'),'h','horse-jump-damage');");
// H12 距离购买后 SP 2-1=1
mustReplace(" assert.equal(buy.teamSp,0,'扣除公共 SP');"," assert.equal(buy.teamSp,1,'扣除公共 SP');");
// H15 复用主将单位而不是重复 id
mustReplace(" const s=base([P('h','horse',4,3),P('king','king',4,1),E('boss','king',3,2),E('side','pawn',5,2)]);\n G(s,'king').hp=1;G(s,'boss').hp=1;",
" const s=base([P('h','horse',4,3),E('boss','king',3,2),E('side','pawn',5,2)]);\n G(s,'king').x=4;G(s,'king').y=1;G(s,'king').hp=1;G(s,'boss').hp=1;");
// H19 只断言敌方马自身结算
mustReplace(" assert.deepEqual(R.enemyPhase(intent).effects.map(e=>e.status),['success'],'敌方马按旧规则执行');",
" const enemyEffects=R.enemyPhase(intent).effects;\n assert.equal(enemyEffects.find(e=>e.actor==='eh').status,'success','敌方马按旧规则执行');\n assert.equal(enemyEffects.find(e=>e.actor==='eh').damage.includes('target'),true);");
fs.writeFileSync(p,c);
console.log('patched ok');
