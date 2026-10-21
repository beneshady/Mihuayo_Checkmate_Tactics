# US-020 R3 浏览器验收尝试 1（失败，历史保留）

- 时间：2026-10-21 10:06–10:57（本机）。
- 运行：`node tests/us020-acceptance-browser.cjs`，服务 `http://127.0.0.1:8777/`（既有 Python 静态服务，未停止）。
- 实际结果：脚本已写出的 50 行全部为“通过”，`pageErrors` 为 0；尚未进入 C28 审计。
- 终止原因：C27 第 3 个独立上下文在 `openMenu()` 的 `page.goto` 等待 `load` 超过 Playwright 默认 30 秒而超时，脚本 catch 分支写出失败结果后退出。属本机页面加载/导航超时，不是规则断言失败；C27 前两个上下文已产出 `c27-desktop-select.png`、`c27-desktop-skip.png`。
- 处理：保留本失败日志与结果 JSON；将测试辅助函数 `openMenu`/`reopen` 改为 `waitUntil:'domcontentloaded'` + 60 秒导航超时，并为上下文内页面设置 60 秒默认导航超时；未修改任何验收断言或通过标准。随后完整重跑，成功结果以 `us020-browser-run.log` 与 `us020-result.json` 为准。
- 本目录截图可能被成功重跑覆盖；失败当时的结果行见 `us020-result-attempt1-fail.json`。
