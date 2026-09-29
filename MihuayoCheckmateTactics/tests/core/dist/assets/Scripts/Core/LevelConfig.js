"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLevelList = parseLevelList;
exports.getLevelEntry = getLevelEntry;
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
/** 解析并校验关卡列表（formatVersion 1）；配置文件报错拒载（与存档的宽容策略相反） */
function parseLevelList(raw) {
    const root = requireObject(raw, '$');
    const formatVersion = requireNumber(root.formatVersion, '$.formatVersion');
    if (formatVersion !== 1) {
        throw new BattleState_1.BattleParseError('$.formatVersion', `不支持的格式版本 ${formatVersion}，当前仅支持 1`);
    }
    const levelsRaw = requireArray(root.levels, '$.levels');
    if (levelsRaw.length === 0) {
        throw new BattleState_1.BattleParseError('$.levels', '至少需要登记一个关卡');
    }
    const seen = new Set();
    const levels = levelsRaw.map((item, index) => {
        const obj = requireObject(item, `$.levels[${index}]`);
        const id = requireString(obj.id, `$.levels[${index}].id`);
        if (seen.has(id)) {
            throw new BattleState_1.BattleParseError(`$.levels[${index}].id`, `重复的关卡 id "${id}"`);
        }
        seen.add(id);
        const entry = {
            id,
            name: requireString(obj.name, `$.levels[${index}].name`),
            rewardGold: requireNumber(obj.rewardGold, `$.levels[${index}].rewardGold`),
        };
        if (obj.file !== undefined) {
            entry.file = requireString(obj.file, `$.levels[${index}].file`);
        }
        return entry;
    });
    return { formatVersion: 1, levels };
}
/** 按 id 查关卡条目 */
function getLevelEntry(levels, id) {
    return levels.find((entry) => entry.id === id);
}
