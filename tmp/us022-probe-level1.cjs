// 开发期探查：正常入口进入第 1 关并用真实点击自动游玩，统计猫粮/公共 SP/胜负。
const path = require('node:path');
const pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const R = require('../web/js/rules.js');
const BASE = process.env.M0_TEST_URL || 'http://127.0.0.1:8777';
const st = p => p.evaluate(() => window.__M0_DEBUG__.getState());
const score = s => { const k = R.king(s, 'player'); if (!k || s.result === 'dead') return -1e6; return (s.phase === 'intermission' ? 10000 : 0) + s.kills * 45 + k.hp * 1000 + s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 5 + 8, 0); };
function choice(s) {
  const baseline = score(R.enemyPhase(s, true).state);
  let best;
  for (const u of s.units.filter(u => u.side === 'player')) for (const a of R.legalActions(s, u.id)) {
    const r = a.type === 'directional' ? R.previewDirection(s, u.id, a.direction) : R.preview(s, u.id, a.to, a.type);
    if (!r) continue;
    const v = score(r.prediction.state);
    if (v > baseline && (!best || v > best.v)) best = { a, v };
  }
  return best && best.a;
}
async function cell(p, to) { const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to); await p.mouse.click(xy.x, xy.y); }
(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('m0-journey-v1', JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null })); } catch (e) { } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto(BASE + '/');
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
  const t0 = Date.now();
  await p.locator('#flow-new').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
  await p.locator('#tutorial-skip').click();
  await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'camp', null, { timeout: 20000 });
  console.log('camp', JSON.stringify(await st(p)).slice(0, 120));
  await p.locator('#camp-help').click();
  if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
  await p.locator('#camp-leave').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'map');
  await p.locator('#campaign button[data-region="0"]').click();
  await p.locator('#flow-enter').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'battle');
  let s = await st(p);
  console.log('battle phase', s.phase, 'level', s.level, 'units', s.units.length);
  for (let i = 0; i < 12 && (await st(p)).phase === 'deploy'; i++) {
    const cur = await st(p);
    const u = cur.units.find(x => x.side === 'player' && x.kind !== 'king' && x.kind !== 'advisor');
    await p.evaluate(id => window.__M0_DEBUG__.select(id), u.id);
    const spot = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 1, y: 3 }, { x: 7, y: 3 }].find(c => !cur.units.some(v => v.x === c.x && v.y === c.y) && cur.tiles[c.x + ',' + c.y] !== 'water');
    await cell(p, spot);
  }
  await p.locator('#btn-deploy-confirm').click();
  await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 10000 });
  for (let turn = 0; turn < 14; turn++) {
    s = await st(p);
    if (s.phase !== 'player') break;
    for (let q = 0; q < 8; q++) {
      s = await st(p);
      if (s.phase !== 'player') break;
      const a = choice(s);
      if (!a) break;
      const u = s.units.find(x => x.id === a.actor);
      await p.evaluate(id => window.__M0_DEBUG__.select(id), u.id);
      await cell(p, a.to);
    }
    s = await st(p);
    if (s.phase === 'rescue') { await p.locator('#btn-rescue-skip').click(); continue; }
    if (s.phase === 'player') {
      await p.locator('#btn-end').click();
      await p.locator('#btn-confirm-yes').click();
      await p.waitForTimeout(80);
    }
  }
  s = await st(p);
  console.log('after play', JSON.stringify({ phase: s.phase, result: s.result, turn: s.turn, kills: s.kills, teamSp: s.teamSp, gold: s.gold, level: s.level, completed: s.completed }), 'elapsed', Date.now() - t0, 'ms');
  await p.screenshot({ path: 'tmp/us022-probe-after-level1.png' });
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
