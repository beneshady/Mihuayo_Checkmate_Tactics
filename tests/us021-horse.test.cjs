// US-021 定向规则验收：我方马跳跃攻击与三项 SP 成长（H01～H19 规则/状态层，H11/H17 的界面撤回由浏览器验收覆盖）。
// 全部使用显式夹具逐项构造边界，不替代 docs/us/US-021-horse-jump-skills.md H20 的正常入口实际浏览器流程。
const test=require('node:test');const assert=require('node:assert/strict');const R=require('../web/js/rules.js');
const U=(id,side,kind,x,y)=>R.unit(id,side,kind,x,y);
const P=(id,kind,x,y)=>U(id,'player',kind,x,y),E=(id,kind,x,y)=>U(id,'enemy',kind,x,y);
function land(){const t={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)t[x+','+y]='land';return t;}
function mk(units,opts){opts=opts||{};const s=R.emptyState(units);s.phase=opts.phase||'player';s.tiles=Object.assign(land(),opts.tiles||{});if(opts.teamSp!==undefined)s.teamSp=opts.teamSp;if(opts.buffs)s.buffs=Object.assign({health:false,move:false,rescue:false},opts.buffs);if(opts.rng!==undefined)s.rng=opts.rng;if(opts.corpses)s.corpses=opts.corpses;if(opts.phase==='player'&&!opts.noIntent)s.intents=[];return s;}
const G=(s,id)=>s.units.find(u=>u.id===id);
const act=(s,id,to,mode)=>R.actionAt(s,G(s,id),to,mode);
const jump=(s,id,x,y)=>R.submit(s,id,{x:x,y:y},'horse-jump');
const move=(s,id,x,y)=>R.submit(s,id,typeof x==='object'?x:{x:x,y:y});
const body=(id,x,y,side,kind)=>Object.assign(U(id,side||'player',kind||'pawn',x,y),{hp:0});
function base(units,opts){return mk([P('king','king',0,0),E('boss','king',8,8)].concat(units||[]),opts);}
function withPush(s,sp){const n=R.copy(s);n.teamSp=sp===undefined?2:sp;const h=n.units.find(u=>u.kind==='horse'&&u.side==='player');return R.purchaseUpgrade(n,h.id,'horse-push');}

test('H01 行动顺序：先移后跳可行、跳后本回合不能再移、普通移动不结算任何伤害',()=>{
 const s=base([P('h','horse',4,4),E('target','pawn',6,6),E('jumpTarget','pawn',6,5)],{tiles:{'4,3':'mountain','5,7':'mountain'}});
 // 普通移动 (4,4)→(5,6)：不命中、不推动、不伤山
 const mv=move(s,'h',5,6);
 assert.ok(mv.effect,'普通移动应成功');
 assert.equal(mv.effect.hits.length,0,'普通移动不产生直接伤害');
 assert.equal(mv.effect.mountains,undefined,'普通移动不结算山体');
 assert.equal(G(mv.state,'target').hp,1,'普通移动不伤害落点四邻格敌人');
 assert.equal(mv.state.tiles['5,7'],'mountain','普通移动不结算邻近山体');
 assert.deepEqual([G(mv.state,'h').x,G(mv.state,'h').y],[5,6]);
 assert.equal(s.tiles['4,3'],'mountain','普通移动不改变地形');
 // 移动后仍可跳跃，并以距离 1 的落点命中四邻敌人
 const afterJump=jump(mv.state,'h',5,5);
 assert.ok(afterJump.effect,'先移后跳必须可行');
 assert.deepEqual(afterJump.effect.victims,['jumpTarget'],'跳跃落地四邻格击杀敌人');
 assert.equal(afterJump.state.teamSp,1,'击杀按公共 SP 结算');
 assert.equal(G(afterJump.state,'h').horseJumpUsed,true);
 assert.equal(G(afterJump.state,'h').ap,0,'跳跃后普通移动额度用完');
 // 跳后不能再普通移动
 assert.equal(act(afterJump.state,'h',{x:6,y:4},undefined),undefined,'跳跃后不能再普通移动');
 assert.strictEqual(move(afterJump.state,'h',{x:6,y:4}).state,afterJump.state);
 // 同回合不能二次跳跃
 assert.equal(act(afterJump.state,'h',{x:5,y:4},'horse-jump'),undefined);
 // 直接跳（不先移动）也可行，且不赠送额外行动
 const direct=jump(base([P('h','horse',4,4),E('e','pawn',4,1)]),'h',4,2);
 assert.ok(direct.effect,'可直接释放跳跃攻击');
 assert.equal(G(direct.state,'h').ap,0);
 assert.equal(G(direct.state,'h').horseJumpUsed,true);
 // 下一回合两项额度都恢复
 const fresh=R.copy(direct.state);R.resetTurn(G(fresh,'h'));
 assert.equal(G(fresh,'h').ap,1);assert.equal(G(fresh,'h').horseJumpUsed,false);
});

test('H02 基础技能距离 2：四方向 1/2 格合法，3 格/斜向/原地非法且不消耗技能',()=>{
 const s=base([P('h','horse',4,4)]);
 for(const d of R.CONFIG.directions){
  for(const n of [1,2])assert.ok(act(s,'h',{x:4+d.x*n,y:4+d.y*n},'horse-jump'),`${d.name} ${n} 格应合法`);
  assert.equal(act(s,'h',{x:4+d.x*3,y:4+d.y*3},'horse-jump'),undefined,`${d.name} 3 格超出基础距离`);
 }
 for(const p of [[5,5],[3,3],[5,3],[3,5]])assert.equal(act(s,'h',{x:p[0],y:p[1]},'horse-jump'),undefined,'斜向非法 '+p);
 assert.equal(act(s,'h',{x:4,y:4},'horse-jump'),undefined,'原地释放非法');
 assert.equal(R.horseJumpRangeOf(G(s,'h')),2,'基础最大距离 2');
 for(const p of [[4,1],[4,7],[0,4],[8,4],[5,5],[4,4]]){
  const before=R.copy(s);
  assert.strictEqual(jump(s,'h',p[0],p[1]).state,s,'非法目标不结算、不消耗技能 '+p);
  assert.equal(JSON.stringify(s),JSON.stringify(before),'非法目标不改变状态');
 }
 // 取消/未选择时也不结算：无预览动作即无副作用
 assert.equal(R.preview(s,'h',{x:4,y:1},'horse-jump'),undefined);
});

test('H03 可越过棋子/尸体/山体，落点占用、山、水、界外一律拒绝且不消耗技能',()=>{
 // 越过中间棋子
 const overUnit=base([P('h','horse',4,4),P('block','rook',4,3)]);
 assert.ok(jump(overUnit,'h',4,2).effect,'可越过中间棋子');
 // 越过中间尸体
 const overBody=base([P('h','horse',4,4)],{corpses:[{id:'c',x:4,y:3,unit:body('dead',4,3)}]});
 assert.ok(jump(overBody,'h',4,2).effect,'可越过中间尸体');
 // 越过中间山体
 const overRock=base([P('h','horse',4,4)],{tiles:{'4,3':'mountain'}});
 assert.ok(jump(overRock,'h',4,2).effect,'可越过中间山体');
 const rockState=G(overRock,'h');
 assert.ok(rockState);
 // 落点被占/山/水/界外
 const occupied=base([P('h','horse',4,4),E('e','pawn',4,2)]);
 assert.equal(act(occupied,'h',{x:4,y:2},'horse-jump'),undefined,'落点被敌方占据非法');
 const ally=base([P('h','horse',4,4),P('a','pawn',4,2)]);
 assert.equal(act(ally,'h',{x:4,y:2},'horse-jump'),undefined,'落点被我方占据非法');
 const wall=base([P('h','horse',4,4)],{tiles:{'4,2':'mountain'}});
 assert.equal(act(wall,'h',{x:4,y:2},'horse-jump'),undefined,'落点不能是山体');
 const water=base([P('h','horse',4,4)],{tiles:{'4,2':'water'}});
 assert.equal(act(water,'h',{x:4,y:2},'horse-jump'),undefined,'落点不能是水格');
 const edge=base([P('h','horse',4,1)]);
 assert.equal(act(edge,'h',{x:4,y:-1},'horse-jump'),undefined,'落点不能越界');
 for(const s of [occupied,ally,wall,water]){
  assert.strictEqual(jump(s,'h',4,2).state,s,'非法落点不消耗技能');
  assert.equal(G(s,'h').ap,1);assert.equal(G(s,'h').horseJumpUsed,false);
 }
});

test('H04 马在水中不能施放、不能以水为落点；普通移动入水合法且之后不能攻击',()=>{
 const inWater=base([P('h','horse',2,4)],{tiles:{'2,4':'water'}});
 assert.equal(act(inWater,'h',{x:2,y:2},'horse-jump'),undefined,'水中不能发动跳跃攻击');
 assert.ok(R.actionReason(inWater,'h',{x:2,y:2},'horse-jump').includes('水中'),'界面反馈水中限制');
 assert.ok(act(inWater,'h',{x:3,y:2},undefined),'水中仍可普通移动离开');
 const landFall=base([P('h','horse',4,4)],{tiles:{'4,2':'water'}});
 assert.equal(act(landFall,'h',{x:4,y:2},'horse-jump'),undefined,'水格不能作为落点');
 // 普通移动入水：合法、马不淹死、之后不能攻击
 const into=base([P('h','horse',3,3),E('e','pawn',8,8)],{tiles:{'4,5':'water'}});
 const mv=move(into,'h',{x:4,y:5});
 assert.ok(mv.effect,'马普通移动可入水');
 assert.equal(G(mv.state,'h').hp,1,'马入水不死亡');
 assert.equal(G(mv.state,'h').x,4);assert.equal(G(mv.state,'h').y,5);
 assert.equal(act(mv.state,'h',{x:4,y:3},'horse-jump'),undefined,'入水后本回合不能攻击');
 const next=R.copy(mv.state);R.resetTurn(G(next,'h'));
 assert.equal(act(next,'h',{x:4,y:3},'horse-jump'),undefined,'仍在水中的马下一回合也不能攻击');
});

test('H05 落地四邻格敌我各 1 点伤害，斜邻不受影响，马到达空落点',()=>{
 const s=base([
  P('h','horse',4,4),
  E('n','pawn',4,1),P('s','rook',4,3),P('w','pawn',3,2),E('e','pawn',5,2),
  E('diag','pawn',5,3),E('far','pawn',6,4)]);
 const out=jump(s,'h',4,2);
 assert.ok(out.effect);
 assert.deepEqual(out.effect.hits.map(h=>[h.id,h.damage]).sort(),[['e',1],['n',1],['s',1],['w',1]],'四邻格各受 1 点（含友军）');
 assert.equal(out.effect.hits.find(h=>h.id==='s').side,'player','友军同样受伤并标记');
 assert.deepEqual(out.effect.victims.sort(),['e','n','w'],'血量 1 的目标阵亡');
 assert.equal(G(out.state,'s').hp,1,'友军车 2→1');
 assert.equal(G(out.state,'diag').hp,1,'斜邻不受影响');
 assert.equal(G(out.state,'far').hp,1,'距离 2 的目标不受影响');
 assert.deepEqual([G(out.state,'h').x,G(out.state,'h').y],[4,2],'马落在空落点');
 assert.equal(act(out.state,'h',{x:4,y:3},'horse-jump'),undefined,'本回合技能已用');
});

test('H06 三项独立购买：价格 2/1/2、无前置、非法购买不扣款、推动同时解除绊马脚',()=>{
 assert.deepEqual([R.CONFIG.horse.pushCost,R.CONFIG.horse.distanceCost,R.CONFIG.horse.damageCost],[2,1,2],'首版价格 2/1/2 SP');
 // 独立购买：只有 1 SP 也能直接买距离
 const only1=base([P('h','horse',2,2)],{teamSp:1});
 const dist=R.purchaseUpgrade(only1,'h','horse-jump-distance');
 assert.notStrictEqual(dist,only1,'距离可独立购买');
 assert.equal(R.horseJumpRangeOf(G(dist,'h')),3);assert.equal(dist.teamSp,0);
 assert.equal(G(dist,'h').horsePush,false,'未买推动也可先买距离');
 // 一次购买同时解锁推动与解除绊马脚
 const blocked=base([P('h','horse',2,2),P('leg','pawn',3,2)],{teamSp:2});
 assert.equal(act(blocked,'h',{x:4,y:3},undefined),undefined,'未解锁时受绊马脚限制');
 const pushed=R.purchaseUpgrade(blocked,'h','horse-push');
 assert.equal(G(pushed,'h').horsePush,true);
 assert.ok(act(pushed,'h',{x:4,y:3},undefined),'推动购买同时解除绊马脚');
 assert.equal(pushed.teamSp,0);
 // 非法购买：重复解锁
 const dupBefore=R.copy(pushed);dupBefore.teamSp=5;
 assert.strictEqual(R.purchaseUpgrade(dupBefore,'h','horse-push'),dupBefore,'重复解锁被拒绝');
 assert.equal(dupBefore.teamSp,5,'重复解锁不扣款');
 // 非法购买：余额不足
 const poor=base([P('h','horse',2,2)],{teamSp:1});
 assert.strictEqual(R.purchaseUpgrade(poor,'h','horse-push'),poor,'SP 不足被拒绝');
 assert.equal(poor.teamSp,1,'余额不足不扣款');
 assert.strictEqual(R.purchaseUpgrade(poor,'h','horse-jump-damage'),poor);
 assert.equal(poor.teamSp,1);
 // 非法购买：已达上限
 const full=base([P('h','horse',2,2)],{teamSp:9});
 const r4=R.purchaseUpgrade(R.purchaseUpgrade(full,'h','horse-jump-distance'),'h','horse-jump-distance');
 assert.equal(R.horseJumpRangeOf(G(r4,'h')),4);
 const r4copy=R.copy(r4);r4copy.teamSp=9;
 assert.strictEqual(R.purchaseUpgrade(r4copy,'h','horse-jump-distance'),r4copy,'距离达上限后拒绝');
 assert.equal(r4copy.teamSp,9,'达上限不扣款');
 // 强健仍保留且价格 1
 const fort=R.purchaseUpgrade(base([P('h','horse',2,2)],{teamSp:1}),'h','fortify');
 assert.equal(G(fort,'h').maxHp,2,'马原有强健升级保留');
});

test('H07 推动已解锁：存活敌我外推 1 格、尸体同样外推，推动不可关闭，普通移动免马腿',()=>{
 const s=withPush(base([
  P('h','horse',4,4),
  E('enemyRook','rook',4,1),P('allyRook','rook',3,2)
 ],{corpses:[{id:'c',x:5,y:2,unit:body('deadAllied',5,2,'player','pawn')}]}));
 const out=jump(s,'h',4,2);
 assert.ok(out.effect);
 // 直接伤害后存活目标外推
 assert.equal(G(out.state,'enemyRook').hp,1,'敌方车 2→1 存活');
 assert.deepEqual([G(out.state,'enemyRook').x,G(out.state,'enemyRook').y],[4,0],'敌方单位沿远离落点方向外推 1 格');
 assert.deepEqual([G(out.state,'allyRook').x,G(out.state,'allyRook').y],[2,2],'友军单位同样被外推');
 assert.equal(G(out.state,'allyRook').hp,1);
 assert.deepEqual([out.state.corpses[0].x,out.state.corpses[0].y],[6,2],'既有尸体同样外推 1 格');
 assert.equal(out.effect.pushes.filter(p=>p.status==='pushed').length,3,'三处推动各记录一次');
 // 推动无开关：同一次技能内自动发生（对照未解锁时无推动记录）
 const noPush=base([P('h','horse',4,4),E('enemyRook','rook',4,1)]);
 const np=jump(noPush,'h',4,2);
 assert.equal(np.effect.pushes,undefined,'未解锁时没有推动结算');
 assert.deepEqual([G(np.state,'enemyRook').x,G(np.state,'enemyRook').y],[4,1],'未解锁目标不移动');
 // 推动受阻沿用碰撞规则：目标 −2 / 阻挡 −1 / 马 −1，尸体阻挡不受伤
 const blocked=withPush(base([P('h','horse',4,4),E('front','rook',4,1),E('wall','rook',4,0)]));
 const bc=jump(blocked,'h',4,2);
 assert.equal(G(bc.state,'front'),undefined,'目标 2−2 阵亡');
 assert.equal(G(bc.state,'wall').hp,1,'阻挡单位 2−1 存活');
 assert.equal(G(bc.state,'h'),undefined,'马无强健时碰撞 −1 阵亡（沿用既有碰撞规则）');
 assert.equal(bc.effect.actorDead,true);
 // 普通移动不再绊马脚
 const leg=withPush(base([P('h','horse',2,2),P('leg','pawn',3,2)]));
 assert.ok(act(leg,'h',{x:4,y:3},undefined),'解锁后普通日字移动不再检查马腿');
});

test('H08 距离上限 4、伤害上限 3，四方向同步，伤害范围不扩大，友军伤害同步提高',()=>{
 let s=base([P('h','horse',4,4)],{teamSp:2});
 assert.equal(R.horseJumpRangeOf(G(s,'h')),2);
 s=R.purchaseUpgrade(s,'h','horse-jump-distance');assert.equal(R.horseJumpRangeOf(G(s,'h')),3);
 s=R.purchaseUpgrade(s,'h','horse-jump-distance');assert.equal(R.horseJumpRangeOf(G(s,'h')),4);
 for(const d of R.CONFIG.directions)assert.ok(act(s,'h',{x:4+d.x*4,y:4+d.y*4},'horse-jump'),`${d.name} 方向同步到 4 格`);
 assert.equal(act(s,'h',{x:4,y:8},'horse-jump')?true:false,true);
 assert.equal(act(s,'h',{x:4,y:9},'horse-jump'),undefined,'不能超过 4 格');
 const keep=R.copy(s);keep.teamSp=9;
 assert.strictEqual(R.purchaseUpgrade(keep,'h','horse-jump-distance'),keep,'距离 4 后拒绝继续购买');
 // 伤害上限 3，四邻格范围不变
 let dmg=base([P('h','horse',4,4)],{teamSp:4});
 dmg=R.purchaseUpgrade(dmg,'h','horse-jump-damage');assert.equal(R.horseJumpDamageOf(G(dmg,'h')),2);
 dmg=R.purchaseUpgrade(dmg,'h','horse-jump-damage');assert.equal(R.horseJumpDamageOf(G(dmg,'h')),3);
 const dmgKeep=R.copy(dmg);dmgKeep.teamSp=9;
 assert.strictEqual(R.purchaseUpgrade(dmgKeep,'h','horse-jump-damage'),dmgKeep,'伤害 3 后拒绝继续购买');
 // 强化伤害：四邻格敌我各 3 点，斜邻与距离 2 不受影响
 const target=base([P('h','horse',4,4),P('ally','rook',4,1),E('foe','rook',5,2),E('diag','rook',5,3),E('far','rook',6,4)],{teamSp:4});
 let strong=target;
 strong=R.purchaseUpgrade(strong,'h','horse-jump-damage');
 strong=R.purchaseUpgrade(strong,'h','horse-jump-damage');
 assert.equal(R.horseJumpDamageOf(G(strong,'h')),3);
 const hit=jump(strong,'h',4,2);
 assert.equal(G(hit.state,'ally'),undefined,'友军 2HP 遭 3 点直接伤害阵亡');
 assert.equal(G(hit.state,'foe'),undefined,'敌军 2HP 同样阵亡');
 assert.equal(G(hit.state,'diag').hp,2,'斜邻不受影响');
 assert.equal(G(hit.state,'far').hp,2,'范围仍是四邻 1 格');
 assert.equal(hit.effect.hits.length,2,'伤害范围不随点数扩大');
});

test('H09 每座山每次直接受击一次、两次坍塌；先伤害/坍塌再推动碰撞',()=>{
 // 基础伤害：一次技能只记一次山体受击
 const rock=base([P('h','horse',4,4),E('e','rook',4,1)],{tiles:{'4,1':'mountain'}});
 const first=jump(rock,'h',4,2);
 assert.equal(first.effect.mountains.length,1,'每座山每次技能只受击一次');
 assert.equal(first.state.tiles['4,1'],'cracked','首次受击开裂');
 R.resetTurn(G(first.state,'h'));
 const second=jump(first.state,'h',4,0);
 assert.equal(second.state.tiles['4,1'],'rubble','第二次受击坍塌为碎石地（US-022 统一撞山，等同陆地）');
 assert.equal(second.effect.mountains[0].before,'cracked');
 // 伤害提高不增加山体受击次数
 let strong=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)],{tiles:{'4,1':'mountain'},teamSp:6});
 strong=R.purchaseUpgrade(strong,'h','horse-push');
 const s3=R.purchaseUpgrade(R.purchaseUpgrade(strong,'h','horse-jump-damage'),'h','horse-jump-damage');
 const one=jump(s3,'h',4,2);
 assert.equal(R.horseJumpDamageOf(G(s3,'h')),3);
 assert.equal(one.effect.mountains.length,1,'伤害 3 点仍只受击一次');
 assert.equal(one.state.tiles['4,1'],'cracked','一次受击只累计一次');
 // 顺序：直接阶段山体记录先于碰撞阶段；推动按更新后的战场结算
 const order=withPush(base([P('h','horse',4,4),E('front','rook',5,2)],{tiles:{'4,1':'mountain','6,2':'mountain'}}));
 const seq=jump(order,'h',4,2);
 assert.deepEqual(seq.effect.mountains.map(p=>[p.x,p.y]),[[4,1],[6,2]],'直接阶段(4,1)先于碰撞阶段(6,2)记录');
 assert.equal(seq.effect.mountains[0].after,'cracked','直接阶段只开裂一次');
 assert.equal(seq.effect.mountains[1].after,'cracked','碰撞阶段再记一次独立受击');
 assert.equal(seq.state.tiles['6,2'],'cracked');
 // 直接伤害死亡留尸后再推动：尸体参与同次推动
 const corpse=withPush(base([P('h','horse',4,4),P('ally','pawn',4,1)]));
 const cj=jump(corpse,'h',4,2);
 const allyBody=cj.state.corpses.find(c=>c.unit.id==='ally');
 assert.ok(allyBody,'友军阵亡留尸');
 assert.deepEqual([allyBody.x,allyBody.y],[4,0],'新尸体在同次技能的推动阶段被外推');
});

test('H10 树林闪避按单位分别判定：闪避者不受伤害也不被推动（含命中/闪避分支）',()=>{
 function treeCase(seed){
  const s=withPush(base([
   P('h','horse',4,4),
   E('a-enemy','pawn',4,1),
   P('b-ally','pawn',3,2)
  ],{tiles:{'4,1':'forest','3,2':'forest'},rng:seed}));
  return jump(s,'h',4,2);
 }
 // 预览：树林目标标记为条件结果，不预先固定随机
 const previewState=withPush(base([P('h','horse',4,4),E('a-enemy','pawn',4,1)],{tiles:{'4,1':'forest'}}));
 const pv=R.preview(previewState,'h',{x:4,y:2},'horse-jump');
 assert.ok(pv&&pv.effect.conditional,'预览标记树林条件结果');
 // seed 1：先判定的敌人闪避，后判定的友军命中
 const mixed=treeCase(1);
 assert.deepEqual(mixed.effect.misses,['a-enemy'],'每单位独立判定：只闪避了第一个目标');
 assert.equal(G(mixed.state,'a-enemy').hp,1,'闪避者不受直接伤害');
 assert.deepEqual([G(mixed.state,'a-enemy').x,G(mixed.state,'a-enemy').y],[4,1],'闪避者不被推动');
 assert.equal(mixed.effect.pushes.find(p=>p.id==='a-enemy').status,'dodged');
 assert.equal(G(mixed.state,'b-ally'),undefined,'未闪避的友军受 1 点直接伤害阵亡');
 const bBody=mixed.state.corpses.find(c=>c.unit.id==='b-ally');
 assert.deepEqual([bBody.x,bBody.y],[2,2],'未闪避目标按推动规则外推尸体');
 // seed 0：两个目标都闪避
 const allDodge=treeCase(0);
 assert.deepEqual(allDodge.effect.misses.sort(),['a-enemy','b-ally']);
 assert.equal(G(allDodge.state,'a-enemy').hp,1);assert.equal(G(allDodge.state,'b-ally').hp,1);
 assert.equal(allDodge.state.corpses.length,0);
 // seed 200：两个目标都未闪避，全部命中
 const allHit=treeCase(200);
 assert.equal(allHit.effect.misses,undefined);
 assert.equal(G(allHit.state,'a-enemy'),undefined);assert.equal(G(allHit.state,'b-ally'),undefined);
});

test('H12 购买立即生效但不恢复行动、不补结算已完成动作',()=>{
 const s=base([P('h','horse',4,4),E('e','pawn',4,1),E('far','pawn',7,7)],{teamSp:2});
 const used=jump(s,'h',4,2);
 assert.equal(G(used.state,'h').ap,0);assert.equal(G(used.state,'h').horseJumpUsed,true);
 const beforeEnemy=R.copy(G(used.state,'far'));
 const buy=R.purchaseUpgrade(used.state,'h','horse-jump-distance');
 assert.notStrictEqual(buy,used.state,'战斗中我方行动阶段可购买');
 assert.equal(R.horseJumpRangeOf(G(buy,'h')),3,'新能力即时可见');
 assert.equal(buy.teamSp,2,'扣除公共 SP（2+击杀1−距离1）');
 assert.equal(G(buy,'h').ap,0,'购买不恢复普通移动额度');
 assert.equal(G(buy,'h').horseJumpUsed,true,'购买不恢复跳跃攻击机会');
 assert.deepEqual([G(buy,'far').x,G(buy,'far').y,G(buy,'far').hp],[beforeEnemy.x,beforeEnemy.y,beforeEnemy.hp],'不补结算已完成的落地效果');
 assert.equal(act(buy,'h',{x:4,y:5},'horse-jump'),undefined,'本回合不能再跳跃');
 // 非我方行动阶段不可购买
 const resultPhase=R.copy(buy);resultPhase.phase='result';resultPhase.result='dead';
 assert.strictEqual(R.purchaseUpgrade(resultPhase,'h','horse-jump-damage'),resultPhase,'结算阶段不可购买');
});

test('H13 购买阶段限制与继承：营地含后备、布阵/战斗仅场上存活，跨关保留、新旅程重置、重试回滚',()=>{
 let camp=R.newGame();camp.phase='intermission';camp=R.enterCamp(camp);camp.gold=20;camp.teamSp=10;
 camp=R.buy(camp,'horse');
 const benchHorse=camp.party.find(u=>u.id==='recruit-horse-0');
 assert.ok(benchHorse&&camp.bench.indexOf(benchHorse.id)>=0,'满员时新招募马进入后备');
 const campBuy=R.purchaseUpgrade(camp,benchHorse.id,'horse-push');
 assert.notStrictEqual(campBuy,camp,'营地可为后备队友购买');
 assert.equal(campBuy.party.find(u=>u.id===benchHorse.id).horsePush,true);
 assert.equal(campBuy.teamSp,8);
 // 新旅程重置为默认三项
 const fresh=R.newGame();
 const freshHorse=fresh.party.find(u=>u.kind==='horse');
 assert.deepEqual([freshHorse.horseJumpRange,freshHorse.horseJumpDamage,freshHorse.horsePush,freshHorse.horseJumpUsed],[2,1,false,false],'新旅程重置为 2/1/未解锁');
 assert.equal(fresh.teamSp,0,'新旅程不赠送 SP');
 // 进入关卡：布阵阶段只可为场上棋子购买，跨关保留
 const lv=R.startLevel(campBuy,R.defaultMap());
 const onField=lv.units.find(u=>u.kind==='horse'&&u.side==='player');
 const benchOnly=lv.party.find(u=>u.kind==='horse'&&u.id!==onField.id);
 assert.ok(benchOnly,'后备马仍在队伍中');
 assert.strictEqual(R.purchaseUpgrade(lv,benchOnly.id,'horse-jump-damage'),lv,'布阵不可为未上场队友购买');
 const deployBuy=R.purchaseUpgrade(lv,onField.id,'horse-jump-distance');
 assert.notStrictEqual(deployBuy,lv,'布阵可为出战棋子购买');
 // 确认布阵后战斗阶段可购买；阵亡后不可再购买
 const fight=R.confirmDeployment(deployBuy);
 const battleBuy=R.purchaseUpgrade(fight,onField.id,'horse-jump-damage');
 assert.notStrictEqual(battleBuy,fight,'我方行动阶段可为场上存活马购买');
 const deadState=R.copy(battleBuy);
 deadState.units=deadState.units.filter(u=>u.id!==onField.id);
 assert.strictEqual(R.purchaseUpgrade(deadState,onField.id,'horse-jump-distance'),deadState,'阵亡棋子不可购买');
 // 跨关保留（party 已同步）
 const toCamp=R.copy(battleBuy);toCamp.phase='intermission';
 const next=R.nextLevel(toCamp,R.defaultMap());
 const nextHorse=next.units.find(u=>u.kind==='horse'&&u.side==='player');
 assert.equal(nextHorse.horseJumpRange,3);assert.equal(R.horseJumpDamageOf(nextHorse),2);
 assert.equal(nextHorse.horsePush,false,'营地购买只作用于该棋子，不串到其他马');
 // 失败重试恢复到入关快照：本关新增购买与 SP 消费回滚
 const deadNow=R.copy(battleBuy);deadNow.phase='result';deadNow.result='dead';
 const retry=R.retryLevel(deadNow);
 const retryHorse=retry.units.find(u=>u.kind==='horse'&&u.side==='player');
 assert.equal(retry.phase,'deploy');
 assert.equal(R.horseJumpRangeOf(retryHorse),2,'重试回滚布阵购买');
 assert.equal(R.horseJumpDamageOf(retryHorse),1,'重试回滚战斗购买');
 assert.equal(retry.teamSp,8,'重试恢复入关快照 SP（营地购买后余额）');
 // 回营恢复：行动额度重置但成长保留
 const spent=R.copy(battleBuy);
 spent.units.forEach(u=>{if(u.id===onField.id){u.ap=0;u.horseJumpUsed=true;}});
 const back=R.enterCamp(spent);
 const backHorse=back.party.find(u=>u.id===onField.id);
 assert.equal(backHorse.horseJumpUsed,false,'回营恢复跳跃机会');
 assert.equal(backHorse.horseJumpRange,3,'回营保留已购成长');
});

test('H14 新友军尸体同次外推，入水按既有规则销毁，不产生重复奖励或重复推动',()=>{
 const s=withPush(base([
  P('h','horse',4,4),P('a1','pawn',4,1),P('a2','pawn',5,2)
 ],{tiles:{'6,2':'water'}}));
 const out=jump(s,'h',4,2);
 assert.ok(out.effect);
 assert.deepEqual(out.effect.victims.sort(),['a1','a2'],'四邻友军被直接击杀');
 assert.equal(out.state.corpses.length,1,'推入水中的尸体被销毁');
 assert.deepEqual([out.state.corpses[0].x,out.state.corpses[0].y],[4,0],'空地一侧尸体外推 1 格');
 assert.equal(out.effect.pushes.filter(p=>p.kind==='corpse').length,2,'两具新尸体各结算一次推动');
 assert.equal(out.effect.pushes.find(p=>p.id==='corpse-a2').status,'water');
 assert.equal(out.state.kills,0,'击杀友军不计入战绩');
 assert.equal(out.state.teamSp,0,'击杀友军不产生公共 SP');
});

test('H15 同次技能可致双方主将死亡：完整结算全部方向后失败优先',()=>{
 const s=base([P('h','horse',4,3),E('side','pawn',5,2)]);
 G(s,'king').x=4;G(s,'king').y=1;G(s,'king').hp=1;
 G(s,'boss').x=3;G(s,'boss').y=2;G(s,'boss').hp=1;
 const out=jump(s,'h',4,2);
 assert.deepEqual(out.effect.victims.sort(),['boss','king','side'],'其他方向目标同样完整结算');
 assert.equal(G(out.state,'king'),undefined,'我方帅阵亡');
 assert.equal(G(out.state,'boss'),undefined,'敌方将同时阵亡');
 assert.equal(out.state.result,'dead','双方主将同亡时失败优先');
 assert.equal(out.state.phase,'result');
 assert.equal(out.state.settled,false,'不提前胜利结算');
 assert.equal(out.state.gold,0,'不发放胜利奖励');
});

test('H16 疾行：日字落点四邻加入候选、一次移动直达；马腿按路线判定、参照格占用不阻挡；解锁免马腿且不增技能距离',()=>{
 const none=base([P('h','horse',2,2)],{buffs:{move:false}});
 assert.equal(act(none,'h',{x:2,y:4},undefined),undefined,'未解锁疾行时无扩展落点');
 const dash=base([P('h','horse',2,2)],{buffs:{move:true}});
 assert.ok(act(dash,'h',{x:4,y:3},undefined),'疾行保留日字落点');
 assert.ok(act(dash,'h',{x:3,y:3},undefined),'日字落点 (4,3) 的西邻格加入候选');
 assert.ok(act(dash,'h',{x:4,y:4},undefined),'扩展落点可直达');
 assert.equal(act(dash,'h',{x:5,y:4},undefined),undefined,'不包含日字落点斜邻扩展');
 assert.equal(act(dash,'h',{x:2,y:3},undefined),undefined,'非日字落点邻格的相邻格不在候选内');
 // 一次移动完成、不触发伤害
 const mv=move(dash,'h',{x:2,y:4});
 assert.ok(mv.effect);assert.equal(mv.effect.hits.length,0);
 assert.deepEqual([G(mv.state,'h').x,G(mv.state,'h').y],[2,4]);
 assert.equal(G(mv.state,'h').ap,0,'扩展移动仍只消耗一次普通移动');
 // 马腿按对应日字路线判定：被挡路线的原始与扩展落点都不可用，另一条合法路线仍可到达
 const oneLeg=base([P('h','horse',2,2),P('leg','pawn',3,2)],{buffs:{move:true}});
 assert.equal(act(oneLeg,'h',{x:4,y:3},undefined),undefined,'马腿被挡时该路线日字点不可用');
 assert.equal(act(oneLeg,'h',{x:5,y:3},undefined),undefined,'被挡路线的扩展点也不可用');
 assert.ok(act(oneLeg,'h',{x:4,y:4},undefined),'同一格仍有另一条合法日字路线时可达');
 const bothLegs=base([P('h','horse',2,2),P('l1','pawn',3,2),P('l2','pawn',2,3)],{buffs:{move:true}});
 assert.equal(act(bothLegs,'h',{x:4,y:4},undefined),undefined,'两条路线马腿都被挡则不可达');
 // 原始日字参照格被占：不检查参照格，只检查马腿与最终落点
 const refOccupied=base([P('h','horse',2,2),P('ref','pawn',4,3)],{buffs:{move:true}});
 assert.ok(act(refOccupied,'h',{x:5,y:1},undefined),'参照格 (4,3) 之外的扩展点 (5,1) 仍可用');
 assert.equal(act(refOccupied,'h',{x:4,y:3},undefined),undefined,'参照格本身被占时仍不能落在该格');
 // 最终落点占用仍非法
 assert.equal(act(base([P('h','horse',2,2),P('fill','pawn',2,4)],{buffs:{move:true}}),'h',{x:2,y:4},undefined),undefined);
 // 解锁后免马腿；技能距离升级不改变疾行候选范围
 const unlocked=withPush(base([P('h','horse',2,2),P('leg','pawn',3,2)],{buffs:{move:true}}));
 assert.ok(act(unlocked,'h',{x:4,y:3},undefined),'解锁后普通移动不再检查马腿');
 const upgraded=base([P('h','horse',2,2)],{buffs:{move:true},teamSp:1});
 const up=R.purchaseUpgrade(upgraded,'h','horse-jump-distance');
 assert.equal(R.horseJumpRangeOf(G(up,'h')),3);
 assert.equal(act(up,'h',{x:6,y:3},undefined),undefined,'技能距离强化不扩大疾行候选范围');
 // 疾行不增加技能跳跃距离
 assert.equal(act(dash,'h',{x:2,y:5},'horse-jump'),undefined,'疾行不增加技能跳跃距离');
});

test('H18 旧存档迁移：补齐基础技能字段、保留身份/血量/强化/击杀，不赠点不刷新行动、不覆盖新版本记录',()=>{
 const old=R.newGame();
 const oldHorse=old.party.find(u=>u.kind==='horse');
 Object.assign(oldHorse,{hp:1,kills:3,fortify:2,maxHp:3,level:4});
 delete oldHorse.horseJumpRange;delete oldHorse.horseJumpDamage;delete oldHorse.horsePush;delete oldHorse.horseJumpUsed;
 const record=R.journeyRecord(old);
 const snapshot=JSON.stringify(record);
 const loaded=R.stateFromJourney(record);
 const lh=loaded.party.find(u=>u.id===oldHorse.id);
 assert.deepEqual([lh.horseJumpRange,lh.horseJumpDamage,lh.horsePush,lh.horseJumpUsed],[2,1,false,false],'旧马自动获得基础跳跃：2/1/未解锁');
 assert.deepEqual([lh.id,lh.hp,lh.maxHp,lh.kills,lh.fortify],[oldHorse.id,1,3,3,2],'身份/血量/强化/击杀保留');
 assert.equal(loaded.teamSp,0,'迁移不赠送 SP');
 assert.equal(JSON.stringify(record),snapshot,'迁移不修改调用方存档对象');
 const again=R.stateFromJourney(R.journeyRecord(loaded));
 assert.deepEqual([again.party.find(u=>u.id===oldHorse.id).horseJumpRange,again.teamSp],[2,0],'重复恢复幂等');
 // 新版本已强化记录不被覆盖
 const enhanced=R.stateFromJourney(record);
 const eh=enhanced.party.find(u=>u.id===oldHorse.id);
 Object.assign(eh,{horseJumpRange:4,horseJumpDamage:3,horsePush:true,horseJumpUsed:true});
 const kept=R.stateFromJourney(R.journeyRecord(enhanced));
 const kh=kept.party.find(u=>u.id===oldHorse.id);
 assert.deepEqual([kh.horseJumpRange,kh.horseJumpDamage,kh.horsePush,kh.horseJumpUsed],[4,3,true,true],'新版本技能记录不得被重复初始化覆盖');
 // 旧战斗存档：已用完旧共用行动的马不因迁移获得本回合跳跃
 const legacyUsed=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)]);
 const lhUsed=G(legacyUsed,'h');
 lhUsed.ap=0;
 delete lhUsed.horseJumpRange;delete lhUsed.horseJumpDamage;delete lhUsed.horsePush;delete lhUsed.horseJumpUsed;
 const migratedUsed=R.migrateState(legacyUsed);
 const mh=G(migratedUsed,'h');
 assert.deepEqual([mh.horseJumpRange,mh.horseJumpDamage,mh.horsePush],[2,1,false]);
 assert.equal(mh.horseJumpUsed,true,'ap=0 的旧马迁移后不能新增本回合跳跃');
 assert.equal(act(migratedUsed,'h',{x:4,y:2},'horse-jump'),undefined,'迁移后本回合无法使用跳跃');
 // 未用完旧行动的马迁移后保留本回合跳跃
 const legacyReady=mk([P('king','king',0,0),E('boss','king',8,8),P('h','horse',4,4)]);
 const lhReady=G(legacyReady,'h');
 delete lhReady.horseJumpRange;delete lhReady.horseJumpDamage;delete lhReady.horsePush;delete lhReady.horseJumpUsed;
 const migratedReady=R.migrateState(legacyReady);
 assert.equal(G(migratedReady,'h').horseJumpUsed,false,'未用完行动的马迁移后仍可跳跃');
 assert.ok(act(migratedReady,'h',{x:4,y:2},'horse-jump'));
 // 入关/关卡快照同样迁移；失败重试不重复初始化、不刷新已用行动
 const oldLevel=R.startLevel(R.enterCamp(R.newGame()),R.defaultMap());
 const oldSnapState=R.copy(oldLevel);oldSnapState.phase='result';oldSnapState.result='dead';
 const snapHorse=oldSnapState.levelSnapshot.units.find(u=>u.kind==='horse'&&u.side==='player');
 snapHorse.ap=0;
 delete snapHorse.horseJumpRange;delete snapHorse.horseJumpDamage;delete snapHorse.horsePush;delete snapHorse.horseJumpUsed;
 const retried=R.retryLevel(oldSnapState);
 const retryHorse=retried.units.find(u=>u.kind==='horse'&&u.side==='player');
 assert.deepEqual([retryHorse.horseJumpRange,retryHorse.horseJumpDamage,retryHorse.horsePush],[2,1,false]);
 assert.equal(retryHorse.horseJumpUsed,true,'重试不刷新旧档已用完的行动');
 assert.equal(R.migrateState(migratedUsed).units.find(u=>u.id==='h').horseJumpUsed,true,'重复迁移幂等');
});

test('H19 我方马无旧普通攻击入口，敌方马走法/攻击预告不变且无跳跃与成长字段',()=>{
 // 我方马：只有普通移动与跳跃两种动作，落点被占时没有攻击动作
 const mine=base([P('h','horse',4,4),E('e','pawn',5,6),P('a','pawn',6,5)],{teamSp:2});
 const types=new Set(R.legalActions(mine,'h').map(a=>a.type));
 assert.deepEqual(Array.from(types).sort(),['horse-jump','move'],'我方马只有普通移动与跳跃两个入口');
 assert.equal(act(mine,'h',{x:5,y:6},undefined),undefined,'普通移动不能落在敌方单位格（旧普通攻击已取消）');
 assert.equal(act(mine,'h',{x:6,y:5},undefined),undefined,'普通移动不能落在友军格');
 assert.equal(act(mine,'h',{x:5,y:2},undefined).type,'move','空落点仍是普通移动');
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){const a=act(mine,'h',{x,y},'attack');if(a)assert.notEqual(a.type,'attack','我方马不存在旧普通攻击动作');}
 // 敌方马：与旧日字+马腿公式逐格一致
 const enemy=base([E('eh','horse',2,4),P('leg','pawn',3,4),P('t','pawn',4,3),E('e2','horse',6,4)]);
 for(const id of ['eh','e2']){
  const u=G(enemy,id);
  for(let y=0;y<9;y++)for(let x=0;x<9;x++){
   const to={x,y},ax=Math.abs(x-u.x),ay=Math.abs(y-u.y);
   const leg={x:u.x+(ax===2?Math.sign(x-u.x):0),y:u.y+(ay===2?Math.sign(y-u.y):0)};
   const legacy=ax*ay===2&&!R.occupied(enemy,leg);
   const now=!!act(enemy,id,to,undefined);
   assert.equal(now,legacy,`敌方马 ${id} → (${x},${y}) 与旧日字/马腿公式一致`);
   const modeAction=act(enemy,id,to,'horse-jump');
   if(modeAction)assert.notEqual(modeAction.type,'horse-jump','敌方马不生成跳跃动作');
  }
  assert.equal(u.horseJumpRange,undefined,'敌方马没有技能距离字段');
  assert.equal(u.horseJumpDamage,undefined);assert.equal(u.horsePush,undefined);
 }
 // 敌方攻击预告：马按日字吃子，不受跳跃/成长影响
 const intent=base([E('eh','horse',2,4),P('target','pawn',4,5)]);
 const intents=R.generateIntents(intent);intent.intents=intents;
 const horseIntent=intents.find(i=>i.actor==='eh');
 assert.equal(horseIntent.type,'attack');
 assert.deepEqual([horseIntent.to.x,horseIntent.to.y],[4,5],'敌方马意图仍是日字落点攻击');
 const enemyEffects=R.enemyPhase(intent).effects;
 assert.equal(enemyEffects.find(e=>e.actor==='eh').status,'success','敌方马按旧规则执行');
 assert.equal(enemyEffects.find(e=>e.actor==='eh').damage.includes('target'),true);
});




