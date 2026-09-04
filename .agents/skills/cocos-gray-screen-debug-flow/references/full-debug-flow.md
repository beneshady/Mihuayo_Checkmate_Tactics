# 灰屏与黑屏完整排查补充

按从低风险到高风险的顺序执行，每一步记录观察结果后再进入下一步。

1. 确认运行目标、Cocos Creator 版本、Start Scene 与问题是否可稳定复现。
2. 保存 Console 中第一个错误；先修复编译和模块加载错误。
3. 根据 FPS、Draw Call 和生命周期日志区分[脚本未执行](case-a-script-failure.md)与[渲染无输出](case-b-render-failure.md)。
4. 检查 Camera、Canvas、Layer、节点激活状态和自定义 Component 绑定。
5. 对 Missing Asset / Script 使用[UUID 与序列化引用检查](uuid-debug.md)，默认只读诊断并通过 Editor 修复。
6. 建立最小 Scene 对照，判断问题属于项目内容、平台构建还是引擎环境。
7. 修复后重新执行相同复现步骤，检查画面、输入、Console 和退出 / Restart 路径。

清理 Library、重建 Scene、修改 Render Pipeline 或编辑序列化文件都属于高影响动作，必须有具体证据和可恢复方案。
