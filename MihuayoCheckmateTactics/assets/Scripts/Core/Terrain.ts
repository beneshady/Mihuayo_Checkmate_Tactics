import { BattleState, BattleUnit, Corpse, GridPos, TerrainType, UnitKind, terrainAt } from './BattleState';
import { inside } from './Config';

/**
 * 地形与占位规则（v2，对齐原型 rules.js 语义；纯 TS，零引擎依赖）。
 *
 * 地形语义（v2.3）：
 * - land / bridge：等价陆地（桥按陆地处理）；
 * - water：兵/弓/枪/炮「途经即死」（fatalWater）；马/车可停留水中但禁攻击（wet）；
 *   水中活子仍占格、可作炮架；死亡入水不留尸；
 * - mountain / cracked：阻挡站/走/马腿；可作炮架；可作普通攻击目标（计 1 命中，
 *   mountain→cracked→land）；山可承受碰撞但不传递；
 * - forest：可站立、不阻挡走法与弹道；受普通攻击 30% 闪避（随机源见 Config.nextRandom）。
 *
 * 占位：活单位 / 尸体 / 山。格上三者互斥。
 */

/** 兵系（含弓/枪）+ 炮 + 帅/士：途经水格即死 */
const FATAL_WATER_KINDS: ReadonlySet<UnitKind> = new Set(['pawn', 'archer', 'spearman', 'cannon', 'king', 'advisor']);

export function isWaterAt(state: BattleState, x: number, y: number): boolean {
    return terrainAt(state.map, x, y) === 'water';
}

export function isBridgeAt(state: BattleState, x: number, y: number): boolean {
    return terrainAt(state.map, x, y) === 'bridge';
}

/** 山（mountain 或 cracked）：阻挡站/走/马腿/弹道，可作炮架与攻击目标 */
export function isMountainAt(state: BattleState, x: number, y: number): boolean {
    const t = terrainAt(state.map, x, y);
    return t === 'mountain' || t === 'cracked';
}

/** 该棋种是否「途经水即死」（fatalWater） */
export function isFatalWaterKind(kind: UnitKind): boolean {
    return FATAL_WATER_KINDS.has(kind);
}

/** 车/马停在水中：禁攻击（wet） */
export function isWet(state: BattleState, unit: BattleUnit): boolean {
    return isWaterAt(state, unit.x, unit.y) && (unit.kind === 'rook' || unit.kind === 'horse');
}

/** 该格是否有活单位 */
export function unitAt(state: BattleState, x: number, y: number): BattleUnit | undefined {
    return state.units.find((u) => u.x === x && u.y === y);
}

/** 该格是否有尸体 */
export function corpseAt(state: BattleState, x: number, y: number): Corpse | undefined {
    return (state.corpses ?? []).find((c) => c.x === x && c.y === y);
}

/** 占位 = 活单位 / 尸体 / 山（对齐原型 occupied） */
export function isOccupied(state: BattleState, x: number, y: number): boolean {
    return !!unitAt(state, x, y) || !!corpseAt(state, x, y) || isMountainAt(state, x, y);
}

/** 同格点 */
export function samePos(a: GridPos, b: GridPos): boolean {
    return a.x === b.x && a.y === b.y;
}

/** 直线路径（a→b 同行或同列；含端点不含起点；不同线返回空） */
export function linePath(a: GridPos, b: GridPos): GridPos[] {
    if (a.x !== b.x && a.y !== b.y) {
        return [];
    }
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    const out: GridPos[] = [];
    if (!dx && !dy) {
        return out;
    }
    for (let x = a.x + dx, y = a.y + dy; ; x += dx, y += dy) {
        out.push({ x, y });
        if (x === b.x && y === b.y) {
            break;
        }
    }
    return out;
}

/** 移动路径是否安全：兵系/炮不得途经水格（对齐原型 safePath） */
export function isSafePath(state: BattleState, kind: UnitKind, path: GridPos[]): boolean {
    if (!isFatalWaterKind(kind)) {
        return true;
    }
    return !path.some((p) => isWaterAt(state, p.x, p.y));
}

/**
 * 山受一次有效命中：mountain→cracked→land（对齐原型 rockHit；
 * effect.mountains 去重同一次结算内重复命中）。
 * hits：本次结算的命中记录（供表现层展示），可传 null 表示只改地形。
 */
export function rockHit(
    state: BattleState,
    p: GridPos,
    effect: { mountains?: GridPos[] } | null,
): void {
    if (!isMountainAt(state, p.x, p.y)) {
        return;
    }
    const before = terrainAt(state.map, p.x, p.y);
    const after: TerrainType = before === 'mountain' ? 'cracked' : 'land';
    state.map.tiles[`${p.x},${p.y}`] = after;
    if (effect) {
        effect.mountains = effect.mountains ?? [];
        if (!effect.mountains.some((q) => q.x === p.x && q.y === p.y)) {
            effect.mountains.push({ x: p.x, y: p.y });
        }
    }
}

/** 单位死亡留尸：我方 commanderTarget 阵亡且不在水中 → 陆地留尸（对齐原型 leaveCorpse） */
export function leaveCorpse(state: BattleState, unit: BattleUnit): void {
    const isCommanderTarget = unit.side === 'player' && unit.kind !== 'king' && unit.kind !== 'advisor';
    if (!isCommanderTarget || isWaterAt(state, unit.x, unit.y)) {
        return;
    }
    const body: BattleUnit = { ...unit, hp: 0 };
    state.corpses = state.corpses ?? [];
    state.corpses.push({ id: `corpse-${unit.id}`, x: unit.x, y: unit.y, unit: body });
}

/** 立即淹死判定：兵系/炮处于水中 → hp=0（对齐原型 drown；死亡处理走统一 removeDead） */
export function drownCheck(state: BattleState, unit: BattleUnit, effect: { waterDeaths?: string[] }): void {
    if (isWaterAt(state, unit.x, unit.y) && isFatalWaterKind(unit.kind)) {
        unit.hp = 0;
        effect.waterDeaths = effect.waterDeaths ?? [];
        effect.waterDeaths.push(unit.id);
    }
}

/** 界内且在界内格上（含边界检查的 thin wrapper） */
export function insideState(x: number, y: number): boolean {
    return inside({ x, y });
}
