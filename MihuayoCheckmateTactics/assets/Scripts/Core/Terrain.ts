import { BattleState, findTileGridLayer } from './BattleState';
import { UnitDef } from './UnitDefs';

/**
 * 地形规则（纯 TS，零引擎依赖）。
 * 地形 id 来自战局 map.layers 的 tileGrid 层（与 Tile 视图共用同一套 id）。
 * 参见 docs/地块&棋子详细规则.md 与 docs/design/terrain-units-plan.md。
 *
 * 语义约定：
 * - forest（森林）：所有棋子不可进入；在路径/腿/炮架判定中与棋子同级算阻挡；
 *   永不可被攻击（它不是 state.units 成员，天然不会成为攻击目标）
 * - water（水面）：按 UnitDef.waterPassable（缺省可进）；waterPassable=false 的棋子
 *   （象）不可进入、也不可攻击水中目标
 * - road（地宫）：对一般棋子等价平地；onlyOnTerrain='road' 的棋子（士/帅）只能在其上移动
 * - plain / hill：等价平地（hill 规则未定，先作装饰）
 * - 未知地形 id：按平地兜底（与视图层贴图回退策略一致），保证数据先于代码出现时不崩
 */

/** 视同"棋子级阻挡物"的地形：slide 终止、马腿/象眼受阻、可作炮架 */
const BLOCKING_TERRAIN_IDS = new Set(['forest']);

/** 取某格地形 id；出界/无地形层时返回 'plain' 兜底 */
export function getTerrainAt(state: BattleState, x: number, y: number): string {
    const layer = findTileGridLayer(state.map);
    if (!layer || y < 0 || y >= layer.cells.length) {
        return 'plain';
    }
    const row = layer.cells[y];
    if (x < 0 || x >= row.length || !row[x]) {
        return 'plain';
    }
    return row[x];
}

/** 该地形是否视同阻挡物（slide 路径终止 / 马腿象眼受阻 / 可作炮架） */
export function isBlockingTerrain(terrainId: string): boolean {
    return BLOCKING_TERRAIN_IDS.has(terrainId);
}

/**
 * 该棋子定义能否进入该地形（移动落点规则）。
 * 攻击目标格不走本函数——士可攻击非地宫格，见 canAttackIntoTerrain。
 */
export function canEnterTerrain(def: UnitDef, terrainId: string): boolean {
    if (isBlockingTerrain(terrainId)) {
        return false; // 森林不可进
    }
    if (terrainId === 'water' && def.waterPassable === false) {
        return false; // 象不可入水
    }
    if (def.onlyOnTerrain && terrainId !== def.onlyOnTerrain) {
        return false; // 士/帅只能在地宫上移动
    }
    return true;
}

/**
 * 攻击目标格地形规则：象不可攻击水中敌人（waterPassable=false）；
 * 不应用 onlyOnTerrain——士/帅虽只能站在地宫，但可攻击地宫外的相邻敌人。
 * 森林无需判断：其上永远不会有棋子。
 */
export function canAttackIntoTerrain(def: UnitDef, terrainId: string): boolean {
    return terrainId !== 'water' || def.waterPassable !== false;
}
