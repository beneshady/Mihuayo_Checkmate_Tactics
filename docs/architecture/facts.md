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

## 架构决定

长期且高影响的决定记录在[架构决策记录说明](decisions/decision-records.md)中。只有相关主题已经形成具体、可复用的事实时，才创建专题架构文档，并从本页添加链接。
