# UUID 与序列化引用检查

UUID 排查默认是只读诊断。不得直接生成、替换或复制 `.meta` 中的 UUID，也不得用文本替换批量修改 Scene / Prefab。

1. 先在 Cocos Editor 中确认是否显示 Missing Asset 或 Missing Script。
2. 只读检查 Scene / Prefab 是否为有效 JSON，并记录报错位置。
3. 对可疑 UUID，使用 AssetDB 或 Editor 的资源信息定位实际资产；不要猜测对应关系。
4. 确认资产文件与其 `.meta` 成对存在，且没有因复制文件产生冲突 UUID。
5. 优先在 Editor 中重新绑定资源并保存，再重新导入和验证。

若序列化资产已损坏且 Editor 无法打开，应从版本控制或已知良好副本恢复。没有可恢复来源时，先请求 Human Owner 决策。
