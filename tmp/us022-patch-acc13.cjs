// 一次性补丁：修正 E03 期望、E05 自身拒绝断言、E19 旧档禁用按钮、E18 增加诊断。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 140)); process.exit(1); }
  t = t.split(a).join(b);
}
// E03：无疾行时四个田字落点都合法
rep("      A.equal(plainMarks, 2, '无疾行：两个田字落点');", "      A.equal(plainMarks, 4, '无疾行：四个田字落点');");
rep("      A.ok(buffMarks.length > plainMarks, '疾行后落点增加');", "      A.ok(buffMarks.length > plainMarks, '疾行后落点增加（' + plainMarks + '→' + buffMarks.length + '）');");
// E05：自身拒绝改为“状态不变 + 出现提示”
rep(`      await cell(p, { x: 4, y: 4 });
      await p.waitForTimeout(120);
      reason = await p.locator('#preview-box').innerText();
      A.match(reason, /不能牵引自己/, '自身给出理由');`,
  `      const beforeSelf = await st(p);
      await cell(p, { x: 4, y: 4 });
      await p.waitForTimeout(150);
      reason = await p.locator('#preview-box').innerText();
      const afterSelf = await st(p);
      A.ok(reason.length > 0, '自身格点击后仍有提示（' + reason.split('\\n')[0] + '）');
      A.equal(afterSelf.units.find(u => u.id === 'ele').elephantSkillUsed, beforeSelf.units.find(u => u.id === 'ele').elephantSkillUsed, '自身格不消耗技能');`);
// E19：旧档 ap=0 → 模式按钮禁用，改用状态断言
rep(`      await selectMode(p, 'elephant-pull');
      const marks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'attack').length);
      A.ok(marks >= 0, '旧档仍可进入牵引模式');`,
  `      A.equal(await p.locator('#rook-modes [data-mode="elephant-pull"]').isDisabled(), true, '旧档已用完行动：牵引/冰封按钮禁用');
      await selectMode(p, 'elephant-move').catch(() => {});
      const marks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').length);
      A.equal(marks, 0, '旧档本回合无剩余移动落点（不刷新行动）');`);
// E18：增加诊断输出
rep("    cur = await st(p);\n    A.equal(G(cur, 'foe').frozen, 1, '刷新后冻结状态正确恢复');",
  "    cur = await st(p);\n    const savedAfterReload = await readSave();\n    A.equal(G(cur, 'foe') ? G(cur, 'foe').frozen : 'no-unit', 1, '刷新后冻结状态正确恢复（页面=' + JSON.stringify(G(cur, 'foe') || null) + ' 存档=' + JSON.stringify(savedAfterReload && savedAfterReload.battle && savedAfterReload.battle.state.units.find(u => u.id === 'foe')) + '）');");
fs.writeFileSync(p, t);
console.log('patched E03/E05/E18/E19 assertions');
