// 一次性修补 tests/us021-horse.test.cjs（不作为交付物）。
const fs=require('node:fs');
const p='tests/us021-horse.test.cjs';
let c=fs.readFileSync(p,'utf8');
function sub(re,to,label){if(!re.test(c))throw Error('miss '+label);c=c.replace(re,to);}
sub(/assert\.deepEqual\(s,before,'非法目标不改变状态'\);/,"assert.equal(JSON.stringify(s),JSON.stringify(before),'非法目标不改变状态');",'H02 state cmp');
sub(/for\(const s of \[occupied,ally,wall,water,edge\]\)\{/,"for(const s of [occupied,ally,wall,water]){",'H03 loop');
sub(/const strong=withPush\(mk\(\[P\('king','king',0,0\),E\('boss','king',8,8\),P\('h','horse',4,4\)\],\{tiles:\{'4,1':'mountain'\},teamSp:4\}\)\);\r?\n const s3=R\.purchaseUpgrade\(R\.purchaseUpgrade\(strong,'h','horse-jump-damage'\),'h','horse-jump-damage'\);/,
"let strong=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)],{tiles:{'4,1':'mountain'},teamSp:6});\n strong=R.purchaseUpgrade(strong,'h','horse-push');\n const s3=R.purchaseUpgrade(R.purchaseUpgrade(strong,'h','horse-jump-damage'),'h','horse-jump-damage');",'H09 sp');
sub(/assert\.equal\(buy\.teamSp,0,'扣除公共 SP'\);/,"assert.equal(buy.teamSp,1,'扣除公共 SP');",'H12 sp');
sub(/const s=base\(\[P\('h','horse',4,3\),P\('king','king',4,1\),E\('boss','king',3,2\),E\('side','pawn',5,2\)\]\);\r?\n G\(s,'king'\)\.hp=1;G\(s,'boss'\)\.hp=1;/,
"const s=base([P('h','horse',4,3),E('boss','king',3,2),E('side','pawn',5,2)]);\n G(s,'king').x=4;G(s,'king').y=1;G(s,'king').hp=1;G(s,'boss').hp=1;",'H15 kings');
sub(/assert\.deepEqual\(R\.enemyPhase\(intent\)\.effects\.map\(e=>e\.status\),\['success'\],'敌方马按旧规则执行'\);/,
"const enemyEffects=R.enemyPhase(intent).effects;\n assert.equal(enemyEffects.find(e=>e.actor==='eh').status,'success','敌方马按旧规则执行');\n assert.equal(enemyEffects.find(e=>e.actor==='eh').damage.includes('target'),true);",'H19 effects');
sub(/assert\.equal\(retry\.teamSp,10,'重试恢复入关 SP'\);/,"assert.equal(retry.teamSp,8,'重试恢复入关快照 SP（营地购买后余额）');",'H13 sp');
fs.writeFileSync(p,c);
console.log('patched ok');
