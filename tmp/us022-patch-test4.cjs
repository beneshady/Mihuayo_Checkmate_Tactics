// 一次性补丁：修正 E12/E14/E15/E16 夹具（实现不变）。
const fs = require('node:fs');
const p = 'tests/us022-elephant.test.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 160)); process.exit(1); }
  t = t.split(a).join(b);
}
// E12：s 已解锁，直接复制
rep(
  "  const mid = withFreeze(s, 'e1', 1);",
  "  const mid = R.copy(s);"
);
// E14：用真正有攻击意图的敌人（相邻兵），避免 prepareEnemy 提前移动目标
rep(
  "  function setup(duration) {\n    let s = mk([P('king', 'king', 4, 0), P('ele', 'elephant', 4, 2), E('t', 'rook', 4, 4), E('boss', 'king', 8, 8)]);\n    s = withFreeze(s, 'ele', duration);\n    assert.equal(R.elephantFreezeDurationOf(G(s, 'ele')), duration, '前置：象冻结时长 ' + duration);\n    s.intents = [];\n    R.prepareEnemy(s);\n    assert.notEqual(s.intents.find(i => i.actor === 't').type, 'standby', '前置：敌人原本有攻击意图');\n    return s;\n  }",
  "  function setup(duration) {\n    let s = mk([P('king', 'king', 4, 0), P('ele', 'elephant', 4, 3), E('t', 'pawn', 4, 1), E('boss', 'king', 8, 8)]);\n    s = withFreeze(s, 'ele', duration);\n    assert.equal(R.elephantFreezeDurationOf(G(s, 'ele')), duration, '前置：象冻结时长 ' + duration);\n    s.intents = [];\n    R.prepareEnemy(s);\n    const intent = s.intents.find(i => i.actor === 't');\n    assert.notEqual(intent.type, 'standby', '前置：敌人原本有攻击意图');\n    assert.deepEqual([G(s, 't').x, G(s, 't').y], [4, 1], '前置：有攻击时不提前移动');\n    return s;\n  }"
);
rep(
  "    const r = freeze(s, 'ele', 4, 4);\n    assert.ok(r.effect, '冻结提交');\n    assert.equal(G(r.state, 't').frozen, duration, `冻结 ${duration} 阶段`);",
  "    const r = freeze(s, 'ele', 4, 1);\n    assert.ok(r.effect, '冻结提交');\n    assert.equal(G(r.state, 't').frozen, duration, `冻结 ${duration} 阶段`);"
);
// E15 B：用相邻敌车（有 charge 攻击意图）作为被牵引目标，象与山同列
const e15Start = t.indexOf("  // B. 碰撞受伤解冻：另一只象把已冻结目标拉向山");
const e15End = t.indexOf("  // C. 受伤发生在敌方阶段");
if (e15Start < 0 || e15End < 0) { console.error('E15 B block not found'); process.exit(1); }
t = t.slice(0, e15Start) + `  // B. 碰撞受伤解冻：另一只象把已冻结目标拉向山
  let s2 = base([P('e1', 'elephant', 4, 3), P('e2', 'elephant', 4, 5), E('t', 'rook', 4, 1)], { tiles: { '4,2': 'mountain' } });
  s2 = withFreeze(s2, 'e1', 1);
  s2 = R.purchaseUpgrade(addSp(s2, 2), 'e2', 'elephant-freeze-unlock');
  s2 = withRange(s2, 'e2', 5);
  s2.teamSp = 0;
  s2.intents = []; R.prepareEnemy(s2);
  assert.notEqual(s2.intents.find(i => i.actor === 't').type, 'standby', 'B. 前置：目标原本有攻击意图');
  const fr = freeze(s2, 'e1', 4, 1);
  assert.ok(fr.effect, 'B. 冰封成功');
  assert.equal(G(fr.state, 't').frozen, 1);
  const pulled = pull(fr.state, 'e2', 4, 1);
  assert.ok(pulled.effect, 'B. 另一只象牵引已冻结目标撞山');
  assert.equal(G(pulled.state, 't').hp, 1, 'B. 碰撞伤害 1（无额外碎冰伤害）');
  assert.equal(G(pulled.state, 't').frozen, 0, 'B. 碰撞受伤清除剩余冻结');
  assert.equal(G(pulled.state, 't').thawStandby, true, 'B. 受伤解冻但本回合待机');
  const phase = R.enemyTurn(pulled.state);
  assert.equal(phase.effects.find(e => e.actor === 't').status, 'standby', 'B. 解冻当回合仍待机');
  assert.equal(G(phase.state, 'king').hp, 3, 'B. 该阶段不攻击');
  assert.equal(G(phase.state, 't').thawStandby, false, 'B. 阶段结束清除解冻待机');
  assert.equal(phase.state.turn, 1, 'B. 不额外吞掉整回合');
  R.prepareEnemy(phase.state);
  assert.notEqual(phase.state.intents.find(i => i.actor === 't').type, 'standby', 'B. 下回合恢复正常新意图');
` + t.slice(e15End);
// E15 C：仕开火先于敌攻，受伤发生在敌方阶段
rep(
  "  let s3 = mk([P('king', 'king', 4, 0), P('tower', 'advisor', 4, 2), P('e1', 'elephant', 6, 4), E('t', 'rook', 4, 3), E('boss', 'king', 8, 8)]);",
  "  let s3 = mk([P('king', 'king', 4, 0), P('tower', 'advisor', 4, 2), P('e1', 'elephant', 5, 4), E('t', 'spearman', 4, 3), E('boss', 'king', 8, 8)]);"
);
rep(
  "  const towerEff = out.effects.find(e => e.actor === 'tower');\n  assert.equal(towerEff.status, 'hit', 'C. 仕阶段先命中已冻结目标');\n  assert.equal(G(out.state, 't').hp, 1, 'C. 目标实际受伤');",
  "  const towerEff = out.effects.find(e => e.actor === 'tower');\n  assert.equal(towerEff.status, 'hit', 'C. 仕阶段先命中已冻结目标');\n  assert.equal(G(out.state, 't').hp, 1, 'C. 目标实际受伤（枪兵 2 HP→1）');"
);
// E16：牵引后目标位置变为 (4,4)，重新冰封目标格同步
rep(
  "  const refreeze = freeze(hit.state, 'a', 5, 4);",
  "  assert.deepEqual([G(hit.state, 't').x, G(hit.state, 't').y], [4, 4], '受伤后目标停在碰撞前');\n  const refreeze = freeze(hit.state, 'a', 4, 4);"
);
fs.writeFileSync(p, t);
console.log('patched E12/E14/E15/E16 fixtures');
