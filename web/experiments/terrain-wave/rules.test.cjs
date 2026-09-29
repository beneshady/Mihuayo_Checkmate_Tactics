const assert = require('node:assert/strict');
const G = require('./rules.js');
let total = 0;
function test(name, fn) { fn(); total++; console.log(`PASS ${name}`); }
function state() { const s = G.createState(); s.units = [G.unit('king', 'player', 'king', 5, 1), G.unit('boss', 'enemy', 'king', 5, 9)]; s.tiles = {}; s.intents = []; s.log = []; return s; }
function add(s, kind, x, y, side = 'player', id = kind) { const u = G.unit(id, side, kind, x, y); s.units.push(u); return u; }
function attack(s, u, x, y, roll = 1) { const a = G.attackAction(s, u, { x, y }); assert.ok(a, `attack ${u.id} ${x},${y}`); G.execute(s, a, () => roll); }
test('9×9，三座桥，六名友军八名敌军，开场不扣血', () => {
  const s = G.createState(); assert.equal(G.cells().length, 81); assert.equal(s.units.length, 14);
  assert.deepEqual([1,2,3,4,5,6,7,8,9].filter(x => G.terrain(s,{x,y:5}) === 'bridge'), [2,5,8]);
  assert.ok(s.units.every(u => u.hp === u.maxHp)); assert.equal(s.intents.length, 8);
});
test('双方兵系过河前能横走，不能后退', () => {
  for (const side of ['player', 'enemy']) for (const kind of ['pawn','archer','spear']) {
    const s=state(), u=add(s,kind,2,side==='player'?2:8,side);
    assert.ok(G.moveAction(s,u,{x:3,y:u.y})); assert.ok(!G.moveAction(s,u,{x:2,y:u.y+(side==='player'?-1:1)}));
  }
});
test('双方兵系与炮入水死亡；长移动在首个水格中断', () => {
  for (const side of ['player','enemy']) for (const kind of ['pawn','archer','spear','cannon']) {
    const s=state(),u=add(s,kind,2,3,side);s.tiles['3,3']='water';
    const a=G.moveAction(s,u,{x:kind==='cannon'?5:3,y:3},true);assert.ok(a.drown);G.execute(s,a);
    assert.equal(u.hp,0);assert.equal(u.x,3);assert.equal(s.kills,0);
  }
});
test('马跳跃只检查落点；水中禁攻，离水移动不补行动',()=>{
  const s=state(),u=add(s,'horse',2,2);s.tiles['2,3']='water';
  assert.ok(G.moveAction(s,u,{x:3,y:4}));s.tiles['3,4']='water';G.execute(s,G.moveAction(s,u,{x:3,y:4}));assert.equal(u.hp,1);
  add(s,'pawn',4,6,'enemy');assert.equal(G.attackAction(s,u,{x:4,y:6}),null);
  u.moved=false;G.execute(s,G.moveAction(s,u,{x:4,y:2}));assert.equal(G.attackAction(s,u,{x:5,y:4}),null);
});
test('车普通移动离水后可冲击，但不能从水中发动冲击',()=>{
  const s=state(),u=add(s,'rook',2,2);s.tiles['2,2']='water';assert.equal(G.attackAction(s,u,{x:3,y:2}),null);
  G.execute(s,G.moveAction(s,u,{x:3,y:2}));assert.ok(G.attackAction(s,u,{x:4,y:2}));
});
test('车命中前入水中断，不伤敌人、不返还攻击',()=>{
  const s=state(),u=add(s,'rook',1,3),e=add(s,'rook',4,3,'enemy');s.tiles['2,3']='water';attack(s,u,4,3);
  assert.equal(u.x,2);assert.equal(e.hp,2);assert.ok(u.attacked);
});
test('车从陆地击杀水中单位，完成伤害后占水格',()=>{
  const s=state(),u=add(s,'rook',2,3),e=add(s,'rook',3,3,'enemy');e.hp=1;s.tiles['3,3']='water';attack(s,u,3,3);
  assert.equal(u.x,3);assert.equal(s.kills,1);assert.equal(e.hp,0);
});
test('震退敌炮入水计一次击杀，车不追位，没有成长状态',()=>{
  const s=G.createState('water'),u=s.units.find(u=>u.id==='rook');attack(s,u,4,6);
  assert.equal(G.at(s,{x:4,y:5}),undefined);assert.equal(u.y,7);assert.equal(s.kills,1);assert.equal(s.level,undefined);
});
test('震退敌车入水冻结意图保留且攻击失效',()=>{
  const s=state(),u=add(s,'rook',2,6),e=add(s,'rook',2,4,'enemy','e');s.tiles['2,3']='water';
  s.intents=[{actor:'e',name:'车',order:1,dx:1,dy:0,standby:false}];attack(s,u,2,4);
  assert.equal(e.y,3);assert.equal(G.intentAction(s,s.intents[0]).reason,'水中无法攻击');assert.equal(s.intents[0].dx,1);
});
test('山阻挡普通移动与马腿',()=>{
  const s=state(),r=add(s,'rook',1,3),h=add(s,'horse',3,2);s.tiles['3,3']=2;
  assert.equal(G.moveAction(s,r,{x:4,y:3}),null);assert.equal(G.moveAction(s,h,{x:4,y:4}),null);
});
test('山两次命中坍塌，车不占位、不获击杀',()=>{
  const s=state(),r=add(s,'rook',1,3);s.tiles['3,3']=2;attack(s,r,3,3);assert.equal(s.tiles['3,3'],1);
  r.attacked=false;r.moved=false;attack(s,r,3,3);assert.equal(s.tiles['3,3'],0);assert.equal(r.x,2);assert.equal(s.kills,0);
});
test('炮伤害2只记山一次命中；炮直接打山也需要架',()=>{
  const s=state(),c=add(s,'cannon',2,1);s.tiles['2,4']=2;assert.equal(G.attackAction(s,c,{x:2,y:4}),null);
  add(s,'pawn',2,2);attack(s,c,2,4);assert.equal(s.tiles['2,4'],1);
});
test('一个山炮架合法，两个炮架失效；山本身不被自动伤害',()=>{
  const s=state(),c=add(s,'cannon',2,1);s.tiles['2,3']=2;add(s,'rook',2,6,'enemy');assert.ok(G.attackAction(s,c,{x:2,y:6}));
  s.tiles['2,4']=2;assert.equal(G.attackAction(s,c,{x:2,y:6}),null);delete s.tiles['2,4'];attack(s,c,2,6);assert.equal(s.tiles['2,3'],2);
});
test('枪兵拆山不穿透本次坍塌后的山',()=>{
  const s=state(),p=add(s,'spear',2,2),e=add(s,'pawn',2,5,'enemy');s.tiles['2,4']=1;attack(s,p,2,4);
  assert.equal(s.tiles['2,4'],0);assert.equal(e.hp,1);
});
test('炮扩散破坏炮架山，不取消已确定的同次攻击',()=>{
  const s=state(),c=add(s,'cannon',2,1),e=add(s,'rook',2,4,'enemy');s.tiles['2,3']=1;c.splash=[{x:0,y:-1}];attack(s,c,2,4);
  assert.equal(e.hp,0);assert.equal(s.tiles['2,3'],0);
});
test('树林闪避取消伤害与震退，车停目标前，消耗攻击',()=>{
  const s=state(),r=add(s,'rook',1,3),e=add(s,'rook',4,3,'enemy');s.tiles['4,3']='forest';attack(s,r,4,3,0.29);
  assert.equal(e.hp,2);assert.equal(e.x,4);assert.equal(r.x,3);assert.ok(r.attacked);
});
test('树林概率边界：0.3命中，0.2999闪避',()=>{
  for(const roll of [0.2999,0.3]){const s=state(),p=add(s,'pawn',2,2),e=add(s,'pawn',2,3,'enemy');s.tiles['2,3']='forest';attack(s,p,2,3,roll);assert.equal(e.hp,roll<0.3?1:0);}
});
test('双方树林均受益，多目标独立判定',()=>{
  const s=state(),c=add(s,'cannon',2,1),a=add(s,'pawn',2,3,'player','a'),b=add(s,'pawn',2,4,'enemy','b');
  s.tiles['2,3']='forest';s.tiles['2,4']='forest';c.splash=[{x:0,y:-1}];let i=0;
  G.execute(s,G.attackAction(s,c,{x:2,y:4}),()=>[0,1][i++]);assert.equal(b.hp,1);assert.equal(a.hp,0);assert.equal(i,2);
});
test('冻结攻击可击中山而不重新瞄准',()=>{
  const s=state(),e=add(s,'rook',2,4,'enemy','e');s.tiles['3,4']=1;s.intents=[{actor:'e',name:'车',order:1,dx:1,dy:0,standby:false}];
  const info=G.intentAction(s,s.intents[0]);assert.ok(info.action);G.execute(s,info.action);assert.equal(s.tiles['3,4'],0);assert.equal(e.x,2);
});
test('敌方友伤不计我方击杀',()=>{
  const s=state(),e=add(s,'pawn',2,3,'enemy','e'),f=add(s,'pawn',2,2,'enemy','f');
  G.execute(s,G.attackAction(s,e,f,true));assert.equal(f.hp,0);assert.equal(s.kills,0);
});
test('敌人无路待机，不主动自杀或拆山',()=>{
  const s=state(),e=add(s,'pawn',2,3,'enemy');s.tiles['1,3']=2;s.tiles['3,3']=2;s.tiles['2,2']='water';G.prepare(s);
  assert.equal(e.x,2);assert.equal(e.y,3);assert.equal(e.hp,1);assert.ok(s.intents.find(i=>i.actor===e.id).standby);
});
test('横走允许敌兵寻找桥，不需要更改过河属性',()=>{
  const s=state(),e=add(s,'pawn',4,6,'enemy');s.tiles['4,5']='water';s.tiles['5,5']='bridge';G.prepare(s);assert.equal(e.x,5);assert.equal(e.y,6);
});
test('树林连锁预测枚举炮架有无，不消费随机数或修改真实状态',()=>{
  const s=G.createState('forest'),before=JSON.stringify(s),saved=Math.random;Math.random=()=>{throw Error('preview must not use RNG');};
  try{const rows=G.forecast(s),row=rows.find(r=>r.actor==='shooter');assert.ok(row.conditional);assert.ok(row.outcomes.some(t=>t.includes('失效')));assert.ok(row.outcomes.some(t=>t.includes('伤害 2')));assert.equal(JSON.stringify(s),before);}finally{Math.random=saved;}
});
test('树林连锁实际命中/闪避分支与预测一致',()=>{
  const hit=G.endTurn(G.createState('forest'),()=>1),miss=G.endTurn(G.createState('forest'),()=>0);
  assert.equal(hit.units.find(u=>u.id==='king').hp,1);assert.equal(miss.units.find(u=>u.id==='king').hp,3);
});
test('胜利只打一波，不进入成长和商店',()=>{
  const s=state(),c=add(s,'cannon',5,5);s.tiles['5,7']=2;attack(s,c,5,9);assert.equal(s.result,'victory');assert.equal(s.kills,1);
  assert.deepEqual(G.endTurn(s),s);
});
test('同次炮击双方将帅阵亡，失败优先',()=>{
  const s=state(),k=s.units.find(u=>u.id==='king'),b=s.units.find(u=>u.id==='boss');k.x=4;k.y=7;k.hp=2;b.x=5;b.y=7;
  const c=add(s,'cannon',5,4);s.tiles['5,6']=2;c.splash=[{x:-1,y:0}];attack(s,c,5,7);assert.equal(s.result,'defeat');
});
test('所有预设无棋子重叠、无山占位，重开恢复山体',()=>{
  for(const scenario of ['main','water','mountain','forest']){const s=G.createState(scenario);assert.equal(new Set(s.units.map(G.key)).size,s.units.length);assert.ok(s.units.every(u=>!G.mountain(s,u)));}
  const s=G.createState('mountain');s.tiles['3,3']=0;assert.equal(G.createState('mountain').tiles['3,3'],2);
});
test('撞山额外1伤害，完整山开裂；撞死归推动者且车不追位',()=>{
  const s=state(),r=add(s,'rook',1,3),e=add(s,'rook',3,3,'enemy');s.tiles['4,3']=2;attack(s,r,3,3);
  assert.equal(e.hp,0);assert.equal(s.tiles['4,3'],1);assert.equal(s.kills,1);assert.equal(r.x,2);
});
test('撞塌山后存活棋子不移入山格，车也不追位',()=>{
  const s=state(),r=add(s,'rook',1,3),e=add(s,'rook',3,3,'enemy');e.hp=e.maxHp=3;s.tiles['4,3']=1;attack(s,r,3,3);
  assert.equal(e.hp,1);assert.equal(e.x,3);assert.equal(r.x,2);assert.equal(s.tiles['4,3'],0);assert.equal(s.kills,0);
});
test('直接击杀、无震退技能或树林闪避均不伤背后山体',()=>{
  for(const variant of ['kill','no-push','miss']){const s=state(),r=add(s,'rook',1,3),e=add(s,'rook',3,3,'enemy');s.tiles['4,3']=2;
    if(variant==='kill')e.hp=1;if(variant==='no-push')r.push=false;if(variant==='miss')s.tiles['3,3']='forest';
    attack(s,r,3,3,variant==='miss'?0:1);assert.equal(s.tiles['4,3'],2);assert.equal(s.kills,variant==='kill'?1:0);
  }
});
test('棋子阻挡、越界、宫界阻挡不产生撞山伤害',()=>{
  const s=state(),r=add(s,'rook',1,3),e=add(s,'rook',3,3,'enemy');add(s,'pawn',4,3,'enemy');attack(s,r,3,3);assert.equal(e.hp,1);
  const t=state(),a=add(t,'rook',4,6),k=t.units.find(u=>u.id==='boss');k.x=4;k.y=9;t.tiles['4,10']=2;attack(t,a,4,9);assert.equal(k.hp,1);
  const v=state(),b=add(v,'rook',5,8),king=v.units.find(u=>u.id==='boss');king.x=6;king.y=8;v.tiles['7,8']=2;attack(v,b,6,8);assert.equal(king.hp,1);assert.equal(v.tiles['7,8'],2);
});
test('撞山斩将触发胜利，后续炮架随山坍塌失效',()=>{
  const s=state(),r=add(s,'rook',5,6),boss=s.units.find(u=>u.id==='boss');boss.y=8;s.tiles['5,9']=1;attack(s,r,5,8);
  assert.equal(s.result,'victory');assert.equal(s.kills,1);assert.equal(r.y,7);assert.equal(s.tiles['5,9'],0);
  const t=state(),a=add(t,'rook',1,3),e=add(t,'rook',3,3,'enemy'),c=add(t,'cannon',4,1,'enemy','c');t.tiles['4,3']=1;
  const intent={actor:'c',dx:0,dy:5,standby:false};assert.ok(G.intentAction(t,intent).action);attack(t,a,3,3);assert.match(G.intentAction(t,intent).reason,/失效/);
});
console.log(`${total}/${total} terrain rule checks passed`);
