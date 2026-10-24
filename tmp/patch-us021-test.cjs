// 一次性修补 tests/us021-horse.test.cjs（不作为交付物）。
const fs=require('node:fs');
const p='tests/us021-horse.test.cjs';
let c=fs.readFileSync(p,'utf8');
function mustReplace(a,b){if(!c.includes(a))throw Error('missing: '+a.slice(0,60));c=c.split(a).join(b);}
function cut(startMarker,endMarker,replacement){
 const i=c.indexOf(startMarker);if(i<0)throw Error('start not found: '+startMarker.slice(0,40));
 const j=c.indexOf(endMarker,i);if(j<0)throw Error('end not found: '+endMarker.slice(0,40));
 c=c.slice(0,i)+replacement+c.slice(j+endMarker.length);
}
// 1) move 辅助函数兼容坐标对象
mustReplace("const move=(s,id,x,y)=>R.submit(s,id,{x:x,y:y});","const move=(s,id,x,y)=>R.submit(s,id,typeof x==='object'?x:{x:x,y:y});");
// 2) H18 旧战斗/快照迁移段
cut(" // 旧战斗存档：已用完旧共用行动的马不因迁移获得本回合跳跃",
" assert.deepEqual(R.migrateState(loadedBattle),loadedBattle,'重复迁移幂等');",
[
" // 旧战斗存档：已用完旧共用行动的马不因迁移获得本回合跳跃",
" const legacyUsed=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)]);",
" const lhUsed=G(legacyUsed,'h');",
" lhUsed.ap=0;",
" delete lhUsed.horseJumpRange;delete lhUsed.horseJumpDamage;delete lhUsed.horsePush;delete lhUsed.horseJumpUsed;",
" const migratedUsed=R.migrateState(legacyUsed);",
" const mh=G(migratedUsed,'h');",
" assert.deepEqual([mh.horseJumpRange,mh.horseJumpDamage,mh.horsePush],[2,1,false]);",
" assert.equal(mh.horseJumpUsed,true,'ap=0 的旧马迁移后不能新增本回合跳跃');",
" assert.equal(act(migratedUsed,'h',{x:4,y:2},'horse-jump'),undefined,'迁移后本回合无法使用跳跃');",
" // 未用完旧行动的马迁移后保留本回合跳跃",
" const legacyReady=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)]);",
" const lhReady=G(legacyReady,'h');",
" delete lhReady.horseJumpRange;delete lhReady.horseJumpDamage;delete lhReady.horsePush;delete lhReady.horseJumpUsed;",
" const migratedReady=R.migrateState(legacyReady);",
" assert.equal(G(migratedReady,'h').horseJumpUsed,false,'未用完行动的马迁移后仍可跳跃');",
" assert.ok(act(migratedReady,'h',{x:4,y:2},'horse-jump'));",
" // 入关/关卡快照同样迁移；失败重试不重复初始化、不刷新已用行动",
" const oldLevel=R.startLevel(R.enterCamp(R.newGame()),R.defaultMap());",
" const oldSnapState=R.copy(oldLevel);oldSnapState.phase='result';oldSnapState.result='dead';",
" const snapHorse=oldSnapState.levelSnapshot.units.find(u=>u.kind==='horse'&&u.side==='player');",
" snapHorse.ap=0;",
" delete snapHorse.horseJumpRange;delete snapHorse.horseJumpDamage;delete snapHorse.horsePush;delete snapHorse.horseJumpUsed;",
" const retried=R.retryLevel(oldSnapState);",
" const retryHorse=retried.units.find(u=>u.kind==='horse'&&u.side==='player');",
" assert.deepEqual([retryHorse.horseJumpRange,retryHorse.horseJumpDamage,retryHorse.horsePush],[2,1,false]);",
" assert.equal(retryHorse.horseJumpUsed,true,'重试不刷新旧档已用完的行动');",
" assert.equal(R.migrateState(migratedUsed).units.find(u=>u.id==='h').horseJumpUsed,true,'重复迁移幂等');"
].join('\n'));
// 3) H19 我方马旧攻击入口断言
mustReplace(
" assert.equal(act(mine,'h',{x:5,y:2},undefined),undefined,'普通移动不能吃子');\n assert.equal(act(mine,'h',{x:5,y:2},'attack'),undefined,'不存在第三种攻击入口');",
" assert.equal(act(mine,'h',{x:5,y:2},undefined).type,'move','空落点仍是普通移动');\n for(let y=0;y<9;y++)for(let x=0;x<9;x++){const a=act(mine,'h',{x,y},'attack');if(a)assert.notEqual(a.type,'attack','我方马不存在旧普通攻击动作');}");
// 4) H19 敌方意图执行前写入状态
mustReplace(" const intents=R.generateIntents(intent);\n"," const intents=R.generateIntents(intent);intent.intents=intents;\n");
if(!c.includes('intent.intents=intents'))throw Error('intent assignment missing');
fs.writeFileSync(p,c);
console.log('patched ok');
