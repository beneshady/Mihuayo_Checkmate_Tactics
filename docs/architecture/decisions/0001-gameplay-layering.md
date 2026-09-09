# ADR-0001：游戏逻辑分层——纯 TS 规则 / 哑视图 / 薄协调者

- **状态**：已接受（M0 期间确立并已随地图、棋子生成落地）
- **关联**：[开发基线](../cocos/development-baseline.md) · [架构事实](../facts.md)

## 背景

M0 已完成「按战局 JSON 生成地图 + 棋子」。后续将加入棋子移动、攻击、敌我回合轮换、胜负判定。
为避免把战斗数学散落到各组件、并遵循基线「Playable > Framework Complete / 无明确需求不建全局机制」，
需要一个一致的扩展方式。本决定回答「新玩法逻辑往哪放、视图和状态怎么协作」。

## 决定

1. **三层职责切分**
   - **Core（纯 TS，零 `cc` 依赖）**：数据模型 + 解析校验 + 坐标换算 + **规则数学**。规则一律放这里，可脱离引擎单测。
   - **视图组件（哑）**：只建节点 / 刷外观 / 播动画（如 `MapBuilder`、`UnitBuilder`、`Tile`、`Unit`）。不持有逻辑状态、不写战斗规则。
   - **协调者（薄）**：`GameManager` 持有战局状态（唯一事实源），调用 Core 规则、再驱动视图更新。组件内不写规则逻辑。
2. **战局状态唯一事实源**：运行期状态 = `GameManager` 持有的 `BattleState`；`JSON = BattleState 的序列化形态`（battleInit 开局 / battleSave 存档，同构）。视图都是它的投影。
3. **视图注册表**：运行期按 `unitId` / 格坐标 定位视图 → Builder 维护 `unitId → Unit` 注册表；`Tile` 记录 `gridX/gridY` 并提供格点查询。**不做全局 Event Bus**。
4. **规则模块位置**：新增 `Scripts/Core/Rules.ts`，放 `tryMove / tryAttack / advanceTurn / checkOutcome / getTile` 等纯函数（只读写 state，不进引擎）。
5. **明确不做**（除非未来出现真实需要）：Event Bus、Service Locator、通用 Command / ECS、通用对象池、预先搭好的 Save 框架。存档 = 序列化 BattleState。

## 后果

**正面**
- 规则可脱离引擎单测；视图与逻辑解耦。
- 新功能顺着三层加，主要成本集中在「视图注册表 + 单位数值表(defs) + 规则函数」三块基础设施，而不是改架构。
- 符合基线（Playable > Framework Complete），不为假设的未来需求建框架。

**代价 / 接受**
- 需要维护「状态 ↔ 视图」同步：改状态后要显式驱动视图更新（M0 由 GameManager / Builder 完成，可接受）。
- 注册表需要生命周期管理（重开局 / 重玩时清理）。
- 小功能也要经过一次 GameManager 调用链；待功能量增长后再做「有下限度的拆分」，而非提前建全局框架。

## 替代方案

- **组件内直接写规则**（战斗数学进 Component）：耦合引擎、难于测试——否决。
- **Event Bus / Service Locator**：无明确需求，提前建全局机制——否决（基线）。
- **通用 Command / ECS / 对象池**：复杂度远超当前问题——否决（Simple > Clever）。
