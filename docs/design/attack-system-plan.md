# 攻击系统开发方案（M0：近战攻击）

- **状态**：已实施，基础流程（灰范围/红目标/扣血/击杀/受击抖动）已通过用户 Preview 自测
- **关联**：[棋子交互方案](./unit-interaction-plan.md) · [敌方 AI 方案](./enemy-ai-plan.md) · [ADR-0001](../architecture/decisions/0001-gameplay-layering.md)

## 1. 目标与范围边界

**做**：选中我方棋子 → 「行动」旁多一个「攻击」按钮 → 点攻击 → 可攻击范围**红色高亮**（= 有敌方棋子的格）→ 点红格 → 攻击判定、敌方扣血、受击棋子抖动 → 回 idle；**hp ≤ 0 时阵亡**：从 state 移除 + 销毁视图节点。

**不做**：AI 攻击（本期；扩展点已留，见 §7）、伤害数字/攻击者前扑/音效、攻击次数限制、独立远程攻击距离。

## 2. 决策记录（含用户拍板）

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 攻击范围定义 | 复用 `computeReachableCells` 的 `capture` 格（**零新增 Core 遍历代码**）；当前数据下 = 四向相邻敌棋。将来远程/炮（隔子打）再加独立 `attackSpecs`，互不影响 |
| 2 | 攻击力数值 | `UnitDef.attack` 从可选改**必填**（`requireNumber` 校验，缺失即 parse 报错）。`unit-defs.json` 已有 `attack: 10`，数据零改动；无独立格式文档，契约以本文档 + UnitDefs 注释为准 |
| 3 | **死亡处理（用户拍板）** | hp ≤ 0 时 `attackUnit` 内直接从 `state.units` 移除；协调者检测到目标消失后调 `UnitBuilder.removeUnitView` 销毁节点。全灭结算由既有 `checkOutcome` 在回合开始时判定，零新增结算代码 |
| 4 | **AI 攻击扩展性（用户要求）** | `attackUnit` 阵营无关（我方/AI 同一入口），校验只看"目标是敌方"；AI 攻击后续只改 `decideAiMove`（见 §7），交互/规则/视图层不用动 |
| 5 | 状态机扩展 | 不新增交互阶段：加 `targetingMode: 'move' \| 'attack'` 字段；取消/点格/清高亮逻辑两个模式共用 |
| 6 | 攻击高亮 | `MoveHighlighter.show(groups)` 分组多色：**红**（有敌棋的格，可点攻击）+ **灰**（范围空格，仅示意不可点）——无目标时也有可见反馈，避免"像没反应"；颜色在 GameManager `@property attackHighlightColor（红）/ attackRangeHighlightColor（灰）` |
| 7 | 抖动 | `UnitBuilder.shakeUnitView`：水平 x 衰减抖动（约 0.2s），振幅 `@property shakeAmplitude = 6`；`moveUnitView` 补 `Tween.stopAllByTarget` 防 tween 叠加冲突（攻击后立刻移动同一棋子的真实场景） |
| 8 | 攻击后状态 | 回 idle（与移动一致，本期无次数限制）；伤害 = 攻击方 `attack`，无防御属性 |

## 3. 交互状态机

```
idle ──点我方棋子──▶ selected（「行动」+「攻击」两按钮）
selected ──点「行动」──▶ targeting(move)：蓝色高亮可走格 ──点可走格──▶ 移动 ──▶ idle
selected ──点「攻击」──▶ targeting(attack)：红色高亮有敌棋的格 + 灰色高亮范围空格
                            ├──点红格──▶ 扣血（hp≤0 则阵亡移除+销毁视图，否则抖动）──▶ idle
                            ├──点「取消」──▶ selected（与 move 共用）
                            └──范围内无敌棋：日志提示，保持 selected
任何 targeting 中：点空白 / 回合切换 ──▶ idle（清高亮清模式）
```

- 攻击目标点击 = 点红格（targeting 阶段棋子命中已禁用，与移动一致）
- 校验分层与移动完全对称：**可打性由调用方保证（高亮即许可）**，`Rules.attackUnit` 复核存在性/阵营/攻击方定义后扣血

## 4. 模块改动

| 模块 | 内容 |
| --- | --- |
| `Core/UnitDefs.ts` | `attack: number` 必填化（接口 + parse） |
| `Core/Rules.ts` | `attackUnit(state, attackerId, x, y, defs): boolean`——扣血 + 阵亡移除（阵营无关） |
| `Map/MoveHighlighter.ts` | `show` 加 `fillColorOverride?` 参数 |
| `Unit/UnitBuilder.ts` | `shakeUnitView` / `removeUnitView` + `shakeAmplitude` 属性 + `moveUnitView` 停旧 tween |
| `GameManager.ts` | `attackButton` / `attackHighlightColor` / `attackRangeHighlightColor` 属性、`targetingMode` 字段、`onAttackClicked`（灰范围+红目标分组高亮）、`executeAttack`、`onTileClicked` 按 mode 分支、`isUiTap`/按钮显隐/缺失警告纳入攻击按钮 |
| `Core/UnitInfo.ts` / `UI/UnitInfoPanel.ts` | `attack` 跟随必填化，面板无条件显示攻击力 |

**场景接线（人工）**：Canvas 下建「攻击」按钮（放「行动」旁边），拖到 GameManager 的 `attackButton`。仅此一项。

## 5. Acceptance Criteria

1. 选中我方棋子同时出现「行动」「攻击」；敌方回合/未选中时不出现
2. 点「攻击」→ 空格灰高亮 + 相邻敌棋格红高亮（两组同屏）；无目标时仅灰高亮并提示、可取消；完全被围死才不显示且保持选中
3. 点红格 → 敌棋 hp −10（日志）+ 抖动 + 回 idle；连续攻击持续扣血
4. hp ≤ 0 → 棋子从棋盘消失（视图销毁）；若某方全灭 → 下回合开始触发胜负结算
5. 「取消」/点空白/回合切换对两种 targeting 均正确收敛
6. 攻击不改变攻击方位置；信息面板可核对最新 hp；AI 回合仍只移动；类型检查通过

## 6. Playtest 方法

1. u1 选中 → 攻击 → 打相邻 u4：扣血 + 抖动；连打 3 次 hp 累减（100→90→80→70）
2. **击杀链路**：临时把 `unit-defs.json` 的 `attack` 改成 `100` → 一次攻击击杀 → 棋子消失、日志「击杀」；把某方 3 枚全灭 → 下回合开始「全灭」结算 → 测完改回 10
3. 攻击后立刻选中同一棋子移动：验证抖动/移动 tween 不冲突
4. 走到无相邻敌棋的位置 → 攻击 → 出现灰色范围高亮（无红色）、日志提示 → 点灰格无反应 → 取消退出
5. 「取消」、点空白、结束回合三条退出路径各走一遍
6. 点敌棋看信息面板：hp 与攻击结果一致

## 7. 后续扩展点

- **AI 攻击**（已预留）：`AiAction` 加 `type: 'move' | 'attack'`，`decideAiMove` 在随机策略中加入攻击候选（capture 格）；执行层 `runEnemyTurn` 按 type 分派 `moveUnitTo` / `attackUnit`——规则与视图层零改动
- 远程/炮：`attackSpecs` 独立配置（隔子打 passage='screen' 的目标选择与移动不同源时才需要）
- 表现：攻击者前扑、伤害数字、命中音效、阵亡淡出

## 8. 风险与已知占位

- 点红格判定沿用现有拾取链路（已知待办：顶面中心修正未收口，点格子偏上半会命中后一格）
- 阵亡销毁是即时 destroy（无淡出表现，属后续打磨）
- `attack` 必填化对旧数据是破坏性变更：仓库内所有战局/定义数据已合规；外部若有关卡 JSON 需补 `attack` 字段（parse 会明确报错指出路径）
