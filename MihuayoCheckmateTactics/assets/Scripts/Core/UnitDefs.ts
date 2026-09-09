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
    /** 攻击力（伤害 = attack）；必填，缺失即 parse 报错 */
    attack: number;
    /** 最大体力；每回合开始回满（resetTurn），移动/攻击消耗 moveCost/attackCost */
    maxStamina: number;
    /** 移动一次消耗的体力（缺省 1） */
    moveCost?: number;
    /** 攻击一次消耗的体力（缺省 1） */
    attackCost?: number;
    /** 能否进入水面地形（缺省可）；false 时不可进入、也不可攻击水中目标（象） */
    waterPassable?: boolean;
    /** 只能在此地形 id 上移动（缺省不限；士/帅 = 'road' 地宫） */
    onlyOnTerrain?: string;
    moveSpecs: MoveSpec[];
    /** 攻击走法（缺省回退 moveSpecs，即"打=走"，如马/兵）；车/炮/士与移动不同源时显式给出 */
    attackSpecs?: MoveSpec[];
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

function requireDir(value: unknown, path: string): MoveDir {
    const dir = requireObject(value, path);
    return { dx: requireNumber(dir.dx, `${path}.dx`), dy: requireNumber(dir.dy, `${path}.dy`) };
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new BattleParseError(path, '应为布尔值（boolean）');
    return value;
}

/** 解析一条走法数组（moveSpecs / attackSpecs 共用） */
function parseMoveSpecArray(value: unknown, path: string): MoveSpec[] {
    const movesRaw = requireArray(value, path);
    return movesRaw.map((move, j) => {
        const spec = requireObject(move, `${path}[${j}]`);
        const type = requireString(spec.type, `${path}[${j}].type`) as MoveType;
        if (type !== 'step' && type !== 'slide' && type !== 'jump') {
            throw new BattleParseError(`${path}[${j}].type`, `未知走法类型 "${type}"`);
        }
        const passage = requireString(spec.passage, `${path}[${j}].passage`) as Passage;
        if (passage !== 'solid' && passage !== 'screen' && passage !== 'leg' && passage !== 'fly') {
            throw new BattleParseError(`${path}[${j}].passage`, `未知通过规则 "${passage}"`);
        }
        const result: MoveSpec = {
            type,
            dir: requireDir(spec.dir, `${path}[${j}].dir`),
            passage,
        };
        if (passage === 'screen') result.screen = requireNumber(spec.screen, `${path}[${j}].screen`);
        if (passage === 'leg') result.leg = requireDir(spec.leg, `${path}[${j}].leg`);
        return result;
    });
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

        const def: UnitDef = {
            id,
            maxHp: requireNumber(unit.maxHp, `$.units[${index}].maxHp`),
            attack: requireNumber(unit.attack, `$.units[${index}].attack`),
            maxStamina: requireNumber(unit.maxStamina, `$.units[${index}].maxStamina`),
            moveSpecs: parseMoveSpecArray(unit.moveSpecs, `$.units[${index}].moveSpecs`),
        };
        if (unit.name !== undefined) def.name = requireString(unit.name, `$.units[${index}].name`);
        if (unit.mp !== undefined) def.mp = requireNumber(unit.mp, `$.units[${index}].mp`);
        if (unit.moveCost !== undefined) def.moveCost = requireNumber(unit.moveCost, `$.units[${index}].moveCost`);
        if (unit.attackCost !== undefined) def.attackCost = requireNumber(unit.attackCost, `$.units[${index}].attackCost`);
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
export function getUnitDef(defs: UnitDef[], id: string): UnitDef | undefined {
    return defs.find((def) => def.id === id);
}
