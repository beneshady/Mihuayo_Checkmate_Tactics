"use strict";
/**
 * 战役常量（对齐原型 rules.js 的 R.CONFIG，移植方案 P0）。
 * 坐标 0 基：y=0 我方底线，y=8 敌方底线，y=4 河道。
 * 纯 TS，零引擎依赖；不 import 其他 Core 模块（避免循环依赖，
 * 本地结构类型与 BattleState 的 GridPos/Side 结构兼容）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
exports.inside = inside;
exports.palaceOf = palaceOf;
exports.inPalace = inPalace;
exports.nextRandom = nextRandom;
exports.CONFIG = {
    width: 9,
    height: 9,
    /** 河道 y 坐标 */
    river: 4,
    /** 三座永久桥（按陆地处理） */
    bridges: [
        { x: 1, y: 4 },
        { x: 4, y: 4 },
        { x: 7, y: 4 },
    ],
    playerPalace: { minX: 3, maxX: 5, minY: 0, maxY: 2, cx: 4, cy: 1 },
    enemyPalace: { minX: 3, maxX: 5, minY: 6, maxY: 8, cx: 4, cy: 7 },
    /** 固定出生位 */
    spawns: {
        king: { x: 4, y: 0 },
        advisor: { x: 4, y: 1 },
    },
    /** 第一波敌阵（kind, x, y）——US-012 关卡布局基线 */
    waveOne: [
        ['pawn', 1, 5],
        ['pawn', 4, 5],
        ['pawn', 7, 5],
        ['rook', 8, 7],
        ['cannon', 1, 7],
        ['advisor', 3, 8],
        ['advisor', 5, 8],
        ['king', 4, 8],
    ],
    /** 第二波敌阵（固定、可预告；P6 使用） */
    waveTwo: [
        ['pawn', 2, 5],
        ['pawn', 5, 5],
        ['pawn', 8, 5],
        ['rook', 1, 7],
        ['cannon', 7, 7],
        ['horse', 4, 6],
    ],
    /** 四向（兵/弓/枪/炮方向序；与 directionPaid 索引对应） */
    directions: [
        { x: 0, y: 1, name: '前' },
        { x: 1, y: 0, name: '右' },
        { x: 0, y: -1, name: '后' },
        { x: -1, y: 0, name: '左' },
    ],
    /** 炮溅射八向（cannonMask 位序 0..7；P3） */
    splash: [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 1, y: -1 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
        { x: -1, y: 0 },
        { x: -1, y: 1 },
    ],
    /** 回合上限（第 11 回合敌方结算后终局） */
    maxRounds: 11,
    /** 商店价格（P2；兵 3，车/马/炮 5） */
    price: { pawn: 3, rook: 5, horse: 5, cannon: 5 },
    /** 击杀金币（普通 1，敌将 5） */
    killGold: { normal: 1, king: 5 },
};
/** 坐标在界内 */
function inside(p) {
    return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < exports.CONFIG.width && p.y >= 0 && p.y < exports.CONFIG.height;
}
function palaceOf(side) {
    return side === 'player' ? exports.CONFIG.playerPalace : exports.CONFIG.enemyPalace;
}
/** 点是否在 side 的九宫内 */
function inPalace(side, p) {
    const q = palaceOf(side);
    return p.x >= q.minX && p.x <= q.maxX && p.y >= q.minY && p.y <= q.maxY;
}
/** 原型 LCG 随机源（与 rules.js 的 random 完全一致，保证对拍可重放） */
function nextRandom(state) {
    state.rng = (((state.rng === undefined ? 0x12345678 : state.rng) * 1664525 + 1013904223) >>> 0);
    return state.rng / 4294967296;
}
