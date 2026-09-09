import { BattleState, BattleUnit } from './BattleState';
import { MoveSpec, UnitDef } from './UnitDefs';
import { canAttackIntoTerrain, canEnterTerrain, getTerrainAt, isBlockingTerrain } from './Terrain';

/**
 * 走法引擎（纯 TS，零引擎依赖）。
 * 解释 UnitDef.moveSpecs / attackSpecs（step/slide/jump + solid/screen/leg/fly），
 * 计算某棋子当前可到达的格子（含可攻击的敌方格），并叠加地形规则：
 * - move 模式：落点须通过 canEnterTerrain（森林不可进、水按 waterPassable、onlyOnTerrain 限制）
 * - attack 模式：目标格只按 canAttackIntoTerrain（象不可打入水中；森林上无棋子自动不可能是目标），
 *   因此士可打地宫外与水中的相邻敌棋
 * - 森林在所有路径判定中与棋子同级算阻挡（slide 终止 / 马腿象眼受阻 / 可作炮架）
 * 参见 docs/地块&棋子详细规则.md 与 docs/design/terrain-units-plan.md。
 */

export interface ReachableCell {
    x: number;
    y: number;
    /** 是否为可攻击（目标格是对手棋子） */
    capture: boolean;
}

/** 计算模式：move=移动落点（蓝色高亮）；attack=攻击范围（灰=空格示意、红=有敌棋） */
export type ReachMode = 'move' | 'attack';

function inBounds(state: BattleState, x: number, y: number): boolean {
    return x >= 0 && x < state.map.width && y >= 0 && y < state.map.height;
}

function occupiedUnit(state: BattleState, x: number, y: number): BattleUnit | undefined {
    return state.units.find((u) => u.pos.x === x && u.pos.y === y);
}

/**
 * 计算某棋子当前可到达的格子（供高亮 / 移动 / 攻击使用）。
 * mode='move' 用 moveSpecs + 完整进入规则；mode='attack' 用 attackSpecs
 * （缺省回退 moveSpecs，如马/兵"打=走"）+ 攻击目标地形规则。
 */
export function computeReachableCells(
    state: BattleState,
    unit: BattleUnit,
    unitDef: UnitDef,
    mode: ReachMode = 'move',
): ReachableCell[] {
    const specs = mode === 'attack' ? (unitDef.attackSpecs ?? unitDef.moveSpecs) : unitDef.moveSpecs;
    const out = new Map<string, ReachableCell>();
    for (const spec of specs) {
        applySpec(state, unit, unitDef, spec, mode, out);
    }
    return Array.from(out.values());
}

function applySpec(
    state: BattleState,
    unit: BattleUnit,
    unitDef: UnitDef,
    spec: MoveSpec,
    mode: ReachMode,
    out: Map<string, ReachableCell>,
): void {
    const add = (x: number, y: number, capture: boolean) => {
        const key = `${x},${y}`;
        const prev = out.get(key);
        // 同格既可移动也可攻击时，优先记攻击
        if (!prev || (!prev.capture && capture)) {
            out.set(key, { x, y, capture });
        }
    };
    const { dx, dy } = spec.dir;

    if (spec.type === 'step') {
        const x = unit.pos.x + dx;
        const y = unit.pos.y + dy;
        if (!inBounds(state, x, y)) return;
        const occ = occupiedUnit(state, x, y);
        if (occ && occ.owner === unit.owner) return; // 己方占据不能落/不能打
        const terrain = getTerrainAt(state, x, y);
        if (occ) {
            if (mode === 'attack' && !canAttackIntoTerrain(unitDef, terrain)) return;
            add(x, y, true); // 敌方=攻击目标
            return;
        }
        if (mode === 'move' && !canEnterTerrain(unitDef, terrain)) return;
        if (mode === 'attack' && !canAttackIntoTerrain(unitDef, terrain)) return;
        add(x, y, false); // 空格=可走/范围示意
        return;
    }

    if (spec.type === 'slide') {
        const screen = spec.passage === 'screen' ? (spec.screen ?? 0) : -1;
        let blockers = 0;
        for (let k = 1; ; k++) {
            const x = unit.pos.x + dx * k;
            const y = unit.pos.y + dy * k;
            if (!inBounds(state, x, y)) break;
            const terrain = getTerrainAt(state, x, y);
            const occ = occupiedUnit(state, x, y);
            const blocked = !!occ || isBlockingTerrain(terrain); // 棋子与森林同级阻挡

            if (spec.passage === 'solid') {
                if (blocked) {
                    if (occ && occ.owner !== unit.owner) {
                        if (mode !== 'attack' || canAttackIntoTerrain(unitDef, terrain)) {
                            add(x, y, true); // 敌=可吃/可打
                        }
                    }
                    break; // 遇子/森林即止（无论敌我，不能穿过）
                }
                if (mode === 'move' && !canEnterTerrain(unitDef, terrain)) break;
                if (mode === 'attack' && !canAttackIntoTerrain(unitDef, terrain)) break;
                add(x, y, false); // 空格=可走
            } else if (spec.passage === 'screen') {
                if (blocked) {
                    blockers++; // 棋子或森林均可作炮架（含目标自身）
                    if (
                        mode === 'attack' &&
                        occ &&
                        occ.owner !== unit.owner &&
                        blockers === screen + 1 && // 目标自身是第 screen+1 个阻挡：其前方恰好隔 screen 个炮架
                        canAttackIntoTerrain(unitDef, terrain)
                    ) {
                        add(x, y, true); // 恰好隔 screen 个炮架的敌棋=攻击目标
                    }
                } else if (blockers === 0) {
                    if (mode === 'move' && !canEnterTerrain(unitDef, terrain)) break;
                    if (mode === 'attack' && !canAttackIntoTerrain(unitDef, terrain)) break;
                    add(x, y, false); // 炮架前空格=可走/范围示意
                }
                // 炮架后空格：不可走也不可打，继续向前找目标
            } else {
                // fly：无视阻挡（目标格仍受攻击入水等限制）
                if (occ) {
                    if (occ.owner !== unit.owner && (mode !== 'attack' || canAttackIntoTerrain(unitDef, terrain))) {
                        add(x, y, true);
                    }
                } else {
                    add(x, y, false);
                }
            }
        }
        return;
    }

    // jump：跳到固定相对位置 dir
    const x = unit.pos.x + dx;
    const y = unit.pos.y + dy;
    if (!inBounds(state, x, y)) return;
    if (spec.passage === 'leg' && spec.leg) {
        const legX = unit.pos.x + spec.leg.dx;
        const legY = unit.pos.y + spec.leg.dy;
        // 马腿/象眼：被棋子或森林别住都不能走/打
        if (occupiedUnit(state, legX, legY) || isBlockingTerrain(getTerrainAt(state, legX, legY))) {
            return;
        }
    }
    const occ = occupiedUnit(state, x, y);
    if (occ && occ.owner === unit.owner) return; // 己方占据不能落/不能打
    const terrain = getTerrainAt(state, x, y);
    if (occ) {
        if (mode === 'attack' && !canAttackIntoTerrain(unitDef, terrain)) return;
        add(x, y, true); // 敌方=攻击目标
        return;
    }
    if (mode === 'move' && !canEnterTerrain(unitDef, terrain)) return;
    if (mode === 'attack' && !canAttackIntoTerrain(unitDef, terrain)) return;
    add(x, y, false);
}
