# 架构事实（facts）

> 只记录**已验证**的架构事实；未验证的设计保持 TBD。修改架构前必读本文档（AGENTS.md 路由规则）。

## 分层与依赖（ADR-0001，已实施）

- `assets/Scripts/Core/**`：纯 TypeScript，**零 `cc` 导入**，可在 Node 下直接运行与测试。
- `assets/Scripts/{Map,Unit,UI}/**` 与 `GameManager.ts`：视图与协调层，允许依赖 `cc`；GameManager 是薄协调者（不写规则）。
- 战局状态 `BattleState`（formatVersion 2）是**唯一事实源**；视图只渲染状态与效果，不自持规则结论。
- 无全局单例、无事件总线；跨层通信 = 函数返回值（Effect）+ GameManager 显式调用。

## 结算路径（P0 已验证）

- `Rules.applyAction` 是**唯一结算路径**：玩家提交（`submitAction`：AP/revision 校验 + 深拷贝）与敌方执行（`EnemyTelegraph`：预览用深拷贝 `previewMode=true`，实际逐步执行）共用。
- 「预览=实际」由此结构保证；测试 `tests/core/run.js` T19 与 fixtures-check 均有对拍断言。
- `applyAction` **原地修改传入 state**；「不改原局」的纯度由调用方先深拷贝保证（submitAction / 预测均已拷贝）。

## 敌方回合（P0 已验证）

- 顺序：`planEnemyPrep`（规划即落位，对齐原型 `prepareEnemy`——后续敌人的攻击判定与走位枚举能看到前序移动后的占位）→ `generateIntents`（offset 冻结，优先级 帅0>车1>其他2，同级按 y/x）→ 玩家回合 → 逐意图 `revalidateIntent` + `applyAction`（consume=false）。
- `applyPrepMove` 幂等（`planEnemyPrep` 已落位时返回 true），供 GameManager 逐个播放动画。
- 意图落点 = 攻击者当前位置 + offset（`intentTarget`），不回打冻结时的绝对格。
- 帅亡即产生 `state.result` 并截断后续意图；11 回合坚守 = 我方胜利（`CONFIG.maxRounds`）。

## 已验证的规则语义要点（与原型 rules.js 对拍）

- 占位 `occupied` = 活单位 ∪ 尸体 ∪ 山（`isMountainAt` 含 `cracked`）；尸体可作炮架、可截断弹道。
- 炮「射空」：炮架恰好 1 时 revalidate 仍返回 action，结算为 `status:'success'` 且 `hits:[]`；`missOnly` 只出现在兵系/方向攻击「形状成立但落点无目标」。
- 枪/弓方向攻击射程：`directionRange` 弓 {2, 2+paid}、枪 {1, 1+paid}（paid = `directionPaid[d]`，商店预购）；弓 1 格盲区截断。
- 移动本身不淹死（普通移动不会生成入水路径）；只有被**推/拉入水**的目标才触发 `drownCheck`。
- `recordKill`：每杀 kills/level/sp 各 +1（对齐原型），killLedger 幂等记账，killValues 记赏金。
- LCG 随机：`nextRandom` `(rng*1664525+1013904223)>>>0`，种子默认 `0x12345678`；林闪避 <0.3。

## 战役框架与经济（P1 已验证）

- `Rules.finishVictory`（对齐原型）：`settled` 幂等防重；赏金 = `killLedger` 按 `killValues` 求和（缺项回退 w1-7=5 / 其他=1）入 `state.gold`；牵引车（player rook 且 `rookRole='pull'`）过关 SP+1；phase 进 `intermission`。`checkTerminal` 是全语义 terminal：帅亡 → `phase='result'`+清意图；敌将亡 → 调 finishVictory。`applyAction` 尾部 `syncParty(state)` → `checkTerminal(state)`。
- `Rules.syncParty`：每次结算后把活单位或其尸体快照回写 `state.party`（成长跨关延续的机制）；阵亡成员底册记 hp0，`constructLevel` 重新满血上阵。
- `Rules.retryLevel`：仅失败态且有 `levelSnapshot` 时从快照完整回滚（阵亡/尸体/地形/花销/成长），phase 回 deploy、result 清空、revision+1。
- `Core/Campaign.ts`：`constructLevel(source, levelJson, {next, levelNo})` 按原型逐行对齐——敌人重编号 `w1-i`、party 重置（清 commanderHealth/Move、满血）、默认位非法（士出宫/占用/水）时从我方半场逐行扫描、phase 直进 deploy、双快照（entry/level）、`validateMap` 防御；`confirmDeployment` 布阵校验（界内/非山非水/y<4/帅出生位/士宫内/无重叠）通过才进 player 并重设快照；`campaignSourceFrom`/`serializeCampaign` 供存档续打。
- `PlayerProfile` **formatVersion 2**：+ `party/activeIds/bench`（宽容解析，v1 档自动迁移）；`grantBattleReward` 奖励 ≥0 合法（0 仍登记通关，>0 才加钱）——奖励金额改由战斗结算增量（`state.gold - goldAtStart`）提供，列表 `rewardGold` 不再参与。
- 视图流：战役关（id 非 `fixture` 前缀）走 `constructLevel` 链 + deploy 自动确认；演练关保持 `startBattle`。胜利面板「下一关」= `goNextLevel()`（constructLevel(旧战局, next) + 场景内 `rebuildBattleView` 重建，flowStage 须先复位出 `'ended'`）；失败面板「重试」= `retryBattle()`。ResultPanel 子节点按名称约定自发现：NextButton/RetryButton 由 show(opts) 控制显隐。

## 测试与验证

- `MihuayoCheckmateTactics/tests/core/`：纯 Node 测试（无 cc stub）。编译：`node <harness>/node_modules/typescript/bin/tsc -p tsconfig.json`，运行 `node dist/tests/core/run.js`（规则，133 断言）、`node dist/tests/core/fixtures-check.js`（关卡夹具，36 断言）、`node dist/tests/core/campaign-check.js`（战役流，57 断言）。
- 关卡数据 `assets/resources/Levels/*.json`：**仅 v2 格式**（`parseBattleState` 拒绝 v1）；`level-01/02/03` 共用三桥山口 + waveOne（P1 连打基线），`fixture-01/02/03` 演示预告/炮架/连锁。`level-list.json` 保持 formatVersion 1（levels 顺序 = 解锁顺序，线性解锁由 `isLevelUnlocked` 推导）。
- 演练夹具的语义点：F1 受害者走开→missOnly；F2 击杀炮架→缺少炮架 / 双炮架→数量不为一 / 目标走开→空 hits；F3 击杀炮架目标旁单位→尸体仍是炮架（穿透命中）。
- 战役流测试点（campaign-check）：constructLevel 重编号/落位扫描/双快照；finishVictory 一次性结算+幂等+牵引车 SP；checkTerminal 胜/败双路；retryLevel 全回滚（含地形与成长）；两关连打金币与队伍延续（含阵亡复活与后备保留成长）；存档序列化→续打闭环。
