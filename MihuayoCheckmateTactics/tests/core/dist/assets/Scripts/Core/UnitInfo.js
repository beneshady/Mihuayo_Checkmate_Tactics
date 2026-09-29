"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnitInfo = getUnitInfo;
const UnitDefs_1 = require("./UnitDefs");
/**
 * 组装指定棋子的展示信息；棋子或其定义缺失时返回 null
 * （定义缺失已在 Unit 视图 / EnemyAI 处 warn 过一次，这里不再重复日志）。
 */
function getUnitInfo(state, unitId, defs) {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit)
        return null;
    const def = (0, UnitDefs_1.getUnitDef)(defs, unit.defId);
    if (!def)
        return null;
    const owner = state.players.find((p) => p.id === unit.owner);
    return {
        unitId: unit.id,
        defId: unit.defId,
        name: def.name ?? unit.defId,
        side: owner?.controller === 'human' ? 'self' : 'enemy',
        hp: unit.hp ?? def.maxHp,
        maxHp: def.maxHp,
        stamina: unit.stamina ?? def.maxStamina,
        maxStamina: def.maxStamina,
        attack: def.attack,
        pos: { x: unit.pos.x, y: unit.pos.y },
    };
}
