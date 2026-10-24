// US-022 R2 精准补验（规则层）：Codex 首轮审阅列出的缺口 1（E15 无伤位移与时序）与
// 缺口 2（E11 跨技能真实累计撞山）。独立文件，不修改、不替代首轮 tests/us022-elephant.test.cjs 的证据。
// 全部使用真实规则入口（R.submit / R.purchaseUpgrade / R.horseJumpAction / R.enemyTurn 等），
// 夹具只用于摆放初始局面，动作一律经引擎结算。
const test = require('node:test');
const assert = require('node:assert/strict');
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
// 带敌方主帅的底局面：避免中途误触发胜利结算
const base = (units, opts) => mk([P('king', 'king', 4, 0), E('boss', 'king', 8, 8)].concat(units || []), opts);
function addSp(s, sp) { const n = R.copy(s); n.teamSp = sp; return n; }
function up(s, id, skill, times) {
  let n = R.copy(s);
  const count = times === undefined ? 1 : times;
  for (let i = 0; i < count; i++) n = R.purchaseUpgrade(n, id, skill);
  return n;
}
// 用真实升级入口配置象：冰封解锁/时长、牵引射程
function prepare(s, cfg) {
  let n = R.copy(s);
  if (cfg.freezeBy) {
    n = addSp(n, 30);
    n = up(n, cfg.freezeBy, 'elephant-freeze-unlock');
    n = up(n, cfg.freezeBy, 'elephant-freeze-duration', (cfg.duration || 1) - 1);
  }
  (cfg.range || []).forEach(([id, to]) => { n = addSp(n, 30); n = up(n, id, 'elephant-pull-range', to - 3); });
  (cfg.role || []).forEach(([id, skill]) => { n = addSp(n, 30); n = up(n, id, skill); });
  n.teamSp = cfg.sp === undefined ? 0 : cfg.sp;
  return n;
}
const pull = (s, id, x, y) => R.submit(s, id, { x: x, y: y }, 'elephant-pull');
const freeze = (s, id, x, y) => R.submit(s, id, { x: x, y: y }, 'elephant-freeze');
const move = (s, id, x, y) => R.submit(s, id, { x: x, y: y });

/* ================= 缺口 1：E15 无伤位移与时序 ================= */

test('E15-R2-A 实际牵引已冻结目标且不碰撞：位移、HP 不变、冻结时长不变、后续阶段仍跳过行动', () => {
  // 象 e1 在 (4,3) 冻结 (4,1) 的敌兵（5×5 内、原本对主帅有攻击意图）；
  // 象 e2 在 (0,1) 同线距离 4（射程经真实升级 3→4），把“已冻结的目标本体”拉近 2 格且路径无碰撞。
  let s = base([P('e1', 'elephant', 4, 3), P('e2', 'elephant', 0, 1), E('t', 'pawn', 4, 1)]);
  s = prepare(s, { freezeBy: 'e1', duration: 1, range: [['e2', 4]] });
  s.intents = []; R.prepareEnemy(s);
  const intent0 = s.intents.find(i => i.actor === 't');
  assert.ok(intent0 && intent0.type !== 'standby', '前置：目标原本有攻击意图（冻结后应被跳过）');
  const kingHp0 = G(s, 'king').hp;
  const hp0 = G(s, 't').hp;
  const f = freeze(s, 'e1', 4, 1);
  assert.ok(f.effect, '冰封提交成功');
  assert.equal(G(f.state, 't').frozen, 1, '前置：冻结 1 个敌方行动阶段');
  const pr = pull(f.state, 'e2', 4, 1);
  assert.ok(pr.effect, '第二只象实际牵引“已冻结的目标本体”');
  assert.equal(pr.effect.pull.status, 'success', '路径无碰撞');
  assert.equal(pr.effect.pull.moved, 2, '实际距离 4 → 位移 floor(4/2)=2 格');
  assert.equal(pr.effect.hits.length, 0, '无伤位移：没有任何伤害记录');
  assert.equal(pr.effect.pull.targetId, 't', '被牵引的正是已冻结目标');
  assert.deepEqual([G(pr.state, 't').x, G(pr.state, 't').y], [2, 1], '目标位置实际发生 2 格变化');
  assert.equal(G(pr.state, 't').hp, hp0, 'HP 不变（无伤）');
  assert.equal(G(pr.state, 't').frozen, 1, '无伤位移不解冻：冻结时长仍为 1');
  assert.equal(G(pr.state, 't').thawStandby, false, '无伤位移不产生解冻待机');
  assert.equal(G(pr.state, 'e2').elephantSkillUsed, true, '牵引消耗第二只象的技能机会');
  // 该敌方阶段：已冻结目标仍跳过行动，不移动、不攻击
  const out = R.enemyTurn(pr.state);
  const eff = out.effects.find(e => e.actor === 't');
  assert.equal(eff.status, 'standby', '无伤位移后该阶段仍待机');
  assert.equal(eff.frozen, true, '待机原因是被冻结（不是普通无目标待机）');
  assert.equal(eff.hits.length, 0, '该阶段不攻击');
  assert.deepEqual([G(out.state, 't').x, G(out.state, 't').y], [2, 1], '冻结阶段不移动');
  assert.equal(G(out.state, 'king').hp, kingHp0, '该阶段主帅不掉血');
  assert.equal(G(out.state, 't').frozen, 0, '阶段结束递减到 0（到期解除）');
  assert.equal(R.frozenSkip(G(out.state, 't')), false, '到期后不再是被冻结/待机状态');
  // 下一阶段恢复正常行动：不额外吞掉一整回合
  R.prepareEnemy(out.state);
  const nextIntent = out.state.intents.find(i => i.actor === 't');
  assert.notEqual(nextIntent.frozen, true, '下回合生成正常新意图，不再冻结待机');
  const out2 = R.enemyTurn(out.state);
  const eff2 = out2.effects.find(e => e.actor === 't');
  assert.notEqual(eff2.frozen, true, '下一阶段不再按冻结跳过（没有多吞回合）');
});

test('E15-R2-B 剩余 2/3 阶段受伤全部清零：碰撞受伤后本回合待机、下回合恢复、不少跳也不多跳', () => {
  for (const remaining of [2, 3]) {
    // e1 冻结 (0,1) 的敌车（2 HP）；e2 把该目标拉向 (0,2) 的山 → 碰撞 1 伤（非致命）
    // 主帅放在 (0,0)：敌车对主帅有攻击意图，避免 prepareEnemy 在冻结前先把它当“无攻击”移动走。
    let s = mk([P('king', 'king', 0, 0), E('boss', 'king', 8, 8),
      P('e1', 'elephant', 0, 3), P('e2', 'elephant', 0, 4), E('t', 'rook', 0, 1)], { tiles: { '0,2': 'mountain' } });
    s = prepare(s, { freezeBy: 'e1', duration: remaining, range: [['e2', 3]] });
    s.intents = []; R.prepareEnemy(s);
    assert.notEqual(s.intents.find(i => i.actor === 't').type, 'standby', '前置：目标原本有攻击意图');
    assert.deepEqual([G(s, 't').x, G(s, 't').y], [0, 1], '前置：目标仍在 (1,1)');
    const f = freeze(s, 'e1', 0, 1);
    assert.ok(f.effect, '冰封提交');
    assert.equal(G(f.state, 't').frozen, remaining, `前置：剩余 ${remaining} 阶段`);
    assert.equal(R.elephantFreezeDurationOf(G(f.state, 'e1')), remaining, '前置：本次冻结时长');
    const pr = pull(f.state, 'e2', 0, 1);
    assert.ok(pr.effect, '牵引已冻结目标撞山');
    assert.equal(pr.effect.pull.status, 'collision-mountain', '发生碰撞（不是无伤位移）');
    assert.equal(G(pr.state, 't').hp, 1, '碰撞 1 伤且目标存活（无额外碎冰伤害）');
    assert.equal(G(pr.state, 't').frozen, 0, `剩余 ${remaining} 阶段全部清零`);
    assert.equal(G(pr.state, 't').thawStandby, true, '受伤解冻但本回合待机');
    // 本回合敌方阶段：待机（1 个阶段，而不是剩余阶段数）
    const p1 = R.enemyTurn(pr.state);
    const e1eff = p1.effects.find(e => e.actor === 't');
    assert.equal(e1eff.status, 'standby', '受伤解冻当阶段仍待机');
    assert.equal(G(p1.state, 'king').hp, 3, '该阶段不攻击（主帅不掉血）');
    assert.equal(G(p1.state, 't').thawStandby, false, '阶段结束清除解冻待机标志');
    // 下一回合：正常行动，不额外吞掉整回合
    R.prepareEnemy(p1.state);
    assert.equal(R.frozenSkip(G(p1.state, 't')), false, '下回合不再被跳过');
    const p2 = R.enemyTurn(p1.state);
    const e2eff = p2.effects.find(e => e.actor === 't');
    assert.notEqual(e2eff.frozen, true, `剩余 ${remaining} 阶段受伤后下回合恢复（只待机 1 个阶段）`);
  }
});

test('E15-R2-C 敌方阶段目标行动“前”受伤（仕阶段先开火）：清剩余阶段、该阶段仍待机、不吞下一回合', () => {
  // 仕 (4,2) 相邻 (4,3) 的敌枪兵；枪兵剩余 2 阶段冻结时被仕先手打掉 1 HP（2→1，存活）
  let s = base([P('tower', 'advisor', 4, 2), P('e1', 'elephant', 5, 4), E('t', 'spearman', 4, 3)]);
  s = prepare(s, { freezeBy: 'e1', duration: 2 });
  s.intents = []; R.prepareEnemy(s);
  const plan = R.advisorPlan(s);
  assert.equal(plan[0].willFire, true, '前置：仕就绪且有射程内敌人');
  const f = freeze(s, 'e1', 4, 3);
  assert.ok(f.effect, '冰封提交');
  assert.equal(G(f.state, 't').frozen, 2, '前置：剩余 2 阶段');
  const out = R.enemyTurn(f.state);
  // 效果顺序：仕阶段先于敌方行动槽（受伤发生在目标行动前）
  const idxTower = out.effects.findIndex(e => e.actor === 'tower');
  const idxT = out.effects.findIndex(e => e.actor === 't');
  assert.ok(idxTower >= 0 && idxT >= 0 && idxTower < idxT, '受伤（仕开火）发生在该目标行动槽之前');
  assert.equal(out.effects[idxTower].status, 'hit', '仕命中已冻结目标');
  assert.equal(G(out.state, 't').hp, 1, '目标实际受伤（枪兵 2→1）');
  assert.equal(G(out.state, 't').frozen, 0, '受伤清除全部剩余 2 阶段');
  assert.equal(out.effects[idxT].status, 'standby', '该敌方阶段仍待机，不恢复行动');
  assert.equal(G(out.state, 'king').hp, 3, '该阶段不攻击');
  assert.equal(G(out.state, 't').thawStandby, false, '阶段结束清除待机');
  // 下一回合正常：不额外吞回合
  R.prepareEnemy(out.state);
  assert.equal(R.frozenSkip(G(out.state, 't')), false, '下回合不再被跳过');
  const out2 = R.enemyTurn(out.state);
  assert.notEqual(out2.effects.find(e => e.actor === 't').frozen, true, '下阶段恢复正常（没有多吞回合）');
});

test('E15-R2-D 敌方阶段目标行动“后”受伤：现有规则下不可达（给出证据与理由，不伪造覆盖）', () => {
  // 结论：敌方行动槽开始后，本引擎没有任何能伤到敌方单位的来源，因此“目标行动槽之后受伤”不可构造。
  // 依据 1：敌方阶段内的玩家方伤害只有仕阶段（advisorPhase），而 enemyTurn 恒为“仕 → 敌攻”；
  // 依据 2：敌方攻击不能命中同阵营（ordinary 拒绝同阵营目标），敌方无推动/冲锋连锁（rookPush 为 false）；
  // 依据 3：generateIntents 只会把敌方意图指向玩家单位，不会指向敌方单位。
  // ---- 依据 1（行为）：仕阶段效果恒排在敌方行动槽之前，故玩家方伤害只能落在“目标行动前”
  // 仕 (4,2) 邻格 (4,3) 放一个已冻结敌人，验证仕命中效果的下标小于该敌人在敌攻阶段的下标
  const sA = mk([P('king', 'king', 4, 0), P('tower', 'advisor', 4, 2), E('boss', 'king', 8, 8)]);
  const frz = U('t', 'enemy', 'spearman', 4, 3);
  frz.frozen = 2;
  sA.units.push(frz);
  sA.intents = []; R.prepareEnemy(sA);
  const turnA = R.enemyTurn(sA);
  const iTower = turnA.effects.findIndex(e => e.actor === 'tower');
  const iT = turnA.effects.findIndex(e => e.actor === 't');
  assert.ok(iTower >= 0 && iT >= 0 && iTower < iT, '仕（唯一的玩家方阶段伤害）恒先于敌方行动槽结算');
  assert.equal(G(turnA.state, 't').frozen, 0, '该次受伤确实清掉了冻结（发生在目标行动槽之前）');
  assert.equal(turnA.effects[iT].status, 'standby', '受伤后该阶段仍待机（不因受伤恢复行动）');
  // ---- 依据 2：敌方攻击不能打同阵营
  const s = base([P('king2', 'king', 6, 0), E('a', 'rook', 4, 4), E('t', 'rook', 4, 6)], { tiles: {} });
  assert.equal(R.actionAt(s, G(s, 'a'), { x: 4, y: 6 }, 'attack'), undefined, '敌方单位不能攻击同阵营单位（ordinary 拒绝）');
  assert.equal(G(s, 'a').rookPush, false, '敌方车没有推动能力（不会产生连带碰撞伤害）');
  assert.equal(G(s, 'a').rookChargeAvailable, false, '敌方车没有可切换的冲锋/推动技能');
  assert.equal(G(s, 'a').horsePush, undefined, '敌方马没有推动能力');
  // ---- 依据 3：敌方意图只指向玩家单位（待机意图不指向任何单位，单独排除）
  const s2 = base([P('king2', 'king', 4, 0), E('a', 'pawn', 4, 1), E('t', 'rook', 0, 6)]);
  s2.intents = []; R.prepareEnemy(s2);
  const aimed = s2.intents.filter(i => i.type !== 'standby');
  assert.ok(aimed.length >= 1, '前置：存在指向单位的敌方意图');
  const aimedTargets = aimed.map(i => R.at(s2, R.intentTarget(s2, i)));
  assert.equal(aimedTargets.every(t => t && t.side === 'player'), true, '敌方意图目标全是玩家单位，不会指向敌方');
  // ---- 尝试构造“行动槽之后受伤”：敌方车贴脸冲锋玩家单位，旁边放一个已冻结的敌方单位
  const s3 = mk([P('king2', 'king', 4, 0), P('wall', 'rook', 4, 2), E('chg', 'rook', 4, 3), E('boss', 'king', 8, 8)]);
  const frozen = U('t', 'enemy', 'rook', 3, 3);
  frozen.frozen = 2;
  s3.units.push(frozen);
  s3.intents = []; R.prepareEnemy(s3);
  const out = R.enemyTurn(s3);
  assert.equal(G(out.state, 't').hp, 2, '同阶段内已冻结敌方单位不受敌方行动的连带伤害');
  assert.equal(G(out.state, 't').frozen, 1, '该单位仍是按冻结跳过（2→1），没有被“受伤”提前解冻');
  // 说明：若未来新增“敌方互相伤害”或“行动槽后才结算的玩家方伤害”，此处应改为可达用例。
  assert.ok(true, '行动后受伤不可达，理由见本用例断言与 R2 文档记录');
});

/* ================= 缺口 2：E11 跨技能真实累计撞山 ================= */

test('E11-R2-A 马跳跃先撞一次山 → 象牵引撞同一山 → 碎石地；活目标存活并停在山前不穿透', () => {
  // 马 (2,1) 跳跃到 (2,3)，其邻格 (2,4) 是完好山 → 真实既有技能扣 1；
  // 象 (0,4) 射程经真实升级到 4，把 (4,4) 的敌车拉向该山 → 同一山累计第 2 次撞击 → 碎石地。
  let s = base([P('h', 'horse', 2, 1), P('ele', 'elephant', 0, 4), E('t', 'rook', 4, 4)], { tiles: { '2,4': 'mountain' } });
  s = prepare(s, { range: [['ele', 4]] });
  assert.equal(R.mountain(s, { x: 2, y: 4 }), true, '前置：山体完好');
  const jump = R.horseJumpAction(s, G(s, 'h'), { x: 2, y: 3 });
  assert.ok(jump, '马跳跃攻击入口可用（真实既有技能）');
  const jr = R.submit(s, 'h', { x: 2, y: 3 }, 'horse-jump');
  assert.ok(jr.effect, '马跳跃结算成功');
  assert.equal(jr.state.tiles['2,4'], 'cracked', '既有技能撞击完好山：只扣 1 耐久→开裂');
  assert.equal(R.mountain(jr.state, { x: 2, y: 4 }), true, '开裂山仍阻挡，未直接变碎石');
  assert.equal((jr.effect.mountains || []).length, 1, '本次只记录 1 次山体受击');
  assert.equal(jr.effect.mountains[0].before, 'mountain');
  // 象牵引撞同一山（跨技能累计）
  const pr = pull(jr.state, 'ele', 4, 4);
  assert.ok(pr.effect, '象牵引提交成功（射程 4 内）');
  assert.equal(pr.effect.pull.steps, 2, '实际距离 4 → 计划位移 2 格');
  assert.equal(pr.effect.pull.moved, 1, '第一步后即撞山停止，没有继续位移');
  assert.equal(pr.effect.pull.status, 'collision-mountain', '首次碰撞即停止');
  assert.equal(G(pr.state, 't').hp, 1, '活体撞山 −1 且目标存活（2→1）');
  assert.deepEqual([G(pr.state, 't').x, G(pr.state, 't').y], [3, 4], '撞毁当次仍停在山前（未穿过刚生成的碎石地）');
  assert.equal(pr.state.tiles['2,4'], 'rubble', '同一次牵引使开裂山累计到碎石地');
  assert.equal(pr.effect.mountains[0].before, 'cracked', '记录本次是第 2 次撞击');
  assert.equal(pr.effect.mountains[0].after, 'rubble');
  assert.equal(R.mountain(pr.state, { x: 2, y: 4 }), false, '碎石地等同陆地，不再阻挡');
  assert.equal(R.occupied(pr.state, { x: 2, y: 4 }), false, '碎石地不占位');
  // 不穿透：目标停在碎石地另一侧（更靠象的一侧），而不是穿过碎石地继续走
  assert.equal(G(pr.state, 't').x > 2, true, '目标没有穿过碎石地');
  assert.equal(pr.effect.mountains.length, 1, '一次牵引只记 1 次山体受击（不连锁）');
});

test('E11-R2-B 其他既有技能实际撞完好山：车冲锋/马推动各只扣 1 耐久', () => {
  // 车冲锋（真实升级入口 rook-charge-role，2 SP）：相邻完好山 → 只开裂，车停在山前
  let s = base([P('r', 'rook', 0, 4)], { tiles: { '1,4': 'mountain' }, teamSp: 2 });
  s = R.purchaseUpgrade(s, 'r', 'rook-charge-role');
  assert.equal(G(s, 'r').rookRole, 'charge', '前置：车已通过真实升级获得冲锋');
  const ch = R.submit(s, 'r', { x: 1, y: 4 }, 'charge');
  assert.ok(ch.effect, '车冲锋撞山成功');
  assert.equal(ch.state.tiles['1,4'], 'cracked', '冲锋撞完好山只扣 1 耐久');
  assert.equal(R.mountain(ch.state, { x: 1, y: 4 }), true, '仍阻挡');
  assert.deepEqual([G(ch.state, 'r').x, G(ch.state, 'r').y], [0, 4], '车停在山前，不穿过');
  const s2 = R.copy(ch.state);
  R.resetTurn(G(s2, 'r'));
  const ch2 = R.submit(s2, 'r', { x: 1, y: 4 }, 'charge');
  assert.ok(ch2.effect, '下一回合再次冲锋');
  assert.equal(ch2.state.tiles['1,4'], 'rubble', '第二次撞击后变碎石地');
  // 马推动（真实升级入口 horse-push，2 SP）：把敌车推撞完好山 → 只开裂，既有碰撞伤害不变
  let s3 = base([P('h', 'horse', 0, 4), E('t', 'rook', 2, 4)], { tiles: { '3,4': 'mountain' }, teamSp: 2 });
  s3 = R.purchaseUpgrade(s3, 'h', 'horse-push');
  assert.equal(G(s3, 'h').horsePush, true, '前置：马已通过真实升级获得推动');
  const jr = R.submit(s3, 'h', { x: 1, y: 4 }, 'horse-jump');
  assert.ok(jr.effect, '马跳跃推动结算成功');
  assert.equal(jr.state.tiles['3,4'], 'cracked', '马推动撞完好山只扣 1 耐久');
  assert.equal(R.mountain(jr.state, { x: 3, y: 4 }), true, '仍阻挡');
  const push = (jr.effect.pushes || []).find(p => p.id === 't');
  assert.ok(push && push.status === 'collision-mountain', '推动记录为撞山碰撞');
  // 既有推动碰撞规则保持：发动方马自身 −1 碰撞伤害（马基础 1 HP，本夹具中因此阵亡，属既有规则，不在本 US 改动）
  const horseHit = (jr.effect.hits || []).find(h => h.id === 'h');
  assert.ok(horseHit && horseHit.collisionDamage === 1, '沿用既有碰撞：马自身 −1 碰撞伤害记录存在');
  const targetHit = (jr.effect.hits || []).find(h => h.id === 't');
  assert.ok(targetHit && targetHit.collisionDamage === 2, '沿用既有碰撞：被推目标 −2 碰撞伤害（未改动其他技能碰撞规则）');
});

test('E11-R2-C 象单次牵引撞山只记一次受击：不连续撞击、不跨格连锁', () => {
  // 目标 2 步位移，第一步即撞山；断言只发生 1 次 rockHit、山只扣 1
  let s = base([P('ele', 'elephant', 0, 4), E('t', 'rook', 4, 4)], { tiles: { '2,4': 'mountain' } });
  s = prepare(s, { range: [['ele', 4]] });
  const r = pull(s, 'ele', 4, 4);
  assert.ok(r.effect);
  assert.equal(r.effect.mountains.length, 1, '单次牵引只记 1 次山体受击');
  assert.equal(r.state.tiles['2,4'], 'cracked', '完好山只降到开裂');
  assert.equal(G(r.state, 't').hp, 1, '目标只受 1 次碰撞伤害');
});
