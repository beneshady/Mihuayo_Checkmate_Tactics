import { BattlePlayer, BattleState, BattleUnit } from './BattleState';
import { UnitDef, getUnitDef } from './UnitDefs';

/**
 * 战局规则（纯 TS，零引擎依赖）。
 * 只读写战局状态；流程编排（阶段切换、驱动视图）由 GameManager 负责。
 * 参见 docs/architecture/decisions/0001-gameplay-layering.md。
 */

/** 按 turn.active 取当前行动玩家；找不到时回退第一个玩家 */
export function getCurrentPlayer(state: BattleState): BattlePlayer | undefined {
    return state.players.find((p) => p.id === state.turn.active) ?? state.players[0];
}

/** 当前行动方是否为人方（controller === 'human'） */
export function isHumanTurn(state: BattleState): boolean {
    return getCurrentPlayer(state)?.controller === 'human';
}

/** 某玩家的单位 */
export function getUnitsByOwner(state: BattleState, owner: string): BattleUnit[] {
    return state.units.filter((u) => u.owner === owner);
}

/** 某玩家的存活单位（hp 未定义视为存活） */
export function getAliveUnitsByOwner(state: BattleState, owner: string): BattleUnit[] {
    return getUnitsByOwner(state, owner).filter((u) => (u.hp ?? 1) > 0);
}

/** 回合开始时重置当前行动方各单位的行动标记 */
export function resetTurn(state: BattleState): void {
    const active = state.turn.active;
    state.units.forEach((u) => {
        if (u.owner === active) {
            u.actedThisTurn = false;
        }
    });
}

/** 推进到下一个玩家；order 走完一圈则进入下一轮（round + 1）。无 order 时不推进 */
export function advanceTurn(state: BattleState): void {
    const order = state.turn.order;
    if (order.length === 0) {
        return;
    }
    const index = order.indexOf(state.turn.active);
    const next = (index + 1) % order.length;
    state.turn.active = order[next];
    if (next === 0) {
        state.turn.round += 1;
    }
}

/**
 * 将单位移动到目标格（落子规则唯一入口：先校验再改状态；视图更新由协调者驱动）。
 * 校验：单位存在、目标在界内、目标格无己方单位（吃子/攻击是下一功能）。
 * 可走性（是否在 computeReachableCells 结果内）由调用方保证：高亮即许可。
 * 返回是否成功。
 */
export function moveUnitTo(state: BattleState, unitId: string, x: number, y: number): boolean {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) {
        return false;
    }
    if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
        return false;
    }
    const occupant = state.units.find((u) => u.pos.x === x && u.pos.y === y);
    if (occupant && occupant.owner === unit.owner) {
        return false;
    }
    unit.pos = { x, y };
    return true;
}

/**
 * 近战攻击判定（落子规则唯一入口：先校验再改状态；视图更新由协调者驱动）。
 * 校验：攻守双方存在、目标格为敌方单位、攻击方定义存在。
 * 攻击范围（是否在攻击目标高亮内）由调用方保证：高亮即许可（与 moveUnitTo 同约定）。
 * 伤害 = 攻击方 attack；目标 hp ≤ 0 时阵亡，直接移出战局（视图销毁由协调者驱动；
 * 全灭结算由 checkOutcome 在回合开始时判定）。
 * 本函数阵营无关：我方/AI 走同一入口，AI 攻击是后续 decideAiMove 的扩展点。
 */
export function attackUnit(state: BattleState, attackerId: string, x: number, y: number, defs: UnitDef[]): boolean {
    const attacker = state.units.find((u) => u.id === attackerId);
    if (!attacker) {
        return false;
    }
    const defender = state.units.find((u) => u.pos.x === x && u.pos.y === y);
    if (!defender || defender.owner === attacker.owner) {
        return false;
    }
    const atkDef = getUnitDef(defs, attacker.defId);
    if (!atkDef) {
        return false;
    }
    const defDef = getUnitDef(defs, defender.defId);
    defender.hp = (defender.hp ?? defDef?.maxHp ?? 1) - atkDef.attack;
    if (defender.hp <= 0) {
        state.units.splice(state.units.indexOf(defender), 1);
    }
    return true;
}

/**
 * 胜负判定（M0）：依据 rules.params
 * - eliminateAllEnemies / loseAllUnits：某玩家阵营无存活单位 → 该玩家失败，其存活对手获胜
 * - maxRounds：超过上限 → 平局（无胜者）
 * 战局继续时返回 null。
 */
export function checkOutcome(state: BattleState): { winner: string; reason: string } | null {
    const players = state.players;
    for (const player of players) {
        if (getAliveUnitsByOwner(state, player.id).length === 0) {
            const survivor = players.find(
                (other) => other.id !== player.id && getAliveUnitsByOwner(state, other.id).length > 0,
            );
            if (survivor) {
                return { winner: survivor.id, reason: `${player.id} 全灭` };
            }
        }
    }

    const maxRounds = state.rules.params.maxRounds;
    if (maxRounds !== undefined && state.turn.round > maxRounds) {
        return { winner: '', reason: `达到最大回合 ${maxRounds}` };
    }
    return null;
}
