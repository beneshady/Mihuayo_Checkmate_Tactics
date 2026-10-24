// 一次性补丁：把本次复跑的共享 UI 回归结果写入交付记录。
const fs = require('node:fs');
const p = 'docs/us/US-022-elephant-control-skills.md';
let t = fs.readFileSync(p, 'utf8');
const anchor = '4. 正常入口实际步骤（E20，全部真实点击，未注入游戏状态）：';
const c = t.split(anchor).length - 1;
if (c !== 1) { console.error('anchor count', c); process.exit(1); }
const line = '4. 共享 UI 定向回归（避免象改动影响既有界面）：`node tests/ui-headless.test.cjs` → 11/11 pass、`browserErrors: []`；`US021_EVIDENCE_DIR=tmp/us022-reg-us021 node tests/us021-acceptance-browser.cjs` → 33/33 pass、`pageErrors 0`（证据重定向到 tmp/，未覆盖 US021 原证据目录）。这两项只覆盖被象改动波及的共用界面路径（模式按钮、预览、意图、血量标签、行动额度）。\n';
t = t.split(anchor).join(line + '5. 正常入口实际步骤（E20，全部真实点击，未注入游戏状态）：');
// 后续序号顺延
t = t.split('5. E18/E19 使用 `localStorage` 副本').join('6. E18/E19 使用 `localStorage` 副本');
t = t.replace('5. E18/E19 使用 `localStorage` 副本（隔离浏览器上下文），未接触用户旧局；E21 在隔离上下文中用手机视口重新走营地招募与战斗夹具。',
  '6. E18/E19 使用 `localStorage` 副本（隔离浏览器上下文），未接触用户旧局；E21 在隔离上下文中用手机视口重新走营地招募与战斗夹具。');
fs.writeFileSync(p, t);
console.log('doc regression line added');
