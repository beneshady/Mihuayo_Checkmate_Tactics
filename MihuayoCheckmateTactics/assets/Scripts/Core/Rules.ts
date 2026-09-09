import { BattleCondition, BattlePlayer, BattleState, BattleUnit } from './BattleState';
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

/** 回合开始时重置当前行动方各单位：行动标记清零、体力回满 */
export function resetTurn(state: BattleState, defs: UnitDef[]): void {
    const active = state.turn.active;
    state.units.forEach((u) => {
        if (u.owner !== active) {
            return;
        }
        u.actedThisTurn = false;
        const def = getUnitDef(defs, u.defId);
        if (def) {
            u.stamina = def.maxStamina;
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
 * 校验：单位与定义存在、目标在界内、目标格无己方单位、体力足够。
 * 可走性（是否在 computeReachableCells 结果内）由调用方保证：高亮即许可。
 * 成功时扣减 def.moveCost（缺省 1）点体力。返回是否成功。
 */
export function moveUnitTo(state: BattleState, unitId: string, x: number, y: number, defs: UnitDef[]): boolean {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) {
        return false;
    }
    const def = getUnitDef(defs, unit.defId);
    if (!def) {
        return false;
    }
    const cost = def.moveCost ?? 1;
    if ((unit.stamina ?? def.maxStamina) < cost) {
        return false; // 体力不足
    }
    if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
        return false;
    }
    const occupant = state.units.find((u) => u.pos.x === x && u.pos.y === y);
    if (occupant && occupant.owner === unit.owner) {
        return false;
    }
    unit.pos = { x, y };
    unit.stamina = (unit.stamina ?? def.maxStamina) - cost;
    return true;
}

/**
 * 近战攻击判定（落子规则唯一入口：先校验再改状态；视图更新由协调者驱动）。
 * 校验：攻守双方存在、目标格为敌方单位、攻击方定义存在、攻击方体力足够。
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
    const cost = atkDef.attackCost ?? 1;
    if ((attacker.stamina ?? atkDef.maxStamina) < cost) {
        return false; // 体力不足
    }
    const defDef = getUnitDef(defs, defender.defId);
    attacker.stamina = (attacker.stamina ?? atkDef.maxStamina) - cost;
    defender.hp = (defender.hp ?? defDef?.maxHp ?? 1) - atkDef.attack;
    if (defender.hp <= 0) {
        state.units.splice(state.units.indexOf(defender), 1);
    }
    return true;
}

/**
 * 胜负判定（M1）：按 rules.params 的条件逐条判定，双方对称——
 * 任一方的「败北条件」达成即判负，其存活对手获胜（win/lose 两组条件都参与败北判定）：
 * - eliminateAllEnemies / loseAllUnits：该玩家无存活单位
 * - eliminateDef（defId）：该玩家没有存活的该 defId 单位（如"击杀帅即胜"）
 * - maxRounds：超过上限 → 平局（无胜者）
 * 战局继续时返回 null。
 */
export function checkOutcome(state: BattleState): { winner: string; reason: string } | null {
    const players = state.players;
    const params = state.rules.params;
    const defeatConditions: BattleCondition[] = [...(params.winConditions ?? []), ...(params.loseConditions ?? [])];
    for (const player of players) {
        for (const condition of defeatConditions) {
            const reason = defeatReason(state, player.id, condition);
            if (!reason) {
                continue;
            }
            const survivor = players.find(
                (other) => other.id !== player.id && getAliveUnitsByOwner(state, other.id).length > 0,
            );
            if (survivor) {
                return { winner: survivor.id, reason };
            }
        }
    }

    const maxRounds = params.maxRounds;
    if (maxRounds !== undefined && state.turn.round > maxRounds) {
        return { winner: '', reason: `达到最大回合 ${maxRounds}` };
    }
    return null;
}

/** 单个玩家是否达成某个败北条件；未达成返回 null */
function defeatReason(state: BattleState, playerId: string, condition: BattleCondition): string | null {
    if (condition.type === 'eliminateAllEnemies' || condition.type === 'loseAllUnits') {
        return getAliveUnitsByOwner(state, playerId).length === 0 ? `${playerId} 全灭` : null;
    }
    if (condition.type === 'eliminateDef' && condition.defId) {
        const hasAlive = getUnitsByOwner(state, playerId).some(
            (u) => u.defId === condition.defId && (u.hp ?? 1) > 0,
        );
        return hasAlive ? null : `${playerId} 的 ${condition.defId} 阵亡`;
    }
    return null; // 未知条件类型忽略：数据可先于代码出现
}
