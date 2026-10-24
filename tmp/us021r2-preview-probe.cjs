// US-021 退修：手机参考视口下“跳跃落点已选”时的预览是否被裁切（只读）。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';

async function run(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null }))});}catch(e){}`);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/');
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 25000 });
  await p.locator('#flow-new').click(); await p.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
  await p.locator('#tutorial-skip').click(); await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'camp', null, { timeout: 25000 });
  await p.locator('#camp-leave').click(); await p.waitForFunction(() => window.M0Campaign.info().view === 'map');
  await p.locator('#flow-enter').click(); await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'deploy');
  await p.locator('#btn-deploy-confirm').click(); await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player');
  await p.waitForTimeout(400);
  const mobile = await p.evaluate(() => window.M0Display.isMobile());
  if (mobile) { await p.locator('#mobile-tools [data-ui-view="units"]').click(); await p.locator('[data-unit="starting-horse"]').first().click(); if (await p.locator('#btn-mobile-info-close').isVisible()) await p.locator('#btn-mobile-info-close').click(); }
  else await p.locator('[data-unit="starting-horse"]').first().click();
  await p.locator('[data-mode="horse-jump"]').click();
  const xy = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 7, y: 5 }));
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(350);
  const geo = await p.evaluate(() => {
    const b = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const mp = document.querySelector('#mobile-preview');
    const pb = document.querySelector('#preview-box');
    const mpLines = [...mp.querySelectorAll('p')].map(e => ({ t: e.textContent, h: Math.round(e.getBoundingClientRect().height) }));
    const threat = document.querySelector('#threat-panel');
    return {
      layout: document.getElementById('game-viewport').dataset.layoutMode, display: window.M0Display.size(),
      mobilePreview: { clientH: mp.clientHeight, scrollH: mp.scrollHeight, clipped: mp.scrollHeight > mp.clientHeight + 1, lines: mpLines, text: mp.innerText },
      threatBox: b('#threat-panel'), threatClips: threat.scrollHeight > threat.clientHeight + 1,
      previewBoxFull: { clientH: pb.clientHeight, scrollH: pb.scrollHeight, text: pb.innerText },
      executeEnabled: !document.getElementById('btn-execute').disabled,
      executeBox: b('#btn-execute'),
      boardCanvas: b('#scene canvas')
    };
  });
  geo.errors = errors; geo.shot = path.join('tmp', `us021r2-preview-${w}x${h}.png`);
  await p.screenshot({ path: geo.shot });
  await ctx.close(); return geo;
}
(async () => {
  const browser = await pw.chromium.launch({ headless: true }); const out = [];
  for (const [w, h] of [[448, 924], [390, 844], [844, 390]]) {
    try { out.push(Object.assign({ size: `${w}x${h}` }, await run(browser, w, h))); } catch (e) { out.push({ size: `${w}x${h}`, fatal: String(e && e.stack || e) }); }
  }
  await browser.close(); console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
