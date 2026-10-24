// 一次性补丁：E01 多购/不足分支改成确定性执行（连续招募直到猫粮不足 5），并记录实际分支。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf("  await step('E01-购象'");
const end = t.indexOf("  await step('E20-2'");
if (start < 0 || end < 0) { console.error('E01 block not found'); process.exit(1); }
const block = `  await step('E01-购象', '营地招募象：5 猫粮、1 基础 HP、坚守后 2 HP、可多购、满员后备、猫粮不足不扣款', async () => {
    s = await st(p);
    if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
    const goldBefore = s.gold;
    await p.locator('[data-recruit="elephant"]').click();
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().party.some(u => u.kind === 'elephant'), null, { timeout: 8000 });
    s = await st(p);
    A.equal(s.gold, goldBefore - 5, '招募象扣 5 猫粮');
    const ele = s.party.find(u => u.kind === 'elephant');
    A.ok(ele, '队伍中出现象');
    A.equal(ele.maxHp, 2, '坚守（首次入营免费获得）生效后象 2 HP');
    A.equal(ele.hp, 2);
    const bench = !(s.activeIds || []).includes(ele.id);
    A.ok(bench, '初始 4 人口满员时新象进入后备');
    await shot(p, 'e01-elephant-recruited.png');
    // 多购：继续招募，直到猫粮不足 5（最多再买 3 只）
    let buys = 1;
    for (let i = 0; i < 3; i++) {
      s = await st(p);
      if (s.gold < 5) break;
      const goldNow = s.gold, countNow = s.party.filter(u => u.kind === 'elephant').length;
      await p.locator('[data-recruit="elephant"]').click();
      await p.waitForFunction(n => window.__M0_DEBUG__.getState().party.filter(u => u.kind === 'elephant').length === n, countNow + 1, { timeout: 8000 });
      s = await st(p);
      A.equal(s.gold, goldNow - 5, '每只象同样 5 猫粮');
      A.equal(s.party.filter(u => u.kind === 'elephant').length, countNow + 1, '可招募多只象');
      A.ok(s.bench.filter(id => (s.party.find(u => u.id === id) || {}).kind === 'elephant').length >= 1 || !s.activeIds.includes(s.party.find(u => u.kind === 'elephant').id), '部署人口满时象进入后备');
      buys++;
    }
    A.ok(buys >= 2, '实际完成多购（本次 ' + buys + ' 只）');
    // 不足：猫粮不足 5 时按钮禁用，点击不扣款
    s = await st(p);
    A.ok(s.gold < 5, '本次猫粮已花到不足 5（' + s.gold + '）');
    const disabled = await p.locator('[data-recruit="elephant"]').isDisabled();
    A.ok(disabled, '猫粮不足 5 时象招募按钮禁用');
    const before = await st(p);
    if (!disabled) { await p.locator('[data-recruit="elephant"]').click({ force: true }); await p.waitForTimeout(150); }
    const after = await st(p);
    A.equal(after.gold, before.gold, '猫粮不足时点击不扣款');
    A.equal(after.party.length, before.party.length, '猫粮不足时不增加队伍');
    await shot(p, 'e01-recruit-insufficient.png');
    const eleFinal = (await st(p)).party.find(u => u.kind === 'elephant');
    return \`点击招募象：猫粮 \${goldBefore}→\${(await st(p)).gold}（共 \${buys} 只，每只 5 猫粮），象 HP \${eleFinal.hp}/\${eleFinal.maxHp}（坚守），满员时进入后备；猫粮不足 5 时按钮禁用、点击不扣款（截图 e01-elephant-recruited.png、e01-recruit-insufficient.png）\`;
  });
`;
t = t.slice(0, start) + block + t.slice(end);
fs.writeFileSync(p, t);
console.log('E01 branch block rewritten');
