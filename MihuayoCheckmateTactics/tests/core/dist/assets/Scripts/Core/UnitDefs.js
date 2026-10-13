"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KIND_DEFS = void 0;
exports.getKindDef = getKindDef;
exports.kindName = kindName;
exports.maxHpOf = maxHpOf;
exports.archerRange = archerRange;
exports.makeUnit = makeUnit;
const Config_1 = require("./Config");
exports.KIND_DEFS = {
    king: { kind: 'king', name: '帅', hp: 3, enemyHp: 5, attack: 1 },
    rook: { kind: 'rook', name: '车', hp: 2, attack: 1, price: Config_1.CONFIG.price.rook, rookMoveRange: 4 },
    horse: { kind: 'horse', name: '马', hp: 1, attack: 1, price: Config_1.CONFIG.price.horse },
    cannon: { kind: 'cannon', name: '炮', hp: 2, attack: 2, price: Config_1.CONFIG.price.cannon, cannonMoveRange: 3 },
    pawn: { kind: 'pawn', name: '兵', hp: 1, attack: 1, price: Config_1.CONFIG.price.pawn },
    archer: { kind: 'archer', name: '弓', hp: 1, attack: 2, archerBaseRange: 2 },
    spearman: { kind: 'spearman', name: '枪', hp: 2, attack: 1, spearmanRange: 7 },
    advisor: { kind: 'advisor', name: '士', hp: 1, attack: 1 },
};
function getKindDef(kind) {
    return exports.KIND_DEFS[kind];
}
/** 兵种显示名 */
function kindName(kind) {
    return exports.KIND_DEFS[kind].name;
}
/** 按阵营取 maxHp（对齐原型 maxHp(kind, side)：帅我方 3 / 敌 5） */
function maxHpOf(kind, side) {
    const def = exports.KIND_DEFS[kind];
    return side === 'enemy' && def.enemyHp !== undefined ? def.enemyHp : def.hp;
}
/** 弓当前某方向射程 = 基础 2 + 该方向已升级格数（P3 前 directionPaid 恒 0） */
function archerRange(unit, direction) {
    return (exports.KIND_DEFS.archer.archerBaseRange ?? 2) + (unit.directionPaid[direction] ?? 0);
}
/**
 * 生成运行时棋子（对齐原型 unit()：地图输入只含 id/side/kind/x/y/rookRole，
 * 其余字段按兵种与阵营初始化）。
 */
function makeUnit(id, side, kind, x, y, rookRole = 'base') {
    const def = exports.KIND_DEFS[kind];
    const hp = maxHpOf(kind, side);
    const player = side === 'player';
    const rook = kind === 'rook';
    return {
        id,
        side,
        kind,
        x,
        y,
        hp,
        maxHp: hp,
        attack: def.attack,
        level: 1,
        kills: 0,
        sp: 0,
        // 敌方无行动额度（敌方回合由意图驱动）；车炮双额度字段仅我方启用
        ap: player ? 1 : 0,
        apLimit: player ? 1 : 0,
        combo: 0,
        fortify: 0,
        directionPaid: [0, 0, 0, 0],
        cannonMask: 0,
        cannonMoveAvailable: player && kind === 'cannon',
        cannonAttackAvailable: player && kind === 'cannon',
        rookRole,
        rookMoveRange: def.rookMoveRange ?? 4,
        rookChargeRange: 1,
        rookPullRange: 3,
        rookPush: false,
        rookMoveAvailable: player && rook,
        rookChargeAvailable: player && rook && rookRole !== 'base',
        commanderHealth: 0,
        commanderMove: 0,
        acted: false,
    };
}
