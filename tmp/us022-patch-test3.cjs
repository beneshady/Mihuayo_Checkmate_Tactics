// 一次性补丁：修正 US-022 定向测试 E01/E11/E14/E15/E16 的夹具几何（实现不变）。
const fs = require('node:fs');
const p = 'tests/us022-elephant.test.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 160)); process.exit(1); }
  t = t.split(a).join(b);
}
// E01：初始队伍满员 → 先腾出一个部署位再买象
rep(
  "  const camp = mk([], { phase: 'intermission' });\n  camp.gold = 8; camp.party = R.copy(fresh.party); camp.activeIds = fresh.party.map(u => u.id);\n  const one = R.buy(camp, 'elephant');\n  assert.equal(one.gold, 3, '招募象扣 5 猫粮');\n  const ele = one.party.find(u => u.kind === 'elephant');\n  assert.ok(ele, '队伍中加入象');\n  assert.equal(ele.maxHp, 1, '未解锁坚守时象 1 HP');\n  assert.ok(one.activeIds.includes(ele.id), '有空余部署人口时新象默认上阵');",
  "  const camp = mk([], { phase: 'intermission' });\n  camp.gold = 8; camp.party = R.copy(fresh.party);\n  // 初始阵容满 4 人口：先腾出一个部署位\n  camp.activeIds = fresh.party.slice(0, 3).map(u => u.id);\n  camp.bench = fresh.party.slice(3).map(u => u.id);\n  const one = R.buy(camp, 'elephant');\n  assert.equal(one.gold, 3, '招募象扣 5 猫粮');\n  const ele = one.party.find(u => u.kind === 'elephant');\n  assert.ok(ele, '队伍中加入象');\n  assert.equal(ele.maxHp, 1, '未解锁坚守时象 1 HP');\n  assert.ok(one.activeIds.includes(ele.id), '有空余部署人口时新象默认上阵');"
);
// E11：occupied 返回 false 而非 undefined
rep(
  "assert.equal(R.occupied(after, { x: 1, y: 4 }), undefined, '碎石地不占位');",
  "assert.equal(!!R.occupied(after, { x: 1, y: 4 }), false, '碎石地不占位');"
);
// E14：敌方车的意图类型是 charge，只要求不是待机
rep(
  "    assert.equal(s.intents.find(i => i.actor === 't').type, 'attack', '前置：敌人原本有攻击意图');",
  "    assert.notEqual(s.intents.find(i => i.actor === 't').type, 'standby', '前置：敌人原本有攻击意图');"
);
// E15/E16 整体替换
const startE15 = t.indexOf("/* ---------------- E15 受伤解冻时序 ---------------- */");
const startE17 = t.indexOf("/* ---------------- E17 击杀归属 ---------------- */");
if (startE15 < 0 || startE17 < 0) { console.error('E15/E16 block not found'); process.exit(1); }
const newBlock = `/* ---------------- E15 受伤解冻时序 ---------------- */
test('E15 受伤清除冻结但本回合待机、下回合恢复；无伤位移不解冻；碰撞伤害同样解冻', () => {
  // A. 无伤位移不解冻：e1 冻结 t，e2 牵引另一个目标（无碰撞）
  let s = withFreeze(base([P('e1', 'elephant', 4, 4), P('e2', 'elephant', 8, 4), E('t', 'rook', 4, 6), E('tgt', 'rook', 6, 4)]), 'e1', 1);
  s = R.purchaseUpgrade(addSp(s, 2), 'e2', 'elephant-freeze-unlock');
  s.teamSp = 0;
  s.intents = []; R.prepareEnemy(s);
  const f = freeze(s, 'e1', 4, 6);
  assert.ok(f.effect, 'A. 冰封在 5×5 内');
  assert.equal(G(f.state, 't').frozen, 1);
  const moved = pull(f.state, 'e2', 6, 4);
  assert.ok(moved.effect, 'A. 第二只象牵引另一个目标');
  assert.equal(moved.effect.hits.length, 0, 'A. 无碰撞');
  assert.equal(G(moved.state, 't').frozen, 1, 'A. 无伤位移不解冻');
  assert.deepEqual([G(moved.state, 'tgt').x, G(moved.state, 'tgt').y], [7, 4], 'A. 另一个目标被拉近 1 格');
  // B. 碰撞受伤解冻：另一只象把已冻结目标拉向山
  let s2 = base([P('e1', 'elephant', 5, 6), P('e2', 'elephant', 0, 4), E('t', 'rook', 5, 4)], { tiles: { '3,4': 'mountain' } });
  s2 = withFreeze(s2, 'e1', 1);
  s2 = R.purchaseUpgrade(addSp(s2, 2), 'e2', 'elephant-freeze-unlock');
  s2 = withRange(s2, 'e2', 5);
  s2.teamSp = 0;
  s2.intents = []; R.prepareEnemy(s2);
  const fr = freeze(s2, 'e1', 5, 4);
  assert.ok(fr.effect, 'B. 冰封成功');
  assert.equal(G(fr.state, 't').frozen, 1);
  const pulled = pull(fr.state, 'e2', 5, 4);
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
  // C. 受伤发生在敌方阶段（仕开火先于敌攻）：该阶段后续不能恢复行动，也不吞掉下一回合
  let s3 = mk([P('king', 'king', 4, 0), P('tower', 'advisor', 4, 2), P('e1', 'elephant', 6, 4), E('t', 'rook', 4, 3), E('boss', 'king', 8, 8)]);
  s3 = withFreeze(s3, 'e1', 1);
  s3.intents = []; R.prepareEnemy(s3);
  const plan = R.advisorPlan(s3);
  assert.equal(plan[0].willFire, true, 'C. 仕就绪且有射程内敌人');
  const fc = freeze(s3, 'e1', 4, 3);
  assert.ok(fc.effect, 'C. 冰封相邻敌人');
  const out = R.enemyTurn(fc.state);
  const towerEff = out.effects.find(e => e.actor === 'tower');
  assert.equal(towerEff.status, 'hit', 'C. 仕阶段先命中已冻结目标');
  assert.equal(G(out.state, 't').hp, 1, 'C. 目标实际受伤');
  assert.equal(G(out.state, 't').frozen, 0, 'C. 受伤清除剩余冻结');
  assert.equal(out.effects.find(e => e.actor === 't').status, 'standby', 'C. 敌方阶段该单位仍待机，不恢复行动');
  assert.equal(G(out.state, 'king').hp, 3, 'C. 该阶段不攻击');
  assert.equal(G(out.state, 't').thawStandby, false, 'C. 阶段结束清除待机');
  R.prepareEnemy(out.state);
  assert.notEqual(out.state.intents.find(i => i.actor === 't').type, 'standby', 'C. 下回合恢复（不额外吞回合）');
});

/* ---------------- E16 重复冰封 ---------------- */
test('E16 重复冰封取 max 不叠加不缩短；受伤解冻后同回合另一只象再冻给完整时长', () => {
  let s = base([P('a', 'elephant', 4, 4), P('b', 'elephant', 6, 4), E('t', 'rook', 5, 4)]);
  s = withFreeze(s, 'a', 1);
  s = R.purchaseUpgrade(addSp(s, 4), 'b', 'elephant-freeze-unlock');
  s = R.purchaseUpgrade(addSp(s, 4), 'b', 'elephant-freeze-duration');
  s = R.purchaseUpgrade(addSp(s, 4), 'b', 'elephant-freeze-duration');
  s.teamSp = 0;
  assert.equal(R.elephantFreezeDurationOf(G(s, 'b')), 3, '第二只象冻结 3 阶段');
  const f1 = freeze(s, 'a', 5, 4);
  assert.ok(f1.effect, 'a 冰封');
  assert.equal(G(f1.state, 't').frozen, 1);
  const f2 = freeze(f1.state, 'b', 5, 4);
  assert.ok(f2.effect, 'b 再次冰封同一敌人');
  assert.equal(G(f2.state, 't').frozen, 3, '取较大值，不叠加');
  assert.equal(f2.effect.freeze.before, 1);
  assert.equal(f2.effect.freeze.after, 3);
  // 剩余 3 时再冻 1 阶段不缩短
  let s2 = base([P('a', 'elephant', 4, 4), P('b', 'elephant', 6, 4), E('t', 'rook', 5, 4)]);
  s2 = withFreeze(s2, 'a', 3);
  s2 = R.purchaseUpgrade(addSp(s2, 2), 'b', 'elephant-freeze-unlock');
  s2.teamSp = 0;
  const g1 = freeze(s2, 'a', 5, 4);
  assert.equal(G(g1.state, 't').frozen, 3);
  const g2 = freeze(g1.state, 'b', 5, 4);
  assert.equal(G(g2.state, 't').frozen, 3, '较短时长不缩短剩余冻结');
  assert.equal(G(g2.state, 'a').elephantSkillUsed, true);
  assert.equal(G(g2.state, 'b').elephantSkillUsed, true);
  // 受伤解冻后同回合另一只象再冻：完整本次时长
  let s3 = base([P('a', 'elephant', 5, 6), P('b', 'elephant', 0, 4), E('t', 'rook', 5, 4)], { tiles: { '3,4': 'mountain' } });
  s3 = withFreeze(s3, 'a', 1);
  s3 = R.purchaseUpgrade(addSp(s3, 4), 'b', 'elephant-freeze-unlock');
  s3 = withRange(s3, 'b', 5);
  s3.teamSp = 0;
  const fa = freeze(s3, 'a', 5, 4);
  assert.ok(fa.effect);
  assert.equal(G(fa.state, 't').frozen, 1);
  const hit = pull(fa.state, 'b', 5, 4);
  assert.equal(G(hit.state, 't').frozen, 0, '受伤先解冻');
  assert.equal(G(hit.state, 't').thawStandby, true);
  const refreeze = freeze(hit.state, 'a', 5, 4);
  assert.ok(refreeze.effect, '同回合另一只象可重新冰封');
  assert.equal(G(refreeze.state, 't').frozen, 1, '赋予完整本次时长（a 为 1 阶段）');
  assert.equal(G(refreeze.state, 'a').elephantSkillUsed, true, '消耗该象技能机会');
  assert.equal(G(refreeze.state, 'b').elephantSkillUsed, true, 'b 本回合已用于牵引');
});

`;
t = t.slice(0, startE15) + newBlock + t.slice(startE17);
fs.writeFileSync(p, t);
console.log('patched us022 tests (E01/E11/E14/E15/E16)');
