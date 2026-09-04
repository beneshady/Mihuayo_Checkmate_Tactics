# 渲染管线或相机无输出

适用于 FPS 为零、极低，或 Console 出现 Camera、Framebuffer、Render Pipeline 错误的情况。

1. 保存最早的渲染错误、运行平台、显卡信息和 Cocos Creator 版本。
2. 在 Editor 中确认有效 Camera、可见 Layer、Clear Flag、Projection 和 Near / Far 参数。
3. 检查 Canvas、UI Camera、节点 Layer 与 Camera Visibility 是否匹配。
4. 暂停最近新增的材质、后处理、实时光照或 RenderTexture，以最小可恢复改动定位回归。
5. 使用最小 Scene 对照验证是项目资产问题、平台适配问题还是引擎问题。

不得因为灰屏直接重建整个 Scene。只有证据指向具体资产或节点时才做局部修改，并保留前后截图与 Console 结果。
