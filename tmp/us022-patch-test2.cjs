// 一次性补丁：修正 US-022 定向测试中自建的夹具几何/引用比较问题（实现不变）。
const fs = require('node:fs');
const p = 'tests/us022-elephant.test.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 140)); process.exit(1); }
  t = t.split(a).join(b);
}
// E01：营地夹具补齐 activeIds，才能测试满员后备
rep(
  "const camp = mk([], { phase: 'intermission' });\n  camp.gold = 8; camp.party = R.copy(fresh.party);",
  "const camp = mk([], { phase: 'intermission' });\n  camp.gold = 8; camp.party = R.copy(fresh.party); camp.activeIds = fresh.party.map(u => u.id);"
);
rep(
  "const two = R.buy(addSp(one, 0).gold === undefined ? one : Object.assign(R.copy(one), { gold: 10 }), 'elephant');",
  "const two = R.buy(Object.assign(R.copy(one), { gold: 10 }), 'elephant');"
);
// E12：同一引用比较（避免两次 addSp 生成不同对象）
rep(
  "  assert.strictEqual(R.purchaseUpgrade(addSp(up, 4), 'e1', 'elephant-freeze-duration'), addSp(up, 4), '已达上限不再扣费');\n  const beforeMax = addSp(up, 4);\n  assert.strictEqual(R.purchaseUpgrade(beforeMax, 'e1', 'elephant-freeze-duration'), beforeMax, '上限时返回同一状态');",
  "  const beforeMax = addSp(up, 4);\n  assert.strictEqual(R.purchaseUpgrade(beforeMax, 'e1', 'elephant-freeze-duration'), beforeMax, '已达上限不再扣费且返回同一状态');"
);
// E04：目标放在移动后仍在 5×5 内、且不挡田字象眼的位置
rep(
  "let s = withFreeze(base([P('ele', 'elephant', 4, 4), E('foe', 'rook', 3, 3)]), 'ele', 1);",
  "let s = withFreeze(base([P('ele', 'elephant', 4, 4), E('foe', 'rook', 1, 3)]), 'ele', 1);"
);
rep(
  "const frozen = freeze(moved.state, 'ele', 3, 3);",
  "const frozen = freeze(moved.state, 'ele', 1, 3);"
);
rep(
  "assert.equal(pull(frozen.state, 'ele', 3, 3).effect, undefined, '本回合技能已用，不能再牵引');",
  "assert.equal(pull(frozen.state, 'ele', 1, 3).effect, undefined, '本回合技能已用，不能再牵引');"
);
// E06：阻挡兵 1 HP 直接阵亡
rep(
  "assert.equal(G(r.state, 'blk').hp, 0, '阻挡兵 1 HP 阵亡（双方各 −1）');",
  "assert.equal(G(r.state, 'blk'), undefined, '阻挡兵 1 HP 阵亡（双方各 −1）');"
);
// E09/E10：水格需要在位移实际经过的格子上（距离 5 → 2 步）
rep(
  "let s4 = withRange(base([P('ele', 'elephant', 0, 4)], { tiles: { '2,4': 'water' } }), 'ele', 5);",
  "let s4 = withRange(base([P('ele', 'elephant', 0, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);"
);
rep(
  "const sp = withRange(base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 5, 4)], { tiles: { '2,4': 'water' } }), 'ele', 5);",
  "const sp = withRange(base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 5, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);"
);
rep(
  "const sk = withRange(base([P('ele', 'elephant', 0, 4), P('k2', 'king', 5, 4)], { tiles: { '2,4': 'water' } }), 'ele', 5);",
  "const sk = withRange(base([P('ele', 'elephant', 0, 4), P('k2', 'king', 5, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);"
);
rep(
  "const sr = withRange(base([P('ele', 'elephant', 0, 4), E('r', 'rook', 5, 4)], { tiles: { '2,4': 'water' } }), 'ele', 5);",
  "const sr = withRange(base([P('ele', 'elephant', 0, 4), E('r', 'rook', 5, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);"
);
rep(
  "const sb = withRange(base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 5, 4)], { tiles: { '2,4': 'bridge' } }), 'ele', 5);",
  "const sb = withRange(base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 5, 4)], { tiles: { '3,4': 'bridge' } }), 'ele', 5);"
);
// E11：第二次撞击用同一象下一回合（目标仍在山前），并保留已开裂山的分支
rep(
  "  // 第二只象再撞一次 → 碎石地\n  let s2 = R.copy(r1.state);\n  R.resetTurn(G(s2, 'ele'));\n  R.resetTurn(G(s2, 't'));\n  s2.units.push(P('ele2', 'elephant', 0, 2));\n  const r2 = pull(s2, 'ele2', 0, 4);\n  assert.equal(r2.state.tiles['1,4'], 'rubble', '累计两次撞击变碎石地');\n  assert.equal(r2.effect.mountains[0].before, 'cracked');",
  "  // 同一象下一回合再撞一次（目标仍停在山前）→ 碎石地\n  let s2 = R.copy(r1.state);\n  R.resetTurn(G(s2, 'ele'));\n  R.resetTurn(G(s2, 't'));\n  const r2 = pull(s2, 'ele', 2, 4);\n  assert.equal(r2.state.tiles['1,4'], 'rubble', '累计两次撞击变碎石地');\n  assert.equal(r2.effect.mountains[0].before, 'cracked');"
);
// E13：5×5 含斜向 2 格，(6,6) 属于范围内
rep(
  "  for (const p of [{ x: 7, y: 4 }, { x: 4, y: 7 }, { x: 6, y: 7 }, { x: 1, y: 4 }, { x: 6, y: 6 }]) {",
  "  for (const p of [{ x: 7, y: 4 }, { x: 4, y: 7 }, { x: 6, y: 7 }, { x: 1, y: 4 }, { x: 7, y: 6 }, { x: 6, y: 7 }]) {"
);
// E17：主将撞山/活体致死与终局
rep(
  "  // 敌将死亡 → 胜负结算优先\n  const boss = mk([P('king', 'king', 0, 0), P('ele', 'elephant', 0, 4), E('boss', 'king', 2, 4)]);\n  const rb = pull(boss, 'ele', 2, 4);\n  assert.equal(rb.effect.pull.status, 'collision-live', '主将被拉撞施法象旁的单位？见下');\n  assert.equal(rb.effect.hits.some(h => h.id === 'boss'), true, '敌将受伤');",
  "  // 敌将死亡 → 胜负结算优先\n  const boss = mk([P('king', 'king', 0, 0), P('ele', 'elephant', 0, 4), P('wall', 'rook', 1, 4), E('boss', 'king', 2, 4)]);\n  G(boss, 'boss').hp = 1;\n  const rb = pull(boss, 'ele', 2, 4);\n  assert.equal(rb.effect.pull.status, 'collision-live', '敌将被拉撞我方单位');\n  assert.equal(rb.effect.hits.some(h => h.id === 'boss'), true, '敌将受伤');\n  assert.equal(rb.state.phase, 'intermission', '敌将阵亡触发胜利结算');\n  assert.equal(rb.state.result, 'victory');\n  assert.equal(G(rb.state, 'ele').kills, 1, '击杀归属施法象');"
);
fs.writeFileSync(p, t);
console.log('patched us022 tests');
