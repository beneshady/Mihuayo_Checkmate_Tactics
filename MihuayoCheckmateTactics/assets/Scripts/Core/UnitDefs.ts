import { BattleParseError } from './BattleState';

/**
 * 棋子类型定义（纯 TS，零引擎依赖）。
 * 定义数据来自 assets/Defs/unit-defs.json；移动引擎在 movement.ts。
 * 参见 docs/architecture/decisions/0001-gameplay-layering.md。
 */

/** 走法基础方向（相对逻辑格坐标，非屏幕方向） */
export interface MoveDir {
    dx: number;
    dy: number;
}

/** 走法类型：step=走一格；slide=沿方向直到被挡/边界；jump=跳到固定相对位置 */
export type MoveType = 'step' | 'slide' | 'jump';

/** 通过规则：solid=遇子即止可吃；screen=隔子（炮）；leg=别腿（马/象）；fly=无视阻挡 */
export type Passage = 'solid' | 'screen' | 'leg' | 'fly';

/** 一条走法 */
export interface MoveSpec {
    type: MoveType;
    dir: MoveDir;
    passage: Passage;
    /** passage='screen' 时：攻击需跨越的子数（炮=1）；移动时路径为 0 子 */
    screen?: number;
    /** passage='leg' 时：别腿位置（相对当前格） */
    leg?: MoveDir;
}

/** 一种棋子类型的定义 */
export interface UnitDef {
    /** 唯一键；战局 JSON 里 units[].defId 即引用此 id */
    id: string;
    name?: string;
    maxHp: number;
    mp?: number;
    /** 攻击力（近战伤害 = attack）；必填，缺失即 parse 报错 */
    attack: number;
    moveSpecs: MoveSpec[];
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

function requireDir(value: unknown, path: string): MoveDir {
    const dir = requireObject(value, path);
    return { dx: requireNumber(dir.dx, `${path}.dx`), dy: requireNumber(dir.dy, `${path}.dy`) };
}

/**
 * 解析并校验棋子定义表（formatVersion 1）。
 * @throws BattleParseError 携带 JSON 路径的解析错误
 */
export function parseUnitDefs(raw: unknown): UnitDef[] {
    const root = requireObject(raw, '$');
    const formatVersion = requireNumber(root.formatVersion, '$.formatVersion');
    if (formatVersion !== 1) {
        throw new BattleParseError('$.formatVersion', `不支持的格式版本 ${formatVersion}，当前仅支持 1`);
    }

    const unitsRaw = requireObject(root, '$').units;
    if (!Array.isArray(unitsRaw)) throw new BattleParseError('$.units', '应为数组（array）');

    const seen = new Set<string>();
    return unitsRaw.map((item, index) => {
        const unit = requireObject(item, `$.units[${index}]`);
        const id = requireString(unit.id, `$.units[${index}].id`);
        if (seen.has(id)) throw new BattleParseError(`$.units[${index}].id`, `重复的棋子类型 id "${id}"`);
        seen.add(id);

        const movesRaw = unit.moveSpecs;
        if (!Array.isArray(movesRaw)) throw new BattleParseError(`$.units[${index}].moveSpecs`, '应为数组（array）');
        const moveSpecs = movesRaw.map((move, j) => {
            const spec = requireObject(move, `$.units[${index}].moveSpecs[${j}]`);
            const type = requireString(spec.type, `$.units[${index}].moveSpecs[${j}].type`) as MoveType;
            if (type !== 'step' && type !== 'slide' && type !== 'jump') {
                throw new BattleParseError(`$.units[${index}].moveSpecs[${j}].type`, `未知走法类型 "${type}"`);
            }
            const passage = requireString(spec.passage, `$.units[${index}].moveSpecs[${j}].passage`) as Passage;
            if (passage !== 'solid' && passage !== 'screen' && passage !== 'leg' && passage !== 'fly') {
                throw new BattleParseError(`$.units[${index}].moveSpecs[${j}].passage`, `未知通过规则 "${passage}"`);
            }
            const result: MoveSpec = {
                type,
                dir: requireDir(spec.dir, `$.units[${index}].moveSpecs[${j}].dir`),
                passage,
            };
            if (passage === 'screen') result.screen = requireNumber(spec.screen, `$.units[${index}].moveSpecs[${j}].screen`);
            if (passage === 'leg') result.leg = requireDir(spec.leg, `$.units[${index}].moveSpecs[${j}].leg`);
            return result;
        });

        const def: UnitDef = {
            id,
            maxHp: requireNumber(unit.maxHp, `$.units[${index}].maxHp`),
            attack: requireNumber(unit.attack, `$.units[${index}].attack`),
            moveSpecs,
        };
        if (unit.name !== undefined) def.name = requireString(unit.name, `$.units[${index}].name`);
        if (unit.mp !== undefined) def.mp = requireNumber(unit.mp, `$.units[${index}].mp`);
        return def;
    });
}

/** 按 id 查棋子类型定义 */
export function getUnitDef(defs: UnitDef[], id: string): UnitDef | undefined {
    return defs.find((def) => def.id === id);
}
