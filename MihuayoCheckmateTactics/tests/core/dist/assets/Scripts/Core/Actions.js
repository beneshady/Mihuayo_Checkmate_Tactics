"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPawnish = isPawnish;
exports.ordinaryAction = ordinaryAction;
exports.rookBaseAction = rookBaseAction;
exports.rookChargeAction = rookChargeAction;
exports.rookPullAction = rookPullAction;
exports.directionRange = directionRange;
exports.directionalAction = directionalAction;
exports.unitHasAp = unitHasAp;
exports.legalActions = legalActions;
exports.actionAt = actionAt;
exports.enemyAttacks = enemyAttacks;
exports.enemyMoves = enemyMoves;
const Config_1 = require("./Config");
const Terrain_1 = require("./Terrain");
/** 兵/弓/枪（pawnish：直线走法框架共用） */
function isPawnish(kind) {
    return kind === 'pawn' || kind === 'archer' || kind === 'spearman';
}
/** 兵方向限制：前进 1 格；过河（我方 y≥5 / 敌方 y≤3）后可横走（对齐原型 pawnMove） */
function pawnMoveOk(unit, dx, dy) {
    const forward = unit.side === 'player' ? 1 : -1;
    const crossed = unit.side === 'player' ? unit.y >= 5 : unit.y <= 3;
    return (dx === 0 && Math.sign(dy) === forward) || (crossed && dy === 0 && dx !== 0);
}
/** 帅/士的宫内斜线（中心↔角） */
function palaceDiag(side, a, b) {
    const q = side === 'player' ? Config_1.CONFIG.playerPalace : Config_1.CONFIG.enemyPalace;
    return Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 1
        && ((a.x === q.cx && a.y === q.cy) || (b.x === q.cx && b.y === q.cy));
}
/** 从格 to 反推普通动作；语义对齐原型 ordinary（attackOnly 仅供意图重验使用） */
function ordinaryAction(state, unit, to, attackOnly = false) {
    if (!(0, Config_1.inside)(to) || (0, Terrain_1.samePos)(unit, to) || (0, Terrain_1.corpseAt)(state, to.x, to.y)) {
        return undefined;
    }
    const target = (0, Terrain_1.unitAt)(state, to.x, to.y);
    const rock = (0, Terrain_1.isMountainAt)(state, to.x, to.y);
    if ((target && target.side === unit.side) || ((0, Terrain_1.isWet)(state, unit) && (target || rock))) {
        return undefined;
    }
    const dx = to.x - unit.x;
    const dy = to.y - unit.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const limit = 1 + unit.commanderMove;
    let ok = false;
    let path = [{ ...to }];
    if (unit.kind === 'king') {
        ok = (0, Config_1.inPalace)(unit.side, unit) && (0, Config_1.inPalace)(unit.side, to) && (ax + ay === 1 || palaceDiag(unit.side, unit, to));
    }
    else if (unit.kind === 'advisor') {
        ok = (0, Config_1.inPalace)(unit.side, unit) && (0, Config_1.inPalace)(unit.side, to) && palaceDiag(unit.side, unit, to);
    }
    else if (isPawnish(unit.kind)) {
        path = (0, Terrain_1.linePath)(unit, to);
        const dist = Math.max(ax, ay);
        // 兵：移动与贴身攻击共用；弓/枪：ordinary 仅移动（远程攻击走 directional），不能选敌/山
        ok = (unit.kind === 'pawn' || (!target && !rock))
            && pawnMoveOk(unit, dx, dy)
            && dist <= limit
            && (!(target || rock) || dist === 1)
            && !path.slice(0, -1).some((p) => (0, Terrain_1.isOccupied)(state, p.x, p.y));
    }
    else if (unit.kind === 'horse') {
        const leg = {
            x: unit.x + (ax === 2 ? Math.sign(dx) : 0),
            y: unit.y + (ay === 2 ? Math.sign(dy) : 0),
        };
        ok = ax * ay === 2 && !(0, Terrain_1.isOccupied)(state, leg.x, leg.y);
    }
    else if (unit.kind === 'cannon' && (dx === 0 || dy === 0)) {
        path = (0, Terrain_1.linePath)(unit, to);
        const screens = path.slice(0, -1).filter((p) => (0, Terrain_1.isOccupied)(state, p.x, p.y)).length;
        // 移动：途中 0 占位且 ≤3 格；攻击（敌子或山）：恰好 1 炮架
        ok = target || rock ? screens === 1 : screens === 0 && path.length <= 3 + unit.commanderMove;
    }
    else {
        return undefined;
    }
    if (!ok) {
        return undefined;
    }
    const isAttack = !!(target || rock);
    if (attackOnly || isAttack || (0, Terrain_1.isSafePath)(state, unit.kind, path)) {
        return { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: isAttack ? 'attack' : 'move', path };
    }
    return undefined;
}
/** 基础/冲锋/牵引车的普通移动与基础车直线合一攻击（对齐原型 rookBase） */
function rookBaseAction(state, unit, to) {
    if (!(0, Config_1.inside)(to) || (0, Terrain_1.samePos)(unit, to) || (unit.x !== to.x && unit.y !== to.y) || (0, Terrain_1.corpseAt)(state, to.x, to.y) || !unit.rookMoveAvailable) {
        return undefined;
    }
    const target = (0, Terrain_1.unitAt)(state, to.x, to.y);
    const rock = (0, Terrain_1.isMountainAt)(state, to.x, to.y);
    if ((target && target.side === unit.side) || ((target || rock) && unit.rookRole !== 'base') || ((0, Terrain_1.isWet)(state, unit) && (target || rock))) {
        return undefined;
    }
    const path = (0, Terrain_1.linePath)(unit, to);
    const limit = unit.rookMoveRange + (unit.commanderMove && !target && !rock ? 1 : 0);
    if (path.length > limit || path.slice(0, -1).some((p) => (0, Terrain_1.isOccupied)(state, p.x, p.y))) {
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
function rookChargeAction(state, unit, to) {
    if (!(0, Config_1.inside)(to) || (0, Terrain_1.samePos)(unit, to) || (unit.x !== to.x && unit.y !== to.y) || !unit.rookChargeAvailable || (0, Terrain_1.isWet)(state, unit)) {
        return undefined;
    }
    const target = (0, Terrain_1.unitAt)(state, to.x, to.y);
    const body = (0, Terrain_1.corpseAt)(state, to.x, to.y);
    if (target && target.side === unit.side) {
        return undefined;
    }
    const path = (0, Terrain_1.linePath)(unit, to);
    if (path.length > unit.rookChargeRange || path.slice(0, -1).some((p) => (0, Terrain_1.isOccupied)(state, p.x, p.y))) {
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
function rookPullAction(state, unit, to) {
    if (!(0, Config_1.inside)(to) || (0, Terrain_1.samePos)(unit, to) || (unit.x !== to.x && unit.y !== to.y) || !unit.rookChargeAvailable || (0, Terrain_1.isWet)(state, unit)) {
        return undefined;
    }
    // 牵引目标可为活单位或尸体（尸体仅可拉移，不可贴身强拉）
    const live = (0, Terrain_1.unitAt)(state, to.x, to.y);
    const body = live ? undefined : (0, Terrain_1.corpseAt)(state, to.x, to.y);
    if (!live && !body) {
        return undefined;
    }
    if (live && live.kind === 'advisor') {
        return undefined; // 固定装置（我方固定仕）不可被牵引
    }
    const path = (0, Terrain_1.linePath)(unit, to);
    if (path.length > unit.rookPullRange || path.slice(0, -1).some((p) => (0, Terrain_1.isOccupied)(state, p.x, p.y))) {
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
    if (!(0, Config_1.inside)(next) || (0, Terrain_1.isOccupied)(state, next.x, next.y)) {
        return undefined;
    }
    if (live && (live.kind === 'king' || live.kind === 'advisor') && !(0, Config_1.inPalace)(live.side, next)) {
        return undefined;
    }
    return { actorId: unit.id, from: { x: unit.x, y: unit.y }, to: { ...to }, type: 'pull', path, targetTo: next };
}
/** 敌方车：移动 ≤3 格或贴身冲锋（对齐原型 enemyRookActions） */
function enemyRookActions(state, unit) {
    const out = [];
    for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
            const to = { x, y };
            const target = (0, Terrain_1.unitAt)(state, x, y);
            const path = (0, Terrain_1.linePath)(unit, to);
            if (!path.length || (0, Terrain_1.corpseAt)(state, x, y) || (0, Terrain_1.isMountainAt)(state, x, y)
                || path.slice(0, -1).some((p) => (0, Terrain_1.isOccupied)(state, p.x, p.y))
                || (target && target.side === unit.side)) {
                continue;
            }
            if (!target && path.length <= 3) {
                out.push({ actorId: unit.id, from: { x: unit.x, y: unit.y }, to, type: 'move', path });
            }
            if (target && path.length === 1 && !(0, Terrain_1.isWet)(state, unit)) {
                out.push({ actorId: unit.id, from: { x: unit.x, y: unit.y }, to, type: 'charge', path });
            }
        }
    }
    return out;
}
/** 弓/枪当前方向射程（弓 min2 / 枪 min1；max = min + 已升级格数，升级上限 6） */
function directionRange(unit, d) {
    const paid = unit.directionPaid[d] ?? 0;
    return unit.kind === 'archer' ? { min: 2, max: 2 + paid } : { min: 1, max: 1 + paid };
}
/** 弓/枪方向攻击：沿线收集贯穿目标（对齐原型 directionalAction） */
function directionalAction(state, unitId, d) {
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
    const vec = Config_1.CONFIG.directions[d];
    const range = directionRange(unit, d);
    const targets = [];
    const rocks = [];
    const path = [];
    for (let i = 1; i <= range.max; i++) {
        const p = { x: unit.x + vec.x * i, y: unit.y + vec.y * i };
        if (!(0, Config_1.inside)(p)) {
            break;
        }
        path.push({ ...p });
        if ((0, Terrain_1.corpseAt)(state, p.x, p.y)) {
            break;
        }
        if ((0, Terrain_1.isMountainAt)(state, p.x, p.y)) {
            if (i >= range.min) {
                rocks.push({ ...p });
            }
            break;
        }
        const t = (0, Terrain_1.unitAt)(state, p.x, p.y);
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
function unitHasAp(unit) {
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
function legalActions(state, unitId) {
    const unit = state.units.find((v) => v.id === unitId);
    if (!unit || !unitHasAp(unit)) {
        return [];
    }
    if (unit.side === 'enemy' && unit.kind === 'rook') {
        return enemyRookActions(state, unit);
    }
    const out = [];
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
            }
            else {
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
function actionAt(state, unit, to, mode) {
    if (!unit || (unit.side === 'player' && unit.kind !== 'rook' && unit.kind !== 'cannon' && unit.ap <= 0)) {
        return undefined;
    }
    if (unit.kind === 'rook') {
        if (unit.side === 'enemy') {
            return enemyRookActions(state, unit).find((a) => (0, Terrain_1.samePos)(a.to, to) && (!mode || a.type === mode));
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
function enemyAttacks(state, unit) {
    const out = legalActions(state, unit.id);
    if (unit.kind === 'archer' || unit.kind === 'spearman') {
        for (let d = 0; d < 4; d++) {
            const a = directionalAction(state, unit.id, d);
            if (a) {
                out.push(a);
            }
        }
    }
    return out.filter((a) => ((a.type === 'attack' || a.type === 'charge' || a.type === 'directional') && !!(0, Terrain_1.unitAt)(state, a.to.x, a.to.y))
        || (a.type === 'directional' && !!a.targets?.length));
}
/** 敌方移动动作全集（对齐原型 enemyMoves） */
function enemyMoves(state, unit) {
    return legalActions(state, unit.id).filter((a) => a.type === 'move');
}
