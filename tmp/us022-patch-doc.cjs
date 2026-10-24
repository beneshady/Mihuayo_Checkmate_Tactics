// 一次性补丁：修正 US-022 交付记录中的计数与实际数据。
const fs = require('node:fs');
const p = 'docs/us/US-022-elephant-control-skills.md';
let t = fs.readFileSync(p, 'utf8');
const pairs = [
  ['- 验收结果：E01～E21 共 21 项、按子分支记录的实际结果见 9.4；浏览器验收 25/25 通过、页面零 `pageerror`，规则测试 19/19 通过，既有回归套件 200/200 通过。',
    '- 验收结果：E01～E21 共 21 项、按子分支记录的实际结果见 9.4；浏览器验收 25/25 通过、页面零 `pageerror`，本次定向规则测试 19/19 通过，全量规则测试套件 200/200 通过（含本次 19 项，其余为既有回归）。'],
  ['- 截图（48 个文件）：`docs/us/us022-evidence/*.png`',
    '- 截图（47 个 PNG，证据目录共 49 个文件）：`docs/us/us022-evidence/*.png`'],
  ['（截图 `e20-*.png`，共 12 张）', '（截图 `e20-*.png`，共 13 张）'],
  ['- 正常入口实际步骤（E20，全部真实点击，未注入游戏状态）：菜单“开始游戏”→ 跳过教学 → 主营地（猫粮 8、SP 0、无象）→ 选第 1 关 → 布阵 → 真实点击游玩至胜利（本次 10 回合、击杀 10、公共 SP 10、猫粮 18/22）',
    '- 正常入口实际步骤（E20，全部真实点击，未注入游戏状态）：菜单“开始游戏”→ 跳过教学 → 主营地（猫粮 8、SP 0、无象）→ 选第 1 关 → 布阵 → 真实点击游玩至胜利（本次 8 回合、击杀 10、公共 SP 10、猫粮 22）'],
  ['- 本次新增未跟踪文件：`tests/us022-elephant.test.cjs`、`tests/us022-acceptance-browser.cjs`、`docs/us/us022-evidence/`（含 48 个证据文件）',
    '- 本次新增未跟踪文件：`tests/us022-elephant.test.cjs`、`tests/us022-acceptance-browser.cjs`、`docs/us/us022-evidence/`（含 49 个证据文件）']
];
for (const [a, b] of pairs) {
  if (t.split(a).length - 1 !== 1) { console.error('anchor missing:', a.slice(0, 70)); process.exit(1); }
  t = t.split(a).join(b);
}
fs.writeFileSync(p, t);
console.log('doc numbers corrected');
