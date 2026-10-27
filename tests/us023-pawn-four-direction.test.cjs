// US-023（编号暂定）兵系走法调整：兵与转职兵进入敌方半区后可前后左右一步；未过河仍只能向前。
// 全部走真实规则入口（R.actionAt / R.submit / R.generateIntents / R.pawnCrossed），夹具只摆放初始局面。
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../web/js/rules.js');
const U = (id, side, kind, x, y) => R.unit(id, side, kind, x, y);
const P = (id, kind, x, y) => U(id, 'player', kind, x, y);
const E = (id, kind, x, y) => U(id, 'enemy', kind, x, y);
const G = (s, id) => s.units.find(u => u.id === id);
function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
function mk(units, opts) {
  opts = opts || {};
  const s = R.emptyState(units);
  s.phase = 'player';
  s.tiles = Object.assign(land(), opts.tiles || {});
  return s;
}
// 带双方主帅的底局面：避免中途触发胜负结算
const base = (units, opts) => mk([P('king', 'king', 4, 0), E('boss', 'king', 8, 8)].concat(units || []), opts);
const at = (s, id, to) => R.actionAt(s, G(s, id), to);
const move = (s, id, to) => R.submit(s, id, to);

/* ============ 1. 我方兵：未过河只能向前，进入敌方半区后前后左右一步 ============ */

test('A01 我方兵未过河（含河道行）：只能向前，横走与后退均非法', () => {
  const s = base([P('p', 'pawn', 4, 3)]);
  assert.ok(R.pawnCrossed(G(s, 'p')) === false, '(4,3) 尚未过河');
  assert.ok(at(s, 'p', { x: 4, y: 4 }), '向前一步合法');
  assert.equal(at(s, 'p', { x: 5, y: 3 }), undefined, '未过河不能横走');
  assert.equal(at(s, 'p', { x: 3, y: 3 }), undefined, '未过河不能横走（左）');
  assert.equal(at(s, 'p', { x: 4, y: 2 }), undefined, '未过河不能后退');
  G(s, 'p').y = 4;
  assert.ok(R.pawnCrossed(G(s, 'p')) === false, '河道行 y=4 仍未过河');
  assert.equal(at(s, 'p', { x: 5, y: 4 }), undefined, '河道不能横走');
  assert.equal(at(s, 'p', { x: 4, y: 3 }), undefined, '河道不能后退');
  G(s, 'p').y = 5;
  assert.ok(R.pawnCrossed(G(s, 'p')) === true, 'y=5 已进入敌方半区');
  assert.ok(at(s, 'p', { x: 5, y: 5 }), '过河后可横走');
  assert.ok(at(s, 'p', { x: 4, y: 4 }), '过河后可后退');
  assert.ok(at(s, 'p', { x: 4, y: 6 }), '过河后仍可前进');
});

test('A02 我方兵过河后退真实执行：位置更新、消耗 AP、不能再次行动', () => {
  let s = base([P('p', 'pawn', 4, 5)]);
  assert.equal(G(s, 'p').ap, 1);
  const before = JSON.stringify(s);
  const out = move(s, 'p', { x: 4, y: 4 });
  assert.ok(out.action, '后退被规则接受');
  assert.notEqual(JSON.stringify(out.state), before, '状态已推进');
  const p = G(out.state, 'p');
  assert.deepEqual([p.x, p.y], [4, 4], '实际退回到 (4,4)');
  assert.equal(p.ap, 0, 'AP 消耗 1');
  assert.equal(at(out.state, 'p', { x: 4, y: 5 }), undefined, '同一回合不能再动');
  s = R.copy(out.state);
  R.resetTurn(G(s, 'p'));
  assert.equal(at(s, 'p', { x: 5, y: 4 }), undefined, '退回河道后重新受未过河限制（不能横走）');
  assert.equal(at(s, 'p', { x: 4, y: 3 }), undefined, '退回河道后不能继续后退');
  assert.ok(at(s, 'p', { x: 4, y: 5 }), '退回河道后仍可向前');
  G(s, 'p').y = 5;
  assert.ok(at(s, 'p', { x: 4, y: 4 }), '再次进入敌方半区后恢复四向');
});

test('A03 转职弓兵与枪兵同样继承四向走法（仅移动，攻击仍走四向技能）', () => {
  for (const kind of ['archer', 'spearman']) {
    const s = base([P('u', kind, 4, 5), E('target', 'pawn', 4, 4)]);
    G(s, 'u').ap = G(s, 'u').apLimit = 1;
    assert.ok(at(s, 'u', { x: 4, y: 6 }), kind + ' 过河后前进');
    assert.ok(at(s, 'u', { x: 5, y: 5 }), kind + ' 过河后横走');
    assert.equal(at(s, 'u', { x: 4, y: 4 }), undefined, kind + ' 不能靠走法吃子（后退格有敌兵）');
    s.units = s.units.filter(u => u.id !== 'target');
    assert.ok(at(s, 'u', { x: 4, y: 4 }), kind + ' 过河后后退到空格合法');
    G(s, 'u').y = 3;
    assert.equal(at(s, 'u', { x: 4, y: 2 }), undefined, kind + ' 未过河不能后退');
    assert.equal(at(s, 'u', { x: 5, y: 3 }), undefined, kind + ' 未过河不能横走');
  }
});

test('A04 疾行（主帅疾行 +1）下过河可后退 2 格直行，未过河仍只 1 格', () => {
  const fast = base([P('p', 'pawn', 4, 6)]);
  assert.equal(at(fast, 'p', { x: 4, y: 4 }), undefined, '无疾行只能退 1 格');
  G(fast, 'p').commanderMove = 1;
  const back = at(fast, 'p', { x: 4, y: 4 });
  assert.ok(back, '疾行可后退 2 格');
  assert.equal(back.path.length, 2, '路径 2 格');
  const slow = base([P('q', 'pawn', 4, 3)]);
  G(slow, 'q').commanderMove = 1;
  assert.equal(at(slow, 'q', { x: 4, y: 1 }), undefined, '未过河不能后退，疾行也不例外');
  assert.ok(at(slow, 'q', { x: 4, y: 5 }), '疾行仍可前进 2 格');
});

test('A05 兵系致命水格：后退进入水格非法，避水路径合法', () => {
  const wet = base([P('p', 'pawn', 4, 5)], { tiles: { '4,4': 'water' } });
  assert.equal(at(wet, 'p', { x: 4, y: 4 }), undefined, '后退落点为水，兵不能入水');
  const fastWet = base([P('p', 'pawn', 4, 6)], { tiles: { '4,5': 'water' } });
  G(fastWet, 'p').commanderMove = 1;
  assert.equal(at(fastWet, 'p', { x: 4, y: 4 }), undefined, '疾行后退路径经过水格同样非法');
  const side = base([P('p', 'pawn', 4, 5)], { tiles: { '5,5': 'water' } });
  assert.equal(at(side, 'p', { x: 5, y: 5 }), undefined, '过河横走同样不能进入水格');
});

/* ============ 2. 攻击与敌方对称 ============ */

test('A06 过河兵可攻击身后相邻敌人（走法方向即攻击方向）', () => {
  const s = base([P('p', 'pawn', 4, 5), E('rear', 'pawn', 4, 4)]);
  G(s, 'rear').hp = 1;
  const a = at(s, 'p', { x: 4, y: 4 });
  assert.ok(a, '身后相邻敌人可攻击');
  assert.equal(a.type, 'attack');
  const out = move(s, 'p', { x: 4, y: 4 });
  assert.equal(G(out.state, 'rear'), undefined, '敌兵被击杀');
  const notCrossed = base([P('q', 'pawn', 4, 3), E('rear', 'pawn', 4, 2)]);
  assert.equal(at(notCrossed, 'q', { x: 4, y: 2 }), undefined, '未过河兵不能攻击身后敌人');
});

test('A07 敌方兵不对称：进入我方半区（y<=3）只解禁横走，仍不能后退', () => {
  const s = base([E('e', 'pawn', 4, 3)]);
  assert.ok(R.pawnCrossed(G(s, 'e')) === true, '敌兵 y=3 已进入我方半区');
  assert.ok(at(s, 'e', { x: 5, y: 3 }), '敌兵过河后可横走');
  assert.ok(at(s, 'e', { x: 3, y: 3 }), '敌兵过河后可横走（另一侧）');
  assert.ok(at(s, 'e', { x: 4, y: 2 }), '敌兵过河后仍可前进');
  assert.equal(at(s, 'e', { x: 4, y: 4 }), undefined, '敌兵过河后仍不能后退');
  G(s, 'e').y = 4;
  assert.equal(R.pawnCrossed(G(s, 'e')), false, '敌兵 y=4 河道未过河');
  assert.equal(at(s, 'e', { x: 4, y: 5 }), undefined, '敌兵未过河不能后退');
  assert.equal(at(s, 'e', { x: 5, y: 4 }), undefined, '敌兵未过河不能横走');
  G(s, 'e').y = 5;
  assert.equal(at(s, 'e', { x: 4, y: 6 }), undefined, '敌兵己方半区不能后退');
  assert.equal(at(s, 'e', { x: 5, y: 5 }), undefined, '敌兵己方半区不能横走');
  assert.ok(at(s, 'e', { x: 4, y: 4 }), '敌兵己方半区仍可向前');
});

test('A08 敌方意图同步：敌兵不会把身后的我方棋子当作目标（过河亦然）', () => {
  const crossed = base([E('e', 'pawn', 4, 2), P('behind', 'rook', 4, 3)]);
  const intents = R.generateIntents(crossed);
  const hit = intents.find(i => i.actor === 'e');
  assert.ok(hit, '敌兵生成了意图');
  assert.equal(hit.type, 'standby', '身后相邻的我方棋子不构成攻击意图');
  const plain = base([E('e', 'pawn', 4, 5), P('behind', 'rook', 4, 6)]);
  const none = R.generateIntents(plain).find(i => i.actor === 'e');
  assert.equal(none.type, 'standby', '未过河敌兵同样不能把身后棋子当目标');
  const front = base([E('e', 'pawn', 4, 2), P('front', 'rook', 4, 1)]);
  const f = R.generateIntents(front).find(i => i.actor === 'e');
  assert.equal(f.type, 'attack', '正前方相邻的我方棋子仍是合法目标');
});

test('A09 R.pawnCrossed 边界与我方半区判定一致', () => {
  assert.equal(R.pawnCrossed(P('a', 'pawn', 0, 0)), false);
  assert.equal(R.pawnCrossed(P('a', 'pawn', 8, 4)), false, '河道行仍未过河');
  assert.equal(R.pawnCrossed(P('a', 'pawn', 8, 5)), true);
  assert.equal(R.pawnCrossed(P('a', 'pawn', 8, 8)), true);
  assert.equal(R.pawnCrossed(E('a', 'pawn', 8, 8)), false, '敌方半区判定相反');
  assert.equal(R.pawnCrossed(E('a', 'pawn', 8, 4)), false);
  assert.equal(R.pawnCrossed(E('a', 'pawn', 8, 3)), true);
});

test('A10 拒绝理由与新规则一致：未过河提示只能向前，过河后斜向提示不含斜向', () => {
  const s = base([P('p', 'pawn', 4, 3)]);
  assert.match(R.actionReason(s, 'p', { x: 4, y: 2 }), /未过河只能向前一步/);
  assert.match(R.actionReason(s, 'p', { x: 5, y: 3 }), /未过河只能向前一步/);
  G(s, 'p').y = 5;
  assert.match(R.actionReason(s, 'p', { x: 5, y: 6 }), /不含斜向/);
  assert.equal(R.actionReason(s, 'p', { x: 4, y: 4 }), '该目标不合法', '合法后退不再给出拒绝理由');
});
