# 棋子交互（选中 → 行动 → 移动）开发方案（M0）

- **状态**：代码已实施（M0），场景接线与 Preview 验证待完成（见 §7 步骤 7-8）
- **关联**：[战局数据格式](./battle-state-format.md) · [游戏流程控制](./game-flow-plan.md) · [ADR-0001](../architecture/decisions/0001-gameplay-layering.md)

## 1. 目标与范围

**目标**：在我方回合内，玩家可**点选我方任一棋子** → 出现「行动」按钮 → 点「行动」→ 出现「取消」按钮并**高亮该棋子可走格** → 点一个可走格则移动棋子，点「取消」则回到选中态。让 `soldier`（兵式）真正能走，把 `Core/movement.ts` 的 `computeReachableCells` 接上 UI。

**范围边界**：
- **本期不做限制**（你已明确）：不限制操作次数、不限制哪些棋子、不限制行动点——我方回合可任意操作我方棋子。操作模型（A/B/C）后续再定。
- **不做**：攻击、真实 AI、回合结束后的自动推进逻辑（已有）、存档、多棋子多段选择。

## 2. 交互流程 / 状态机

流程阶段（编排层）在 GameManager，交互另有子状态：

```
交互子状态: idle ──点我方棋子──▶ selected ──点[行动]──▶ targeting ──点可走格──▶ 移动→idle
             ▲                     │  ▲                     │
             │                     │  └── 点[取消]──────────┘
             └── 点空白/别的地方──┘
```

- `idle`：无选中、无按钮。**点我方棋子**（`owner === 当前行动玩家`）→ `selected`。
- `selected`：显示 **[行动]** 按钮。点「行动」→ `targeting`；点另一我方棋子可改选；点空白→ `idle`。
- `targeting`：显示 **[取消]** 按钮 + **高亮可走格**。点一个可走格 → **移动 → `idle`**；点「取消」→ 回 `selected`。
- 仅当 `stage === 'playerTurn'` 时允许这些交互；`enemyTurn`/`ended`/生成阶段禁用（不响应点击）。

## 3. 输入拾取（关键设计点）

**方案：单一触摸处理器 + 逆等距换算**（而非给 80 个地块/6 个棋子各挂监听器）。

- 在渲染根（GameRoot 或 Canvas）注册一个触摸监听；点击时取 UI 坐标，用**等距的逆变换**把它换算回**逻辑格 (x,y)**：
  - 由 `gridToIso`：`isoX=(x−y)·halfW`，`isoY=−(x+y)·halfH+offset`
  - 反解：`x−y = isoX/halfW`，`x+y = (offset−isoY)/halfH` → `x、y` 各取平均，四舍五入取整，再校验界内。
- 得到格子 (x,y) 后判断：
  - `stage==='playerTurn'` 且该格有**我方棋子** → `onUnitClicked(unitId)`；
  - 否则 → `onTileClicked(x,y)`（targeting 阶段用于移动）。
- **优点**：单个处理器、无需给每块区块挂引用、直接用 state（唯一事实源）判定是什么棋子、与数据驱动一致。
- 需要的参数：`halfW/halfH/offset` 由 `mapBuilder.makeLayout(state)` 提供。

## 4. 模块与组件归属（遵循 ADR-0001）

```
Core（纯 TS）：已有 parseUnitDefs / getUnitDef / computeReachableCells —— 本期基本不动
GameManager（薄协调者）：新增交互编排
  ├─ @property unitDefsAsset(JsonAsset)  定义表；parseUnitDefs → this.defs
  ├─ 交互子状态 idle/selected/targeting + selectedUnitId
  ├─ onUnitClicked / onActionClicked / onCancelClicked / onTileClicked
  ├─ 移动执行：getUnitDef + computeReachableCells → 高亮；落子 = 改 state.pos + 更新视图 + tween
  └─ 驱动视图：ActionMenu 显隐、MoveHighlighter 高亮、input 监听
视图（哑组件）：
  ├─ ActionMenu        底部菜单：行动 / 取消 按钮（由 GameManager 显隐；按钮回调 GameManager）
  └─ MoveHighlighter   可走格高亮层：show(cells, layout) / clear()
```

## 5. 关键逻辑说明

### 5.1 选中与可走格
- `onUnitClicked(unitId)`：仅当该单位 `owner === 当前行动玩家 id` 且 `stage==='playerTurn'` → 设 `selectedUnitId`，子状态=selected，显示「行动」按钮。
- 点「行动」→ 子状态=targeting，用 `getUnitDef(defs, unit.defId)` + `computeReachableCells(state, unit, def)` 得到可走格 → 交给 `MoveHighlighter.show(cells, layout)`，显示「取消」按钮。

### 5.2 移动执行
- 点一个可走格 (tx,ty)：**先改逻辑状态** → `unit.pos = {x:tx,y:ty}`（唯一事实源），**再更新视图** → 用 `gridToIso` 算出新坐标，`Unit` 视图 tween 到新位置（复用下落那套 `quadOut` 节奏）。
- 移动完成后 → 清选中、子状态回 idle、清高亮。

### 5.3 本期「无限制」
- 不设 `actedThisTurn`/行动点：选中→行动→移动可任意重复；操作模型（A/B/C）确定后再加对应的限制检查。

## 6. 开放决策（已定）

| # | 问题 | 决议 |
| --- | --- | --- |
| 1 | 可走格高亮的美术 | `MoveHighlighter` 用 `Graphics` 画半透明菱形占位（颜色可调 `fillColor`），零新贴图；后续可换正式高亮贴图 |
| 2 | 移动后的行为 | 落子后回 `idle`（清选中）；本期无限制，可立即再选再动 |
| 3 | targeting 点非可走格 | 忽略（只有点可走格或点「取消」才退出） |
| 4 | 触摸坐标与 UI 空间的换算 | 触摸监听挂 **Canvas**；触点用 **`getLocation()` + 渲染相机 `screenToWorld`** 转世界坐标（`getUILocation` 基于设计分辨率左下角，实际视口宽高比与设计分辨率不一致时会整体偏移——Preview 实测踩坑），再用 MapRoot **世界矩阵的逆**转到本地（不依赖 UITransform），开 `debugPick` 日志核对 |

### 6.5 实施修订（相对 §3 原稿）

- **监听挂 Canvas 而非 GameRoot**：触摸事件只沿命中节点的祖先链派发；挂 Canvas 后空白点击（无地块命中）也有事件，「点空白取消选中」全屏生效；UI 按钮是 Canvas 子节点，`onBoardTouchEnd` 内按命中祖先链过滤（`isUiTap`），按钮点击不会串进棋盘逻辑。
- **坐标换算不依赖 UITransform**：MapRoot/GameRoot 是纯容器（无 UITransform），世界→本地用 `worldMatrix.clone().invert()` + `Vec3.transformMat4`，缩放/平移（未来视角系统）自动被吸收。
- **坐标换算（Preview 实测修订）**：实测发现 `getUILocation` 与节点世界坐标错位——它基于设计分辨率左下角，而实际视口宽高比（如预览窗 1073×596 ≈ 1.80）与设计分辨率（1280×720 ≈ 1.78）不一致，映射存在系统偏移。已改为 `getLocation()`（实际运行时屏幕，左下角原点）+ Canvas 渲染相机 `cameraComponent.screenToWorld` 转世界点；"屏幕→世界"只封装在 `GameManager.touchToWorld` 一处，未来视角方案变化只动它。
- **高亮对齐（实测修订）**：`gridToIso` 返回的是地块"精灵中心"摆放坐标，可见顶面中心（棋子落点）在其上方 `(128−76)·scale` 处；高亮直接用返回值会整体偏下。当前以 `MoveHighlighter.offsetX/offsetY`（序列化属性）手动校准对齐（换 `halfTileW` 后需重调）；触摸反算（`isoToGrid`）尚未叠加同一修正——点地块上半部分会偏到后一格，待统一收口到布局层。
- **旗子命中矩形**：由 `UnitBuilder.hitUnitAt` 按 depth 从深到浅做旗子内容矩形检测（画布像素 × 布局缩放，与视图精确重合）；targeting 阶段不参与棋子命中，避免旗身遮挡可走格。

## 7. 实施步骤（Plan → Implement → Verify）

| # | 步骤 |
| --- | --- |
| 1 | GameManager：加 `unitDefsAsset`，`parseUnitDefs` 得 `defs` |
| 2 | GameManager：交互子状态机 + `onUnitClicked/onActionClicked/onCancelClicked/onTileClicked` |
| 3 | 输入：单一触摸 + 逆等距换算（`inverseGridFromIso` 纯函数，放 Core 或组件内） |
| 4 | ActionMenu（行动/取消按钮，GameManager 显隐 + 回调） |
| 5 | MoveHighlighter（高亮可走格，Show/Clear） |
| 6 | 移动执行（改 state.pos + 视图 tween + 清高亮/选中） |
| 7 | 战场接线（人工）：先补建「结束回合」按钮（否则我方回合 0.5s 自动快过，无法测试）；再建「行动」「取消」按钮与 HighlightRoot（挂 MoveHighlighter，置于 MapRoot 与 UnitRoot 之间）；unit-defs.json / 两个按钮 / highlighter / turnEndButton 拖到 GameManager 对应属性 |
| 8 | Preview 验证：我方回合点棋子→行动→高亮→点格移动→取消；开 `debugPick` 核对触摸坐标换算 |

## 8. Acceptance Criteria

1. 我方回合可点选我方任意棋子，出现「行动」按钮；敌方回合/结束后不可。
2. 点「行动」→ 出现「取消」按钮，且该棋子可走格被高亮（与 `computeReachableCells` 一致：上下左右一格、排除己方占据与出界）。
3. 点一个高亮格 → 棋子移动到该格（逻辑 `pos` 与视图同步）。
4. 点「取消」→ 回到选中态；再点空白/别的棋子 → 相应改选或取消。
5. `soldier` 走法来自定义表（unit-defs.json），移动行为随之变化。
6. 纯逻辑无新增 `cc` 依赖（逆等距如放 Core 则保持纯 TS）。

## 9. 风险与未知

- 触摸→UI 坐标与条目世界坐标的换算需实测（§6-4）；如有偏移需加坐标变换。
- 高亮美术未定（§6-1），先用占位。
- `soldier` 配置是否满足预期走法（上下左右一格）需目视核对。
