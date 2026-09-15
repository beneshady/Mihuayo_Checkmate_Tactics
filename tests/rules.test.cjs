// 规则测试：对应 docs/design/m0-gdd.md 第 8.1 节“必需规则测试”。
// 运行：node --test tests/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../web/js/rules.js');
const U = R.unit;

// 测试夹具：仅保留双方将帅 + 附加单位，手动布置意图（不触发生成器）。
function fixture(...units) {
  return Object.assign(R.newGame(), {
    units: [U('king', 'player', 'king', 4, 0), U('boss', 'enemy', 'king', 4, 9)].concat(units),
    intents: []
  });
}
function intent(s, id, to, type = 'attack', order = 1) {
  const u = s.units.find(v => v.id === id);
  return { actor: id, from: { x: u.x, y: u.y }, to, type, path: [], order };
}
const noAct = u => ({ ...u, acted: false });

test('主帅越出九宫、跨两步、非米字斜走被拒绝且不消耗行动', () => {
  const s = R.newGame();
  for (const p of [{ x: 2, y: 0 }, { x: 4, y: 2 }, { x: 4, y: -1 }, { x: 3, y: 1 }, { x: 5, y: 1 }])
    assert.equal(R.submit(s, 'king', p).state, s);
  for (const p of [{ x: 3, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }])
    assert.equal(R.submit(s, 'king', p).state.units[0].acted, true);
});

test('双方九宫中心可走八邻点；角点沿米字进中心；边中点不可任意斜走', () => {
  for (const side of ['player', 'enemy']) {
    const s = fixture(), k = R.king(s, side), cy = side === 'player' ? 1 : 8;
    k.x = 4; k.y = cy;
    assert.equal(R.legalActions(s, k.id).length, 8);
    k.x = 3; k.y = cy - 1; // 角点
    assert(R.actionAt(s, k, { x: 4, y: cy }));
    assert(!R.actionAt(s, k, { x: 5, y: cy + 1 }));
    k.x = 4; k.y = cy - 1; // 边中点
    assert(!R.actionAt(s, k, { x: 3, y: cy }));
    assert(!R.actionAt(s, k, { x: 5, y: cy }));
    k.x = 5; k.y = cy + 1;
    assert(!R.actionAt(s, k, { x: 6, y: cy + 1 }));
    assert(!R.actionAt(s, k, { x: 5, y: cy + 2 }));
  }
});

test('米字斜线可吃敌子；友军占位阻止落子；斜步能解开预告将军', () => {
  let s = fixture(U('p', 'enemy', 'pawn', 3, 0)); s.units[0].y = 1;
  let n = R.submit(s, 'king', { x: 3, y: 0 }).state;
  assert.equal(R.at(n, { x: 3, y: 0 }).id, 'king');
  assert(!n.units.some(u => u.id === 'p'));
  s = fixture(U('r', 'player', 'rook', 4, 1)); s.units[0].x = 3;
  assert.equal(R.submit(s, 'king', { x: 4, y: 1 }).state, s); // 友军占位
  s = fixture(U('e', 'enemy', 'rook', 4, 4)); s.units[0].y = 1; s.units[0].hp = 1;
  s.intents = [intent(s, 'e', { x: 4, y: 1 })];
  n = R.submit(s, 'king', { x: 5, y: 2 }).state;
  assert(R.analyze(s).safe);
  assert.equal(R.king(R.enemyPhase(n).state, 'player').hp, 1);
});

test('车走空位、普通吃子、友军挡路；每单位每回合仅一次行动', () => {
  let s = R.submit(R.newGame(), 'rook', { x: 0, y: 3 }).state;
  assert.equal(s.units.find(u => u.id === 'rook').xp, 1);
  assert.equal(R.at(s, { x: 0, y: 3 }).id, 'rook');
  assert.equal(R.submit(s, 'rook', { x: 0, y: 4 }).state, s); // 已行动
  s = fixture(U('r', 'player', 'rook', 0, 0), U('h', 'player', 'horse', 0, 2));
  assert.equal(R.submit(s, 'r', { x: 0, y: 3 }).state, s); // 友军挡路
});

test('三级车贯穿三个普通敌人，击杀三个并停在最远目标；不可穿敌选空位', () => {
  const s = fixture(U('r', 'player', 'rook', 0, 0), ...[1, 3, 5].map(y => U('p' + y, 'enemy', 'pawn', 0, y)));
  const r = s.units[2]; r.level = 3; r.xp = 4;
  assert.equal(R.submit(s, 'r', { x: 0, y: 6 }).state, s); // 空位移动不得穿过敌人
  const n = R.submit(s, 'r', { x: 0, y: 5 }).state;
  assert.equal(n.kills, 3);
  assert.equal(R.at(n, { x: 0, y: 5 }).id, 'r');
});

test('三级车遇“小兵—敌将—小兵”：首兵阵亡、将扣 1、第三兵保留、车留起点', () => {
  const s = fixture(U('r', 'player', 'rook', 0, 9), U('p', 'enemy', 'pawn', 2, 9), U('last', 'enemy', 'pawn', 6, 9));
  s.wave = 2;
  const r = s.units[2]; r.level = 3; r.xp = 4;
  R.king(s, 'enemy').hp = 1; // 剩 1 HP 的敌将仍阻止贯穿
  const n = R.submit(s, 'r', { x: 6, y: 9 }).state;
  assert.equal(n.result, 'victory');
  assert.equal(R.at(n, { x: 0, y: 9 }).id, 'r');
  assert(n.units.some(u => u.id === 'last'));
  assert.equal(n.kills, 2);
});

test('XP 越过升级阈值：动作结束后升级，本次范围不变，不返还行动；升级不加 HP', () => {
  const s = fixture(U('r', 'player', 'rook', 0, 0), U('p', 'enemy', 'pawn', 0, 1), U('q', 'enemy', 'pawn', 0, 2));
  s.units[2].xp = 1; // 1 XP，击杀 1 个后到 2 → Lv.2
  assert.equal(R.submit(s, 'r', { x: 0, y: 2 }).state, s); // Lv.1 不能一次接触两个敌人
  const r = R.submit(s, 'r', { x: 0, y: 1 }).state.units.find(u => u.id === 'r');
  assert.equal(r.level, 2);
  assert.equal(r.hp, 1);
  assert(r.acted);
});

test('炮架数量 0/1/2：仅恰好 1 个可攻击；移动不能越过炮架', () => {
  const s = fixture(U('c', 'player', 'cannon', 0, 0), U('p', 'enemy', 'pawn', 0, 5));
  assert(!R.actionAt(s, s.units[2], { x: 0, y: 5 }));
  s.units.push(U('screen', 'enemy', 'pawn', 0, 2));
  assert(R.actionAt(s, s.units[2], { x: 0, y: 5 }));
  assert(!R.actionAt(s, s.units[2], { x: 0, y: 4 }));
  s.units.push(U('screen2', 'enemy', 'pawn', 0, 3));
  assert(!R.actionAt(s, s.units[2], { x: 0, y: 5 }));
});

test('马腿被堵阻止相应马步；卒过河后开放横向一步且不能后退', () => {
  const s = fixture(U('h', 'player', 'horse', 0, 0), U('p', 'enemy', 'pawn', 2, 5));
  assert(R.actionAt(s, s.units[2], { x: 2, y: 1 }));
  s.units.push(U('b', 'player', 'rook', 1, 0));
  assert(!R.actionAt(s, s.units[2], { x: 2, y: 1 }));
  const pawn = s.units[3];
  assert(!R.actionAt(s, pawn, { x: 3, y: 5 })); // 未过河不能横走
  pawn.y = 4;
  assert(R.actionAt(s, pawn, { x: 3, y: 4 }));
  assert(!R.actionAt(s, pawn, { x: 2, y: 5 })); // 不能后退
});

test('敌车目标移空则移到原预告位置；换单位则攻击新占位者；移动意图不转攻击', () => {
  const s = fixture(U('e', 'enemy', 'rook', 4, 3));
  s.intents = [intent(s, 'e', { x: 4, y: 0 })];
  let n = R.submit(s, 'king', { x: 3, y: 0 }).state;
  assert.equal(R.at(R.enemyPhase(n).state, { x: 4, y: 0 }).id, 'e');
  n.units.push(U('replacement', 'player', 'horse', 4, 0));
  assert(!R.enemyPhase(n).state.units.some(u => u.id === 'replacement'));
  s.intents[0].type = 'move';
  assert.equal(R.enemyPhase(s).effects[0].status, 'cancelled'); // 帅在原位，移动目标被占
});

test('移走炮架则原地取消；炮目标移空且炮架恰好一个则原地打空；均不追踪', () => {
  const s = fixture(U('c', 'enemy', 'cannon', 4, 4), U('screen', 'player', 'rook', 4, 2));
  s.intents = [intent(s, 'c', { x: 4, y: 0 })];
  let n = R.submit(s, 'screen', { x: 3, y: 2 }).state;
  assert.equal(R.enemyPhase(n).effects[0].status, 'cancelled');
  n = R.submit(s, 'king', { x: 3, y: 0 }).state;
  assert.equal(R.enemyPhase(n).effects[0].status, 'miss');
  assert.equal(R.at(R.enemyPhase(n).state, { x: 4, y: 4 }).id, 'c');
});

test('后行动敌人用实际新棋盘取消或执行，与预览一致；模拟与分析不污染真实对局', () => {
  const s = fixture(U('a', 'enemy', 'rook', 0, 2), U('b', 'enemy', 'rook', 4, 4));
  s.intents = [intent(s, 'a', { x: 4, y: 2 }, 'move'), intent(s, 'b', { x: 4, y: 0 }, 'attack', 2)];
  const before = JSON.stringify(s);
  const predicted = R.enemyPhase(s);
  assert.equal(predicted.effects[1].status, 'cancelled'); // a 先占 (4,2)，b 的目标 (4,0) 路径被挡
  const done = R.endTurn(s);
  assert.deepEqual(done.state.units.map(noAct), predicted.state.units.map(noAct));
  R.analyze(s); R.enemyPhase(s); R.dangerNow(s); R.preview(s, 'king', { x: 4, y: 1 });
  assert.equal(JSON.stringify(s), before); // 金币/XP/HP/回合/位置不变
});

test('意图生成优先级：攻帅 > 攻车 > 攻其他 > 移动近帅；y/x 升序平局；无动作待机', () => {
  let s = fixture(U('e', 'enemy', 'rook', 4, 3), U('r', 'player', 'rook', 4, 5), U('h', 'player', 'horse', 5, 3));
  s.intents = R.generateIntents(s);
  // 敌车直线可攻帅(4,0)、己方车(4,5)、马(5,3)：优先帅
  assert.deepEqual(s.intents.find(i => i.actor === 'e').to, { x: 4, y: 0 });
  assert.equal(s.intents.find(i => i.actor === 'e').type, 'attack');
  // 无可攻目标时选距帅曼哈顿距离最小的空位
  s = fixture(U('e', 'enemy', 'rook', 0, 5));
  s.intents = R.generateIntents(s);
  assert.deepEqual(s.intents.find(i => i.actor === 'e').to, { x: 0, y: 0 });
  // 距离平局按目标 y、x 升序：(2,0) 与 (3,1) 距帅同为 2，取 y 更小的 (2,0)
  s = fixture(U('e', 'enemy', 'rook', 2, 1), U('blocker', 'enemy', 'pawn', 4, 1));
  s.intents = R.generateIntents(s);
  assert.deepEqual(s.intents.find(i => i.actor === 'e').to, { x: 2, y: 0 });
  assert.equal(s.intents.find(i => i.actor === 'e').type, 'move');
  // 完全无路可走 → 待机，仍占公开序号
  s = fixture(U('e', 'enemy', 'pawn', 0, 0), U('wall', 'enemy', 'rook', 1, 0));
  s.intents = R.generateIntents(s);
  const st = s.intents.find(i => i.actor === 'e');
  assert.equal(st.type, 'standby');
  assert.equal(R.enemyPhase(s).effects.find(e => e.actor === 'e').status, 'standby');
});

test('波次执行序号与配置一致；敌方车固定一级不贯穿', () => {
  const s = R.newGame();
  const ids = s.intents.map(i => i.actor);
  assert.deepEqual(ids, ['w1-0', 'w1-1', 'w1-2', 'w1-3']);
  assert.deepEqual(s.intents.map(i => i.order), [1, 2, 3, 4]);
  const f = fixture(U('e', 'enemy', 'rook', 0, 0), U('a', 'player', 'rook', 0, 3), U('b', 'player', 'horse', 0, 5));
  assert(!R.actionAt(f, f.units[2], { x: 0, y: 5 })); // 敌车不可隔着己方车打马
  assert(R.actionAt(f, f.units[2], { x: 0, y: 3 })); // 只能吃最近的车
});

test('主帅必受 1 点伤害但仍可存活：仅将军提示，不判将死', () => {
  const s = fixture(U('e', 'enemy', 'rook', 4, 3));
  s.units[0].acted = true;
  s.intents = [intent(s, 'e', { x: 4, y: 0 })];
  assert(R.dangerNow(s));
  assert(R.analyze(s).safe); // 3 HP，受 1 伤存活
  assert.equal(R.checkmate(s).phase, 'player');
});

test('穷尽所有剩余动作均致死：判将死；直接结束回合则主帅阵亡，两者失败类型不同', () => {
  const s = fixture(U('e', 'enemy', 'rook', 4, 3));
  s.units[0].acted = true; s.units[0].hp = 1;
  s.intents = [intent(s, 'e', { x: 4, y: 0 })];
  assert(R.dangerNow(s));
  assert(!R.analyze(s).safe);
  const m = R.checkmate(s);
  assert.equal(m.result, 'mate');
  assert.equal(R.endTurn(s).state.result, 'dead');
});

test('主帅没安全落点（已行动）但队友能清掉攻击者：不判将死', () => {
  const s = fixture(U('e', 'enemy', 'rook', 4, 2), U('r', 'player', 'rook', 4, 5));
  s.units[0].hp = 1; s.units[0].acted = true; // 主帅 1 HP 且已行动，无任何落点可用
  s.intents = [intent(s, 'e', { x: 4, y: 0 })];
  assert(R.dangerNow(s));
  assert.equal(R.endTurn(s).state.result, 'dead'); // 不解围则阵亡
  const a = R.analyze(s);
  assert(a.safe);
  assert.equal(a.plan.length, 1);
  assert.equal(a.plan[0].actor, 'r'); // 车吃掉攻击者解围
  assert.deepEqual(a.plan[0].to, { x: 4, y: 2 });
});

test('必须两枚队友按特定顺序配合才能解围：搜索能找到方案，不误判失败', () => {
  const s = fixture(U('h', 'player', 'horse', 2, 3), U('r', 'player', 'rook', 0, 3),
    U('e', 'enemy', 'rook', 4, 2), U('c', 'enemy', 'cannon', 4, 4));
  s.units[0].hp = 1; s.units[0].acted = true; // 主帅已行动且 1 HP
  s.intents = R.generateIntents(s);
  // 任何单步都无法解围
  for (const u of s.units.filter(u => u.side === 'player' && !u.acted))
    for (const mv of R.legalActions(s, u.id))
      assert.equal(R.enemyPhase(R.submit(s, u.id, mv.to).state).state.result, 'dead');
  const a = R.analyze(s);
  assert(a.safe);
  assert.equal(a.plan.length, 2);
  assert.equal(a.plan[0].actor, 'h');
  assert.equal(a.plan[1].actor, 'r');
  let n = s;
  for (const mv of a.plan) n = R.submit(n, mv.actor, mv.to).state;
  assert.notEqual(R.enemyPhase(n).state.result, 'dead');
});

test('先斩将即可免于致死的敌方阶段：不判将死，波次立即结束', () => {
  const s = fixture(U('r', 'player', 'rook', 4, 8), U('e', 'enemy', 'rook', 4, 2));
  s.units[0].hp = 1; s.units[0].acted = true;
  R.king(s, 'enemy').hp = 1;
  s.intents = [intent(s, 'e', { x: 4, y: 0 })];
  assert(R.dangerNow(s));
  assert(R.analyze(s).safe);
  const n = R.submit(s, 'r', { x: 4, y: 9 }).state;
  assert.equal(n.phase, 'shop');
  assert.equal(n.gold, 2);
  assert.equal(n.kills, 1); // 退场敌车不算击杀
  assert.equal(R.endTurn(n).state.gold, 2); // 仅一次奖励
  assert.equal(R.submit(n, 'r', { x: 4, y: 9 }).state, n); // 商店阶段不能行动
});

test('购买连点不重复生成、金币不足不产生单位、可跳过购买直接进第二波', () => {
  let s = fixture(U('rook', 'player', 'rook', 5, 3));
  s.phase = 'shop'; s.gold = 2;
  s.units = s.units.filter(u => u.side === 'player');
  s.units[0].hp = 2; s.units[1].xp = 3; s.units[1].level = 2;
  const n = R.buy(s, 'horse');
  assert.equal(n.gold, 0);
  assert.equal(R.buy(n, 'cannon'), n); // 已买过
  assert.equal(n.units.length, 3);
  assert.equal(R.buy(s, 'unknown'), s); // 非法商品
  const w = R.nextWave(n);
  assert.equal(w.wave, 2);
  assert.equal(w.phase, 'player');
  assert.equal(w.intents.length, 5);
  assert.equal(R.king(w, 'player').hp, 2); // 血量继承
  assert.equal(R.at(w, { x: 0, y: 0 }).xp, 3); // XP/等级继承
  assert.equal(R.at(w, { x: 2, y: 0 }).kind, 'horse');
  assert(!R.at(w, { x: 5, y: 3 })); // 位置重置
  s.gold = 1;
  assert.equal(R.buy(s, 'horse'), s); // 余额不足
  const skip = R.nextWave(s); // 跳过购买（金币不足时等价）
  assert.equal(skip.units.filter(u => u.side === 'player').length, 2);
});

test('死亡车不复活、不能补买；跨波意图与行动重置', () => {
  let s = fixture();
  s.phase = 'shop'; s.gold = 2;
  s.units = [U('king', 'player', 'king', 4, 0)]; // 车已阵亡
  const w = R.nextWave(R.buy(s, 'cannon'));
  assert(!w.units.some(u => u.side === 'player' && u.kind === 'rook'));
  assert.equal(R.at(w, { x: 1, y: 2 }).kind, 'cannon');
  assert.equal(w.units.filter(u => u.side === 'player').every(u => !u.acted), true);
  assert.equal(w.intents.length, 5);
});

test('newGame 确定性：连续重开状态完全一致；初始意图已生成且公开', () => {
  const a = R.newGame(), b = R.newGame();
  assert.deepEqual(a, b);
  assert.equal(a.intents.length, 4);
  assert.equal(a.phase, 'player');
  assert.equal(a.turn, 1);
  assert.equal(R.at(a, { x: 4, y: 0 }).kind, 'king');
  assert.equal(R.at(a, { x: 0, y: 0 }).kind, 'rook');
});

test('第二波斩将胜利；结果携带波次/回合/击杀/最高等级', () => {
  let f = R.newGame();
  f.wave = 2;
  f.units = f.units.filter(u => u.side === 'player');
  const r = U('rook2', 'player', 'rook', 4, 7); r.xp = 4; r.level = 3;
  const boss = U('boss', 'enemy', 'king', 4, 9); boss.hp = 1;
  f.units = f.units.filter(u => u.id !== 'rook').concat([r, boss]);
  f.intents = [];
  const v = R.submit(f, 'rook2', { x: 4, y: 9 }).state;
  assert.equal(v.result, 'victory');
  assert.equal(v.phase, 'result');
  assert.equal(v.wave, 2);
  assert.equal(v.highestLevel, 3);
  assert.equal(v.kills, 1);
});
