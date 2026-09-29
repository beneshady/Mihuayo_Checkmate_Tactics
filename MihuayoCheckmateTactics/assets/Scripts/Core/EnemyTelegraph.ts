import { BattleState, BattleUnit, FrozenIntent, GridPos } from './BattleState';
import { computeReachableCells } from './movement';
import { canAttackIntoTerrain, getTerrainAt } from './Terrain';
import { getUnitDef, MoveDir, UnitDef } from './UnitDefs';

/**
 * 敌方预告回合（US-006）核心规则（纯 TS，零引擎依赖）。
 *
 * 回合合同（详见 preview/docs/us/US-006-enemy-telegraph-turn-loop.md §2）：
 * 1. 敌方准备：按稳定出生序逐敌至多一次普通移动（已有合法攻击则原地），逐个使用实时占位；
 * 2. 全部准备完成后按最终局面为每敌冻结至多一个攻击意图（无合法攻击 → 待机），统一冻结后交给玩家；
 * 3. 玩家行动不重新生成意图；预测仅随局面刷新；
 * 4. 玩家结束回合后按冻结顺序逐个执行；帅阵亡立即停止后续动作。
 *
 * 目标锁定（合同 2.2）：意图保存「冻结落点 − 冻结时位置」的相对位移 offset，
 * 结算目标 = 攻击者当前位置 + offset；不追踪受害者、不回打原绝对格、不换目标。
 * 形状/炮架/马腿/宫界/越界在每次结算时按当前局面重验（applyIntent 单一结算路径），
 * 预测（simulateIntents，跑在深拷贝上）与实际执行共用同一函数，保证「预览 = 实际」。
 *
 * 参照原型 preview/web/js/rules.js 的 prepareEnemy / generateIntents / revalidate / enemyPhase。
 * 参见 docs/design/enemy-telegraph-plan.md。
 */

/** 帅的棋种 id（意图优先级与「帅亡停止」判定的数据约定） */
export const KING_DEF_ID = 'shuai';
/** 车的棋种 id（意图优先级第二档） */
export const ROOK_DEF_ID = 'che';

/** 我方（human 控制方）玩家 id；无则返回 null */
export function findHumanPlayerId(state: BattleState): string | null {
    return state.players.find((p) => p.controller === 'human')?.id ?? null;
}

/** 某玩家的存活帅；场上无帅（如现有关卡未布帅）返回 undefined */
export function findKing(state: BattleState, ownerId: string): BattleUnit | undefined {
    return state.units.find((u) => u.owner === ownerId && u.defId === KING_DEF_ID && (u.hp ?? 1) > 0);
}

/** 深拷贝战局（BattleState 为纯数据；含运行时 intents，供预测模拟使用） */
export function cloneState(state: BattleState): BattleState {
    return JSON.parse(JSON.stringify(state)) as BattleState;
}

// ---------- 敌方准备阶段（合同 2.1.1-2.1.2） ----------

/** 一条敌方准备移动（由协调者逐个播放动画并落到真实战局） */
export interface EnemyPrepMove {
    unitId: string;
    defId: string;
    from: GridPos;
    to: GridPos;
    reason: string;
}

/**
 * 规划全部敌方准备移动（不改动传入战局；内部在深拷贝上推演）。
 * 每敌：已有合法攻击 → 原地（'保持原位'）；否则在合法空格里选「距帅最近，
 * 同距按 y、x 坐标」的一步（确定性，不引入随机）；逐个移动使用实时占位，不叠子。
 * 我方无存活帅时不移动（与原型一致：无从「接近」）。
 * 准备移动不扣体力（与原型 apply(...,consume=false) 一致；M0 体力只约束我方行动）。
 */
export function planEnemyPrep(state: BattleState, defs: UnitDef[]): EnemyPrepMove[] {
    const humanId = findHumanPlayerId(state);
    const king = humanId ? findKing(state, humanId) : undefined;
    const moves: EnemyPrepMove[] = [];
    if (!humanId || !king) {
        return moves;
    }
    const sim = cloneState(state);
    for (const unit of sim.units) {
        if (unit.owner === humanId || (unit.hp ?? 1) <= 0) {
            continue;
        }
        const def = getUnitDef(defs, unit.defId);
        if (!def) {
            continue;
        }
        const hasAttack = computeReachableCells(sim, unit, def, 'attack').some((c) => c.capture);
        if (hasAttack) {
            continue; // 保持原位
        }
        const best = computeReachableCells(sim, unit, def, 'move')
            .filter((c) => !c.capture)
            .map((c) => ({ cell: c, d: Math.abs(c.x - king.pos.x) + Math.abs(c.y - king.pos.y) }))
            .sort((a, b) => a.d - b.d || a.cell.y - b.cell.y || a.cell.x - b.cell.x)[0];
        if (!best) {
            continue; // 无合法移动：原地
        }
        const from = { x: unit.pos.x, y: unit.pos.y };
        unit.pos = { x: best.cell.x, y: best.cell.y }; // 实时占位：后续敌人按最新局面决策
        moves.push({
            unitId: unit.id,
            defId: unit.defId,
            from,
            to: { x: unit.pos.x, y: unit.pos.y },
            reason: `逼近帅（距离 ${best.d}）`,
        });
    }
    return moves;
}

// ---------- 意图冻结（合同 2.1.3） ----------

/**
 * 按当前局面为每个敌方存活单位生成至多一个意图（稳定出生序 = state.units 顺序）。
 * 攻击候选来自走法引擎 attack 模式（炮架/马腿/象眼/入水/地形规则已算好，零特判）；
 * 目标优先级 帅 > 车 > 其他，同优先级按 y、x 坐标（确定性）。
 * 无合法攻击 → standby（明确待机）。不看体力：冻结即承诺（决策④）。
 */
export function generateEnemyIntents(state: BattleState, defs: UnitDef[]): FrozenIntent[] {
    const humanId = findHumanPlayerId(state);
    const intents: FrozenIntent[] = [];
    let order = 0;
    for (const unit of state.units) {
        if (!humanId || unit.owner === humanId || (unit.hp ?? 1) <= 0) {
            continue;
        }
        order += 1;
        const base = {
            actorId: unit.id,
            defId: unit.defId,
            fromPos: { x: unit.pos.x, y: unit.pos.y },
            order,
        };
        const def = getUnitDef(defs, unit.defId);
        const candidates = def
            ? computeReachableCells(state, unit, def, 'attack').filter((c) => c.capture)
            : [];
        if (candidates.length === 0) {
            intents.push({ ...base, type: 'standby', toPos: { x: unit.pos.x, y: unit.pos.y }, offset: { x: 0, y: 0 } });
            continue;
        }
        const targetPriority = (targetDefId: string): number =>
            targetDefId === KING_DEF_ID ? 0 : targetDefId === ROOK_DEF_ID ? 1 : 2;
        candidates.sort((a, b) => {
            const ta = state.units.find((u) => u.pos.x === a.x && u.pos.y === a.y);
            const tb = state.units.find((u) => u.pos.x === b.x && u.pos.y === b.y);
            return (
                (ta ? targetPriority(ta.defId) : 3) - (tb ? targetPriority(tb.defId) : 3) ||
                a.y - b.y ||
                a.x - b.x
            );
        });
        const target = candidates[0];
        intents.push({
            ...base,
            type: 'attack',
            toPos: { x: target.x, y: target.y },
            offset: { x: target.x - unit.pos.x, y: target.y - unit.pos.y },
        });
    }
    return intents;
}

// ---------- 意图结算（合同 2.2 / 2.3；预测与执行唯一路径） ----------

/** 单个意图的结算结果（预测与执行同构） */
export interface IntentForecast {
    intent: FrozenIntent;
    /** hit=命中（含友伤）；miss=落空/射空；invalid=失效；standby=待机；removed=攻击者已阵亡；skipped=帅亡后截断未执行 */
    status: 'hit' | 'miss' | 'invalid' | 'standby' | 'removed' | 'skipped';
    /** 攻击者当前位置（removed 为 null） */
    fromPos: GridPos | null;
    /** 本次结算落点 = 攻击者当前位置 + offset */
    toPos: GridPos | null;
    /** 直线/炮攻击路径（含起终点；仅可执行/落空时给出） */
    path: GridPos[];
    victim: { unitId: string; defId: string; hpBefore: number; hpAfter: number; dies: boolean } | null;
    /** 失效原因 / 落空说明 / 友伤标注；正常命中为 null */
    reason: string | null;
}

function forecast(intent: FrozenIntent, patch: Partial<IntentForecast>): IntentForecast {
    return { intent, status: 'invalid', fromPos: null, toPos: null, path: [], victim: null, reason: null, ...patch };
}

interface ShapeResult {
    ok: boolean;
    reason: string | null;
    path: GridPos[];
}

function occupiedAt(state: BattleState, x: number, y: number): BattleUnit | undefined {
    return state.units.find((u) => u.pos.x === x && u.pos.y === y && (u.hp ?? 1) > 0);
}

/** 直线方向匹配（slide 用；dir 为单位轴向量） */
function matchesDir(dx: number, dy: number, dir: MoveDir): boolean {
    if (dx === 0 && dy === 0) return false;
    if (dir.dx !== 0 ? Math.sign(dx) !== dir.dx : dx !== 0) return false;
    if (dir.dy !== 0 ? Math.sign(dy) !== dir.dy : dy !== 0) return false;
    return true;
}

/** from → to 的直线格序列（含两端；仅同行/列时有效） */
function linePath(from: GridPos, to: GridPos): GridPos[] {
    const path: GridPos[] = [];
    const stepX = Math.sign(to.x - from.x);
    const stepY = Math.sign(to.y - from.y);
    let x = from.x;
    let y = from.y;
    path.push({ x, y });
    while (x !== to.x || y !== to.y) {
        x += stepX;
        y += stepY;
        path.push({ x, y });
    }
    return path;
}

/**
 * 按「攻击者当前位置 → 落点」重验攻击形状（合同 2.2/2.3）：
 * 走法引擎同源的形状判定（step/jump 逐 spec 比对方向距离、leg 别腿、slide 直线路径），
 * 但不看落点是谁——友伤由结算层处理（合同 2.3：不能因为是同阵营而取消）。
 */
function validateAttackShape(state: BattleState, attacker: BattleUnit, def: UnitDef, to: GridPos): ShapeResult {
    const specs = def.attackSpecs ?? def.moveSpecs;
    const dx = to.x - attacker.pos.x;
    const dy = to.y - attacker.pos.y;
    if (dx === 0 && dy === 0) {
        return { ok: false, reason: '落点与攻击者重合', path: [] };
    }
    for (const spec of specs) {
        if (spec.type === 'step' || spec.type === 'jump') {
            if (dx !== spec.dir.dx || dy !== spec.dir.dy) {
                continue;
            }
            if (spec.passage === 'leg') {
                const leg = {
                    x: attacker.pos.x + (spec.leg?.dx ?? 0),
                    y: attacker.pos.y + (spec.leg?.dy ?? 0),
                };
                if (occupiedAt(state, leg.x, leg.y)) {
                    return { ok: false, reason: '马腿/象眼受阻', path: [] };
                }
            }
            if (!canAttackIntoTerrain(def, getTerrainAt(state, to.x, to.y))) {
                return { ok: false, reason: '目标地形不可攻击', path: [] };
            }
            return { ok: true, reason: null, path: [{ x: attacker.pos.x, y: attacker.pos.y }, { ...to }] };
        }
        // slide（炮 = screen；solid 直线为未来棋种备用）
        if (!matchesDir(dx, dy, spec.dir)) {
            continue;
        }
        const path = linePath({ x: attacker.pos.x, y: attacker.pos.y }, to);
        const between = path.slice(1, -1);
        if (spec.passage === 'screen') {
            const screens = between.filter((p) => occupiedAt(state, p.x, p.y)).length;
            if (screens !== (spec.screen ?? 1)) {
                return { ok: false, reason: screens === 0 ? '缺少炮架' : '炮架数量不为一', path: [] };
            }
        } else if (spec.passage === 'solid') {
            if (between.some((p) => occupiedAt(state, p.x, p.y))) {
                return { ok: false, reason: '攻击路径被阻挡', path: [] };
            }
        } // fly：无视阻挡
        if (!canAttackIntoTerrain(def, getTerrainAt(state, to.x, to.y))) {
            return { ok: false, reason: '目标地形不可攻击', path: [] };
        }
        return { ok: true, reason: null, path };
    }
    return { ok: false, reason: '攻击形状或方向失效', path: [] };
}

/**
 * 结算单个意图并【修改战局】（预测时传入深拷贝、执行时传入真实战局——同一函数同一语义）。
 * 失效/落空/待机不改动局面；命中按当前落点占位者扣血（不分阵营，友伤照常），
 * 阵亡即从战局移除（与 attackUnit 同约定）。不扣体力：冻结攻击是承诺。
 */
export function applyIntent(state: BattleState, defs: UnitDef[], intent: FrozenIntent): IntentForecast {
    const attacker = state.units.find((u) => u.id === intent.actorId && (u.hp ?? 1) > 0);
    if (!attacker) {
        return forecast(intent, { status: 'removed', reason: '攻击者已阵亡' });
    }
    const fromPos = { x: attacker.pos.x, y: attacker.pos.y };
    if (intent.type === 'standby') {
        return forecast(intent, { status: 'standby', fromPos, toPos: { ...fromPos } });
    }
    const to: GridPos = { x: attacker.pos.x + intent.offset.x, y: attacker.pos.y + intent.offset.y };
    if (to.x < 0 || to.x >= state.map.width || to.y < 0 || to.y >= state.map.height) {
        return forecast(intent, { status: 'invalid', fromPos, toPos: to, reason: '落点越界' });
    }
    const def = getUnitDef(defs, intent.defId);
    if (!def) {
        return forecast(intent, { status: 'invalid', fromPos, toPos: to, reason: '棋种定义缺失' });
    }
    const shape = validateAttackShape(state, attacker, def, to);
    if (!shape.ok) {
        return forecast(intent, { status: 'invalid', fromPos, toPos: to, reason: shape.reason });
    }
    const victim = occupiedAt(state, to.x, to.y) ?? null;
    if (!victim) {
        // 落点为空：炮“射空”（炮架已验），其他棋种目标已走开——都不产生伤害（合同 2.3）
        const isCannon = (def.attackSpecs ?? []).some((s) => s.passage === 'screen');
        return forecast(intent, {
            status: 'miss',
            fromPos,
            toPos: to,
            path: shape.path,
            reason: isCannon ? '射空（落点无目标）' : '目标已离开，落空',
        });
    }
    const victimDef = getUnitDef(defs, victim.defId);
    const hpBefore = victim.hp ?? victimDef?.maxHp ?? 1;
    const hpAfter = hpBefore - def.attack;
    victim.hp = hpAfter;
    let dies = false;
    if (victim.hp <= 0) {
        dies = true;
        state.units.splice(state.units.indexOf(victim), 1);
    }
    return forecast(intent, {
        status: 'hit',
        fromPos,
        toPos: to,
        path: shape.path,
        victim: { unitId: victim.id, defId: victim.defId, hpBefore, hpAfter, dies },
        reason: victim.owner === attacker.owner ? '友伤：命中本方同伴' : null,
    });
}

/**
 * 按冻结顺序预测全部意图（不改传入战局；跑在深拷贝上，前序结果影响后序局面）。
 * 我方帅阵亡后剩余意图标记 skipped（合同 2.4：停止后续动作；预测与执行同样截断）。
 */
export function simulateIntents(state: BattleState, defs: UnitDef[]): IntentForecast[] {
    const sim = cloneState(state);
    const humanId = findHumanPlayerId(sim);
    const out: IntentForecast[] = [];
    const intents = sim.intents ?? [];
    for (let i = 0; i < intents.length; i++) {
        if (humanId && !findKing(sim, humanId)) {
            out.push(forecast(intents[i], { status: 'skipped', reason: '我方帅已阵亡，停止后续攻击' }));
            continue;
        }
        out.push(applyIntent(sim, defs, intents[i]));
    }
    return out;
}

/**
 * 敌方攻击阶段是否应截断（合同 2.4：我方帅实际阵亡立即失败并停止后续）。
 * 场上无帅的关卡恒为 false（帅生死不参与）。
 */
export function isHumanKingDead(state: BattleState): boolean {
    const humanId = findHumanPlayerId(state);
    if (!humanId) {
        return false;
    }
    return !findKing(state, humanId);
}
