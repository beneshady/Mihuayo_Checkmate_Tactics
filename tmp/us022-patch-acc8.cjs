// 一次性补丁：补回自适应链路使用的 autoTurn 定义（其他单位真实点击行动后结束回合）。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const anchor = "  function findFreezePair(cur) {";
if (t.split(anchor).length - 1 !== 1) { console.error('anchor missing'); process.exit(1); }
const inject = `  // 其他单位用真实点击行动（排除名单用于保留象的技能），然后结束回合推进局面
  async function autoTurn(p, excludeIds) {
    let cur = await st(p);
    for (let q = 0; q < 6; q++) {
      cur = await st(p);
      if (cur.phase !== 'player') break;
      const a = chooseAction(cur, excludeIds || []);
      if (!a) break;
      await doAction(p, a);
    }
    cur = await st(p);
    if (cur.phase === 'rescue') { await p.locator('#btn-rescue-skip').click(); await p.waitForTimeout(80); return; }
    if (cur.phase === 'player') await endTurn(p);
  }
  function findFreezePair(cur) {`;
t = t.split(anchor).join(inject);
fs.writeFileSync(p, t);
console.log('autoTurn restored');
