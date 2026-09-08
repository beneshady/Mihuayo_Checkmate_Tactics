/**
 * 战局数据（formatVersion 1）的纯数据结构与解析校验。
 *
 * 本文件是纯 TypeScript：MUST NOT import 任何 'cc' 或平台 API，
 * 便于脱离引擎独立审阅与验证（见 docs/cocos/development-baseline.md）。
 * 数据格式定义见 docs/design/battle-state-format.md。
 */

/** 参战方控制类型 */
export type ControllerType = 'human' | 'ai';

/** 文档用途标记 */
export type BattleKind = 'battleInit' | 'battleSave';

export interface GridPos {
    x: number;
    y: number;
}

export interface BattleMeta {
    kind: BattleKind;
    battleId: string;
    displayName?: string;
    createdAt?: string;
    savedAt?: string;
    extra?: Record<string, unknown>;
}

export interface BattleCondition {
    type: string;
}

export interface BattleRules {
    rulesetId: string;
    params: {
        maxRounds?: number;
        winConditions?: BattleCondition[];
        loseConditions?: BattleCondition[];
    };
    extra?: Record<string, unknown>;
}

/** tileGrid 类型图层（地形层） */
export interface TileGridLayer {
    id: string;
    type: 'tileGrid';
    /** 稀疏格的默认地形（M0 要求 cells 为完整网格，暂不使用） */
    default?: string;
    /** cells[y][x] = 地形 defId；行数 = height，每行长度 = width */
    cells: string[][];
}

/** 其他类型图层：本步骤不解析，原样透传保留 */
export interface PassthroughLayer {
    id: string;
    type: string;
    [key: string]: unknown;
}

export type MapLayer = TileGridLayer | PassthroughLayer;

export interface BattleMap {
    gridType: 'square';
    width: number;
    height: number;
    layers: MapLayer[];
    extra?: Record<string, unknown>;
}

export interface BattlePlayer {
    id: string;
    name?: string;
    team?: number;
    controller?: ControllerType;
    extra?: Record<string, unknown>;
}

export interface UnitStatus {
    id: string;
    turns: number;
    power?: number;
}

export interface BattleUnit {
    id: string;
    defId: string;
    owner: string;
    pos: GridPos;
    hp?: number;
    actedThisTurn?: boolean;
    statuses?: UnitStatus[];
    extra?: Record<string, unknown>;
}

export interface BattleTurn {
    round: number;
    order: string[];
    active: string;
    phase: string;
    extra?: Record<string, unknown>;
}

export interface BattleState {
    formatVersion: 1;
    meta: BattleMeta;
    rules: BattleRules;
    map: BattleMap;
    players: BattlePlayer[];
    units: BattleUnit[];
    turn: BattleTurn;
    rng?: { seed: number; calls: number };
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

function findTileGridLayerIndex(layers: unknown[]): number {
    return layers.findIndex((layer) => isObject(layer) && layer.type === 'tileGrid');
}

/**
 * 解析并校验战局 JSON（formatVersion 1）。
 *
 * 校验范围（M0）：结构必需字段 + 地形层网格完整性（行数 = height、每行长度 = width）。
 * 其余内容（units 细节、rules.params 等）结构透传，由后续步骤消费。
 * 未知地形 id 不在此报错：贴图映射是否齐全属于视图层职责（见 MapBuilder 兜底策略）。
 *
 * @throws BattleParseError 携带 JSON 路径的解析错误
 */
export function parseBattleState(raw: unknown): BattleState {
    const root = requireObject(raw, '$');

    const formatVersion = requireNumber(root.formatVersion, '$.formatVersion');
    if (formatVersion !== 1) {
        throw new BattleParseError('$.formatVersion', `不支持的格式版本 ${formatVersion}，当前仅支持 1`);
    }

    const metaRaw = requireObject(root.meta, '$.meta');
    const kind = requireString(metaRaw.kind, '$.meta.kind');
    if (kind !== 'battleInit' && kind !== 'battleSave') {
        throw new BattleParseError('$.meta.kind', `应为 "battleInit" 或 "battleSave"，实际为 "${kind}"`);
    }
    requireString(metaRaw.battleId, '$.meta.battleId');

    requireObject(root.rules, '$.rules');

    const mapRaw = requireObject(root.map, '$.map');
    const gridType = requireString(mapRaw.gridType, '$.map.gridType');
    if (gridType !== 'square') {
        throw new BattleParseError('$.map.gridType', `暂不支持网格类型 "${gridType}"（当前仅支持 "square"）`);
    }
    const width = requireNumber(mapRaw.width, '$.map.width');
    const height = requireNumber(mapRaw.height, '$.map.height');
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
        throw new BattleParseError('$.map.width/height', '必须为正整数');
    }
    const layersRaw = requireArray(mapRaw.layers, '$.map.layers');
    if (layersRaw.length === 0) {
        throw new BattleParseError('$.map.layers', '至少需要一个图层');
    }
    layersRaw.forEach((layer, index) => {
        const layerObj = requireObject(layer, `$.map.layers[${index}]`);
        requireString(layerObj.id, `$.map.layers[${index}].id`);
        requireString(layerObj.type, `$.map.layers[${index}].type`);
    });

    requireArray(root.players, '$.players');
    requireArray(root.units, '$.units');

    const turnRaw = requireObject(root.turn, '$.turn');
    requireNumber(turnRaw.round, '$.turn.round');
    requireArray(turnRaw.order, '$.turn.order');
    requireString(turnRaw.active, '$.turn.active');
    requireString(turnRaw.phase, '$.turn.phase');

    // 地形层（tileGrid）：M0 要求完整网格
    const terrainIndex = findTileGridLayerIndex(layersRaw);
    if (terrainIndex < 0) {
        throw new BattleParseError('$.map.layers', '未找到 type="tileGrid" 的地形层');
    }
    const terrainPath = `$.map.layers[${terrainIndex}]`;
    const terrainObj = requireObject(layersRaw[terrainIndex], terrainPath);
    const cellsRaw = requireArray(terrainObj.cells, `${terrainPath}.cells`);
    if (cellsRaw.length !== height) {
        throw new BattleParseError(`${terrainPath}.cells`, `行数应为 ${height}，实际为 ${cellsRaw.length}`);
    }
    cellsRaw.forEach((row, y) => {
        const rowArr = requireArray(row, `${terrainPath}.cells[${y}]`);
        if (rowArr.length !== width) {
            throw new BattleParseError(`${terrainPath}.cells[${y}]`, `长度应为 ${width}，实际为 ${rowArr.length}`);
        }
        rowArr.forEach((cell, x) => {
            requireString(cell, `${terrainPath}.cells[${y}][${x}]`);
        });
    });

    return raw as BattleState;
}

/** 从图层列表中取地形层；parseBattleState 已保证其存在 */
export function findTileGridLayer(map: BattleMap): TileGridLayer | undefined {
    return map.layers.find((layer): layer is TileGridLayer => layer.type === 'tileGrid');
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
 * x 轴向右下、y 轴向左下展开（经典等距布局）；深度越小越远、越先绘制。
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
 * 输入必须是地块所在容器的本地坐标；调用方先用容器世界矩阵的逆把触点转到本地，
 * 因此本函数对任意平移/缩放视角都成立。逻辑格出界返回 null。
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
