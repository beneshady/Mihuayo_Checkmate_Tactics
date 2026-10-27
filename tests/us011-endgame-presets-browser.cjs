// US-011 2026-10-24 残局预置浏览器验收（P01/P02/P03/P06/P07 的正常入口部分）。
// 全部经实际页面点击：预置选择/读取、草稿切换确认、撤销、保存并导出、原生文件选择导入、刷新重读、独立测试入口。
// 规则与布局断言来自 web/js/presets.js 运行时数据；截图/下载/页错误均写入 docs/us/us011-endgame-presets-evidence/。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { startServer } = require('./us011-static-server.cjs');
const P = require('../web/js/presets.js');
const M = require('../web/js/maps.js');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'us', 'us011-endgame-presets-evidence');
const shots = path.join(evidence, 'screenshots');
const downloads = path.join(evidence, 'downloads');
for (const d of [evidence, shots, downloads]) fs.mkdirSync(d, { recursive: true });
const RUN = process.env.DSH_RUN_ID || '20261024T092006239Z-d4b2af16';
const VERSION_FILES = ['web/editor.html', 'web/editor.css', 'web/js/editor.js', 'web/js/maps.js', 'web/js/mapjson.js', 'web/js/presets.js', 'web/js/app.js', 'web/js/rules.js', 'web/index.html'];
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const report = {
  task: 'US-011 2026-10-24 首批三张历史残局预置与双方地界：编辑器/试玩入口浏览器验收',
  runId: RUN, startedAt: new Date().toISOString(),
  environment: { node: process.version, playwright: require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')).version, browser: 'chromium headless', viewport: '1280x900' },
  versions: {}, versionsEnd: {}, cases: [], checks: [], pageErrors: [], consoleErrors: [], downloads: {}, artifacts: {}, presetUnits: {}, ui: {},
};
for (const f of VERSION_FILES) if (fs.existsSync(f)) report.versions[f] = sha256(fs.readFileSync(f));
let failed = 0;
function ok(id, detail, data) { report.cases.push({ id, pass: true, detail, data: data || null }); console.log('PASS ' + id + ' · ' + detail); }
function bad(id, detail, e) { failed++; report.cases.push({ id, pass: false, detail, error: String(e && e.stack || e) }); console.log('FAIL ' + id + ' · ' + detail + ' · ' + (e && e.message || e)); }
async function step(id, fn) { try { const data = await fn(); ok(id, typeof data === 'string' ? data : (data && data.detail) || '', typeof data === 'object' ? data : null); return data; } catch (e) { bad(id, '执行失败', e); } }
async function shot(page, name, fullPage = true) { const file = path.join(shots, name); await page.screenshot({ path: file, fullPage }); report.artifacts[name] = rel(file); return file; }
async function boardShot(page, name) {
  const file = path.join(shots, name);
  await page.screenshot({ path: file });
  report.artifacts[name] = rel(file);
  return file;
}
const draftOf = (page) => page.evaluate(() => window.__M0_MAP_EDITOR__.getDraft());
const historyOf = (page) => page.evaluate(() => window.__M0_MAP_EDITOR__.getHistory());
const libRaw = (page) => page.evaluate(() => localStorage.getItem('m0-map-library-v1'));
const journeyRaw = (page) => page.evaluate(() => localStorage.getItem('m0-journey-v1'));
const keyOf = (u) => [u.id, u.side, u.kind, u.x, u.y, u.rookRole || ''].join('|');
const normUnit = (u) => [u.id, u.side, u.kind, u.x, u.y, u.kind === 'rook' ? (u.rookRole || 'base') : ''].join('|');
const fingerprint = (map) => JSON.stringify({ name: map.name, levelCode: map.levelCode, levelName: map.levelName, tiles: map.tiles, units: map.units });
function presetDraft(id) { const d = P.get(id); const map = P.mapOf(d); return { draft: map, units: d.units.map(keyOf).sort() }; }
function waterRows(map) { const rows = []; for (let y = 0; y < 9; y++) { let n = 0; for (let x = 0; x < 9; x++) if (map.tiles[x + ',' + y] === 'water') n++; rows.push(n); } return rows; }
async function gotoEditor(page) { await page.goto(base + '/editor.html'); await page.waitForFunction(() => !!window.__M0_MAP_EDITOR__ && !!window.M0Presets); }
async function loadPreset(page, id) {
  await page.selectOption('#preset-select', id);
  if (await page.evaluate(() => window.__M0_MAP_EDITOR__.isDirty())) page.once('dialog', d => d.accept());
  await page.click('#load-preset');
  await page.waitForFunction((name) => (document.getElementById('editor-status').textContent || '').includes('已读取预置「' + name + '」'), P.get(id).name, { timeout: 15000 });
  await page.waitForTimeout(80);
}
async function clickCellEditor(page, x, y) { await page.locator(`#editor-board button[data-x="${x}"][data-y="${y}"]`).click(); await page.waitForTimeout(40); }
async function waitFrame(page) { for (let i = 0; i < 120; i++) { const f = page.frames().find(f => f.url().includes('editor-test=1')); if (f) { try { if (await f.evaluate(() => !!window.__M0_DEBUG__)) return f; } catch (e) { } } await page.waitForTimeout(100); } throw Error('独立测试 iframe 未就绪'); }
async function loadSaved(page, value) {
  await page.selectOption('#saved-maps', value);
  if (await page.evaluate(() => window.__M0_MAP_EDITOR__.isDirty())) page.once('dialog', d => d.accept());
  await page.click('#load');
  await page.waitForTimeout(250);
}
async function chooseFile(page, file) { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import-file').click()]); await chooser.setFiles(file); }
async function expectNoDownload(page, action, label) { let got = null; const on = (d) => { got = d; }; page.once('download', on); await action(); await page.waitForTimeout(700); page.off('download', on); A.equal(got, null, '不得下载：' + label); }
let base, srv;
(async () => {
  srv = await startServer(path.join(root, 'web'));
  base = 'http://127.0.0.1:' + srv.port;
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const menuPage = await context.newPage();
  menuPage.on('pageerror', e => report.pageErrors.push(e.message));
  menuPage.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  // 正常入口：正式页菜单 → “地图编辑器 ↗”（新标签页）。
  await menuPage.goto(base + '/');
  await menuPage.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
  const [page] = await Promise.all([context.waitForEvent('page'), menuPage.locator('#flow-menu a[href="editor.html"]').click()]);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  await page.waitForFunction(() => !!window.__M0_MAP_EDITOR__ && !!window.M0Presets, null, { timeout: 30000 });
  report.entry = { from: '正式页菜单 → 地图编辑器 ↗', url: page.url(), menuView: await menuPage.evaluate(() => window.M0Campaign.info().view) };

  // —— P01/P02：预置入口、名称/来源/提示可见，读取为独立草稿 ——
  await step('P02-00 从正式游戏菜单实际点击“地图编辑器 ↗”打开编辑器', async () => {
    A.equal(report.entry.menuView, 'menu');
    A.ok(page.url().includes('editor.html'), '新标签页进入独立编辑器：' + page.url());
    A.ok(await page.locator('#preset-select').isVisible());
    A.equal(await menuPage.evaluate(() => localStorage.getItem('m0-journey-v1')), null, '未开始正式旅程');
    return report.entry;
  });
  await step('P02-01 预置入口可见且有名称/来源/玩法提示', async () => {
    const options = await page.locator('#preset-select option').allTextContents();
    A.deepEqual(options, P.list().map(p => p.name));
    const detail = await page.locator('#preset-detail').innerText();
    for (const p of P.list()) A.ok(p === P.list().find(x => x.id === 'endgame-nine-rings') || detail.length > 0);
    A.ok(detail.includes('大九连环.png') && detail.includes('endgame-nine-rings'), '默认预置详情含来源与编号');
    A.ok(detail.includes('固定第二波兵出生点'), '大九连环改编说明可见');
    A.ok(await page.locator('#load-preset').isVisible());
    await shot(page, 'p02-presets-list-desktop.png');
    return { detail: detail.slice(0, 200) };
  });
  for (const p of P.list()) {
    await step(`P01/P02-${p.id} 读取预置为独立草稿、棋盘截图与坐标清单`, async () => {
      await loadPreset(page, p.id);
      const draft = await draftOf(page);
      const expected = presetDraft(p.id).draft;
      A.equal(fingerprint(draft), fingerprint(expected), '草稿与运行时预置一致');
      A.equal(await page.evaluate(() => window.__M0_MAP_EDITOR__.getId()), null, '读取预置不产生本机保存身份');
      A.equal(await libRaw(page), null, '读取预置不写地图库');
      const status = await page.locator('#editor-status').innerText();
      A.ok(/尚未保存、未绑定/.test(status));
      const hist = await historyOf(page);
      A.ok(hist.undo >= 1, '读取可撤销');
      const counts = { mountain: 0, water: 0, forest: 0 };
      for (const v of Object.values(draft.tiles)) if (v !== 'land') counts[v]++;
      const terrain = P.get(p.id).terrain;
      A.deepEqual({ mountain: counts.mountain, water: counts.water, forest: counts.forest }, { mountain: terrain.mountain.length, water: terrain.water.length, forest: terrain.forest.length });
      const zones = await page.evaluate(() => ({ player: document.querySelectorAll('#editor-board button.zone-player').length, center: document.querySelectorAll('#editor-board button.zone-center').length, enemy: document.querySelectorAll('#editor-board button.zone-enemy').length }));
      A.deepEqual(zones, { player: 36, center: 9, enemy: 36 });
      const legend = await page.locator('.zone-legend').innerText();
      A.ok(legend.includes('我方地界') && legend.includes('中央交界') && legend.includes('敌方地界'));
      await shot(page, `p01-${p.id}-editor.png`);
      report.presetUnits[p.id] = draft.units.map(keyOf).sort();
      report.ui[p.id] = { zones, legend, counts, status };
      return { units: draft.units.length, counts, zones };
    });
  }
  await step('P02-02 读取后编辑 → 取消切换/确认切换、撤销、模板不被修改', async () => {
    await loadPreset(page, 'endgame-nine-rings');
    const original = fingerprint(await draftOf(page));
    await page.locator('#terrain-tools button[data-tool="forest"]').click();
    await clickCellEditor(page, 0, 0);
    const edited = fingerprint(await draftOf(page));
    A.notEqual(edited, original, '编辑改变草稿');
    // 切换到另一预置：先取消
    await page.selectOption('#preset-select', 'endgame-two-wolves');
    let dialogText = '';
    page.once('dialog', async (d) => { dialogText = d.message(); await d.dismiss(); });
    await page.click('#load-preset');
    await page.waitForTimeout(300);
    A.ok(/放弃未保存修改/.test(dialogText), '脏草稿切换会确认：' + dialogText);
    A.equal(fingerprint(await draftOf(page)), edited, '取消后草稿不变');
    // 确认切换
    page.once('dialog', async (d) => { await d.accept(); });
    await page.click('#load-preset');
    await page.waitForTimeout(300);
    A.equal(fingerprint(await draftOf(page)), fingerprint(presetDraft('endgame-two-wolves').draft), '确认后读取第二张预置');
    // 撤销回编辑中的大九连环
    await page.click('#undo');
    await page.waitForTimeout(150);
    A.equal(fingerprint(await draftOf(page)), edited, '撤销恢复读取前草稿');
    // 重新读取大九连环，模板未被修改
    page.once('dialog', async (d) => { await d.accept(); });
    await page.selectOption('#preset-select', 'endgame-nine-rings');
    await page.click('#load-preset');
    await page.waitForTimeout(250);
    A.equal(fingerprint(await draftOf(page)), original, '模板未被之前的编辑修改');
    return { dialogText, undo: (await historyOf(page)).undo };
  });
  await step('P03 三张原稿在编辑器中校验为可测试，记录校验提示', async () => {
    const result = {};
    for (const p of P.list()) {
      await loadPreset(page, p.id);
      const errors = await page.locator('#errors').innerText();
      A.equal(await page.locator('#start-test').isDisabled(), false, p.id + ' 可开始测试');
      A.ok(/布局有效/.test(errors), p.id + ' 校验提示：' + errors);
      result[p.id] = errors;
    }
    return result;
  });
  // —— P03/P06：分别从编辑器正常入口进入独立测试，核对完整阵容与准备移动差异 ——
  report.tests = {};
  for (const p of P.list()) {
    await step(`P03/P06-${p.id} 独立测试入口：完整双方阵容、相/准备移动差异、地界图例`, async () => {
      await loadPreset(page, p.id);
      const draft = await draftOf(page);
      await page.click('#start-test');
      const frame = await waitFrame(page);
      await page.waitForFunction(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.src.includes('editor-test=1')); return f && f.contentWindow.__M0_DEBUG__ && f.contentWindow.__M0_DEBUG__.getState().phase === 'player'; }, null, { timeout: 20000 });
      const state = await frame.evaluate(() => window.__M0_DEBUG__.getState());
      A.equal(state.phase, 'player');
      A.equal(state.testMap, true);
      A.equal(state.gold, 0); A.equal(state.teamSp, 0);
      A.equal(state.level, 1);
      const playerDraft = draft.units.filter(u => u.side === 'player' && u.kind !== 'king');
      for (const u of playerDraft) {
        const on = state.units.find(v => v.id === u.id);
        A.ok(on, '我方入场 ' + u.id); A.equal(on.x, u.x); A.equal(on.y, u.y);
      }
      A.equal(state.units.filter(u => u.side === 'player').length, playerDraft.length + 1);
      A.equal(state.units.filter(u => u.side === 'enemy').length, draft.units.filter(u => u.side === 'enemy').length);
      for (const u of draft.units.filter(u => u.side === 'enemy')) A.ok(state.units.some(v => v.side === 'enemy' && v.kind === u.kind), '敌方入场 ' + u.kind);
      const elephantDraft = draft.units.find(u => u.kind === 'elephant');
      if (elephantDraft) {
        const on = state.units.find(v => v.id === elephantDraft.id);
        A.ok(on, '相入场'); A.equal(on.kind, 'elephant'); A.equal(on.side, 'player');
        A.equal(on.attack, 0); A.equal(on.elephantFreezeUnlocked, false);
        report.tests[p.id] = report.tests[p.id] || {};
        report.tests[p.id].elephant = { id: on.id, x: on.x, y: on.y, pullRange: on.elephantPullRange };
      }
      const moved = state.units.filter(u => u.side === 'enemy' && !draft.units.some(e => e.side === 'enemy' && e.kind === u.kind && e.x === u.x && e.y === u.y)).map(u => ({ id: u.id, kind: u.kind, x: u.x, y: u.y }));
      report.tests[p.id] = Object.assign(report.tests[p.id] || {}, { roster: state.units.length, enemyMoved: moved, waveTwo: state.pendingSpawns.length, wave: state.wave });
      const legend = await frame.evaluate(() => document.getElementById('board-legend').innerText);
      A.ok(legend.includes('我方地界') && legend.includes('中央交界') && legend.includes('敌方地界'), '测试棋盘有地界图例');
      A.ok(!legend.includes('河  道'), '测试棋盘不显示虚假整河');
      const water = waterRows(draft);
      A.ok(Math.max(...water) < 9, '预置没有整行水的中央河');
      await boardShot(page, `p06-${p.id}-test-board.png`);
      report.tests[p.id].boundaryLegend = legend;
      report.tests[p.id].waterRows = water;
      return { roster: state.units.length, enemyMoved: moved.length, waveTwo: state.pendingSpawns.length };
    });
    await step(`P03/P06-${p.id} 返回编辑原稿且不被测试改动`, async () => {
      const before = await draftOf(page);
      await page.click('#return-edit');
      await page.waitForTimeout(250);
      A.ok(await page.locator('#edit-view').isVisible());
      A.ok(await page.locator('#test-view').isHidden());
      const after = await draftOf(page);
      A.equal(fingerprint(after), fingerprint(before), '测试不写回原稿');
      const status = await page.locator('#editor-status').innerText();
      A.ok(/返回测试前原稿/.test(status));
      return status;
    });
  }
  // —— P07：三张预置保存/刷新重载/编辑；旧图兼容；两图导出导入；征西导出拒绝 ——
  await step('P07-01 新建一张旧格式默认地图并保存（旧地图仍可读取对照）', async () => {
    page.once('dialog', async (d) => { await d.accept(); });
    await page.click('#new-map');
    await page.waitForTimeout(250);
    await page.fill('#map-name', '旧图兼容检查');
    await page.click('#save');
    await page.waitForTimeout(200);
    A.ok((await page.locator('#editor-status').innerText()).includes('已保存'));
    const library = JSON.parse(await libRaw(page));
    A.equal(Object.values(library.maps).filter(r => r.name === '旧图兼容检查').length, 1);
    A.deepEqual(library.bindings, {}, '保存草稿不自动绑定');
    return { maps: Object.keys(library.maps).length };
  });
  await step('P07-02 三张预置分别保存、刷新后重载、编辑再保存', async () => {
    const saved = {};
    for (const p of P.list()) {
      await loadPreset(page, p.id);
      await page.fill('#map-name', p.name);
      await page.click('#save');
      await page.waitForTimeout(200);
      const status = await page.locator('#editor-status').innerText();
      A.ok(status.includes('已保存'), p.id + ' 保存：' + status);
      saved[p.id] = { status, id: await page.evaluate(() => window.__M0_MAP_EDITOR__.getId()) };
      A.ok(saved[p.id].id, '保存后获得地图库身份');
    }
    await page.reload();
    await page.waitForFunction(() => !!window.__M0_MAP_EDITOR__);
    const options = await page.locator('#saved-maps option').allTextContents();
    for (const p of P.list()) A.ok(options.some(t => t.includes(p.name)), '地图库含 ' + p.name);
    for (const p of P.list()) {
      const option = await page.evaluate((n) => { const s = document.getElementById('saved-maps'); return [...s.options].find(o => o.textContent.includes(n)).value; }, p.name);
      await loadSaved(page, option);
      const draft = await draftOf(page);
      A.equal(fingerprint(draft), fingerprint(P.mapOf(p.id)), '刷新后重载布局不丢：' + p.id);
      if (p.id === 'endgame-west') A.ok(draft.units.some(u => u.kind === 'elephant'), '重载保留相');
      // 编辑一格再保存
      await page.locator('#terrain-tools button[data-tool="forest"]').click();
      await clickCellEditor(page, 8, 0);
      await page.click('#save');
      await page.waitForTimeout(200);
      A.ok((await page.locator('#editor-status').innerText()).includes('已保存'));
      const lib = JSON.parse(await libRaw(page));
      const rec = Object.values(lib.maps).find(r => r.name === p.name);
      A.equal(rec.revision, 2, p.name + ' 编辑保存版本递增');
      A.equal(rec.map.tiles['8,0'], 'forest', p.name + ' 编辑已保存');
    }
    // 旧图仍可读取且不含象
    const oldOption = await page.evaluate(() => { const s = document.getElementById('saved-maps'); return [...s.options].find(o => o.textContent.includes('旧图兼容检查')).value; });
    await loadSaved(page, oldOption);
    const oldDraft = await draftOf(page);
    A.equal(oldDraft.units.some(u => u.kind === 'elephant'), false);
    A.deepEqual(M.validate(oldDraft), []);
    return { saved };
  });
  const exportedDocs = {};
  await step('P07-03 两张无象预置保存并导出，实际下载文件内容正确', async () => {
    for (const p of P.list().filter(p => !p.units.some(u => u.kind === 'elephant'))) {
      const option = await page.evaluate((n) => { const s = document.getElementById('saved-maps'); return [...s.options].find(o => o.textContent.includes(n)).value; }, p.name);
      await loadSaved(page, option);
      const draft = await draftOf(page);
      A.equal(draft.name, p.name, '导出前加载的是保存图');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-export')]);
      const file = path.join(downloads, p.levelCode + '.json');
      await download.saveAs(file);
      const raw = fs.readFileSync(file, 'utf8'), doc = JSON.parse(raw);
      A.equal(download.suggestedFilename(), p.levelCode + '.json');
      A.equal(doc.formatVersion, 2); A.equal(doc.meta.battleId, p.levelCode); A.equal(doc.meta.displayName, p.levelName);
      A.equal(doc.units.some(u => u.kind === 'elephant'), false);
      const tiles = Object.fromEntries(Object.entries(doc.map.tiles));
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (!(x + ',' + y in tiles)) tiles[x + ',' + y] = 'land';
      A.deepEqual(tiles, draft.tiles, p.id + ' 地形导出一致');
      A.deepEqual(doc.units.map(normUnit).sort(), draft.units.map(normUnit).sort(), p.id + ' 棋子导出一致');
      A.ok(Number.isInteger(doc.rng) && doc.rng >= 0 && doc.rng <= 4294967295, '合法 rng');
      report.downloads[p.levelCode + '.json'] = { file: rel(file), sha256: sha256(raw), suggested: download.suggestedFilename() };
      exportedDocs[p.levelCode] = doc;
      await shot(page, `p07-export-${p.id}.png`);
    }
    return { exported: Object.keys(report.downloads) };
  });
  await step('P07-04 实际下载文件经原生文件输入导入，成为未保存可撤销草稿', async () => {
    const p = P.list()[0], code = p.levelCode, file = path.join(downloads, code + '.json');
    const before = await draftOf(page);
    await chooseFile(page, file);
    await page.waitForTimeout(500);
    const draft = await draftOf(page);
    A.equal(await page.evaluate(() => window.__M0_MAP_EDITOR__.getId()), null, '导入不继承保存身份');
    const exported = exportedDocs[code];
    const expectedTiles = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) expectedTiles[x + ',' + y] = 'land'; Object.assign(expectedTiles, exported.map.tiles);
    A.deepEqual(draft.tiles, expectedTiles, '导入地形与导出一致');
    A.equal(Object.keys(draft.tiles).length, 81, '导入补齐 81 格');
    A.deepEqual(draft.units.map(normUnit).sort(), exported.units.map(normUnit).sort(), '导入棋子与导出一致');
    A.equal(draft.name, exported.map.name, '导入地图名一致');
    A.equal(draft.levelName, exported.meta.displayName, '导入关卡名一致');
    const status = await page.locator('#editor-status').innerText();
    A.ok(/已导入/.test(status), status);
    await page.click('#undo');
    await page.waitForTimeout(150);
    A.equal(fingerprint(await draftOf(page)), fingerprint(before), '撤销导入恢复原草稿');
    return status;
  });
  await step('P07-05 征西标准导出在写入/下载前明确拒绝，不丢象、不产生假兼容、不新增保存', async () => {
    const option = await page.evaluate(() => { const s = document.getElementById('saved-maps'); return [...s.options].find(o => o.textContent.includes('征西')).value; });
    await loadSaved(page, option);
    const loaded = await draftOf(page);
    A.ok(loaded.units.some(u => u.kind === 'elephant'), '加载到含象的征西保存图：' + (await page.locator('#editor-status').innerText()));
    const beforeLibrary = await libRaw(page), beforeDraft = await draftOf(page);
    let clicked = false;
    await expectNoDownload(page, async () => { await page.click('#save-export'); clicked = true; }, '含象地图');
    A.equal(clicked, true);
    await page.waitForTimeout(300);
    const errors = await page.locator('#json-errors').innerText();
    A.ok(/象/.test(errors) && /不支持/.test(errors), '错误列表说明象不支持：' + errors.replace(/\n/g, ' '));
    const status = await page.locator('#editor-status').innerText();
    A.ok(/未保存、未下载/.test(status), '状态说明未保存未下载：' + status);
    A.equal(await libRaw(page), beforeLibrary, '导出拒绝不写本机地图库');
    A.equal(fingerprint(await draftOf(page)), fingerprint(beforeDraft), '拒绝不改变草稿');
    // 独立保存入口仍可用
    await page.click('#save');
    await page.waitForTimeout(200);
    A.ok((await page.locator('#editor-status').innerText()).includes('已保存'), '含象地图可用保存草稿保留');
    await page.reload();
    await page.waitForFunction(() => !!window.__M0_MAP_EDITOR__);
    const option2 = await page.evaluate(() => { const s = document.getElementById('saved-maps'); return [...s.options].find(o => o.textContent.includes('征西')).value; });
    await loadSaved(page, option2);
    A.ok((await draftOf(page)).units.some(u => u.kind === 'elephant'), '刷新后相仍在');
    return { errors: errors.replace(/\n/g, ' '), status };
  });
  await step('P08-01 编辑器不写正式旅程存档、不自动绑定；地图库绑定为空', async () => {
    const library = JSON.parse(await libRaw(page));
    A.deepEqual(library.bindings, {}, '编辑器操作没有产生关卡绑定');
    A.equal(library.maps && Object.keys(library.maps).length >= 4, true);
    A.equal(await journeyRaw(page), null, '编辑器没有写正式旅程存档');
    const binding = await page.locator('#binding-info').innerText();
    A.ok(/尚未配置/.test(binding), binding);
    return { binding, maps: Object.keys(library.maps).length };
  });
  await step('P08-02 正式游戏入口正常，未受编辑器测试影响', async () => {
    const game = await context.newPage();
    game.on('pageerror', e => report.pageErrors.push('game: ' + e.message));
    await game.goto(base + '/');
    await game.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
    const info = await game.evaluate(() => window.M0Campaign.info());
    A.equal(info.journey, false, '正式游戏无旅程存档');
    A.equal(await game.evaluate(() => localStorage.getItem('m0-journey-v1')), null);
    const legend = await game.evaluate(() => document.getElementById('board-legend').innerText);
    A.ok(!legend.includes('我方地界'), '正式棋盘不显示编辑器地界标记');
    await game.screenshot({ path: path.join(shots, 'p08-formal-menu-desktop.png') });
    report.artifacts['p08-formal-menu-desktop.png'] = rel(path.join(shots, 'p08-formal-menu-desktop.png'));
    await game.close();
    return { view: info.view, legend };
  });
  await step('P06/P07 桌面布局与关键控件可见、未被遮挡', async () => {
    await gotoEditor(page);
    await loadPreset(page, 'endgame-west');
    const layout = await page.evaluate(() => {
      const ids = ['preset-select', 'load-preset', 'preset-detail', 'editor-board', 'start-test', 'save', 'save-export', 'import-file', 'level-code', 'level-name'];
      const out = {};
      for (const id of ids) { const el = document.getElementById(id); const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + Math.min(10, r.height / 2)); out[id] = { visible: r.width > 0 && r.height > 0, top: Math.round(r.top), left: Math.round(r.left), hitSelf: !!hit && (hit === el || el.contains(hit)) }; }
      out.horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return out;
    });
    for (const id of ['preset-select', 'load-preset', 'editor-board', 'start-test', 'save-export']) A.ok(layout[id].visible, id + ' 可见');
    A.equal(layout.horizontalOverflow, false, '无横向溢出');
    const board = await page.locator('#editor-board').boundingBox();
    A.ok(board.width > 300 && board.height > 300, '棋盘可点选尺寸');
    const legend = await page.locator('.zone-legend').innerText();
    A.ok(legend.includes('第1～4行') && legend.includes('第5行') && legend.includes('第6～9行'));
    return { layout, board: { width: Math.round(board.width), height: Math.round(board.height) } };
  });

  report.finishedAt = new Date().toISOString();
  for (const f of VERSION_FILES) if (fs.existsSync(f)) report.versionsEnd[f] = sha256(fs.readFileSync(f));
  report.pass = failed === 0; report.failed = failed;
  fs.writeFileSync(path.join(evidence, 'browser-result.json'), JSON.stringify(report, null, 2));
  console.log(failed === 0 ? 'BROWSER PASS' : 'BROWSER FAIL ' + failed);
  await browser.close(); await srv.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => { console.error(e); report.pass = false; report.error = String(e && e.stack || e); try { fs.writeFileSync(path.join(evidence, 'browser-result.json'), JSON.stringify(report, null, 2)); } catch (x) { } if (srv) await srv.close(); process.exit(1); });
