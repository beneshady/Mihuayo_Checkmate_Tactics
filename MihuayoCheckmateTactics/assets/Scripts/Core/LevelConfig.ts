import { BattleParseError } from './BattleState';

/**
 * 关卡列表配置（纯 TS，零引擎依赖）。
 * 数据来自 assets/resources/Levels/level-list.json；约定每个关卡的战局文件为
 * resources/Levels/<id>.json（可用 file 字段覆盖）。解锁进度不在这里——那属于玩家存档。
 * 参见 docs/design/main-menu-plan.md §5。
 */

/** 关卡列表条目 */
export interface LevelEntry {
    /** 唯一键；同时约定关联 resources/Levels/<id>.json */
    id: string;
    name: string;
    /** 首次通关奖励金币 */
    rewardGold: number;
    /** 战局文件名（可省略，默认用 id） */
    file?: string;
}

export interface LevelList {
    formatVersion: 1;
    levels: LevelEntry[];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
    if (!isObject(value)) throw new BattleParseError(path, '应为对象（object）');
    return value;
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new BattleParseError(path, '应为非空字符串');
    return value;
}

function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new BattleParseError(path, '应为数字');
    return value;
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) throw new BattleParseError(path, '应为数组（array）');
    return value;
}

/** 解析并校验关卡列表（formatVersion 1）；配置文件报错拒载（与存档的宽容策略相反） */
export function parseLevelList(raw: unknown): LevelList {
    const root = requireObject(raw, '$');
    const formatVersion = requireNumber(root.formatVersion, '$.formatVersion');
    if (formatVersion !== 1) {
        throw new BattleParseError('$.formatVersion', `不支持的格式版本 ${formatVersion}，当前仅支持 1`);
    }
    const levelsRaw = requireArray(root.levels, '$.levels');
    if (levelsRaw.length === 0) {
        throw new BattleParseError('$.levels', '至少需要登记一个关卡');
    }
    const seen = new Set<string>();
    const levels = levelsRaw.map((item, index): LevelEntry => {
        const obj = requireObject(item, `$.levels[${index}]`);
        const id = requireString(obj.id, `$.levels[${index}].id`);
        if (seen.has(id)) {
            throw new BattleParseError(`$.levels[${index}].id`, `重复的关卡 id "${id}"`);
        }
        seen.add(id);
        const entry: LevelEntry = {
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
export function getLevelEntry(levels: LevelEntry[], id: string): LevelEntry | undefined {
    return levels.find((entry) => entry.id === id);
}
