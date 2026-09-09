# 游戏流程控制开发方案（M0）

- **状态**：待实施（先确认 §3 开放决策后再开工）
- **关联**：[战局数据格式](./battle-state-format.md) · [地图生成方案](./map-generation-plan.md) · [ADR-0001 游戏逻辑分层](../architecture/decisions/0001-gameplay-layering.md)

## 1. 目标与范围

**目标**：建立 M0 的主循环——**关卡生成 → （我方回合 ↔ 敌方回合 循环）→ 胜负结束**，让整局能跑通、可操作、能结束。

**本方案只做「流程层」**；具体操作（移动/攻击规则）是下一个功能，本方案为其预留**清晰、可替换的接入点**。

**明确不做**（本次）：移动/攻击的具体规则、AI 决策算法、存档读档、Result 界面美化（M0 可先用日志/简单提示）、微信真机。

## 2. 流程定义（已确定）

```
[生成关卡 生成]（地图+棋子，已有）
      ↓ 生成完成
[我方回合] ──点「结束回合」──▶ [敌方回合]
      ▲                          │
      └──── 敌方操作完成 ────────┘（order 走完一圈 → round+1）
      │
      ▼ （任一时刻满足 JSON 定义的条件）
[胜利 / 失败 · 结束]
```

- 回合粒度为**玩家级**：`turn.order=["p1","p2"]`，`controller='human'` → 我方、`'ai'` → 敌方。
- 我方回合内：玩家可操作自己的棋子（具体模型见 §3）。
- **结束回合按钮**：仅在我方回合可点击，点击后进入敌方回合。
- 敌方回合：AI 执行操作（与我方规则一致），执行完自动回我方回合。
- **全局结束判定**：按 JSON `rules.params`（eliminateAllEnemies / loseAllUnits / maxRounds）在任何时刻满足即结束。

## 3. 开放决策（TBD，需定）

| # | 决策 | 选项 | 建议 |
| --- | --- | --- | --- |
| 1 | **我方回合操作模型** | A. 每回合每个我方棋子各可操作一次（`actedThisTurn` 已预留）；B. 消耗行动点（需加 `actionPoints` 字段）；C. 一回合只操作一个棋子 | **A**（最典型 SRPG，数据模型已就绪；流程层做成可替换，改 B/C 只换一个检查函数） |
| 2 | **敌方 AI 行为** | 与我方规则一致，具体决策算法 | M0 先**占位**（进入敌方回合后短暂延迟自动结束），真实 AI 后续接入 |
| 3 | **结束回合按钮 UI** | Canvas 下一枚按钮 | 仅在 `stage==='playerTurn'` 时可点；敌方回合禁用/隐藏 |
| 4 | **胜负结束表现** | Result 界面 / 仅日志提示 | M0 先**日志 + 简单**提示（复用现有标记），界面后续 |

> 决策 1 是流程层唯一有实质影响的岔路：它会决定「我方回合何时算『操作完了』」。流程状态机本身与它解耦（见 §5.5），所以可以先按推荐值 A 开工，后续可换。

## 4. 架构（遵循 ADR-0001）

```
Core（纯 TS，零 cc）：规则 + 流程判定
  └─ Rules.ts        getCurrentPlayer / isHumanTurn / getAliveUnitsByOwner /
                     resetTurn / advanceTurn / checkOutcome / （行动模型检查 canStillAct）
GameManager（薄协调者）：流程状态机 driving 各阶段
  └─ FlowStage: generating → playerTurn → enemyTurn → ended
     方法: beginFlow / enterTurn / endCurrentTurn（由按钮/AI触发） / enterEnded
视图（哑）：
  └─ TurnEndButton（结束回合按钮，仅我方回合可点）
  └─ 敌方 AI 占位（enemyTurn 的延迟自动结束；决策模块后续）
```

## 5. 模块设计

### 5.1 `Scripts/Core/Rules.ts`（纯 TS，0 依赖 cc）
- `getCurrentPlayer(state)`：按 `turn.active` 取玩家。
- `isHumanTurn(state)`：当前是否为 human 控制。
- `getAliveUnitsByOwner(state, owner)`：存活单位（全灭判定用）。
- `resetTurn(state)`：回合开始重置当前行动方 `actedThisTurn`。
- `advanceTurn(state)`：推进到 `order` 下一方，周满 `round+1`。
- `checkOutcome(state)`：按 `rules.params` 判定（全灭/回合上限），返回 `{winner, reason}|null`。
- `canStillAct(state)`：**操作模型的唯一可替换点**——返回「当前行动方是否还能操作」。按推荐 A 实现为「该方还有未行动单位」；换 B/C 只需改这里。
- （移动/攻击的 `try*` 规则属下一功能，不在本方案）

### 5.2 `Scripts/GameManager.ts`（流程状态机）
```
type FlowStage = 'generating' | 'playerTurn' | 'enemyTurn' | 'ended'
```
- `start()`：解析 → 生成地图/棋子（完成回调）→ `beginFlow()`。
- `beginFlow()`：进入首个行动方回合。
- `enterTurn()`：先 `checkOutcome`（结束则 `enterEnded`）→ 解锁当前方（`resetTurn`）→ 设 `stage` 为 playerTurn 或 enemyTurn。
  - `playerTurn`：**等待**玩家操作；当 `canStillAct` 为 false 或玩家主动结束 → `endCurrentTurn()`。
  - `enemyTurn`：**占位**（AI 未接入）→ `scheduleOnce(结束回合, aiDelay)`；AI 决策模块后续替换。
- `endCurrentTurn()`（公开，供按钮/AI 调用）：`advanceTurn` → `enterTurn`。
- `enterEnded(outcome)`：写入 `state.result`，stage=ended，发出结束表现（日志/提示）。

### 5.3 `Scripts/TurnEndButton.ts`（结束回合按钮组件）
- 持有 `GameManager` 引用；仅在 `stage==='playerTurn'` 时 `interactable=true`（其它阶段禁用/隐藏）。
- 点击 → `gameManager.endCurrentTurn()`。
- 通过编辑器桥/手动在 Canvas 下建按钮节点并挂组件；事件绑定到 GameManager。

### 5.4 敌方回合占位
- `enemyTurn` 阶段用一个可调延迟（如 `aiDelay=0.8s`）自动结束，作为 AI 决策的占位；真实 AI（Core+GameManager）后续接入同一 `endCurrentTurn()` 出口。**M0 已实施**：见[敌方 AI 方案](./enemy-ai-plan.md)（随机走一步）。

### 5.5 操作模型的可替换性
- 流程层只依赖 `canStillAct(state)` 这一个检查，以及「玩家/`AI` 何时调用 `endCurrentTurn`」。
- 因此 A/B/C 三种模型、以及 AI 决策，都不需要改流程状态机主体——只改 `canStillAct` 实现 + 谁触发 `endCurrentTurn`。这是本方案的关键设计。

## 6. 数据模型影响

- 现有 `turn {round, order, active, phase}`、`units[].actedThisTurn`、`rules.params.maxRounds/winConditions/loseConditions`、`result` 均**够用**。
- 仅当选 **B（行动点）** 时，需在 `turn` 或 `players` 增加 `actionPoints`/`maxActionPoints` 字段（并同步 `battle-state-format.md` 与 `BattleState.ts` 类型）。
- 选 A 或 C 无需改格式。

## 7. 实施步骤（Plan → Implement → Verify）

| # | 步骤 | 说明 |
| --- | --- | --- |
| 1 | `Core/Rules.ts` | 纯规则函数 + `canStillAct` |
| 2 | `GameManager` 流程状态机 | generating→playerTurn→enemyTurn→ended；敌方占位自动推进 |
| 3 | `TurnEndButton` | 结束时按钮，仅我方回合可点 |
| 4 | 结束判定接入 | `checkOutcome` 在每回合开始 + 每次行动后调用；`enterEnded` 更新 result |
| 5 | Preview 验证 | 我方回合→点按钮→敌方回合→循环；验证结束分支 |
| 6 | 记录 Playtest 方法 | PR 描述 |

## 8. Acceptance Criteria

1. 关卡生成完成后自动进入我方回合。
2. 我方回合可点「结束回合」→ 进入敌方回合；敌方回合该按钮不可用。
3. 敌方回合（占位）结束后自动回到我方，`round` 按 `order` 推进。
4. 满足 JSON 结束条件（全灭 / `maxRounds`）→ 进入 `ended`，`state.result` 更新，有明确表现（日志/提示）。
5. 操作模型（A/B/C）通过替换 `canStillAct` 即可切换，流程状态机主体不改。
6. 纯逻辑（Rules）零 `cc` 依赖。

## 9. 风险与未知

- **操作模型未定**（§3-1）是唯一会影响数据与行为的项；推荐 A，流程层已解耦，更换成本低。
- **AI 决策未定**（§3-2），M0 用占位；真实 AI 需单独设计（与敌方操作模型一致）。
- 结束按钮的 UI 与事件绑定需在编辑器桥/手动方式下完成（组件引用无法经桥赋值）。
- 边界：某玩家开局即无单位（全灭）时 `checkOutcome` 会直接判负——需与策划确认是否允许（示例数据双方各有 3 单位，不受影响）。
