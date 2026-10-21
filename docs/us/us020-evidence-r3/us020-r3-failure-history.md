# US-020 R3 浏览器验收失败与重跑历史（第三轮）

本文件记录第三轮保存边界补验期间的实际失败与重跑，失败记录保留，不冒充通过。最终结论只看 `us020-result.json`（完整运行）与 5.9 节。

| 尝试 | 时间（本机） | 结果 | 实际终止原因 | 保留证据 |
| --- | --- | --- | --- | --- |
| attempt1 | 2026-10-21 10:06–10:57 | 50 行通过后中断 | 非断言失败：C27 第 3 个上下文 `page.goto` 等待 `load` 超过 30 秒（页面加载超时） | `us020-browser-run-attempt1-fail.log`、`us020-result-attempt1-fail.json`、`attempt1-timeout-note.md` |
| attempt2 | 2026-10-21 11:13–11:24 | 38 行通过后中断 | 执行会话被 `TRANSPORT: DeepSeek API request to https://api.deepseek.com failed` 终止，不是验收完成 | `us020-browser-run-attempt2-interrupted.log`（该次未写出最终 result） |
| attempt3 | 2026-10-21 13:53–14:09 | 26 行通过后中断 | 非断言失败：C18 新上下文页面初始化等待 30 秒超时；此前已完成 C01～C06（含 C21 正常地图）等 26 行，pageerror 0 | `us020-browser-run-attempt3-c18-timeout.log`、`us020-result-attempt3-fail.json` |
| 终跑 | 2026-10-21 14:11–14:16 | 54 行全部通过 | 无失败；0 pageerror | `us020-browser-run.log`、`us020-result.json`、`us020-result-table.md`、`c28-audit.json` |

## 重跑前对测试基础设施的调整（仅第三轮，未改断言）

1. attempt1 后：`openMenu`/`reopen` 改为 `waitUntil:'domcontentloaded'` + 60 秒导航超时，上下文内页面默认导航超时 60 秒（attempt1 已记录在 `attempt1-timeout-note.md`）。
2. attempt3 后：每个场景完成后关闭其浏览器上下文；`openMenu`/`reopen` 的页面初始化等待由 30 秒提高到 60 秒；页面默认等待超时 45 秒。
3. 上述调整只影响加载等待与资源清理，**没有删除、放宽或改写任何验收断言、证据要求或通过标准**；终跑使用与 attempt3 相同的业务代码和断言。

## 结论口径

- 本轮以终跑结果为准：54 行结果全部通过（含 C23-M1/M2、C19-U1/C24-U1、C05/C17/C23/C28），28 个唯一用例 ID 齐全，证据文件齐全，最终哈希见 `us020-result.json` / `c28-audit.json` 与 US-020 文档 5.9。
- R2（`docs/us/us020-evidence-r2/`）对应旧“完整最新续局”保存边界，其证据与哈希仅作历史。
