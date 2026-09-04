# 第三方 Skills 来源

以下 Skill 按固定提交原样引入。上游内容可能包含与当前项目不一致的操作系统、引擎版本或架构建议；使用时必须服从根目录 `AGENTS.md` 和项目已验证事实。

| Skills | 上游仓库 | 固定提交 | 许可证 |
| --- | --- | --- | --- |
| `cocos-creator-gameplay-architecture`、`cocos-scene-prefab-assembly`、`cocos-wechat-local-build` | `lightblink/cocos-creator-local-mcp` | `5a326291fbbbed2c1354ccfbd55e988e2b447162` | MIT |
| `cocos-creator-cli-build-debug`、`cocos-gray-screen-debug-flow` | `ChrisLamDev/cocos-creator-debug-skills` | `18cd3854c8dae009752389728677fcb119d915f0` | MIT，Copyright (c) 2026 Chris Lam |
| `cocos-creator-adaptation` | `Wade-DevCode/awesome-coding-skills-cn` | `822eef7c0848ab3613df479d5882977126d58928` | MIT，Copyright (c) 2026 Wade-DevCode |

完整许可证文本位于 `licenses/`。更新 Skill 时必须同时更新固定提交、许可证记录，并重新检查与项目规则的冲突。

## 已知上游限制

- `cocos-creator-cli-build-debug` 与 `cocos-gray-screen-debug-flow` 的上游目录只包含 `SKILL.md`，但正文引用了未随仓库提供的 `references/` 文件；本项目在对应路径提供中文安全诊断补充，补充内容不属于上游原文。
- 上述两个 Skill 的附加 `triggers` 元数据存在非标准 YAML 缩进，导致 Codex 无法发现。项目仅修正生效文件中的该缩进；上游原件保存在各自的 `UPSTREAM_SKILL.md`，正文未改。
