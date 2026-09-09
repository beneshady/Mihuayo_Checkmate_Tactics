# 棋子信息面板开发方案（M0：占位 UI）

- **状态**：已实施，基础流程（任意回合查看信息/仅我方回合可操作）已通过用户 Preview 自测
- **关联**：[棋子交互方案](./unit-interaction-plan.md) · [游戏流程控制](./game-flow-plan.md) · [ADR-0001](../architecture/decisions/0001-gameplay-layering.md)

## 1. 目标与交互设计

**目标**：点击任意棋子（我方/敌方）显示信息面板（M0 占位：单个多行 Label）；操作按钮仍仅我方回合出现。

**查看与操作解耦**（权限矩阵）：

| 阶段 | 点棋子 | 点格子/空白 | 按钮 |
| --- | --- | --- | --- |
| 我方回合 | 信息 +（我方棋子）选中 | 原有交互逻辑 | 按交互态显示 |
| 敌方回合 | 只显示信息 | 收起面板 | 全部隐藏（现有逻辑） |
| generating / ended | 不响应 | 不响应 | 隐藏 |

**隐藏规则统一**：任何非棋子点击，只要不在 targeting 态一律收起面板；targeting 期间保留（点非可走格忽略的决策不变）；回合切换经 `cancelSelection` 收起。

**选中与查看是两个独立关注点**：敌方棋子点击不触发选中（无「行动」按钮），也不影响当前选中态。

## 2. 模块设计（遵循 ADR-0001）

| 模块 | 职责 |
| --- | --- |
| `Core/UnitInfo.ts`（新） | `getUnitInfo(state, unitId, defs): UnitInfo \| null`：名称（`def.name ?? defId`）、阵营（按归属玩家 `controller === 'human'` 判定，未配置视为敌方）、hp/maxHp（`hp` 未定义视为满血，与存活判定 `?? 1` 的口径差异已注释）、attack、位置。纯 TS 零 `cc` 依赖 |
| `UI/UnitInfoPanel.ts`（新） | 哑视图：`show(info)`（拼多行文本 + 显示）/ `hide()`；不取数据不碰 state；`infoLabel` 缺失时 `console.error` 一次并保持隐藏；`start()` 强制开局收起 |
| `GameManager.ts`（改） | `@property unitInfoPanel`（缺失 warn 一次，降级不阻断）；`showUnitInfo/hideUnitInfo`；`onBoardTouchEnd` 守卫拆分 `canOperate/canInspect`；`cancelSelection` / `onBlankClicked` 收起面板 |

`onBoardTouchEnd` 内的调用顺序：先 `onUnitClicked`（内部 `cancelSelection` 会先收起面板）再 `showUnitInfo`，保证改选时面板显示最新点中的棋子。

## 3. 决策记录

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 占位形态 | 单个多行 Label（无背板；正式 UI 换本组件实现，调用方不动） |
| 2 | 显示内容 | 名称、阵营、HP/maxHP、攻击、位置；走法细节省略（moveSpecs 文字化后续做） |
| 3 | 查看时机 | 我方/敌方回合均可；generating/ended 不响应（后续要放开是一句话的改动） |
| 4 | 敌方棋子点击 | 只看信息，不改选中态 |
| 5 | 面板位置 | Canvas 左下角占位（人工接线时定） |

## 4. 场景接线（人工）

1. Canvas 下建节点 `UnitInfoPanel`（建议左下角，避开底部按钮），挂 `UnitInfoPanel` 组件
2. 其子节点建 `Label`（多行文本）拖到面板组件的 `infoLabel`
3. 面板节点拖到 GameManager 的 `unitInfoPanel`
4. 初始显隐不用管（`start()` 会强制收起）

## 5. Acceptance Criteria

1. 我方回合：点我方棋子 → 选中 + 面板显示其信息；点敌方棋子 → 面板显示敌方信息、无「行动」按钮、原选中态不变
2. 敌方回合：点任意棋子 → 面板显示信息（无任何按钮）；点格子/空白 → 面板收起
3. 我方回合点空白/完成移动 → 面板收起；targeting 期间面板保留
4. 数据来自 state + defs：改 `unit-defs.json` 的 name/attack 面板随之变化
5. Core 零 `cc` 依赖；面板为哑视图；未配置面板时功能降级并 warn 一次

## 6. Playtest 方法

1. 我方回合：点 u1 → 面板「【兵】（我方）」+ 属性；点敌方 u4 → 面板切敌方信息且「行动」按钮未出现
2. 点空白 → 面板收起；选中 u2 → 行动 → targeting 期间面板保留 → 点可走格移动 → 面板收起
3. 点「结束回合」→ 敌方回合内点任意棋子 → 面板正常显示；点空白收起；AI 行动后回我方一切如常
4. 改 `unit-defs.json` 中 soldier 的 name → 面板名称随之变化

## 7. 风险与后续

- 面板与底部按钮重叠：接线时放左下角规避
- `hp` 口径（`?? maxHp` vs 存活 `?? 1`）已注释说明；M0 数据不受影响
- 占位面板无触摸阻挡处理：点中面板区域视同棋盘点击（M0 可接受；正式 UI 加 `BlockInputEvents`）
- 后续：背板/头像/血条等正式 UI 替换 `UnitInfoPanel` 实现即可；moveSpecs 文字化给 `UnitInfo` 加字段
