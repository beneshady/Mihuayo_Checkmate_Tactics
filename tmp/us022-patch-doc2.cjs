// 一次性补丁：修正交付记录中的计数与实际数据（避免 shell 转义问题）。
const fs = require('node:fs');
const p = 'docs/us/US-022-elephant-control-skills.md';
let t = fs.readFileSync(p, 'utf8');
const pairs = [
  ['- 验收结果：E01～E21 共 21 项、按子分支记录的实际结果见 9.4；浏览器验收 25/25 通过、页面零 `pageerror`，规则测试 19/19 通过，既有回归套件 200/200 通过。',
    '- 验收结果：E01～E21 共 21 项、按子分支记录的实际结果见 9.4；浏览器验收 25/25 通过、页面零 `pageerror`，本次定向规则测试 19/19 通过，全量规则测试套件 200/200 通过（含本次 19 项，其余为既有回归）。'],
  ['- 截图（48 个文件）：', '- 截图（47 个 PNG，证据目录共 49 个文件）：'],
  ['（截图 `e20-*.png`，共 12 张）', '（截图 `e20-*.png`，共 13 张）'],
  ['（含 48 个证据文件）', '（含 49 个证据文件）']
];
for (const [a, b] of pairs) {
  if (t.split(a).length - 1 !== 1) { console.error('missing:', a.slice(0, 60)); process.exit(1); }
  t = t.split(a).join(b);
}
fs.writeFileSync(p, t);
console.log('all doc numbers fixed');
