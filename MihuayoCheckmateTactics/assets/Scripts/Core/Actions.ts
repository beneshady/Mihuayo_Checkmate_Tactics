import { BattleState, BattleUnit, GridPos, UnitKind } from './BattleState';
import { CONFIG, inPalace, inside } from './Config';
import {
    corpseAt,
    isMountainAt,
    isOccupied,
    isSafePath,
    isWet,
    isWaterAt,
    linePath,
    samePos,
    unitAt,
} from './Terrain';

/**
 * 动作生成引擎（v2，对齐原型 rules.js 的 ordinary/rookBase/rookCharge/rookPull/
 * enemyRookActions/directionalAction/legalActions/actionAt；纯 TS，零引擎依赖）。
 *
 * 动作类型与原型 a.type 一致：
 * move（普通移动）/ rook-move（车）/ attack（普通攻击，含炮隔架、车直线合一）/
 * charge（冲锋；敌车贴身攻击同型）/ charge-corpse（推尸）/ pull、pull-collision（牵引）/
 * directional（弓枪方向攻击，多目标）。
 * 「高亮即许可」：生成结果即全部合法动作，执行前不再另行校验形状。
 */

export type ActionType = 'move' | 'rook-move' | 'attack' | 'charge' | 'charge-corpse' | 'pull' | 'pull-collision' | 'directional';

export interface UnitAction {
    actorId: string;
    from: GridPos;
    to: GridPos;
    type: ActionType;
    path: GridPos[];
    /** directional：路径上全部命中目标 id（贯穿可多目标） */
    targets?: string[];
    /** directional：路径上可攻击的山（距射程内） */
    mountains?: GridPos[];
    /** directional：方向索引 */
    direction?: number;
    /** pull：目标被拉到的落点 */
    targetTo?: GridPos;
}

/** 兵/弓/枪（pawnish：直线走法框架共用） */
export function isPawnish(kind: UnitKind): boolean {
    return kind === 'pawn' || kind === 'archer' || kind === 'spearman';
}

/** 兵方向限制：前进 1 格；过河（我方 y≥5 / 敌方 y≤3）后可横走（对齐原型 pawnMove） */
function pawnMoveOk(unit: BattleUnit, dx: number, dy: number): boolean {
    const forward = unit.side === 'player' ? 1 : -1;
    const crossed = unit.side === 'player' ? unit.y >= 5 : unit.y <= 3;
    return (dx === 0 && Math.sign(dy) === forward) || (crossed && dy === 0 && dx !== 0);
}

/** 帅/士的宫内斜线（中心↔角） */
function palaceDiag(side: 'player' | 'enemy', a: GridPos, b: GridPos): boolean {
    const q = side === 'player' ? CONFIG.playerPalace : CONFIG.enemyPalace;
    return Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 1
        && ((a.x === q.cx && a.y === q.cy) || (b.x === q.cx && b.y === q.cy));
}

/** 从格 to 反推普通动作；语义对齐原型 ordinary（attackOnly 仅供意图重验使用） */
export function ordinaryAction(state: BattleState, unit: BattleUnit, to: GridPos, attackOnly = false): UnitAction | undefined {
    if (!inside(to) || samePos(unit, to) || corpseAt(state, to.x, to.y)) {
        return undefined;
    }
    const target = unitAt(state, to.x, to.y);
    const rock = isMountainAt(state, to.x, to.y);
    if ((target && target.side === unit.side) || (isWet(state, unit) && (target || rock))) {
        return undefined;
    }
    const dx = to.x - unit.x;
    const dy = to.y - unit.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const limit = 1 + unit.commanderMove;
    let ok = false;
    let path: GridPos[] = [{ ...to }];
    if (unit.kind === 'king') {
        ok = inPalace(unit.side, unit) && inPalace(unit.side, to) && (ax + ay === 1 || palaceDiag(unit.side, unit, to));
    } else if (unit.kind === 'advisor') {
        ok = inPalace(unit.side, unit) && inPalace(unit.side, to) && palaceDiag(unit.side, unit, to);
    } else if (isPawnish(unit.kind)) {
        path = linePath(unit, to);
        const dist = Math.max(ax, ay);
        // 兵：移动与贴身攻击共用；弓/枪：ordinary 仅移动（远程攻击走 directional），不能选敌/山
        ok = (unit.kind === 'pawn' || (!target && !rock))
            && pawnMoveOk(unit, dx, dy)
            && dist <= limit
            && (!(target || rock) || dist === 1)
            && !path.slice(0, -1).some((p) => isOccupied(state, p.x, p.y));
    } else if (unit.kind === 'horse') {
        const leg = {
            x: unit.x + (ax === 2 ? Math.sign(dx) : 0),
            y: unit.y + (ay === 2 ? Math.sign(dy) : 0),
        };
        ok = ax * ay === 2 && !isOccupied(state, leg.x, leg.y);
    } else if (unit.kind === 'cannon' && (dx === 0 || dy === 0)) {
        path = linePath(unit, to);
        const screens = path.slice(0, -1).filter((p) => isOccupied(state, p.x, p.y)).length;
        // 移动：途中 0 占位且 ≤3 格；攻击（敌子或山）：恰好 1 炮架
        ok = target || rock ? screens === 1 : screens === 0 && path.length <= 3 + unit.commanderMove;
    } else {
        return undefined;
    }
    if (!ok) {
        return undefined;
    }
    const isAttack = !!(target || rock);
    if (attackOnly || isAttack || isSafePath(state, unit.kind, path)) {
        return { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: isAttack ? 'attack' : 'move', path };
    }
    return undefined;
}

/** 基础/冲锋/牵引车的普通移动与基础车直线合一攻击（对齐原型 rookBase） */
export function rookBaseAction(state: BattleState, unit: BattleUnit, to: GridPos): UnitAction | undefined {
    if (!inside(to) || samePos(unit, to) || (unit.x !== to.x && unit.y !== to.y) || corpseAt(state, to.x, to.y) || !unit.rookMoveAvailable) {
        return undefined;
    }
    const target = unitAt(state, to.x, to.y);
    const rock = isMountainAt(state, to.x, to.y);
    if ((target && target.side === unit.side) || ((target || rock) && unit.rookRole !== 'base') || (isWet(state, unit) && (target || rock))) {
        return undefined;
    }
    const path = linePath(unit, to);
    const limit = unit.rookMoveRange + (unit.commanderMove && !target && !rock ? 1 : 0);
    if (path.length > limit || path.slice(0, -1).some((p) => isOccupied(state, p.x, p.y))) {
        return undefined;
    }
    const isAttack = !!(target || rock);
    return {
        actorId: unit.id,
        from: { x: unit.x, y: unit.y },
        to: { ...to },
        type: isAttack ? 'attack' : 'rook-move',
        path,
    };
}

/** 冲锋（含冲向尸体的 charge-corpse；对齐原型 rookCharge；结算见 Rules.applyCharge） */
export function rookChargeAction(state: BattleState, unit: BattleUnit, to: GridPos): UnitAction | undefined {
    if (!inside(to) || samePos(unit, to) || (unit.x !== to.x && unit.y !== to.y) || !unit.rookChargeAvailable || isWet(state, unit)) {
        return undefined;
    }
    const target = unitAt(state, to.x, to.y);
    const body = corpseAt(state, to.x, to.y);
    if (target && target.side === unit.side) {
        return undefined;
    }
    const path = linePath(unit, to);
    if (path.length > unit.rookChargeRange || path.slice(0, -1).some((p) => isOccupied(state, p.x, p.y))) {
        return undefined;
    }
    if (body) {
        return unit.rookPush
            ? { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'charge-corpse', path }
            : undefined;
    }
    return { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'charge', path };
}

/** 牵引（对齐原型 rookPull；紧贴强拉例外 = pull-collision；结算见 Rules.applyPull） */
export function rookPullAction(state: BattleState, unit: BattleUnit, to: GridPos): UnitAction | undefined {
    if (!inside(to) || samePos(unit, to) || (unit.x !== to.x && unit.y !== to.y) || !unit.rookChargeAvailable || isWet(state, unit)) {
        return undefined;
    }
    // 牵引目标可为活单位或尸体（尸体仅可拉移，不可贴身强拉）
    const live = unitAt(state, to.x, to.y);
    const body = live ? undefined : corpseAt(state, to.x, to.y);
    if (!live && !body) {
        return undefined;
    }
    if (live && live.kind === 'advisor') {
        return undefined; // 固定装置（我方固定仕）不可被牵引
    }
    const path = linePath(unit, to);
    if (path.length > unit.rookPullRange || path.slice(0, -1).some((p) => isOccupied(state, p.x, p.y))) {
        return undefined;
    }
    const dx = Math.sign(to.x - unit.x);
    const dy = Math.sign(to.y - unit.y);
    const next = { x: to.x - dx, y: to.y - dy };
    if (path.length === 1) {
        // 贴身强拉例外：仅敌活子，双方各 -1 不换位
        if (!live || live.side === unit.side) {
            return undefined;
        }
        return { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'pull-collision', path };
    }
    if (!inside(next) || isOccupied(state, next.x, next.y)) {
        return undefined;
    }
    if (live && (live.kind === 'king' || live.kind === 'advisor') && !inPalace(live.side, next)) {
        return undefined;
    }
    return { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'pull', path, targetTo: next };
}

/** 敌方车：移动 ≤3 格或贴身冲锋（对齐原型 enemyRookActions） */
function enemyRookActions(state: BattleState, unit: BattleUnit): UnitAction[] {
    const out: UnitAction[] = [];
    for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
            const to = { x, y };
            const target = unitAt(state, x, y);
            const path = linePath(unit, to);
            if (!path.length || corpseAt(state, x, y) || isMountainAt(state, x, y)
                || path.slice(0, -1).some((p) => isOccupied(state, p.x, p.y))
                || (target && target.side === unit.side)) {
                continue;
            }
            if (!target && path.length <= 3) {
                out.push({ actorId: unit.id, from: { x: unit.x, y: unit.y }, to, type: 'move', path });
            }
            if (target && path.length === 1 && !isWet(state, unit)) {
                out.push({ actorId: unit.id, from: { x: unit.x, y: unit.y }, to, type: 'charge', path });
            }
        }
    }
    return out;
}

/** 弓/枪当前方向射程（弓 min2 / 枪 min1；max = min + 已升级格数，升级上限 6） */
export function directionRange(unit: BattleUnit, d: number): { min: number; max: number } {
    const paid = unit.directionPaid[d] ?? 0;
    return unit.kind === 'archer' ? { min: 2, max: 2 + paid } : { min: 1, max: 1 + paid };
}

/** 弓/枪方向攻击：沿线收集贯穿目标（对齐原型 directionalAction） */
export function directionalAction(state: BattleState, unitId: string, d: number): UnitAction | undefined {
    const unit = state.units.find((v) => v.id === unitId);
    if (!unit || (unit.kind !== 'archer' && unit.kind !== 'spearman')) {
        return undefined;
    }
    if (unit.side === 'player' && unit.ap <= 0) {
        return undefined;
    }
    if (!Number.isInteger(d) || d < 0 || d > 3) {
        return undefined;
    }
    const vec = CONFIG.directions[d];
    const range = directionRange(unit, d);
    const targets: string[] = [];
    const rocks: GridPos[] = [];
    const path: GridPos[] = [];
    for (let i = 1; i <= range.max; i++) {
        const p = { x: unit.x + vec.x * i, y: unit.y + vec.y * i };
        if (!inside(p)) {
            break;
        }
        path.push({ ...p });
        if (corpseAt(state, p.x, p.y)) {
            break;
        }
        if (isMountainAt(state, p.x, p.y)) {
            if (i >= range.min) {
                rocks.push({ ...p });
            }
            break;
        }
        const t = unitAt(state, p.x, p.y);
        if (!t) {
            continue;
        }
        if (t.side === unit.side) {
            break;
        }
        if (unit.kind === 'archer' && i < range.min) {
            break; // 弓 1 格盲区
        }
        targets.push(t.id);
        if (unit.kind === 'archer') {
            break; // 弓首中即止；枪贯穿
        }
    }
    if (targets.length || rocks.length) {
        return {
            actorId: unit.id,
            from: { x: unit.x, y: unit.y },
            to: { ...path[path.length - 1] },
            type: 'directional',
            direction: d,
            path,
            targets,
            mountains: rocks,
        };
    }
    return undefined;
}

/** 该单位当前是否还有行动能力（额度门控，对齐原型 legalActions 入口） */
export function unitHasAp(unit: BattleUnit): boolean {
    if (unit.side === 'player') {
        if (unit.kind === 'rook') {
            return unit.rookMoveAvailable || unit.rookChargeAvailable;
        }
        if (unit.kind === 'cannon') {
            return unit.cannonMoveAvailable || unit.cannonAttackAvailable;
        }
        return unit.ap > 0;
    }
    return true; // 敌方由意图阶段驱动，不做额度门控
}

/** 单位全部合法动作（对齐原型 legalActions；高亮即许可） */
export function legalActions(state: BattleState, unitId: string): UnitAction[] {
    const unit = state.units.find((v) => v.id === unitId);
    if (!unit || !unitHasAp(unit)) {
        return [];
    }
    if (unit.side === 'enemy' && unit.kind === 'rook') {
        return enemyRookActions(state, unit);
    }
    const out: UnitAction[] = [];
    for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
            const to = { x, y };
            if (unit.kind === 'rook' && unit.side === 'player') {
                const base = rookBaseAction(state, unit, to);
                const skill = unit.rookRole === 'charge'
                    ? rookChargeAction(state, unit, to)
                    : unit.rookRole === 'pull'
                        ? rookPullAction(state, unit, to)
                        : undefined;
                if (base) {
                    out.push(base);
                }
                if (skill) {
                    out.push(skill);
                }
            } else {
                const a = ordinaryAction(state, unit, to);
                // 炮双额度：移动/攻击分别受 cannonMoveAvailable/cannonAttackAvailable 门控
                if (a && !(unit.kind === 'cannon' && unit.side === 'player'
                    && (a.type === 'move' ? !unit.cannonMoveAvailable : !unit.cannonAttackAvailable))) {
                    out.push(a);
                }
            }
        }
    }
    if (unit.side === 'player' && (unit.kind === 'archer' || unit.kind === 'spearman')) {
        for (let d = 0; d < 4; d++) {
            const q = directionalAction(state, unitId, d);
            if (q) {
                out.push(q);
            }
        }
    }
    return out;
}

/** 单点查询动作（点击执行入口；对齐原型 actionAt） */
export function actionAt(state: BattleState, unit: BattleUnit, to: GridPos, mode?: string): UnitAction | undefined {
    if (!unit || (unit.side === 'player' && unit.kind !== 'rook' && unit.kind !== 'cannon' && unit.ap <= 0)) {
        return undefined;
    }
    if (unit.kind === 'rook') {
        if (unit.side === 'enemy') {
            return enemyRookActions(state, unit).find((a) => samePos(a.to, to) && (!mode || a.type === mode));
        }
        if (unit.rookRole === 'base') {
            return rookBaseAction(state, unit, to);
        }
        if (mode === 'charge') {
            return rookChargeAction(state, unit, to);
        }
        if (mode === 'pull') {
            return rookPullAction(state, unit, to);
        }
        return rookBaseAction(state, unit, to);
    }
    const a = ordinaryAction(state, unit, to);
    if (a && unit.side === 'player' && unit.kind === 'cannon'
        && (a.type === 'move' ? !unit.cannonMoveAvailable : !unit.cannonAttackAvailable)) {
        return undefined;
    }
    return a;
}

/** 敌方攻击动作全集（对齐原型 enemyAttacks：legalActions + directional 补充后过滤攻击类） */
export function enemyAttacks(state: BattleState, unit: BattleUnit): UnitAction[] {
    const out = legalActions(state, unit.id);
    if (unit.kind === 'archer' || unit.kind === 'spearman') {
        for (let d = 0; d < 4; d++) {
            const a = directionalAction(state, unit.id, d);
            if (a) {
                out.push(a);
            }
        }
    }
    return out.filter((a) =>
        ((a.type === 'attack' || a.type === 'charge' || a.type === 'directional') && !!unitAt(state, a.to.x, a.to.y))
        || (a.type === 'directional' && !!a.targets?.length));
}

/** 敌方移动动作全集（对齐原型 enemyMoves） */
export function enemyMoves(state: BattleState, unit: BattleUnit): UnitAction[] {
    return legalActions(state, unit.id).filter((a) => a.type === 'move');
}
