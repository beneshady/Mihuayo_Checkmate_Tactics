import { BattleState, BattleUnit } from './BattleState';
import { getKindDef, kindName } from './UnitDefs';

/**
 * 棋子信息快照（纯 TS，零引擎依赖）：信息面板的数据组装收口于此，
 * GameManager 保持薄，面板视图只负责格式化显示。
 * 参见 docs/design/unit-info-panel-plan.md。
 */

export interface UnitInfo {
    unitId: string;
    kind: string;
    /** 展示名：kindName(kind) */
    name: string;
    /** 相对我方的阵营标签 */
    side: 'self' | 'enemy';
    hp: number;
    maxHp: number;
    /** 剩余行动点（车/炮为双槽剩余概览：任意槽可用即 1） */
    ap: number;
    maxAp: number;
    attack: number;
    /** 等级（击杀成长，P3 起有意义） */
    level: number;
    /** 行动是否已耗尽 */
    acted: boolean;
    x: number;
    y: number;
}

/** 组装指定棋子的展示信息；棋子不存在时返回 null */
export function getUnitInfo(state: BattleState, unitId: string): UnitInfo | null {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return null;
    return unitInfoOf(unit);
}

/** 棋子 → 展示信息（供无 state 场景复用） */
export function unitInfoOf(unit: BattleUnit): UnitInfo {
    const def = getKindDef(unit.kind);
    let ap = unit.ap;
    let maxAp = unit.apLimit;
    if (unit.kind === 'rook') {
        ap = unit.rookMoveAvailable || unit.rookChargeAvailable ? 1 : 0;
        maxAp = 1;
    } else if (unit.kind === 'cannon') {
        ap = unit.cannonMoveAvailable || unit.cannonAttackAvailable ? 1 : 0;
        maxAp = 1;
    }
    return {
        unitId: unit.id,
        kind: unit.kind,
        name: kindName(unit.kind) ?? unit.kind,
        side: unit.side === 'player' ? 'self' : 'enemy',
        hp: unit.hp,
        maxHp: unit.maxHp,
        ap,
        maxAp,
        attack: def?.attack ?? unit.attack,
        level: unit.level,
        acted: unit.acted,
        x: unit.x,
        y: unit.y,
    };
}
