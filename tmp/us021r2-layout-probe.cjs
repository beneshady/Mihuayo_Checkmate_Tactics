// US-021 退修：只读布局诊断。输出 shell/场景/棋盘/面板几何与重叠，不修改任何文件状态。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';

async function probe(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null }))});}catch(e){}`);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/');
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 25000 });
  await p.locator('#flow-new').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
  await p.locator('#tutorial-skip').click();
  await p.locator('#tutorial-skip-yes').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'camp', null, { timeout: 25000 });
  await p.locator('#camp-leave').click();
  await p.waitForFunction(() => window.M0Campaign.info().view === 'map');
  await p.locator('#flow-enter').click();
  await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'deploy');
  await p.locator('#btn-deploy-confirm').click();
  await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player');
  await p.waitForTimeout(400);
  await p.locator('[data-unit="starting-horse"]').first().click().catch(() => { });
  await p.waitForTimeout(250);

  const geo = await p.evaluate(() => {
    const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const vp = document.getElementById('game-viewport');
    const shell = document.getElementById('game-shell');
    const scene = document.getElementById('scene');
    const cs = getComputedStyle(vp);
    const d = window.M0Display.size();
    const dbg = window.__M0_DEBUG__;
    const corners = [[0, 0], [8, 0], [0, 8], [8, 8]].map(([x, y]) => dbg.grid.screenPoint({ x, y }));
    const c00 = dbg.grid.screenPoint({ x: 0, y: 0 }), c11 = dbg.grid.screenPoint({ x: 1, y: 1 });
    const labels = [...document.querySelectorAll('.piece-hp')].map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
    const ov = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    let labelOverlaps = 0;
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (ov(labels[i], labels[j])) labelOverlaps++;
    const txt = s => { const e = document.querySelector(s); return e ? { clientH: e.clientHeight, scrollH: e.scrollHeight, clipped: e.scrollHeight > e.clientHeight + 1 } : null; };
    return {
      viewport: { w: innerWidth, h: innerHeight },
      display: d,
      layoutMode: vp.dataset.layoutMode,
      shell: box('#game-shell'),
      gridRows: cs.gridTemplateRows,
      scene: box('#scene'),
      canvas: box('#scene canvas'),
      panel: box('#panel'), threat: box('#threat-panel'), tools: box('#mobile-tools'), actions: box('#action-bar'),
      preview: txt('#mobile-preview'),
      selection: txt('#panel .selection-section'),
      boardCorners: corners.map(c => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      boardWidthPx: Math.round(Math.hypot(c11.x - c00.x, c11.y - c00.y)),
      boardHeightPx: Math.round(Math.abs(corners[2].y - corners[0].y)),
      cellPxApprox: Math.round(Math.abs(corners[0].y - corners[1].y) / 9),
      hpLabels: labels.length,
      hpLabelOverlaps: labelOverlaps,
      hpLabelSample: labels.slice(0, 4),
      rosterButtons: [...document.querySelectorAll('#rook-modes button')].map(b => b.textContent),
      errors: []
    };
  });
  geo.errors = errors;
  await p.screenshot({ path: path.join('tmp', `us021r2-probe-${w}x${h}.png`) });
  await ctx.close();
  return geo;
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const out = [];
  for (const [w, h] of [[844, 390], [390, 844], [448, 924], [1280, 900]]) {
    try { out.push(Object.assign({ size: `${w}x${h}` }, await probe(browser, w, h))); }
    catch (e) { out.push({ size: `${w}x${h}`, fatal: String(e && e.stack || e) }); }
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
