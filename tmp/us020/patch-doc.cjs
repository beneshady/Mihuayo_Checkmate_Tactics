// US-020 交付记录收尾：修正 5.3 反引号并补充 5.4/5.5。
const fs=require('fs');
const p='docs/us/US-020-main-camp.md';
let t=fs.readFileSync(p,'utf8');
const i=t.indexOf('### 5.3');
if(i<0)throw Error('5.3 missing');
const head=t.slice(0,i);
const tail=[
 '### 5.3 与规则层用例的对应',
 '',
 '- `tests/us020-camp.test.cjs` 覆盖 C03/C04/C05/C07/C08/C09/C10/C11/C12/C13/C14/C16/C17/C18/C19/C20/C23/C24/C25 的规则与存档断言（20 项全通过）；浏览器用例覆盖同一 ID 的界面与流程分支。',
 '- C02 的「教学失败/重试」与「老玩家跳过」在浏览器专项执行；C22 预览一致性在浏览器专项执行；C27 双模式在 1280×720 与 844×390 两种上下文执行。',
 '- C28 由静态检查（无三选一/关间商店/固定 8 人文案）与全部用例汇总构成，最终哈希见 `docs/us/us020-evidence/us020-result.json`。',
 '',
 '### 5.4 未验证项与遗留问题',
 '',
 '1. **平衡与体验为 TBD**：教学时长与理解度、全旅程经济（教学 G=1 + 首营 8 + 每关约 12～18 猫粮）是否够用或过松；本轮只验证规则与流程可玩通，不证明好玩或平衡。',
 '2. **截图未做人工目视检查**：本轮开发模型不支持读图，`docs/us/us020-evidence/` 的 28 张截图仅作记录；界面可用性以 DOM 可见性、可点击性与 0 pageerror 断言，视觉排版仍需 Codex 或人工复核。',
 '3. **真机未验证**：手机横版为 844×390 浏览器上下文（显示模式按既有规则切换），不是真机触控；C27 只覆盖该参考视口。',
 '4. **战斗中刷新**：刷新回到主营地（本关不扣资源、不判负也不判胜），未实现战斗内续局（沿用 US-012 S3 未完成项），本轮未承诺。',
 '5. **旧存档迁移**不在本次确认范围：旧版本没有旅程存档（仅地图库 `m0-map-library-v1`），新存档使用独立键 `m0-journey-v1`，不改写既有地图库。',
 '6. **`tsc` 类型检查未执行**：本机未安装 typescript 且网络受限（`npx` 拉取 EPERM），仅以 `node --test` 与浏览器验收作为通过依据。',
 '7. 教学关为全陆地固定局面；编辑器地图、三个正式关的地形与第二波节奏未改动；US016 草案中的「首次提示清单」等未实施（US-020 只要求教学与主营地流程）。',
 '',
 '### 5.5 提交状态',
 '',
 '- 分支 `codex/web-gameplay-validation`，**未提交**（工作区包含本次 US-020 业务代码、测试与文档改动）。',
 '- 本轮新增：`web/js/journey.js`、`web/js/tutorial.js`、`web/camp.css`、`tests/us020-camp.test.cjs`、`tests/us020-acceptance-browser.cjs`、`tests/us020-report.cjs`、`docs/us/us020-evidence/`。',
 '- 本轮修改：`web/index.html`、`web/js/{rules,app,campaign,ui}.js`、`tests/{legacy-rules,shared-sp,us018-advisor,us019-commander,v23-contract,replay,maps,cannon-purchase}.test.cjs`、`tests/{ui-static,ui-headless}.test.cjs`（后两项为浏览器脚本）。',
 ''
].join('\n');
fs.writeFileSync(p,head+tail);
console.log('5.3/5.4/5.5 written');
