import {
    BattleState,
    BattleUnit,
    FrozenIntent,
    GridPos,
} from './BattleState';
import { applyAction, deepCopy, Effect } from './Rules';
import { UnitAction, directionalAction, enemyAttacks, enemyMoves, ordinaryAction } from './Actions';
import { isOccupied, isWet, linePath, isMountainAt, unitAt } from './Terrain';
import { inside } from './Config';

/**
 * 敌方预告回合引擎（v2，对齐原型 prepareEnemy/generateIntents/intentTarget/
 * revalidate/frozenAttack/enemyPhase；纯 TS，零引擎依赖）。
 *
 * 流程：准备（无攻击 → 向我方帅曼哈顿最近移动一步；有攻击 → 原地待命）→
 * 冻结意图（每敌至多一个，优先级 帅0>车1>其他2，同级按 y/x；offset 相对位移锁定）→
 * 玩家行动（意图不重生成，预测实时刷新）→ 敌方按 order 逐条重验结算（帅亡截断）。
 */

/** 准备阶段单敌计划（视图逐个播放） */
export interface EnemyPrepMove {
    unitId: string;
    from: GridPos;
    to: GridPos;
    /** 逼近理由（日志用） */
    reason: string;
    /** 原地待命（有攻击可用或无可行动作） */
    ready: boolean;
}

/** 意图重验结果（对齐原型 revalidate 的各种出口） */
export type Revalidated =
    | { kind: 'action'; action: UnitAction }
    | { kind: 'standby'; intent: FrozenIntent }
    | { kind: 'missOnly'; to: GridPos }
    | { kind: 'invalid'; reason: string };

/** 敌方单意图结算效果（对齐原型 enemyPhase 的 effect 形状） */
export interface EnemyIntentEffect {
    actor: string;
    to: GridPos;
    status: 'removed' | 'standby' | 'cancelled' | 'miss' | 'success';
    reason?: string;
    /** 实际结算效果（success 时存在；预测与执行共用 applyAction） */
    effect?: Effect;
    /** 林闪避条件结果（预测模式聚合） */
    conditional?: boolean;
}

/** 当前回合我方帅；不存在返回 undefined */
export function findHumanKing(state: BattleState): BattleUnit | undefined {
    return state.units.find((u) => u.side === 'player' && u.kind === 'king');
}

/** 我方帅是否已阵亡（帅亡即时败北判定用） */
export function isHumanKingDead(state: BattleState): boolean {
    return !findHumanKing(state);
}

/** 意图结算落点 = 攻击者当前位置 + offset（对齐原型 intentTarget） */
export function intentTarget(state: BattleState, intent: FrozenIntent): GridPos {
    const unit = state.units.find((v) => v.id === intent.actorId);
    if (unit) {
        return { x: unit.x + intent.offset.x, y: unit.y + intent.offset.y };
    }
    return { ...intent.toPos };
}

/**
 * 敌方准备计划（对齐原型 prepareEnemy：边规划边即时落位——后续敌人的攻击判定
 * 与走位枚举都能看到前序移动后的占位）。返回值供视图逐个播放动画。
 * 已有攻击 → ready 原地；否则向帅曼哈顿最近的移动一步。
 */
export function planEnemyPrep(state: BattleState): EnemyPrepMove[] {
    const king = findHumanKing(state);
    const moves: EnemyPrepMove[] = [];
    if (!king) {
        return moves;
    }
    state.units.filter((u) => u.side === 'enemy').forEach((unit) => {
        const attacks = enemyAttacks(state, unit);
        if (attacks.length) {
            moves.push({ unitId: unit.id, from: { x: unit.x, y: unit.y }, to: { x: unit.x, y: unit.y }, reason: '有攻击可用，原地待命', ready: true });
            return;
        }
        const options = enemyMoves(state, unit);
        options.sort((a, b) => {
            const da = Math.abs(a.to.x - king.x) + Math.abs(a.to.y - king.y);
            const db = Math.abs(b.to.x - king.x) + Math.abs(b.to.y - king.y);
            return da - db || a.to.y - b.to.y || a.to.x - b.to.x;
        });
        if (!options.length) {
            moves.push({ unitId: unit.id, from: { x: unit.x, y: unit.y }, to: { x: unit.x, y: unit.y }, reason: '无可行动作，待机', ready: true });
            return;
        }
        const best = options[0];
        moves.push({
            unitId: unit.id,
            from: { x: unit.x, y: unit.y },
            to: { ...best.to },
            reason: `逼近帅（距离 ${Math.abs(best.to.x - king.x) + Math.abs(best.to.y - king.y)}）`,
            ready: false,
        });
        // 原型口径：规划即落位（不扣额度），保证后续敌人规划基于最新占位
        unit.x = best.to.x;
        unit.y = best.to.y;
    });
    return moves;
}

/** 应用一步准备移动（视图播放时调用；直接改 state 坐标，不扣额度；重复落位幂等） */
export function applyPrepMove(state: BattleState, unitId: string, to: GridPos): boolean {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit || unit.side !== 'enemy' || !inside(to)) {
        return false;
    }
    if (unit.x === to.x && unit.y === to.y) {
        return true; // planEnemyPrep 已即时落位 → 幂等确认
    }
    if (unitAt(state, to.x, to.y)) {
        return false; // 不叠子
    }
    unit.x = to.x;
    unit.y = to.y;
    return true;
}

/** 冻结全部敌方意图（对齐原型 generateIntents：优先级 帅0>车1>其他2，同级按 y/x） */
export function generateIntents(state: BattleState): FrozenIntent[] {
    const king = findHumanKing(state);
    if (!king) {
        return [];
    }
    const out: FrozenIntent[] = [];
    let order = 0;
    state.units.filter((u) => u.side === 'enemy').forEach((unit) => {
        order += 1;
        const attacks = enemyAttacks(state, unit);
        attacks.sort((a, b) => {
            const ta = unitAt(state, a.to.x, a.to.y);
            const tb = unitAt(state, b.to.x, b.to.y);
            const pa = ta && ta.kind === 'king' ? 0 : ta && ta.kind === 'rook' ? 1 : 2;
            const pb = tb && tb.kind === 'king' ? 0 : tb && tb.kind === 'rook' ? 1 : 2;
            return pa - pb || a.to.y - b.to.y || a.to.x - b.to.x;
        });
        const best = attacks[0];
        if (!best) {
            out.push({
                actorId: unit.id,
                kind: unit.kind,
                type: 'standby',
                fromPos: { x: unit.x, y: unit.y },
                toPos: { x: unit.x, y: unit.y },
                offset: { x: 0, y: 0 },
                order,
                path: [],
            });
            return;
        }
        const action = deepCopy(best);
        out.push({
            actorId: unit.id,
            kind: unit.kind,
            type: action.type === 'directional' ? 'directional' : action.type === 'charge' ? 'charge' : 'attack',
            fromPos: { x: unit.x, y: unit.y },
            toPos: { ...action.to },
            offset: { x: action.to.x - unit.x, y: action.to.y - unit.y },
            order,
            direction: action.direction,
            targets: action.targets,
            mountains: action.mountains,
            path: action.path.map((p) => ({ ...p })),
        });
    });
    return out;
}

/**
 * 攻击形状重验（对齐原型 frozenAttack）：
 * 炮沿冻结方向重找炮架（山架修正）；普通攻击以「侧交换」验证形状；
 * 无目标可打但形状成立 → missOnly（射空/落空）。
 */
function frozenAttack(state: BattleState, unit: BattleUnit, to: GridPos): Revalidated {
    if (!inside(to) || (unit.x === to.x && unit.y === to.y)) {
        return { kind: 'invalid', reason: '落点越界或与攻击者重合' };
    }
    let path = linePath(unit, to);
    if (unit.kind === 'cannon') {
        if (!path.length) {
            return { kind: 'invalid', reason: '炮的攻击方向失效' };
        }
        const rocks = path.filter((p) => isMountainAt(state, p.x, p.y));
        for (const rp of rocks) {
            const prefix = linePath(unit, rp);
            if (prefix.slice(0, -1).filter((p) => isOccupied(state, p.x, p.y)).length === 1) {
                to = { ...rp };
                path = prefix;
                break;
            }
        }
        // 炮架口径与原型 occupied 一致：活单位 / 尸体 / 山均可作架
        const screens = path.slice(0, -1).filter((p) => isOccupied(state, p.x, p.y)).length;
        if (screens !== 1) {
            return { kind: 'invalid', reason: screens > 0 ? '炮架数量不为一' : '缺少炮架' };
        }
        return { kind: 'action', action: { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'attack', path } };
    }
    const rock = path.find((p) => isMountainAt(state, p.x, p.y));
    if (rock) {
        to = { ...rock };
    }
    const target = unitAt(state, to.x, to.y);
    if (!target && !isMountainAt(state, to.x, to.y)) {
        return ordinaryAction(state, unit, to, true)
            ? { kind: 'missOnly', to: { ...to } }
            : { kind: 'invalid', reason: '攻击形状或路径失效' };
    }
    // 侧交换验证形状：临时把目标换到攻击者阵营，排除「目标自身占位」对形状的干扰
    let action: ReturnType<typeof ordinaryAction>;
    if (target) {
        const old = target.side;
        target.side = unit.side === 'enemy' ? 'player' : 'enemy';
        action = ordinaryAction(state, unit, to);
        target.side = old;
    } else {
        action = ordinaryAction(state, unit, to);
    }
    if (!action) {
        return { kind: 'invalid', reason: '攻击形状或路径失效' };
    }
    return { kind: 'action', action: { ...action, type: 'attack' } };
}

/** 意图重验（对齐原型 revalidate：按类型走对应引擎） */
export function revalidateIntent(state: BattleState, intent: FrozenIntent): Revalidated {
    const unit = state.units.find((v) => v.id === intent.actorId);
    if (!unit) {
        return { kind: 'invalid', reason: '攻击者已阵亡' };
    }
    if (intent.type === 'standby') {
        return { kind: 'standby', intent };
    }
    if (isWet(state, unit)) {
        return { kind: 'invalid', reason: '水中无法攻击' };
    }
    const to = intentTarget(state, intent);
    if (intent.type === 'directional') {
        const a = directionalAction(state, unit.id, intent.direction ?? -1);
        return a ? { kind: 'action', action: a } : { kind: 'missOnly', to };
    }
    if (intent.type === 'charge') {
        const path = linePath(unit, to);
        if (!path.length || path.length > 1 || path.slice(0, -1).some((p) => isOccupied(state, p.x, p.y))) {
            return { kind: 'invalid', reason: '冲击路径失效' };
        }
        return { kind: 'action', action: { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'charge', path } };
    }
    return frozenAttack(state, unit, to);
}

/**
 * 结算单个敌方意图（对齐原型 enemyPhase 的单意图分支）。
 * @param previewMode 预测模式：在深拷贝上运行，林闪避只标条件
 */
export function applyEnemyIntent(state: BattleState, intent: FrozenIntent, previewMode = false): EnemyIntentEffect {
    const to = intentTarget(state, intent);
    const unit = state.units.find((v) => v.id === intent.actorId);
    if (!unit) {
        return { actor: intent.actorId, to, status: 'removed' };
    }
    if (intent.type === 'standby') {
        return { actor: intent.actorId, to, status: 'standby' };
    }
    const revalidated = revalidateIntent(state, intent);
    if (revalidated.kind === 'invalid') {
        return { actor: intent.actorId, to, status: 'cancelled', reason: revalidated.reason };
    }
    if (revalidated.kind === 'standby') {
        return { actor: intent.actorId, to, status: 'standby' };
    }
    if (revalidated.kind === 'missOnly') {
        return { actor: intent.actorId, to: revalidated.to, status: 'miss' };
    }
    // 敌方无额度概念：consumeAction=false
    const effect = applyAction(state, revalidated.action, false, previewMode);
    return { actor: intent.actorId, to: { x: unit.x, y: unit.y }, status: 'success', effect };
}

/**
 * 全量敌方回合（对齐原型 enemyPhase）：按 order 逐意图结算，终局发生立即截断。
 * 预测用法：enemyPhase(deepCopy(state), true)。
 */
export function enemyPhase(state: BattleState, previewMode = false): { state: BattleState; effects: EnemyIntentEffect[]; conditional: boolean } {
    const next = previewMode ? deepCopy(state) : state;
    const effects: EnemyIntentEffect[] = [];
    let conditional = false;
    const intents = next.intents ?? [];
    intents.forEach((intent) => {
        if (next.result) {
            return; // 帅亡等终局已发生，截断后续意图
        }
        const e = applyEnemyIntent(next, intent, previewMode);
        if (previewMode && (conditional || e.conditional)) {
            e.conditional = true;
            conditional = true;
        }
        effects.push(e);
    });
    if (!previewMode) {
        next.intents = [];
    }
    return { state: next, effects, conditional };
}

/** 意图预测（威胁面板用）：单意图在深拷贝上的结算结果状态 */
export function simulateIntent(state: BattleState, intent: FrozenIntent): EnemyIntentEffect {
    const sim = deepCopy(state);
    sim.intents = [intent];
    return enemyPhase(sim, true).effects[0]
        ?? { actor: intent.actorId, to: intentTarget(state, intent), status: 'standby' };
}
