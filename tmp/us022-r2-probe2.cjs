// 探针 2：既有技能入口撞山（车冲锋 / 马推动）与牵引跨技能累计。
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
  if (opts.teamSp !== undefined) s.teamSp = opts.teamSp;
  return s;
}

console.log('=== 车冲锋撞相邻完好山（charge range 1） ===');
{
  let s = mk([P('king', 'king', 4, 0), P('r', 'rook', 0, 4)], { tiles: { '1,4': 'mountain' }, teamSp: 2 });
  s = R.purchaseUpgrade(s, 'r', 'rook-charge-role');
  const a = R.actionAt(s, G(s, 'r'), { x: 1, y: 4 }, 'charge');
  console.log('charge action?', !!a, a && a.type, 'pathLen=', a && a.path.length);
  const r = R.submit(s, 'r', { x: 1, y: 4 }, 'charge');
  console.log('effect?', !!r.effect, 'tile=', r.state.tiles['1,4'], 'mountain=', R.mountain(r.state, { x: 1, y: 4 }), 'rook=', [G(r.state, 'r').x, G(r.state, 'r').y]);
  const s2 = R.copy(r.state); R.resetTurn(G(s2, 'r'));
  const r2 = R.submit(s2, 'r', { x: 1, y: 4 }, 'charge');
  console.log('第二次冲锋:', !!r2.effect, 'tile=', r2.state.tiles['1,4'], 'mountain=', R.mountain(r2.state, { x: 1, y: 4 }));
}

console.log('\n=== 马推动（horse-push）把敌人推撞完好山 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('h', 'horse', 0, 4), E('p', 'pawn', 2, 4)], { tiles: { '3,4': 'mountain' }, teamSp: 2 });
  s = R.purchaseUpgrade(s, 'h', 'horse-push');
  console.log('horsePush=', G(s, 'h').horsePush);
  const a = R.horseJumpAction(s, G(s, 'h'), { x: 1, y: 4 });
  console.log('jump action?', !!a);
  const r = R.submit(s, 'h', { x: 1, y: 4 }, 'horse-jump');
  console.log('effect?', !!r.effect, 'tile=', r.state.tiles['3,4'], 'mountain=', R.mountain(r.state, { x: 3, y: 4 }),
    'horseHp=', G(r.state, 'h').hp, 'pawn=', G(r.state, 'p') ? [G(r.state, 'p').x, G(r.state, 'p').y, G(r.state, 'p').hp] : 'dead',
    'pushes=', JSON.stringify(r.effect && r.effect.pushes));
}

console.log('\n=== 完整链条：马跳撞山(1) → 象牵引同山(2)＝碎石，目标存活停在山前 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('h', 'horse', 2, 1), P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4)], { tiles: { '2,4': 'mountain' }, teamSp: 1 });
  s = R.purchaseUpgrade(s, 'ele', 'elephant-pull-range'); // 4
  const jr = R.submit(s, 'h', { x: 2, y: 3 }, 'horse-jump');
  console.log('1次撞击后 tile=', jr.state.tiles['2,4'], 'ele 射程=', R.elephantPullRangeOf(G(jr.state, 'ele')));
  const pr = R.submit(jr.state, 'ele', { x: 5, y: 4 }, 'elephant-pull');
  console.log('牵引 effect?', !!pr.effect, 'status=', pr.effect && pr.effect.pull.status, 'moved=', pr.effect && pr.effect.pull.moved,
    'tile=', pr.state.tiles['2,4'], 'target=', [G(pr.state, 't').x, G(pr.state, 't').y, G(pr.state, 't').hp], 'stone=', R.mountain(pr.state, { x: 2, y: 4 }));
}
