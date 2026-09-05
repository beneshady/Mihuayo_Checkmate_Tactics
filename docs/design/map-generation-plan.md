# 地图生成开发方案（M0 第一块）

- **状态**：✅ 已完成并通过用户 Preview 验证（含 Tile.prefab 化重构与 GameManager 引入）
- **关联文档**：[战局数据格式设计](./battle-state-format.md)（本功能的数据输入格式）
- **Human Owner**：TBD（策划 / Game Director）

## 1. 目标与范围

**目标**：运行 `Main.scene`，程序按 `assets/Levels/battle-state.example.json` 自动生成 10×8 等距地图，每种地形显示对应顶面贴图。**已达成。**

**明确不做**（后续步骤）：棋子 / 单位生成、存档读档、胜负判定、回合流转、Tile 交互、微信真机验证。

## 2. 已确认决策与现状

| 决策项 | 结论 | 状态 |
| --- | --- | --- |
| 屏幕方向 | 横屏 1280×720，Canvas fitHeight | ✅ 已验证 |
| 渲染风格 | 等距 / 2.5D 立方体地块 | ✅ 已验证 |
| Prefab 化 | 方案 A：**共享 Tile.prefab**，Tile 组件自带地形→贴图映射，MapBuilder 只负责布局 | ✅ 已实现 |
| 架构分层 | **GameManager 持有战局状态（唯一事实源）**，解析在 Manager；MapBuilder 只接收 `state` 生成视图 | ✅ 已实现 |
| 素材基准 | plain / water（256×256 透明背景） | ✅ |
| 缺失贴图 | forest / hill / road 由用户按同风格提供；到位前未知地形回退 plain 并警告 | ⏳ 待用户 |
| Creator 路径 | `E:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe`（本机实测） | ✅ |

### 贴图实测几何

顶面菱形外沿约 **248×144**（绿区 240×136 + 描边），**宽高比 ≈1.72:1（非标准 2:1）**，顶面中心在图内 y≈76。常量在 `MapBuilder.ts` 头部，换 tileset 必须重测。

### 逻辑网格与视觉投影

`gridType:"square"` 是逻辑网格（寻路/规则用），等距只是视觉投影。**关键已验证事实**：Cocos `+y` 向上，`isoY` 必须随深度（x+y）**递减**，否则整图上下颠倒、遮挡反转（表现为内部楼梯）。详见 [Cocos 项目知识](../cocos/project-knowledge.md)。

## 3. 目录结构

```
assets/
├── Prefabs/Tile.prefab          # 地块预制体（Sprite + Tile 组件，映射表在 prefab 上维护）
├── Scenes/Main.scene
├── Scripts/
│   ├── GameManager.ts           # 战局协调者：持有 state，驱动流程（M0 骨架）
│   ├── Core/BattleState.ts      # 纯 TS：类型 + 解析校验 + 等距换算（零 cc 依赖）
│   └── Map/
│       ├── MapBuilder.ts        # buildMap(state)：只管布局（排序/定位/实例化）
│       └── Tile.ts              # 地块组件：terrainId → 贴图映射 + setTerrain（未知回退 plain）
├── Sprites/                     # plain.png / water.png 已就位
└── Levels/battle-state.example.json
```

## 4. 数据流

```
battle-state.example.json
    ↓ GameManager.start(): parseBattleState(levelAsset.json)   ← 解析与校验（含 JSON 路径报错）
BattleState（内存唯一事实源，GameManager.state，存档=序列化它）
    ↓ mapBuilder.buildMap(state)（引用：用户在 Inspector 把 MapRoot 拖入 GameManager.mapBuilder）
MapRoot 下 80 个 Tile.prefab 实例（depth=x+y 升序创建，树序渲染前景盖背景墙体）
    ↓ tile.setTerrain(terrainId)
Tile 按自带映射设置贴图（未知地形回退 plain + 警告）
```

## 5. 模块明细（实现现状）

### 5.1 `Scripts/Core/BattleState.ts`（纯 TS）
类型对应战局格式 v1；`parseBattleState` 校验结构（formatVersion/kind/map 完整性/网格行列数），错误带 JSON 路径；未知地形 id 不在校验层报错（由 Tile 兜底）。`gridToIso`：`isoX=(x−y)·halfTileW`，`isoY=−(x+y)·halfTileH+offset`。

### 5.2 `Scripts/GameManager.ts`
M0 骨架：持有 `state`（私有）+ 只读 getter `battleState`；`start()` 校验引用 → 解析 → `mapBuilder.buildMap(state)`。不引 Event Bus / 服务层 / 存档框架；后续回合、棋子、胜负都挂这条链。

### 5.3 `Scripts/Map/MapBuilder.ts`
无 levelAsset（解析上移）；`public buildMap(state)`；按 depth 升序实例化 Tile.prefab；实测常量 248×144/中心 y76；`depthCenter` 使地图垂直居中。

### 5.4 `Scripts/Map/Tile.ts` + `Prefabs/Tile.prefab`
映射表序列化在 prefab 上（改外观只动 prefab）；`setTerrain` 未知地形回退 plain 且每种只警告一次。

### 5.5 场景结构（Main.scene）
```
Canvas（1280×720 fitHeight）
├── Camera
└── GameRoot
    ├── GameManager（levelAsset=example.json；mapBuilder=MapRoot 的组件，用户手拖）
    └── MapRoot
        └── MapBuilder（tilePrefab=Tile.prefab，halfTileW=64）
```

## 6. 实施步骤（全部完成）

| # | 步骤 | 状态 |
| --- | --- | --- |
| 1 | BattleState 纯逻辑 | ✅ |
| 2 | 贴图实测 + 常量 | ✅ |
| 3 | MapBuilder / Tile / Tile.prefab | ✅ |
| 4 | 场景组装 + GameManager 接线 | ✅ |
| 5 | Preview 验证（含遮挡修复：isoY 翻转 + 居中） | ✅ |
| 6 | 文档同步（本文件 + cocos 知识库） | ✅ |

## 7. Acceptance Criteria（已验证）

1. 生成 10×8 等距地图，地形与 JSON 一致；未知地形回退 plain 并警告 ✅
2. 改 JSON 地形 → 显示随之变化 ✅
3. 拼接无缝，前景覆盖背景墙体；墙体只出现在外圈轮廓 ✅
4. 结构非法时 Console 报含 JSON 路径的错误且不生成残缺地图 ✅
5. `BattleState.ts` 零 Cocos 依赖 ✅
6. Playtest 方法：Creator ▶ 预览目视核对 + 改 JSON 复跑 ✅

## 8. 风险与已知限制

- 等距常量与 `plain.png` 绑定，换美术必须重测（见 5.2/5.3 头注释）。
- `.meta`/UUID 禁止手写；资产修改一律走编辑器 / 桥。
- 组件引用（如 `mapBuilder`）无法通过编辑器桥赋值，须在 Inspector 手动拖。
- 编辑器桥不触发 asset-db 刷新：**新脚本写入后需点击 Creator 窗口获得焦点才会编译**。
- 10×8 地图在 halfTileW=64 时总高约 759，略超 720 设计高，最外圈底部墙体可能轻微裁切；需要完整显示可把 halfTileW 调至 ~60。
- Git：内嵌仓库归属未定，提交方式待团队确认。

## 9. 遗留与后续

- ⏳ forest / hill / road 三张贴图（用户提供后：入 Sprites → Tile.prefab 映射表补 3 条）。
- ➡️ 下一步候选：**棋子（单位）生成上场**——复用 Tile 模式（Unit.prefab + UnitBuilder + GameManager 链路）。
