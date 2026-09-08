import { BattleState, GridPos } from './BattleState';
import { computeReachableCells } from './movement';
import { aiRandomInt } from './Rng';
import { getAliveUnitsByOwner, getCurrentPlayer } from './Rules';
import { UnitDef, getUnitDef } from './UnitDefs';

/**
 * 敌方 AI（纯 TS，零引擎依赖）。
 * M0 策略：随机选一枚有可走格的当前行动方棋子，随机走到其一个可移动空格。
 * 只移动不攻击（capture 格过滤）；后续换策略只改本文件，调用方（GameManager）不动。
 * 参见 docs/design/enemy-ai-plan.md。
 */

export interface AiAction {
    unitId: string;
    to: GridPos;
}

/** 同一 defId 只警告一次，避免多棋子刷屏 */
const warnedDefIds = new Set<string>();

/** 从非空候选里均匀随机取一个（随机状态持久化在战局上） */
function pickRandom<T>(candidates: T[], state: BattleState): T {
    return candidates[aiRandomInt(state, candidates.length)];
}

/**
 * 决策当前行动方的一步行动；全部棋子无可走格时返回 null。
 * 随机洗牌棋子顺序、取第一枚可动者：被围死的棋子自然跳过，且各可动棋子被选概率均等。
 * defId 无定义的棋子跳过并警告（与视图层占位兜底策略一致，不中断回合）。
 */
export function decideAiMove(state: BattleState, defs: UnitDef[]): AiAction | null {
    const player = getCurrentPlayer(state);
    if (!player) {
        return null;
    }

    const units = [...getAliveUnitsByOwner(state, player.id)];
    for (let i = units.length - 1; i > 0; i--) {
        const j = aiRandomInt(state, i + 1);
        [units[i], units[j]] = [units[j], units[i]];
    }

    for (const unit of units) {
        const def = getUnitDef(defs, unit.defId);
        if (!def) {
            if (!warnedDefIds.has(unit.defId)) {
                warnedDefIds.add(unit.defId);
                console.warn(`[EnemyAI] 棋子定义缺失："${unit.defId}"，该棋子跳过 AI 行动`);
            }
            continue;
        }
        const cells = computeReachableCells(state, unit, def).filter((cell) => !cell.capture);
        if (cells.length === 0) {
            continue;
        }
        const target = pickRandom(cells, state);
        return { unitId: unit.id, to: { x: target.x, y: target.y } };
    }
    return null;
}
