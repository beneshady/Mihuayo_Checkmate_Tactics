// US-011 2026-10-23 增补实际浏览器验收：正常入口、真实文件选择、真实下载、刷新、失败注入。
// 不以 JSON.parse 或源码比对代替接收端兼容测试（接收端见 tests/us011-mapjson-receiver.cjs）。
const A = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { startServer } = require('./us011-static-server.cjs');
const F = require('./us011-mapjson-fixtures.cjs');
const pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'us', 'us011-json-evidence');
const downloads = path.join(evidence, 'downloads');
const fixturesDir = path.join(evidence, 'fixtures');
const shots = path.join(evidence, 'screenshots');
for (const d of [evidence, downloads, fixturesDir, shots]) fs.mkdirSync(d, { recursive: true });
const RUN = process.env.DSH_RUN_ID || '20261023T141319051Z-819e8000';
const report = {
  task: 'US-011 2026-10-23 标准地图 JSON 导入/导出浏览器验收', runId: RUN,
  startedAt: new Date().toISOString(),
  environment: { node: process.version, playwright: require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')).version, browser: 'chromium headless' },
  cases: [], checks: [], errors: [], artifacts: {}, downloads: {}, fixtures: {}, exports: [],
};

// —— 通用工具 ——
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
function record(name, data = {}) { report.cases.push({ name, ...data }); console.log('PASS ' + name); }
function note(name, data = {}) { report.checks.push({ name, ...data }); }
async function status(page, re) {
  if (re) await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('editor-status').textContent || ''), re.source, { timeout: 15000 });
  return (await page.locator('#editor-status').innerText()).trim();
}
async function waitText(page, selector, text, timeout = 15000) {
  await page.waitForFunction(([sel, t]) => { const el = document.querySelector(sel); return !!el && (el.textContent || '').includes(t); }, [selector, text], { timeout });
}
const draftState = (page) => page.evaluate(() => window.__M0_MAP_EDITOR__.getDraft());
const historyState = (page) => page.evaluate(() => window.__M0_MAP_EDITOR__.getHistory());
const libRaw = (page) => page.evaluate(() => localStorage.getItem('m0-map-library-v1'));
async function chooseFile(page, file) { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import-file').click()]); await chooser.setFiles(file); }
async function expectNoDownload(page, action, label) { let got = null; const on = (d) => { got = d; }; page.once('download', on); await action(); await page.waitForTimeout(800); page.off('download', on); A.equal(got, null, '不得下载：' + label); }
async function shot(page, name, fullPage = true) { const file = path.join(shots, name); await page.screenshot({ path: file, fullPage }); report.artifacts[name] = rel(file); return file; }
async function saveDownload(download, name) { const file = path.join(downloads, name); await download.saveAs(file); report.downloads[name] = { file: rel(file), suggested: download.suggestedFilename(), sha256: F.sha256(fs.readFileSync(file, 'utf8')) }; return file; }
function expandedTiles(doc) { const tiles = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) tiles[x + ',' + y] = 'land'; Object.assign(tiles, doc.map.tiles); return tiles; }
function expectedUnits(doc) { return doc.units.map((u) => ({ id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y, rookRole: u.rookRole || 'base' })); }
function docUnitsFromDraft(units) { return units.map((u) => { const out = { id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y }; if (u.kind === 'rook') out.rookRole = u.rookRole || 'base'; return out; }); }
async function layoutAudit(page, ids) {
  return page.evaluate((list) => {
    const out = { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, controls: {} };
    for (const id of list) {
      const el = document.getElementById(id);
      if (!el) { out.controls[id] = { missing: true }; continue; }
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      out.controls[id] = {
        width: Math.round(r.width), height: Math.round(r.height),
        inViewport: r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
        hit: hit ? (hit.id || hit.className || hit.tagName) : null,
        hitInside: !!(hit && (hit === el || el.contains(hit))),
      };
    }
    return out;
  }, ids);
}
const cellEditor = (page, x, y) => page.locator(`#editor-board button[data-x="${x}"][data-y="${y}"]`).click();
const tool = (page, t) => page.locator(`[data-tool="${t}"]`).click();

(async () => {
  const { port, close } = await startServer(path.join(root, 'web'));
  const base = 'http://127.0.0.1:' + port;
  report.base = base;
  const fixtures = F.writeFixtures(fixturesDir);
  report.fixtures = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, rel(v)]));
  const external = fs.existsSync(F.EXTERNAL) ? F.EXTERNAL : F.referencePath();
  report.reference = { path: external, sha256: F.sha256(fs.readFileSync(external, 'utf8')), fixtureCopySha256: F.sha256(F.referenceText()) };
  const fx = F.fixtures();
  const browser = await pw.chromium.launch({ headless: true });
  let desktopContext;
  try {
    // ================= 桌面：正常入口 =================
    desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    desktopContext.on('page', (p) => p.on('pageerror', (e) => report.errors.push({ context: 'desktop', message: e.message, stack: e.stack })));
    const main = await desktopContext.newPage();
    await main.goto(base + '/?validation=us011-json-20261023');
    await main.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu');
    // 正常入口：新旅程 → 真实完成教学 → 主营地 → 选关 → 布阵页。教学完成后才存在正式旅程存档。
    await main.locator('#flow-new').click();
    await main.waitForFunction(() => window.M0Campaign.info().view === 'tutorial');
    A.equal(await main.locator('#tutorial-skip').isDisabled(), true, '首次不能跳过教学');
    await main.locator('#tutorial-enter').click();
    await main.waitForFunction(() => window.M0Campaign.info().view === 'battle');
    await main.locator('#tutorial-ack').click();
    const hoverEnemy = await main.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 1, y: 3 }));
    await main.mouse.move(hoverEnemy.x, hoverEnemy.y); await main.waitForTimeout(200);
    await main.locator('[data-unit="tut-rook"]').click();
    let pt = await main.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 2, y: 2 }));
    await main.mouse.click(pt.x, pt.y);
    await main.locator('#btn-undo').click();
    await main.locator('[data-unit="tut-rook"]').click();
    pt = await main.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 2, y: 2 }));
    await main.mouse.click(pt.x, pt.y);
    await main.locator('[data-unit="tut-spear"]').click();
    pt = await main.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 6, y: 3 }));
    await main.mouse.click(pt.x, pt.y);
    await main.locator('#btn-end').click();
    await main.locator('#btn-confirm-yes').click();
    await main.waitForFunction(() => document.getElementById('ov-tutorial').classList.contains('show'));
    await main.locator('#tutorial-done-ok').click();
    await main.waitForFunction(() => window.M0Campaign.info().view === 'camp');
    if (await main.locator('#camp-guide').isVisible()) await main.locator('#camp-guide-close').click();
    await main.locator('#camp-leave').click();
    await main.waitForFunction(() => window.M0Campaign.info().view === 'map');
    await main.locator('#flow-enter').click();
    await main.waitForFunction(() => window.M0Campaign.info().view === 'battle');
    await main.waitForFunction(() => !document.getElementById('ov-deploy').hidden);
    A.ok(await main.evaluate(() => !!localStorage.getItem('m0-journey-v1')), '正常入口完成后应存在正式旅程存档');
    const formalStateBefore = await main.evaluate(() => window.__M0_DEBUG__.getState());
    const formalStorageBefore = await main.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    const popupPromise = desktopContext.waitForEvent('page');
    await main.locator('#map-editor-link').click();
    const editor = await popupPromise;
    editor.on('pageerror', (e) => report.errors.push({ context: 'editor', message: e.message, stack: e.stack }));
    let confirmDialogs = [], acceptConfirm = false;
    editor.on('dialog', async (d) => {
      confirmDialogs.push({ type: d.type(), message: d.message() });
      if (d.type() === 'beforeunload') { await d.accept(); return; }
      if (acceptConfirm) { acceptConfirm = false; await d.accept(); return; }
      await d.dismiss();
    });
    await editor.waitForFunction(() => !!window.__M0_MAP_EDITOR__ && !!window.M0MapJson);
    A.deepEqual(await editor.evaluate(() => window.__M0_MAP_EDITOR__.getMeta()), { levelCode: 'level-01', levelName: '三桥山口草稿' }, '新草稿编号默认 level-01，名称复用当前地图名');
    record('入口：正常完成教学→主营地→第1关布阵页“地图编辑器”进入独立编辑页；正式战局与旅程存档已快照');

    // ---------------- J01 ----------------
    await chooseFile(editor, external);
    await status(editor, /已导入/);
    const j01 = await draftState(editor);
    A.deepEqual(j01.tiles, expandedTiles(fx.reference));
    A.deepEqual(j01.units, expectedUnits(fx.reference));
    A.equal(j01.name, '三桥山口');
    A.equal(j01.levelCode, 'level-01');
    A.equal(j01.levelName, '第一关 · 三桥山口');
    A.equal(await editor.locator('#level-code').inputValue(), 'level-01');
    A.equal(await editor.locator('#level-name').inputValue(), '第一关 · 三桥山口');
    A.equal(await editor.locator('#map-name').inputValue(), '三桥山口');
    A.equal(await editor.evaluate(() => window.__M0_MAP_EDITOR__.getId()), null);
    A.equal(await libRaw(editor), null, '导入不自动保存');
    await shot(editor, 'j01-imported-desktop.png');
    record('J01 实际选择用户参考 JSON：双方 14 枚棋子/23 处地形/81 格补陆地/元信息回填一致', { reference: report.reference });

    // ---------------- J02 ----------------
    await tool(editor, 'forest'); await cellEditor(editor, 0, 1);
    await tool(editor, 'move'); await cellEditor(editor, 4, 0); await cellEditor(editor, 3, 0);
    await cellEditor(editor, 1, 5); await cellEditor(editor, 0, 5);
    await editor.locator('#map-name').fill('三桥山口甲');
    await editor.locator('#level-code').fill('level-02');
    await editor.locator('#level-name').fill('第二关 · 测试');
    const j02draft = await draftState(editor);
    A.equal(j02draft.tiles['0,1'], 'forest');
    A.equal(j02draft.units.find((u) => u.id === 'king').x, 3);
    A.equal(j02draft.units.find((u) => u.id === 'w1-0').x, 0);
    A.equal(await libRaw(editor), null, '保存并导出前没有本机保存');
    const j02Download = await Promise.all([editor.waitForEvent('download'), editor.locator('#save-export').click()]).then((r) => r[0]);
    A.equal(j02Download.suggestedFilename(), 'level-02.json');
    const j02Path = await saveDownload(j02Download, 'level-02.json');
    const j02doc = JSON.parse(fs.readFileSync(j02Path, 'utf8'));
    report.exports.push({ name: 'level-02.json', file: rel(j02Path), doc: j02doc, draft: j02draft });
    A.equal(j02doc.formatVersion, 2);
    A.deepEqual(j02doc.meta, { kind: 'battleInit', battleId: 'level-02', displayName: '第二关 · 测试' });
    A.equal(j02doc.map.name, '三桥山口甲');
    A.deepEqual(expandedTiles(j02doc), j02draft.tiles);
    A.deepEqual(j02doc.units, docUnitsFromDraft(j02draft.units));
    A.ok(!Object.values(j02doc.map.tiles).includes('land'), '导出稀疏地形省略陆地');
    A.deepEqual(j02doc.turn, { round: 1, phase: 'player' });
    A.equal(j02doc.result, null);
    A.deepEqual(j02doc.history, { commands: [] });
    A.ok(Number.isInteger(j02doc.rng) && j02doc.rng >= 0 && j02doc.rng <= 4294967295, 'rng 应为 uint32');
    await status(editor, /已保存/); await status(editor, /已发起下载 level-02\.json/); await status(editor, /无法确认/);
    const lib1 = JSON.parse(await libRaw(editor));
    const records = Object.values(lib1.maps);
    A.equal(records.length, 1);
    A.equal(records[0].name, '三桥山口甲');
    A.equal(records[0].revision, 1);
    A.equal(records[0].map.levelCode, 'level-02');
    A.equal(records[0].map.levelName, '第二关 · 测试');
    A.deepEqual(lib1.bindings, {}, '保存并导出不自动绑定');
    await shot(editor, 'j02-exported-desktop.png');
    const savedId = records[0].id;
    await editor.reload();
    await editor.waitForFunction(() => !!window.__M0_MAP_EDITOR__);
    A.equal(await editor.locator('#level-code').inputValue(), 'level-01', '刷新后回到新草稿默认编号');
    A.equal(await editor.locator('#level-name').inputValue(), '三桥山口草稿', '新草稿名称复用当前地图名');
    await editor.locator('#saved-maps').selectOption(savedId);
    await editor.locator('#load').click();
    await status(editor, /已读取/);
    const loaded = await draftState(editor);
    A.deepEqual(loaded.tiles, j02draft.tiles);
    A.deepEqual(loaded.units, j02draft.units);
    A.equal(loaded.name, '三桥山口甲'); A.equal(loaded.levelCode, 'level-02'); A.equal(loaded.levelName, '第二关 · 测试');
    A.equal(await editor.locator('#level-code').inputValue(), 'level-02');
    record('J02 实际修改地形/双方位置/编号名称后保存并导出：先本机保存 v1 再下载 level-02.json，合同字段正确且未绑定', { rng: j02doc.rng, savedId });
    record('J02/J05 刷新后读取保存版本：地形、双方棋子、关卡编号/名称恢复');

    // ---------------- J04 ----------------
    await tool(editor, 'bridge'); await cellEditor(editor, 0, 2);
    const preImport = await draftState(editor), preHist = await historyState(editor), preLib = await libRaw(editor);
    acceptConfirm = true; confirmDialogs = [];
    await chooseFile(editor, j02Path);
    await status(editor, /已导入/);
    A.equal(acceptConfirm, false, '导入应有替换确认并被接受');
    A.ok(confirmDialogs.some((d) => /未保存/.test(d.message)), '有未保存修改应先确认');
    const round = await draftState(editor);
    A.deepEqual(round.tiles, expandedTiles(j02doc));
    A.deepEqual(round.units, expectedUnits(j02doc));
    A.equal(round.name, '三桥山口甲'); A.equal(round.levelCode, 'level-02'); A.equal(round.levelName, '第二关 · 测试');
    A.equal(await editor.evaluate(() => window.__M0_MAP_EDITOR__.getId()), null, '导入后脱离原保存身份');
    A.equal(await libRaw(editor), preLib, '导入不自动保存');
    A.equal((await historyState(editor)).undo, preHist.undo + 1, '导入是一次可撤销编辑');
    await editor.locator('#undo').click();
    const undone = await draftState(editor);
    A.deepEqual(undone.tiles, preImport.tiles); A.deepEqual(undone.units, preImport.units);
    A.equal(await editor.locator('#level-code').inputValue(), preImport.levelCode);
    A.equal(await editor.locator('#level-name').inputValue(), preImport.levelName);
    await editor.locator('#redo').click();
    const redone = await draftState(editor);
    A.deepEqual(redone.tiles, round.tiles); A.deepEqual(redone.units, round.units);
    A.equal(await editor.locator('#level-code').inputValue(), 'level-02');
    A.equal(await editor.locator('#level-name').inputValue(), '第二关 · 测试');
    record('J04 实际导出文件再导入：地形/双方棋子/元信息往返无损，map.name 与 displayName 不同仍各自保留；导入不保存不绑定，撤销重做涵盖元信息');

    // ---------------- J05 ----------------
    await tool(editor, 'water'); await cellEditor(editor, 1, 1);
    const cancelDraft = await draftState(editor), cancelHist = await historyState(editor), cancelLib = await libRaw(editor);
    acceptConfirm = false; confirmDialogs = [];
    await chooseFile(editor, fixtures['cracked-rook-role']);
    await editor.waitForTimeout(600);
    A.ok(confirmDialogs.some((d) => /未保存/.test(d.message)), '取消路径也应先确认');
    A.deepEqual(await draftState(editor), cancelDraft, '取消导入不改草稿');
    A.deepEqual(await historyState(editor), cancelHist, '取消导入不改撤销记录');
    A.equal(await libRaw(editor), cancelLib, '取消导入不改地图库');
    await status(editor, /已取消导入/);
    acceptConfirm = true; confirmDialogs = [];
    await chooseFile(editor, fixtures['cracked-rook-role']);
    await status(editor, /已导入/);
    A.equal(acceptConfirm, false);
    const accepted = await draftState(editor);
    A.equal(accepted.tiles['0,1'], 'cracked');
    A.equal(accepted.levelCode, 'level-cracked');
    A.equal(await editor.evaluate(() => window.__M0_MAP_EDITOR__.getId()), null);
    A.equal(await libRaw(editor), cancelLib, '确认导入也不保存');
    const badDraft = await draftState(editor), badHist = await historyState(editor), badLib = await libRaw(editor);
    await chooseFile(editor, fixtures['bad-json']);
    await waitText(editor, '#json-errors', 'JSON');
    await status(editor, /导入失败/);
    A.deepEqual(await draftState(editor), badDraft);
    A.deepEqual(await historyState(editor), badHist);
    A.equal(await libRaw(editor), badLib);
    record('J05 未保存草稿导入：取消与坏 JSON 均不改草稿/历史/地图库；确认仅替换草稿且与旧保存身份隔离');

    // ---------------- J06 ----------------
    const rejectCases = {
      'version-3': '$.formatVersion', 'version-string': '$.formatVersion', 'battle-save': '$.meta.kind',
      'mid-turn': '$.turn.round', 'enemy-phase': '$.turn.phase', 'result-not-null': '$.result',
      'history-nonempty': '$.history.commands', 'unknown-terrain': '$.map.tiles["0,1"]',
      'unknown-kind': '$.units[1].kind', 'extra-root-field': '$.intents', 'extra-meta-field': '$.meta.createdAt',
      'unit-extra-field': '$.units[0].hp', 'tile-key-out-of-range': '$.map.tiles["9,0"]',
      'tile-key-noncanonical': '$.map.tiles["04,4"]', 'rng-string': '$.rng', 'rng-negative': '$.rng', 'rng-fraction': '$.rng',
      'missing-result': '$.result', 'missing-history': '$.history', 'duplicate-id': '$.units[1].id',
      'overlap': '$.units[1].x/y', 'out-of-bounds': '$.units[1].x/y', 'non-rook-role': '$.units[3].rookRole',
      'nontrim-code': '$.meta.battleId', 'bad-code-char': '$.meta.battleId',
    };
    for (const [name, expectedPath] of Object.entries(rejectCases)) {
      const before = await draftState(editor), hist = await historyState(editor), lib = await libRaw(editor);
      await chooseFile(editor, fixtures[name]);
      await waitText(editor, '#json-errors', expectedPath);
      const errors = await editor.locator('#json-errors').innerText();
      A.ok(errors.includes(expectedPath), name + ' 应定位 ' + expectedPath + '，实际：' + errors);
      await status(editor, /导入失败/);
      A.deepEqual(await draftState(editor), before, name + ' 不得修改草稿');
      A.deepEqual(await historyState(editor), hist, name + ' 不得修改撤销记录');
      A.equal(await libRaw(editor), lib, name + ' 不得修改地图库');
    }
    record('J06 非初始类型/版本/中途回合/结果历史/未知地形兵种/额外业务字段/坐标/重复/重叠/rng 全部明确拒绝并定位，草稿库历史不变', { cases: Object.keys(rejectCases).length });

    // ---------------- J07 ----------------
    const palaceBefore = await draftState(editor), palaceLib = await libRaw(editor);
    await chooseFile(editor, fixtures['king-out-of-palace']);
    await waitText(editor, '#json-errors', '九宫外');
    A.deepEqual(await draftState(editor), palaceBefore);
    A.equal(await libRaw(editor), palaceLib);
    acceptConfirm = true;
    await chooseFile(editor, fixtures['cracked-rook-role']);
    await status(editor, /已导入/);
    A.equal(acceptConfirm, false);
    const crackedDraft = await draftState(editor);
    A.equal(crackedDraft.tiles['0,1'], 'cracked');
    A.equal(crackedDraft.units.find((u) => u.id === 'u1').rookRole, 'charge');
    const crackedDownload = await Promise.all([editor.waitForEvent('download'), editor.locator('#save-export').click()]).then((r) => r[0]);
    A.equal(crackedDownload.suggestedFilename(), 'level-cracked.json');
    const crackedPath = await saveDownload(crackedDownload, 'level-cracked.json');
    const crackedDoc = JSON.parse(fs.readFileSync(crackedPath, 'utf8'));
    report.exports.push({ name: 'level-cracked.json', file: rel(crackedPath), doc: crackedDoc, draft: crackedDraft });
    A.equal(crackedDoc.map.tiles['0,1'], 'cracked');
    A.equal(crackedDoc.units.find((u) => u.id === 'u1').rookRole, 'charge');
    const libBeforeBad = await libRaw(editor);
    await editor.locator('#level-code').fill('level/02');
    await expectNoDownload(editor, () => editor.locator('#save-export').click(), '非法编号');
    await waitText(editor, '#json-errors', '关卡编号');
    await status(editor, /未保存、未下载/);
    A.equal(await libRaw(editor), libBeforeBad);
    await editor.locator('#level-code').fill('level-03');
    await editor.locator('#level-name').fill('   ');
    await expectNoDownload(editor, () => editor.locator('#save-export').click(), '空关卡名称');
    await waitText(editor, '#json-errors', '关卡名称');
    A.equal(await libRaw(editor), libBeforeBad);
    await editor.locator('#level-name').fill('开裂山测试关');
    await tool(editor, 'delete'); await cellEditor(editor, 4, 0);
    await expectNoDownload(editor, () => editor.locator('#save-export').click(), '非法布局缺帅');
    A.match(await editor.locator('#errors').innerText(), /我方帅/);
    A.equal(await libRaw(editor), libBeforeBad, '非法布局不得产生保存副作用');
    await editor.locator('#undo').click();
    A.equal((await draftState(editor)).units.filter((u) => u.kind === 'king').length, 2);
    record('J07 非法编号/名称与非法布局阻止保存导出且无副作用；开裂山与冲锋车原样交换');

    // ---------------- J08 ----------------
    await editor.locator('#level-code').fill('level-04');
    await editor.locator('#level-name').fill('失败注入关');
    const failDraft = await draftState(editor);
    const libBeforeFailure = await libRaw(editor);
    await editor.evaluate(() => { window.__us011SetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('quota-us011'); }; });
    await expectNoDownload(editor, () => editor.locator('#save-export').click(), '存储失败');
    await status(editor, /保存失败/);
    A.equal(await libRaw(editor), libBeforeFailure, '保存失败不得写库');
    await editor.evaluate(() => { Storage.prototype.setItem = window.__us011SetItem; });
    const libBeforeBlob = await libRaw(editor);
    await editor.evaluate(() => { window.__us011Blob = URL.createObjectURL; URL.createObjectURL = function () { throw new Error('blob-us011'); }; });
    await editor.locator('#save-export').click();
    await editor.waitForTimeout(400);
    await status(editor, /已保存/); await status(editor, /导出下载启动失败/);
    A.equal(await editor.locator('#retry-export').isVisible(), true, '下载失败应显示重试按钮');
    const libAfterBlob = JSON.parse(await libRaw(editor));
    A.notEqual(await libRaw(editor), libBeforeBlob, '下载失败前保存已成功');
    A.ok(Object.values(libAfterBlob.maps).some((r) => r.name === '开裂山甲图' && r.revision >= 2), '保存结果保留');
    await editor.evaluate(() => { URL.createObjectURL = window.__us011Blob; });
    const retryDownload = await Promise.all([editor.waitForEvent('download'), editor.locator('#retry-export').click()]).then((r) => r[0]);
    A.equal(retryDownload.suggestedFilename(), 'level-04.json');
    const retryPath = await saveDownload(retryDownload, 'level-04-retry.json');
    const retryDoc = JSON.parse(fs.readFileSync(retryPath, 'utf8'));
    A.equal(retryDoc.meta.battleId, 'level-04');
    report.exports.push({ name: 'level-04-retry.json', file: rel(retryPath), doc: retryDoc, draft: failDraft });
    await status(editor, /重新发起下载/);
    await shot(editor, 'j08-download-retry-desktop.png');
    record('J08 存储失败：不下载不改库；下载启动失败：已保存并明确导出失败、可重试，重试实际产生下载', { rng: retryDoc.rng });

    // ---------------- J09 ----------------
    const stableDraft = await draftState(editor);
    const export1 = await Promise.all([editor.waitForEvent('download'), editor.locator('#save-export').click()]).then((r) => r[0]);
    const p1 = await saveDownload(export1, 'j09-export-1.json');
    const export2 = await Promise.all([editor.waitForEvent('download'), editor.locator('#save-export').click()]).then((r) => r[0]);
    const p2 = await saveDownload(export2, 'j09-export-2.json');
    const doc1 = JSON.parse(fs.readFileSync(p1, 'utf8')), doc2 = JSON.parse(fs.readFileSync(p2, 'utf8'));
    report.exports.push({ name: 'j09-export-1.json', file: rel(p1), doc: doc1, draft: stableDraft });
    report.exports.push({ name: 'j09-export-2.json', file: rel(p2), doc: doc2, draft: stableDraft });
    A.ok(Number.isInteger(doc1.rng) && doc1.rng >= 0 && doc1.rng <= 4294967295);
    A.ok(Number.isInteger(doc2.rng) && doc2.rng >= 0 && doc2.rng <= 4294967295);
    A.deepEqual({ ...doc1, rng: null }, { ...doc2, rng: null }, '除 rng 外内容稳定');
    A.deepEqual(await draftState(editor), stableDraft, '连续导出不改草稿');
    report.rngSamples = [doc1.rng, doc2.rng];
    record('J09 同布局连续保存并导出：每次均为合法 uint32 rng，其余内容稳定，草稿未被随机过程改动', { first: doc1.rng, second: doc2.rng, differ: doc1.rng !== doc2.rng });

    // ---------------- J10 ----------------
    const beforeBinding = JSON.parse(await libRaw(editor));
    A.ok(Object.keys(beforeBinding.maps).length >= 2, '应已有两张已保存地图');
    await editor.locator('#new-map').click();
    await editor.locator('#map-name').fill('正式候选图');
    await editor.locator('#level-code').fill('level-01');
    await editor.locator('#level-name').fill('正式候选关');
    await editor.locator('#save').click();
    await status(editor, /已保存/);
    await editor.locator('#level-number').fill('2');
    await editor.locator('#apply').click();
    await status(editor, /已应用/);
    const boundLib = JSON.parse(await libRaw(editor));
    A.ok(boundLib.bindings['2'], '正式绑定已建立');
    const bindingSnapshot = JSON.stringify(boundLib.bindings['2']);
    const mapSnapshots = Object.fromEntries(Object.entries(boundLib.maps).map(([k, v]) => [k, JSON.stringify({ name: v.name, revision: v.revision })]));
    await chooseFile(editor, j02Path);
    await status(editor, /已导入/);
    await editor.locator('#map-name').fill('甲图导出');
    await editor.locator('#level-code').fill('level-05');
    await editor.locator('#level-name').fill('甲关导出');
    const j10Draft = await draftState(editor);
    const j10Download = await Promise.all([editor.waitForEvent('download'), editor.locator('#save-export').click()]).then((r) => r[0]);
    A.equal(j10Download.suggestedFilename(), 'level-05.json');
    const j10Path = await saveDownload(j10Download, 'level-05.json');
    const j10doc = JSON.parse(fs.readFileSync(j10Path, 'utf8'));
    report.exports.push({ name: 'level-05.json', file: rel(j10Path), doc: j10doc, draft: j10Draft });
    const afterExportLib = JSON.parse(await libRaw(editor));
    A.equal(JSON.stringify(afterExportLib.bindings['2']), bindingSnapshot, '导入/导出/保存不改变正式绑定');
    A.deepEqual(Object.keys(afterExportLib.bindings), Object.keys(boundLib.bindings), '不自动新增绑定');
    for (const [id, snapshot] of Object.entries(mapSnapshots)) A.equal(JSON.stringify({ name: afterExportLib.maps[id].name, revision: afterExportLib.maps[id].revision }), snapshot, '不覆盖其他已保存地图 ' + id);
    // 实际试玩一次行动后再导出
    await editor.locator('#start-test').click();
    let frame;
    for (let i = 0; i < 60 && !frame; i++) { frame = editor.frames().find((f) => f.url().includes('editor-test=1')); if (!frame) await editor.waitForTimeout(100); }
    A.ok(frame, '独立测试 iframe 应加载');
    await frame.waitForFunction(() => window.__M0_DEBUG__ && window.__M0_DEBUG__.getState().phase === 'player');
    const frameBox = await (await editor.locator('#test-frame').elementHandle()).boundingBox();
    const beforeState = await frame.evaluate(() => window.__M0_DEBUG__.getState());
    const kingStart = beforeState.units.find((u) => u.side === 'player' && u.kind === 'king');
    const from = await frame.evaluate((p) => window.__M0_DEBUG__.grid.screenPoint(p), { x: kingStart.x, y: kingStart.y });
    await editor.mouse.click(frameBox.x + from.x, frameBox.y + from.y);
    const target = await frame.evaluate((p) => window.__M0_DEBUG__.grid.screenPoint(p), { x: kingStart.x, y: kingStart.y + 1 });
    await editor.mouse.click(frameBox.x + target.x, frameBox.y + target.y);
    const afterState = await frame.evaluate(() => window.__M0_DEBUG__.getState());
    const kingLive = afterState.units.find((u) => u.side === 'player' && u.kind === 'king');
    A.ok(afterState.revision > beforeState.revision || kingLive.y === kingStart.y + 1, '实际点击应产生一次我方行动');
    await shot(editor, 'j10-test-action-desktop.png');
    await editor.locator('#return-edit').click();
    const playDraft = await draftState(editor);
    A.equal(playDraft.units.find((u) => u.side === 'player' && u.kind === 'king').y, kingStart.y, '试玩位移不得写入原稿');
    const playExport = await Promise.all([editor.waitForEvent('download'), editor.locator('#save-export').click()]).then((r) => r[0]);
    const playPath = await saveDownload(playExport, 'level-05-after-play.json');
    const playDoc = JSON.parse(fs.readFileSync(playPath, 'utf8'));
    report.exports.push({ name: 'level-05-after-play.json', file: rel(playPath), doc: playDoc, draft: playDraft });
    A.deepEqual(expandedTiles(playDoc), playDraft.tiles);
    A.deepEqual(playDoc.units, docUnitsFromDraft(playDraft.units));
    await editor.reload();
    await editor.waitForFunction(() => !!window.__M0_MAP_EDITOR__);
    const reloadLib = JSON.parse(await libRaw(editor));
    A.equal(JSON.stringify(reloadLib.bindings['2']), bindingSnapshot, '刷新后正式绑定仍在');
    A.match(await editor.locator('#binding-info').innerText(), /第2关当前绑定/);
    A.ok(Object.keys(reloadLib.maps).length >= 4, '刷新后多张地图仍在');
    // 正式战局/存档未被污染
    const formalStateAfter = await main.evaluate(() => window.__M0_DEBUG__.getState());
    A.deepEqual(formalStateAfter, formalStateBefore, '编辑器导入/导出/试玩不得改变正式战局');
    A.equal(await main.evaluate(() => localStorage.getItem('m0-journey-v1')), formalStorageBefore['m0-journey-v1'], '正式旅程存档不变');
    record('J10 两张已保存地图、正式绑定与正式存档：导入/导出/保存/刷新不覆盖其他地图、不自动绑定、不污染正式局；试玩行动后导出仍为编辑原稿');

    // 桌面可操作性检查（J11 桌面部分）
    const desktopAudit = await layoutAudit(editor, ['level-code', 'level-name', 'import-file', 'save-export', 'editor-status']);
    report.desktopLayout = desktopAudit;
    A.ok(desktopAudit.scrollWidth <= desktopAudit.innerWidth + 1, '桌面不得横向溢出');
    for (const [id, c] of Object.entries(desktopAudit.controls)) { A.ok(c.width > 0 && c.height > 0, id + ' 应可见'); A.ok(c.hitInside, id + ' 应可点击（未被遮挡）：' + JSON.stringify(c)); }
    await shot(editor, 'j11-desktop-controls.png');

    // ================= 窄屏独立 context =================
    const narrowContext = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    narrowContext.on('page', (p) => p.on('pageerror', (e) => report.errors.push({ context: 'narrow', message: e.message, stack: e.stack })));
    const narrow = await narrowContext.newPage();
    await narrow.goto(base + '/editor.html?validation=us011-json-narrow');
    await narrow.waitForFunction(() => !!window.__M0_MAP_EDITOR__);
    await shot(narrow, 'j11-narrow-initial.png');
    await chooseFile(narrow, external);
    await status(narrow, /已导入/);
    await narrow.locator('#level-code').fill('level-narrow');
    await narrow.locator('#level-name').fill('窄屏关卡');
    await narrow.locator('#level-code').fill('bad/name');
    await narrow.locator('#save-export').click();
    await waitText(narrow, '#json-errors', '关卡编号');
    const narrowErrorAudit = await layoutAudit(narrow, ['level-code', 'level-name', 'import-file', 'save-export', 'editor-status']);
    report.narrowErrorLayout = narrowErrorAudit;
    await shot(narrow, 'j11-narrow-error.png');
    A.ok(narrowErrorAudit.scrollWidth <= narrowErrorAudit.innerWidth + 1, '窄屏不得横向溢出');
    for (const [id, c] of Object.entries(narrowErrorAudit.controls)) { A.ok(c.width > 0 && c.height > 0, id + ' 窄屏应可见'); A.ok(c.hitInside, id + ' 窄屏应可点击（错误不遮挡）：' + JSON.stringify(c)); }
    await narrow.locator('#level-code').fill('level-narrow');
    const narrowDraft = await narrow.evaluate(() => window.__M0_MAP_EDITOR__.getDraft());
    const narrowDownload = await Promise.all([narrow.waitForEvent('download'), narrow.locator('#save-export').click()]).then((r) => r[0]);
    A.equal(narrowDownload.suggestedFilename(), 'level-narrow.json');
    const narrowPath = await saveDownload(narrowDownload, 'level-narrow.json');
    const narrowDoc = JSON.parse(fs.readFileSync(narrowPath, 'utf8'));
    A.equal(narrowDoc.meta.battleId, 'level-narrow');
    A.equal(narrowDoc.meta.displayName, '窄屏关卡');
    report.exports.push({ name: 'level-narrow.json', file: rel(narrowPath), doc: narrowDoc, draft: narrowDraft });
    await status(narrow, /已发起下载/);
    await shot(narrow, 'j11-narrow-exported.png');
    record('J11 桌面与窄屏：实际选择文件、修改元信息、查看错误、保存并下载；控件可见可点击、无横向溢出、错误不遮挡操作', { desktop: desktopAudit, narrow: narrowErrorAudit });

    // 汇总导出文档供 J03 接收端比对
    report.j02Export = { doc: j02doc, draft: j02draft, file: rel(j02Path) };
    report.j10Export = { doc: j10doc, draft: j10Draft, file: rel(j10Path) };
    // 用户参考样例只读：验收过程结束仍未被写入或改写
    A.equal(F.sha256(fs.readFileSync(external, 'utf8')), report.reference.sha256, '用户参考样例未被写入或改写');
    report.importedSeed = fx.reference.rng;
    report.formal = { stateEqual: true, journeyStorageEqual: true };
    A.deepEqual(report.errors, []);
    report.result = 'PASS';
  } catch (e) {
    report.result = 'FAIL';
    report.failure = { message: e.message, stack: e.stack };
    console.error(e);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidence, 'browser-result.json'), JSON.stringify(report, null, 2));
    await browser.close();
    await close();
  }
})();
