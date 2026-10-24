// 探针 3：调试车冲锋第二次、马推动撞山分支。
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
console.log('=== 车冲锋第二次调试 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('r', 'rook', 0, 4)], { tiles: { '1,4': 'mountain' }, teamSp: 2 });
  s = R.purchaseUpgrade(s, 'r', 'rook-charge-role');
  const r = R.submit(s, 'r', { x: 1, y: 4 }, 'charge');
  const s2 = R.copy(r.state);
  const rook = G(s2, 'r');
  console.log('charge后:', 'role=', rook.rookRole, 'chargeAvail=', rook.rookChargeAvailable, 'moveAvail=', rook.rookMoveAvailable, 'ap=', rook.ap, 'phase=', s2.phase);
  R.resetTurn(rook);
  console.log('reset后:', 'chargeAvail=', rook.rookChargeAvailable, 'moveAvail=', rook.rookMoveAvailable, 'ap=', rook.ap);
  const a2 = R.actionAt(s2, rook, { x: 1, y: 4 }, 'charge');
  console.log('actionAt=', a2 && { type: a2.type, path: a2.path.length });
  const sub = R.submit(s2, 'r', { x: 1, y: 4 }, 'charge');
  console.log('submit effect?', !!sub.effect, 'tile=', sub.state.tiles['1,4']);
}
console.log('\n=== 马推动调试 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('h', 'horse', 0, 4), E('p', 'pawn', 2, 4)], { tiles: { '3,4': 'mountain' }, teamSp: 2 });
  s = R.purchaseUpgrade(s, 'h', 'horse-push');
  const r = R.submit(s, 'h', { x: 1, y: 4 }, 'horse-jump');
  console.log('tiles=', JSON.stringify(r.state.tiles['3,4']), 'effect=', JSON.stringify({ pushes: r.effect && r.effect.pushes, hits: r.effect && r.effect.hits, mountains: r.effect && r.effect.mountains }));
  console.log('units=', r.state.units.map(u => u.id + '@' + u.x + ',' + u.y + ' hp' + u.hp).join(' | '));
  console.log('corpses=', JSON.stringify((r.state.corpses || []).map(c => c.unit.id + '@' + c.x + ',' + c.y)));
}
console.log('\n=== 马推动：目标 2HP 车（存活）撞山 ===');
{
  let s = mk([P('king', 'king', 4, 0), P('h', 'horse', 0, 4), E('t', 'rook', 2, 4)], { tiles: { '3,4': 'mountain' }, teamSp: 2 });
  s = R.purchaseUpgrade(s, 'h', 'horse-push');
  const r = R.submit(s, 'h', { x: 1, y: 4 }, 'horse-jump');
  console.log('tile=', r.state.tiles['3,4'], 'mountain=', R.mountain(r.state, { x: 3, y: 4 }),
    'units=', r.state.units.map(u => u.id + '@' + u.x + ',' + u.y + ' hp' + u.hp).join(' | '),
    'pushes=', JSON.stringify(r.effect && r.effect.pushes));
}
