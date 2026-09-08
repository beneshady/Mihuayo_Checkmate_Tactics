import { BattleState } from './BattleState';

/**
 * 战局随机数（纯 TS，零引擎依赖）。
 * mulberry32 确定性 PRNG，随机状态持久化在 state.rng = { seed, calls }（战局格式 v1 已预留）：
 * - 同一 seed 的战局，AI 行为序列可复现（调试 / QA）
 * - 存档 = 序列化 state，随机状态随之延续
 * 参见 docs/design/enemy-ai-plan.md。
 */

/** 推进 mulberry32 状态并产出 32 位随机值（状态演进与输出分离，经典实现） */
function advance(seed: number): { seed: number; value: number } {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { seed, value: (t ^ (t >>> 14)) >>> 0 };
}

/**
 * 取 [0, maxExclusive) 的随机整数，并演进战局随机状态。
 * state.rng 缺失时以当前时间初始化并写回（战局 JSON 未给 seed 的兜底）。
 * 调用方保证 maxExclusive >= 1。
 */
export function aiRandomInt(state: BattleState, maxExclusive: number): number {
    if (!state.rng) {
        state.rng = { seed: (Date.now() >>> 0) || 1, calls: 0 };
    }
    const next = advance(state.rng.seed);
    state.rng.seed = next.seed;
    state.rng.calls += 1;
    return next.value % maxExclusive;
}
