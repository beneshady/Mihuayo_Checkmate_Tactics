// US-021 退修：复现“手机参考视口跳跃预览”截图，并导出标记格/对照格的屏幕坐标，供像素抽样核验。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';
const fs = require('node:fs');
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
  const xy = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 7, y: 5 }));
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(400);
  const data = await p.evaluate(() => {
    const r = document.getElementById('scene').getBoundingClientRect();
    const g = window.__M0_DEBUG__.grid;
    const cells = { landing: [7, 5], n1: [7, 6], n2: [6, 5], n3: [8, 5], n4: [7, 4], control1: [1, 1], control2: [3, 8], control3: [0, 0] };
    const out = {};
    for (const [k, [x, y]] of Object.entries(cells)) { const s = g.screenPoint({ x, y }); out[k] = { cx: s.x, cy: s.y, lx: +(s.x - r.x).toFixed(1), ly: +(s.y - r.y).toFixed(1) }; }
    return { scene: { x: r.x, y: r.y, w: r.width, h: r.height }, dpr: window.devicePixelRatio, cells: out, marks: window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack' || m.layer === 'splash').map(m => [m.x, m.y, m.layer]) };
  });
  const file = path.join('tmp', 'us021r2-markcheck.png');
  await p.screenshot({ path: file, clip: { x: data.scene.x, y: data.scene.y, width: data.scene.w, height: data.scene.h } });
  data.file = file;
  fs.writeFileSync(path.join('tmp', 'us021r2-markcheck.json'), JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
