"use strict";
/**
 * 战局数据（formatVersion 2）的纯数据结构与解析校验。
 * v2 = 原型 v2.3 数据模型对齐（移植方案 P0）：
 * - 地图为稀疏 tiles 字典（缺省 land），地形六类；
 * - 棋子以 kind + side 描述，运行时字段（ap/combo/rookRole 等）与原型 unit() 对齐；
 * - 回合恒在我方（预告回合制），turn 只保留 round/phase。
 *
 * 本文件是纯 TypeScript：MUST NOT import 任何 'cc' 或平台 API，
 * 便于脱离引擎独立审阅与验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattleParseError = exports.UNIT_KINDS = exports.TERRAIN_TYPES = void 0;
exports.terrainAt = terrainAt;
exports.setTerrainAt = setTerrainAt;
exports.parseBattleState = parseBattleState;
exports.validateMap = validateMap;
exports.gridToIso = gridToIso;
exports.isoToGrid = isoToGrid;
const Config_1 = require("./Config");
exports.TERRAIN_TYPES = ['land', 'water', 'bridge', 'mountain', 'cracked', 'forest'];
exports.UNIT_KINDS = ['king', 'rook', 'horse', 'cannon', 'pawn', 'archer', 'spearman', 'advisor'];
/** 解析错误：message 前缀携带出错字段的 JSON 路径，便于定位 */
class BattleParseError extends Error {
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.name = 'BattleParseError';
        this.path = path;
    }
}
exports.BattleParseError = BattleParseError;
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireObject(value, path) {
    if (!isObject(value)) {
        throw new BattleParseError(path, '应为对象（object）');
    }
    return value;
}
function requireNumber(value, path) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BattleParseError(path, '应为数字（number）');
    }
    return value;
}
function requireString(value, path) {
    if (typeof value !== 'string') {
        throw new BattleParseError(path, '应为字符串（string）');
    }
    return value;
}
function requireArray(value, path) {
    if (!Array.isArray(value)) {
        throw new BattleParseError(path, '应为数组（array）');
    }
    return value;
}
function terrainKey(x, y) {
    return `${x},${y}`;
}
/** 取某格地形；缺省 land（对齐原型 terrain()） */
function terrainAt(map, x, y) {
    return map.tiles[terrainKey(x, y)] ?? 'land';
}
/** 写入地形（山破坏 cracked→land 会改写 tiles） */
function setTerrainAt(map, x, y, type) {
    map.tiles[terrainKey(x, y)] = type;
}
/**
 * 解析并校验战局 JSON（formatVersion 2）。
 * 结构校验 + 兵种/地形合法性 + 双方各恰一帅；完整地图约束（九宫等）见 validateMap。
 * @throws BattleParseError 携带 JSON 路径的解析错误
 */
function parseBattleState(raw) {
    const root = requireObject(raw, '$');
    const formatVersion = requireNumber(root.formatVersion, '$.formatVersion');
    if (formatVersion !== 2) {
        throw new BattleParseError('$.formatVersion', `不支持的格式版本 ${formatVersion}，当前仅支持 2`);
    }
    const metaRaw = requireObject(root.meta, '$.meta');
    const kind = requireString(metaRaw.kind, '$.meta.kind');
    if (kind !== 'battleInit' && kind !== 'battleSave') {
        throw new BattleParseError('$.meta.kind', `应为 "battleInit" 或 "battleSave"，实际为 "${kind}"`);
    }
    requireString(metaRaw.battleId, '$.meta.battleId');
    const mapRaw = requireObject(root.map, '$.map');
    const tilesRaw = requireObject(mapRaw.tiles, '$.map.tiles');
    for (const [key, value] of Object.entries(tilesRaw)) {
        const path = `$.map.tiles["${key}"]`;
        if (!/^\d+,\d+$/.test(key)) {
            throw new BattleParseError(path, `地形键应为 "x,y"，实际为 "${key}"`);
        }
        const t = requireString(value, path);
        if (!exports.TERRAIN_TYPES.includes(t)) {
            throw new BattleParseError(path, `未知地形 "${t}"`);
        }
    }
    const unitsRaw = requireArray(root.units, '$.units');
    unitsRaw.forEach((item, index) => {
        const u = requireObject(item, `$.units[${index}]`);
        requireString(u.id, `$.units[${index}].id`);
        const side = requireString(u.side, `$.units[${index}].side`);
        if (side !== 'player' && side !== 'enemy') {
            throw new BattleParseError(`$.units[${index}].side`, `应为 "player" 或 "enemy"，实际为 "${side}"`);
        }
        const unitKind = requireString(u.kind, `$.units[${index}].kind`);
        if (!exports.UNIT_KINDS.includes(unitKind)) {
            throw new BattleParseError(`$.units[${index}].kind`, `未知棋种 "${unitKind}"`);
        }
        const ux = requireNumber(u.x, `$.units[${index}].x`);
        const uy = requireNumber(u.y, `$.units[${index}].y`);
        if (!Number.isInteger(ux) || !Number.isInteger(uy) || ux < 0 || ux >= 9 || uy < 0 || uy >= 9) {
            throw new BattleParseError(`$.units[${index}].x/y`, '坐标应为 9×9 界内整数');
        }
    });
    const turnRaw = requireObject(root.turn, '$.turn');
    requireNumber(turnRaw.round, '$.turn.round');
    requireString(turnRaw.phase, '$.turn.phase');
    return raw;
}
/**
 * 完整地图约束校验（照搬原型 maps.js validate 的战斗相关子集；P2 布阵复用 binding 子集）。
 * 返回错误列表（空 = 通过）：
 * - 双方各恰一枚帅；
 * - 棋子不越界、不重叠、不站山；
 * - 帅/士必须在己方九宫；
 * - 帅/士/兵/弓/枪/炮不得在致死水格出生。
 */
function validateMap(map, units) {
    const errors = [];
    const at = (x, y) => terrainAt(map, x, y);
    const isWater = (x, y) => at(x, y) === 'water';
    const isMountain = (x, y) => at(x, y) === 'mountain' || at(x, y) === 'cracked';
    const seen = new Set();
    for (const side of ['player', 'enemy']) {
        const kings = units.filter((u) => u.side === side && u.kind === 'king');
        if (kings.length !== 1) {
            errors.push(`${side === 'player' ? '我方帅' : '敌方将'}必须恰有一枚（现 ${kings.length}）`);
        }
    }
    const fatalWaterKinds = ['pawn', 'archer', 'spearman', 'cannon', 'king', 'advisor'];
    for (const u of units) {
        const label = `（${u.x + 1},${u.y + 1}）`;
        const key = `${u.x},${u.y}`;
        if (u.x < 0 || u.x >= 9 || u.y < 0 || u.y >= 9) {
            errors.push(`${label}棋子越界`);
            continue;
        }
        if (seen.has(key)) {
            errors.push(`${label}棋子重叠（${u.id}）`);
        }
        seen.add(key);
        if (isMountain(u.x, u.y)) {
            errors.push(`${label}棋子不能站山（${u.id}）`);
        }
        if (isWater(u.x, u.y) && fatalWaterKinds.includes(u.kind)) {
            errors.push(`${label}${u.kind}不能在致死水格出生（${u.id}）`);
        }
        if ((u.kind === 'king' || u.kind === 'advisor') && !(0, Config_1.inPalace)(u.side, { x: u.x, y: u.y })) {
            errors.push(`${label}将帅/士在己方九宫外（${u.id}）`);
        }
    }
    return errors;
}
/**
 * 逻辑格坐标 → 等距世界坐标。
 * Cocos +y 轴向上：深度（x+y）越大越靠近镜头，屏幕位置越靠下（y 越小）。
 * 逻辑网格仍是方形（x,y），等距只是视觉投影，两者解耦。
 */
function gridToIso(x, y, options) {
    return {
        isoX: (x - y) * options.halfTileW,
        isoY: -(x + y) * options.halfTileH + options.anchorOffsetY,
        depth: x + y,
    };
}
/**
 * 等距世界坐标 → 逻辑格坐标（gridToIso 的逆运算，供触摸拾取使用）。
 * 输入必须是地块所在容器的本地坐标；逻辑格出界返回 null。
 */
function isoToGrid(isoX, isoY, options, width, height) {
    const diff = isoX / options.halfTileW; // x − y
    const sum = (options.anchorOffsetY - isoY) / options.halfTileH; // x + y
    const x = Math.round((diff + sum) / 2);
    const y = Math.round((sum - diff) / 2);
    if (x < 0 || x >= width || y < 0 || y >= height) {
        return null;
    }
    return { x, y };
}
