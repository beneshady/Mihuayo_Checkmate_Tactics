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

import { inPalace } from './Config.ts';

/** 参战方（v2 直接使用原型 side 语义） */
export type Side = 'player' | 'enemy';

export interface GridPos {
    x: number;
    y: number;
}

export type BattleKind = 'battleInit' | 'battleSave';

export interface BattleMeta {
    kind: BattleKind;
    battleId: string;
    displayName?: string;
    createdAt?: string;
    savedAt?: string;
    extra?: Record<string, unknown>;
}

/** 地形六类（对齐原型 maps.js types）；tiles 字典缺省格 = land */
export type TerrainType = 'land' | 'water' | 'bridge' | 'mountain' | 'cracked' | 'forest';

export const TERRAIN_TYPES: readonly TerrainType[] = ['land', 'water', 'bridge', 'mountain', 'cracked', 'forest'];

export interface BattleMap {
    /** 地图名（可选，展示用） */
    name?: string;
    /** 稀疏地形字典：key = "x,y"，缺省 land */
    tiles: Record<string, TerrainType>;
}

/** 兵种（对齐原型 kinds；无象） */
export type UnitKind = 'king' | 'rook' | 'horse' | 'cannon' | 'pawn' | 'archer' | 'spearman' | 'advisor';

export const UNIT_KINDS: readonly UnitKind[] = ['king', 'rook', 'horse', 'cannon', 'pawn', 'archer', 'spearman', 'advisor'];

/** 车的职业（基础/冲锋/牵引；仅我方车可转职） */
export type RookRole = 'base' | 'charge' | 'pull';

/** 四向索引（与 CONFIG.directions 对应） */
export type DirectionIndex = 0 | 1 | 2 | 3;

export interface BattleUnit {
    id: string;
    side: Side;
    kind: UnitKind;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    attack: number;
    /** 等级（击杀 +1）；P3 成长用 */
    level: number;
    /** 击杀数 */
    kills: number;
    /** 技能点（P3） */
    sp: number;
    /** 剩余行动点 / 每回合上限 */
    ap: number;
    apLimit: number;
    /** 兵连击加成（2 SP 永久 +1 AP 上限；P3） */
    combo: number;
    /** 强健等级（maxHp +fortify；P3） */
    fortify: number;
    /** 弓四向独立射程升级（每方向 +1；P3） */
    directionPaid: number[];
    /** 炮八向溅射解锁位掩码（每方向 1 SP；P3） */
    cannonMask: number;
    /** 炮本回合移动/攻击可用性（双额度） */
    cannonMoveAvailable: boolean;
    cannonAttackAvailable: boolean;
    rookRole: RookRole;
    /** 车普通移动距离（默认 4） */
    rookMoveRange: number;
    /** 冲锋距离（默认 1，可升至 8） */
    rookChargeRange: number;
    /** 牵引射程（默认 3，可升至 8） */
    rookPullRange: number;
    /** 是否解锁震退（推 1 格） */
    rookPush: boolean;
    rookMoveAvailable: boolean;
    rookChargeAvailable: boolean;
    /** 帅 buff 记录（P3） */
    commanderHealth: number;
    commanderMove: number;
    /** 本回合行动是否结束 */
    acted: boolean;
}

/** 尸体（占格/挡路/别马腿/可作炮架，无 HP；unit = 阵亡时完整快照，救援复活用） */
export interface Corpse {
    id: string;
    x: number;
    y: number;
    unit?: BattleUnit;
}

/** 待入场敌人（P6 波次；status: pending 待入场 / spawned 已入场 / blocked 被占格阻挡 / blocked-enemy 旧敌占格暂缓） */
export interface PendingSpawn {
    id: string;
    kind: UnitKind;
    x: number;
    y: number;
    status: 'pending' | 'spawned' | 'blocked' | 'blocked-enemy';
    reason?: string;
}

export interface BattleTurn {
    round: number;
    phase: string;
}

/**
 * 敌方冻结意图（US-006；与原型 generateIntents 对齐）。
 * 锁定「相对位移 offset」：结算落点 = 攻击者当前位置 + offset，方向与距离保持冻结值；
 * 形状合法性在每次结算时按当前局面重验，失效不另选动作。
 * 敌弓/枪的方向攻击与敌车冲锋同样可冻结（type 带具体动作类型）。
 */
export type FrozenIntentType = 'attack' | 'standby' | 'directional' | 'charge';

export interface FrozenIntent {
    actorId: string;
    /** 冻结时的棋种 */
    kind: UnitKind;
    type: FrozenIntentType;
    /** 冻结时攻击者位置 */
    fromPos: GridPos;
    /** 冻结时预计落点 = fromPos + offset */
    toPos: GridPos;
    offset: GridPos;
    /** 行动顺序（稳定出生序，1 起）；显示顺序必须等于执行顺序 */
    order: number;
    /** directional：方向索引 */
    direction?: number;
    /** directional：冻结时的贯穿目标 id 序列 */
    targets?: string[];
    /** directional：冻结时的可打山格 */
    mountains?: GridPos[];
    /** 冻结路径（展示与重验参考） */
    path?: GridPos[];
}

export interface BattleState {
    formatVersion: 2;
    meta: BattleMeta;
    map: BattleMap;
    units: BattleUnit[];
    turn: BattleTurn;
    /** 敌方冻结意图（运行时生成；关卡 JSON 不含此字段） */
    intents?: FrozenIntent[];
    /** 尸体（占格/挡路/别马腿/可作炮架） */
    corpses?: Corpse[];
    /** 待入场敌人（P6 起使用） */
    pendingSpawns?: PendingSpawn[];
    /** 状态修订号：玩家动作 +1，提交携带旧 revision 的动作会被拒绝（防过期提交） */
    revision?: number;
    /** 林闪避 LCG 随机源（与原型 rules.js 同算法；运行时字段） */
    rng?: number;
    /** 当前金币（P1 起结算；运行时字段） */
    gold?: number;
    /** 本关击杀数（运行时） */
    kills?: number;
    /** 队伍最高等级（运行时） */
    highestLevel?: number;
    /** 本关已记金币的死亡 id（幂等防重；运行时） */
    killLedger?: Record<string, boolean>;
    /** 死亡 id → 金币价值（运行时） */
    killValues?: Record<string, number>;
    /** 战役进度：当前关卡序号（1 起；P1） */
    level?: number;
    /** 队伍底册：全员最新成长快照，跨关延续（P1） */
    party?: BattleUnit[];
    /** 上阵成员 id（P1；≤8 的约束在 P2 商店生效） */
    activeIds?: string[];
    /** 后备成员 id（P1；保留成长、不获本关收益） */
    bench?: string[];
    /** 过关一次性结算已执行（幂等防重；P1） */
    settled?: boolean;
    /** 帅增益选择（P3：health 生命 / move 机动 / rescue 救援；部署确认后的 commander 阶段三选一） */
    commanderBuff?: 'health' | 'move' | 'rescue' | null;
    /** 本关救援 buff 是否已用（P3；rescue 阶段消费一次） */
    rescueUsed?: boolean;
    /** 处于 rescue 阶段：必须救活或复活一人后进入第二波（P3） */
    rescueRequired?: boolean;
    /** 第 5 回合增援预告已播（P6；第 6 回合入场） */
    reinforcementPreview?: boolean;
    /** 关内波次（1 起；第二波敌人经 pendingSpawns 入场，P6） */
    wave?: number;
    /** 进战斗前快照（P1） */
    entrySnapshot?: BattleState;
    /** 本关开局快照：失败重试的完整回滚源（P1） */
    levelSnapshot?: BattleState;
    result: { winner: string; reason: string } | null;
    history?: { commands: unknown[] };
}

/** 解析错误：message 前缀携带出错字段的 JSON 路径，便于定位 */
export class BattleParseError extends Error {
    public readonly path: string;

    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = 'BattleParseError';
        this.path = path;
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
    if (!isObject(value)) {
        throw new BattleParseError(path, '应为对象（object）');
    }
    return value;
}

function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BattleParseError(path, '应为数字（number）');
    }
    return value;
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') {
        throw new BattleParseError(path, '应为字符串（string）');
    }
    return value;
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new BattleParseError(path, '应为数组（array）');
    }
    return value;
}

function terrainKey(x: number, y: number): string {
    return `${x},${y}`;
}

/** 取某格地形；缺省 land（对齐原型 terrain()） */
export function terrainAt(map: BattleMap, x: number, y: number): TerrainType {
    return map.tiles[terrainKey(x, y)] ?? 'land';
}

/** 写入地形（山破坏 cracked→land 会改写 tiles） */
export function setTerrainAt(map: BattleMap, x: number, y: number, type: TerrainType): void {
    map.tiles[terrainKey(x, y)] = type;
}

/**
 * 解析并校验战局 JSON（formatVersion 2）。
 * 结构校验 + 兵种/地形合法性 + 双方各恰一帅；完整地图约束（九宫等）见 validateMap。
 * @throws BattleParseError 携带 JSON 路径的解析错误
 */
export function parseBattleState(raw: unknown): BattleState {
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
        const t = requireString(value, path) as TerrainType;
        if (!TERRAIN_TYPES.includes(t)) {
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
        const unitKind = requireString(u.kind, `$.units[${index}].kind`) as UnitKind;
        if (!UNIT_KINDS.includes(unitKind)) {
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

    return raw as BattleState;
}

/**
 * 完整地图约束校验（照搬原型 maps.js validate 的战斗相关子集；P2 布阵复用 binding 子集）。
 * 返回错误列表（空 = 通过）：
 * - 双方各恰一枚帅；
 * - 棋子不越界、不重叠、不站山；
 * - 帅/士必须在己方九宫；
 * - 帅/士/兵/弓/枪/炮不得在致死水格出生。
 */
export function validateMap(map: BattleMap, units: Array<Pick<BattleUnit, 'id' | 'side' | 'kind' | 'x' | 'y'>>): string[] {
    const errors: string[] = [];
    const at = (x: number, y: number): TerrainType => terrainAt(map, x, y);
    const isWater = (x: number, y: number): boolean => at(x, y) === 'water';
    const isMountain = (x: number, y: number): boolean => at(x, y) === 'mountain' || at(x, y) === 'cracked';
    const seen = new Set<string>();
    for (const side of ['player', 'enemy'] as Side[]) {
        const kings = units.filter((u) => u.side === side && u.kind === 'king');
        if (kings.length !== 1) {
            errors.push(`${side === 'player' ? '我方帅' : '敌方将'}必须恰有一枚（现 ${kings.length}）`);
        }
    }
    const fatalWaterKinds: UnitKind[] = ['pawn', 'archer', 'spearman', 'cannon', 'king', 'advisor'];
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
        if ((u.kind === 'king' || u.kind === 'advisor') && !inPalace(u.side, { x: u.x, y: u.y })) {
            errors.push(`${label}将帅/士在己方九宫外（${u.id}）`);
        }
    }
    return errors;
}

export interface IsoOptions {
    /** 顶面菱形半宽（世界单位） */
    halfTileW: number;
    /** 顶面菱形半高（世界单位） */
    halfTileH: number;
    /** 顶面中心相对图心的纵向修正（世界单位，向下为负） */
    anchorOffsetY: number;
}

export interface IsoCoord {
    isoX: number;
    isoY: number;
    /** 渲染深度：x+y，越小越远、越先绘制 */
    depth: number;
}

/**
 * 逻辑格坐标 → 等距世界坐标。
 * Cocos +y 轴向上：深度（x+y）越大越靠近镜头，屏幕位置越靠下（y 越小）。
 * 逻辑网格仍是方形（x,y），等距只是视觉投影，两者解耦。
 */
export function gridToIso(x: number, y: number, options: IsoOptions): IsoCoord {
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
export function isoToGrid(
    isoX: number,
    isoY: number,
    options: IsoOptions,
    width: number,
    height: number,
): GridPos | null {
    const diff = isoX / options.halfTileW; // x − y
    const sum = (options.anchorOffsetY - isoY) / options.halfTileH; // x + y
    const x = Math.round((diff + sum) / 2);
    const y = Math.round((sum - diff) / 2);
    if (x < 0 || x >= width || y < 0 || y >= height) {
        return null;
    }
    return { x, y };
}
