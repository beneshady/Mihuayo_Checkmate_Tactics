// US-022 开发期冒烟 2：冰封解锁、范围标记、目标选择与待机显示。
const path = require('node:path');
const pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const BASE = process.env.M0_TEST_URL || 'http://127.0.0.1:8777';
(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.stack || e.message));
  await p.goto(BASE + '/?device-preview=regression&validation=us022');
  await p.waitForFunction(() => !!window.__M0_DEBUG__);
  await p.evaluate(() => {
    const R = window.M0;
    function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
    const s = R.emptyState([R.unit('king', 'player', 'king', 4, 0), R.unit('boss', 'enemy', 'king', 4, 8),
      R.unit('ele', 'player', 'elephant', 4, 3), R.unit('foe', 'enemy', 'rook', 3, 4), R.unit('ally', 'player', 'pawn', 1, 2)]);
    s.tiles = land();
    s.phase = 'player';
    s.teamSp = 4;
    s.intents = [];
    window.__M0_DEBUG__.setState(s);
  });
  await p.evaluate(() => window.__M0_DEBUG__.upgrade('ele', 'elephant-freeze-unlock'));
  await p.evaluate(() => window.__M0_DEBUG__.select('ele'));
  await p.evaluate(() => { document.getElementById('rook-modes').querySelectorAll('[data-mode]').forEach(b => { if (b.dataset.mode === 'elephant-freeze') b.click(); }); });
  await p.waitForTimeout(200);
  console.log('modes', (await p.locator('#rook-modes').innerText()).replace(/\n/g, ' | '));
  const zones = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'freeze-zone').length);
  console.log('freeze zone cells', zones);
  // 点击敌人落点（桌面悬停预览后点击执行）
  const xy = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 3, y: 4 }));
  await p.mouse.move(xy.x + 3, xy.y + 2); await p.mouse.move(xy.x, xy.y);
  await p.waitForTimeout(200);
  console.log('preview', (await p.locator('#preview-box').innerText()).replace(/\n/g, ' | ').slice(0, 350));
  await p.screenshot({ path: 'tmp/us022-smoke-freeze-target.png' });
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(250);
  const s = await p.evaluate(() => window.__M0_DEBUG__.getState());
  console.log('foe frozen', s.units.find(u => u.id === 'foe').frozen, 'ele skillUsed', s.units.find(u => u.id === 'ele').elephantSkillUsed);
  await p.evaluate(() => window.__M0_DEBUG__.endTurn());
  await p.waitForTimeout(200);
  const s2 = await p.evaluate(() => window.__M0_DEBUG__.getState());
  console.log('after enemy phase frozen', s2.units.find(u => u.id === 'foe').frozen, 'turn', s2.turn, 'king hp', s2.units.find(u => u.id === 'king').hp);
  console.log('page errors', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
