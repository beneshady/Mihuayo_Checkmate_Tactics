# 地形 & 象棋兵种 开发方案（M1）

- **状态**：代码已实施，类型检查通过，待用户 Preview 自测
- **规则来源**：[地块&棋子详细规则](../地块&棋子详细规则.md)
- **前置**：M0 基础流程（选中/移动/攻击/信息面板/AI 随机移动）已通过用户自测

## 1. 目标与范围

把 `docs/地块&棋子详细规则.md` 的地形与七兵种规则接入现有 Core 引擎：

- 地形参与走法：森林（不可进+阻挡物）、水面（按棋子定义）、地宫 road（士/帅限定）
- 七兵种定义：帅/车/马/炮/象/士/兵，移动与攻击规则分离（attackSpecs）
- 体力系统：每回合回满，移动/攻击消耗，信息面板显示
- 胜负条件扩展：击杀指定棋子（eliminateDef）可作为胜利条件

### 已确认决策（用户拍板）

| 议题 | 决策 |
| --- | --- |
| 兵的移动 | 文档"只能在地宫块上"系笔误 → 平地直线 1 格（与原 soldier 一致） |
| 象的攻击范围 | 选项 C（田字覆盖格），**待用户示意图后改 attackSpecs 数据**；当前暂缺省=走田打田 |
| hill 地形 | 规则未定，暂作装饰（=平地行为），引擎按平地兜底 |
| 胜负条件 | `eliminateAllEnemies` 与 `eliminateDef` 双条件并存，由关卡 JSON 声明 |
| 体力数值 | 全员 maxStamina=2，移动/攻击各耗 1（def 字段显式写出，数值后续用户自调） |

## 2. 数据契约

### UnitDef 新增字段（assets/Defs/unit-defs.json）

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `maxStamina` | 是 | 体力上限；每回合开始由 `resetTurn` 回满 |
| `moveCost` / `attackCost` | 否（缺省 1） | 移动/攻击消耗体力 |
| `waterPassable` | 否（缺省 true） | false=不可进入水面、不可攻击水中目标（象） |
| `onlyOnTerrain` | 否（缺省不限） | 只能在此地形 id 上移动（士/帅 = `'road'`） |
| `attackSpecs` | 否（缺省回退 `moveSpecs`） | 攻击走法，复用 MoveSpec 语法 |

### 战局实例（BattleState）

- `BattleUnit.stamina?`：当前体力，缺省视为满（与 `hp` 同构：只存当前值，满值由 def 推导）
- `BattleCondition.defId?`：`eliminateDef` 条件的目标棋子 defId

### 七兵种配置速览

| defId | name | maxHp | attack | 移动 | 攻击 |
| --- | --- | --- | --- | --- | --- |
| shuai | 帅 | 140 | 0 | `[]`（不可动，onlyOnTerrain=road） | `[]`（不可攻，可被攻击） |
| che | 车 | 120 | 45 | slide solid ×4 | **step ×4**（正交 1 格） |
| ma | 马 | 100 | 35 | jump 日字 ×8 各带 `leg` | 缺省（打=走，腿同样受阻） |
| pao | 炮 | 80 | 50 | slide solid ×4 | **slide screen ×4（screen:1）** |
| xiang | 象 | 130 | 35 | jump 田字 ×4 带 `leg`（象眼），waterPassable=false | 缺省（暂=走田打田，待示意图） |
| shi | 士 | 100 | 35 | step 斜 ×4，onlyOnTerrain=road | **step 全 8 向** |
| soldier | 兵 | 80 | 35 | step 直线 ×4 | 缺省（打=走） |

数值设计约束（已程序化验证）：攻击带 35–50、血量带 80–140，任意攻守组合击杀次数 `ceil(血量/攻击)` ∈ **[2, 4]**——肉盾（象130）扛最低攻 4 下，玻璃炮（炮：攻50/血80）3 下打穿最肉单位、2 下被反杀。定位：车=均衡重装、炮=高攻低血隔子狙、象=最肉、马=机动、士/兵=中庸。

## 3. 引擎语义（Core/Terrain.ts + Core/movement.ts）

`computeReachableCells(state, unit, def, mode)` 新增 `mode: 'move' | 'attack'`（缺省 move）：

- **move 模式**：走 `moveSpecs`；落点受 `canEnterTerrain`（森林不可进 / 水按 waterPassable / onlyOnTerrain 限制）
- **attack 模式**：走 `attackSpecs ?? moveSpecs`；「到达格有敌方棋子」才是目标（红），空格为范围示意（灰）；
  目标格只受 `canAttackIntoTerrain`（象不可打入水中）——**不应用 onlyOnTerrain**，故士可打地宫外与水中的相邻敌棋
- **森林 = 棋子级阻挡物**：slide 路径终止、马腿/象眼受阻、可作炮架；永不被攻击（不是 units 成员，天然不会成为目标）
- 未知地形 id 一律按平地兜底（与 Tile 视图贴图回退策略一致）

体力流转：`resetTurn(state, defs)` 回满当前行动方 → `moveUnitTo` / `attackUnit` 校验 `(stamina ?? maxStamina) >= cost` 后扣减 → 存档随 `battleSave` 持久化。

胜负：`checkOutcome` 改为条件分发——任一玩家的 win/lose 条件达成即判负（对称）；`eliminateDef` 判定"该玩家无存活 defId 棋子"；未知条件类型忽略（数据可先于代码）。

## 4. 本次改动文件

| 文件 | 改动 |
| --- | --- |
| `Core/Terrain.ts` | 新增：地形三函数（getTerrainAt / isBlockingTerrain / canEnterTerrain / canAttackIntoTerrain） |
| `Core/movement.ts` | mode 化 + 地形耦合（森林阻挡、水、地宫、炮架） |
| `Core/UnitDefs.ts` | 接口新字段 + requireBoolean/requireArray + parseMoveSpecArray（moveSpecs/attackSpecs 共用） |
| `Core/BattleState.ts` | `BattleCondition.defId` + `BattleUnit.stamina` |
| `Core/Rules.ts` | moveUnitTo(+defs,体力)、attackUnit(体力)、resetTurn(+defs,回满)、checkOutcome 条件分发 |
| `Core/EnemyAI.ts` | 体力不足的棋子跳过行动 |
| `Core/UnitInfo.ts` / `UI/UnitInfoPanel.ts` | 面板增加"体力 x/y"行 |
| `GameManager.ts` | resetTurn/moveUnitTo 传 defs；攻击目标切 attack 模式 |
| `Defs/unit-defs.json` | 七兵种定义 |
| `Levels/battle-state.example.json` | 双地宫布阵（road 区保留作展示）；当前测试编成：我方 车1/炮1/兵1，敌方 兵1（hill 已移除；帅/士/马/象暂不上场，`eliminateDef` 条件本关未启用——无帅时该条件会立即误判，机制保留待后续关卡） |

视图侧零改动：Tile.prefab 五种地形映射已由用户配好；红灰高亮链路不变。

### 棋子外观与阵营标记（M1 补充，素材 `assets/Sprites/Units/*`）

- **选图依据**：`Unit.prefab` 的 `typeSprites`（defId → SpriteFrame）映射，`Unit.setUnit(unitId, ownerId, defId)` 按 defId 选图，缺省回退第一条。文件名（将/车/战马/…）与 defId（shuai/che/ma/…）不一致，故用显式映射而非文件名匹配。
- **尺寸归一**：`UnitBuilder.unitWorldHeight`（世界单位，默认 100）——节点缩放 = `unitWorldHeight / spriteFrame.rect.height`，各棋子**等高**；与 `halfTileW=64` 可比。
- **锚点**：棋子节点 `UITransform.setAnchorPoint(0.5, 0)`（底边中心），放在 `gridToIso + (128−TOP_CENTER_Y_PX)·scale`（≈ 顶面中心），底座底边顶在格子里。
- **阵营标记（方案 B）**：每枚棋子底部用 `Graphics` 画一圈带色椭圆环——我方（controller=human）金色、敌方红色；描边透明中心不遮棋子本体。
- **人工接线**：只有 `Unit.prefab` 上把 7 张 `Sprites/Units/*.png` 拖到 `typeSprites` 映射（defId↔图）。图片 meta 已存在（已导入），无需重新导入。
- **改动文件**：`Unit/Unit.ts`（ownerSprites→typeSprites）、`Unit/UnitBuilder.ts`（unitWorldHeight/锚点/几何/阵营标记/删旧 FLAG 常量）、`GameManager.ts`（hitUnitAt 调用少传 layout 参数）。
- **验收**：7 种棋子各显示对应图、等高、底座落在顶面中心不悬浮穿格；重叠时命中前景棋子；移动/抖动正常；敌我脚下色环可辨。

## 5. 验收与 Playtest（Preview 自测清单）

1. 类型检查通过（`tsc --noEmit`）✅
2. 关卡加载：地图出现森林/水面/地宫贴图（无 hill），4 枚棋子落在正确格（我方 车/炮/兵 一排，敌方 兵）
3. 车：沿直线滑行、被棋子/森林挡住；攻击仅相邻正交 4 格（红），更远处灰
4. 马：日字走位；贴脸马腿被棋子/森林别住时对应目标消失；攻击=走
5. 炮：移动同车；攻击需隔恰好 1 个阻挡（棋子**或森林**均可作炮架）；无炮架/两 blocker 时不出现红格
6. 象：田字走位、象眼受阻；不可走入水面；不可攻击水中敌棋
7. 士：地宫内斜走 1 格；攻击=8 邻（含地宫外格）
8. 帅：不可选行动（无可走格）；体力扣到 0 的棋子本回合不能再动，下回合回满
9. 兵：直线 1 格，森林/水面外的落点正常；攻击=走
10. 面板显示 体力 2/2，移动一次变 1/2
11. 胜负：击杀敌方唯一士兵 → 战局结束（全灭条件）；`eliminateDef(帅)` 机制已在 Rules 实现但本关未启用（当前编成无帅）

## 6. 开放项

1. **象 attackSpecs**：等示意图（选项 C）后改 `unit-defs.json` 数据即可，引擎已支持任意 step/jump 组合
2. **hill 规则**：TBD，当前=装饰
3. ~~AI 攻击扩展~~ **已完成**：敌方 AI 升级为贪心步进（攻击/移动、用满体力），详见 [enemy-ai-plan.md](./enemy-ai-plan.md)
4. 体力不足时对应行动/攻击按钮**置灰**（`Button.interactable`，已实现）；规则层拒绝仍作为兜底
5. `docs/design/unit-defs-plan.md` 在 movement.ts 旧注释中被引用但文件不存在——本承担其契约职责；如需独立文档再补
