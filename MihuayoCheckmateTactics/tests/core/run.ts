/**
 * US-006 敌方预告回合 · Core 规则测试（纯 TS，零引擎依赖）。
 *
 * 运行：在 tests/core 目录下
 *   tsc -p tsconfig.json
 *   node dist/tests/core/run.js
 *
 * 棋种定义内联自 assets/Defs/unit-defs.json 的关键数值（M0 测试从简；
 * 数值若调整需同步此处）。场景全部用 plain 地形 9×9 空盘构造。
 */

/// <reference path="./node.d.ts" />

import { parseBattleState, BattleState, BattleUnit } from '../../assets/Scripts/Core/BattleState';
import { parseUnitDefs, UnitDef } from '../../assets/Scripts/Core/UnitDefs';
import {
    planEnemyPrep,
    generateEnemyIntents,
    applyIntent,
    simulateIntents,
    isHumanKingDead,
} from '../../assets/Scripts/Core/EnemyTelegraph';

/** 测试运行在 Node 下（避免为断言退出码引入 @types/node 依赖） */
declare const process: { exit(code?: number): never };

// ---------- 断言助手 ----------

let passed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string): void {
    if (cond) {
        passed++;
    } else {
        failures.push(name);
    }
}

function eq(actual: unknown, expected: unknown, name: string): void {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    assert(a === b, `${name}（实际 ${a} ≠ 期望 ${b}）`);
}

// ---------- 定义与战局构造 ----------

function step4(): UnitDef['moveSpecs'] {
    return [
        { type: 'step', dir: { dx: 1, dy: 0 }, passage: 'solid' },
        { type: 'step', dir: { dx: -1, dy: 0 }, passage: 'solid' },
        { type: 'step', dir: { dx: 0, dy: 1 }, passage: 'solid' },
        { type: 'step', dir: { dx: 0, dy: -1 }, passage: 'solid' },
    ];
}

function slide4(): UnitDef['moveSpecs'] {
    return [
        { type: 'slide', dir: { dx: 1, dy: 0 }, passage: 'solid' },
        { type: 'slide', dir: { dx: -1, dy: 0 }, passage: 'solid' },
        { type: 'slide', dir: { dx: 0, dy: 1 }, passage: 'solid' },
        { type: 'slide', dir: { dx: 0, dy: -1 }, passage: 'solid' },
    ];
}

function horseJumps(): UnitDef['moveSpecs'] {
    const spec = (dx: number, dy: number, lx: number, ly: number) => ({
        type: 'jump' as const,
        dir: { dx, dy },
        passage: 'leg' as const,
        leg: { dx: lx, dy: ly },
    });
    return [
        spec(1, 2, 0, 1), spec(-1, 2, 0, 1), spec(1, -2, 0, -1), spec(-1, -2, 0, -1),
        spec(2, 1, 1, 0), spec(2, -1, 1, 0), spec(-2, 1, -1, 0), spec(-2, -1, -1, 0),
    ];
}

const defs: UnitDef[] = parseUnitDefs({
    formatVersion: 1,
    units: [
        { id: 'shuai', name: '帅', maxHp: 140, attack: 0, maxStamina: 2, moveCost: 1, attackCost: 1, onlyOnTerrain: 'road', moveSpecs: [], attackSpecs: [] },
        { id: 'che', name: '车', maxHp: 120, attack: 45, maxStamina: 2, moveCost: 1, attackCost: 1, moveSpecs: slide4(), attackSpecs: step4() },
        { id: 'ma', name: '马', maxHp: 100, attack: 35, maxStamina: 2, moveCost: 1, attackCost: 1, moveSpecs: horseJumps() },
        { id: 'pao', name: '炮', maxHp: 80, attack: 50, maxStamina: 2, moveCost: 1, attackCost: 1, moveSpecs: slide4(), attackSpecs: slide4().map((s) => ({ ...s, passage: 'screen' as const, screen: 1 })) },
        { id: 'soldier', name: '兵', maxHp: 80, attack: 35, maxStamina: 2, moveCost: 1, attackCost: 1, moveSpecs: step4() },
    ],
});

interface UnitSpec {
    id: string;
    defId: string;
    owner: string;
    x: number;
    y: number;
    hp?: number;
}

function makeState(units: UnitSpec[]): BattleState {
    const size = 9;
    return parseBattleState({
        formatVersion: 1,
        meta: { kind: 'battleInit', battleId: 'test' },
        rules: { rulesetId: 'core-v1', params: {} },
        map: {
            gridType: 'square',
            width: size,
            height: size,
            layers: [{ id: 'terrain', type: 'tileGrid', default: 'plain', cells: Array.from({ length: size }, () => Array.from({ length: size }, () => 'plain')) }],
        },
        players: [
            { id: 'p1', name: '我方', controller: 'human' },
            { id: 'p2', name: '敌方', controller: 'ai' },
        ],
        units: units.map((u): Record<string, unknown> => ({
            id: u.id,
            defId: u.defId,
            owner: u.owner,
            pos: { x: u.x, y: u.y },
            ...(u.hp !== undefined ? { hp: u.hp } : {}),
        })),
        turn: { round: 1, order: ['p1'], active: 'p1', phase: 'command' },
        result: null,
    });
}

function unitById(state: BattleState, id: string): BattleUnit {
    const unit = state.units.find((u) => u.id === id);
    if (!unit) {
        throw new Error(`测试构造错误：找不到单位 ${id}`);
    }
    return unit;
}

// ---------- T1 准备阶段：稳定顺序、实时占位不叠子、规划不改原局（AC01） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 6, y: 6 },
        { id: 'e2', defId: 'soldier', owner: 'p2', x: 6, y: 5 },
    ]);
    const moves = planEnemyPrep(state, defs);
    eq(moves.map((m) => m.unitId), ['e1', 'e2'], 'T1 准备顺序=出生顺序');
    eq(moves[0].to, { x: 5, y: 6 }, 'T1 e1 逼近选点（(6,5) 被同伴占，取 (5,6)）');
    eq(moves[1].to, { x: 6, y: 4 }, 'T1 e2 同距按 y 坐标选 (6,4)');
    eq(unitById(state, 'e1').pos, { x: 6, y: 6 }, 'T1 规划不改动原局（纯函数）');
}

// ---------- T2 准备阶段：已有合法攻击则原地（AC01/AC02） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'm', defId: 'soldier', owner: 'p1', x: 2, y: 0 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 3, y: 0 },
    ]);
    const moves = planEnemyPrep(state, defs);
    eq(moves.length, 0, 'T2 有合法攻击的敌人保持原位');
}

// ---------- T3 意图冻结：候选、优先级与待机（AC02） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'c1', defId: 'che', owner: 'p1', x: 0, y: 4 },
        { id: 's1', defId: 'soldier', owner: 'p1', x: 2, y: 6 },
        { id: 'e1', defId: 'pao', owner: 'p2', x: 6, y: 4 },
        { id: 'e2', defId: 'ma', owner: 'p2', x: 5, y: 4 },
        { id: 'e3', defId: 'soldier', owner: 'p2', x: 7, y: 7 },
    ]);
    const intents = generateEnemyIntents(state, defs);
    eq(intents.length, 3, 'T3 每敌一个意图');
    const i1 = intents.find((i) => i.actorId === 'e1')!;
    eq(i1.type, 'attack', 'T3 炮沿炮架线冻结攻击');
    eq(i1.toPos, { x: 0, y: 4 }, 'T3 落点=车所在格');
    eq(i1.offset, { x: -6, y: 0 }, 'T3 保存相对位移');
    eq(i1.order, 1, 'T3 顺序=出生序');
    const i2 = intents.find((i) => i.actorId === 'e2')!;
    eq(i2.type, 'standby', 'T3 无合法攻击 → 待机');
}

// ---------- T4 相对位移：攻击者被位移后落点跟随平移（AC03 Core 级） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'v', defId: 'soldier', owner: 'p1', x: 5, y: 6 },
        { id: 'v2', defId: 'soldier', owner: 'p1', x: 3, y: 2 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 4, y: 6 },
    ]);
    const intent = generateEnemyIntents(state, defs)[0];
    eq(intent.toPos, { x: 5, y: 6 }, 'T4 冻结时落点=v 所在格');
    // 模拟位移（未来推动/任意来源）：攻击者挪到 (2,2)
    unitById(state, 'e1').pos = { x: 2, y: 2 };
    const forecast = applyIntent(state, defs, intent);
    eq(forecast.toPos, { x: 3, y: 2 }, 'T4 落点=新位置+offset，不回打原绝对格');
    eq(forecast.status, 'hit', 'T4 命中新落点的占位者');
    eq(forecast.victim?.unitId, 'v2', 'T4 受害者是当前占位者而非原目标');
}

// ---------- T5 受害者走开 → 落空（AC04） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'm', defId: 'soldier', owner: 'p1', x: 5, y: 3 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 4, y: 3 },
    ]);
    const intent = generateEnemyIntents(state, defs)[0];
    state.units.splice(state.units.indexOf(unitById(state, 'm')), 1); // 原受害者走开
    const forecast = applyIntent(state, defs, intent);
    eq(forecast.status, 'miss', 'T5 目标离开 → 落空');
    assert(!forecast.victim, 'T5 落空不产生伤害');
    eq(forecast.reason, '目标已离开，落空', 'T5 落空原因可读');
}

// ---------- T6 落点被同伴占据 → 友伤命中（AC04） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 4, y: 3 },
        { id: 'm', defId: 'soldier', owner: 'p1', x: 5, y: 3 },
    ]);
    const intent = generateEnemyIntents(state, defs).find((i) => i.actorId === 'e1')!;
    // 冻结后落点被我方放弃、同伴进驻（模拟位移类局面变化）
    state.units.splice(state.units.indexOf(unitById(state, 'm')), 1);
    state.units.push({ id: 'e2', defId: 'soldier', owner: 'p2', pos: { x: 5, y: 3 } });
    const forecast = applyIntent(state, defs, intent);
    eq(forecast.status, 'hit', 'T6 落点有同伴 → 照常命中（同阵营不取消）');
    eq(forecast.victim?.unitId, 'e2', 'T6 受害者=同伴');
    eq(forecast.victim?.hpAfter, 45, 'T6 伤害按攻击力结算 80-35');
    eq(forecast.reason, '友伤：命中本方同伴', 'T6 友伤标注');
}

// ---------- T7 攻击者阵亡 → removed（AC04） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'm', defId: 'soldier', owner: 'p1', x: 5, y: 3 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 4, y: 3 },
    ]);
    const intent = generateEnemyIntents(state, defs)[0];
    state.units.splice(state.units.indexOf(unitById(state, 'e1')), 1);
    const forecast = applyIntent(state, defs, intent);
    eq(forecast.status, 'removed', 'T7 攻击者已阵亡 → removed');
}

// ---------- T8 炮：炮架 0/1/2、射空（AC05） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 't', defId: 'soldier', owner: 'p1', x: 2, y: 2 },
        { id: 'pao', defId: 'pao', owner: 'p2', x: 6, y: 2 },
        { id: 'rackA', defId: 'soldier', owner: 'p2', x: 4, y: 2 },
        { id: 'rackB', defId: 'soldier', owner: 'p2', x: 5, y: 2 },
    ]);
    // 冻结时只有 rackA 一个炮架（手工构造等价意图：offset 直指 (2,2)）
    const intent = { actorId: 'pao', defId: 'pao', type: 'attack' as const, fromPos: { x: 6, y: 2 }, toPos: { x: 2, y: 2 }, offset: { x: -4, y: 0 }, order: 1 };
    const twoRacks = applyIntent(state, defs, intent);
    eq(twoRacks.status, 'invalid', 'T8 两个炮架 → 失效');
    eq(twoRacks.reason, '炮架数量不为一', 'T8 失效原因：炮架数量不为一');
    state.units.splice(state.units.indexOf(unitById(state, 'rackB')), 1); // 挪走第二个炮架
    const oneRack = applyIntent(state, defs, intent);
    eq(oneRack.status, 'hit', 'T8 恰好一个炮架 → 命中');
    eq(oneRack.victim?.unitId, 't', 'T8 单目标命中');
    eq(oneRack.victim?.hpAfter, 30, 'T8 炮伤 80-50');
    state.units.splice(state.units.indexOf(unitById(state, 'rackA')), 1); // 炮架也被移走
    const noRack = applyIntent(state, defs, intent);
    eq(noRack.status, 'invalid', 'T8 无炮架 → 失效');
    eq(noRack.reason, '缺少炮架', 'T8 失效原因：缺少炮架');
    state.units.push({ id: 'rackC', defId: 'soldier', owner: 'p2', pos: { x: 4, y: 2 } });
    state.units.splice(state.units.indexOf(unitById(state, 't')), 1); // 目标走开，炮架仍成立
    const emptyShot = applyIntent(state, defs, intent);
    eq(emptyShot.status, 'miss', 'T8 炮架成立但落点无目标 → 射空');
    eq(emptyShot.reason, '射空（落点无目标）', 'T8 射空说明');
}

// ---------- T9 马腿受阻与落点越界（AC05） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 't', defId: 'soldier', owner: 'p1', x: 5, y: 6 },
        { id: 'e1', defId: 'ma', owner: 'p2', x: 4, y: 4 },
    ]);
    const intent = generateEnemyIntents(state, defs)[0];
    eq(intent.toPos, { x: 5, y: 6 }, 'T9 马冻结日字攻击');
    state.units.push({ id: 'legBlock', defId: 'soldier', owner: 'p1', pos: { x: 4, y: 5 } }); // 马腿
    const blocked = applyIntent(state, defs, intent);
    eq(blocked.status, 'invalid', 'T9 马腿受阻 → 失效');
    eq(blocked.reason, '马腿/象眼受阻', 'T9 失效原因：马腿');
    state.units.splice(state.units.indexOf(unitById(state, 'legBlock')), 1);
    const ok = applyIntent(state, defs, intent);
    eq(ok.status, 'hit', 'T9 马腿通畅 → 命中');
}
{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 4, y: 8 },
        { id: 't2', defId: 'soldier', owner: 'p1', x: 0, y: 2 },
        { id: 'e2', defId: 'soldier', owner: 'p2', x: 0, y: 3 },
    ]);
    const intent = generateEnemyIntents(state, defs).find((i) => i.actorId === 'e2')!;
    unitById(state, 'e2').pos = { x: 0, y: 0 }; // 位移到边缘
    const forecast = applyIntent(state, defs, intent);
    eq(forecast.status, 'invalid', 'T9 平移后落点越界 → 失效');
    eq(forecast.reason, '落点越界', 'T9 失效原因：越界');
}

// ---------- T10 链式：前序击杀改变后序炮架；预览=实际（AC06） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0 },
        { id: 'S', defId: 'soldier', owner: 'p1', x: 5, y: 2, hp: 30 },
        { id: 'T', defId: 'soldier', owner: 'p1', x: 3, y: 2 },
        { id: 'e1', defId: 'soldier', owner: 'p2', x: 5, y: 1 },
        { id: 'e2', defId: 'pao', owner: 'p2', x: 7, y: 2 },
    ]);
    state.intents = generateEnemyIntents(state, defs);
    eq(state.intents.map((i) => i.actorId), ['e1', 'e2'], 'T10 意图顺序=出生序');
    const sim = simulateIntents(state, defs);
    eq(sim[0].status, 'hit', 'T10 预测①：e1 命中低血 S');
    eq(sim[0].victim?.dies, true, 'T10 预测①：S 阵亡');
    eq(sim[1].status, 'invalid', 'T10 预测②：炮架被前序击杀 → 失效');
    eq(sim[1].reason, '缺少炮架', 'T10 预测②原因');
    // 实际执行同一顺序，结果必须与预测一致
    const executed = state.intents.map((i) => applyIntent(state, defs, i).status);
    eq(executed, sim.map((f) => f.status), 'T10 执行序列与预测一致（预览=实际）');
}

// ---------- T11 帅阵亡：立即截断后续（AC07） ----------

{
    const state = makeState([
        { id: 'king', defId: 'shuai', owner: 'p1', x: 0, y: 0, hp: 30 },
        { id: 'w', defId: 'soldier', owner: 'p1', x: 1, y: 5 },
        { id: 'rack', defId: 'soldier', owner: 'p2', x: 2, y: 0 },
        { id: 'pao', defId: 'pao', owner: 'p2', x: 4, y: 0 },
        { id: 'e2', defId: 'soldier', owner: 'p2', x: 1, y: 6 },
    ]);
    state.intents = generateEnemyIntents(state, defs);
    const paoIntent = state.intents.find((i) => i.actorId === 'pao')!;
    eq(paoIntent.toPos, { x: 0, y: 0 }, 'T11 炮优先瞄准帅');
    const sim = simulateIntents(state, defs);
    const paoSim = sim.find((f) => f.intent.actorId === 'pao')!;
    eq(paoSim.status, 'hit', 'T11 预测：帅被击杀');
    eq(paoSim.victim?.dies, true, 'T11 帅阵亡');
    const later = sim.filter((f) => f.intent.order > paoIntent.order);
    assert(later.length > 0 && later.every((f) => f.status === 'skipped'), 'T11 帅亡后剩余意图标记 skipped');
    // 实际执行炮的意图后帅亡
    applyIntent(state, defs, paoIntent);
    assert(isHumanKingDead(state), 'T11 执行后帅亡可检测（停止后续信号）');
}

// ---------- 汇总 ----------

console.log(`\n通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`  [FAIL] ${failure}`);
    }
    process.exit(1);
}
