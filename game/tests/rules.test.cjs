const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../.test/rules/game.js');
const U = R.unit;
function fixture(...units) {
  return { ...R.newGame(), units: [U('king','player','king',4,0), U('boss','enemy','king',4,9), ...units], intents: [] };
}
function intent(s,id,to,type='attack',order=1) { const u=s.units.find(v=>v.id===id); return {actor:id,from:{x:u.x,y:u.y},to,type,path:[],order}; }
test('主帅九宫横竖一步、越界与跨步不消耗行动',()=>{
  const s=R.newGame(); for(const p of [{x:2,y:0},{x:4,y:2},{x:4,y:-1},{x:3,y:1}]) assert.equal(R.submit(s,'king',p).state,s);
  for(const p of [{x:3,y:0},{x:5,y:0},{x:4,y:1}]) assert.equal(R.submit(s,'king',p).state.units[0].acted,true);
});
test('双方九宫中心可走八邻点，角点沿米字进中心，边中点不可随意斜走',()=>{
  for(const side of ['player','enemy']){
    const s=fixture(),k=R.king(s,side),cy=side==='player'?1:8;
    k.x=4;k.y=cy;
    assert.equal(R.legalActions(s,k.id).length,8);
    k.x=3;k.y=cy-1;
    assert(R.actionAt(s,k,{x:4,y:cy}));
    assert(!R.actionAt(s,k,{x:5,y:cy+1}));
    k.x=4;k.y=cy-1;
    assert(!R.actionAt(s,k,{x:3,y:cy}));
    assert(!R.actionAt(s,k,{x:5,y:cy}));
    k.x=5;k.y=cy+1;
    assert(!R.actionAt(s,k,{x:6,y:cy+1}));
    assert(!R.actionAt(s,k,{x:5,y:cy+2}));
  }
});
test('米字斜线可吃敌子，友军占中心阻止落子，斜步能解开预告将军',()=>{
  let s=fixture(U('p','enemy','pawn',3,0));s.units[0].y=1;
  let n=R.submit(s,'king',{x:3,y:0}).state;
  assert.equal(R.at(n,{x:3,y:0}).id,'king');assert(!n.units.some(u=>u.id==='p'));
  s=fixture(U('r','player','rook',4,1));s.units[0].x=3;
  assert.equal(R.submit(s,'king',{x:4,y:1}).state,s);
  s=fixture(U('e','enemy','rook',4,4));s.units[0].y=1;s.units[0].hp=1;
  s.intents=[intent(s,'e',{x:4,y:1})];
  n=R.submit(s,'king',{x:5,y:2}).state;
  assert(R.analyze(s).safe);assert.equal(R.king(R.enemyPhase(n).state,'player').hp,1);
});
test('车移动、普通吃子、友军挡路、行动只能一次',()=>{
  let s=R.newGame(); const result=R.submit(s,'rook',{x:0,y:3}); s=result.state;
  assert.equal(s.units.find(u=>u.id==='rook').xp,1); assert.equal(R.at(s,{x:0,y:3}).id,'rook');
  assert.equal(R.submit(s,'rook',{x:0,y:4}).state,s);
  s=fixture(U('r','player','rook',0,0),U('h','player','horse',0,2));
  assert.equal(R.submit(s,'r',{x:0,y:3}).state,s);
});
test('三级贯穿三个普通敌人，停在最远目标；不可穿敌选空位',()=>{
  const s=fixture(U('r','player','rook',0,0),...[1,3,5].map(y=>U('p'+y,'enemy','pawn',0,y)));
  s.units[2].level=3; s.units[2].xp=4;
  assert.equal(R.submit(s,'r',{x:0,y:6}).state,s);
  const n=R.submit(s,'r',{x:0,y:5}).state; assert.equal(n.kills,3); assert.equal(R.at(n,{x:0,y:5}).id,'r');
});
test('小兵—1 HP 敌将—小兵：车留起点，后方未受伤，升级在动作结束',()=>{
  const s=fixture(U('r','player','rook',0,9),U('p','enemy','pawn',2,9),U('last','enemy','pawn',6,9));
  s.wave=2; const r=s.units[2]; r.level=3;r.xp=4; R.king(s,'enemy').hp=1;
  const n=R.submit(s,'r',{x:6,y:9}).state;
  assert.equal(n.result,'victory'); assert.equal(R.at(n,{x:0,y:9}).id,'r'); assert(n.units.some(u=>u.id==='last')); assert.equal(n.kills,2);
});
test('升级不扩展当前范围、HP或行动次数',()=>{
  const s=fixture(U('r','player','rook',0,0),U('p','enemy','pawn',0,1),U('q','enemy','pawn',0,2));
  s.units[2].xp=1;
  assert.equal(R.submit(s,'r',{x:0,y:2}).state,s);
  const r=R.submit(s,'r',{x:0,y:1}).state.units.find(u=>u.id==='r'); assert.equal(r.level,2);assert.equal(r.hp,1);assert(r.acted);
});
test('炮架 0/1/2 与移动限制',()=>{
  const s=fixture(U('c','player','cannon',0,0),U('p','enemy','pawn',0,5));
  assert(!R.actionAt(s,s.units[2],{x:0,y:5}));
  s.units.push(U('screen','enemy','pawn',0,2)); assert(R.actionAt(s,s.units[2],{x:0,y:5}));assert(!R.actionAt(s,s.units[2],{x:0,y:4}));
  s.units.push(U('screen2','enemy','pawn',0,3));assert(!R.actionAt(s,s.units[2],{x:0,y:5}));
});
test('马腿与卒过河',()=>{
  const s=fixture(U('h','player','horse',0,0),U('p','enemy','pawn',2,5));
  assert(R.actionAt(s,s.units[2],{x:2,y:1}));s.units.push(U('b','player','rook',1,0));assert(!R.actionAt(s,s.units[2],{x:2,y:1}));
  assert(!R.actionAt(s,s.units[3],{x:3,y:5}));s.units[3].y=4;assert(R.actionAt(s,s.units[3],{x:3,y:4}));assert(!R.actionAt(s,s.units[3],{x:2,y:5}));
});
test('敌车目标移空或替换单位，移动意图不转攻击',()=>{
  const s=fixture(U('e','enemy','rook',4,3));s.intents=[intent(s,'e',{x:4,y:0})];
  let n=R.submit(s,'king',{x:3,y:0}).state; assert.equal(R.at(R.enemyPhase(n).state,{x:4,y:0}).id,'e');
  n.units.push(U('replacement','player','horse',4,0)); assert(!R.enemyPhase(n).state.units.some(u=>u.id==='replacement'));
  s.intents[0].type='move';assert.equal(R.enemyPhase(s).effects[0].status,'cancelled');
});
test('炮架移走取消；目标空时原地打空',()=>{
  const s=fixture(U('c','enemy','cannon',4,4),U('screen','player','rook',4,2));s.intents=[intent(s,'c',{x:4,y:0})];
  let n=R.submit(s,'screen',{x:3,y:2}).state;assert.equal(R.enemyPhase(n).effects[0].status,'cancelled');
  n=R.submit(s,'king',{x:3,y:0}).state;assert.equal(R.enemyPhase(n).effects[0].status,'miss');assert.equal(R.at(R.enemyPhase(n).state,{x:4,y:4}).id,'c');
});
test('公开顺序改变后续路径；模拟与实际结算一致且不污染',()=>{
  const s=fixture(U('a','enemy','rook',0,2),U('b','enemy','rook',4,4));
  s.intents=[intent(s,'a',{x:4,y:2},'move'),intent(s,'b',{x:4,y:0},'attack',2)];
  const before=JSON.stringify(s), predicted=R.enemyPhase(s);assert.equal(predicted.effects[1].status,'cancelled');
  assert.deepEqual(R.endTurn(s).units.map(u=>({...u,acted:false})),predicted.state.units.map(u=>({...u,acted:false})));
  R.analyze(s);R.enemyPhase(s);assert.equal(JSON.stringify(s),before);
});
test('必受一伤但可存活只提示，不判将死；无剩余解围则将死',()=>{
  const s=fixture(U('e','enemy','rook',4,3));s.units[0].acted=true;s.intents=[intent(s,'e',{x:4,y:0})];
  assert(R.analyze(s).safe);s.units[0].hp=1;assert(!R.analyze(s).safe);assert.equal(R.checkmate(s).result,'mate');assert.equal(R.endTurn(s).result,'dead');
});
test('主帅不能行动，需要两枚队友配合才能解围',()=>{
  const s=fixture(U('h','player','horse',2,3),U('r','player','rook',0,3),U('e','enemy','rook',4,2),U('c','enemy','cannon',4,4));
  s.units[0].hp=1;s.units[0].acted=true;s.intents=R.generateIntents(s);
  const a=R.analyze(s);assert(a.safe); assert.equal(a.plan.length,2);
  assert.equal(a.plan[0].actor,'h');assert.equal(a.plan[1].actor,'r');
  for(const u of s.units.filter(u=>u.side==='player'&&!u.acted)) for(const move of R.legalActions(s,u.id)) assert.equal(R.enemyPhase(R.submit(s,u.id,move.to).state).state.result,'dead');
  let n=s;for(const move of a.plan)n=R.submit(n,move.actor,move.to).state;assert.notEqual(R.enemyPhase(n).state.result,'dead');
});
test('先斩将可免除致死阶段；第一波只奖励一次，退场不计 XP',()=>{
  const s=fixture(U('r','player','rook',4,8),U('e','enemy','rook',4,2));
  s.units[0].hp=1;s.units[0].acted=true;R.king(s,'enemy').hp=1;s.intents=[intent(s,'e',{x:4,y:0})];
  assert(R.analyze(s).safe);const n=R.submit(s,'r',{x:4,y:9}).state;assert.equal(n.phase,'shop');assert.equal(n.gold,2);assert.equal(n.kills,1);
  assert.equal(R.endTurn(n).gold,2);assert.equal(R.submit(n,'r',{x:4,y:9}).state,n);
});
test('商店连点、不足、跳过、继承、死亡车不复活、重开',()=>{
  let s=fixture(U('rook','player','rook',5,3));s.phase='shop';s.gold=2;s.units=s.units.filter(u=>u.side==='player');s.units[0].hp=2;s.units[1].xp=3;s.units[1].level=2;
  const n=R.buy(s,'horse');assert.equal(n.gold,0);assert.equal(R.buy(n,'cannon'),n);assert.equal(n.units.length,3);
  let w=R.nextWave(n);assert.equal(R.king(w,'player').hp,2);assert.equal(R.at(w,{x:0,y:0}).xp,3);assert.equal(R.at(w,{x:2,y:0}).kind,'horse');
  assert.equal(R.nextWave(s).wave,2);s.units=s.units.filter(u=>u.kind!=='rook');w=R.nextWave(R.buy(s,'cannon'));assert(!w.units.some(u=>u.side==='player'&&u.kind==='rook'));assert.equal(R.at(w,{x:1,y:2}).kind,'cannon');
  assert.deepEqual(R.newGame(),R.newGame());
});
