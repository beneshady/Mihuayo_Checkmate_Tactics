// US-021 退修：读取首关开局我方/敌方站位与马可用动作（规划可复现的可见操作路径）。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';
const R = require('../web/js/rules.js');
(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 448, height: 924 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null }))});}catch(e){}`);
  const p = await ctx.newPage();
  await p.goto(base + '/');
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 25000 });
  await p.locator('#flow-new').click(); await p.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
  await p.locator('#tutorial-skip').click(); await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'camp', null, { timeout: 25000 });
  await p.locator('#camp-leave').click(); await p.waitForFunction(() => window.M0Campaign.info().view === 'map');
  await p.locator('#flow-enter').click(); await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'deploy');
  await p.locator('#btn-deploy-confirm').click(); await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player');
  const s = await p.evaluate(() => window.__M0_DEBUG__.getState());
  console.log('units', JSON.stringify(s.units.map(u => [u.id, u.side, u.kind, u.x, u.y, u.hp, u.ap]), null, 0));
  const horse = s.units.find(u => u.kind === 'horse' && u.side === 'player');
  const acts = R.legalActions(s, horse.id);
  console.log('horse', horse.id, horse.x, horse.y);
  console.log('actions', JSON.stringify(acts.map(a => [a.type, a.to && a.to.x, a.to && a.to.y, a.dir])));
  console.log('water', JSON.stringify(Object.entries(s.tiles).filter(([, v]) => v !== 'land')));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
