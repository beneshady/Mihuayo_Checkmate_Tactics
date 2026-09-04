# Cocos 项目知识

本文档是项目特定 Cocos Creator 与微信小游戏知识的入口。只读取当前任务实际需要的内容。

## 当前事实

- 产品目标是使用 Cocos Creator 开发 3D 微信小游戏。
- 团队目前仍在积累 Cocos Creator 经验；M0 阶段允许使用示例和 Placeholder。
- 当前开发机已发现 Cocos Creator 3.8.8：`C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe`。
- 项目尚未创建，因此团队最终采用的 Cocos Creator 版本、支持设备基线、导出流程和性能预算仍为 `TBD`。
- 当前尚未验证任何项目特定的 Cocos 实现 Pattern。

## 专题导航

- [Cocos 3.x 与微信小游戏开发基线](development-baseline.md)：项目验证前的 Component、Scene / Prefab、资源、性能、平台隔离、屏幕适配和本地构建基线。

## Scene 与 Prefab 修改

- 重要 Scene 和 Prefab SHOULD 有临时 Human Owner。
- 修改前 MUST 检查其他 Branch 或 Worktree 是否正在修改同一资产。
- 保持局部修改；MUST NOT 为局部 Feature 重构整个 hierarchy。
- 修改影响 Gameplay 或表现时，应记录可执行的 Playtest 方法。

## 增加项目知识

只有存在真实、可复用的内容时才创建专题文档。记录团队实际验证过的做法、项目约定、已踩过的坑、推荐或禁止的 Pattern、示例及相关官方文档链接。不要复制 Cocos 官方手册，也不要创建空的专题文件。

具体的 Scene / Prefab、UI / Animation、Asset、Material / Shader、微信小游戏导出和性能方案，在实际探索前均为 `TBD`。创建新文档后，必须从本页添加链接。
