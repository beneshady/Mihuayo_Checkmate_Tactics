# Cocos 3.x 与微信小游戏开发基线

本文档是在项目尚未形成实际实现 Pattern 时使用的验证前基线。它用于减少常见风险，不代表已经决定完整 Architecture。真实项目结构、运行证据和已接受 ADR 与本文不一致时，以更窄范围的已验证事实为准。

## 当前适用状态

- 当前开发机已确认存在 Cocos Creator 3.8.8，但项目本身尚未创建，最终引擎版本仍为 `TBD`。
- 屏幕方向、设计分辨率、资源分包、性能预算和微信能力接入方式均须通过 Vertical Slice 验证。
- 不因本文预先创建 Manager、Service、Event Bus、对象池或资源框架。

## Component 与 Logic

- `Component` 负责 Cocos 生命周期、Node / Component 引用、序列化属性和 Engine 交互。
- 游戏规则与状态计算在脱离 Engine 后更容易理解或验证时，SHOULD 使用纯 TypeScript；不要为了形式强行拆层。
- 使用 `@property` 声明需要编辑器配置的引用和参数；必填引用缺失时应给出可定位的错误。
- 优先使用序列化引用或初始化时查询并缓存。MUST NOT 在热路径中重复 `find` 或 `getComponent`。

## 生命周期与事件

- `onLoad` 用于建立组件自身不变量和缓存本地引用；依赖其他组件已完成初始化的逻辑放到约定明确的后续阶段。
- `start` 用于首次启用后的启动逻辑，不用于代替长期状态管理。
- `onEnable` 注册的事件、回调和定时任务，MUST 在 `onDisable` 成对解除。
- `onDestroy` 负责最终释放仍由该组件持有的外部引用、监听和异步任务。
- 只有真正逐帧变化的行为才使用 `update`；MUST NOT 在其中动态加载资源、频繁查找组件或制造可避免的临时对象。
- 异步回调执行前，应确认所属 Node / Component 仍有效，避免销毁后继续写状态。

## Scene 与 Prefab

- Scene 负责入口、顶层组合和全局可见关系；Prefab 用于可复用、可独立初始化的节点结构。
- 修改重要 Scene / Prefab 前，MUST 确认 Human Owner 和并行 Branch / Worktree 冲突。
- 默认通过 Cocos Editor 或经过验证的编辑器工具修改序列化资产；MUST NOT 手工改写 `.scene`、`.prefab`、`.meta` 或 UUID。
- 只读检查序列化内容可用于诊断；如恢复损坏资产确实需要直接编辑，必须单独说明风险、保留可恢复副本并在 Editor 中重新导入验证。
- 不复制巨大 Node hierarchy，也不为局部 Feature 重排无关层级。重复且边界稳定的结构才考虑 Prefab。

## 资源所有权

- 常驻且随 Scene / Prefab 存在的资源优先使用序列化引用。
- 动态加载前必须明确 Owner、存活期、失败行为和释放时机。原则：谁加载，谁负责结束所有权。
- `preload`、`load`、缓存和 `release` 必须围绕实际使用期设计；不得仅因“以后可能复用”永久缓存。
- Asset Bundle、首包、分包和远程资源策略必须基于真实资源清单与当前微信平台限制决定，当前保持 `TBD`。
- 释放前确认资源是否被其他 Scene、Prefab、缓存或实例共享，避免错误释放仍在使用的依赖。

## 移动端性能

- 性能问题先测量再修改，按 CPU、GPU、Memory 三类定位，不凭感觉直接优化。
- CPU 重点检查逐帧 JS allocation、脚本 `update`、物理、动画、频繁 `instantiate` / `destroy` 和重复组件查询。
- GPU 重点检查 Draw Call、Triangle、Overdraw、透明材质、实时光照、Shadow 和后处理。
- Memory 重点检查 Texture、Mesh、Audio、动态资源生命周期与未释放引用。
- 高频生成销毁被实际测量为问题后，再引入最小对象池；不得预先建设通用 Pool Framework。
- 新增性能敏感功能时记录测试设备、场景、复现步骤与 FPS / CPU / GPU / Memory 证据；阈值由项目验证后确定。

## 微信平台边界

- Game Logic MUST NOT 直接调用 `wx.*`、`tt.*` 或 `qq.*`。
- 登录、存储、广告、分享、振动等能力通过最小的平台边界接入；边界名称和形态由首个真实能力决定，不预设完整 `PlatformService`。
- 平台返回值应在边界处转换为项目可理解的数据或错误，避免平台类型扩散到 Gameplay。
- Editor 与纯逻辑验证应允许使用最小 Fake / Stub；平台能力的真实性只能在对应运行环境中确认。

## 屏幕适配

- 开始 UI 或 Scene 组装前，先明确目标方向、设计分辨率、fit 策略、Gameplay 区域、HUD 区域和安全区行为。
- 使用 Canvas、Widget、Layout、Anchor 与 SafeArea 组织界面；不要按单一桌面预览尺寸写死全局绝对坐标。
- 背景、核心内容和 HUD 可以采用不同适配策略；不得简单拉伸导致内容变形。
- 至少在代表性的窄屏、长屏和宽屏比例验证可见性、可点击性和安全区；最终机型矩阵仍为 `TBD`。

## 本地构建与验证口径

- 当前已确认 Cocos Creator 可执行文件：`C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe`。
- 微信开发者工具与 CLI 路径尚未确认，涉及模拟器、预览码或真机调试的任务必须报告为待配置。
- 2026-09-04 在 Windows 上验证：MCP 依赖安装、TypeScript 检查和构建通过；上游测试因路径分隔符出现 3 个兼容失败，脚手架生成和运行中 Creator 进程识别仍为待验证能力。
- MCP STDIO 协议握手及 26 个工具的发现已通过；其内置环境探测仅检查 macOS 默认路径，Windows 上调用相关工具时必须显式传入 `creatorPath`。
- “TypeScript 通过”“Cocos Build 完成”“Build 产物检查通过”“DevTools 已打开”“真机 Runtime 已验证”是不同状态，不得相互替代。
- 本项目当前只配置本地开发工具，不执行上传、审核、发布、支付、广告或生产凭据操作。

## 参考

- [Cocos Creator 3.8 用户手册](https://docs.cocos.com/creator/3.8/manual/en/)
