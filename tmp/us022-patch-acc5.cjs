// 一次性补丁：升级步骤在战斗已结算时回落到营地技能面板；链路循环包 try/catch 保证部分证据仍写入。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 140)); process.exit(1); }
  t = t.split(a).join(b);
}
// 升级：战斗中优先，战斗已结算时用营地面板
rep(
  `    if (!chain.upgrade && cur.teamSp >= 1 && R.elephantFreezeUnlocked(cur.units.find(u => u.id === ele.id)) && chain.thaw) {`,
  `    if (!chain.upgrade && cur.teamSp >= 1 && R.elephantFreezeUnlocked(cur.units.find(u => u.id === ele.id)) && chain.thaw) {
      const battleVisible = await p.locator('#battle-root').isVisible();
      if (!battleVisible) {
        // 战斗已结算回营：营地技能面板同样是正常入口
        const sp0 = cur.teamSp;
        const range0 = R.elephantPullRangeOf(cur.party.find(u => u.kind === 'elephant') || cur.units.find(u => u.kind === 'elephant'));
        const btn = p.locator('#camp-skills [data-skill="elephant-pull-range"]').first();
        if (await btn.count()) {
          await btn.click();
          await p.waitForTimeout(150);
          const s2 = await st(p);
          const eleNow = (s2.party || []).find(u => u.kind === 'elephant');
          chain.upgrade = { ok: s2.teamSp === sp0 - 1 && R.elephantPullRangeOf(eleNow) === range0 + 1, sp0, sp1: s2.teamSp, range0, range1: R.elephantPullRangeOf(eleNow), btnText: '营地技能面板', camp: true };
          chain.shots.push(await shot(p, 'e20-upgrade-camp.png'));
          return true;
        }
      }`
);
// 循环包 try/catch
rep(
  `  const MAX_TURNS = 12;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let cur = await st(p);
    if (cur.phase !== 'player') break;
    let acted = await playTurnAdaptive(p, chain);
    cur = await st(p);
    if (cur.phase !== 'player') break;
    if (!acted) {
      // 让其他单位正常行动（不消耗象的技能），再结束回合推进局面
      await autoTurn(p, [cur.units.find(u => u.kind === 'elephant') ? cur.units.find(u => u.kind === 'elephant').id : '']);
      continue;
    }
    if (chain.move && chain.pull && chain.unlock && chain.thaw && chain.upgrade) break;
  }`,
  `  const MAX_TURNS = 12;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const view = await p.evaluate(() => (window.M0Campaign ? window.M0Campaign.info().view : 'battle'));
      if (view !== 'battle') {
        // 战斗已结算：在营地补做升级证据
        if (!chain.upgrade && (await st(p)).teamSp >= 1 && chain.thaw) await playTurnAdaptive(p, chain);
        break;
      }
      let cur = await st(p);
      if (cur.phase !== 'player') break;
      let acted = await playTurnAdaptive(p, chain);
      cur = await st(p);
      if (cur.phase !== 'player') break;
      if (!acted) {
        // 让其他单位正常行动（不消耗象的技能），再结束回合推进局面
        const eleNow = cur.units.find(u => u.kind === 'elephant');
        await autoTurn(p, eleNow ? [eleNow.id] : []);
        continue;
      }
      if (chain.move && chain.pull && chain.unlock && chain.thaw && chain.upgrade) break;
    }
  } catch (e) {
    console.log('CHAIN-ERROR ' + e.message);
    chain.error = e.message;
  }`
);
fs.writeFileSync(p, t);
console.log('patched upgrade fallback + try/catch');
