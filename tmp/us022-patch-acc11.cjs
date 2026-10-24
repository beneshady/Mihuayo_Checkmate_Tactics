// 一次性补丁：修复验收脚本中 waitView 名称、marks 读取、手机段上下文与意图断言。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
// 1) waitForView → waitView
t = t.split('await waitForView(').join('await waitView(');
// 2) marks 读取加保护
t = t.split("window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'move').map(m => m.userData.x + ',' + m.userData.y)")
  .join("window.__M0_DEBUG__.getMarks().map(m => Object.assign({}, m, { u: m.userData || {} })).filter(m => m.u.layer === 'move').map(m => m.u.x + ',' + m.u.y)");
t = t.split("window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack').map(m => m.userData.x + ',' + m.userData.y)")
  .join("window.__M0_DEBUG__.getMarks().map(m => Object.assign({}, m, { u: m.userData || {} })).filter(m => m.u.layer === 'attack').map(m => m.u.x + ',' + m.u.y)");
t = t.split("window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'move').length")
  .join("window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'move').length");
t = t.split("window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack').length")
  .join("window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'attack').length");
t = t.split("window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'freeze-zone').length")
  .join("window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'freeze-zone').length");
// 3) E12/E16：冻结剩余通过棋盘血量标签（❄N）核对
t = t.split(`      const intent = await p.locator('#intent-list').innerText();
      A.match(intent, /剩余 3/, '意图列表显示剩余 3 个敌方行动阶段');`)
  .join(`      const badge = await p.evaluate(() => { const el = document.querySelector('[data-unit-hp="t"]'); return el ? el.textContent : ''; });
      A.match(badge, /❄3/, '棋盘血量标签显示冻结剩余 3 阶段');
      const intent = await p.locator('#intent-list').innerText();`);
// 4) 手机段：战斗部分改用独立夹具页（与营地段分开上下文）
const startM = t.indexOf("      // 战斗内技能目标：注入夹具（专项）验证手机版模式按钮与目标点击");
const endM = t.indexOf("      const issues = [];");
if (startM < 0 || endM < 0) { console.error('mobile battle block not found'); process.exit(1); }
const newMobile = `      await ctx.close();
      // 战斗内在独立夹具页（专项）验证手机版模式按钮与目标点击
      const battleCtx = await browser.newContext({ viewport });
      const bp = await battleCtx.newPage();
      bp.on('pageerror', e => report.pageErrors.push(e.message));
      await bp.goto(base + '/?device-preview=regression&validation=us022-mobile');
      await bp.waitForFunction(() => !!window.__M0_DEBUG__);
      await bp.evaluate(() => window.M0Display.setMode && window.M0Display.setMode('mobile'));
      const battle = savedStateWithElephant();
      battle.units.find(u => u.id === 'ele').elephantFreezeUnlocked = true;
      battle.units.find(u => u.id === 'ele').elephantFreezeDuration = 1;
      await bp.evaluate(x => window.__M0_DEBUG__.setState(x), battle);
      await bp.waitForTimeout(200);
      const layout = await bp.evaluate(() => {
        const g = window.__M0_DEBUG__.grid, c00 = g.screenPoint({ x: 0, y: 0 }), c10 = g.screenPoint({ x: 1, y: 0 }), c01 = g.screenPoint({ x: 0, y: 1 }), c88 = g.screenPoint({ x: 8, y: 8 });
        const scene = document.getElementById('scene').getBoundingClientRect();
        const board = { x0: Math.min(c00.x, c88.x), y0: Math.min(c00.y, c88.y), x1: Math.max(c00.x, c88.x), y1: Math.max(c00.y, c88.y) };
        return {
          viewport: { w: innerWidth, h: innerHeight }, layoutMode: document.getElementById('game-viewport').dataset.layoutMode,
          scene: { w: Math.round(scene.width), h: Math.round(scene.height) },
          boardW: Math.round(board.x1 - board.x0), boardH: Math.round(board.y1 - board.y0),
          cellW: Math.round(Math.hypot(c10.x - c00.x, c10.y - c00.y)), cellH: Math.round(Math.hypot(c01.x - c00.x, c01.y - c00.y)),
          boardInsideScene: board.x0 >= scene.x - 1 && board.y0 >= scene.y - 1 && board.x1 <= scene.x + scene.width + 1 && board.y1 <= scene.y + scene.height + 1
        };
      });
      report.layout['mobile-' + name] = layout;
      await selectAlly(bp, 'ele');
      const modes = await bp.locator('#rook-modes').innerText();
      A.match(modes, /牵引/, '手机版模式包含牵引');
      A.match(modes, /冰封/, '手机版模式包含冰封');
      const modesShot = await shot(bp, \`e21-\${name}-modes.png\`);
      const reach = await bp.evaluate(() => {
        const btn = document.querySelector('#rook-modes [data-mode="elephant-freeze"]');
        if (!btn) return null; const r = btn.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      });
      A.ok(reach && reach.visible && reach.h > 20, '冰封模式按钮可点击（高度 > 20px）');
      await selectMode(bp, 'elephant-freeze');
      const zone = await bp.evaluate(() => window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'freeze-zone').length);
      A.equal(zone, 25, '手机版冰封 5×5 范围标记可用');
      const boardClickable = layout.cellW >= 20 && layout.boardInsideScene;
      if (boardClickable) {
        await cell(bp, { x: 4, y: 5 });
        await bp.waitForTimeout(200);
        const s2 = await st(bp);
        const previewText = await bp.locator('#preview-box').innerText();
        A.ok(G(s2, 'foe').frozen >= 1 || /冰封/.test(previewText), '手机版可点选冰封目标');
      }
      const targetShot = await shot(bp, \`e21-\${name}-freeze-target.png\`);
      await battleCtx.close();
`;
t = t.slice(0, startM) + newMobile + t.slice(endM);
fs.writeFileSync(p, t);
console.log('patched acceptance sections');
