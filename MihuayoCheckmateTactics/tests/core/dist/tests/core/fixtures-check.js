"use strict";
/**
 * US-006 演练夹具关卡回归：验证每个夹具的关键演示点在 Core 规则下真实成立
 * （准备走位 / 冻结意图 / 走开落空 / 击杀炮架 / 挪架双炮架 / 序贯连锁 / 预览=实际）。
 * 与 run.ts 同一编译管线；关卡 JSON 直接读 assets/resources/Levels。
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const BattleState_1 = require("../../assets/Scripts/Core/BattleState");
const EnemyTelegraph_1 = require("../../assets/Scripts/Core/EnemyTelegraph");
const defs_1 = require("./defs");
/// <reference path="./node.d.ts" />
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
const defs = (0, defs_1.buildDefs)();
function loadLevel(id) {
    const raw = (0, fs_1.readFileSync)((0, path_1.join)((0, defs_1.findProjectRoot)(), 'assets', 'resources', 'Levels', `${id}.json`), 'utf8');
    return (0, BattleState_1.parseBattleState)(JSON.parse(raw));
}
function unitById(state, id) {
    const unit = state.units.find((u) => u.id === id);
    if (!unit) {
        throw new Error(`夹具构造错误：找不到单位 ${id}`);
    }
    return unit;
}
/** 与 GameManager.startEnemyPrep 同序：先逐个落位准备移动，再冻结意图 */
function runPrepPhase(state) {
    const moves = (0, EnemyTelegraph_1.planEnemyPrep)(state, defs);
    for (const move of moves) {
        unitById(state, move.unitId).pos = { ...move.to };
    }
    state.intents = (0, EnemyTelegraph_1.generateEnemyIntents)(state, defs);
}
// ---------- 夹具 1 · 敌方预告基础 ----------
{
    const state = loadLevel('fixture-01-basics');
    const moves = (0, EnemyTelegraph_1.planEnemyPrep)(state, defs);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}`), ['e1:4,3', 'e2:6,4'], 'F1 准备走位（e1 逼近 s1，e2 同距按坐标）');
    runPrepPhase(state);
    const sim = (0, EnemyTelegraph_1.simulateIntents)(state, defs);
    eq(sim[0].status, 'hit', 'F1 e1 预计命中 s1');
    eq(sim[0].victim?.hpAfter, 15, 'F1 s1 受击存活（50-35=15，可演示走开落空）');
    eq(sim[1].status, 'standby', 'F1 e2 待机（灰格演示点）');
    // 演示点回归：玩家把 s1 走开 → 落空
    const intents = state.intents;
    state.units.splice(state.units.indexOf(unitById(state, 's1')), 1);
    eq((0, EnemyTelegraph_1.applyIntent)(state, defs, intents[0]).status, 'miss', 'F1 受害者走开 → 落空');
}
// ---------- 夹具 2 · 炮架攻防 ----------
{
    const state = loadLevel('fixture-02-cannon-rack');
    const moves = (0, EnemyTelegraph_1.planEnemyPrep)(state, defs);
    eq(moves.map((m) => m.unitId), ['e3'], 'F2 炮与炮架均有攻击保持原位，仅远兵走位');
    runPrepPhase(state);
    const sim = (0, EnemyTelegraph_1.simulateIntents)(state, defs);
    eq(sim[0].toPos, { x: 2, y: 2 }, 'F2 炮瞄准车 c1');
    eq(sim[0].victim?.hpAfter, 70, 'F2 预计伤害 120-50');
    eq(sim[1].victim?.unitId, 'm1', 'F2 炮架马转而威胁 m1（有攻击原地）');
    // 演示点回归①：击杀炮架 e2 → 缺少炮架
    const noRackState = JSON.parse(JSON.stringify(state));
    noRackState.units.splice(noRackState.units.findIndex((u) => u.id === 'e2'), 1);
    const noRackIntents = noRackState.intents;
    eq((0, EnemyTelegraph_1.applyIntent)(noRackState, defs, noRackIntents[0]).reason, '缺少炮架', 'F2 击杀炮架 → 失效');
    // 演示点回归②：m1 走进炮线 (4,2) → 双炮架
    const twoRackState = JSON.parse(JSON.stringify(state));
    unitById(twoRackState, 'm1').pos = { x: 4, y: 2 };
    const twoRackIntents = twoRackState.intents;
    eq((0, EnemyTelegraph_1.applyIntent)(twoRackState, defs, twoRackIntents[0]).reason, '炮架数量不为一', 'F2 挪入第二个炮架 → 失效');
    // 演示点回归③：c1 走开 → 射空
    const emptyState = JSON.parse(JSON.stringify(state));
    emptyState.units.splice(emptyState.units.findIndex((u) => u.id === 'c1'), 1);
    const emptyIntents = emptyState.intents;
    eq((0, EnemyTelegraph_1.applyIntent)(emptyState, defs, emptyIntents[0]).reason, '射空（落点无目标）', 'F2 目标走开 → 射空');
}
// ---------- 夹具 3 · 序贯连锁 ----------
{
    const state = loadLevel('fixture-03-chain');
    const moves = (0, EnemyTelegraph_1.planEnemyPrep)(state, defs);
    eq(moves.map((m) => m.unitId), ['e3'], 'F3 前两敌有攻击原地，仅远兵走位');
    runPrepPhase(state);
    const sim = (0, EnemyTelegraph_1.simulateIntents)(state, defs);
    eq(sim.map((f) => f.status), ['hit', 'invalid', 'standby'], 'F3 连锁预测：击杀 S → 炮失炮架失效');
    eq(sim[0].victim?.dies, true, 'F3 低血 S 被前序击杀');
    eq(sim[1].reason, '缺少炮架', 'F3 后序炮因前序击杀失效');
    const executed = state.intents.map((i) => (0, EnemyTelegraph_1.applyIntent)(state, defs, i).status);
    eq(executed, sim.map((f) => f.status), 'F3 执行与预测一致（预览=实际）');
}
// ---------- 主线关回归（US-006 布帅后敌方应有走位/意图） ----------
{
    const state = loadLevel('level-01');
    const moves = (0, EnemyTelegraph_1.planEnemyPrep)(state, defs);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}`), ['u4:6,3'], 'L1 敌兵单步逼近帅（step 走法每轮一格）');
    runPrepPhase(state);
    const sim = (0, EnemyTelegraph_1.simulateIntents)(state, defs);
    eq(sim.map((f) => f.status), ['standby'], 'L1 首轮敌兵尚无合法攻击 → 待机');
    assert(!(0, EnemyTelegraph_1.isHumanKingDead)(state), 'L1 帅在场且存活');
}
{
    const state = loadLevel('level-02');
    const moves = (0, EnemyTelegraph_1.planEnemyPrep)(state, defs);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}`), ['u4:6,3', 'u5:7,5'], 'L2 两敌兵各自单步逼近帅（实时占位不叠子）');
    runPrepPhase(state);
    const sim = (0, EnemyTelegraph_1.simulateIntents)(state, defs);
    eq(sim.map((f) => f.status), ['standby', 'standby'], 'L2 首轮双待机');
    assert(!(0, EnemyTelegraph_1.isHumanKingDead)(state), 'L2 帅在场且存活');
}
console.log(`\n夹具验证：通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`  [FAIL] ${failure}`);
    }
    process.exit(1);
}
