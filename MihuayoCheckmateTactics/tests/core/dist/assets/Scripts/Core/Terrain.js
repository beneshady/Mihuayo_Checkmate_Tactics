"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWaterAt = isWaterAt;
exports.isBridgeAt = isBridgeAt;
exports.isMountainAt = isMountainAt;
exports.isFatalWaterKind = isFatalWaterKind;
exports.isWet = isWet;
exports.unitAt = unitAt;
exports.corpseAt = corpseAt;
exports.isOccupied = isOccupied;
exports.samePos = samePos;
exports.linePath = linePath;
exports.isSafePath = isSafePath;
exports.rockHit = rockHit;
exports.leaveCorpse = leaveCorpse;
exports.drownCheck = drownCheck;
exports.insideState = insideState;
const BattleState_1 = require("./BattleState");
const Config_1 = require("./Config");
/**
 * 地形与占位规则（v2，对齐原型 rules.js 语义；纯 TS，零引擎依赖）。
 *
 * 地形语义（v2.3）：
 * - land / bridge：等价陆地（桥按陆地处理）；
 * - water：兵/弓/枪/炮「途经即死」（fatalWater）；马/车可停留水中但禁攻击（wet）；
 *   水中活子仍占格、可作炮架；死亡入水不留尸；
 * - mountain / cracked：阻挡站/走/马腿；可作炮架；可作普通攻击目标（计 1 命中，
 *   mountain→cracked→land）；山可承受碰撞但不传递；
 * - forest：可站立、不阻挡走法与弹道；受普通攻击 30% 闪避（随机源见 Config.nextRandom）。
 *
 * 占位：活单位 / 尸体 / 山。格上三者互斥。
 */
/** 兵系（含弓/枪）+ 炮 + 帅/士：途经水格即死 */
const FATAL_WATER_KINDS = new Set(['pawn', 'archer', 'spearman', 'cannon', 'king', 'advisor']);
function isWaterAt(state, x, y) {
    return (0, BattleState_1.terrainAt)(state.map, x, y) === 'water';
}
function isBridgeAt(state, x, y) {
    return (0, BattleState_1.terrainAt)(state.map, x, y) === 'bridge';
}
/** 山（mountain 或 cracked）：阻挡站/走/马腿/弹道，可作炮架与攻击目标 */
function isMountainAt(state, x, y) {
    const t = (0, BattleState_1.terrainAt)(state.map, x, y);
    return t === 'mountain' || t === 'cracked';
}
/** 该棋种是否「途经水即死」（fatalWater） */
function isFatalWaterKind(kind) {
    return FATAL_WATER_KINDS.has(kind);
}
/** 车/马停在水中：禁攻击（wet） */
function isWet(state, unit) {
    return isWaterAt(state, unit.x, unit.y) && (unit.kind === 'rook' || unit.kind === 'horse');
}
/** 该格是否有活单位 */
function unitAt(state, x, y) {
    return state.units.find((u) => u.x === x && u.y === y);
}
/** 该格是否有尸体 */
function corpseAt(state, x, y) {
    return (state.corpses ?? []).find((c) => c.x === x && c.y === y);
}
/** 占位 = 活单位 / 尸体 / 山（对齐原型 occupied） */
function isOccupied(state, x, y) {
    return !!unitAt(state, x, y) || !!corpseAt(state, x, y) || isMountainAt(state, x, y);
}
/** 同格点 */
function samePos(a, b) {
    return a.x === b.x && a.y === b.y;
}
/** 直线路径（a→b 同行或同列；含端点不含起点；不同线返回空） */
function linePath(a, b) {
    if (a.x !== b.x && a.y !== b.y) {
        return [];
    }
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    const out = [];
    if (!dx && !dy) {
        return out;
    }
    for (let x = a.x + dx, y = a.y + dy;; x += dx, y += dy) {
        out.push({ x, y });
        if (x === b.x && y === b.y) {
            break;
        }
    }
    return out;
}
/** 移动路径是否安全：兵系/炮不得途经水格（对齐原型 safePath） */
function isSafePath(state, kind, path) {
    if (!isFatalWaterKind(kind)) {
        return true;
    }
    return !path.some((p) => isWaterAt(state, p.x, p.y));
}
/**
 * 山受一次有效命中：mountain→cracked→land（对齐原型 rockHit；
 * effect.mountains 去重同一次结算内重复命中）。
 * hits：本次结算的命中记录（供表现层展示），可传 null 表示只改地形。
 */
function rockHit(state, p, effect) {
    if (!isMountainAt(state, p.x, p.y)) {
        return;
    }
    const before = (0, BattleState_1.terrainAt)(state.map, p.x, p.y);
    const after = before === 'mountain' ? 'cracked' : 'land';
    state.map.tiles[`${p.x},${p.y}`] = after;
    if (effect) {
        effect.mountains = effect.mountains ?? [];
        if (!effect.mountains.some((q) => q.x === p.x && q.y === p.y)) {
            effect.mountains.push({ x: p.x, y: p.y });
        }
    }
}
/** 单位死亡留尸：我方 commanderTarget 阵亡且不在水中 → 陆地留尸（对齐原型 leaveCorpse） */
function leaveCorpse(state, unit) {
    const isCommanderTarget = unit.side === 'player' && unit.kind !== 'king' && unit.kind !== 'advisor';
    if (!isCommanderTarget || isWaterAt(state, unit.x, unit.y)) {
        return;
    }
    const body = { ...unit, hp: 0 };
    state.corpses = state.corpses ?? [];
    state.corpses.push({ id: `corpse-${unit.id}`, x: unit.x, y: unit.y, unit: body });
}
/** 立即淹死判定：兵系/炮处于水中 → hp=0（对齐原型 drown；死亡处理走统一 removeDead） */
function drownCheck(state, unit, effect) {
    if (isWaterAt(state, unit.x, unit.y) && isFatalWaterKind(unit.kind)) {
        unit.hp = 0;
        effect.waterDeaths = effect.waterDeaths ?? [];
        effect.waterDeaths.push(unit.id);
    }
}
/** 界内且在界内格上（含边界检查的 thin wrapper） */
function insideState(x, y) {
    return (0, Config_1.inside)({ x, y });
}
