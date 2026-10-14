import { BattleState, BattleUnit, PendingSpawn, UnitKind } from './BattleState';
import { makeUnit } from './UnitDefs';
import { corpseAt, isCommanderTarget, unitAt } from './Terrain';
import { deepCopy, removeDead, resetAllTurns } from './Rules';

/**
 * P6 波次入场（本轮先提供救援/第二波所需的最小集，回合推进 endTurn 归 P6 补齐）。
 * 对齐原型 rules.js 的 pendingWaveTwo / attemptSpawns / enterWaveTwo；纯 TS，零引擎依赖。
 */

/** 第二波敌方配置（对齐原型 C.waveTwo） */
const WAVE_TWO: Array<[UnitKind, number, number]> = [
    ['pawn', 2, 5],
    ['pawn', 5, 5],
    ['pawn', 8, 5],
    ['rook', 1, 7],
    ['cannon', 7, 7],
    ['horse', 4, 6],
];

/** 生成第二波待入场敌人（对齐原型 pendingWaveTwo） */
export function pendingWaveTwo(): PendingSpawn[] {
    return WAVE_TWO.map(([kind, x, y], i): PendingSpawn => ({ id: `w2-${i}`, kind, x, y, status: 'pending' }));
}

/**
 * 逐个尝试入场（对齐原型 attemptSpawns，原地修改）：
 * - 出生格被我方占：扣 1 血并阻挡本次（removeDead 处理可能的阵亡）；
 * - 被旧敌占：暂缓重试；
 * - 被尸体占：先清除尸体再入场。
 */
export function attemptSpawns(state: BattleState): Array<{ id: string; status: PendingSpawn['status']; to: { x: number; y: number } }> {
    const effects: Array<{ id: string; status: PendingSpawn['status']; to: { x: number; y: number } }> = [];
    (state.pendingSpawns ?? []).forEach((p) => {
        if (p.status === 'spawned') {
            return;
        }
        const pos = { x: p.x, y: p.y };
        const live = unitAt(state, pos.x, pos.y);
        const body = corpseAt(state, pos.x, pos.y);
        if (live && live.side === 'player') {
            live.hp -= 1;
            removeDead(state, undefined);
            p.status = 'blocked';
            p.reason = '友军占出生格，本次扣1并阻挡';
            effects.push({ id: p.id, status: 'blocked', to: pos });
            return;
        }
        if (live) {
            // 对齐原型：状态标 'blocked'（效果明细里才报 blocked-enemy），两者都会在后续回合重试
            p.status = 'blocked';
            p.reason = '旧敌占出生格，暂缓重试（临时边界 TBD）';
            effects.push({ id: p.id, status: 'blocked-enemy', to: pos });
            return;
        }
        if (body) {
            state.corpses = (state.corpses ?? []).filter((c) => c !== body);
        }
        state.units.push(makeUnit(p.id, 'enemy', p.kind as UnitKind, p.x, p.y));
        p.status = 'spawned';
        p.reason = body ? '清除尸体后入场' : '已入场';
        effects.push({ id: p.id, status: 'spawned', to: pos });
    });
    return effects;
}

/**
 * 进入第二波（对齐原型 enterWaveTwo，原地修改）：
 * wave=2、清 rescue 标记、补齐待入场列表并立即尝试入场。
 * 敌方准备由视图回合循环驱动（与 chooseCommanderBuff 同一分层约定）。
 */
export function enterWaveTwo(state: BattleState): void {
    state.wave = 2;
    state.rescueRequired = false;
    state.pendingSpawns = (state.pendingSpawns ?? []).length ? state.pendingSpawns : pendingWaveTwo();
    attemptSpawns(state);
}

/** 单元类型守卫：波次结算里出现的我方受伤单位（供视图提示用） */
export function woundedPlayers(state: BattleState): BattleUnit[] {
    return state.units.filter((u) => u.side === 'player' && u.hp < u.maxHp);
}

/**
 * 回合推进本体（对齐原型 endTurn 的 turn++ 后半段；pure）：
 * round+1 并重置行动额度；round5 增援预告；round6 按帅增益进 rescue 或直接第二波；
 * round≥7 尝试第二波入场。敌方结算（enemyPhase）与坚守胜利（round≥11）由视图回合
 * 循环承担（分层约定同 chooseCommanderBuff——Core 只做状态迁移）。
 * 拒绝（phase 非 player）返回原引用。
 */
export function advanceTurn(state: BattleState): BattleState {
    if (state.turn.phase !== 'player') {
        return state;
    }
    const next = deepCopy(state);
    next.turn.round += 1;
    resetAllTurns(next);
    if (next.turn.round === 5) {
        next.reinforcementPreview = true;
        next.pendingSpawns = pendingWaveTwo();
    }
    if (next.turn.round === 6) {
        const hasRescueChoice = next.units.some((u) => isCommanderTarget(u))
            || (next.corpses ?? []).some((c) => c.unit);
        if (next.commanderBuff === 'rescue' && !next.rescueUsed && hasRescueChoice) {
            next.turn.phase = 'rescue';
            next.rescueRequired = true;
            next.intents = [];
        } else {
            enterWaveTwo(next);
        }
    } else if (next.turn.round >= 7 && (next.pendingSpawns ?? []).some((p) => p.status !== 'spawned')) {
        attemptSpawns(next);
    }
    return next;
}
