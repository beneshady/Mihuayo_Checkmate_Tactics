// US-022 开发期冒烟：加载页面、注入象夹具、检查模式按钮/标记/预览不报错。
const path = require('node:path');
const pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const BASE = process.env.M0_TEST_URL || 'http://127.0.0.1:8777';
(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(BASE + '/?device-preview=regression&validation=us022');
  await p.waitForFunction(() => !!window.__M0_DEBUG__);
  console.log('loaded');
  const st = await p.evaluate(() => {
    const R = window.M0;
    function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
    const s = R.emptyState([R.unit('king', 'player', 'king', 4, 0), R.unit('boss', 'enemy', 'king', 4, 8),
      R.unit('ele', 'player', 'elephant', 4, 3), R.unit('foe', 'enemy', 'rook', 4, 5), R.unit('ally', 'player', 'pawn', 1, 2)]);
    s.tiles = land();
    s.tiles['2,2'] = 'mountain';
    s.phase = 'player';
    s.teamSp = 4;
    s.intents = [];
    window.__M0_DEBUG__.setState(s);
    return window.__M0_DEBUG__.getState();
  });
  console.log('injected units', st.units.map(u => u.kind + '/' + u.side).join(','));
  await p.evaluate(() => window.__M0_DEBUG__.select('ele'));
  await p.waitForTimeout(200);
  console.log('modes', (await p.locator('#rook-modes').innerText()).replace(/\n/g, ' | '));
  console.log('marks', await p.evaluate(() => window.__M0_DEBUG__.getMarks().map(m => m.layer).join(',')));
  await p.screenshot({ path: 'tmp/us022-smoke-move.png' });
  // 冰封范围标记
  await p.evaluate(() => window.__M0_DEBUG__.setElephantMode('elephant-freeze'));
  await p.evaluate(() => { document.getElementById('rook-modes').querySelectorAll('[data-mode]').forEach(b => { if (b.dataset.mode === 'elephant-freeze') b.click(); }); });
  await p.waitForTimeout(150);
  console.log('freeze layers', await p.evaluate(() => window.__M0_DEBUG__.getMarks().map(m => m.layer).join(',')));
  await p.screenshot({ path: 'tmp/us022-smoke-freeze.png' });
  // 牵引预览
  await p.evaluate(() => { document.getElementById('rook-modes').querySelectorAll('[data-mode]').forEach(b => { if (b.dataset.mode === 'elephant-pull') b.click(); }); });
  const xy = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 4, y: 5 }));
  await p.mouse.move(xy.x + 3, xy.y + 2); await p.mouse.move(xy.x, xy.y);
  await p.waitForTimeout(250);
  console.log('preview', (await p.locator('#preview-box').innerText()).replace(/\n/g, ' | ').slice(0, 500));
  await p.screenshot({ path: 'tmp/us022-smoke-pull.png' });
  console.log('page errors', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
