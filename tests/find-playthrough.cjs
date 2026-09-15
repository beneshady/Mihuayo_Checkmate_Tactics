// 通关验证：确定性 beam search 自动寻找完整通关动作序列（马/炮两购买分支）。
// 成功条件同时覆盖 GDD 8.2 要求：第一波升级、一次购买、购买队友实际参战、
// 第二波斩将、整局存在达到 Lv.3 的路径。
// 仅用于生成验收记录，不进入游戏本体。运行：node tests/find-playthrough.cjs
const R = require('../web/js/rules.js');
const fs = require('node:fs');
const path = require('node:path');

function score(s) {
  const r = s.units.find(u => u.id === 'rook'), k = R.king(s, 'player'), e = R.king(s, 'enemy');
  if (!k || !r || s.result === 'dead' || s.result === 'mate') return -1e6;
  return (s.wave - 1) * 220 + (s.phase === 'shop' ? 190 : 0) + (s.result === 'victory' ? 500 : 0) +
    s.kills * 18 + r.xp * 12 + k.hp * 25 - (e ? e.hp * 22 : 0) - s.turn * 3 -
    (e ? (Math.abs(r.x - e.x) + Math.abs(r.y - e.y)) * 2 : 0);
}

function find(branch) {
  let beam = [{ s: R.newGame(), log: [] }];
  const seen = new Set();
  for (let depth = 0; depth < 90; depth++) {
    const next = [];
    for (const { s, log } of beam) {
      if (s.result === 'victory' && s.highestLevel === 3 && log.some(a => a.actor === branch)) return log;
      if (s.phase === 'result') continue;
      if (s.phase === 'shop') {
        if (s.highestLevel < 2) continue; // 要求首波至少升级到 Lv.2 的路径
        next.push({ s: R.nextWave(R.buy(s, branch)), log: [...log, { buy: branch }] });
        continue;
      }
      const candidates = [];
      for (const u of s.units.filter(u => u.side === 'player' && !u.acted))
        for (const a of R.legalActions(s, u.id)) {
          const n = R.submit(s, u.id, a.to).state;
          candidates.push({ s: n, log: [...log, { actor: u.id, to: a.to }] });
        }
      candidates.push({ s: R.endTurn(s).state, log: [...log, { end: true }] });
      for (const c of candidates) {
        if (score(c.s) < -1e5) continue;
        const key = JSON.stringify([c.s.wave, c.s.phase, c.s.units, c.s.intents]);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(c);
      }
    }
    next.sort((a, b) => score(b.s) - score(a.s));
    beam = next.slice(0, 160);
    if (depth % 10 === 0) console.log(branch, 'depth', depth, 'beam', beam.length, 'best', beam[0] && score(beam[0].s));
    if (!beam.length) break;
  }
  throw new Error('未找到通关序列: ' + branch);
}

const outDir = path.join(__dirname, 'replays');
fs.mkdirSync(outDir, { recursive: true });
for (const branch of ['horse', 'cannon']) {
  const log = find(branch);
  const file = path.join(outDir, branch + '.json');
  fs.writeFileSync(file, JSON.stringify(log, null, 2) + '\n');
  const s = log.filter(x => !x.buy);
  console.log(branch, 'OK  steps:', log.length, '写入', file);
}
console.log('两个购买分支均存在完整通关路径（含首波升级与 Lv.3）。');
