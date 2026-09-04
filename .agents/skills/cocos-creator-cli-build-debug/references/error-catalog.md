# CLI 构建错误排查补充

本文档用于补齐上游 Skill 缺失的引用，不代表完整的 Cocos 错误码目录。遇到未知错误时，应保存完整日志并依据当前项目与官方文档定位，不要套用未经验证的结论。

## 排查顺序

1. 记录 Cocos Creator 版本、完整构建命令、退出码和日志路径。
2. 先处理 TypeScript 编译错误，再检查 Build 配置、Start Scene 和资源导入错误。
3. 对 Scene / Prefab 只做只读结构检查；默认通过 Editor 修复，不直接修改序列化文件或 `.meta` / UUID。
4. 清理缓存或重建前，确认目标是可再生目录，并记录清理前后的结果。
5. 区分编译通过、Build 完成、产物完整和 Runtime 正常，禁止以其中一个替代其他验证。

## 已知分类

| 现象 | 优先检查 |
| --- | --- |
| TypeScript / Module 错误 | 项目 `tsconfig`、实际 import、Cocos 类型声明与首个错误位置 |
| Scene / Prefab 导入错误 | JSON 是否可读、资源是否由当前 Creator 版本导入、绑定组件是否存在 |
| 资源缺失 | AssetDB 导入状态、引用路径、Bundle 配置和对应 `.meta` 是否存在 |
| 微信构建失败 | `wechatgame` Build 配置、产物日志、平台适配与当前官方限制 |

若日志无法证明根因，只报告已观察事实和下一项最小验证，不直接改写 Scene 或引入替代架构。
