/**
 * 规则 v2 Core 测试（纯 TS，零引擎依赖）：对齐原型 preview/web/js/rules.js 语义。
 *
 * 运行：在 tests/core 目录下
 *   tsc -p tsconfig.json
 *   node dist/tests/core/run.js
 *
 * 覆盖：走法（兵/弓/枪/马/炮/车/帅/士）、攻击形状、地形（水/山/林/桥）、
 * 提交校验（额度/revision）、击杀记账、尸体、敌方意图（锁定/重验/截断）、预览=实际、终局。
 */

/// <reference path="./node.d.ts" />

import { BattleState, BattleUnit, validateMap } from '../../assets/Scripts/Core/BattleState';
import { CONFIG } from '../../assets/Scripts/Core/Config';
import { KIND_DEFS, maxHpOf, makeUnit } from '../../assets/Scripts/Core/UnitDefs';
import { UnitAction, legalActions, actionAt, directionalAction } from '../../assets/Scripts/Core/Actions';
import {
    applyAction,
    checkTerminal,
    resetAllTurns,
    startBattle,
    submitAction,
    deepCopy,
} from '../../assets/Scripts/Core/Rules';
import {
    enemyPhase,
    generateIntents,
    planEnemyPrep,
    revalidateIntent,
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

// ---------- 战局构造 ----------

interface UnitSpec {
    id: string;
    side: 'player' | 'enemy';
    kind: string;
    x: number;
    y: number;
    rookRole?: string;
}

/** 干净 9×9 地图（全 land）+ 指定单位；缺帅时自动在己方九宫找空位补帅（测试只关注被测单位） */
function makeState(units: UnitSpec[], tiles?: Record<string, string>): BattleState {
    const all = [...units];
    const occupied = new Set(all.map((u) => `${u.x},${u.y}`));
    const playerPalace: Array<{ x: number; y: number }> = [
        { x: 4, y: 0 }, { x: 3, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 },
    ];
    const enemyPalace: Array<{ x: number; y: number }> = [
        { x: 4, y: 8 }, { x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 5, y: 7 }, { x: 3, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 },
    ];
    if (!all.some((u) => u.side === 'player' && u.kind === 'king')) {
        const spot = playerPalace.find((p) => !occupied.has(`${p.x},${p.y}`));
        if (spot) {
            all.push({ id: 'king', side: 'player', kind: 'king', x: spot.x, y: spot.y });
            occupied.add(`${spot.x},${spot.y}`);
        }
    }
    if (!all.some((u) => u.side === 'enemy' && u.kind === 'king')) {
        const spot = enemyPalace.find((p) => !occupied.has(`${p.x},${p.y}`));
        if (spot) {
            all.push({ id: 'kk', side: 'enemy', kind: 'king', x: spot.x, y: spot.y });
        }
    }
    return startBattle({
        formatVersion: 2,
        meta: { kind: 'battleInit', battleId: 'test' },
        map: { name: '测试图', tiles: tiles ?? {} },
        units: all,
        turn: { round: 1, phase: 'player' },
    });
}

function unitById(state: BattleState, id: string): BattleUnit {
    const unit = state.units.find((u) => u.id === id);
    if (!unit) {
        throw new Error(`测试构造错误：找不到单位 ${id}`);
    }
    return unit;
}

/** 找出某类型动作（按落点） */
function actionTo(state: BattleState, unitId: string, x: number, y: number, type?: string): UnitAction | undefined {
    return legalActions(state, unitId).find((a) => a.to.x === x && a.to.y === y && (!type || a.type === type));
}

// ---------- T0 定义表 ----------

{
    eq(maxHpOf('king', 'player'), 3, 'T0 我方帅 3 HP');
    eq(maxHpOf('king', 'enemy'), 5, 'T0 敌方帅 5 HP');
    eq(maxHpOf('rook', 'player'), 2, 'T0 车 2 HP');
    eq(maxHpOf('spearman', 'enemy'), 2, 'T0 枪 2 HP');
    eq(maxHpOf('pawn', 'player'), 1, 'T0 兵 1 HP');
    eq(KIND_DEFS.cannon.attack, 2, 'T0 炮攻击 2');
    eq(KIND_DEFS.archer.attack, 2, 'T0 弓攻击 2');
    eq(KIND_DEFS.pawn.attack, 1, 'T0 兵攻击 1');
    eq(KIND_DEFS.rook.price, 5, 'T0 车价 5');
    eq(KIND_DEFS.pawn.price, 3, 'T0 兵价 3');
    const rook = makeUnit('r', 'player', 'rook', 0, 0);
    eq([rook.rookMoveRange, rook.rookChargeRange, rook.rookPullRange], [4, 1, 3], 'T0 车 4/1/3');
    const cannon = makeUnit('c', 'player', 'cannon', 1, 0);
    eq([cannon.cannonMoveAvailable, cannon.cannonAttackAvailable], [true, true], 'T0 炮双槽初始可用');
    const pawn = makeUnit('p', 'enemy', 'pawn', 2, 8);
    eq([pawn.ap, pawn.apLimit], [0, 0], 'T0 敌方无行动点（意图驱动）');
    eq(CONFIG.killGold.king, 5, 'T0 帅赏金 5');
    eq(CONFIG.killGold.normal, 1, 'T0 普通赏金 1');
}

// ---------- T1 兵走法：前进 1；未过河不可横走；过河可横走；桥通行水禁入 ----------

{
    const state = makeState([
        { id: 'p', side: 'player', kind: 'pawn', x: 4, y: 3 },
    ]);
    const moves = legalActions(state, 'p').filter((a) => a.type === 'move').map((a) => `${a.to.x},${a.to.y}`);
    eq(moves, ['4,4'], 'T1 未过河兵只能前进 1 格');
    // 过河（y=5）后可横走
    unitById(state, 'p').y = 5;
    const cross = legalActions(state, 'p').filter((a) => a.type === 'move').map((a) => `${a.to.x},${a.to.y}`).sort();
    eq(cross, ['3,5', '4,6', '5,5'], 'T1 过河兵可横走+前进');
    // 敌方兵向前 = y-（朝我方）
    unitById(state, 'p').side = 'enemy';
    unitById(state, 'p').y = 6;
    const enemyMoves = legalActions(state, 'p').filter((a) => a.type === 'move').map((a) => `${a.to.x},${a.to.y}`);
    eq(enemyMoves, ['4,5'], 'T1 敌兵向 y- 前进');
}

{
    // 兵移动路径不得入水（fatalWater 拦截生成），桥可通行
    const state = makeState([
        { id: 'p', side: 'player', kind: 'pawn', x: 4, y: 2 },
    ], { '3,3': 'water', '4,3': 'bridge' });
    assert(!!actionTo(state, 'p', 4, 3, 'move'), 'T1 桥可通行');
    assert(actionTo(state, 'p', 3, 3, 'move') === undefined, 'T1 兵移动不可入水（途经即死不生成）');
}

// ---------- T2 兵攻击与弓差异 ----------

{
    const state = makeState([
        { id: 'p', side: 'player', kind: 'pawn', x: 4, y: 3 },
        { id: 'e', side: 'enemy', kind: 'pawn', x: 4, y: 4 },
    ]);
    const atk = actionTo(state, 'p', 4, 4, 'attack');
    assert(!!atk, 'T2 兵可攻击贴身敌');
    const result = submitAction(state, { ...atk!, revision: state.revision });
    eq(result.effect?.hits[0]?.damage, 1, 'T2 兵伤害 1');
    eq(result.effect?.victims, ['e'], 'T2 满伤击杀');
}

{
    // 弓 ordinary 不能选敌（远程走 directional），未过河只能向前移动
    const state = makeState([
        { id: 'a', side: 'player', kind: 'archer', x: 4, y: 3 },
        { id: 'e', side: 'enemy', kind: 'pawn', x: 4, y: 4 },
    ]);
    assert(actionTo(state, 'a', 4, 4, 'attack') === undefined, 'T2 弓无贴身普通攻击（盲区归 directional）');
    const moves = legalActions(state, 'a').filter((m) => m.type === 'move').map((m) => `${m.to.x},${m.to.y}`);
    eq(moves, [], 'T2 弓前方被敌占 → 无普通移动');
    // 弓方向攻击：2 格起（贴身盲区敌会截断弹道 → 先挪开）
    state.units.splice(state.units.indexOf(unitById(state, 'e')), 1);
    state.units.push(makeUnit('e2', 'enemy', 'pawn', 4, 5));
    const dir = directionalAction(state, 'a', 0);
    assert(!!dir, 'T2 弓方向攻击成立（2 格起）');
    eq(dir?.targets, ['e2'], 'T2 弓方向攻击命中 2 格外目标');
}

// ---------- T3 马日字与蹩腿 ----------

{
    const state = makeState([
        { id: 'h', side: 'player', kind: 'horse', x: 4, y: 1 },
    ]);
    const targets = legalActions(state, 'h').filter((a) => a.type === 'move').map((a) => `${a.to.x},${a.to.y}`).sort();
    eq(targets, ['2,0', '2,2', '3,3', '5,3', '6,0', '6,2'], 'T3 马八向日字（界内；(3,1) 等格不足日字）');
    // 蹩腿：山占 (4,2)（向上腿）
    state.map.tiles['4,2'] = 'mountain';
    const blocked = legalActions(state, 'h').filter((a) => a.to.y === 3);
    eq(blocked.length, 0, 'T3 马腿被山蹩 → 上方两跳失效');
}

// ---------- T4 炮：移动无架 ≤3、隔 1 架攻击、双架拒绝、打山 ----------

{
    const state = makeState([
        { id: 'c', side: 'player', kind: 'cannon', x: 4, y: 2 },
    ]);
    const moves = legalActions(state, 'c').filter((a) => a.type === 'move');
    eq(moves.filter((m) => m.to.x === 4).length, 4, 'T4 炮纵线移动（北上 1 + 南下 3）');
    assert(moves.every((m) => m.path.slice(0, -1).every((p) => !state.units.some((u) => u.x === p.x && u.y === p.y))), 'T4 移动路径全空');
    // 隔 1 架攻击（纵线：架 (4,4)、目标 (4,8)）
    state.units.push(makeUnit('rack', 'player', 'pawn', 4, 4));
    state.units.push(makeUnit('target', 'enemy', 'rook', 4, 8));
    const atk = actionTo(state, 'c', 4, 8, 'attack');
    assert(!!atk, 'T4 炮隔 1 架可攻击');
    // 双架拒绝
    state.units.push(makeUnit('rack2', 'enemy', 'pawn', 4, 6));
    assert(actionTo(state, 'c', 4, 8, 'attack') === undefined, 'T4 双炮架不可攻击');
    state.units = state.units.filter((u) => u.id !== 'rack2');
    // 打山：横线恰好 1 架（架 (5,2)）
    state.map.tiles['6,2'] = 'mountain';
    assert(actionTo(state, 'c', 6, 2, 'attack') === undefined, 'T4 打山需恰好 1 架（当前 0 架）');
    state.units.push(makeUnit('rack3', 'player', 'pawn', 5, 2));
    const rockAtk2 = actionTo(state, 'c', 6, 2, 'attack');
    assert(!!rockAtk2, 'T4 单架可打山');
    const simState = deepCopy(state);
    applyAction(simState, rockAtk2!, true);
    eq(simState.map.tiles['6,2'], 'cracked', 'T4 炮击山 mountain→cracked');
    eq(state.map.tiles['6,2'], 'mountain', 'T4 原局不变（纯函数）');
}

// ---------- T5 帅与士的九宫 ----------

{
    const state = makeState([
        { id: 'king', side: 'player', kind: 'king', x: 4, y: 0 },
        { id: 'adv', side: 'player', kind: 'advisor', x: 3, y: 0 },
    ]);
    // 帅在宫角：直线 1 格（友占格除外），无普通斜走
    const kingMoves = legalActions(state, 'king').filter((a) => a.type === 'move').map((a) => `${a.to.x},${a.to.y}`).sort();
    eq(kingMoves, ['4,1', '5,0'], 'T5 帅宫角直线 1 格（(3,0) 被士占）');
    // 士在宫角：只能斜走到宫心
    const advMoves = legalActions(state, 'adv').filter((a) => a.type === 'move').map((a) => `${a.to.x},${a.to.y}`).sort();
    eq(advMoves, ['4,1'], 'T5 士宫角斜走宫心');
    // 帅移到宫心：可斜走其余三角（(3,0) 被士占）
    unitById(state, 'king').x = 4;
    unitById(state, 'king').y = 1;
    const diagMoves = legalActions(state, 'king').filter((a) => Math.abs(a.to.x - 4) === 1 && Math.abs(a.to.y - 1) === 1);
    eq(diagMoves.length, 3, 'T5 帅在宫心可斜走角');
    // 帅不能出九宫、士不能直线走
    assert(actionTo(state, 'king', 4, 3, 'move') === undefined, 'T5 帅不能出九宫');
    assert(actionTo(state, 'adv', 4, 0, 'move') === undefined, 'T5 士不能直线走');
}

// ---------- T6 车：直线 4 格合一 + 敌车特殊 ----------

{
    const state = makeState([
        { id: 'r', side: 'player', kind: 'rook', x: 4, y: 2 },
    ]);
    const moves = legalActions(state, 'r').filter((a) => a.type === 'rook-move');
    eq(moves.filter((m) => m.to.y > 2).length, 4, 'T6 车直线移动 1..4 格（南向）');
    // 直线攻击（合一）：把敌兵放到 (4,6)（距 4 格内）
    state.units.push(makeUnit('e', 'enemy', 'pawn', 4, 6));
    const atk = actionTo(state, 'r', 4, 6, 'attack');
    assert(!!atk, 'T6 车直线 4 格内攻击（合一行动）');
    assert(atk!.path.length === 4, 'T6 攻击路径含端点不含起点');
    // 敌车：移动 ≤3 / 贴身 charge
    state.units.push(makeUnit('er', 'enemy', 'rook', 0, 8));
    const erMoves = legalActions(state, 'er').filter((a) => a.type === 'move');
    assert(erMoves.every((m) => m.path.length <= 3), 'T6 敌车移动 ≤3 格');
    state.units.push(makeUnit('near', 'player', 'pawn', 1, 8));
    const charge = legalActions(state, 'er').find((a) => a.to.x === 1 && a.to.y === 8);
    eq(charge?.type, 'charge', 'T6 敌车贴身冲锋');
}

// ---------- T7 枪贯穿与弓盲区、尸体截断 ----------

{
    const state = makeState([
        { id: 's', side: 'player', kind: 'spearman', x: 4, y: 3 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 4, y: 5 },
        { id: 'e2', side: 'enemy', kind: 'pawn', x: 4, y: 6 },
    ]);
    // 枪方向攻击：基础射程 1，需预购 directionPaid 扩程（对齐原型 directionRange）
    unitById(state, 's').directionPaid = [3, 0, 0, 0];
    unitById(state, 's').ap = 3;
    const dir = directionalAction(state, 's', 0);
    eq(dir?.targets, ['e1', 'e2'], 'T7 枪 paid=3 射程 4 → 贯穿两个目标');
    const applied = submitAction(state, { actorId: 's', from: { x: 4, y: 3 }, to: { x: 4, y: 6 }, type: 'directional', direction: 0, path: [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 }], targets: ['e1', 'e2'], revision: state.revision });
    eq(applied.effect?.victims.sort(), ['e1', 'e2'], 'T7 枪一次结算两杀');
}

{
    // 弓 1 格盲区：贴身敌挡路则方向攻击无效
    const state = makeState([
        { id: 'a', side: 'player', kind: 'archer', x: 4, y: 3 },
        { id: 'near', side: 'enemy', kind: 'pawn', x: 4, y: 4 },
        { id: 'far', side: 'enemy', kind: 'pawn', x: 4, y: 5 },
    ]);
    eq(directionalAction(state, 'a', 0), undefined, 'T7 弓贴身盲区 → 方向攻击无效');
    // 尸体截断弹道
    state.corpses = [{ id: 'corpse-x', x: 4, y: 4, unit: undefined }];
    eq(directionalAction(state, 'a', 0), undefined, 'T7 尸体挡在 1 格位 → 截断');
    state.corpses = [];
    state.units.splice(state.units.indexOf(unitById(state, 'near')), 1);
    const dir = directionalAction(state, 'a', 0);
    eq(dir?.targets, ['far'], 'T7 挪开盲区敌 → 命中 2 格外目标');
}

// ---------- T8 submitAction：额度/revision/双槽 ----------

{
    const state = makeState([
        { id: 'r', side: 'player', kind: 'rook', x: 4, y: 2 },
    ]);
    const move = actionTo(state, 'r', 4, 4, 'rook-move')!;
    // revision 过期
    const stale = submitAction(state, { ...move, revision: (state.revision ?? 0) + 5 });
    eq(stale.effect, null, 'T8 revision 过期拒绝');
    // 正常执行：车移动后 rookMoveAvailable=false 且 acted
    const ok = submitAction(state, { ...move, revision: state.revision });
    assert(!!ok.effect, 'T8 合法移动通过');
    const nextRook = ok.state.units.find((u) => u.id === 'r')!;
    eq([nextRook.rookMoveAvailable, nextRook.acted], [false, true], 'T8 车移动后基础移动耗尽、acted');
    eq(ok.state.revision, (state.revision ?? 0) + 1, 'T8 revision 递增');
    // 已 acted 的单位再提交被拒
    const again = submitAction(ok.state, { ...move, revision: ok.state.revision });
    eq(again.effect, null, 'T8 无额度再提交拒绝');
}

{
    // 炮双槽：移动只耗 cannonMoveAvailable，攻击仍可用
    const state = makeState([
        { id: 'c', side: 'player', kind: 'cannon', x: 4, y: 2 },
    ]);
    const move = actionTo(state, 'c', 4, 3, 'move')!;
    const ok = submitAction(state, { ...move, revision: state.revision });
    const c = ok.state.units.find((u) => u.id === 'c')!;
    eq([c.cannonMoveAvailable, c.cannonAttackAvailable, c.acted], [false, true, false], 'T8 炮移动后攻击槽仍在');
}

// ---------- T9 击杀记账：等级/SP/金币 ----------

{
    const state = makeState([
        { id: 'p', side: 'player', kind: 'pawn', x: 4, y: 3 },
        { id: 'e', side: 'enemy', kind: 'pawn', x: 4, y: 4 },
    ]);
    const atk = actionTo(state, 'p', 4, 4, 'attack')!;
    const ok = submitAction(state, { ...atk, revision: state.revision });
    const killer = ok.state.units.find((u) => u.id === 'p')!;
    eq([killer.kills, killer.level, killer.sp], [1, 2, 1], 'T9 击杀 +1 杀/级/SP（对齐原型每杀 level+1）');
    eq(ok.state.kills, 1, 'T9 全局击杀数');
    eq(ok.state.killValues?.e, 1, 'T9 普通兵赏金 1');
}

// ---------- T10 尸体：我方阵亡留尸、尸体可作炮架 ----------

{
    const state = makeState([
        { id: 'r', side: 'player', kind: 'rook', x: 4, y: 2 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 4, y: 3 },
    ]);
    unitById(state, 'r').hp = 1;
    const intent = {
        actorId: 'e1', kind: 'pawn' as const, type: 'attack' as const,
        fromPos: { x: 4, y: 3 }, toPos: { x: 4, y: 2 }, offset: { x: 0, y: -1 }, order: 1,
        path: [{ x: 4, y: 2 }],
    };
    state.intents = [intent];
    const phase = enemyPhase(state);
    eq(phase.effects[0].status, 'success', 'T10 敌兵命中');
    assert(!phase.state.units.find((u) => u.id === 'r'), 'T10 车 (1HP) 被击杀');
    assert(!!phase.state.corpses?.find((c) => c.x === 4 && c.y === 2), 'T10 我方车陆地留尸');
    // 尸体可作炮架（横线：炮 (2,2) → 尸 (4,2) → 目标 (5,2)）
    const st2 = deepCopy(phase.state);
    st2.units.push(makeUnit('c', 'player', 'cannon', 2, 2));
    st2.units.push(makeUnit('far', 'enemy', 'pawn', 5, 2));
    const cannonUnit = st2.units.find((u) => u.id === 'c')!;
    const cannonAtk = actionAt(st2, cannonUnit, { x: 5, y: 2 });
    assert(!!cannonAtk && cannonAtk.type === 'attack', 'T10 尸体可作炮架');
}

// ---------- T11 水：拉入水淹死（对齐原型 drown：只有被推/拉入水才淹） ----------

{
    // 车（pull 职能）把敌兵拉向水格 → 淹死不留尸
    const state = makeState([
        { id: 'r', side: 'player', kind: 'rook', x: 4, y: 0, rookRole: 'pull' },
        { id: 'e', side: 'enemy', kind: 'pawn', x: 4, y: 2 },
    ], { '4,1': 'water' });
    unitById(state, 'r').rookChargeAvailable = true;
    const pull = legalActions(state, 'r').find((a) => a.type === 'pull');
    assert(!!pull, 'T11 牵引动作成立');
    const simState = deepCopy(state);
    const effect = applyAction(simState, pull!, true);
    eq(effect.pushed, { id: 'e', to: { x: 4, y: 1 } }, 'T11 敌兵被拉入水格');
    eq(effect.waterDeaths, ['e'], 'T11 兵入水即淹死');
    assert(!simState.units.some((u) => u.id === 'e'), 'T11 淹死即移除');
    assert(!simState.corpses?.some((c) => c.x === 4 && c.y === 1), 'T11 水中不留尸');
}

{
    // 车/马入水可停（不淹死）但禁攻击（wet）
    const state = makeState([
        { id: 'r', side: 'player', kind: 'rook', x: 4, y: 2 },
        { id: 'e', side: 'enemy', kind: 'pawn', x: 4, y: 3 },
    ]);
    state.map.tiles['4,2'] = 'water';
    const wet = unitById(state, 'r');
    // 车在水中：rookBase 攻击被拒
    const atk = actionAt(state, wet, { x: 4, y: 3 }, 'attack');
    assert(atk === undefined, 'T11 水中车禁攻击');
    // 移到岸上恢复
    wet.y = 1;
    assert(!!actionAt(state, wet, { x: 4, y: 3 }, 'attack'), 'T11 离水恢复攻击');
}

// ---------- T12 山：阻挡、可普通攻击、两次破坏 ----------

{
    const state = makeState([
        { id: 'p', side: 'player', kind: 'pawn', x: 4, y: 2 },
    ]);
    state.map.tiles['4,3'] = 'mountain';
    assert(actionTo(state, 'p', 4, 3, 'move') === undefined, 'T12 山不可站立');
    const rockAtk = actionTo(state, 'p', 4, 3, 'attack');
    assert(!!rockAtk, 'T12 贴山可普通攻击');
    const first = submitAction(state, { ...rockAtk!, revision: state.revision });
    eq(first.state.map.tiles['4,3'], 'cracked', 'T12 一击 mountain→cracked');
    // 兵 1AP 已耗尽 → 手动恢复后二击 cracked→land（rock 含 cracked）
    unitById(first.state, 'p').ap = 1;
    const second = submitAction(first.state, { ...actionTo(first.state, 'p', 4, 3, 'attack')!, revision: first.state.revision });
    eq(second.state.map.tiles['4,3'], 'land', 'T12 二击 cracked→land');
}

// ---------- T13 林：30% 闪避（预览条件标注 / 实际掷骰） ----------

{
    const state = makeState([
        { id: 'p', side: 'player', kind: 'pawn', x: 4, y: 2 },
        { id: 'e', side: 'enemy', kind: 'pawn', x: 4, y: 3 },
    ]);
    state.map.tiles['4,3'] = 'forest';
    const atk = actionTo(state, 'p', 4, 3, 'attack')!;
    // 预测：林目标 → conditional + conditions 标注
    const preview = submitAction(state, { ...atk, revision: state.revision }, true);
    eq(preview.effect?.conditional, true, 'T13 预测标注林闪避');
    eq(preview.effect?.conditions, ['e'], 'T13 预测条件目标');
    // 实际：rng=0 → 首个 random ≈0.236 <0.3 → 闪避；rng=1000000 → ≈0.785 >0.3 → 命中
    const state2 = deepCopy(state);
    state2.rng = 0;
    const missRun = submitAction(state2, { ...atk, revision: state2.revision });
    eq(missRun.effect?.misses, ['e'], 'T13 rng=0 掷出 <0.3 → 闪避');
    const state3 = deepCopy(state);
    state3.rng = 1000000;
    const hitRun2 = submitAction(state3, { ...atk, revision: state3.revision });
    assert(!hitRun2.effect?.misses?.length, 'T13 rng=1000000 掷出 >0.3 → 命中');
}

// ---------- T14 意图冻结：优先级与 offset ----------

{
    const state = makeState([
        { id: 'c1', side: 'player', kind: 'rook', x: 0, y: 4 },
        { id: 's1', side: 'player', kind: 'pawn', x: 2, y: 6 },
        { id: 'e1', side: 'enemy', kind: 'cannon', x: 6, y: 4 },
        { id: 'e2', side: 'enemy', kind: 'horse', x: 5, y: 6 },
        { id: 'e3', side: 'enemy', kind: 'pawn', x: 7, y: 7 },
        { id: 'rack', side: 'enemy', kind: 'pawn', x: 3, y: 4 },
    ]);
    const intents = generateIntents(state);
    eq(intents.length, 5, 'T14 每敌一个意图（含自动补帅 kk 待机）');
    const i1 = intents.find((i) => i.actorId === 'e1')!;
    eq(i1.type, 'attack', 'T14 炮沿炮架线冻结攻击');
    eq(i1.toPos, { x: 0, y: 4 }, 'T14 落点=车所在格');
    eq(i1.offset, { x: -6, y: 0 }, 'T14 保存相对位移');
    eq(i1.order, 1, 'T14 顺序=出生序');
    const i2 = intents.find((i) => i.actorId === 'e2')!;
    eq(i2.type, 'standby', 'T14 无合法攻击 → 待机');
}

{
    // 优先级与基础射程：枪基础射程 1 → 打相邻目标
    const state = makeState([
        { id: 'r1', side: 'player', kind: 'rook', x: 6, y: 6 },
        { id: 'p1', side: 'player', kind: 'pawn', x: 7, y: 4 },
        { id: 'e1', side: 'enemy', kind: 'spearman', x: 7, y: 3 },
    ]);
    state.intents = generateIntents(state);
    const i = state.intents.find((x) => x.actorId === 'e1')!;
    eq(i.toPos, { x: 7, y: 4 }, 'T14 枪基础射程 1 → 打相邻兵 (7,4)');
}

// ---------- T15 offset 跟随：受害者位移后命中新占位者 ----------

{
    const state = makeState([
        { id: 'v', side: 'player', kind: 'pawn', x: 5, y: 6 },
        { id: 'v2', side: 'player', kind: 'pawn', x: 2, y: 1 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 5, y: 7 },
    ]);
    const intent = generateIntents(state)[0];
    eq(intent.toPos, { x: 5, y: 6 }, 'T15 冻结时落点=v 所在格');
    unitById(state, 'e1').x = 2;
    unitById(state, 'e1').y = 2;
    const result = revalidateIntent(state, intent);
    assert(result.kind === 'action', 'T15 offset 平移后新落点 (2,1) 有敌 → 仍成立');
    const effect = applyAction(state, (result as { kind: 'action'; action: UnitAction }).action, false);
    eq(effect.landings?.[0], { id: 'v2', to: { x: 2, y: 1 }, dead: true }, 'T15 落点=新位置+offset，命中当前占位者');
    eq(effect.victims, ['v2'], 'T15 受害者是当前占位者而非原目标');
}

// ---------- T16 受害者走开 → missOnly；攻击者阵亡 → invalid ----------

{
    const state = makeState([
        { id: 'm', side: 'player', kind: 'pawn', x: 5, y: 3 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 5, y: 4 },
    ]);
    const intent = generateIntents(state)[0];
    state.units.splice(state.units.indexOf(unitById(state, 'm')), 1);
    const result = revalidateIntent(state, intent);
    eq(result.kind, 'missOnly', 'T16 目标离开 → missOnly');
    const st2 = makeState([
        { id: 'm', side: 'player', kind: 'pawn', x: 5, y: 3 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 5, y: 4 },
    ]);
    const intent2 = generateIntents(st2)[0];
    st2.units.splice(st2.units.indexOf(unitById(st2, 'e1')), 1);
    eq(revalidateIntent(st2, intent2).kind, 'invalid', 'T16 攻击者已阵亡 → invalid（removed 在 applyEnemyIntent 判）');
}

// ---------- T17 炮架重验：0/1/2 架与射空 ----------

{
    const state = makeState([
        { id: 't', side: 'player', kind: 'pawn', x: 2, y: 2 },
        { id: 'pao', side: 'enemy', kind: 'cannon', x: 6, y: 2 },
        { id: 'rackA', side: 'enemy', kind: 'pawn', x: 4, y: 2 },
        { id: 'rackB', side: 'enemy', kind: 'pawn', x: 5, y: 2 },
    ]);
    const intent = {
        actorId: 'pao', kind: 'cannon' as const, type: 'attack' as const,
        fromPos: { x: 6, y: 2 }, toPos: { x: 2, y: 2 }, offset: { x: -4, y: 0 }, order: 1,
        path: [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }],
    };
    eq((revalidateIntent(state, intent) as { kind: string }).kind, 'invalid', 'T17 两个炮架 → 失效');
    state.units.splice(state.units.indexOf(unitById(state, 'rackB')), 1);
    const oneRack = revalidateIntent(state, intent);
    assert(oneRack.kind === 'action', 'T17 恰好一个炮架 → 可结算');
    const effect = applyAction(deepCopy(state), (oneRack as { kind: 'action'; action: UnitAction }).action, false);
    eq(effect.victims, ['t'], 'T17 单架命中目标（炮伤 2 → 兵 1HP 死）');
    state.units.splice(state.units.indexOf(unitById(state, 'rackA')), 1);
    eq((revalidateIntent(state, intent) as { kind: string }).kind, 'invalid', 'T17 无炮架 → 失效');
    state.units.push(makeUnit('rackC', 'enemy', 'pawn', 4, 2));
    state.units.splice(state.units.indexOf(unitById(state, 't')), 1);
    const emptyTarget = revalidateIntent(state, intent);
    eq(emptyTarget.kind, 'action', 'T17 炮架成立落点无目标 → revalidate 仍为 action（原型口径）');
    const emptyEffect = applyAction(deepCopy(state), (emptyTarget as { kind: 'action'; action: UnitAction }).action, false);
    eq(emptyEffect.hits, [], 'T17 炮射空 = 结算空 hits');
}

// ---------- T18 马腿重验与越界 ----------

{
    const state = makeState([
        { id: 't', side: 'player', kind: 'pawn', x: 5, y: 6 },
        { id: 'e1', side: 'enemy', kind: 'horse', x: 4, y: 4 },
    ]);
    const intent = generateIntents(state)[0];
    eq(intent.toPos, { x: 5, y: 6 }, 'T18 马冻结日字攻击');
    state.units.push(makeUnit('legBlock', 'player', 'pawn', 4, 5));
    eq((revalidateIntent(state, intent) as { kind: string }).kind, 'invalid', 'T18 马腿受阻 → 失效');
    state.units.splice(state.units.indexOf(unitById(state, 'legBlock')), 1);
    assert(revalidateIntent(state, intent).kind === 'action', 'T18 马腿通畅 → 命中');
    unitById(state, 'e1').x = 8;
    unitById(state, 'e1').y = 8;
    eq((revalidateIntent(state, intent) as { kind: string }).kind, 'invalid', 'T18 平移后落点越界 → 失效');
}

// ---------- T19 链式与预览=实际（v2：尸体仍是炮架） ----------

{
    const state = makeState([
        { id: 'S', side: 'player', kind: 'pawn', x: 5, y: 2 },
        { id: 'T', side: 'player', kind: 'rook', x: 3, y: 2 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 5, y: 3 },
        { id: 'e2', side: 'enemy', kind: 'cannon', x: 7, y: 2 },
    ]);
    state.intents = generateIntents(state);
    eq(state.intents.map((i) => i.actorId), ['e1', 'e2', 'kk'], 'T19 意图顺序=出生序（kk 自动补入待机）');
    // 预测：e1 击杀 S；e2 穿过 S 的尸体继续命中 T（尸体仍可作炮架）
    const sim = deepCopy(state);
    const simResult = enemyPhase(sim, true);
    eq(simResult.effects.map((e) => e.status), ['success', 'success', 'standby'], 'T19 预测：两发全中（尸体不挡炮）');
    assert(!!simResult.state.corpses?.find((c) => c.x === 5 && c.y === 2), 'T19 S 陆地留尸');
    eq(simResult.effects[1].effect?.landings?.[0]?.id, 'T', 'T19 后序炮命中 T');
    eq(simResult.effects[1].effect?.landings?.[0]?.dead, true, 'T19 T 也被击杀（炮伤 2 vs 车 2HP）');
    // 实际执行同一顺序，结果必须与预测一致
    const real = enemyPhase(deepCopy(state));
    eq(real.effects.map((e) => e.status), simResult.effects.map((e) => e.status), 'T19 执行序列与预测一致（预览=实际）');
}

// ---------- T20 帅亡截断 ----------

{
    const state = makeState([
        { id: 'king', side: 'player', kind: 'king', x: 3, y: 0 },
        { id: 'w', side: 'player', kind: 'pawn', x: 1, y: 5 },
        { id: 'rack', side: 'enemy', kind: 'pawn', x: 4, y: 0 },
        { id: 'pao', side: 'enemy', kind: 'cannon', x: 5, y: 0 },
        { id: 'e2', side: 'enemy', kind: 'pawn', x: 1, y: 6 },
    ]);
    state.intents = generateIntents(state);
    const paoIntent = state.intents.find((i) => i.actorId === 'pao')!;
    eq(paoIntent.toPos, { x: 3, y: 0 }, 'T20 炮优先瞄准帅');
    const sim = enemyPhase(deepCopy(state), true);
    const paoSim = sim.effects.find((_, i) => state.intents![i].actorId === 'pao')!;
    eq(paoSim.status, 'success', 'T20 预测：帅被击杀');
    assert(!sim.state.units.some((u) => u.kind === 'king' && u.side === 'player'), 'T20 预测中帅阵亡');
    // 实际：帅亡后剩余意图截断 + result 标记
    const real = enemyPhase(deepCopy(state));
    assert(!!real.state.result, 'T20 帅亡产生终局 result');
    assert(real.effects.length < state.intents!.length, 'T20 帅亡截断后续意图');
}

// ---------- T21 prepareEnemy：逼近与原地 ----------

{
    const state = makeState([
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 6, y: 6 },
        { id: 'e2', side: 'enemy', kind: 'pawn', x: 6, y: 4 },
    ]);
    const moves = planEnemyPrep(state);
    eq(moves.map((m) => m.unitId), ['e1', 'e2', 'kk'], 'T21 准备顺序=出生顺序（kk 自动补入）');
    eq(moves[0].to, { x: 6, y: 5 }, 'T21 e1 未过河仅前进一格');
    eq(moves[1].to, { x: 6, y: 3 }, 'T21 e2 同样前进一格');
    eq(moves[2].to, { x: 4, y: 7 }, 'T21 kk 向帅逼近');
    eq(unitById(state, 'e1').y, 5, 'T21 规划即落位（对齐原型 prepareEnemy）');
}

{
    const state = makeState([
        { id: 'm', side: 'player', kind: 'pawn', x: 2, y: 0 },
        { id: 'e1', side: 'enemy', kind: 'pawn', x: 3, y: 0 },
    ]);
    const moves = planEnemyPrep(state);
    eq(moves.length, 2, 'T21 有合法攻击的敌人 ready 原地（kk 走位计入）');
    eq(moves[0].ready, true, 'T21 ready=true');
    eq(moves[0].to, { x: 3, y: 0 }, 'T21 原地不移动');
}

// ---------- T22 回合重置与终局 ----------

{
    const state = makeState([
        { id: 'r', side: 'player', kind: 'rook', x: 4, y: 2 },
        { id: 'c', side: 'player', kind: 'cannon', x: 1, y: 2 },
        { id: 'p', side: 'player', kind: 'pawn', x: 2, y: 2 },
    ]);
    unitById(state, 'r').rookMoveAvailable = false;
    unitById(state, 'r').rookChargeAvailable = false;
    unitById(state, 'c').cannonMoveAvailable = false;
    unitById(state, 'c').cannonAttackAvailable = false;
    unitById(state, 'p').ap = 0;
    unitById(state, 'p').combo = 2;
    resetAllTurns(state);
    const r = unitById(state, 'r');
    const c = unitById(state, 'c');
    const p = unitById(state, 'p');
    eq([r.rookMoveAvailable, r.rookChargeAvailable], [true, false], 'T22 基础车冲锋槽不恢复');
    eq([c.cannonMoveAvailable, c.cannonAttackAvailable], [true, true], 'T22 炮双槽恢复');
    eq([p.ap, p.apLimit], [3, 3], 'T22 兵 ap=1+combo');
}

{
    const state = makeState([
        { id: 'king', side: 'player', kind: 'king', x: 4, y: 0 },
        { id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 },
    ]);
    eq(checkTerminal(state), null, 'T22 双帅在场无终局');
    state.units = state.units.filter((u) => u.id !== 'king');
    eq(checkTerminal(state)?.winner, 'enemy', 'T22 我方帅死 → 敌胜');
    const st2 = makeState([
        { id: 'king', side: 'player', kind: 'king', x: 4, y: 0 },
        { id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 },
    ]);
    st2.units = st2.units.filter((u) => u.id !== 'kk');
    eq(checkTerminal(st2)?.winner, 'player', 'T22 敌将死 → 我胜');
}

// ---------- T23 地图校验 ----------

{
    const base = {
        formatVersion: 2,
        meta: { kind: 'battleInit', battleId: 't' },
        map: { tiles: {} as Record<string, string> },
        units: [] as UnitSpec[],
        turn: { round: 1, phase: 'player' },
    };
    // 重叠
    try {
        startBattle({ ...base, units: [
            { id: 'a', side: 'player', kind: 'pawn', x: 1, y: 1 },
            { id: 'b', side: 'player', kind: 'pawn', x: 1, y: 1 },
        ] } as never);
        assert(false, 'T23 重叠应抛错');
    } catch { assert(true, 'T23 重叠抛错'); }
    // 山上站人
    try {
        startBattle({ ...base, map: { tiles: { '1,1': 'mountain' } }, units: [
            { id: 'a', side: 'player', kind: 'pawn', x: 1, y: 1 },
        ] } as never);
        assert(false, 'T23 山上站人应抛错');
    } catch { assert(true, 'T23 山上站人抛错'); }
    // 兵出生在水上（fatalWater 出生禁）
    try {
        startBattle({ ...base, map: { tiles: { '1,1': 'water' } }, units: [
            { id: 'a', side: 'player', kind: 'pawn', x: 1, y: 1 },
        ] } as never);
        assert(false, 'T23 兵出生在水上应抛错');
    } catch { assert(true, 'T23 兵出生在水上抛错'); }
    // 帅不在九宫（startBattle 会直接抛错，这里直接调用 validateMap 检查报错内容）
    const badErrors = validateMap({ tiles: {} }, [
        makeUnit('king', 'player', 'king', 0, 0),
        makeUnit('kk', 'enemy', 'king', 4, 8),
    ]);
    assert(badErrors.length > 0, 'T23 帅 (0,0) 不在九宫 → validateMap 报错');
    // 车出生在水上合法（wet 但可站）
    const okWater = startBattle({ ...base, map: { tiles: { '1,1': 'water' } }, units: [
        { id: 'r', side: 'player', kind: 'rook', x: 1, y: 1 },
        { id: 'king', side: 'player', kind: 'king', x: 4, y: 0 },
        { id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 },
    ] } as never);
    eq(okWater.units.length, 3, 'T23 车/马可出生在水上');
}

// ---------- 汇总 ----------

console.log(`\n通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`  [FAIL] ${failure}`);
    }
    process.exit(1);
}
