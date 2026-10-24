// 一次性补丁：存档副本的 initScript 只在缺失时写入（否则刷新会覆盖真实续局）；E04 目标改到两位置都在 5×5 内。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 120)); process.exit(1); }
  t = t.split(a).join(b);
}
rep(
  "await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(save))});}catch(e){}`);",
  "await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(save))});}catch(e){}`);"
);
rep("E('foe', 'rook', 5, 4)], { teamSp: 4 });", "E('foe', 'rook', 3, 2)], { teamSp: 4 });");
rep(`      await cell(p, { x: 5, y: 4 });
      await p.waitForTimeout(140);
      cur = await st(p);
      A.equal(G(cur, 'ele').elephantSkillUsed, true);`,
  `      await cell(p, { x: 3, y: 2 });
      await p.waitForTimeout(140);
      cur = await st(p);
      A.equal(G(cur, 'ele').elephantSkillUsed, true);`);
fs.writeFileSync(p, t);
console.log('patched initScript seeding + E04 foe');
