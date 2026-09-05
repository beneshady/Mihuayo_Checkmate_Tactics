# Cocos 项目知识

本文档是项目特定 Cocos Creator 与微信小游戏知识的入口。只读取当前任务实际需要的内容。

## 当前事实

- 产品目标是使用 Cocos Creator 开发 3D 微信小游戏。
- 团队目前仍在积累 Cocos Creator 经验；M0 阶段允许使用示例和 Placeholder。
- 当前开发机已确认 Cocos Creator 3.8.8 实际安装路径为 `E:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe`（不是文档早期记录的 C 盘路径；调用工具时必须显式传入 `creatorPath`）。
- **2D/UI 渲染顺序（已验证 + 官方手册确认）**：Canvas 下的 UI 节点按节点树**深度优先**排序渲染，`siblingIndex` 控制同级顺序，最后一个渲染的显示在最上层；`UIRenderer.priority` 在该场景下不生效。来源：[Cocos 3.8 手册 · 渲染排序规则](https://docs.cocos.com/creator/3.8/manual/zh/ui-system/components/engine/priority.html)。
- **等距地图方向（已踩坑验证）**：Cocos 的 `+y` 轴向上。等距投影中深度（x+y）越大越靠近镜头，因此 `isoY` 必须随深度**递减**（`isoY = -(x+y)*halfTileH + offset`）。若随深度递增，整张地图上下颠倒，前景砖的墙体会压住后景砖的顶面，表现为"内部楼梯"。渲染顺序本身正确时也会出现，属于坐标系方向问题而非排序问题。
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
