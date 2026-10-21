// 一次性补充核对：用真实规则 API 模拟“正常入口”金币/公共SP 链路，验证 S15 修正后的正常流程前提是否可达。
// 仅为规则层模拟（非浏览器证据），不注入金币/SP/战局，不修改仓库业务代码。
const R = require('../web/js/rules.js');

function score(s) {
  const k = R.king(s, 'player');
  return !k || s.result === 'dead' ? -1e6
    : (s.phase === 'intermission' ? 10000 : 0) + k.hp * 1000 + s.kills * 45
      + s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 5 + 8, 0);
}
function choice(s) {
  const baseline = score(R.enemyTurn(s, true).state), king = R.king(s, 'player');
  let best;
  for (const u of s.units.filter(u => u.side === 'player'))
    for (const a of R.legalActions(s, u.id)) {
      if (u.id === king?.id && a.to && !R.inPalace('player', a.to)) continue;
      const r = a.type === 'directional' ? R.previewDirection(s, u.id, a.direction) : R.preview(s, u.id, a.to, a.type);
      if (!r || (s.turn < 11 && r.prediction.state.phase === 'intermission')) continue;
      const v = score(r.prediction.state);
      if (v > baseline && (!best || v > best.v)) best = { a, v };
    }
  return best?.a;
}

const log = [];
function playLevel(s) {
  const start = { level: s.level, turn: s.turn, gold: s.gold, teamSp: s.teamSp, kills: s.kills };
  for (let guard = 0; guard < 16; guard++) {
    if (s.phase !== 'player') break;
    for (let q = 0; q < 24; q++) {
      if (s.phase !== 'player') break;
      const a = choice(s);
      if (!a) break;
      const r = R.submitAction(s, a);
      if (r.state === s) break;
      s = r.state;
    }
    if (s.phase === 'player') s = R.endTurn(s).state;
  }
  log.push({ event: 'level-played', from: start, to: { level: s.level, turn: s.turn, gold: s.gold, teamSp: s.teamSp, kills: s.kills, phase: s.phase, result: s.result } });
  return s;
}

let s = R.newGame();
s = R.confirmDeployment(s);
s = R.chooseCommanderBuff(s, 'health');
const stage = [];
for (let level = 1; level <= 3; level++) {
  s = playLevel(s);
  stage.push({ level: s.level, phase: s.phase, gold: s.gold, teamSp: s.teamSp, kills: s.kills, result: s.result, advisors: s.party.filter(u => u.kind === 'advisor').length });
  if (s.phase !== 'intermission') break;
  if (s.party.filter(u => u.kind === 'advisor').length === 0 && s.gold >= 5) {
    const before = { gold: s.gold, teamSp: s.teamSp };
    const n = R.buy(s, 'advisor');
    if (n === s) { stage.push({ event: 'buy-advisor-failed', before }); break; }
    s = n;
    stage.push({ event: 'buy-advisor', goldBefore: before.gold, goldAfter: s.gold, partyAdvisors: s.party.filter(u => u.kind === 'advisor').length, activeAdvisors: s.activeIds.filter(id => s.party.find(u => u.id === id)?.kind === 'advisor').length });
  }
  if (s.level >= 3) break;
  const n = R.nextLevel(s);
  if (n === s) { stage.push({ event: 'next-level-failed', level: s.level }); break; }
  s = n;
  stage.push({ event: 'next-level', level: s.level, phase: s.phase, pending: (s.pendingAdvisorIds || []).slice(), towers: s.units.filter(u => u.side === 'player' && u.kind === 'advisor').map(u => [u.x, u.y]) });
  // 进入布阵后若已有仕，检查默认侧位与可交换
  const towers = s.units.filter(u => u.side === 'player' && u.kind === 'advisor');
  if (towers.length) {
    const right = R.CONFIG.advisorCells[1];
    const swapped = R.deploy(s, towers[0].id, right);
    stage.push({ event: 'advisor-swap-right', ok: swapped !== s, at: swapped !== s ? (() => { const t = swapped.units.find(u => u.id === towers[0].id); return [t.x, t.y]; })() : null });
    s = swapped !== s ? swapped : s;
  }
  if ((s.pendingAdvisorIds || []).length) { stage.push({ event: 'pending-advisor', pending: s.pendingAdvisorIds.slice() }); }
  s = R.confirmDeployment(s);
  if (s.phase !== 'commander') { stage.push({ event: 'confirm-failed', phase: s.phase, pending: (s.pendingAdvisorIds || []).slice() }); break; }
  s = R.chooseCommanderBuff(s, 'health');
  const tower = s.units.find(u => u.side === 'player' && u.kind === 'advisor');
  if (tower) {
    stage.push({ event: 'tower-board', pos: [tower.x, tower.y], hp: tower.hp, interval: tower.towerInterval, teamSp: s.teamSp });
    // 结束回合直到自然开火（不移动敌人）
    for (let t = 0; t < 8 && !Number.isInteger(s.units.find(u => u.id === tower.id)?.lastFireTurn); t++) {
      if (s.phase !== 'player') break;
      s = R.endTurn(s).state;
    }
    const t = s.units.find(u => u.id === tower.id);
    stage.push({ event: 'tower-fired', lastFireTurn: t && t.lastFireTurn || null, phase: s.phase, teamSp: s.teamSp, turn: s.turn });
    if (s.phase === 'player' && s.teamSp >= 3) {
      const before = { teamSp: s.teamSp, interval: t.towerInterval, hp: t.hp, maxHp: t.maxHp };
      const u2 = R.purchaseUpgrade(s, tower.id, 'advisor-interval');
      const t2 = u2.units.find(u => u.id === tower.id);
      stage.push({ event: 'upgrade-advisor', before, after: u2 === s ? null : { teamSp: u2.teamSp, interval: t2.towerInterval, hp: t2.hp, maxHp: t2.maxHp }, accepted: u2 !== s });
      if (u2 !== s) s = u2;
    } else {
      stage.push({ event: 'upgrade-not-attempted', phase: s.phase, teamSp: s.teamSp });
    }
  }
}
console.log(JSON.stringify({ stage, log }, null, 2));
