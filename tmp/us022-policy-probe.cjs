// 开发期调参探查：用验收脚本中的策略连打 3 次第 1 关，统计胜负（只用于策略调参，不作为验收证据）。
const path = require('node:path');
const pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const R = require('../web/js/rules.js');
const BASE = process.env.M0_TEST_URL || 'http://127.0.0.1:8777';
const st = p => p.evaluate(() => window.__M0_DEBUG__.getState());
const G = (s, id) => s.units.find(u => u.id === id);
function score(s) {
  const k = R.king(s, 'player');
  if (!k || s.result === 'dead') return -1e6;
  const enemyHp = s.units.filter(u => u.side === 'enemy').reduce((n, u) => n + u.hp * 12 + (u.kind === 'king' ? 40 : 0), 0);
  const threat = s.units.filter(u => u.side === 'enemy' && Math.max(Math.abs(u.x - k.x), Math.abs(u.y - k.y)) <= 2).length;
  const mine = s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 6 + 8, 0);
  return (s.phase === 'intermission' ? 10000 : 0) + s.kills * 45 + k.hp * 1400 + mine - enemyHp - threat * 220;
}
function chooseAction(s, exclude) {
  const baseline = score(R.enemyPhase(s, true).state);
  let best;
  for (const u of s.units.filter(u => u.side === 'player' && (!exclude || !exclude.includes(u.id)))) {
    for (const a of R.legalActions(s, u.id)) {
      const r = a.type === 'directional' ? R.previewDirection(s, u.id, a.direction) : R.preview(s, u.id, a.to, a.type);
      if (!r) continue;
      const v = score(r.prediction.state);
      if (v > baseline && (!best || v > best.v)) best = { a, v };
    }
  }
  return best && best.a;
}
async function cell(p, to) { const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to); await p.mouse.click(xy.x, xy.y); }
async function selectAlly(p, id) { await p.locator('[data-unit="' + id + '"]').first().click(); }
async function endTurn(p) { await p.locator('#btn-end').click(); await p.locator('#btn-confirm-yes').click(); await p.waitForTimeout(100); }
async function runOnce(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('m0-journey-v1', JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null })); } catch (e) { } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
  await p.locator('#flow-new').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
  await p.locator('#tutorial-skip').click();
  await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'camp');
  if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
  await p.locator('#camp-leave').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'map');
  await p.locator('#campaign button[data-region="0"]').click();
  await p.locator('#flow-enter').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'battle');
  let s = await st(p);
  const spots = [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 7, y: 2 }];
  const ordinary = s.units.filter(u => u.side === 'player' && u.kind !== 'king' && u.kind !== 'advisor');
  for (let i = 0; i < ordinary.length; i++) {
    const cur = await st(p);
    if (cur.units.some(v => v.x === spots[i].x && v.y === spots[i].y)) continue;
    await selectAlly(p, ordinary[i].id); await cell(p, spots[i]); await p.waitForTimeout(40);
  }
  await p.locator('#btn-deploy-confirm').click();
  await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
  for (let turn = 0; turn < 14; turn++) {
    s = await st(p);
    if (s.phase !== 'player') break;
    for (let q = 0; q < 8; q++) {
      s = await st(p);
      if (s.phase !== 'player') break;
      const a = chooseAction(s);
      if (!a) break;
      const u = s.units.find(x => x.id === a.actor);
      await selectAlly(p, u.id);
      const mode = u.kind === 'rook' ? (a.type === 'charge' ? 'charge' : a.type === 'pull' ? 'pull' : 'rook-move') : u.kind === 'horse' ? (a.type === 'horse-jump' ? 'horse-jump' : 'horse-move') : null;
      if (mode) { const btn = p.locator(`#rook-modes [data-mode="${mode}"]`); if (await btn.count()) await btn.click(); }
      await cell(p, a.to); await p.waitForTimeout(40);
    }
    s = await st(p);
    if (s.phase === 'rescue') { await p.locator('#btn-rescue-skip').click(); continue; }
    if (s.phase === 'player') await endTurn(p);
  }
  s = await st(p);
  await ctx.close();
  return { phase: s.phase, result: s.result, turn: s.turn, kills: s.kills, teamSp: s.teamSp, gold: s.gold };
}
(async () => {
  const browser = await pw.chromium.launch();
  const results = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    results.push(await runOnce(browser));
    console.log('run', i + 1, JSON.stringify(results.at(-1)), Date.now() - t0, 'ms');
  }
  await browser.close();
  console.log('wins', results.filter(r => r.result === 'victory').length, '/', results.length);
})().catch(e => { console.error('ERR', e); process.exit(1); });
