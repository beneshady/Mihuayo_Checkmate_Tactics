// US-021 退修：对比“选中跳跃模式但未选落点”与“已选落点”两张棋盘截图，定位标记实际渲染的格子。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const fs = require('node:fs');
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';
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
  await p.waitForTimeout(400);
  await p.locator('#mobile-tools [data-ui-view="units"]').click();
  await p.locator('[data-unit="starting-horse"]').first().click();
  if (await p.locator('#btn-mobile-info-close').isVisible()) await p.locator('#btn-mobile-info-close').click();
  await p.waitForTimeout(250);
  await p.locator('[data-mode="horse-jump"]').click();
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const before = path.join('tmp', 'us021r2-marks-before.png');
  await p.screenshot({ path: before, clip });
  const xy = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 7, y: 5 }));
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(400);
  const after = path.join('tmp', 'us021r2-marks-after.png');
  await p.screenshot({ path: after, clip });
  const cells = await p.evaluate(() => {
    const g = window.__M0_DEBUG__.grid, r = document.getElementById('scene').getBoundingClientRect(), out = {};
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const s = g.screenPoint({ x, y }); out[x + ',' + y] = { lx: s.x - r.x, ly: s.y - r.y }; }
    return out;
  });
  fs.writeFileSync(path.join('tmp', 'us021r2-marks.json'), JSON.stringify({ cells, dpr: 2, clip }, null, 2));
  console.log('saved', before, after, 'cells', Object.keys(cells).length);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
