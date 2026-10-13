/**
 * 演练夹具关卡回归（v2 规则）：验证每个夹具的关键演示点在 Core 规则下真实成立。
 * 与 run.ts 同一编译管线；关卡 JSON 直接读 assets/resources/Levels，经 startBattle 初始化。
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { BattleState } from '../../assets/Scripts/Core/BattleState';
import { startBattle, deepCopy } from '../../assets/Scripts/Core/Rules';
import {
    EnemyPrepMove,
    applyEnemyIntent,
    enemyPhase,
    generateIntents,
    planEnemyPrep,
} from '../../assets/Scripts/Core/EnemyTelegraph';

/// <reference path="./node.d.ts" />

declare const process: { exit(code?: number): never };

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

function findProjectRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        if (existsMarker(dir)) {
            return dir;
        }
        dir = join(dir, '..');
    }
    throw new Error('找不到项目根');
}

function existsMarker(dir: string): boolean {
    try {
        readFileSync(join(dir, 'assets', 'resources', 'Levels', 'level-list.json'), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function loadLevel(id: string): BattleState {
    const raw = readFileSync(join(findProjectRoot(), 'assets', 'resources', 'Levels', `${id}.json`), 'utf8');
    return startBattle(JSON.parse(raw));
}

function unitById(state: BattleState, id: string) {
    const unit = state.units.find((u) => u.id === id);
    if (!unit) {
        throw new Error(`夹具构造错误：找不到单位 ${id}`);
    }
    return unit;
}

/** 与 GameManager.startEnemyPrep 同序：先逐个落位准备移动，再冻结意图 */
function runPrepPhase(state: BattleState): void {
    const moves: EnemyPrepMove[] = planEnemyPrep(state);
    for (const move of moves) {
        if (!move.ready) {
            unitById(state, move.unitId).x = move.to.x;
            unitById(state, move.unitId).y = move.to.y;
        }
    }
    state.intents = generateIntents(state);
}

// ---------- 夹具 1 · 敌方预告基础 ----------

{
    const state = loadLevel('fixture-01-basics');
    const moves = planEnemyPrep(state);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}${m.ready ? '!' : ''}`), ['e1:4,3!', 'e2:6,3', 'kk:4,7'], 'F1 准备走位（e1 有攻击原地，e2/kk 逼近）');
    runPrepPhase(state);
    const sim = deepCopy(state);
    const simResult = enemyPhase(sim, true);
    eq(simResult.effects[0].status, 'success', 'F1 e1 预计命中 v');
    eq(simResult.effects[0].effect?.hits[0]?.before, 2, 'F1 v 满血 2');
    eq(simResult.effects[0].effect?.hits[0]?.damage, 1, 'F1 兵伤 1 → 受击存活（可演示走开落空）');
    eq(simResult.effects[0].effect?.landings?.[0]?.dead, false, 'F1 v 存活');
    eq(simResult.effects[1].status, 'standby', 'F1 e2 待机（灰格演示点）');
    // 演示点回归：玩家把 v 走开 → 落空
    const intents = state.intents!;
    state.units.splice(state.units.findIndex((u) => u.id === 'v'), 1);
    eq(applyEnemyIntent(state, intents[0]).status, 'miss', 'F1 受害者走开 → 落空');
}

// ---------- 夹具 2 · 炮架攻防 ----------

{
    const state = loadLevel('fixture-02-cannon-rack');
    const moves = planEnemyPrep(state);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}${m.ready ? '!' : ''}`), ['p1:6,2!', 'rack:4,2!', 'e2:7,5', 'kk:4,7'], 'F2 炮/炮架均有攻击原地，远兵/kk 走位');
    runPrepPhase(state);
    const sim = deepCopy(state);
    const simResult = enemyPhase(sim, true);
    eq(simResult.effects[0].status, 'success', 'F2 炮预计命中 c1');
    eq(simResult.effects[0].effect?.hits[0]?.damage, 2, 'F2 炮伤 2 → 车 2HP 击杀');
    eq(simResult.effects[0].effect?.landings?.[0]?.dead, true, 'F2 c1 阵亡');
    eq(simResult.effects[1].status, 'success', 'F2 炮架兵攻击 t');
    eq(simResult.effects[2].status, 'standby', 'F2 远兵待机');
    // 演示点回归①：击杀炮架 rack → 缺少炮架
    const noRackState = deepCopy(state);
    noRackState.units.splice(noRackState.units.findIndex((u) => u.id === 'rack'), 1);
    eq(applyEnemyIntent(noRackState, noRackState.intents![0]).reason, '缺少炮架', 'F2 击杀炮架 → 失效');
    // 演示点回归②：m1 挪入炮线 (3,2) → 双炮架
    const twoRackState = deepCopy(state);
    unitById(twoRackState, 'm1').x = 3;
    unitById(twoRackState, 'm1').y = 2;
    eq(applyEnemyIntent(twoRackState, twoRackState.intents![0]).reason, '炮架数量不为一', 'F2 挪入第二个炮架 → 失效');
    // 演示点回归③：c1 走开 → 炮射空（原型口径：炮架仍成立时 revalidate=action，结算空 hits）
    const emptyState = deepCopy(state);
    emptyState.units.splice(emptyState.units.findIndex((u) => u.id === 'c1'), 1);
    const emptyResult = applyEnemyIntent(emptyState, emptyState.intents![0]);
    eq(emptyResult.status, 'success', 'F2 目标走开 → 结算成功');
    eq(emptyResult.effect?.hits, [], 'F2 目标走开 → 空命中（射空）');
}

// ---------- 夹具 3 · 序贯连锁（v2：尸体仍是炮架） ----------

{
    const state = loadLevel('fixture-03-chain');
    const moves = planEnemyPrep(state);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}${m.ready ? '!' : ''}`), ['e1:5,3!', 'e2:7,2!', 'e3:0,6', 'kk:4,7'], 'F3 前两敌有攻击原地，远兵/kk 走位');
    runPrepPhase(state);
    // 预测：e1 击杀 S；e2 穿过 S 的尸体继续命中 T（尸体仍可作炮架）
    const sim = deepCopy(state);
    const simResult = enemyPhase(sim, true);
    eq(simResult.effects.map((e) => e.status), ['success', 'success', 'standby', 'standby'], 'F3 连锁预测：击杀 S → 炮穿透尸体继续命中 T');
    eq(simResult.effects[0].effect?.landings?.[0]?.dead, true, 'F3 低血 S 被前序击杀');
    assert(!!simResult.state.corpses?.find((c) => c.x === 5 && c.y === 2), 'F3 S 陆地留尸');
    eq(simResult.effects[1].effect?.landings?.[0]?.id, 'T', 'F3 后序炮命中 T（尸体不挡弹道端点）');
    eq(simResult.effects[1].effect?.landings?.[0]?.dead, true, 'F3 T 也被击杀（炮伤 2）');
    // 实际执行与预测一致（预览=实际）
    const real = enemyPhase(deepCopy(state));
    eq(real.effects.map((e) => e.status), simResult.effects.map((e) => e.status), 'F3 执行与预测一致（预览=实际）');
    assert(!!real.state.corpses?.find((c) => c.x === 3 && c.y === 2), 'F3 T 亦留尸');
}

// ---------- 主线关回归（v2 布阵：waveOne 首轮走位与意图） ----------

{
    const state = loadLevel('level-01');
    const moves = planEnemyPrep(state);
    eq(moves.map((m) => `${m.unitId}:${m.to.x},${m.to.y}${m.ready ? '!' : ''}`), [
        'w1-0:1,4', 'w1-1:4,4', 'w1-2:7,4', 'w1-3:8,4', 'w1-4:1,7!', 'w1-5:4,7', 'w1-6:5,8!', 'w1-7:3,8',
    ], 'L1 waveOne 首轮走位（兵过桥、敌车逼近湿身、仕占宫心、帅侧移）');
    runPrepPhase(state);
    const sim = deepCopy(state);
    const simResult = enemyPhase(sim, true);
    eq(simResult.effects.map((e) => e.status), [
        'success', 'success', 'success', 'standby', 'success', 'standby', 'standby', 'standby',
    ], 'L1 意图预测：三兵贴身命中；炮目标被前序击杀 → 结算成功但空命中（射空）');
    eq(simResult.effects[4].effect?.hits, [], 'L1 炮射空 = 空 hits');
    eq(simResult.effects[2].effect?.landings?.[0]?.id, 'u5', 'L1 敌兵命中枪（2HP 存活）');
    eq(simResult.effects[2].effect?.landings?.[0]?.dead, false, 'L1 枪受击存活');
    // 实际执行一致
    const real = enemyPhase(deepCopy(state));
    eq(real.effects.map((e) => e.status), simResult.effects.map((e) => e.status), 'L1 执行与预测一致');
    assert(!!real.state.units.find((u) => u.kind === 'king' && u.side === 'player'), 'L1 帅在场且存活');
    assert(!real.state.result, 'L1 首轮无终局');
}
{
    const state = loadLevel('level-02');
    const moves = planEnemyPrep(state);
    eq(moves.length, 8, 'L2 与 L1 同布阵：8 敌全有准备计划');
    runPrepPhase(state);
    const sim = enemyPhase(deepCopy(state), true);
    eq(sim.effects.map((e) => e.status), [
        'success', 'success', 'success', 'standby', 'success', 'standby', 'standby', 'standby',
    ], 'L2 首轮意图与 L1 一致');
    assert(!!sim.state.units.find((u) => u.kind === 'king' && u.side === 'player'), 'L2 帅在场且存活');
}

console.log(`\n夹具验证：通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`  [FAIL] ${failure}`);
    }
    process.exit(1);
}
