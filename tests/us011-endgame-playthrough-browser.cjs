// US-011 2026-10-24 三张残局预置桌面实际试玩验收（P04/P05/P08）。
// 从编辑器可见入口读取预置 → 开始独立测试 → 全部经真实鼠标点击逐回合行动到现有胜利结算；
// 不使用 __M0_DEBUG__.setState / 改 HP / 注入 SP / 跳过回合；仅读取状态与棋盘坐标辅助点击，并记录攻击预告、地形互动与结局。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { startServer } = require('./us011-static-server.cjs');
const R = require('../web/js/rules.js');
const P = require('../web/js/presets.js');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'us', 'us011-endgame-presets-evidence');
const shots = path.join(evidence, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const RUN = process.env.DSH_RUN_ID || '20261024T092006239Z-d4b2af16';
const VERSION_FILES = ['web/editor.html', 'web/editor.css', 'web/js/editor.js', 'web/js/maps.js', 'web/js/mapjson.js', 'web/js/presets.js', 'web/js/app.js', 'web/js/rules.js', 'web/index.html'];
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const report = {
  task: 'US-011 2026-10-24 三张残局预置：编辑器正常入口桌面实际试玩（P04/P05/P08）',
  runId: RUN, startedAt: new Date().toISOString(),
  environment: { node: process.version, playwright: require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')).version, browser: 'chromium headless', viewport: '1280x900' },
  versions: {}, versionsEnd: {}, controls: {}, maps: {}, terrainInteractions: {}, screenshots: {}, pageErrors: [], consoleErrors: [],
  note: '动作均由页面点击提交；服务端/脚本不使用 setState、HP/SP 写入或跳过回合。查看状态仅用于选择合法落点。',
};
for (const f of VERSION_FILES) if (fs.existsSync(f)) report.versions[f] = sha256(fs.readFileSync(f));
let failed = 0, base, srv;
function ok(id, detail, data) { console.log('PASS ' + id + ' · ' + detail); if (data) report.controls[id] = data; }
function bad(id, detail, e) { failed++; report.controls[id] = { pass: false, detail, error: String(e && e.stack || e) }; console.log('FAIL ' + id + ' · ' + detail + ' · ' + (e && e.message || e)); }
const point = (p) => p ? `（${p.x + 1},${p.y + 1}）` : '无';
function score(s) {
  const k = R.king(s, 'player');
  if (!k || s.result === 'dead') return -1e6;
  const enemyHp = s.units.filter(u => u.side === 'enemy').reduce((n, u) => n + u.hp * 12 + (u.kind === 'king' ? 40 : 0), 0);
  const threat = s.units.filter(u => u.side === 'enemy' && Math.max(Math.abs(u.x - k.x), Math.abs(u.y - k.y)) <= 2).length;
  const mine = s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 6 + 8, 0);
  return (s.phase === 'intermission' ? 10000 : 0) + s.kills * 45 + k.hp * 1400 + mine - enemyHp - threat * 220;
}
function modeFor(u, a) {
  if (u.kind === 'rook') return ['charge', 'charge-corpse'].includes(a.type) ? 'charge' : ['pull', 'pull-collision'].includes(a.type) ? 'pull' : 'rook-move';
  if (u.kind === 'horse') return a.type === 'horse-jump' ? 'horse-jump' : 'horse-move';
  if (u.kind === 'elephant') return a.type === 'elephant-pull' ? 'elephant-pull' : a.type === 'elephant-freeze' ? 'elephant-freeze' : 'elephant-move';
  return null;
}
function previewOf(s, u, a) {
  const mode = ['rook', 'horse', 'elephant'].includes(u.kind) ? modeFor(u, a) : a.type;
  return a.type === 'directional' ? R.previewDirection(s, u.id, a.direction) : R.preview(s, u.id, a.to, mode);
}
function chooseAction(s) {
  const baseline = score(R.enemyPhase(s, true).state);
  let best;
  for (const u of s.units.filter(u => u.side === 'player')) {
    for (const a of R.legalActions(s, u.id)) {
      const r = previewOf(s, u, a);
      if (!r) continue;
      const v = score(r.prediction.state);
      if (v > baseline && (!best || v > best.v)) best = { a, v, preview: r };
    }
  }
  return best;
}
function rackOf(s, a) {
  if (a.type !== 'attack') return null;
  for (const p of (a.path || []).slice(0, -1)) { const u = R.at(s, p), c = R.corpseAt(s, p); if (u) return { ...p, kind: 'unit', side: u.side, unitKind: u.kind }; if (c) return { ...p, kind: 'corpse' }; if (R.mountain(s, p)) return { ...p, kind: 'mountain' }; }
  return null;
}
function summarizeAction(s, u, a, r) {
  const e = r.effect || {}, hits = (e.hits || []).map(h => ({ id: h.id, side: h.side, kind: h.kind, before: h.before, damage: h.damage }));
  const out = {
    type: a.type, unitId: u.id, kind: u.kind, from: { x: u.x, y: u.y }, to: { x: a.to.x, y: a.to.y },
    fromTerrain: R.terrain(s, u), toTerrain: R.terrain(s, a.to), hits, conditional: !!e.conditional,
    mountains: (e.mountains || []).map(p => ({ x: p.x, y: p.y, after: p.after })), waterDeaths: e.waterDeaths || [], misses: e.misses || [],
    pull: e.pull || null, pushStatus: e.pushStatus || null, friendlyFire: hits.some(h => h.side === 'player'),
  };
  if (a.type === 'attack') { const rack = rackOf(s, a); if (rack) out.rack = rack; }
  if (a.type === 'elephant-pull') out.pullStatus = (e.pull || {}).status || null;
  return out;
}
async function shot(page, name, fullPage = true) { const file = path.join(shots, name); await page.screenshot({ path: file, fullPage }); report.screenshots[name] = rel(file); return file; }
async function frameShot(frame, name) { const file = path.join(shots, name); await frame.locator('#scene').screenshot({ path: file }); report.screenshots[name] = rel(file); return file; }
async function openEditor(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const menu = await context.newPage();
  menu.on('pageerror', e => report.pageErrors.push(e.message));
  menu.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  // 正常入口：正式页菜单 → “地图编辑器 ↗”（新标签页）。
  await menu.goto(base + '/');
  await menu.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
  const [page] = await Promise.all([context.waitForEvent('page'), menu.locator('#flow-menu a[href="editor.html"]').click()]);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  await page.waitForFunction(() => !!window.__M0_MAP_EDITOR__ && !!window.M0Presets, null, { timeout: 30000 });
  return { context, page, menu };
}
async function loadPreset(page, id) {
  await page.selectOption('#preset-select', id);
  if (await page.evaluate(() => window.__M0_MAP_EDITOR__.isDirty())) page.once('dialog', d => d.accept());
  await page.click('#load-preset');
  await page.waitForFunction((name) => (document.getElementById('editor-status').textContent || '').includes('已读取预置「' + name + '」'), P.get(id).name, { timeout: 15000 });
  await page.waitForTimeout(80);
}
const draftOf = (page) => page.evaluate(() => window.__M0_MAP_EDITOR__.getDraft());
const fingerprint = (map) => JSON.stringify({ name: map.name, levelCode: map.levelCode, levelName: map.levelName, tiles: map.tiles, units: map.units });
async function waitFrame(page) { for (let i = 0; i < 150; i++) { const f = page.frames().find(f => f.url().includes('editor-test=1')); if (f) { try { if (await f.evaluate(() => !!window.__M0_DEBUG__)) return f; } catch (e) { } } await page.waitForTimeout(100); } throw Error('独立测试 iframe 未就绪'); }
async function cellPoint(frame, p) { return frame.evaluate((q) => { const s = window.__M0_DEBUG__.grid.screenPoint(q); const r = window.frameElement.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; }, p); }
async function hoverCell(page, frame, p) { const xy = await cellPoint(frame, p); await page.mouse.move(xy.x - 4, xy.y - 3); await page.waitForTimeout(30); await page.mouse.move(xy.x, xy.y); await page.waitForTimeout(140); }
async function clickCell(page, frame, p) { const xy = await cellPoint(frame, p); await page.mouse.click(xy.x, xy.y); await page.waitForTimeout(70); }

(async () => {
  srv = await startServer(path.join(root, 'web'));
  base = 'http://127.0.0.1:' + srv.port;
  const browser = await pw.chromium.launch();
  for (const preset of P.list()) {
    const id = preset.id, entry = { preset: id, attempts: [], victory: false };
    report.maps[id] = entry;
    const { context, page, menu } = await openEditor(browser);
    try {
      A.equal(await page.evaluate(() => localStorage.getItem('m0-journey-v1')), null);
      entry.entry = { from: '正式页菜单 → 地图编辑器 ↗', url: page.url(), menuView: await menu.evaluate(() => window.M0Campaign.info().view) };
      A.equal(entry.entry.menuView, 'menu');
      A.ok(entry.entry.url.includes('editor.html'));
      await loadPreset(page, id);
      const original = await draftOf(page);
      const originalFp = fingerprint(original);
      await shot(page, `p04-${id}-editor-before.png`);
      // 保存并在可行时建立第2关绑定，作为“已有绑定”对照（正式绑定需要固定帅位）。
      await page.fill('#map-name', preset.name + ' 试玩');
      await page.click('#save');
      await page.waitForTimeout(200);
      const beforeBinding = await page.evaluate(() => localStorage.getItem('m0-map-library-v1'));
      await page.fill('#level-number', '2');
      let bindMessage = '';
      const applyDisabled = await page.locator('#apply').isDisabled();
      if (applyDisabled) {
        // 例如征西帅位不是正式固定帅位：编辑器按现行规则禁用“应用保存版本”。
        bindMessage = '应用按钮不可用；' + (await page.locator('#binding-info').innerText());
      } else {
        const preLib = JSON.parse(beforeBinding || '{"bindings":{}}');
        if (preLib.bindings && preLib.bindings['2']) page.once('dialog', d => d.accept());
        await page.click('#apply');
        await page.waitForTimeout(250);
        bindMessage = await page.locator('#editor-status').innerText();
      }
      const afterBinding = await page.evaluate(() => localStorage.getItem('m0-map-library-v1'));
      const libraryBeforeTest = JSON.parse(afterBinding);
      entry.binding = { attempted: true, applyDisabled, message: bindMessage, applied: !!libraryBeforeTest.bindings['2'], sameAsBeforeBind: beforeBinding === afterBinding };
      entry.bindingBefore = afterBinding;
      const testDraft = await draftOf(page);
      const testDraftFp = fingerprint(testDraft);
      // 开始独立测试
      await page.click('#start-test');
      const frame = await waitFrame(page);
      await page.waitForFunction(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.src.includes('editor-test=1')); return f && f.contentWindow.__M0_DEBUG__ && f.contentWindow.__M0_DEBUG__.getState().phase === 'player'; }, null, { timeout: 20000 });
      const st = () => frame.evaluate(() => window.__M0_DEBUG__.getState());
      const initial = await st();
      entry.initialRoster = initial.units.length;
      entry.elephant = initial.units.filter(u => u.kind === 'elephant').map(u => ({ id: u.id, x: u.x, y: u.y, pullRange: u.elephantPullRange }));
      await frameShot(frame, `p04-${id}-test-start.png`);

      let victory = false, attempted = 0;
      for (let attempt = 1; attempt <= 3 && !victory; attempt++) {
        if (attempt > 1) {
          // 失败后用界面“重开独立测试（恢复原稿）”重试（真实点击 + 确认）。
          page.once('dialog', d => d.accept());
          await frame.locator('#btn-restart-2').click({ timeout: 5000 });
          await page.waitForFunction(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.src.includes('editor-test=1')); const s = f && f.contentWindow.__M0_DEBUG__ && f.contentWindow.__M0_DEBUG__.getState(); return s && s.phase === 'player' && s.turn === 1; }, null, { timeout: 15000 });
        }
        attempted++;
        let purchased = null;
        const attemptLog = { attempt, turns: [], terrainFacts: [], skillPurchases: [] };
        const terrainFacts = attemptLog.terrainFacts;
        const seen = new Set();
        const mark = (key, fact) => { if (!seen.has(key)) { seen.add(key); terrainFacts.push(fact); } };
        let s = await st();
        for (let turnGuard = 0; turnGuard < 14; turnGuard++) {
          s = await st();
          if (s.phase !== 'player') break;
          // 技能购买（仅一次，合法 SP 来自击杀）：优先相冰封解锁，否则给存活队友买强健；全部经界面按钮提交。
          if (!purchased && s.teamSp >= 1) {
            const elephant = s.units.find(u => u.kind === 'elephant' && u.side === 'player' && !u.elephantFreezeUnlocked);
            const others = s.units.filter(u => u.side === 'player' && u.kind !== 'king' && !u.device);
            const candidates = [];
            if (elephant && s.teamSp >= 2) candidates.push({ id: elephant.id, skill: 'elephant-freeze-unlock' });
            if (others.length) candidates.push({ id: others[0].id, skill: 'fortify' });
            for (const c of candidates) {
              const unitBtn = frame.locator(`[data-unit="${c.id}"]`);
              if (!(await unitBtn.count())) continue;
              await unitBtn.first().click();
              await page.waitForTimeout(80);
              const details = frame.locator('details.upgrade-section');
              if (!(await details.evaluate(el => el.open))) await details.locator('summary').click({ timeout: 5000 }).catch(() => { });
              const btn = frame.locator(`#skills [data-skill="${c.skill}"]`);
              if (!(await btn.count()) || !(await btn.first().isEnabled())) continue;
              const beforeSp = (await st()).teamSp;
              await btn.first().click();
              await page.waitForTimeout(150);
              const after = await st();
              purchased = { skill: c.skill, unit: c.id, spBefore: beforeSp, spAfter: after.teamSp, elephantFreezeUnlocked: !!(after.units.find(u => u.kind === 'elephant') || {}).elephantFreezeUnlocked };
              attemptLog.skillPurchases.push(purchased);
              ok(id + '-skill-purchase', `技能购买成功：${c.id} ${c.skill} SP ${beforeSp}→${after.teamSp}`, purchased);
              await shot(page, `p04-${id}-skill-purchase.png`);
              break;
            }
          }
          const steps = [];
          for (let q = 0; q < 12; q++) {
            s = await st();
            if (s.phase !== 'player') break;
            const pick = chooseAction(s);
            if (!pick) break;
            const u = s.units.find(v => v.id === pick.a.actor), a = pick.a;
            const before = s;
            await frame.locator(`[data-unit="${u.id}"]`).first().click();
            await page.waitForTimeout(60);
            const mode = modeFor(u, a);
            if (mode) { const mb = frame.locator(`#rook-modes [data-mode="${mode}"]`); if (await mb.count()) { await mb.first().click(); await page.waitForTimeout(40); } }
            const attackLike = ['attack', 'charge', 'charge-corpse', 'horse-jump', 'elephant-pull', 'elephant-freeze', 'directional', 'pull', 'pull-collision'].includes(a.type);
            if (attackLike) {
              await hoverCell(page, frame, a.to);
              if (!seen.has('attack-preview')) { seen.add('attack-preview'); await shot(page, `p05-${id}-attack-preview.png`); }
              if (a.type === 'elephant-pull' && !seen.has('pull-preview')) { seen.add('pull-preview'); await shot(page, `p05-${id}-elephant-pull-preview.png`); }
              if (a.type === 'elephant-freeze' && !seen.has('freeze-preview')) { seen.add('freeze-preview'); await shot(page, `p05-${id}-elephant-freeze-preview.png`); }
              if (a.type === 'attack' && rackOf(before, a) && rackOf(before, a).kind === 'mountain' && !seen.has('rack-preview')) { seen.add('rack-preview'); await shot(page, `p05-${id}-cannon-mountain-rack-preview.png`); }
            }
            await clickCell(page, frame, a.to);
            const after = await st();
            A.ok(after.revision > before.revision, `${id} 动作已提交 ${a.type} ${point(a.to)}`);
            const summary = summarizeAction(before, u, a, pick.preview);
            steps.push(summary);
            const afterTerrain = R.terrain(after, a.to);
            if (summary.rack && summary.rack.kind === 'mountain') mark('rack', { kind: 'cannon-mountain-rack', turn: s.turn, unit: summary.unitId, at: { x: summary.rack.x, y: summary.rack.y }, target: a.to });
            if (summary.mountains.length) mark('mountain', { kind: 'mountain-damaged', turn: s.turn, cells: summary.mountains, by: summary.unitId });
            if (summary.conditional) mark('forest', { kind: 'forest-conditional-attack', turn: s.turn, unit: summary.unitId, target: a.to, terrain: summary.toTerrain });
            if (summary.misses.length) mark('miss', { kind: 'forest-dodge', turn: s.turn, unit: summary.unitId, missed: summary.misses });
            if (summary.waterDeaths.length) mark('water', { kind: 'water-death', turn: s.turn, deaths: summary.waterDeaths });
            if (summary.pullStatus) mark('pull-status-' + summary.pullStatus, { kind: 'elephant-pull', turn: s.turn, status: summary.pullStatus, target: a.to, pull: summary.pull });
            if (summary.fromTerrain !== 'land' || summary.toTerrain !== 'land') mark('terrain-move-' + summary.fromTerrain + '-' + summary.toTerrain, { kind: 'terrain-move', turn: s.turn, unit: summary.unitId, from: summary.from, to: summary.to, fromTerrain: summary.fromTerrain, toTerrain: summary.toTerrain, afterTerrain });
            if ((summary.fromTerrain !== 'land' || summary.toTerrain !== 'land') && !seen.has('terrain-after')) { seen.add('terrain-after'); await frameShot(frame, `p05-${id}-terrain-move-after.png`); }
            if (summary.type === 'elephant-pull' && !seen.has('pull-after')) { seen.add('pull-after'); await frameShot(frame, `p05-${id}-elephant-pull-after.png`); }
            if (summary.mountains.length && !seen.has('crack-after')) { seen.add('crack-after'); await frameShot(frame, `p05-${id}-mountain-cracked-after.png`); }
            if (summary.waterDeaths.length && !seen.has('water-after')) { seen.add('water-after'); await frameShot(frame, `p05-${id}-water-death-after.png`); }
          }
          s = await st();
          attemptLog.turns.push({
            turn: s.turn, wave: s.wave, steps, kingHp: (R.king(s, 'player') || {}).hp, kills: s.kills, teamSp: s.teamSp,
            playerUnits: s.units.filter(u => u.side === 'player').map(u => ({ id: u.id, kind: u.kind, hp: u.hp, maxHp: u.maxHp })),
            enemyUnits: s.units.filter(u => u.side === 'enemy').length, phase: s.phase, result: s.result || null,
            terrainAfter: { mountains: Object.entries(s.tiles).filter(([k, v]) => v === 'cracked' || v === 'rubble').map(([k, v]) => ({ cell: k, terrain: v })) },
          });
          if (s.phase !== 'player') break;
          // 结束回合（真实点击：结束回合 → 确认执行敌方意图）
          await frame.locator('#btn-end').click();
          await page.waitForTimeout(120);
          await frame.locator('#btn-confirm-yes').click();
          await page.waitForTimeout(350);
          s = await st();
          if (s.phase === 'player') continue;
          break;
        }
        s = await st();
        attemptLog.final = { phase: s.phase, result: s.result || null, turn: s.turn, wave: s.wave, kills: s.kills, gold: s.gold, kingHp: (R.king(s, 'player') || {}).hp };
        entry.attempts.push(attemptLog);
        victory = s.phase === 'intermission' && s.result === 'victory';
        if (victory) {
          A.ok(await frame.locator('#ov-result').isVisible(), id + ' 胜利结算面板可见');
          const title = await frame.locator('#result-title').innerText();
          const text = await frame.locator('#result-text').innerText();
          A.ok(/胜利/.test(title), id + ' 结算标题：' + title);
          entry.result = { title, text };
          await shot(page, `p04-${id}-victory.png`);
        } else if (s.phase === 'result') {
          entry.result = { title: await frame.locator('#result-title').innerText(), text: await frame.locator('#result-text').innerText() };
          await shot(page, `p04-${id}-attempt${attempt}-defeat.png`);
        }
      }
      entry.victory = victory; entry.attemptCount = attempted; entry.skillPurchases = entry.attempts.flatMap(a => a.skillPurchases);
      entry.terrainFacts = entry.attempts.flatMap(a => a.terrainFacts);
      report.terrainInteractions[id] = entry.terrainFacts.map(f => f.kind + (f.status ? ':' + f.status : ''));
      A.ok(victory, id + ' 实际到达胜利结算');
      if (victory) {
        // P08：返回编辑原稿；原稿不变；取消编辑恢复原测试；重开独立测试回到第1回合。
        const victoryState = await st();
        await page.click('#return-edit');
        await page.waitForTimeout(300);
        A.ok(await page.locator('#edit-view').isVisible());
        A.equal(fingerprint(await draftOf(page)), testDraftFp, id + ' 返回编辑原稿未被测试改动');
        await page.locator('#terrain-tools button[data-tool="forest"]').click();
        await page.locator('#editor-board button[data-x="0"][data-y="0"]').click();
        A.notEqual(fingerprint(await draftOf(page)), testDraftFp, id + ' 返回后编辑生效');
        await page.click('#cancel-edit');
        await page.waitForTimeout(350);
        A.equal(fingerprint(await draftOf(page)), testDraftFp, id + ' 取消编辑恢复测试前原稿');
        A.ok(await page.locator('#test-view').isVisible(), id + ' 取消编辑回到原测试');
        const restored = await st();
        A.equal(restored.phase, victoryState.phase); A.equal(restored.turn, victoryState.turn); A.equal(restored.kills, victoryState.kills);
        await page.click('#return-edit');
        await page.waitForTimeout(200);
        // 重开独立测试：从原稿新开一局，非继续上一局。
        await page.click('#start-test');
        await page.waitForFunction(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.src.includes('editor-test=1')); const s = f && f.contentWindow.__M0_DEBUG__ && f.contentWindow.__M0_DEBUG__.getState(); return s && s.phase === 'player' && s.turn === 1; }, null, { timeout: 15000 });
        const restarted = await st();
        A.equal(restarted.turn, 1); A.equal(restarted.kills, 0); A.equal(restarted.units.length, initial.units.length);
        await page.click('#return-edit');
        await page.waitForTimeout(200);
        // 新建原稿（放弃未保存修改）后编辑器仍可用，内置模板未被改动。
        page.once('dialog', d => d.accept());
        await page.click('#new-map');
        await page.waitForTimeout(300);
        const fresh = await draftOf(page);
        A.equal(fresh.units.some(u => u.kind === 'elephant'), false);
        A.equal(fresh.units.length, 13, '新建为默认地图完整阵容（我方5/敌方8）');
        // 正式存档/绑定未被污染
        A.equal(await page.evaluate(() => localStorage.getItem('m0-journey-v1')), null, id + ' 未写正式旅程存档');
        A.equal(await menu.evaluate(() => window.M0Campaign.info().view), 'menu', id + ' 正式页仍在菜单');
        A.equal(await menu.evaluate(() => window.M0Campaign.info().journey), false, id + ' 正式页未产生旅程');
        const libraryAfter = JSON.parse(await page.evaluate(() => localStorage.getItem('m0-map-library-v1')));
        A.equal(await page.evaluate(() => localStorage.getItem('m0-map-library-v1')), entry.bindingBefore, id + ' 测试未改变已有地图库/绑定');
        entry.isolation = { journeyAbsent: true, libraryUnchanged: true, formalMenuClean: true, binding: libraryAfter.bindings['2'] ? '已绑定且未改变' : '未绑定' };
        ok(id + '-isolation', '原稿/正式存档/绑定隔离检查通过', entry.isolation);
      }
    } catch (e) {
      bad(id + '-play', '执行失败', e);
      entry.error = String(e && e.stack || e);
      await shot(page, `p04-${id}-error.png`).catch(() => { });
    } finally {
      await context.close();
    }
  }
  report.finishedAt = new Date().toISOString();
  for (const f of VERSION_FILES) if (fs.existsSync(f)) report.versionsEnd[f] = sha256(fs.readFileSync(f));
  report.pass = failed === 0; report.failed = failed;
  fs.writeFileSync(path.join(evidence, 'playthrough-result.json'), JSON.stringify(report, null, 2));
  console.log(failed === 0 ? 'PLAYTHROUGH PASS' : 'PLAYTHROUGH FAIL ' + failed);
  await browser.close(); await srv.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => { console.error(e); report.pass = false; report.error = String(e && e.stack || e); try { fs.writeFileSync(path.join(evidence, 'playthrough-result.json'), JSON.stringify(report, null, 2)); } catch (x) { } if (srv) await srv.close(); process.exit(1); });
