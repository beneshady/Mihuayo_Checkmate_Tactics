# 项目初始化与本机环境

这是一个三人 AI-native 团队的 Cocos Creator 3D 微信小游戏项目。目前处于 M0（Playable Walking Skeleton）准备阶段：先验证最小可玩链路，不预先建设完整游戏框架。

## AI 协作能力

本仓库用三层内容帮助不同 Agent 在同一套边界内工作：`AGENTS.md` 定义长期工程规则，Skills 提供特定任务的工作方法，MCP 提供可调用的本地工具。任何 Skill 或 MCP 操作都必须服从 `AGENTS.md`、项目已验证事实和当前任务范围。

### Cocos Creator Local MCP

MCP（Model Context Protocol）用于让支持它的 AI 开发工具调用外部能力。本项目配置的 `cocos_creator_local` 是一个本地 STDIO 服务，在成员自己的电脑上运行，不依赖共享服务器。

它提供 26 个 Cocos Creator 与微信小游戏工具，能力主要包括：

- 检查本机 Cocos Creator、项目结构与构建环境；
- 通过 Editor Bridge 打开和检查 Scene，并执行明确授权的节点、组件和资源绑定；
- 创建或检查本地微信小游戏构建配置与产物；
- 调用微信开发者工具、检查包体风险并收集本地验证证据。

MCP 有创建项目、脚手架和修改场景的能力，但不会因为安装完成就自动执行。当前阶段不得借此提前创建架构、Scene、Prefab 或 Gameplay；只有具体任务明确需要且符合项目规则时才能调用。Windows 上必须向相关工具显式传入本机实际的 `creatorPath`。

仓库只提交 MCP 配置与引导脚本。服务源码和依赖安装在被忽略的 `.tools/` 中，由每位成员在本机重新生成。Codex 可直接读取 `.codex/config.toml`；其他支持 MCP 的工具需要按各自格式添加同一个本地 STDIO 服务。

### 项目级 Skills

Skills 是给 Agent 使用的任务手册：它们描述处理某类工作时应先检查什么、按什么顺序执行以及如何验证。支持 `.agents/skills/` 的工具可以自动发现；其他 Agent 也可以按任务需要直接读取相应的 `SKILL.md`。

| Skill | 适用场景 |
| --- | --- |
| [`cocos-creator-gameplay-architecture`](.agents/skills/cocos-creator-gameplay-architecture/SKILL.md) | 新增或评审 Cocos Gameplay、TypeScript Component、UI、输入、音频、Tween、碰撞、资源加载等运行时代码。使用前必须先搜索和复用项目已有能力，不得据此预建完整框架。 |
| [`cocos-scene-prefab-assembly`](.agents/skills/cocos-scene-prefab-assembly/SKILL.md) | 组装或修改 Scene、Prefab、Node、Component 和序列化引用。必须遵守 Scene / Prefab Owner、并行冲突与 UUID / meta 边界。 |
| [`cocos-wechat-local-build`](.agents/skills/cocos-wechat-local-build/SKILL.md) | 创建和检查本地 `wechatgame` 构建、包体预算及微信开发者工具流程；只覆盖本地验证，不负责上传或发布。 |
| [`cocos-creator-cli-build-debug`](.agents/skills/cocos-creator-cli-build-debug/SKILL.md) | Cocos Creator 3.x 命令行构建因 Scene、Library 等问题失败时，按证据定位构建阶段和根因。 |
| [`cocos-gray-screen-debug-flow`](.agents/skills/cocos-gray-screen-debug-flow/SKILL.md) | Preview 出现灰屏或黑屏时，区分脚本加载、场景、Camera、渲染和资源问题后再修复。 |
| [`cocos-creator-adaptation`](.agents/skills/cocos-creator-adaptation/SKILL.md) | 处理多分辨率、多机型、Canvas、Widget 与安全区适配。 |

这些 Skills 是固定上游版本的第三方内容，来源、提交版本、许可证和项目兼容补充见 [第三方 Skills 来源](.agents/skills/third-party-sources.md)。它们提供工作方法，不代表项目已经采用其中提到的所有架构或系统。

## 新成员快速开始

1. 克隆仓库并进入项目根目录。
2. 使用自己的 AI 开发工具打开该目录，并按工具要求授予项目所需的本地访问权限。
3. 确认本机已经安装 Git、Node.js 20 或更高版本，以及 Cocos Creator 3.8.8。
4. 向自己的 Agent 发送下方的“初始化提示”。Agent 会阅读项目规则，并安装仓库所需的本地 MCP 工具。
5. 完成后重新加载所使用的 AI 开发工具，并检查 MCP 是否可用。

## 本机前置条件

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| Git | 可在终端使用 | 用于克隆仓库和固定 MCP 上游版本。 |
| Node.js | 20 或更高版本 | 引导脚本会检查版本并使用 npm 安装 MCP 依赖。 |
| Cocos Creator | 3.8.8 | 当前 Windows 开发机的已知路径是 `C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe`。其他路径可以使用，但后续 Cocos MCP 操作必须显式提供实际 `creatorPath`。 |
| AI 开发工具 | 支持本地项目与 Agent 工作流 | 应能读取项目文件并执行本地命令；对 `AGENTS.md`、Skills 和 MCP 的自动发现能力以所用工具为准。 |

微信开发者工具不是当前前置条件。它的安装、CLI 路径、模拟器与真机调试将在需要微信小游戏构建时另行验证。

## 发给 Agent 的初始化提示

在仓库根目录新建 Agent 任务后，直接发送：

```text
请初始化这台机器上的项目开发环境。先完整阅读 README.md 与 AGENTS.md；不要创建 Cocos 工程、Scene、Prefab 或 Gameplay。

先检查 Git、Node.js（需要 20+）和 Cocos Creator 3.8.8 是否可用。若缺少系统级软件或 Cocos 编辑器，请说明缺失项和实际发现的路径，不要自行安装系统软件。

若前置条件满足，请执行 tools/setup-cocos-local-mcp.ps1，允许它在 .tools/ 下下载固定提交、安装依赖、构建并检查 cocos-creator-local-mcp。不要提交 .tools/，不要安装微信开发者工具，不要发布或上传任何产物。

完成后检查 cocos_creator_local MCP 是否可用，报告验证结果、已知 Windows 限制和下一步需要人工处理的事项。如果当前工具不识别 .codex/config.toml，请说明该工具需要的本地 MCP 配置方式，不要擅自修改仓库共享配置。
```

Agent 在下载依赖前可能会请求网络或本机执行权限；这是正常的安装确认。只在确认当前仓库可信后批准。

## 引导脚本做什么

`tools/setup-cocos-local-mcp.ps1` 会将 `cocos-creator-local-mcp` 下载到未提交的 `.tools/cocos-creator-local-mcp/`，并固定到仓库记录的提交版本。随后它执行依赖安装、构建与上游检查。

脚本不会创建游戏工程或资源，不会修改 Scene / Prefab，也不会安装微信开发者工具、上传构建结果或使用生产凭据。若 MCP 工具目录已有未提交改动，脚本会停止而不是覆盖它。

Windows 上，上游检查目前会报告 3 个已知的路径分隔符兼容失败；其余构建检查可以通过。遇到这一条已记录警告时，Agent 应报告为“部分能力待验证”，而不是把脚手架或运行中 Creator 进程识别宣称为可用。

## 成功标志

- Agent 已读取 `AGENTS.md`；若所用工具支持项目级 Skills，也已发现仓库中的六个 Cocos Skills。
- `cocos_creator_local` 已在当前 AI 开发工具中启用；Codex 用户可使用 `codex mcp list` 检查。
- `.tools/` 未被 Git 跟踪。
- Cocos Creator 的实际路径已记录；需要调用 Cocos 工具时显式传入该路径。

项目规则由 [AGENTS.md](AGENTS.md) 定义；Cocos 项目知识入口在 [docs/cocos/project-knowledge.md](docs/cocos/project-knowledge.md)。架构事实与决策请从 [docs/architecture/facts.md](docs/architecture/facts.md) 开始按需阅读。

## 推送前检查

推送前确认要包含：`AGENTS.md`、`.agents/skills/`、`.codex/config.toml`、`docs/`、`tools/`、`.gitignore` 和本文件。不要提交 `.tools/`、`node_modules/`、Cocos 本地缓存、个人配置、访问令牌或微信相关凭据。
