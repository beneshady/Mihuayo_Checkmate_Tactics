// US-021 退修：手机参考视口 448x924（项目自有 Mate40Pro 竖屏基准）马面板文本/按钮是否截断。
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8787';
(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 448, height: 924 }, deviceScaleFactor: 2 });
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
  await p.locator('#mobile-tools [data-ui-view="units"]').click();
  await p.locator('[data-unit="starting-horse"]').first().click();
  if (await p.locator('#btn-mobile-info-close').isVisible()) await p.locator('#btn-mobile-info-close').click();
  await p.waitForTimeout(200);
  const info = await p.evaluate(() => {
    const el = document.getElementById('mobile-selected');
    const parts = [...el.children].map(c => ({ t: c.textContent, sw: c.scrollWidth, cw: c.clientWidth, trunc: c.scrollWidth > c.clientWidth + 1 }));
    return { html: el.innerHTML.slice(0, 400), text: el.innerText, parts, modes: [...document.querySelectorAll('#rook-modes button')].map(b => ({ t: b.textContent, sw: b.scrollWidth, cw: b.clientWidth })) };
  });
  console.log('SELECTED', JSON.stringify(info, null, 2));
  await p.locator('#mobile-tools [data-ui-view="skills"]').click();
  await p.waitForTimeout(200);
  const sheet = await p.locator('#mobile-sheet-content').innerText();
  console.log('SKILL SHEET\n' + sheet);
  const btns = await p.evaluate(() => [...document.querySelectorAll('#mobile-sheet-content button')].map(b => ({ t: b.textContent.slice(0, 60), disabled: b.disabled })));
  console.log('SHEET BUTTONS', JSON.stringify(btns, null, 2));
  await p.screenshot({ path: path.join('tmp', 'us021r2-skills-448x924.png') });
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
