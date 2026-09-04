# 有帧率但脚本未执行

适用于 Preview 有稳定帧率，但 Gameplay Logic、UI 或自定义 Component 没有运行证据的情况。

1. 查看 Console 中最早出现的 TypeScript、模块导入或 Component 反序列化错误。
2. 确认目标 Scene 是实际启动 Scene，目标 Node 已激活，自定义 Component 已挂载且启用。
3. 核对 `@ccclass` 名称、脚本导入状态和编辑器中的 Missing Script 提示。
4. 在 `onLoad` 添加一次临时、可定位的日志，确认生命周期是否进入；验证后清理该日志。
5. 检查父 Node 激活状态和执行顺序假设，不通过轮询或全局 Singleton 掩盖初始化问题。

修复后重新加载 Scene，并同时验证 Console 无新增错误、Component 生命周期进入和首个可见状态出现。
