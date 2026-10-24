// 一次性补丁：展开技能 details，避免折叠态导致升级按钮不可见。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const a = "async function openSkills(p) {\n  const details = p.locator('details.upgrade-section');\n  if (!(await details.getAttribute('open'))) await p.locator('details.upgrade-section > summary').click();\n  await p.waitForTimeout(60);\n}";
const b = "async function openSkills(p) {\n  // 直接展开 details（只影响展示，不改变规则状态），确保技能按钮可见。\n  await p.evaluate(() => { const d = document.querySelector('details.upgrade-section'); if (d) d.open = true; });\n  await p.locator('#skills [data-skill]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });\n  await p.waitForTimeout(60);\n}";
if (t.split(a).length - 1 !== 1) { console.error('openSkills anchor missing'); process.exit(1); }
t = t.split(a).join(b);
fs.writeFileSync(p, t);
console.log('openSkills patched');
