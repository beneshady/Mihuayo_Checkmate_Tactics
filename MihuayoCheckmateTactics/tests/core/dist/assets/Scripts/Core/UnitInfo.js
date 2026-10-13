"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnitInfo = getUnitInfo;
exports.unitInfoOf = unitInfoOf;
const UnitDefs_1 = require("./UnitDefs");
/** 组装指定棋子的展示信息；棋子不存在时返回 null */
function getUnitInfo(state, unitId) {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit)
        return null;
    return unitInfoOf(unit);
}
/** 棋子 → 展示信息（供无 state 场景复用） */
function unitInfoOf(unit) {
    const def = (0, UnitDefs_1.getKindDef)(unit.kind);
    let ap = unit.ap;
    let maxAp = unit.apLimit;
    if (unit.kind === 'rook') {
        ap = unit.rookMoveAvailable || unit.rookChargeAvailable ? 1 : 0;
        maxAp = 1;
    }
    else if (unit.kind === 'cannon') {
        ap = unit.cannonMoveAvailable || unit.cannonAttackAvailable ? 1 : 0;
        maxAp = 1;
    }
    return {
        unitId: unit.id,
        kind: unit.kind,
        name: (0, UnitDefs_1.kindName)(unit.kind) ?? unit.kind,
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
