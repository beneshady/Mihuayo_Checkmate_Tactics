const R = require('../web/js/rules.js');
const U = (id, side, kind, x, y) => R.unit(id, side, kind, x, y);
const P = (id, k, x, y) => U(id, 'player', k, x, y);
const E = (id, k, x, y) => U(id, 'enemy', k, x, y);
function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
const s = R.emptyState([P('king', 'king', 4, 0), E('boss', 'king', 8, 8), P('h', 'horse', 0, 4), E('t', 'rook', 2, 4)]);
s.phase = 'player'; s.tiles = Object.assign(land(), { '3,4': 'mountain' }); s.teamSp = 2;
const s3 = R.purchaseUpgrade(s, 'h', 'horse-push');
console.log('horsePush=', s3.units.find(u => u.id === 'h').horsePush, 'sp=', s3.teamSp);
const jr = R.submit(s3, 'h', { x: 1, y: 4 }, 'horse-jump');
console.log('effect?', !!jr.effect, 'tile=', jr.state.tiles['3,4']);
console.log('units=', jr.state.units.map(u => u.id + '@' + u.x + ',' + u.y + ' hp' + u.hp + '/' + u.maxHp).join(' | '));
console.log('hits=', JSON.stringify(jr.effect && jr.effect.hits), 'pushes=', JSON.stringify(jr.effect && jr.effect.pushes), 'victims=', JSON.stringify(jr.effect && jr.effect.victims));
console.log('phase=', jr.state.phase, jr.state.result);
