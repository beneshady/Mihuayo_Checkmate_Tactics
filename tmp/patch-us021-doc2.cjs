// 修正 US-021 文档两处说明（不作为交付物）。
const fs=require('fs');
const p='docs/us/US-021-horse-jump-skills.md';
let c=fs.readFileSync(p,'utf8');
function rep(a,b){if(!c.includes(a))throw Error('miss: '+a.slice(0,60));c=c.split(a).join(b);}
rep('`tests/us021-acceptance-browser.cjs`（25 步实际浏览器：正常入口 H20 主链路 + 专项界面 + 旧档副本 + 手机横版）',
    '`tests/us021-acceptance-browser.cjs`（26 步实际浏览器：正常入口 H20 主链路 + 专项界面 + 旧档副本 + 手机横版）');
rep('- **旧证据被重跑覆盖**：`tests/ui-headless.test.cjs` 按脚本设计会把截图与 `ui-result.json` 写入 `docs/us/us007-us011-evidence/ui-regression/`，本次重跑刷新了这些旧证据文件（未手工编辑）。',
    '- **旧证据重跑后已还原**：`tests/ui-headless.test.cjs` 等旧脚本按设计会把截图/结果写入 `docs/us/us007-us011-evidence/`、`docs/us/us015-evidence/`、`docs/us/us017-evidence/`、`docs/us/us018-evidence/`、`docs/us/us019-evidence/`、`docs/us/us020-evidence-*`；本次重跑产生的改动已用 `git checkout -- <这些证据目录>` 还原为提交版本，未纳入交付（本任务证据只在 `docs/us/us021-evidence/`）。');
fs.writeFileSync(p,c);
console.log('doc fixed');
