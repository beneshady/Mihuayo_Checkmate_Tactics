// US-021 退修：马选中 + 跳跃预览状态下的手机布局诊断（只读）。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';

async function run(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null }))});}catch(e){}`);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/');
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 25000 });
  await p.locator('#flow-new').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
  await p.locator('#tutorial-skip').click(); await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'camp', null, { timeout: 25000 });
  await p.locator('#camp-leave').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'map');
  await p.locator('#flow-enter').click();
  await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'deploy');
  await p.locator('#btn-deploy-confirm').click();
  await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player');
  await p.waitForTimeout(400);
  const mobile = await p.evaluate(() => window.M0Display.isMobile());
  // 通过可见入口选中马：手机走“我方队伍”面板，桌面直接点列表
  if (mobile) { await p.locator('#mobile-tools [data-ui-view="units"]').click(); await p.locator('[data-unit="starting-horse"]').first().click(); if (await p.locator('#btn-mobile-info-close').isVisible()) await p.locator('#btn-mobile-info-close').click(); }
  else await p.locator('[data-unit="starting-horse"]').first().click();
  await p.waitForTimeout(200);
  const btns = await p.locator('#rook-modes button').allInnerTexts();
  let modeShot = null;
  if (btns.some(t => t.includes('跳跃'))) {
    await p.locator('[data-mode="horse-jump"]').click();
    const xy = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 7, y: 5 }));
    await p.mouse.move(xy.x, xy.y); await p.waitForTimeout(250);
    modeShot = 'hover';
  }
  const geo = await p.evaluate(() => {
    const b = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const sc = s => { const e = document.querySelector(s); return e ? { clientH: e.clientHeight, scrollH: e.scrollHeight, clipped: e.scrollHeight > e.clientHeight + 1, textLen: e.textContent.length } : null; };
    const dbg = window.__M0_DEBUG__, g = dbg.grid;
    const c00 = g.screenPoint({ x: 0, y: 0 }), c10 = g.screenPoint({ x: 1, y: 0 }), c01 = g.screenPoint({ x: 0, y: 1 });
    const c88 = g.screenPoint({ x: 8, y: 8 });
    return {
      viewport: { w: innerWidth, h: innerHeight }, display: window.M0Display.size(), layout: document.getElementById('game-viewport').dataset.layoutMode,
      rows: getComputedStyle(document.getElementById('game-viewport')).gridTemplateRows,
      scene: b('#scene'), panel: b('#panel'), threat: b('#threat-panel'),
      modesRow: b('#rook-modes'), mobileSelected: b('#mobile-selected'),
      boardPx: { w: Math.round(Math.hypot(c88.x - c00.x, c88.y - c00.y)), cellW: Math.round(Math.hypot(c10.x - c00.x, c10.y - c00.y)), cellH: Math.round(Math.hypot(c01.x - c00.x, c01.y - c00.y)) },
      previewBox: sc('#mobile-preview'), previewText: (document.querySelector('#mobile-preview') || {}).innerText || '',
      modes: [...document.querySelectorAll('#rook-modes button')].map(x => { const r = x.getBoundingClientRect(); return { t: x.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
      marks: dbg.getMarks().length, marksLayers: [...new Set(dbg.getMarks().map(m => m.layer))]
    };
  });
  geo.errors = errors;
  const name = path.join('tmp', `us021r2-horse-${w}x${h}.png`);
  await p.screenshot({ path: name });
  geo.shot = name;
  await ctx.close();
  return geo;
}
(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const out = [];
  for (const [w, h] of [[844, 390], [390, 844], [1280, 900]]) {
    try { out.push(Object.assign({ size: `${w}x${h}` }, await run(browser, w, h))); } catch (e) { out.push({ size: `${w}x${h}`, fatal: String(e && e.stack || e) }); }
  }
  await browser.close(); console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
