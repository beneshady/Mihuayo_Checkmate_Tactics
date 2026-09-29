"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeReachableCells = computeReachableCells;
const Terrain_1 = require("./Terrain");
function inBounds(state, x, y) {
    return x >= 0 && x < state.map.width && y >= 0 && y < state.map.height;
}
function occupiedUnit(state, x, y) {
    return state.units.find((u) => u.pos.x === x && u.pos.y === y);
}
/**
 * 计算某棋子当前可到达的格子（供高亮 / 移动 / 攻击使用）。
 * mode='move' 用 moveSpecs + 完整进入规则；mode='attack' 用 attackSpecs
 * （缺省回退 moveSpecs，如马/兵"打=走"）+ 攻击目标地形规则。
 */
function computeReachableCells(state, unit, unitDef, mode = 'move') {
    const specs = mode === 'attack' ? (unitDef.attackSpecs ?? unitDef.moveSpecs) : unitDef.moveSpecs;
    const out = new Map();
    for (const spec of specs) {
        applySpec(state, unit, unitDef, spec, mode, out);
    }
    return Array.from(out.values());
}
function applySpec(state, unit, unitDef, spec, mode, out) {
    const add = (x, y, capture) => {
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
        if (!inBounds(state, x, y))
            return;
        const occ = occupiedUnit(state, x, y);
        if (occ && occ.owner === unit.owner)
            return; // 己方占据不能落/不能打
        const terrain = (0, Terrain_1.getTerrainAt)(state, x, y);
        if (occ) {
            if (mode === 'attack' && !(0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))
                return;
            add(x, y, true); // 敌方=攻击目标
            return;
        }
        if (mode === 'move' && !(0, Terrain_1.canEnterTerrain)(unitDef, terrain))
            return;
        if (mode === 'attack' && !(0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))
            return;
        add(x, y, false); // 空格=可走/范围示意
        return;
    }
    if (spec.type === 'slide') {
        const screen = spec.passage === 'screen' ? (spec.screen ?? 0) : -1;
        let blockers = 0;
        for (let k = 1;; k++) {
            const x = unit.pos.x + dx * k;
            const y = unit.pos.y + dy * k;
            if (!inBounds(state, x, y))
                break;
            const terrain = (0, Terrain_1.getTerrainAt)(state, x, y);
            const occ = occupiedUnit(state, x, y);
            const blocked = !!occ || (0, Terrain_1.isBlockingTerrain)(terrain); // 棋子与森林同级阻挡
            if (spec.passage === 'solid') {
                if (blocked) {
                    if (occ && occ.owner !== unit.owner) {
                        if (mode !== 'attack' || (0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain)) {
                            add(x, y, true); // 敌=可吃/可打
                        }
                    }
                    break; // 遇子/森林即止（无论敌我，不能穿过）
                }
                if (mode === 'move' && !(0, Terrain_1.canEnterTerrain)(unitDef, terrain))
                    break;
                if (mode === 'attack' && !(0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))
                    break;
                add(x, y, false); // 空格=可走
            }
            else if (spec.passage === 'screen') {
                if (blocked) {
                    blockers++; // 棋子或森林均可作炮架（含目标自身）
                    if (mode === 'attack' &&
                        occ &&
                        occ.owner !== unit.owner &&
                        blockers === screen + 1 && // 目标自身是第 screen+1 个阻挡：其前方恰好隔 screen 个炮架
                        (0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain)) {
                        add(x, y, true); // 恰好隔 screen 个炮架的敌棋=攻击目标
                    }
                }
                else if (blockers === 0) {
                    if (mode === 'move' && !(0, Terrain_1.canEnterTerrain)(unitDef, terrain))
                        break;
                    if (mode === 'attack' && !(0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))
                        break;
                    add(x, y, false); // 炮架前空格=可走/范围示意
                }
                // 炮架后空格：不可走也不可打，继续向前找目标
            }
            else {
                // fly：无视阻挡（目标格仍受攻击入水等限制）
                if (occ) {
                    if (occ.owner !== unit.owner && (mode !== 'attack' || (0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))) {
                        add(x, y, true);
                    }
                }
                else {
                    add(x, y, false);
                }
            }
        }
        return;
    }
    // jump：跳到固定相对位置 dir
    const x = unit.pos.x + dx;
    const y = unit.pos.y + dy;
    if (!inBounds(state, x, y))
        return;
    if (spec.passage === 'leg' && spec.leg) {
        const legX = unit.pos.x + spec.leg.dx;
        const legY = unit.pos.y + spec.leg.dy;
        // 马腿/象眼：被棋子或森林别住都不能走/打
        if (occupiedUnit(state, legX, legY) || (0, Terrain_1.isBlockingTerrain)((0, Terrain_1.getTerrainAt)(state, legX, legY))) {
            return;
        }
    }
    const occ = occupiedUnit(state, x, y);
    if (occ && occ.owner === unit.owner)
        return; // 己方占据不能落/不能打
    const terrain = (0, Terrain_1.getTerrainAt)(state, x, y);
    if (occ) {
        if (mode === 'attack' && !(0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))
            return;
        add(x, y, true); // 敌方=攻击目标
        return;
    }
    if (mode === 'move' && !(0, Terrain_1.canEnterTerrain)(unitDef, terrain))
        return;
    if (mode === 'attack' && !(0, Terrain_1.canAttackIntoTerrain)(unitDef, terrain))
        return;
    add(x, y, false);
}
