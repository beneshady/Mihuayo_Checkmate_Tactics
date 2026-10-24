// 一次性补丁：改进自动游玩评估函数（更主动地削减威胁、靠近主帅护驾），并探测胜率。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const a = "function score(s) { const k = R.king(s, 'player'); if (!k || s.result === 'dead') return -1e6; return (s.phase === 'intermission' ? 10000 : 0) + s.kills * 45 + k.hp * 1000 + s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 5 + 8, 0); }";
const b = `function score(s) {
  const k = R.king(s, 'player');
  if (!k || s.result === 'dead') return -1e6;
  const enemyHp = s.units.filter(u => u.side === 'enemy').reduce((n, u) => n + u.hp * 12 + (u.kind === 'king' ? 40 : 0), 0);
  const threat = s.units.filter(u => u.side === 'enemy' && Math.max(Math.abs(u.x - k.x), Math.abs(u.y - k.y)) <= 2).length;
  const mine = s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 6 + 8, 0);
  return (s.phase === 'intermission' ? 10000 : 0) + s.kills * 45 + k.hp * 1400 + mine - enemyHp - threat * 220;
}`;
if (t.split(a).length - 1 !== 1) { console.error('score anchor missing'); process.exit(1); }
t = t.split(a).join(b);
fs.writeFileSync(p, t);
console.log('score patched');
