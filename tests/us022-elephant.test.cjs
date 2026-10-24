// US-022 象的牵引与冰封：定向规则/状态层验收（E02～E19 的规则分支）。
// 全部使用显式夹具构造边界，不替代 docs/us/US-022-elephant-control-skills.md E01/E20/E21 的正常入口实际浏览器流程。
// 牵引几何：目标在象同线距离 d，位移 floor(d/2) 格；障碍距象 db 时，当 1 ≤ d-db ≤ floor(d/2) 即在该步首次碰撞。
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
  if (opts.buffs) s.buffs = Object.assign({ health: false, move: false, rescue: false }, opts.buffs);
  if (opts.corpses) s.corpses = opts.corpses;
  if (opts.rng !== undefined) s.rng = opts.rng;
  return s;
}
const base = (units, opts) => mk([P('king', 'king', 0, 0), E('boss', 'king', 8, 8)].concat(units || []), opts);
const act = (s, id, to, mode) => R.actionAt(s, G(s, id), to, mode);
const move = (s, id, x, y) => R.submit(s, id, typeof x === 'object' ? x : { x: x, y: y });
const pull = (s, id, x, y) => R.submit(s, id, { x: x, y: y }, 'elephant-pull');
const freeze = (s, id, x, y) => R.submit(s, id, { x: x, y: y }, 'elephant-freeze');
const corpse = (id, x, y, side) => ({ id: 'corpse-' + id, x: x, y: y, unit: Object.assign(U(id, side || 'enemy', 'pawn', x, y), { hp: 0 }) });
function addSp(s, sp) { const n = R.copy(s); n.teamSp = sp; return n; }
function upgrade(s, id, skill, times) {
  let n = R.copy(s);
  for (let i = 0; i < (times || 1); i++) {
    const before = n;
    n = R.purchaseUpgrade(n, id, skill);
    if (n === before) throw new Error('升级失败：' + skill);
  }
  return n;
}
// 战斗阶段升级需要足够 SP：统一给足再购买
function unlockFreeze(s, id, times) { return upgrade(addSp(s, 20), id, 'elephant-freeze-unlock', 1) && upgrade(addSp(s, 20), id, 'elephant-freeze-unlock', 1 + (times || 0)); }
function withFreeze(s, id, duration) {
  let n = addSp(s, 20);
  n = upgrade(n, id, 'elephant-freeze-unlock', 1);
  for (let i = 1; i < (duration || 1); i++) n = upgrade(n, id, 'elephant-freeze-duration', 1);
  n.teamSp = s.teamSp === undefined ? 0 : s.teamSp;
  return n;
}
function withRange(s, id, range) {
  let n = addSp(s, 20);
  for (let i = R.elephantPullRangeOf(G(n, id)); i < range; i++) n = upgrade(n, id, 'elephant-pull-range', 1);
  n.teamSp = s.teamSp === undefined ? 0 : s.teamSp;
  return n;
}
function withBuffs(s, b) { const n = R.copy(s); n.buffs = Object.assign({ health: false, move: false, rescue: false }, b); return n; }

/* ---------------- E01/E12 招募与成长经济 ---------------- */
test('E01 象为 5 猫粮、初始不在阵容、可多只、满员后备、血量增益后 2 HP', () => {
  const fresh = R.newGame();
  assert.ok(!fresh.party.some(u => u.kind === 'elephant'), '新旅程初始阵容不含象');
  assert.equal(R.CONFIG.elephant.price, 5, '象价格为 5 猫粮');
  assert.equal(R.unit('hp', 'player', 'elephant', 0, 0).maxHp, 1, '象基础 1 HP');
  const camp = mk([], { phase: 'intermission' });
  camp.gold = 8; camp.party = R.copy(fresh.party);
  // 初始阵容满 4 人口：先腾出一个部署位
  camp.activeIds = fresh.party.slice(0, 3).map(u => u.id);
  camp.bench = fresh.party.slice(3).map(u => u.id);
  const one = R.buy(camp, 'elephant');
  assert.equal(one.gold, 3, '招募象扣 5 猫粮');
  const ele = one.party.find(u => u.kind === 'elephant');
  assert.ok(ele, '队伍中加入象');
  assert.equal(ele.maxHp, 1, '未解锁坚守时象 1 HP');
  assert.ok(one.activeIds.includes(ele.id), '有空余部署人口时新象默认上阵');
  const two = R.buy(Object.assign(R.copy(one), { gold: 10 }), 'elephant');
  assert.equal(two.party.filter(u => u.kind === 'elephant').length, 2, '可招募多只象');
  assert.ok(two.bench.includes(two.party.filter(u => u.kind === 'elephant')[1].id), '部署人口满时新象进入后备');
  const poor = mk([], { phase: 'intermission' }); poor.gold = 4; poor.party = [];
  assert.strictEqual(R.buy(poor, 'elephant'), poor, '猫粮不足不招募、不扣费');
  // 血量增益：坚守后象最大 HP 2
  const buffed = R.copy(one);
  buffed.buffs = Object.assign({ health: false, move: false, rescue: false }, { health: true });
  R.applyJourneyBuffs(buffed);
  const buffedEle = buffed.party.find(u => u.kind === 'elephant');
  assert.equal(buffedEle.maxHp, 2, '普通队友血量增益生效后 2 HP');
  assert.equal(buffedEle.hp, 2);
  // 新入关时同样按增益生成
  const lvlSource = R.stateFromJourney(R.journeyRecord(buffed));
  const lvl = R.startLevel(lvlSource, R.defaultMap());
  const onBoard = lvl.units.find(u => u.kind === 'elephant');
  if (onBoard) assert.equal(onBoard.maxHp, 2, '入关时血量增益同样作用于象');
});

test('E12 冰封 2 SP 解锁、每 2 SP +1 至 3、只作用于所选象、失败不扣费不刷新行动', () => {
  let s = base([P('e1', 'elephant', 4, 3), P('e2', 'elephant', 4, 5), E('t', 'rook', 4, 1)], { teamSp: 2 });
  // 初始未解锁
  assert.equal(R.elephantFreezeUnlocked(G(s, 'e1')), false, '初始未解锁冰封');
  assert.equal(R.elephantFreezeDurationOf(G(s, 'e1')), 0);
  s = R.purchaseUpgrade(s, 'e1', 'elephant-freeze-unlock');
  assert.equal(s.teamSp, 0, '解锁一次扣 2 SP');
  assert.equal(R.elephantFreezeUnlocked(G(s, 'e1')), true);
  assert.equal(R.elephantFreezeDurationOf(G(s, 'e1')), 1, '初始冻结 1 个敌方行动阶段');
  assert.equal(R.elephantFreezeUnlocked(G(s, 'e2')), false, '只强化选中的象');
  let up = addSp(s, 8);
  up = R.purchaseUpgrade(up, 'e1', 'elephant-freeze-duration');
  assert.equal(R.elephantFreezeDurationOf(G(up, 'e1')), 2, '每 2 SP +1 阶段');
  up = R.purchaseUpgrade(up, 'e1', 'elephant-freeze-duration');
  assert.equal(R.elephantFreezeDurationOf(G(up, 'e1')), 3, '上限 3 阶段');
  assert.equal(up.teamSp, 4, '两次时长升级各扣 2 SP');
  const beforeMax = addSp(up, 4);
  assert.strictEqual(R.purchaseUpgrade(beforeMax, 'e1', 'elephant-freeze-duration'), beforeMax, '已达上限不再扣费且返回同一状态');
  assert.strictEqual(R.purchaseUpgrade(up, 'e2', 'elephant-freeze-duration'), up, '未解锁冰封不能买时长');
  const poor = R.copy(s); poor.teamSp = 1;
  assert.strictEqual(R.purchaseUpgrade(poor, 'e1', 'elephant-freeze-duration'), poor, 'SP 不足不升级');
  // 牵引射程 3→8、四向同步、不影响冻结时长
  let r = addSp(s, 20);
  for (let i = 0; i < 8; i++) r = R.purchaseUpgrade(r, 'e1', 'elephant-pull-range');
  assert.equal(R.elephantPullRangeOf(G(r, 'e1')), 8, '牵引射程上限 8');
  assert.equal(R.elephantFreezeDurationOf(G(r, 'e1')), 1, '牵引射程升级不改冻结时长');
  const capped = R.copy(r);
  assert.strictEqual(R.purchaseUpgrade(capped, 'e1', 'elephant-pull-range'), capped, '射程已达上限 8');
  // 升级不刷新已用动作
  const mid = R.copy(s);
  const used = R.submit(mid, 'e1', { x: 2, y: 1 });
  const upgraded = R.purchaseUpgrade(addSp(used.state, 3), 'e1', 'elephant-pull-range');
  assert.equal(G(upgraded, 'e1').ap, G(used.state, 'e1').ap, '升级不刷新普通移动');
  assert.equal(G(upgraded, 'e1').elephantSkillUsed, G(used.state, 'e1').elephantSkillUsed, '升级不刷新技能');
});

/* ---------------- E02 基础田字移动 ---------------- */
test('E02 基础走田：斜向恰好 2 格，象眼被棋子/尸体/山阻挡，落点约束与河道', () => {
  const s = base([P('ele', 'elephant', 4, 2)]);
  for (const to of [{ x: 2, y: 0 }, { x: 2, y: 4 }, { x: 6, y: 0 }, { x: 6, y: 4 }]) assert.ok(act(s, 'ele', to), '四田字落点合法 ' + JSON.stringify(to));
  for (const to of [{ x: 4, y: 0 }, { x: 5, y: 3 }, { x: 3, y: 1 }, { x: 7, y: 6 }, { x: 2, y: 2 }]) assert.equal(act(s, 'ele', to), undefined, '非田字非法 ' + JSON.stringify(to));
  // 象眼三类阻挡
  assert.equal(act(base([P('ele', 'elephant', 4, 2), P('blk', 'pawn', 3, 1)]), 'ele', { x: 2, y: 0 }), undefined, '象眼被棋子阻挡');
  const eyeCorpse = base([P('ele', 'elephant', 4, 2)]);
  eyeCorpse.corpses = [corpse('c', 3, 3)];
  assert.equal(act(eyeCorpse, 'ele', { x: 2, y: 4 }), undefined, '象眼被尸体阻挡');
  assert.equal(act(base([P('ele', 'elephant', 4, 2)], { tiles: { '5,1': 'mountain' } }), 'ele', { x: 6, y: 0 }), undefined, '象眼被山体阻挡');
  assert.ok(act(base([P('ele', 'elephant', 4, 2)], { tiles: { '3,1': 'water' } }), 'ele', { x: 2, y: 0 }), '象眼水格不阻挡');
  // 落点约束
  assert.equal(act(base([P('ele', 'elephant', 4, 2), P('occ', 'pawn', 6, 4)]), 'ele', { x: 6, y: 4 }), undefined, '落点被棋子占据非法');
  const corpseLanding = base([P('ele', 'elephant', 4, 2)]);
  corpseLanding.corpses = [corpse('cl', 6, 4)];
  assert.equal(act(corpseLanding, 'ele', { x: 6, y: 4 }), undefined, '落点不能被尸体占据');
  assert.equal(act(base([P('ele', 'elephant', 4, 2)], { tiles: { '6,4': 'mountain' } }), 'ele', { x: 6, y: 4 }), undefined, '落点不能是山体');
  assert.equal(act(base([P('ele', 'elephant', 1, 1)]), 'ele', { x: 3, y: -1 }), undefined, '落点越界非法');
  assert.equal(act(base([P('ele', 'elephant', 4, 3)]), 'ele', { x: 6, y: 5 }), undefined, '不能进入敌方半场');
  assert.equal(act(base([P('ele', 'elephant', 4, 3)]), 'ele', { x: 2, y: 5 }), undefined, '不能进入敌方半场（另一侧）');
  // 河道水格可落并可实际移动
  const river = base([P('ele', 'elephant', 3, 2)], { tiles: { '5,4': 'water' } });
  const riverMove = move(river, 'ele', 5, 4);
  assert.ok(riverMove.effect, '可落到河道水格');
  assert.deepEqual([G(riverMove.state, 'ele').x, G(riverMove.state, 'ele').y], [5, 4]);
  assert.equal(G(riverMove.state, 'ele').ap, 0, '移动消耗本回合普通移动');
  assert.equal(G(riverMove.state, 'ele').elephantSkillUsed, false, '移动不消耗技能');
  assert.equal(act(riverMove.state, 'ele', { x: 7, y: 6 }), undefined, '从河道不能继续过河');
  const before = JSON.stringify(river);
  assert.strictEqual(move(river, 'ele', 6, 5).state, river, '非法移动不结算');
  assert.equal(JSON.stringify(river), before, '非法移动不改变状态');
});

/* ---------------- E03 疾行扩展 ---------------- */
test('E03 移动增益：合法田字落点加正交邻格、一次点击最终格、参照/象眼/最终限制、多路线去重', () => {
  const plain = base([P('ele', 'elephant', 4, 2)]);
  const buffed = withBuffs(plain, { move: true });
  assert.ok(act(buffed, 'ele', { x: 2, y: 0 }), '原田字落点仍可选');
  for (const to of [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 1 }]) {
    const a = act(buffed, 'ele', to);
    assert.ok(a, '疾行扩展落点合法 ' + JSON.stringify(to));
    assert.equal(a.extended, true, '标记为疾行扩展');
    assert.equal(a.type, 'move');
    assert.deepEqual(a.to, to, '一次点击即最终格');
  }
  assert.equal(act(buffed, 'ele', { x: 2, y: 5 }), undefined, '扩展落点不能进敌方半场');
  for (const to of [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 1 }]) assert.equal(act(plain, 'ele', to), undefined, '无疾行时不可扩展 ' + JSON.stringify(to));
  // 参照落点被占 / 象眼被挡：其邻格不可选（不照搬马参照格可占用的特例）
  const refBlocked = withBuffs(base([P('ele', 'elephant', 4, 2), P('occ', 'pawn', 2, 0)]), { move: true });
  assert.equal(act(refBlocked, 'ele', { x: 3, y: 0 }), undefined, '参照落点被占时其邻格不可选');
  assert.equal(act(refBlocked, 'ele', { x: 2, y: 1 }), undefined, '参照落点被占时纵向邻格也不可选');
  const refEye = withBuffs(base([P('ele', 'elephant', 4, 2), P('blk', 'pawn', 3, 1)]), { move: true });
  assert.equal(act(refEye, 'ele', { x: 1, y: 0 }), undefined, '参照落点象眼被挡时其邻格不可选');
  // 最终格被占 / 山 / 尸体
  assert.equal(act(withBuffs(base([P('ele', 'elephant', 4, 2), P('occ', 'pawn', 3, 0)]), { move: true }), 'ele', { x: 3, y: 0 }), undefined, '最终格被占非法');
  assert.equal(act(withBuffs(base([P('ele', 'elephant', 4, 2)], { tiles: { '2,1': 'mountain' } }), { move: true }), 'ele', { x: 2, y: 1 }), undefined, '最终格不能是山体');
  const finalCorpse = withBuffs(base([P('ele', 'elephant', 4, 2)]), { move: true });
  finalCorpse.corpses = [corpse('fc', 3, 0)];
  assert.equal(act(finalCorpse, 'ele', { x: 3, y: 0 }), undefined, '最终格不能被尸体占据');
  // 合法动作集合：同一最终格只出现一次；路径为参照点 + 最终格
  const actions = R.legalActions(buffed, 'ele').filter(a => a.type === 'move');
  const keys = actions.map(a => a.to.x + ',' + a.to.y);
  assert.equal(new Set(keys).size, keys.length, '多条合法路线合并去重');
  for (const a of actions) assert.equal(a.path.length <= 2, true, '疾行扩展路径为参照点 + 最终格');
  assert.equal(actions.filter(a => a.extended).length, 12, '四个田字落点各 3 个未越界邻格（第 4 格进敌方半场）');
  // 一次扩展移动仍是一次普通移动
  const r = move(buffed, 'ele', 2, 1);
  assert.ok(r.effect);
  assert.deepEqual([G(r.state, 'ele').x, G(r.state, 'ele').y], [2, 1]);
  assert.equal(G(r.state, 'ele').ap, 0, '扩展移动仍是普通移动一次');
  assert.equal(G(r.state, 'ele').elephantSkillUsed, false, '移动不消耗技能');
  assert.equal(act(r.state, 'ele', { x: 3, y: 2 }), undefined, '本回合已无普通移动');
  for (const to of [{ x: 7, y: 6 }, { x: 1, y: -1 }, { x: 7, y: -1 }]) assert.equal(act(buffed, 'ele', to), undefined, '不存在斜走 3 格 ' + JSON.stringify(to));
});

/* ---------------- E04 行动顺序 ---------------- */
test('E04 一移一技能：先移后施法、直接施法、施法后不能再移动、下回合恢复', () => {
  let s = withFreeze(base([P('ele', 'elephant', 4, 4), E('foe', 'rook', 1, 3)]), 'ele', 1);
  const moved = move(s, 'ele', 2, 2);
  assert.ok(moved.effect, '普通移动成功');
  assert.equal(G(moved.state, 'ele').ap, 0);
  assert.equal(G(moved.state, 'ele').elephantSkillUsed, false, '移动后仍可施法');
  const frozen = freeze(moved.state, 'ele', 1, 3);
  assert.ok(frozen.effect, '移动后仍可冰封（目标在 5×5 内）');
  assert.equal(G(frozen.state, 'ele').elephantSkillUsed, true);
  assert.equal(G(frozen.state, 'foe').frozen, 1);
  assert.equal(act(frozen.state, 'ele', { x: 4, y: 4 }), undefined, '施法后锁移动');
  assert.equal(pull(frozen.state, 'ele', 1, 3).effect, undefined, '本回合技能已用，不能再牵引');
  const fresh = R.copy(frozen.state);
  R.resetTurn(G(fresh, 'ele'));
  assert.equal(G(fresh, 'ele').elephantSkillUsed, false, '下回合技能恢复');
  assert.equal(G(fresh, 'ele').ap, 1, '下回合移动恢复');
  // 直接施法
  const direct = pull(withFreeze(base([P('ele', 'elephant', 4, 4), E('foe', 'rook', 4, 6)]), 'ele', 1), 'ele', 4, 6);
  assert.ok(direct.effect, '可直接施法（不先移动）');
  assert.equal(G(direct.state, 'ele').ap, 0, '施法同时锁普通移动');
  assert.equal(act(direct.state, 'ele', { x: 2, y: 2 }), undefined);
  // 先牵引再冰封同回合不可行
  const both = pull(withFreeze(base([P('ele', 'elephant', 4, 4), E('foe', 'rook', 4, 6), E('foe2', 'rook', 6, 6)]), 'ele', 1), 'ele', 4, 6);
  assert.equal(freeze(both.state, 'ele', 6, 6).effect, undefined, '牵引与冰封共用一次技能');
});

/* ---------------- E05 牵引选取 ---------------- */
test('E05 牵引目标类型与距离：同线 2～3 格，1 格太近，自身/仕/山不可选，主帅/敌我/尸可选', () => {
  const s = base([
    P('ele', 'elephant', 4, 4), P('king2', 'king', 4, 1), P('tower', 'advisor', 3, 1),
    P('ally', 'pawn', 2, 4), E('foe', 'rook', 6, 4), E('foe2', 'pawn', 4, 2)
  ]);
  assert.ok(act(s, 'ele', { x: 4, y: 2 }, 'elephant-pull'), '后方 2 格敌军可选');
  assert.ok(act(s, 'ele', { x: 2, y: 4 }, 'elephant-pull'), '左方 2 格友军可选');
  assert.ok(act(s, 'ele', { x: 6, y: 4 }, 'elephant-pull'), '右方 2 格敌军可选');
  assert.equal(act(s, 'ele', { x: 4, y: 6 }, 'elephant-pull'), undefined, '空地无目标不可选');
  assert.equal(act(s, 'ele', { x: 3, y: 4 }, 'elephant-pull'), undefined, '距离 1 太近不可选');
  assert.match(R.actionReason(s, 'ele', { x: 3, y: 4 }, 'elephant-pull'), /1 格太近/);
  assert.equal(act(s, 'ele', { x: 4, y: 4 }, 'elephant-pull'), undefined, '不能选自己');
  assert.equal(act(s, 'ele', { x: 6, y: 2 }, 'elephant-pull'), undefined, '斜向不可选');
  assert.equal(act(s, 'ele', { x: 4, y: 8 }, 'elephant-pull'), undefined, '超出初始射程 3 不可选');
  assert.equal(act(s, 'ele', { x: 3, y: 1 }, 'elephant-pull'), undefined, '我方仕不可被牵引');
  assert.equal(act(base([P('ele', 'elephant', 4, 4)], { tiles: { '4,2': 'mountain' } }), 'ele', { x: 4, y: 2 }, 'elephant-pull'), undefined, '山体不可被牵引');
  const withCorpse = base([P('ele', 'elephant', 4, 4)]);
  withCorpse.corpses = [corpse('c', 4, 2)];
  assert.ok(act(withCorpse, 'ele', { x: 4, y: 2 }, 'elephant-pull'), '尸体可选');
  // 主帅可被选（也可出宫）
  const king = base([P('ele', 'elephant', 4, 4), P('k2', 'king', 2, 4)]);
  assert.ok(act(king, 'ele', { x: 2, y: 4 }, 'elephant-pull'), '我方主帅可被牵引');
  const rk = pull(king, 'ele', 2, 4);
  assert.ok(rk.effect, '主帅实际被拉近');
  assert.deepEqual([G(rk.state, 'k2').x, G(rk.state, 'k2').y], [3, 4], '主帅沿宫外移动规则被拉近 1 格');
  // 非法不消耗技能、不改变状态
  const before = JSON.stringify(s);
  assert.strictEqual(pull(s, 'ele', 4, 4).state, s);
  assert.strictEqual(pull(s, 'ele', 3, 4).state, s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(G(s, 'ele').elephantSkillUsed, false);
});

/* ---------------- E06 隔障选取与首次碰撞 ---------------- */
test('E06 可越棋子/尸体/山选择后方目标；位移在首个障碍停止、无直接伤害、无穿透连锁', () => {
  // 越棋子：象 (0,4) 目标车 (5,4) 距离 5 → 2 步；中间石? 障碍棋子 (3,4) → 第 2 步碰撞
  const overUnit = withRange(base([P('ele', 'elephant', 0, 4), P('blk', 'pawn', 3, 4), E('t', 'rook', 5, 4)]), 'ele', 5);
  assert.ok(act(overUnit, 'ele', { x: 5, y: 4 }, 'elephant-pull'), '可越过中间棋子选择其后目标');
  const r = pull(overUnit, 'ele', 5, 4);
  assert.equal(r.effect.pull.moved, 1, '第一步移动');
  assert.deepEqual([G(r.state, 't').x, G(r.state, 't').y], [4, 4], '停在障碍前');
  assert.equal(G(r.state, 't').hp, 1, '目标撞活体 −1');
  assert.equal(G(r.state, 'blk'), undefined, '阻挡兵 1 HP 阵亡（双方各 −1）');
  // 越尸体
  const overCorpse = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4)]), 'ele', 5);
  overCorpse.corpses = [corpse('c', 3, 4)];
  const rc = pull(overCorpse, 'ele', 5, 4);
  assert.equal(G(rc.state, 't').hp, 1, '目标撞尸 −1');
  assert.equal(rc.state.corpses.length, 1, '尸体保留');
  assert.equal(rc.effect.pull.status, 'collision-corpse');
  // 越山
  const overRock = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4)], { tiles: { '3,4': 'mountain' } }), 'ele', 5);
  const rr = pull(overRock, 'ele', 5, 4);
  assert.equal(G(rr.state, 't').hp, 1, '目标撞山 −1');
  assert.equal(rr.state.tiles['3,4'], 'cracked', '山一次受击开裂');
  assert.equal(rr.effect.pull.status, 'collision-mountain');
  // 无碰撞：仅位移无伤害
  const clean = base([P('ele', 'elephant', 0, 4), E('t', 'rook', 3, 4)]);
  const rl = pull(clean, 'ele', 3, 4);
  assert.equal(rl.effect.hits.length, 0, '无碰撞不造成伤害');
  assert.deepEqual([G(rl.state, 't').x, G(rl.state, 't').y], [2, 4], '位移 1 格');
  assert.equal(G(rl.state, 't').hp, 2, '车 2 HP 不变');
  // 首次碰撞即停止：不连锁推动、不传递撞击
  const noChain = withRange(base([
    P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4), P('wall', 'rook', 3, 4), P('far', 'pawn', 2, 4)
  ]), 'ele', 5);
  const rn = pull(noChain, 'ele', 5, 4);
  assert.deepEqual([G(rn.state, 'wall').x, G(rn.state, 'wall').y], [3, 4], '阻挡者不被推动');
  assert.deepEqual([G(rn.state, 'far').x, G(rn.state, 'far').y], [2, 4], '更后方单位不受传递');
  assert.equal(G(rn.state, 'far').hp, 1, '更后方单位不受伤');
});

/* ---------------- E07 射程成长与实际位移 ---------------- */
test('E07 每 1 SP 四向 +1 至 8；实际距离 2～8 位移 1/1/2/2/3/3/4；不增移动与冰封', () => {
  let s = withRange(base([P('ele', 'elephant', 4, 4), E('a', 'rook', 8, 4), E('b', 'rook', 4, 8), E('c', 'rook', 0, 4), E('d', 'rook', 4, 0)]), 'ele', 8);
  assert.equal(R.elephantPullRangeOf(G(s, 'ele')), 8);
  for (const to of [{ x: 8, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 4 }, { x: 4, y: 0 }]) assert.ok(act(s, 'ele', to, 'elephant-pull'), '四向射程 8 内可选 ' + JSON.stringify(to));
  const cases = [[2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3], [8, 4]];
  for (const [dist, steps] of cases) {
    const st = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', dist, 4)]), 'ele', 8);
    const a = act(st, 'ele', { x: dist, y: 4 }, 'elephant-pull');
    assert.ok(a, '射程 8 内可选 距离 ' + dist);
    assert.equal(a.pullSteps, steps, `距离 ${dist} 位移 ${steps}`);
    const r = pull(st, 'ele', dist, 4);
    assert.equal(r.effect.pull.steps, steps);
    assert.equal(G(r.state, 't').x, dist - steps, `距离 ${dist} 实际拉近 ${steps} 格`);
  }
  // 射程升级不增加移动落点与冻结时长
  const before = R.legalActions(s, 'ele').filter(a => a.type === 'move').length;
  const up = withRange(base([P('ele', 'elephant', 4, 4)], { teamSp: 0 }), 'ele', 8);
  assert.equal(R.legalActions(up, 'ele').filter(a => a.type === 'move').length, before, '牵引射程升级不增加移动落点');
  assert.equal(R.elephantFreezeDurationOf(G(up, 'ele')), 0, '射程升级不赠送冰封');
});

/* ---------------- E08 碰撞伤害 ---------------- */
test('E08 活体撞活体/尸体/山：各 −1、尸留、山一次受击，第三者不受传递', () => {
  const live = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4), P('w', 'rook', 3, 4)]), 'ele', 5);
  const rl = pull(live, 'ele', 5, 4);
  assert.equal(G(rl.state, 't').hp, 1, '目标 −1');
  assert.equal(G(rl.state, 'w').hp, 1, '阻挡活体 −1');
  assert.equal(rl.effect.pull.status, 'collision-live');
  assert.equal(rl.effect.hits.length, 2, '双方各 1 条伤害记录');
  const corpseCase = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4)]), 'ele', 5);
  corpseCase.corpses = [corpse('c', 3, 4)];
  const rc = pull(corpseCase, 'ele', 5, 4);
  assert.equal(G(rc.state, 't').hp, 1, '目标 −1');
  assert.equal(rc.state.corpses.length, 1, '尸体保留');
  assert.equal(rc.effect.hits.length, 1, '只有目标受伤');
  const rock = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4)], { tiles: { '3,4': 'mountain' } }), 'ele', 5);
  const rr = pull(rock, 'ele', 5, 4);
  assert.equal(G(rr.state, 't').hp, 1, '目标 −1');
  assert.equal(rr.state.tiles['3,4'], 'cracked', '山一次受击');
  assert.equal(rr.effect.mountains.length, 1);
  assert.equal(G(rr.state, 't').x, 4, '撞山当次停在山前');
  const third = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'rook', 5, 4), E('x', 'pawn', 3, 5)]), 'ele', 5);
  const rt = pull(third, 'ele', 5, 4);
  assert.equal(G(rt.state, 'x').hp, 1, '与碰撞无关的单位不受影响');
  assert.deepEqual([G(rt.state, 'x').x, G(rt.state, 'x').y], [3, 5], '不传递撞击');
  const clean = base([P('ele', 'elephant', 0, 4), E('t', 'rook', 3, 4)]);
  assert.equal(pull(clean, 'ele', 3, 4).effect.hits.length, 0, '仅位移不产生伤害');
});

/* ---------------- E09 尸体被拉 ---------------- */
test('E09 尸体撞活体/山/尸：对方 −1、山受击、尸尸无伤；入水销毁', () => {
  let s = withRange(base([P('ele', 'elephant', 0, 4), P('ally', 'rook', 3, 4)]), 'ele', 5);
  s.corpses = [corpse('c', 5, 4)];
  const rl = pull(s, 'ele', 5, 4);
  assert.equal(G(rl.state, 'ally').hp, 1, '活体被撞 −1');
  assert.equal(rl.state.corpses.length, 1, '尸体保留');
  assert.deepEqual([rl.state.corpses[0].x, rl.state.corpses[0].y], [4, 4], '尸体停在碰撞前');
  assert.equal(rl.effect.pull.status, 'collision-live');
  let s2 = withRange(base([P('ele', 'elephant', 0, 4)], { tiles: { '3,4': 'mountain' } }), 'ele', 5);
  s2.corpses = [corpse('c', 5, 4)];
  const rr = pull(s2, 'ele', 5, 4);
  assert.equal(rr.state.tiles['3,4'], 'cracked', '尸体撞山山受击');
  assert.equal(rr.state.corpses.length, 1, '尸体保留');
  assert.equal(rr.effect.pull.status, 'collision-mountain');
  let s3 = withRange(base([P('ele', 'elephant', 0, 4)]), 'ele', 5);
  s3.corpses = [corpse('a', 5, 4, 'enemy'), corpse('b', 3, 4, 'player')];
  const rc = pull(s3, 'ele', 5, 4);
  assert.equal(rc.effect.hits.length, 0, '尸尸相撞无伤害');
  assert.equal(rc.state.corpses.length, 2, '双方尸体保留');
  assert.equal(rc.state.corpses.find(c => c.id === 'corpse-a').x, 4, '尸体不穿越');
  assert.equal(rc.effect.pull.status, 'collision-corpse');
  let s4 = withRange(base([P('ele', 'elephant', 0, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);
  s4.corpses = [corpse('c', 5, 4)];
  const rw = pull(s4, 'ele', 5, 4);
  assert.equal(rw.state.corpses.length, 0, '尸体入水销毁');
  assert.equal(rw.effect.pull.status, 'water-destroyed');
  assert.ok(rw.effect.waterDeaths.includes('c'));
});

/* ---------------- E10 水与半场 ---------------- */
test('E10 致死水立即死亡并终止、桥为陆地、非致死水单位保留既有规则、象互拉不进敌方半场', () => {
  // 不能入水的兵：首个水格死亡，牵引终止
  const sp = withRange(base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 5, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);
  const rp = pull(sp, 'ele', 5, 4);
  assert.equal(G(rp.state, 'p'), undefined, '兵首个水格立即死亡');
  assert.equal(rp.effect.pull.status, 'water-death');
  assert.ok(rp.effect.waterDeaths.includes('p'));
  assert.equal(rp.effect.pull.moved, 1, '死亡前已移动 1 格，随后终止');
  // 玩家主帅入水同样致死
  const sk = withRange(base([P('ele', 'elephant', 0, 4), P('k2', 'king', 5, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);
  const rk = pull(sk, 'ele', 5, 4);
  assert.equal(G(rk.state, 'k2'), undefined, '主帅不能入水：首个水格死亡');
  assert.equal(rk.effect.pull.status, 'water-death');
  // 车（非致死水单位）可被拉入水并继续
  const sr = withRange(base([P('ele', 'elephant', 0, 4), E('r', 'rook', 5, 4)], { tiles: { '3,4': 'water' } }), 'ele', 5);
  const rr = pull(sr, 'ele', 5, 4);
  assert.ok(G(rr.state, 'r'), '车未被水杀死');
  assert.deepEqual([G(rr.state, 'r').x, G(rr.state, 'r').y], [3, 4], '车按位移停在水中');
  assert.equal(rr.effect.pull.moved, 2, '非致死水不中断牵引');
  // 桥按普通陆地
  const sb = withRange(base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 5, 4)], { tiles: { '3,4': 'bridge' } }), 'ele', 5);
  const rb = pull(sb, 'ele', 5, 4);
  assert.ok(G(rb.state, 'p'), '桥上不致死');
  assert.deepEqual([G(rb.state, 'p').x, G(rb.state, 'p').y], [3, 4], '桥按普通陆地通行');
  // 多象互拉：我方目标不被位移进敌方半场，且不造成碰撞伤害
  const se = base([P('e1', 'elephant', 4, 4), P('e2', 'elephant', 4, 7)]);
  const rh = pull(se, 'e1', 4, 7);
  assert.ok(rh.effect, '同线 3 格可选');
  assert.equal(rh.effect.pull.status, 'half', '敌方半场限制');
  assert.equal(rh.effect.pull.moved, 0, '不位移');
  assert.equal(rh.effect.hits.length, 0, '半场限制不造成碰撞伤害');
  assert.deepEqual([G(rh.state, 'e2').x, G(rh.state, 'e2').y], [4, 7], '目标停在原格');
});

/* ---------------- E11 统一撞山 ---------------- */
test('E11 山 2 耐久：牵引一次只扣 1；两次变碎石地并可通行、不作炮架', () => {
  const s = base([P('ele', 'elephant', 0, 4), E('t', 'rook', 2, 4)], { tiles: { '1,4': 'mountain' } });
  const r1 = pull(s, 'ele', 2, 4);
  assert.equal(r1.state.tiles['1,4'], 'cracked', '第一次牵引撞山：开裂，不直接撞碎');
  assert.equal(G(r1.state, 't').hp, 1, '活体撞山 −1');
  // 同一象下一回合再撞一次（目标仍停在山前）→ 碎石地
  let s2 = R.copy(r1.state);
  R.resetTurn(G(s2, 'ele'));
  R.resetTurn(G(s2, 't'));
  const r2 = pull(s2, 'ele', 2, 4);
  assert.equal(r2.state.tiles['1,4'], 'rubble', '累计两次撞击变碎石地');
  assert.equal(r2.effect.mountains[0].before, 'cracked');
  // 碎石地等同陆地：可通行、不占位、不作炮架
  const after = r2.state;
  assert.equal(R.mountain(after, { x: 1, y: 4 }), false, '碎石地不是山体');
  assert.equal(!!R.occupied(after, { x: 1, y: 4 }), false, '碎石地不占位');
  const st = R.copy(after);
  st.units.push(U('mv', 'player', 'rook', 0, 4));
  R.resetTurn(G(st, 'mv'));
  const mv = R.submit(st, 'mv', { x: 1, y: 4 });
  assert.ok(mv.effect, '车可进入碎石地');
  assert.equal(R.mountain(mv.state, { x: 1, y: 4 }), false);
  // 炮架：碎石地不能当炮架
  const cannonState = R.copy(after);
  cannonState.units.push(U('cn', 'player', 'cannon', 1, 6), E('tg', 'pawn', 1, 4));
  assert.equal(R.actionAt(cannonState, G(cannonState, 'cn'), { x: 1, y: 4 }), undefined, '碎石地不作炮架');
  // 跨技能累计：直接受击一次后再有效撞击一次同样坍塌
  let s3 = base([P('ele', 'elephant', 0, 4), E('t', 'rook', 2, 4)], { tiles: { '1,4': 'cracked' } });
  const r3 = pull(s3, 'ele', 2, 4);
  assert.equal(r3.state.tiles['1,4'], 'rubble', '已开裂山再被牵引撞击即碎石');
});

/* ---------------- E13 冰封范围与目标 ---------------- */
test('E13 冰封固定 5×5：含斜向/界边/跨河/越障，仅单个敌人（含敌将），友军尸体山拒绝', () => {
  const s = withFreeze(base([P('ele', 'elephant', 4, 4)]), 'ele', 1);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    const p = { x: 4 + dx, y: 4 + dy };
    const st = R.copy(s);
    st.units = st.units.filter(u => u.id !== 'boss');
    st.units.push(E('t', 'rook', p.x, p.y));
    assert.ok(R.elephantFreezeAction(st, G(st, 'ele'), p), '5×5 内可选 ' + JSON.stringify(p));
  }
  for (const p of [{ x: 7, y: 4 }, { x: 4, y: 7 }, { x: 6, y: 7 }, { x: 1, y: 4 }, { x: 7, y: 6 }, { x: 6, y: 7 }]) {
    const st = R.copy(s); st.units.push(E('t2', 'rook', p.x, p.y));
    assert.equal(R.elephantFreezeAction(st, G(st, 'ele'), p), undefined, '5×5 外不可选 ' + JSON.stringify(p));
  }
  // 敌将可选
  const bossState = withFreeze(mk([P('ele', 'elephant', 7, 7), P('king', 'king', 0, 0), E('boss', 'king', 8, 8)]), 'ele', 1);
  assert.ok(R.elephantFreezeAction(bossState, G(bossState, 'ele'), { x: 8, y: 8 }), '敌将可被冰封');
  const frozenBoss = freeze(bossState, 'ele', 8, 8);
  assert.equal(G(frozenBoss.state, 'boss').frozen, 1, '敌将实际被冻结');
  // 友军/空/尸体/山拒绝
  const friend = withFreeze(base([P('ele', 'elephant', 4, 4), P('f', 'pawn', 4, 2)]), 'ele', 1);
  assert.equal(R.elephantFreezeAction(friend, G(friend, 'ele'), { x: 4, y: 2 }), undefined, '友军不可冰封');
  assert.match(R.actionReason(friend, 'ele', { x: 4, y: 2 }, 'elephant-freeze'), /友军/);
  assert.equal(R.elephantFreezeAction(friend, G(friend, 'ele'), { x: 3, y: 3 }), undefined, '空格不可冰封');
  const withBody = withFreeze(base([P('ele', 'elephant', 4, 4)]), 'ele', 1);
  withBody.corpses = [corpse('c', 4, 2, 'enemy')];
  assert.equal(R.elephantFreezeAction(withBody, G(withBody, 'ele'), { x: 4, y: 2 }), undefined, '尸体不可冰封');
  const rockState = withFreeze(base([P('ele', 'elephant', 4, 4)], { tiles: { '4,2': 'mountain' } }), 'ele', 1);
  assert.equal(R.elephantFreezeAction(rockState, G(rockState, 'ele'), { x: 4, y: 2 }), undefined, '山不可冰封');
  // 越障/跨河：中间有棋子/尸体/山仍可选敌人
  const blocked = withFreeze(
    base([P('ele', 'elephant', 4, 4), P('blk', 'pawn', 4, 5), E('t', 'rook', 4, 6)], { tiles: { '3,4': 'mountain' } }),
    'ele', 1);
  blocked.corpses = [corpse('c', 5, 4)];
  const rf = freeze(blocked, 'ele', 4, 6);
  assert.ok(rf.effect, '不受遮挡、可跨河选敌人');
  assert.equal(rf.effect.hits.length, 0, '冰封无直接伤害');
  assert.equal(G(rf.state, 't').hp, 2, '目标 HP 不变');
  assert.equal(G(rf.state, 'blk').hp, 1, '遮挡单位不受影响');
  // 界边截断仍可用
  const corner = withFreeze(base([P('ele', 'elephant', 0, 0)]), 'ele', 1);
  corner.units.push(E('t', 'rook', 2, 2));
  assert.ok(R.elephantFreezeAction(corner, G(corner, 'ele'), { x: 2, y: 2 }), '界边截取仍可选范围内目标');
  // 未解锁不可施法且不扣技能
  const lockedState = base([P('ele', 'elephant', 4, 4), E('t', 'rook', 4, 6)], { teamSp: 2 });
  assert.equal(R.elephantFreezeAction(lockedState, G(lockedState, 'ele'), { x: 4, y: 6 }), undefined, '未解锁不可冰封');
  assert.match(R.actionReason(lockedState, 'ele', { x: 4, y: 6 }, 'elephant-freeze'), /2 公共 SP/);
  assert.equal(G(lockedState, 'ele').elephantSkillUsed, false);
});

/* ---------------- E14 冻结时序 ---------------- */
test('E14 冻结 1/2/3 个敌方行动阶段：逐阶段跳过并递减、到期恢复新意图、不补打', () => {
  function setup(duration) {
    let s = mk([P('king', 'king', 4, 0), P('ele', 'elephant', 4, 3), E('t', 'pawn', 4, 1), E('boss', 'king', 8, 8)]);
    s = withFreeze(s, 'ele', duration);
    assert.equal(R.elephantFreezeDurationOf(G(s, 'ele')), duration, '前置：象冻结时长 ' + duration);
    s.intents = [];
    R.prepareEnemy(s);
    const intent = s.intents.find(i => i.actor === 't');
    assert.notEqual(intent.type, 'standby', '前置：敌人原本有攻击意图');
    assert.deepEqual([G(s, 't').x, G(s, 't').y], [4, 1], '前置：有攻击时不提前移动');
    return s;
  }
  for (const duration of [1, 2, 3]) {
    let s = setup(duration);
    const r = freeze(s, 'ele', 4, 1);
    assert.ok(r.effect, '冻结提交');
    assert.equal(G(r.state, 't').frozen, duration, `冻结 ${duration} 阶段`);
    assert.equal(G(r.state, 't').thawStandby, false);
    let cur = r.state;
    for (let phase = 1; phase <= duration; phase++) {
      const before = G(cur, 't').frozen;
      const out = R.enemyTurn(cur);
      cur = out.state;
      const eff = out.effects.find(x => x.actor === 't');
      assert.equal(eff.status, 'standby', `第 ${phase} 阶段冻结为待机`);
      assert.equal(eff.frozen, true);
      assert.equal(eff.hits.length, 0, '冻结阶段不攻击、不补打');
      assert.equal(G(cur, 'king').hp, 3, '冻结阶段主帅不掉血');
      assert.equal(G(cur, 't').frozen, Math.max(0, before - 1), `第 ${phase} 阶段递减`);
      if (cur.phase === 'player') R.prepareEnemy(cur);
    }
    assert.equal(G(cur, 't').frozen, 0, '到期解除');
    assert.equal(G(cur, 't').thawStandby, false);
    R.prepareEnemy(cur);
    const intent = cur.intents.find(i => i.actor === 't');
    assert.notEqual(intent.type, 'standby', '到期恢复正常新意图');
    assert.equal(intent.frozen, undefined, '不再是冻结待机');
    const after = R.enemyTurn(cur);
    const eff = after.effects.find(x => x.actor === 't');
    assert.notEqual(eff.status, 'standby', '到期后按新意图执行（不提前解除、不额外吞回合）');
  }
});

/* ---------------- E15 受伤解冻时序 ---------------- */
test('E15 受伤清除冻结但本回合待机、下回合恢复；无伤位移不解冻；碰撞伤害同样解冻', () => {
  // A. 无伤位移不解冻：e1 冻结 t，e2 牵引另一个目标（无碰撞）
  let s = withFreeze(base([P('e1', 'elephant', 4, 4), P('e2', 'elephant', 8, 4), E('t', 'rook', 4, 6), E('tgt', 'rook', 6, 4)]), 'e1', 1);
  s = R.purchaseUpgrade(addSp(s, 2), 'e2', 'elephant-freeze-unlock');
  s.teamSp = 0;
  const f = freeze(s, 'e1', 4, 6);
  assert.ok(f.effect, 'A. 冰封在 5×5 内');
  assert.equal(G(f.state, 't').frozen, 1);
  const moved = pull(f.state, 'e2', 6, 4);
  assert.ok(moved.effect, 'A. 第二只象牵引另一个目标');
  assert.equal(moved.effect.hits.length, 0, 'A. 无碰撞');
  assert.equal(G(moved.state, 't').frozen, 1, 'A. 无伤位移不解冻');
  assert.deepEqual([G(moved.state, 'tgt').x, G(moved.state, 'tgt').y], [7, 4], 'A. 另一个目标被拉近 1 格');
  // B. 碰撞受伤解冻：另一只象把已冻结目标拉向山
  let s2 = base([P('e1', 'elephant', 0, 3), P('e2', 'elephant', 0, 4), E('t', 'rook', 0, 1)], { tiles: { '0,2': 'mountain' } });
  s2 = withFreeze(s2, 'e1', 1);
  s2 = R.purchaseUpgrade(addSp(s2, 2), 'e2', 'elephant-freeze-unlock');
  s2 = withRange(s2, 'e2', 5);
  s2.teamSp = 0;
  s2.intents = []; R.prepareEnemy(s2);
  assert.notEqual(s2.intents.find(i => i.actor === 't').type, 'standby', 'B. 前置：目标原本有攻击意图');
  const fr = freeze(s2, 'e1', 0, 1);
  assert.ok(fr.effect, 'B. 冰封成功');
  assert.equal(G(fr.state, 't').frozen, 1);
  const pulled = pull(fr.state, 'e2', 0, 1);
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
  let s3 = mk([P('king', 'king', 4, 0), P('tower', 'advisor', 4, 2), P('e1', 'elephant', 5, 4), E('t', 'spearman', 4, 3), E('boss', 'king', 8, 8)]);
  s3 = withFreeze(s3, 'e1', 1);
  s3.intents = []; R.prepareEnemy(s3);
  const plan = R.advisorPlan(s3);
  assert.equal(plan[0].willFire, true, 'C. 仕就绪且有射程内敌人');
  const fc = freeze(s3, 'e1', 4, 3);
  assert.ok(fc.effect, 'C. 冰封相邻敌人');
  const out = R.enemyTurn(fc.state);
  const towerEff = out.effects.find(e => e.actor === 'tower');
  assert.equal(towerEff.status, 'hit', 'C. 仕阶段先命中已冻结目标');
  assert.equal(G(out.state, 't').hp, 1, 'C. 目标实际受伤（枪兵 2 HP→1）');
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
  // 受伤解冻后同回合另一只象再冻：完整本次时长（第三只象提供技能机会）
  let s3 = base([P('a', 'elephant', 5, 6), P('b', 'elephant', 0, 4), P('c', 'elephant', 6, 2), E('t', 'rook', 5, 4)], { tiles: { '3,4': 'mountain' } });
  s3 = withFreeze(s3, 'a', 1);
  s3 = R.purchaseUpgrade(addSp(s3, 2), 'b', 'elephant-freeze-unlock');
  s3 = R.purchaseUpgrade(addSp(s3, 2), 'c', 'elephant-freeze-unlock');
  s3 = withRange(s3, 'b', 5);
  s3.teamSp = 0;
  const fa = freeze(s3, 'a', 5, 4);
  assert.ok(fa.effect);
  assert.equal(G(fa.state, 't').frozen, 1);
  const hit = pull(fa.state, 'b', 5, 4);
  assert.ok(hit.effect, 'b 牵引已冻结目标撞山');
  assert.equal(G(hit.state, 't').frozen, 0, '受伤先解冻');
  assert.equal(G(hit.state, 't').thawStandby, true);
  assert.deepEqual([G(hit.state, 't').x, G(hit.state, 't').y], [4, 4], '受伤后目标停在碰撞前');
  const refreeze = freeze(hit.state, 'c', 4, 4);
  assert.ok(refreeze.effect, '同回合另一只象可重新冰封');
  assert.equal(G(refreeze.state, 't').frozen, 1, '赋予完整本次时长（c 为 1 阶段）');
  assert.equal(G(refreeze.state, 't').thawStandby, false, '重新冰封清除解冻待机');
  assert.equal(G(refreeze.state, 'a').elephantSkillUsed, true, 'a 已用技能');
  assert.equal(G(refreeze.state, 'b').elephantSkillUsed, true, 'b 已用技能（牵引）');
  assert.equal(G(refreeze.state, 'c').elephantSkillUsed, true, '消耗重新冰封的象技能机会');
});

/* ---------------- E17 击杀归属 ---------------- */
test('E17 牵引碰撞/环境击杀归施法象：不重复记奖、友军死亡无奖、终局优先', () => {
  // 碰撞致死敌人 → 归象
  const s = withRange(base([P('ele', 'elephant', 0, 4), E('t', 'pawn', 5, 4), P('w', 'rook', 3, 4)]), 'ele', 5);
  const r = pull(s, 'ele', 5, 4);
  assert.equal(G(r.state, 't'), undefined, '目标被撞死');
  assert.equal(G(r.state, 'ele').kills, 1, '击杀归施法象');
  assert.equal(r.state.teamSp, 1, '公共 SP +1');
  assert.equal(r.state.kills, 1);
  assert.equal(r.state.killLedger['t'], true);
  assert.equal(G(r.state, 'w').hp, 1, '阻挡活体也 −1');
  const again = R.enemyTurn(R.copy(r.state));
  assert.equal(G(again.state, 'ele').kills, 1, '不重复记奖');
  // 入水致死敌人 → 归象
  const sw = base([P('ele', 'elephant', 0, 4), E('p', 'pawn', 2, 4)], { tiles: { '1,4': 'water' } });
  const rw = pull(sw, 'ele', 2, 4);
  assert.equal(G(rw.state, 'p'), undefined, '入水死亡');
  assert.equal(G(rw.state, 'ele').kills, 1, '环境击杀归施法象');
  assert.equal(rw.state.teamSp, 1);
  // 友军死亡无奖励
  const sf = withRange(base([P('ele', 'elephant', 0, 4), P('ally', 'pawn', 3, 4), E('w', 'rook', 5, 4)]), 'ele', 5);
  const rf = pull(sf, 'ele', 5, 4);
  assert.equal(G(rf.state, 'ally'), undefined, '友军被撞死');
  assert.equal(G(rf.state, 'ele').kills, 0, '不奖励友军死亡');
  assert.equal(rf.state.teamSp, 0);
  // 敌将死亡 → 胜负结算优先
  const boss = mk([P('king', 'king', 0, 0), P('ele', 'elephant', 0, 4), P('wall', 'rook', 1, 4), E('boss', 'king', 2, 4)]);
  G(boss, 'boss').hp = 1;
  const rb = pull(boss, 'ele', 2, 4);
  assert.equal(rb.effect.pull.status, 'collision-live', '敌将被拉撞我方单位');
  assert.equal(rb.effect.hits.some(h => h.id === 'boss'), true, '敌将受伤');
  assert.equal(rb.state.phase, 'intermission', '敌将阵亡触发胜利结算');
  assert.equal(rb.state.result, 'victory');
  assert.equal(G(rb.state, 'ele').kills, 1, '击杀归属施法象');
});

/* ---------------- E18 保存边界（规则层） ---------------- */
test('E18 非法/取消不提交；普通移动与成功施法/升级产生新状态与 revision', () => {
  const s = base([P('ele', 'elephant', 4, 4), E('t', 'rook', 4, 6)]);
  const rev = s.revision;
  assert.strictEqual(pull(s, 'ele', 4, 4).state, s, '非法目标不产生新状态');
  assert.equal(s.revision, rev, '非法目标不推进 revision');
  const moved = move(s, 'ele', 2, 2);
  assert.notStrictEqual(moved.state, s, '普通移动产生新状态');
  assert.equal(moved.state.revision, rev + 1, '普通移动推进 revision（界面层不保存）');
  assert.equal(freeze(R.copy(s), 'ele', 4, 6).effect, undefined, '未解锁时不可施法且无副作用');
  let u = withFreeze(s, 'ele', 1);
  assert.equal(G(u, 'ele').elephantSkillUsed, false, '升级不消耗技能');
  const cast = freeze(u, 'ele', 4, 6);
  assert.ok(cast.effect, '成功施法');
  assert.equal(cast.state.revision, u.revision + 1, '成功施法推进 revision（保存点）');
  const upgraded = R.purchaseUpgrade(addSp(u, 3), 'ele', 'elephant-pull-range');
  assert.notStrictEqual(upgraded, u, '成功升级产生新状态（保存点）');
  assert.equal(upgraded.revision, u.revision + 1);
  const poor = addSp(u, 0);
  assert.strictEqual(R.purchaseUpgrade(poor, 'ele', 'elephant-pull-range'), poor, '失败升级不扣费不提交');
});

/* ---------------- E19 跨关/迁移 ---------------- */
test('E19 象升级跨关/后备/失败重试/新旅程；旧档缺字段只补默认，不赠点不刷新行动', () => {
  // 营地为后备象升级，跨关保留
  let camp = R.emptyState([]);
  camp.phase = 'intermission';
  camp.gold = 20; camp.teamSp = 20;
  camp.party = [P('ele', 'elephant', 0, 0), P('rook', 'rook', 0, 0), P('p1', 'pawn', 0, 0), P('p2', 'pawn', 0, 0), P('p3', 'pawn', 0, 0)];
  camp.activeIds = ['rook', 'p1', 'p2', 'p3'];
  camp.bench = ['ele'];
  camp = R.purchaseUpgrade(camp, 'ele', 'elephant-pull-range');
  camp = R.purchaseUpgrade(camp, 'ele', 'elephant-freeze-unlock');
  assert.equal(R.elephantPullRangeOf(camp.party.find(u => u.kind === 'elephant')), 4, '后备象可升级');
  const record = R.journeyRecord(camp);
  const restored = R.stateFromJourney(record);
  const restoredEle = restored.party.find(u => u.kind === 'elephant');
  assert.equal(R.elephantPullRangeOf(restoredEle), 4, '存档保留牵引射程');
  assert.equal(R.elephantFreezeUnlocked(restoredEle), true, '存档保留冰封解锁');
  assert.equal(R.elephantFreezeDurationOf(restoredEle), 1);
  assert.ok(restored.bench.includes('ele'), '后备身份保留');
  // 进入下一关：升级保留、行动刷新、不赠点
  const lvl = R.startLevel(Object.assign(R.copy(restored), { completed: 1 }), R.defaultMap());
  const lvlEle = (lvl.party || []).find(u => u.kind === 'elephant');
  assert.equal(R.elephantPullRangeOf(lvlEle), 4, '跨关保留升级');
  assert.equal(lvl.teamSp, restored.teamSp, '不赠送公共 SP');
  assert.equal(lvl.gold, restored.gold, '不赠送猫粮');
  const onBoard = lvl.units.find(u => u.id === 'ele');
  if (onBoard) {
    assert.equal(R.elephantPullRangeOf(onBoard), 4, '上场象保留升级');
    assert.equal(onBoard.ap > 0 || lvl.phase === 'deploy', true, '入关行动正常');
  }
  // 失败重试回入关快照
  const dead = R.copy(lvl);
  dead.phase = 'result'; dead.result = 'dead';
  const retry = R.retryLevel(dead);
  assert.ok(retry.party.some(u => u.kind === 'elephant'), '重试保留队伍');
  assert.equal(R.elephantPullRangeOf(retry.party.find(u => u.kind === 'elephant')), 4, '重试回入关快照保留升级');
  // 新旅程重置
  assert.ok(!R.newGame().party.some(u => u.kind === 'elephant'), '新旅程不保留象');
  // 旧档缺字段：只补默认，不赠点、不刷新行动
  const legacy = R.emptyState([P('ele', 'elephant', 4, 4)]);
  const ele = G(legacy, 'ele');
  delete ele.elephantPullRange; delete ele.elephantFreezeUnlocked; delete ele.elephantFreezeDuration; delete ele.elephantSkillUsed;
  ele.ap = 0;
  const migrated = R.migrateState(legacy);
  const m = migrated.units.find(u => u.id === 'ele');
  assert.equal(R.elephantPullRangeOf(m), 3, '补齐默认牵引射程');
  assert.equal(R.elephantFreezeUnlocked(m), false, '旧档不因迁移获得冰封');
  assert.equal(m.elephantSkillUsed, true, '已用完行动的旧档不刷新技能');
  assert.equal(migrated.teamSp, 0, '迁移不赠公共 SP');
  // 迁移不覆盖新版本字段
  const used = base([P('ele', 'elephant', 4, 4)]);
  G(used, 'ele').elephantSkillUsed = true;
  G(used, 'ele').elephantFreezeUnlocked = true;
  G(used, 'ele').elephantFreezeDuration = 3;
  const kept = R.migrateState(used).units.find(u => u.id === 'ele');
  assert.equal(kept.elephantSkillUsed, true);
  assert.equal(kept.elephantFreezeUnlocked, true);
  assert.equal(R.elephantFreezeDurationOf(kept), 3, '保留新版本升级');
});
