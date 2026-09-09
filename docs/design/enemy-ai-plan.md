# 敌方 AI 开发方案（M1：贪心步进）

- **状态**：已实施，类型检查通过，待用户 Preview 自测
- **关联**：[游戏流程控制](./game-flow-plan.md) · [地形与兵种方案](./terrain-units-plan.md) · [ADR-0001](../architecture/decisions/0001-gameplay-layering.md)
- **演进**：M0 版（随机走一步）已通过自测；本版按体力/攻击规则升级为 L1 贪心步进

## 1. 策略定位

| 等级 | 思路 | 结论 |
| --- | --- | --- |
| L0 纯随机 | M0 已实施 | 不攻击、不利用体力，已淘汰 |
| **L1 贪心步进（本版）** | 每步在全部合法动作里选评分最高者，循环到无可为 | 7v7 候选量 ~200/步，纯 TS 同步计算无压力；行为可解释、常量可调 |
| L2 前瞻/极小极大 | 模拟对手回应 | 未做，升级点（只改 EnemyAI.ts 内部） |

## 2. 核心机制：一步一动，循环到耗尽

```
enterTurn（enemyTurn 分支）→ runEnemyTurn（清零步数）
    → performEnemyStep():
        action = decideAiAction(state, defs)     // Core 纯函数：全局最优一步
        null   → 等 enemySettleDelay → endCurrentTurn
        action → attack: applyAttack（玩家/AI 共用）/ move: moveUnitTo + moveUnitView
        → checkOutcome：有结果直接 enterEnded（AI 中途打完收工）
        → 等 max(aiDelay, unitMoveDuration + 0.05) → 下一performEnemyStep
```

- **体力用满**：每步由 Rules 扣体力，下一步枚举自然只剩体力够的单位——每棋子每回合最多 2 动（如 移动+攻击）。这与体力规则的设计意图一致。
- **终止保险**：`MAX_ENEMY_STEPS = 40`（≈ 全员体力总和），超限 warn 强制结束；决策逐步执行、串行 `scheduleOnce`，无竞态。
- 敌方回合交互禁用沿用现有守卫（`onBoardTouchEnd` 仅 `playerTurn` 可操作）；决策与动画之间天然串行。

## 3. 决策：候选枚举 + 评分

对每个体力足够的存活棋子枚举两类候选，全局取最高分（同分 seeded rng 随机挑）：

| 候选 | 来源 | 评分 |
| --- | --- | --- |
| 攻击-击杀 | `computeReachableCells(..., 'attack')` 的 capture 格 | `1000 + 目标攻击力×2`（威胁优先） |
| 攻击-伤害 | 同上 | `min(目标hp, attack) × 2` |
| 移动-逼近 | move 模式空格中**严格拉近**与最近敌人曼哈顿距离的格子 | `-新距离 + 随机扰动(0~1)` |
| （无正收益） | 不生成候选 | 贴脸无可打/被围死 → 该棋子本轮停手 |

- 攻击分（≥70）恒大于移动分（≤0）：**有得打必打**；距离严格递减：**不能拉近就不走**，天然收敛、绝不踱步。
- 攻击候选完全来自走法引擎 attack 模式——炮架/马腿/象眼/入水限制 AI 零特判；帅（空 spec）自动出局。
- 每步日志带理由：`[AI] u4 攻击 → (5,3)：可击杀 u3（威胁 45）` / `[AI] u4 移动 → (5,3)：逼近（距离 4→3）`。
- 评分常量收口在 `EnemyAI.ts` 顶部（KILL_SCORE / KILL_THREAT_WEIGHT / DAMAGE_WEIGHT / MOVE_JITTER_BOUND），调手感改数字即可。

## 4. 模块与契约（遵循 ADR-0001）

| 模块 | 职责 |
| --- | --- |
| `Core/EnemyAI.ts` | `decideAiAction(state, defs): AiAction \| null`；`AiAction = { type: 'move'\|'attack', unitId, to, reason }`。零 `cc` 依赖；换策略只改本文件 |
| `GameManager.ts` | `runEnemyTurn` → `performEnemyStep` 步进循环；`applyAttack` 从 `executeAttack` 抽出（玩家/AI 共用的攻击表现投影：扣血/抖动/阵亡销毁）；每步后 `checkOutcome` |

`Rules.ts` / `movement.ts` / 视图层 / 场景接线**零改动**——AI 与玩家走完全相同的规则入口。

## 5. Acceptance Criteria

1. 敌方棋子每回合用满体力（兵可走 2 步或走+打），体力不足自动停。
2. 有攻击目标必打：击杀 > 伤害；目标被打死后本回合不再有该目标。
3. AI 击杀我方最后一枚棋子时战局立即结束（不空转到回合末）。
4. 全员 0 体力/无可打/无路可近 → 敌方回合快速结束，无报错、无死循环（步数上限兜底）。
5. 步与步之间移动动画播完（步间隔 ≥ unitMoveDuration）。
6. 纯逻辑零 `cc` 依赖；同 seed 重开局敌方行为序列可复现（seeded rng 平局决策）。

## 6. Playtest 方法

1. 当前编成（我方 车/炮/兵，敌方 兵1）：敌方兵每回合逼近，贴脸转攻击；我方反打 2 下击杀 → 战局立即结束。
2. 观察日志 `[AI]` 每步的理由字段与 `[战斗]` 结果一致。
3. 我方车贴着敌方兵时：敌方兵第 2 步会攻击车而不是发呆。
4. 敌方回合内点棋子/格子：查看信息可用（canInspect），操作无效。
5. 复现性：同 `rng.seed` 重开局，对比 `[AI]` 日志序列一致。

## 7. 已知限制与扩展路径

- **远程单位贴脸待机**：炮/马类棋子若已与敌人相邻（无攻击候选、也无法"严格拉近"）会原地停手。当前编成 AI 侧只有兵（正交近战）不受影响；后续给 AI 上炮/马时，可加"架炮位/马位"setup 候选 + visited 集防振荡（仍只改 EnemyAI.ts）。
- 不做防守/保帅/威胁评估（不躲我方射程）——纯进攻贪心，够 M1。
- 难度分级（保守/标准/激进）未做；评分常量即调节旋钮，需要时加 difficulty 参数透传。
