"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUnitDefs = parseUnitDefs;
exports.getUnitDef = getUnitDef;
const BattleState_1 = require("./BattleState");
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireObject(value, path) {
    if (!isObject(value))
        throw new BattleState_1.BattleParseError(path, '应为对象（object）');
    return value;
}
function requireString(value, path) {
    if (typeof value !== 'string' || value.length === 0)
        throw new BattleState_1.BattleParseError(path, '应为非空字符串');
    return value;
}
function requireNumber(value, path) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new BattleState_1.BattleParseError(path, '应为数字');
    return value;
}
function requireArray(value, path) {
    if (!Array.isArray(value))
        throw new BattleState_1.BattleParseError(path, '应为数组（array）');
    return value;
}
function requireDir(value, path) {
    const dir = requireObject(value, path);
    return { dx: requireNumber(dir.dx, `${path}.dx`), dy: requireNumber(dir.dy, `${path}.dy`) };
}
function requireBoolean(value, path) {
    if (typeof value !== 'boolean')
        throw new BattleState_1.BattleParseError(path, '应为布尔值（boolean）');
    return value;
}
/** 解析一条走法数组（moveSpecs / attackSpecs 共用） */
function parseMoveSpecArray(value, path) {
    const movesRaw = requireArray(value, path);
    return movesRaw.map((move, j) => {
        const spec = requireObject(move, `${path}[${j}]`);
        const type = requireString(spec.type, `${path}[${j}].type`);
        if (type !== 'step' && type !== 'slide' && type !== 'jump') {
            throw new BattleState_1.BattleParseError(`${path}[${j}].type`, `未知走法类型 "${type}"`);
        }
        const passage = requireString(spec.passage, `${path}[${j}].passage`);
        if (passage !== 'solid' && passage !== 'screen' && passage !== 'leg' && passage !== 'fly') {
            throw new BattleState_1.BattleParseError(`${path}[${j}].passage`, `未知通过规则 "${passage}"`);
        }
        const result = {
            type,
            dir: requireDir(spec.dir, `${path}[${j}].dir`),
            passage,
        };
        if (passage === 'screen')
            result.screen = requireNumber(spec.screen, `${path}[${j}].screen`);
        if (passage === 'leg')
            result.leg = requireDir(spec.leg, `${path}[${j}].leg`);
        return result;
    });
}
/**
 * 解析并校验棋子定义表（formatVersion 1）。
 * @throws BattleParseError 携带 JSON 路径的解析错误
 */
function parseUnitDefs(raw) {
    const root = requireObject(raw, '$');
    const formatVersion = requireNumber(root.formatVersion, '$.formatVersion');
    if (formatVersion !== 1) {
        throw new BattleState_1.BattleParseError('$.formatVersion', `不支持的格式版本 ${formatVersion}，当前仅支持 1`);
    }
    const unitsRaw = requireObject(root, '$').units;
    if (!Array.isArray(unitsRaw))
        throw new BattleState_1.BattleParseError('$.units', '应为数组（array）');
    const seen = new Set();
    return unitsRaw.map((item, index) => {
        const unit = requireObject(item, `$.units[${index}]`);
        const id = requireString(unit.id, `$.units[${index}].id`);
        if (seen.has(id))
            throw new BattleState_1.BattleParseError(`$.units[${index}].id`, `重复的棋子类型 id "${id}"`);
        seen.add(id);
        const def = {
            id,
            maxHp: requireNumber(unit.maxHp, `$.units[${index}].maxHp`),
            attack: requireNumber(unit.attack, `$.units[${index}].attack`),
            maxStamina: requireNumber(unit.maxStamina, `$.units[${index}].maxStamina`),
            moveSpecs: parseMoveSpecArray(unit.moveSpecs, `$.units[${index}].moveSpecs`),
        };
        if (unit.name !== undefined)
            def.name = requireString(unit.name, `$.units[${index}].name`);
        if (unit.mp !== undefined)
            def.mp = requireNumber(unit.mp, `$.units[${index}].mp`);
        if (unit.moveCost !== undefined)
            def.moveCost = requireNumber(unit.moveCost, `$.units[${index}].moveCost`);
        if (unit.attackCost !== undefined)
            def.attackCost = requireNumber(unit.attackCost, `$.units[${index}].attackCost`);
        if (unit.waterPassable !== undefined) {
            def.waterPassable = requireBoolean(unit.waterPassable, `$.units[${index}].waterPassable`);
        }
        if (unit.onlyOnTerrain !== undefined) {
            def.onlyOnTerrain = requireString(unit.onlyOnTerrain, `$.units[${index}].onlyOnTerrain`);
        }
        if (unit.attackSpecs !== undefined) {
            def.attackSpecs = parseMoveSpecArray(unit.attackSpecs, `$.units[${index}].attackSpecs`);
        }
        return def;
    });
}
/** 按 id 查棋子类型定义 */
function getUnitDef(defs, id) {
    return defs.find((def) => def.id === id);
}
