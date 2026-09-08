import { BattleState, BattleUnit } from './BattleState';
import { MoveSpec, UnitDef } from './UnitDefs';

/**
 * 走法引擎（纯 TS，零引擎依赖）。
 * 解释 UnitDef.moveSpecs（step/slide/jump + solid/screen/leg/fly），
 * 计算某棋子当前可到达的格子（含可攻击的敌方格）。参见 docs/design/unit-defs-plan.md。
 */

export interface ReachableCell {
    x: number;
    y: number;
    /** 是否为可攻击（目标格是对手棋子） */
    capture: boolean;
}

function inBounds(state: BattleState, x: number, y: number): boolean {
    return x >= 0 && x < state.map.width && y >= 0 && y < state.map.height;
}

function occupiedUnit(state: BattleState, x: number, y: number): BattleUnit | undefined {
    return state.units.find((u) => u.pos.x === x && u.pos.y === y);
}

/** 计算某棋子当前可到达的格子（供高亮 / 移动 / 攻击使用） */
export function computeReachableCells(state: BattleState, unit: BattleUnit, unitDef: UnitDef): ReachableCell[] {
    const out = new Map<string, ReachableCell>();
    for (const spec of unitDef.moveSpecs) {
        applySpec(state, unit, spec, out);
    }
    return Array.from(out.values());
}

function applySpec(
    state: BattleState,
    unit: BattleUnit,
    spec: MoveSpec,
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
        if (occ && occ.owner === unit.owner) return; // 己方占据不能落
        add(x, y, !!occ); // 敌方=攻击，空=移动
        return;
    }

    if (spec.type === 'slide') {
        const screen = spec.passage === 'screen' ? (spec.screen ?? 0) : -1;
        let blockers = 0;
        for (let k = 1; ; k++) {
            const x = unit.pos.x + dx * k;
            const y = unit.pos.y + dy * k;
            if (!inBounds(state, x, y)) break;
            const occ = occupiedUnit(state, x, y);

            if (spec.passage === 'solid') {
                if (occ) {
                    if (occ.owner !== unit.owner) add(x, y, true); // 敌=可吃
                    break; // 遇子即止（无论敌我，不能穿过）
                }
                add(x, y, false); // 空格=可走
            } else if (spec.passage === 'screen') {
                if (occ) {
                    blockers++;
                    // 恰好隔 screen 个阻挡时，可攻击该敌
                    if (occ.owner !== unit.owner && blockers === screen) add(x, y, true);
                } else if (blockers === 0) {
                    add(x, y, false); // 移动时路径须无阻挡
                }
            } else {
                // fly：无视阻挡
                add(x, y, !!occ && occ.owner !== unit.owner);
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
        if (occupiedUnit(state, legX, legY)) return; // 别腿被占，不能走
    }
    const occ = occupiedUnit(state, x, y);
    if (occ && occ.owner === unit.owner) return; // 己方占据不能落
    add(x, y, !!occ);
}
