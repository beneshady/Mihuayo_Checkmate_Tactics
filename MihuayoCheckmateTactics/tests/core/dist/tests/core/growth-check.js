"use strict";
/**
 * P3 成长与帅增益 Core 测试（纯 TS）：对齐原型 preview/web/js/rules.js 的
 * chooseCommanderBuff / purchaseUpgrade / upgradeChoices / rescue / attemptSpawns 语义。
 *
 * 运行：在 tests/core 目录下
 *   tsc -p tsconfig.json
 *   node dist/tests/core/growth-check.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const Campaign_1 = require("../../assets/Scripts/Core/Campaign");
const Rules_1 = require("../../assets/Scripts/Core/Rules");
const Actions_1 = require("../../assets/Scripts/Core/Actions");
const Growth_1 = require("../../assets/Scripts/Core/Growth");
const Waves_1 = require("../../assets/Scripts/Core/Waves");
const fs_1 = require("fs");
const path_1 = require("path");
// ---------- 断言助手 ----------
let passed = 0;
const failures = [];
function assert(cond, name) {
    if (cond) {
        passed++;
    }
    else {
        failures.push(name);
    }
}
function eq(actual, expected, name) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    assert(a === b, `${name}（实际 ${a} ≠ 期望 ${b}）`);
}
// ---------- 战局构造 ----------
function unitById(state, id) {
    const unit = state.units.find((u) => u.id === id);
    if (!unit) {
        throw new Error(`测试构造错误：找不到单位 ${id}`);
    }
    return unit;
}
/** 干净 9×9 地图 + 指定单位（缺帅自动补，对齐 run.ts 的 makeState 模式） */
function makeState(units, phase = 'player') {
    const all = [...units];
    const occupied = new Set(all.map((u) => `${u.x},${u.y}`));
    if (!all.some((u) => u.side === 'player' && u.kind === 'king')) {
        all.push({ id: 'king', side: 'player', kind: 'king', x: 4, y: 0 });
        occupied.add('4,0');
    }
    if (!all.some((u) => u.side === 'enemy' && u.kind === 'king')) {
        all.push({ id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 });
    }
    return (0, Rules_1.startBattle)({
        formatVersion: 2,
        meta: { kind: 'battleInit', battleId: 'test' },
        map: { name: '测试图', tiles: {} },
        units: all,
        turn: { round: 1, phase },
    });
}
/** 对齐原型 fixtureState('P3') 默认变体：sp=2 的炮 + 三方向溅射靶 */
function makeP3Fixture() {
    const state = makeState([
        { id: 'cannon', side: 'player', kind: 'cannon', x: 4, y: 1 },
        { id: 'screen', side: 'enemy', kind: 'pawn', x: 4, y: 3 },
        { id: 'target', side: 'enemy', kind: 'rook', x: 4, y: 5 },
        { id: 'north', side: 'enemy', kind: 'rook', x: 4, y: 6 },
        { id: 'east', side: 'enemy', kind: 'rook', x: 5, y: 5 },
    ]);
    unitById(state, 'cannon').sp = 2;
    return state;
}
function findProjectRoot() {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        try {
            (0, fs_1.readFileSync)((0, path_1.join)(dir, 'assets', 'resources', 'Levels', 'level-list.json'), 'utf8');
            return dir;
        }
        catch {
            dir = (0, path_1.join)(dir, '..');
        }
    }
    throw new Error('找不到项目根');
}
function loadLevelState(id) {
    const raw = (0, fs_1.readFileSync)((0, path_1.join)(findProjectRoot(), 'assets', 'resources', 'Levels', `${id}.json`), 'utf8');
    return (0, Campaign_1.constructLevel)(null, JSON.parse(raw));
}
// ---------- T1 purchaseUpgrade：炮溅射（对拍 P3 默认夹具） ----------
{
    const state = makeP3Fixture();
    const rejected = (0, Growth_1.purchaseUpgrade)(state, 'cannon', 'cannon-splash', 8);
    assert(rejected === state, 'T1 溅射 index 越界 → 原引用');
    const first = (0, Growth_1.purchaseUpgrade)(state, 'cannon', 'cannon-splash', 0);
    assert(first !== state, 'T1 买北向溅射 → 新引用');
    eq(unitById(first, 'cannon').cannonMask, 1, 'T1 北向掩码 = 1');
    eq(unitById(first, 'cannon').sp, 1, 'T1 扣 1 SP');
    const second = (0, Growth_1.purchaseUpgrade)(first, 'cannon', 'cannon-splash', 2);
    eq(unitById(second, 'cannon').cannonMask, 5, 'T1 东向掩码 = 1|4 = 5');
    eq(unitById(second, 'cannon').sp, 0, 'T1 SP 耗尽');
    eq(second.revision, (state.revision ?? 0) + 2, 'T1 每次购买 revision +1');
    const third = (0, Growth_1.purchaseUpgrade)(second, 'cannon', 'cannon-splash', 5);
    assert(third === second, 'T1 SP 不足 → 原引用');
    // 演练：双方向溅射后一次攻击命中 3 个（原型 P3 演示点）
    const cannon = unitById(second, 'cannon');
    const action = (0, Actions_1.actionAt)(second, cannon, { x: 4, y: 5 }, 'attack');
    assert(!!action, 'T1 炮对 (4,5) 生成攻击动作');
    if (action) {
        const submitted = (0, Rules_1.submitAction)(second, action);
        const hitIds = submitted.effect ? submitted.effect.hits.map((h) => h.id) : [];
        eq([hitIds.includes('target'), hitIds.includes('north'), hitIds.includes('east')], [true, true, true], 'T1 溅射命中 target/north/east 三向');
    }
}
// ---------- T2 purchaseUpgrade：fortify / 车 / 弓 / 兵 ----------
{
    const rookState = makeState([{ id: 'r1', side: 'player', kind: 'rook', x: 0, y: 0 }]);
    unitById(rookState, 'r1').sp = 12; // 预算：fortify 1 + 换职 2 + 震退 1 + 冲锋 1→8 共 7 = 11
    const fortified = (0, Growth_1.purchaseUpgrade)(rookState, 'r1', 'fortify');
    const r = unitById(fortified, 'r1');
    eq([r.maxHp - unitById(rookState, 'r1').maxHp, r.fortify, r.sp], [1, 1, 11], 'T2 fortify：maxHp+1、fortify+1、扣 1 SP');
    const chargeRole = (0, Growth_1.purchaseUpgrade)(fortified, 'r1', 'rook-charge-role');
    const rc = unitById(chargeRole, 'r1');
    eq([rc.rookRole, rc.rookChargeAvailable, rc.sp], ['charge', true, 9], 'T2 换职冲锋（2 SP）');
    const pushed = (0, Growth_1.purchaseUpgrade)(chargeRole, 'r1', 'rook-push');
    eq(unitById(pushed, 'r1').rookPush, true, 'T2 解锁震退');
    const rangeStart = unitById(pushed, 'r1').rookChargeRange;
    let cur = pushed;
    let buys = 0;
    while (unitById(cur, 'r1').rookChargeRange < 8 && buys < 20) {
        cur = (0, Growth_1.purchaseUpgrade)(cur, 'r1', 'rook-charge');
        buys++;
    }
    assert(cur !== pushed, 'T2 冲锋距离可购买至 8');
    eq(buys, 8 - rangeStart, 'T2 冲锋购买次数 = 差值');
    const capped = (0, Growth_1.purchaseUpgrade)(cur, 'r1', 'rook-charge');
    assert(capped === cur, 'T2 冲锋距离上限 8 后拒绝');
    const wrongRole = (0, Growth_1.purchaseUpgrade)(cur, 'r1', 'rook-pull');
    assert(wrongRole === cur, 'T2 pull 职位才能买 rook-pull');
}
{
    const archer = makeState([{ id: 'a1', side: 'player', kind: 'archer', x: 4, y: 3 }]);
    unitById(archer, 'a1').sp = 9;
    const d1 = (0, Growth_1.purchaseUpgrade)(archer, 'a1', 'direction', 1);
    eq(unitById(d1, 'a1').directionPaid[1], 1, 'T2 弓方向射程 +1');
    const bad = (0, Growth_1.purchaseUpgrade)(archer, 'a1', 'direction', 4);
    assert(bad === archer, 'T2 方向索引越界 → 原引用');
    const pawn = makeState([{ id: 'p1', side: 'player', kind: 'pawn', x: 1, y: 3 }]);
    unitById(pawn, 'p1').sp = 4;
    const promoted = (0, Growth_1.purchaseUpgrade)(pawn, 'p1', 'promote-archer');
    const pa = unitById(promoted, 'p1');
    eq([pa.kind, pa.attack, pa.sp], ['archer', 2, 2], 'T2 兵转弓（2 SP、攻击 2）');
    const again = (0, Growth_1.purchaseUpgrade)(promoted, 'p1', 'promote-spearman');
    assert(again === promoted, 'T2 非兵不能转职（弓不能再转枪）→ 原引用');
    const combo = (0, Growth_1.purchaseUpgrade)(pawn, 'p1', 'combo');
    eq(unitById(combo, 'p1').combo, 1, 'T2 兵连击 +1');
}
// ---------- T3 skillCost ----------
eq((0, Growth_1.skillCost)('promote-archer'), 2, 'T3 转职 2 SP');
eq((0, Growth_1.skillCost)('combo'), 2, 'T3 连击 2 SP');
eq((0, Growth_1.skillCost)('fortify'), 1, 'T3 强健 1 SP');
eq((0, Growth_1.skillCost)('cannon-splash'), 1, 'T3 溅射 1 SP');
// ---------- T4 upgradeChoices ----------
{
    const cannon = makeP3Fixture();
    const choices = (0, Growth_1.upgradeChoices)(cannon);
    eq(choices.length, 9, 'T4 sp2 炮：fortify + 8 向溅射 = 9 项');
    eq(choices.every((c) => c.unitId === 'cannon'), true, 'T4 全部属于炮');
    eq(choices[0].state.revision, (cannon.revision ?? 0) + 1, 'T4 选项携带执行后的新状态');
    const noSp = makeState([{ id: 'c2', side: 'player', kind: 'cannon', x: 1, y: 1 }]);
    eq((0, Growth_1.upgradeChoices)(noSp).length, 0, 'T4 sp0 无可选项');
    const rookState = makeState([{ id: 'r2', side: 'player', kind: 'rook', x: 0, y: 0 }]);
    unitById(rookState, 'r2').sp = 2;
    eq((0, Growth_1.upgradeChoices)(rookState).length, 3, 'T4 base 车：fortify + 两换职 = 3 项（范围/震退需先换职）');
}
// ---------- T4b skillOfferings（面板渲染数据） ----------
{
    const pawn = makeState([{ id: 'p9', side: 'player', kind: 'pawn', x: 1, y: 3 }]);
    eq((0, Growth_1.skillOfferings)(pawn, 'p9').length, 4, 'T4b 兵：强健 + 两转职 + 连动 = 4 项');
    const baseRook = makeState([{ id: 'r9', side: 'player', kind: 'rook', x: 0, y: 0 }]);
    eq((0, Growth_1.skillOfferings)(baseRook, 'r9').length, 3, 'T4b base 车：强健 + 两换职 = 3 项');
    const chargeRook = makeState([{ id: 'rc9', side: 'player', kind: 'rook', x: 0, y: 0, rookRole: 'charge' }]);
    unitById(chargeRook, 'rc9').sp = 5;
    const chargeItems = (0, Growth_1.skillOfferings)(chargeRook, 'rc9');
    eq(chargeItems.length, 3, 'T4b 冲锋车：强健 + 冲锋延伸 + 震退 = 3 项');
    eq(chargeItems.filter((i) => i.maxed).map((i) => i.skill), [], 'T4b 未解锁震退不标 maxed');
    const maxed = (0, Growth_1.purchaseUpgrade)(chargeRook, 'rc9', 'rook-push');
    eq((0, Growth_1.skillOfferings)(maxed, 'rc9').filter((i) => i.skill === 'rook-push')[0].maxed, true, 'T4b 已解锁震退标 maxed');
    const archer = makeState([{ id: 'a9', side: 'player', kind: 'archer', x: 4, y: 3 }]);
    eq((0, Growth_1.skillOfferings)(archer, 'a9').length, 6, 'T4b 弓共 6 项（强健+连动+4 向）');
    eq((0, Growth_1.skillOfferings)(archer, 'a9').filter((i) => i.skill === 'direction').length, 4, 'T4b 弓 4 个方向项');
    const cannon = makeP3Fixture();
    const cannonItems = (0, Growth_1.skillOfferings)(cannon, 'cannon');
    eq(cannonItems.length, 9, 'T4b 炮：强健 + 8 向扩散 = 9 项');
    eq(cannonItems[1].skill, 'cannon-splash', 'T4b 第 2 项为扩散 N');
    eq(cannonItems[3].index, 2, 'T4b E 向 index=2');
    const unknown = (0, Growth_1.skillOfferings)(cannon, 'ghost');
    eq(unknown.length, 0, 'T4b 未知/敌方单位 → 空列表');
}
// ---------- T5 阶段校验 ----------
{
    const state = makeP3Fixture();
    state.turn.phase = 'result';
    const rejected = (0, Growth_1.purchaseUpgrade)(state, 'cannon', 'fortify');
    assert(rejected === state, 'T5 非 player/intermission 阶段 → 原引用');
}
// ---------- T6 chooseCommanderBuff（campaign 流程） ----------
{
    const deployState = loadLevelState('level-01');
    eq(deployState.turn.phase, 'deploy', 'T6 关卡初始为 deploy 态');
    const bad = (0, Growth_1.chooseCommanderBuff)(deployState, 'gold');
    assert(bad === deployState, 'T6 非法增益 → 原引用');
    const confirmed = (0, Campaign_1.confirmDeployment)(deployState);
    eq(confirmed.turn.phase, 'commander', 'T6 布阵确认 → commander 阶段');
    const chosen = (0, Growth_1.chooseCommanderBuff)(confirmed, 'health');
    eq(chosen.turn.phase, 'player', 'T6 选定增益 → player');
    eq(chosen.commanderBuff, 'health', 'T6 记录所选增益');
    const pawn = chosen.units.find((u) => u.side === 'player' && u.kind === 'pawn');
    const king = chosen.units.find((u) => u.kind === 'king');
    const advisor = chosen.units.find((u) => u.kind === 'advisor');
    assert(!!pawn, 'T6 关卡 1 含兵');
    assert(!!king && !!advisor, 'T6 关卡 1 含帅与士');
    if (pawn && king && advisor) {
        const pawnBase = confirmed.units.find((u) => u.id === pawn.id);
        eq([pawn.maxHp - pawnBase.maxHp, pawn.commanderHealth], [1, 1], 'T6 health：兵 maxHp+1 且记录来源');
        eq(king.maxHp, confirmed.units.find((u) => u.kind === 'king').maxHp, 'T6 帅不吃增益');
        eq(advisor.maxHp, confirmed.units.find((u) => u.kind === 'advisor').maxHp, 'T6 士不吃增益');
    }
    const again = (0, Growth_1.chooseCommanderBuff)(chosen, 'move');
    assert(again === chosen, 'T6 非 commander 阶段再选 → 原引用');
    const movePick = (0, Growth_1.chooseCommanderBuff)(confirmed, 'move');
    const rook = movePick.units.find((u) => u.kind === 'rook');
    const horse = movePick.units.find((u) => u.kind === 'horse');
    eq(rook?.commanderMove ?? 0, 1, 'T6 move：车获得 +1 机动');
    eq(horse?.commanderMove ?? 0, 0, 'T6 move：马不吃机动');
    const rescuePick = (0, Growth_1.chooseCommanderBuff)(confirmed, 'rescue');
    const anyBuffed = rescuePick.units.some((u) => u.commanderHealth || u.commanderMove);
    eq(anyBuffed, false, 'T6 rescue 零字段变化（延后到救援时刻）');
}
// ---------- T7 rescue ----------
{
    // e1 故意占 (2,5)（第二波出生格之一）：同时覆盖 blocked-enemy 分支
    const state = makeState([
        { id: 'hurt', side: 'player', kind: 'rook', x: 0, y: 0 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 2, y: 5 },
    ]);
    const hurt = unitById(state, 'hurt');
    hurt.hp = 1;
    state.turn.phase = 'rescue';
    state.rescueRequired = true;
    state.intents = [];
    const revived = (0, Growth_1.rescue)(state, 'hurt');
    assert(revived !== state, 'T7 救活 → 新引用');
    const r = unitById(revived, 'hurt');
    eq([r.hp, r.maxHp], [r.maxHp, r.maxHp], 'T7 救活回满血');
    eq([revived.rescueUsed, revived.turn.phase, revived.wave], [true, 'player', 2], 'T7 已用标记 / 回 player / 进第二波');
    const spawned = (revived.pendingSpawns ?? []).filter((p) => p.status === 'spawned').length;
    const blocked = (revived.pendingSpawns ?? []).filter((p) => p.status === 'blocked').length;
    eq([spawned, blocked], [5, 1], 'T7 第二波 5 入场 + 1 被旧敌阻挡');
    eq(revived.units.filter((u) => u.side === 'enemy').length, 2 + 5, 'T7 场上敌数 = 旧敌 2（含帅）+ 新 5');
    eq(revived.revision, (state.revision ?? 0) + 1, 'T7 revision +1');
    const twice = (0, Growth_1.rescue)(revived, 'hurt');
    assert(twice === revived, 'T7 每关一次 → 原引用');
    const wrongId = (0, Growth_1.rescue)(state, 'nobody');
    assert(wrongId === state, 'T7 无效 id → 原引用');
}
{
    // 尸体复活分支
    const state = makeState([{ id: 'ally', side: 'player', kind: 'pawn', x: 1, y: 1 }]);
    const dead = JSON.parse(JSON.stringify(unitById(state, 'ally')));
    dead.id = 'p1';
    state.corpses = [{ id: 'body-p1', x: 3, y: 2, unit: dead }];
    state.turn.phase = 'rescue';
    const out = (0, Growth_1.rescue)(state, 'p1');
    assert(out !== state, 'T7 尸体复活 → 新引用');
    const revived = out.units.find((u) => u.id === 'p1');
    eq([revived?.x, revived?.y, revived?.hp], [3, 2, 1], 'T7 原格复活、HP 1');
    eq(out.corpses?.length ?? 0, 0, 'T7 尸体已移除');
}
// ---------- T8 attemptSpawns：友军占格阻挡 ----------
{
    const state = makeState([{ id: 'blocker', side: 'player', kind: 'rook', x: 2, y: 5 }]);
    const hpBefore = unitById(state, 'blocker').hp;
    state.pendingSpawns = [{ id: 'w2-0', kind: 'pawn', x: 2, y: 5, status: 'pending' }];
    const effects = (0, Waves_1.attemptSpawns)(state);
    eq(effects.length, 1, 'T8 一个出生点一条效果');
    eq(effects[0].status, 'blocked', 'T8 效果报 blocked');
    eq(state.pendingSpawns[0].status, 'blocked', 'T8 待入场状态 blocked');
    eq(unitById(state, 'blocker').hp, hpBefore - 1, 'T8 占格友军扣 1 血');
    eq(state.units.filter((u) => u.id === 'w2-0').length, 0, 'T8 未入场');
}
// ---------- 收尾 ----------
if (failures.length) {
    console.error(`P3 成长测试：通过 ${passed} 项，失败 ${failures.length} 项`);
    failures.forEach((f) => console.error(`  ✗ ${f}`));
    process.exit(1);
}
else {
    console.log(`P3 成长测试：通过 ${passed} 项断言，失败 0 项`);
}
