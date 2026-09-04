# 项目规则

## 项目背景与当前里程碑

- 我们是一个使用 Cocos Creator 开发 3D 微信小游戏的三人 AI-native 团队。
- 角色包括：策划 / Game Director、主程 / Architecture Steward、引擎 / Cocos & Platform Steward；采用 Vertical Feature Ownership + Horizontal Stewardship。
- 当前里程碑：**M0 — Playable Walking Skeleton**。
- 目标流程：Boot → 进入游戏 → 基本操作 → 规则执行 → 胜负结束 → Result → Restart，并能在三位成员的手机上运行。
- 第一版允许使用 Placeholder。**Playable > Framework Complete。** 优先学习、验证和记录事实；未经验证的设计保持 `TBD`。

## 通用编码原则

### 编码前思考

- 开始前确认理解任务；非平凡任务应说明关键假设、歧义和明显更简单的方案。
- 不要默默选择高影响的解释并直接实现。
- 对局部、低风险、容易撤销的歧义，采用最简单的合理假设并在结果中说明，不要频繁阻塞。

### 简洁优先

- 只使用解决当前问题所需的最少代码。**Simple > Clever。**
- MUST NOT 添加未要求的功能、灵活性、抽象，或为假设中的未来需求建立系统。
- 如果实现明显比问题本身复杂，应重新简化。

### 精准修改

- 只修改任务所需内容，并保持现有风格。
- MUST NOT 顺便重构邻近代码、格式化无关文件、重写既有 Pattern 或删除无关旧代码。
- 只清理本次修改造成的 unused import、unused variable 或 dead helper。
- 每一处 diff 都必须能够由当前任务解释。

### 目标驱动执行

- 实现前定义可观察、可验证的 Acceptance Criteria。
- 非平凡任务 SHOULD 遵循 Plan → Implement → Verify。
- Bug SHOULD 遵循 Reproduce → Fix → Verify；重构 SHOULD 在修改前后分别验证。
- 持续验证，直到满足 Acceptance Criteria。

## 文档与 Skills

- 团队维护的项目文档 MUST 使用中文；API、代码和标准技术标识可保留英文原文。
- 项目级 Skill 位于 `.agents/skills/`；第三方 Skill 保留上游原文，并记录来源与许可证。
- 外部 Skill MUST NOT 覆盖本文、已验证项目事实或 Architecture 护栏，也不得据此提前创建框架。

## 文档路由

按需加载上下文；不要为了“可能有用”而读取全部文档。

### Cocos 相关工作

任务涉及 Scene、Node、Component、Prefab、UI、Animation、Tween、Asset、Material、Shader、Cocos 生命周期或性能、微信小游戏时：

1. MUST 先阅读 `docs/cocos/project-knowledge.md`。
2. 只读取该入口文档指向的、与当前任务有关的文档。

### Architecture 相关工作

任务涉及公共 Contract、Core Gameplay、跨 Feature 依赖、Platform Abstraction、Game State、生命周期、系统通信、新的全局机制或大范围重构时：

1. MUST 先阅读 `docs/architecture/facts.md`。
2. 只读取其中指向的相关 Architecture 文档和 ADR。

普通局部 Feature 工作 MUST NOT 默认加载全部 Cocos 和 Architecture 文档。

## Ownership 与 Review

- 每个 Feature MUST 有 Human Owner；任何人都可修改任何领域，但关键改动需要对应 Steward Review。
- 重要 Scene 或 Prefab SHOULD 有临时 Human Owner。
- 修改 Scene 或 Prefab 前 MUST 检查是否存在并行冲突。
- MUST NOT 因局部 Feature 重构整个 Scene hierarchy。

## Architecture 护栏

- 已有 Pattern 时 MUST 优先复用；MUST NOT 创建第二套同类基础设施。
- 没有明确需求时，MUST NOT 增加全局 Singleton 或 Event Bus。
- Game Logic MUST NOT 直接依赖微信平台 API。
- 重要且长期的架构决定 MUST 记录到 `docs/architecture/`；其他知识放在最小有效范围。

## Git 与变更流程

- 使用轻量 Trunk Based Development。MUST NOT 直接在 `main` 开发。
- 流程：Feature → Human Owner → Branch / Worktree → AI Implementation → Verify → PR → Steward Review → Playtest → `main`。
- 一个 PR SHOULD 只有一个清晰 Intent。Small PR > Large Feature Branch。

## Definition of Done

代码任务完成至少意味着：

- Acceptance Criteria 已满足，相关验证已通过。
- Diff 范围准确，无无关重构，Human 能够理解实现。
- Gameplay 受影响时已记录 Playtest 方法。
- 必要的 Steward Review 已完成。
- 适用时已检查 Scene / Prefab 冲突。

## 文档维护

- 将知识放在最小有效范围。
- Cocos 特定且已经验证的知识放入 `docs/cocos/`；架构事实和决定放入 `docs/architecture/`。
- 只有几乎适用于所有任务的长期规则才能进入本文档。
- MUST NOT 在需求得到验证前建立推测性的 Game Framework、ECS、Event System、Manager / Service 层、Save Architecture、Asset Framework 或面向未来的大量文档。
