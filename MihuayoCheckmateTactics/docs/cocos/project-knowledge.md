# Cocos 项目知识（project-knowledge）

> 只记录**已验证**的 Cocos/项目事实。做 Scene/Node/Component/Prefab/构建相关任务前必读本文档（AGENTS.md 路由规则）。

## 项目与工具链

- Cocos Creator **3.8.8**；项目根 `MihuayoCheckmateTactics/`（仓库工作区内）。
- 本地编辑器桥：`codex-editor-bridge` 扩展，localhost **17388**（健康检查 `/health`）。
- 编辑器**不会自动感知外部新增的文件**：脚本/资产在编辑器外新增后，需要在编辑器中让其刷新资源库；**预话需完全重启预览**才生效。
- 微信小游戏构建产物在 `build/wechatgame/`（本里程碑未走微信构建验收）。

## 脚本结构（已实施）

- `assets/Scripts/Core/`：规则内核（纯 TS，零 `cc`）。文件：`Config`（战役常量/九宫/波次/随机）、`BattleState`（v2 状态与解析/校验/等距坐标）、`UnitDefs`（8 兵种 def，kind 硬编码）、`Terrain`（占位/水/山/林/尸体）、`Actions`（走法与动作生成）、`Rules`（唯一结算路径 + 提交）、`EnemyTelegraph`（敌方准备/意图/重验/执行）、`UnitInfo`（信息面板数据）。
- `assets/Scripts/Map/`：`IsoLayout`（`makeIsoLayout(halfTileW, width, height)`，尺寸取自 CONFIG）、`MapBuilder`（按 `terrainAt` 枚举稀疏 tiles 建地块）、`Tile`（FALLBACK 地形 `'land'`）、`MoveHighlighter`、`ThreatOverlay`（敌方威胁标记，哑数据 `ThreatMark`）。
- `assets/Scripts/Unit/`：`Unit`（prefab 脚本）、`UnitBuilder`（按状态生成单位视图）。
- `assets/Scripts/UI/UnitInfoPanel.ts`：信息面板（行动点 + 等级行）。
- `assets/Scripts/GameManager.ts`：回合流程协调（开机 → 关卡加载 → 敌方准备 → 玩家回合 → 敌方攻击 → 胜负/重开）。

## 已验证的表现约定

- 逻辑 9×9 方格与等距视觉解耦：`gridToIso`（深度 = x+y，越大越靠近镜头）；拾取用 `isoToGrid`。
- 单位 prefab 的精灵映射按旧 defId 保留：`Unit.KIND_DEFID_ALIAS` = king:shuai、rook:che、horse:ma、cannon:pao、pawn:soldier、advisor:shi、archer/spearman:soldier。
- **无美术资源**：所有 UI = Graphics + Label 代码占位；不算缺失，M0 验收以此为准。
- 已知表现限制：炮击破坏山后**地块贴图不刷新**（ GameManager 内注释标注；重建地块属后续小改）。

## 测试编译循环（Windows 本机验证过）

```powershell
cd MihuayoCheckmateTactics\tests\core
node 'E:\Program Files (x86)\deepseek-harness\node_modules\typescript\bin\tsc' -p tsconfig.json
node dist/tests/core/run.js            # 规则回归（133 断言）
node dist/tests/core/fixtures-check.js # 关卡夹具回归（36 断言）
```

- 必须用 `node <tsc>` 调起；PowerShell 直接 `& tsc` 会报 `CantActivateDocumentInPipeline`。
- tsconfig 只编 `tests/core/**/*.ts` + `assets/Scripts/Core/**/*.ts`；视图层由 Cocos 编辑器验证（无 cc stub）。
- 含中文的文件一律用文件工具读写，**不要经 PowerShell 文本管道**（GBK 乱码风险）。

## 调度器注意（已踩坑）

- `scheduleOnce` 传**同一函数引用**会被调度器去重导致链路断裂：链式步骤必须用新闭包 `() => step()`（GameManager.startEnemyPrep 已按此写法）。
