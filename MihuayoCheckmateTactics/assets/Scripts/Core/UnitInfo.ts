import { BattleState, GridPos } from './BattleState';
import { UnitDef, getUnitDef } from './UnitDefs';

/**
 * 棋子信息快照（纯 TS，零引擎依赖）：信息面板的数据组装收口于此，
 * GameManager 保持薄，面板视图只负责格式化显示。
 * 参见 docs/design/unit-info-panel-plan.md。
 */

export interface UnitInfo {
    unitId: string;
    defId: string;
    /** 展示名：def.name ?? defId */
    name: string;
    /** 相对人类玩家的阵营标签（按归属玩家 controller 判定；controller 未配置视为敌方） */
    side: 'self' | 'enemy';
    /** 当前生命（hp 未定义视为满血；与存活判定 `hp ?? 1` 口径不同，M0 关卡数据两者一致不触发） */
    hp: number;
    maxHp: number;
    attack: number;
    pos: GridPos;
}

/**
 * 组装指定棋子的展示信息；棋子或其定义缺失时返回 null
 * （定义缺失已在 Unit 视图 / EnemyAI 处 warn 过一次，这里不再重复日志）。
 */
export function getUnitInfo(state: BattleState, unitId: string, defs: UnitDef[]): UnitInfo | null {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return null;
    const def = getUnitDef(defs, unit.defId);
    if (!def) return null;
    const owner = state.players.find((p) => p.id === unit.owner);
    return {
        unitId: unit.id,
        defId: unit.defId,
        name: def.name ?? unit.defId,
        side: owner?.controller === 'human' ? 'self' : 'enemy',
        hp: unit.hp ?? def.maxHp,
        maxHp: def.maxHp,
        attack: def.attack,
        pos: { x: unit.pos.x, y: unit.pos.y },
    };
}
