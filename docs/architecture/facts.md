# 已确认的项目架构事实

本文档是项目已经验证并采用的架构事实入口。只读取与当前任务有关的内容。

## 当前事实

- 当前里程碑是 M0 — Playable Walking Skeleton。
- 交付 Ownership 采用 Vertical Feature Ownership + Horizontal Stewardship。
- Playable 优先于 Framework Complete。
- Game Logic 不得直接依赖微信平台 API。
- 必须优先复用已有 Pattern，不得创建功能相同的并行基础设施。
- 全局 Singleton、Event Bus 和其他全局机制必须有明确需求。

## 当前架构

已接受 [ADR-0001 · 游戏逻辑分层——纯 TS 规则 / 哑视图 / 薄协调者](decisions/0001-gameplay-layering.md)：纯 TS Core（规则/解析/坐标）→ 哑视图（Builder/Component）→ 薄协调者（GameManager）；战局状态唯一事实源在 GameManager、视图为投影；规则模块放 `Scripts/Core`。

其余（Game State 模型细节、跨 Feature Contract、系统通信、Platform Boundary、Save System 和其他应用架构）仍为 `TBD`；在验证之前不得将可能的方案写成项目规则。

## 移植进度事实（P1/P2 已验证）

以下事实由 Core 测试（run 133 + fixtures 36 + campaign 57 + shop 44 = 270 断言全绿）与原型 `preview/web/js/rules.js` 对拍验证：

- **战役链路（P1）**：`constructLevel(source, json, {next, levelNo})` 产出 deploy 态并写入 entry/levelSnapshot 双快照；`syncParty` 在每次 `applyAction` 尾部把存活/阵亡状态同步回 party 底册；`retryLevel` 从 levelSnapshot 完整回滚且 `phase='deploy'`；`finishVictory` 幂等结算（杀敌金币 + 终局奖励）。
- **商店与布阵（P2）**：`buyRecruit`（兵 3 / 车·马·炮 5 金，仅 intermission，≤8 直接入 activeIds 否则入 bench）、`setActiveRoster`（intermission，去重/未知 id/超 8 拒绝）、`deployUnit`（deploy 态，我方半场 y<river、非山非水非占用，帅不可移）均为纯函数——**失败返回原 state 引用**，视图层以 `next === state` 判定拒绝；`confirmDeployment` 校验通过后 phase 推进。这一「引用不变 = 拒绝」的约定是 Core 与视图的稳定 Contract。
- **占位 UI 挂载约定**：商店面板 `UI/IntermissionPanel` 与 `UI/DeployConfirmButton` 按名称在 Canvas/UI 下自发现；IntermissionPanel 组件由 GameManager 运行时动态 `addComponent` + `wire()`（编辑器脚本热重载不可用，场景序列化挂载不可依赖）；面板缺失时降级为直接开下一关（可玩优先）。
- **编辑器事实**：bridge `/scene/open-scene` 只接受 `sceneUuid`（传 path 会落到空场景 scene-2d）；外部新增脚本对编辑器不可见，需 `asset-db create-asset` 强制入册（内容可能被清空，需重写）；被清空/未挂载的自定义组件走运行时 addComponent 兜底。

## 架构决定

长期且高影响的决定记录在[架构决策记录说明](decisions/decision-records.md)中。只有相关主题已经形成具体、可复用的事实时，才创建专题架构文档，并从本页添加链接。
