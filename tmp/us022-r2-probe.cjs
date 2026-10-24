// 临时探针：验证 US-022 R2 补验用例的几何/入口是否可构造（不产出最终证据）。
const R = require('../web/js/rules.js');
const U = (id, side, kind, x, y) => R.unit(id, side, kind, x, y);
const P = (id, kind, x, y) => U(id, 'player', kind, x, y);
const E = (id, kind, x, y) => U(id, 'enemy', kind, x, y);
const G = (s, id) => s.units.find(u => u.id === id);
function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
function mk(units, opts) {
  opts = opts || {};
  const s = R.emptyState(units);
  s.phase = opts.phase || 'player';
  s.tiles = Object.assign(land(), opts.tiles || {});
  s.intents = opts.intents || [];
  if (opts.teamSp !== undefined) s.teamSp = opts.teamSp;
  return s;
}
function addSp(s, sp) { const n = R.copy(s); n.teamSp = sp; return n; }
function up(s, id, skill, times) { let n = R.copy(s); for (let i = 0; i < times; i++) n = R.purchaseUpgrade(n, id, skill); return n; }

console.log('=== E15-A: 实际牵引已冻结目标（无碰撞） ===');
{
  let s = mk([P('king', 'king', 4, 0), P('e1', 'elephant', 4, 3), P('e2', 'elephant', 0, 1), E('t', 'pawn', 4, 1), E('boss', 'king', 8, 8)]);
  s = up(addSp(s, 20), 'e1', 'elephant-freeze-unlock', 1);
  s = up(addSp(s, 20), 'e2', 'elephant-pull-range', 1); // 3 -> 4
  s.teamSp = 0;
  s.intents = []; R.prepareEnemy(s);
  console.log('意图:', s.intents.map(i => i.actor + ':' + i.type).join(','));
  const f = R.submit(s, 'e1', { x: 4, y: 1 }, 'elephant-freeze');
  console.log('freeze effect?', !!f.effect, 'frozen=', G(f.state, 't').frozen);
  const before = f.state;
  const pr = R.submit(before, 'e2', { x: 4, y: 1 }, 'elephant-pull');
  console.log('pull effect?', !!pr.effect, 'status=', pr.effect && pr.effect.pull && pr.effect.pull.status,
    'moved=', pr.effect && pr.effect.pull && pr.effect.pull.moved, 'hits=', pr.effect && pr.effect.hits.length);
  console.log('t pos=', [G(pr.state, 't').x, G(pr.state, 't').y], 'hp=', G(pr.state, 't').hp, 'frozen=', G(pr.state, 't').frozen);
  const out = R.enemyTurn(pr.state);
  console.log('敌方阶段 t:', JSON.stringify(out.effects.find(e => e.actor === 't')), 'kingHp=', G(out.state, 'king').hp);
  R.prepareEnemy(out.state);
  console.log('下回合意图:', out.state.intents.map(i => i.actor + ':' + i.type).join(','));
}

console.log('\n=== E11: 马跳撞破损山 + 牵引撞碎石 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('h', 'horse', 2, 1), P('ele', 'elephant', 0, 4), E('t', 'rook', 4, 4), E('boss', 'king', 8, 8)],
    { tiles: { '2,4': 'mountain' } });
  s = up(addSp(s, 20), 'ele', 'elephant-pull-range', 1); // 4
  s.teamSp = 0;
  const ja = R.horseJumpAction(s, G(s, 'h'), { x: 2, y: 3 });
  console.log('马跳动作:', !!ja, ja && ja.type, ja && ja.distance);
  const jr = R.submit(s, 'h', { x: 2, y: 3 }, 'horse-jump');
  console.log('马跳 effect?', !!jr.effect, 'mountains=', JSON.stringify(jr.effect && jr.effect.mountains), 'tile=', jr.state.tiles['2,4'], 'mountain()=', R.mountain(jr.state, { x: 2, y: 4 }));
  const pr = R.submit(jr.state, 'ele', { x: 4, y: 4 }, 'elephant-pull');
  console.log('牵引 effect?', !!pr.effect, 'status=', pr.effect && pr.effect.pull && pr.effect.pull.status,
    'moved=', pr.effect && pr.effect.pull && pr.effect.pull.moved, 'tile=', pr.state.tiles['2,4'],
    'target pos=', [G(pr.state, 't').x, G(pr.state, 't').y], 'hp=', G(pr.state, 't').hp);
}

console.log('\n=== E11b: 车冲锋撞完好山只扣 1 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('r', 'rook', 0, 4), E('boss', 'king', 8, 8)], { tiles: { '3,4': 'mountain' } });
  s.teamSp = 2;
  s = R.purchaseUpgrade(s, 'r', 'rook-charge-role');
  console.log('rookRole=', G(s, 'r').rookRole, 'chargeAvail=', G(s, 'r').rookChargeAvailable);
  const a = R.actionAt(s, G(s, 'r'), { x: 3, y: 4 }, 'charge');
  console.log('冲锋动作:', !!a, a && a.type);
  const r = R.submit(s, 'r', { x: 3, y: 4 }, 'charge');
  console.log('冲锋 effect?', !!r.effect, 'tile=', r.state.tiles['3,4'], 'mountain()=', R.mountain(r.state, { x: 3, y: 4 }), 'rook pos=', [G(r.state, 'r').x, G(r.state, 'r').y]);
  // 第二次撞击
  const s2 = R.copy(r.state);
  R.resetTurn(G(s2, 'r'));
  const r2 = R.submit(s2, 'r', { x: 3, y: 4 }, 'charge');
  console.log('第二次冲锋:', !!r2.effect, 'tile=', r2.state.tiles['3,4']);
}

console.log('\n=== E15-B: 剩余 3 阶段受伤全部清零 ===');
{
  let s = mk([P('king', 'king', 0, 0), P('e1', 'elephant', 0, 3), P('e2', 'elephant', 0, 6), E('t', 'rook', 0, 1), E('boss', 'king', 8, 8)],
    { tiles: { '0,2': 'mountain' } });
  s = up(addSp(s, 20), 'e1', 'elephant-freeze-unlock', 1);
  s = up(addSp(s, 20), 'e1', 'elephant-freeze-duration', 2); // 1 -> 3
  s = up(addSp(s, 20), 'e2', 'elephant-pull-range', 2); // 3 -> 5
  s.teamSp = 0;
  const f = R.submit(s, 'e1', { x: 0, y: 1 }, 'elephant-freeze');
  console.log('frozen=', G(f.state, 't').frozen, 'dur=', R.elephantFreezeDurationOf(G(s, 'e1')));
  const pr = R.submit(f.state, 'e2', { x: 0, y: 1 }, 'elephant-pull');
  console.log('pull status=', pr.effect && pr.effect.pull.status, 'frozen=', G(pr.state, 't').frozen, 'standby=', G(pr.state, 't').thawStandby, 'hp=', G(pr.state, 't').hp);
}
