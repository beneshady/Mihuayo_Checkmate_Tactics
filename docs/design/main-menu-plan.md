# 主菜单与关卡流程方案（主城 + 存档 + 结算）

- **状态**：Phase 1 已实施；Home.scene / Main.scene 已通过 editor-bridge 自动搭建并全部接线（Home 9/9 引用、Main levelListAsset + resultPanelNode 均已落盘验证）；待 Preview 自测与视觉定稿
- **关联**：[游戏流程控制](./game-flow-plan.md) · [战局数据格式](./battle-state-format.md) · [地形与兵种方案](./terrain-units-plan.md) · [ADR-0001](../architecture/decisions/0001-gameplay-layering.md)

## 1. 目标与范围

**目标**：为关卡制玩法补齐主流程入口——主菜单 → 选关 → 战斗 → 结算 → 回选关，并预留局外成长（兵营）的交互承载与存档骨架。本期打通一条最小经济闭环：打关获胜 → 发金币 → 解锁下一关。

**本期不做（明确冻结）**：兵营一切逻辑（升级/买兵/编成，设计未定）、升级对战斗数值的影响、多货币、二次确认弹窗、重开按钮、关卡星级、设置页、音效、多存档槽。

## 2. 信息架构与流程

```
Home.scene（主城，一个场景内切面板）
 ├─ 主菜单页 ──「开始战斗」──▶ 选关页 ──点已解锁关卡──▶ Battle.scene（现有战斗）
 │      │                        ▲                            │
 │      └──「兵营」──▶ 兵营页(空)  │                  战局结束 → 结算面板
 │                                             （胜: 金币+通关记录 / 败: 原样）
 └──────────────────◀──────「返回选关」按钮──────────────────┘
```

- 启动场景 = Home.scene
- 战斗场景内不再"2 秒自动刷新"，由结算面板承载结束流程（替代现有占位逻辑）
- AI 中途击杀我方最后一枚同样触发结算面板（enterEnded 统一入口）

## 3. 场景组织决策

主菜单/选关/兵营都是纯 UI 页面，放**一个 Home 场景内切面板**（快、共享金币状态条、场景数不膨胀）；战斗保持独立场景（重、隔离干净、GameManager 初始化时序零改动）。页面切换用一个极薄协调器（HomeUI 直接持有面板引用），不做页面管理框架。

## 4. 页面交互设计

| 页面 | 内容与交互 |
| --- | --- |
| 主菜单页 | 标题 + 金币余额（顶部状态条，跨面板共用）+ 版本号；「开始战斗」→ 选关；「兵营」→ 兵营页 |
| 选关页 | 关卡条目列表（`level-list.json` 驱动）：关卡名 + 通关 ✓/🔒 + 奖励预览；点已解锁关 → 写 `currentLevelId` 进战斗；锁定项置灰；「返回」 |
| 兵营页 | **置空占位**（"兵营建设中"），仅保留入口与页面壳；升级/买兵设计待定 |
| 结算面板 | 战斗场景内覆盖层：胜=「胜利 +N 金币」、败=「战败」；「返回选关」按钮 → 回 Home 选关页 |

交互约定：按钮统一 `transition=COLOR` + disabledColor 既有 pattern；金币不足置灰（本期仅结算/选关涉及，兵营实装时复用）；无转场动画；无暂停/中途退出（Result 完整版再做"再来一局"）。

## 5. 关卡配置与存档分离（核心决策）

**配置表回答"世界有什么"，存档回答"玩家到哪了"，二者只通过关卡 id 关联。**

```
assets/resources/Levels/
  level-list.json      ← 静态配置：[{ id, name, rewardGold, file? }]
  level-01.json        ← 各关战局（现 battle-state.example.json 演化，移入 resources 才能按名动态加载）
  level-02.json
```

- `file?` 省略时按约定 `Levels/<id>.json` 解析（可覆盖）
- `level-list.json` 用与 unit-defs 相同 pattern：`formatVersion` + 带路径报错解析校验（`Core/LevelConfig.ts`）
- **解锁是推导值**：第 1 关恒解锁；第 N 关解锁 ⇔ 第 N−1 关 ∈ 存档 `clearedLevels`。存档不存 unlocked 列表，杜绝两处状态不一致
- GameManager 启动：读存档 → 取 `currentLevelId`（无/非法 → 第 1 关）→ 按 id 动态加载战局 JSON；`unit-defs` 仍走属性拖拽不变

## 6. 玩家进度存档设计

### Schema（formatVersion 1）

```json
{
  "formatVersion": 1,
  "gold": 0,
  "clearedLevels": ["level-01"],
  "currentLevelId": "level-01",
  "extra": {}
}
```

| 字段 | 校验/兜底 |
| --- | --- |
| `formatVersion` | 未知更高版本 → 拒用回退新档 + warn（防降级写坏）；仅 v1 |
| `gold` | 非法 → 0 |
| `clearedLevels` | 非法 → []；含已下架关卡 id 无害（推导时忽略） |
| `currentLevelId` | 非法/不在配置 → 回落第 1 关 |
| `extra` | 透传保留，未来字段不丢 |

### 容错策略（与 assets 配置的关键区别）

存档是玩家数据，**能救就救**：无档 → 新档；根不是对象 → 新档；否则逐字段 sanitize（只丢坏字段不丢整档）。配置文件则报错拒载。校验复用 `BattleParseError`（本质即"带 JSON 路径的解析错误"，不造第二套）。

### Core API（`Core/PlayerProfile.ts`，零引擎依赖）

```ts
newProfile(): PlayerProfile
parsePlayerProfile(raw: unknown): PlayerProfile        // 宽容解析（§6 容错）
isLevelUnlocked(profile, levelList, id): boolean       // 解锁推导
grantBattleReward(profile, levelId, rewardGold): boolean
    // 战胜结算：gold += reward（复通同样发奖）+ 登记 clearedLevels（去重）；沿用 Rules.ts 风格
```

**奖励口径（已定稿）**：战胜即发奖励并登记 `clearedLevels`（登记去重），**复通同样发奖、暂不防刷**（用户决策 2026-02）；经济定稿时再引入衰减。

### 存储层（`Shell/UI/ProfileStore.ts`）

`cc.sys.localStorage`（key：`playerProfile`，单玩家单槽位；微信上自动映射平台存储，不碰 wx API ✓）。保存时机仅两个：选关进战斗时（写 currentLevelId）、结算时。`loadProfile/saveProfile/clearProfile`，clearProfile 供调试清档（暂不做 UI 入口）。

## 7. 代码落点

| 层 | 文件 | 职责 |
| --- | --- | --- |
| Core | `Core/LevelConfig.ts`（新） | level-list 解析校验 |
| Core | `Core/PlayerProfile.ts`（新） | 档案结构+宽容解析+解锁推导+结算纯函数 |
| Shell | `UI/ProfileStore.ts`（新） | localStorage 读写 + 坏档兜底 |
| Shell | `UI/HomeUI.ts`（新） | 三面板切换 + 金币条 + 进战斗（极薄协调器） |
| Shell | `UI/ResultPanel.ts`（新） | 结算覆盖层显示 + 返回选关 |
| Shell | `GameManager.ts`（改） | 关卡动态加载（id→resources）；enterEnded 弹结算面板（删 2 秒刷新占位） |
| 数据 | `resources/Levels/level-01.json` 等（新） | 关卡战局（由现有关卡演化） |

战斗核心（Rules/movement/EnemyAI/棋子视图）**零改动**。

## 8. 决策记录

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 货币体系 | 单一金币（结构留 extra 迁移位） |
| 2 | 配置/存档关系 | 分离：配置记关卡全集，存档记通关事实，id 关联，解锁推导 |
| 3 | 兵营 | 入口保留、页面置空，设计待定；档案只预留 gold，不预埋字段 |
| 4 | 结算去向 | 胜/败都回选关页（选关是关卡制的家） |
| 5 | 场景策略 | Home 单场景切面板 + 战斗独立场景 |
| 6 | 奖励口径 | 战胜即发奖并登记通关，复通同样发奖、暂不防刷 |
| 7 | 兵种上场 | 本期编成不变（关卡 JSON 编排），profile 上场规则待兵营定稿 |

## 9. Acceptance Criteria

1. 启动 → 主菜单；金币 0；兵营页为占位空面板
2. 选关页第 1 关可点、后续关卡锁；进第 1 关战斗行为与现在一致
3. 通关 → 结算面板"胜利 +N 金币" → 返回选关：下一关解锁、金币增加
4. 败北 → 无奖励回选关
5. 重进游戏金币/通关进度仍在；清档后回新档
6. 复通已通关卡仍发金币（按定稿不防刷）
7. AI 中途终结战局同样弹结算面板
8. 战斗玩法/交互与现在完全一致（本期不碰战斗核心）

## 10. Playtest 方法

1. 全流程走一遍：主菜单 → 选关 → 战斗 → 结算 → 回选关 → 兵营（空）→ 回主菜单
2. 通关后检查金币与解锁状态；重开预览验证存档持久化
3. 控制台调用 `clearProfile()` 验证新档回退
4. 手工构造坏档（localStorage 写非法 JSON/错字段）验证逐字段兜底与整档回退
5. 故意败北验证无奖励路径

## 11. 分期与扩展路径

- **本期（Phase 1）**：§1–§10 全部内容
- **Phase 2**：兵营设计定稿后实装（升级/买兵/上场规则）、`formatVersion 2` 迁移示范、升级数值接入战斗构建（applyUpgrades）、Result 完整版（再来一局/星级/复通奖励）
- **远期**：编成自选、多货币、设置页、云存档
