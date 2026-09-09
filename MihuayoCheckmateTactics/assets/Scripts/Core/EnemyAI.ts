import { BattleState, BattleUnit, GridPos } from './BattleState';
import { computeReachableCells } from './movement';
import { aiRandomInt } from './Rng';
import { getAliveUnitsByOwner, getCurrentPlayer } from './Rules';
import { UnitDef, getUnitDef } from './UnitDefs';

/**
 * 敌方 AI（纯 TS，零引擎依赖）。
 * M1 策略：贪心步进——每步在「全部合法动作」（攻击目标 / 能拉近的移动格）里选评分最高者，
 * 同分用战局种子随机挑；无正收益动作时返回 null，由协调者结束敌方回合。
 * 体力由 Rules 在执行时扣减，下一步枚举自然只剩体力足够的单位（每棋子每回合可用满体力）。
 * 攻击候选完全来自走法引擎 attack 模式（炮架/马腿/象眼/入水限制均已算好），AI 零特判。
 * 参见 docs/design/enemy-ai-plan.md。
 */

/** AI 一步动作（由协调者调 Rules 执行，再投影视图）；reason 供日志解释决策 */
export interface AiAction {
    type: 'move' | 'attack';
    unitId: string;
    to: GridPos;
    reason: string;
}

// ---- 评分常量（调手感改这里） ----
/** 击杀基础分：远高于任何伤害/移动分，保证"有得杀必杀" */
const KILL_SCORE = 1000;
/** 击杀分里按目标攻击力的加成权重（威胁优先：先杀输出高的） */
const KILL_THREAT_WEIGHT = 2;
/** 非击杀攻击：按可造成伤害计分的权重 */
const DAMAGE_WEIGHT = 2;
/** 移动分随机扰动上限：aiRandomInt(state, 2) ∈ {0,1}，让同距走位不死板 */
const MOVE_JITTER_BOUND = 2;

/** 同一 defId 只警告一次，避免多棋子刷屏 */
const warnedDefIds = new Set<string>();

function manhattan(a: GridPos, b: GridPos): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 对行动方而言的敌方存活单位（owner 不同的全部存活棋子） */
function enemiesOf(state: BattleState, ownerId: string): BattleUnit[] {
    return state.units.filter((u) => u.owner !== ownerId && (u.hp ?? 1) > 0);
}

/** 到最近敌方单位的曼哈顿距离；无敌方时返回 null */
function distanceToNearestEnemy(pos: GridPos, enemies: BattleUnit[]): number | null {
    let best: number | null = null;
    for (const enemy of enemies) {
        const d = manhattan(pos, enemy.pos);
        if (best === null || d < best) {
            best = d;
        }
    }
    return best;
}

interface Candidate {
    action: AiAction;
    score: number;
}

/**
 * 决策当前行动方（AI）的下一步动作；无可为动作时返回 null。
 * 评分优先级：攻击-击杀 > 攻击-伤害 > 移动-逼近（只保留严格拉近的格子，天然收敛不踱步）；
 * 无定义、体力不足、被围死、无可打目标的棋子自然出局（帅无动作即跳过）。
 */
export function decideAiAction(state: BattleState, defs: UnitDef[]): AiAction | null {
    const player = getCurrentPlayer(state);
    if (!player) {
        return null;
    }
    const enemies = enemiesOf(state, player.id);
    if (enemies.length === 0) {
        return null; // 没有对手：无可为动作
    }

    const candidates: Candidate[] = [];
    for (const unit of getAliveUnitsByOwner(state, player.id)) {
        const def = getUnitDef(defs, unit.defId);
        if (!def) {
            if (!warnedDefIds.has(unit.defId)) {
                warnedDefIds.add(unit.defId);
                console.warn(`[EnemyAI] 棋子定义缺失："${unit.defId}"，该棋子跳过 AI 行动`);
            }
            continue;
        }
        const stamina = unit.stamina ?? def.maxStamina;

        // 攻击候选：走法引擎 attack 模式的 capture 格
        if (stamina >= (def.attackCost ?? 1)) {
            for (const cell of computeReachableCells(state, unit, def, 'attack')) {
                if (!cell.capture) {
                    continue;
                }
                const target = state.units.find((u) => u.pos.x === cell.x && u.pos.y === cell.y);
                if (!target) {
                    continue;
                }
                const targetDef = getUnitDef(defs, target.defId);
                const targetHp = target.hp ?? targetDef?.maxHp ?? 1;
                const targetAtk = targetDef?.attack ?? 0;
                if (targetHp <= def.attack) {
                    candidates.push({
                        action: {
                            type: 'attack',
                            unitId: unit.id,
                            to: { x: cell.x, y: cell.y },
                            reason: `可击杀 ${target.id}（威胁 ${targetAtk}）`,
                        },
                        score: KILL_SCORE + targetAtk * KILL_THREAT_WEIGHT,
                    });
                } else {
                    const damage = Math.min(targetHp, def.attack);
                    candidates.push({
                        action: {
                            type: 'attack',
                            unitId: unit.id,
                            to: { x: cell.x, y: cell.y },
                            reason: `输出 ${damage} → ${target.id}`,
                        },
                        score: damage * DAMAGE_WEIGHT,
                    });
                }
            }
        }

        // 移动候选：只保留「严格拉近与最近敌人距离」的空格（距离严格递减，绝不来回踱步）
        if (stamina >= (def.moveCost ?? 1)) {
            const currentDist = distanceToNearestEnemy(unit.pos, enemies);
            if (currentDist !== null && currentDist > 1) {
                for (const cell of computeReachableCells(state, unit, def, 'move')) {
                    if (cell.capture) {
                        continue;
                    }
                    const d = distanceToNearestEnemy({ x: cell.x, y: cell.y }, enemies);
                    if (d === null || d >= currentDist) {
                        continue;
                    }
                    candidates.push({
                        action: {
                            type: 'move',
                            unitId: unit.id,
                            to: { x: cell.x, y: cell.y },
                            reason: `逼近（距离 ${currentDist}→${d}）`,
                        },
                        score: -d + aiRandomInt(state, MOVE_JITTER_BOUND),
                    });
                }
            }
        }
    }

    if (candidates.length === 0) {
        return null;
    }
    let best = -Infinity;
    for (const candidate of candidates) {
        if (candidate.score > best) {
            best = candidate.score;
        }
    }
    const top = candidates.filter((candidate) => candidate.score === best);
    return top[aiRandomInt(state, top.length)].action;
}
