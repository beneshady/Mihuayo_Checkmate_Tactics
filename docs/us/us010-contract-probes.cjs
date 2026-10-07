// 主策划独立边界验收：显式隔离夹具，不是正式流程或浏览器通过证据。
const assert = require('node:assert/strict');
const R = require('../../web/js/rules.js');
const p = (id, kind, x, y) => R.unit(id, 'player', kind, x, y);
const e = (id, kind, x, y) => R.unit(id, 'enemy', kind, x, y);
const make = units => R.emptyState([p('king','king',4,0),e('boss','king',4,8),...units]);
const get = (s,id) => s.units.find(u=>u.id===id);
let passed=0, failed=0;
function check(name, fn) {try {fn(); passed++; console.log('PASS '+name);} catch(err) {failed++; console.log('FAIL '+name+': '+err.message);}}
for(let x=0;x<9;x++)check(`河道(${x},4)死亡：仅桥留尸`,()=>{
  const s=make([p('ally','horse',x,4),e('killer','pawn',x,5)]);
  s.intents=[{actor:'killer',from:{x,y:5},to:{x,y:4},offset:{x:0,y:-1},type:'attack',path:[{x,y:4}],order:1}];
  const n=R.enemyPhase(s).state;
  assert.equal(get(n,'ally'),undefined);
  assert.equal(!!R.corpseAt(n,{x,y:4}),[1,4,7].includes(x));
});
for(const side of ['player','enemy'])check(`${side}兵：河道不能横移，对岸可横移且不能后退`,()=>{
  const u=R.unit('pawn',side,'pawn',2,4),s=make([u]);
  assert.equal(R.actionAt(s,u,{x:3,y:4}),undefined);
  u.y=side==='player'?5:3;
  assert.ok(R.actionAt(s,u,{x:3,y:u.y}));
  assert.equal(R.actionAt(s,u,{x:2,y:u.y+(side==='player'?-1:1)}),undefined);
});
check('炮可隔一占位跨8格，空桥不充当炮架',()=>{
  const s=make([p('gun','cannon',1,0),e('target','rook',1,8)]);
  assert.equal(R.preview(s,'gun',{x:1,y:8}),undefined);
  s.units.push(p('rack','pawn',1,4));
  const out=R.submit(s,'gun',{x:1,y:8});assert.ok(out.effect);assert.equal(get(out.state,'target'),undefined);
  assert.deepEqual([get(out.state,'gun').x,get(out.state,'gun').y],[1,0]);
});
check('尸体可作炮架并阻挡马腿',()=>{
  const s=make([p('gun','cannon',2,0),e('target','rook',2,3),p('horse','horse',1,1)]);
  s.corpses.push({id:'corpse',x:2,y:1,unit:p('dead','pawn',2,1)});
  assert.ok(R.preview(s,'gun',{x:2,y:3}));assert.equal(R.actionAt(s,get(s,'horse'),{x:3,y:2}),undefined);
});
check('枪贯穿命中尸体前敌人，尸体后不受伤',()=>{
  const spear=p('spear','spearman',2,1);spear.directionPaid[0]=6;
  const s=make([spear,e('front','pawn',2,2),e('behind','pawn',2,5)]);
  s.corpses.push({id:'corpse',x:2,y:3,unit:p('dead','pawn',2,3)});
  const n=R.submitDirection(s,'spear',0).state;
  assert.equal(get(n,'front'),undefined);assert.equal(get(n,'behind').hp,1);assert.equal(n.corpses.length,1);
});
for(let d=0;d<4;d++)check(`弓方向${d}：近身阻挡、2格有效、3格初始无效`,()=>{
  const v=R.CONFIG.directions[d],archer=p('archer','archer',4,4),near=e('near','pawn',4+v.x,4+v.y),far=e('far','rook',4+v.x*2,4+v.y*2);
  const s=make([archer,near,far]);assert.equal(R.directionalAction(s,'archer',d),undefined);
  s.units=s.units.filter(u=>u.id!=='near');assert.deepEqual(R.directionalAction(s,'archer',d).targets,['far']);
  far.x=4+v.x*3;far.y=4+v.y*3;assert.equal(R.directionalAction(s,'archer',d),undefined);
  archer.sp=1;const n=R.purchaseUpgrade(s,'archer','direction',d);
  assert.equal(get(n,'archer').sp,0);assert.equal(get(n,'archer').directionPaid.reduce((a,b)=>a+b,0),1);
  assert.deepEqual(R.directionalAction(n,'archer',d).targets,['far']);
});
check('三体碰撞预览与提交一致，第四个不受伤、不连推',()=>{
  const car=p('car','rook',1,3);car.rookRole='charge';car.rookPush=true;
  const b=e('b','rook',2,3);b.hp=b.maxHp=5;
  const c=e('c','rook',3,3),d=e('d','rook',4,3),s=make([car,b,c,d]);
  const preview=R.preview(s,'car',{x:2,y:3},'charge'),out=R.submit(s,'car',{x:2,y:3},'charge');
  assert.deepEqual(out.effect,preview.effect);assert.deepEqual(['car','b','c','d'].map(id=>get(out.state,id).hp),[1,2,1,2]);
  assert.deepEqual(['car','b','c','d'].map(id=>get(out.state,id).x),[1,2,3,4]);
});
check('边界不追加碰撞，直接伤害仍发生',()=>{
  const car=p('car','rook',7,3);car.rookRole='charge';car.rookPush=true;
  const s=make([car,e('target','rook',8,3)]),out=R.submit(s,'car',{x:8,y:3},'charge');
  assert.equal(get(out.state,'car').hp,2);assert.equal(get(out.state,'target').hp,1);assert.equal(out.effect.pushStatus,'outside');
});
check('阻挡增援扣死仍阻挡本次，下次清尸才出生',()=>{
  const s=make([p('block','pawn',2,5)]);s.pendingSpawns=[{id:'new','kind':'pawn',x:2,y:5,status:'pending'}];
  R.attemptSpawns(s);assert.equal(get(s,'new'),undefined);assert.equal(get(s,'block'),undefined);assert.ok(R.corpseAt(s,{x:2,y:5}));
  R.attemptSpawns(s);assert.ok(get(s,'new'));assert.equal(R.corpseAt(s,{x:2,y:5}),undefined);assert.equal(s.kills,0);
});
check('旧敌挡出生只暂缓，不伤害不移位',()=>{
  const s=make([e('block','rook',2,5)]);s.pendingSpawns=[{id:'new','kind':'pawn',x:2,y:5,status:'pending'}];
  R.attemptSpawns(s);assert.equal(get(s,'new'),undefined);assert.equal(get(s,'block').hp,2);assert.deepEqual([get(s,'block').x,get(s,'block').y],[2,5]);
});
check('救援先于增援：1血复活后挡出生可再死但阻挡有效',()=>{
  const s=make([]);s.phase='rescue';s.turn=6;s.commanderBuff='rescue';
  s.corpses=[{id:'body',x:2,y:5,unit:p('dead','pawn',2,5)}];s.pendingSpawns=[{id:'new','kind':'pawn',x:2,y:5,status:'pending'}];
  const n=R.rescue(s,'dead');assert.equal(n.phase,'player');assert.equal(n.rescueUsed,true);assert.equal(get(n,'new'),undefined);assert.equal(get(n,'dead'),undefined);assert.ok(R.corpseAt(n,{x:2,y:5}));
});
check('敌将提前死亡取消未来增援，只结算已击杀将5金币且不重发',()=>{
  const car=p('car','rook',4,6),s=make([car]);get(s,'boss').hp=1;s.turn=4;s.pendingSpawns=[{id:'later','kind':'pawn',x:2,y:5,status:'pending'}];
  const n=R.submit(s,'car',{x:4,y:8}).state;assert.equal(n.result,'victory');assert.equal(n.gold,5);assert.equal(n.pendingSpawns.length,0);
  assert.equal(R.endTurn(n).state.gold,5);
});
check('第11回合敌攻击先结算，帅死优先失败且不发币',()=>{
  const s=make([e('killer','pawn',4,1)]);get(s,'king').hp=1;s.turn=11;s.killLedger={earlier:1};
  s.intents=[{actor:'killer',from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'attack',path:[{x:4,y:0}],order:1}];
  const n=R.endTurn(s).state;assert.equal(n.result,'dead');assert.equal(n.gold,0);assert.equal(n.turn,11);
});
check('牵引贴身友军/尸体拒绝且不耗行动',()=>{
  const car=p('car','rook',1,2);car.rookRole='pull';const s=make([car,p('friend','pawn',2,2)]);
  assert.equal(R.submit(s,'car',{x:2,y:2},'pull').effect,undefined);assert.equal(car.rookChargeAvailable,true);
  s.units=s.units.filter(u=>u.id!=='friend');s.corpses=[{id:'body',x:2,y:2,unit:p('dead','pawn',2,2)}];
  assert.equal(R.submit(s,'car',{x:2,y:2},'pull').effect,undefined);
});
check('两门炮额度独立，非法二次移动无效',()=>{
  const s=make([p('a','cannon',0,0),p('b','cannon',2,0)]),n=R.submit(s,'a',{x:0,y:2}).state;
  assert.equal(get(n,'a').cannonMoveAvailable,false);assert.equal(get(n,'a').cannonAttackAvailable,true);
  assert.equal(get(n,'b').cannonMoveAvailable,true);assert.equal(R.submit(n,'a',{x:0,y:3}).effect,undefined);
});
console.log(JSON.stringify({passed,failed,total:passed+failed,scope:'isolated contract probes, NOT browser/full-playthrough'}));
process.exitCode=failed?1:0;
