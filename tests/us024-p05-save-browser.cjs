// US-024 P05 保存边界专项补验（独立桌面浏览器上下文，明确标记为专项夹具）。
// 覆盖：
//   1) 普通兵真实点击移动消耗行动 → 真实 UI 转职弓兵 → 扣公共 SP、位置/AP 不变；
//   2) 弓兵真实点击攻击消耗行动 → 真实 UI 前向强化 → 扣公共 SP、位置/AP 不变；
//   3) 两者刷新后均恢复同一保存点，位置、属性、扣款、AP=0/1 保持，再次行动被拒绝。
// 夹具只在 localStorage 无存档时写入一次；reload 由守卫跳过，绝不覆盖真实续局。
// 本脚本只新增测试与证据，不修改业务代码；不属于正常旅程自然转职。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { startServer } = require('./us011-static-server.cjs');
const R = require('../web/js/rules.js');

const dir = path.resolve(process.env.US024_P05_EVIDENCE_DIR || 'docs/us/us024-evidence-p05');
fs.mkdirSync(dir, { recursive: true });
const FILES = ['web/index.html', 'web/js/rules.js', 'web/js/app.js', 'web/js/campaign.js', 'web/js/journey.js', 'tests/us024-p05-save-browser.cjs'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const KEY = 'm0-journey-v1';
const FIXTURE_REASON = 'US024-P05 专项夹具（仅初始化一次；刷新不得覆盖续局）';
const FIXTURE_SAVED_AT = '2026-10-25T04:54:05.000Z';
const report = {
  scope: 'US-024 P05 保存边界精准补验：消耗行动后真实 UI 转职/升级，刷新恢复保存点；专项夹具，不是正常旅程自然转职',
  runId: '20261025T045405118Z-14146df6',
  fixtureMode: '独立桌面浏览器上下文；addInitScript 仅在 localStorage 无 m0-journey-v1 时写入一次夹具；reload 守卫跳过，不覆盖真实续局',
  startedAt: new Date().toISOString(), base: null, cases: [], pageErrors: [],
  versions: {}, versionsEnd: {}, versionsNote: 'versions 为开始时的文件 SHA-256，versionsEnd 为结束时同一批文件；一致才说明证据对应最终版本',
};
let failed = 0, browser, server;

function allLand() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
function battleFixture({ id, kind, x, y, teamSp, enemy }) {
  const units = [R.unit('p05-king', 'player', 'king', 4, 0), R.unit(id, 'player', kind, x, y)];
  if (enemy) units.push(R.unit(enemy.id, 'enemy', enemy.kind, enemy.x, enemy.y));
  units.push(R.unit('p05-boss', 'enemy', 'king', 8, 8));
  const s = R.emptyState(units);
  s.tiles = allLand();
  s.mapSnapshot = { version: 1, name: 'US024 P05 专项地图', info: '全陆地；仅用于保存边界补验', tiles: s.tiles, units: [] };
  s.mapName = 'US024 P05 专项地图';
  s.mapInfo = '全陆地专项夹具';
  s.rng = 20261025;
  s.testMap = true;
  s.phase = 'player'; s.turn = 1; s.wave = 1; s.level = 1; s.completed = 0;
  s.teamSp = teamSp; s.gold = 10;
  s.intents = []; s.pendingSpawns = []; s.pendingAdvisorIds = []; s.corpses = [];
  s.party = [R.copy(units.find(u => u.id === id))];
  s.activeIds = [id];
  s.entrySnapshot = R.copy(s); s.levelSnapshot = R.copy(s);
  return s;
}
function saveFor(s) {
  return JSON.stringify({
    version: 1,
    player: { tutorialCompleted: true, campGuideSeen: true },
    journey: R.journeyRecord(s),
    battle: { version: 1, state: R.copy(s), savedAt: FIXTURE_SAVED_AT, reason: FIXTURE_REASON },
  });
}
async function fixtureContext(browser, save) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // 只初始化一次：同一标签页刷新时 sessionStorage 记录次数，localStorage 已存在则不再写入。
  await ctx.addInitScript(({ key, save }) => {
    try {
      const runs = Number(sessionStorage.getItem('us024-p05-init-runs') || '0') + 1;
      sessionStorage.setItem('us024-p05-init-runs', String(runs));
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, save);
        sessionStorage.setItem('us024-p05-fixture-writes', String(Number(sessionStorage.getItem('us024-p05-fixture-writes') || '0') + 1));
      }
    } catch (e) { }
  }, { key: KEY, save });
  ctx.on('page', page => { page.setDefaultTimeout(45000); page.on('pageerror', e => report.pageErrors.push({ url: page.url(), message: e.message })); });
  return ctx;
}

const st = p => p.evaluate(() => window.__M0_DEBUG__.getState());
const view = p => p.evaluate(() => window.M0Campaign.info().view);
const raw = p => p.evaluate(k => localStorage.getItem(k), KEY);
const G = (s, id) => s.units.find(u => u.id === id);
const pos = u => ({ x: u.x, y: u.y });
const ap = u => [u.ap, u.apLimit];
async function waitView(p, v) { await p.waitForFunction(v => window.M0Campaign && window.M0Campaign.info().view === v, v, { timeout: 30000 }); }
async function cell(p, to) { const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to); await p.mouse.click(xy.x, xy.y); await p.waitForTimeout(320); }
async function selectUnit(p, id) { await p.locator(`#ally-list [data-unit="${id}"]`).click(); await p.waitForTimeout(180); }
async function openSkills(p) { await p.locator('.upgrade-section').evaluate(el => { el.open = true; }); await p.waitForTimeout(150); }
async function card(p) { return (await p.evaluate(() => document.getElementById('selected-card').textContent || '')).replace(/\s+/g, ' ').trim(); }
async function skillText(p) { return (await p.evaluate(() => document.getElementById('skills').textContent || '')).replace(/\s+/g, ' ').trim(); }
async function banner(p) { return (await p.evaluate(() => document.getElementById('banner').textContent || '')).trim(); }
async function teamSpUI(p) { return (await p.evaluate(() => document.getElementById('team-sp').textContent || '')).trim(); }
async function shotBoard(p, name) {
  const box = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, Math.min(r.width, window.innerWidth)), height: Math.max(1, Math.min(r.height, window.innerHeight)) }; });
  await p.screenshot({ path: path.join(dir, name), clip: box });
  return name;
}
async function shotPage(p, name) { await p.screenshot({ path: path.join(dir, name) }); return name; }
async function shotSkills(p, name) {
  await p.locator('#skills').scrollIntoViewIfNeeded().catch(() => { });
  await p.waitForTimeout(100);
  await p.locator('#skills').screenshot({ path: path.join(dir, name) });
  return name;
}
async function blockedRetry(p, id, to) {
  const beforeState = await st(p);
  const before = G(beforeState, id);
  await cell(p, to);
  await p.waitForFunction(() => /本回合已行动/.test(document.getElementById('banner').textContent || ''), null, { timeout: 5000 });
  const after = await st(p);
  const u = G(after, id);
  A.deepEqual([u.x, u.y, u.ap, u.apLimit], [before.x, before.y, before.ap, before.apLimit], id + ' 再次行动被拒绝后位置/AP 不变');
  A.equal(after.revision, beforeState.revision, id + ' 再次行动被拒绝后 revision 不变');
  A.equal(await p.locator('#btn-undo').isDisabled(), true, '升级后撤销不可用');
  return { banner: await banner(p), state: { x: u.x, y: u.y, ap: u.ap, apLimit: u.apLimit, revision: after.revision }, undoDisabled: true };
}
async function initStats(p) {
  return p.evaluate(() => ({
    initRuns: Number(sessionStorage.getItem('us024-p05-init-runs') || '0'),
    fixtureWrites: Number(sessionStorage.getItem('us024-p05-fixture-writes') || '0'),
  }));
}
async function restoreViaContinue(p) {
  // 刷新后应用由启动续局入口直接恢复战场；再走一次“暂停→返回菜单→继续本次游戏”，核对继续入口不改变状态。
  const before = await st(p);
  await p.locator('#btn-pause').click();
  await p.locator('#btn-menu-pause').click();
  await waitView(p, 'menu');
  A.equal(await p.locator('#flow-continue').isVisible(), true, '菜单继续入口可见');
  await p.locator('#flow-continue').click();
  await waitView(p, 'battle');
  const after = await st(p);
  A.deepEqual(after, before, '菜单→继续本次游戏返回同一战场状态');
  return { before: { phase: before.phase, revision: before.revision }, after: { phase: after.phase, revision: after.revision }, view: await view(p), stateIdentical: true };
}

async function runPawnCase(browser) {
  const fix = battleFixture({ id: 'p05-pawn', kind: 'pawn', x: 2, y: 4, teamSp: 6 });
  const save = saveFor(fix);
  const ctx = await fixtureContext(browser, save);
  const shots = [];
  try {
    const p = await ctx.newPage();
    await p.goto(report.base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'battle', null, { timeout: 60000 });
    const fixtureRaw = await raw(p);
    A.equal(fixtureRaw, save, '首次启动写入的夹具原文与预置一致');
    const s0 = await st(p);
    A.equal(s0.phase, 'player');
    A.deepEqual([G(s0, 'p05-pawn').kind, G(s0, 'p05-pawn').x, G(s0, 'p05-pawn').y, G(s0, 'p05-pawn').ap, s0.teamSp], ['pawn', 2, 4, 1, 6]);
    const fixtureSave = JSON.parse(fixtureRaw).battle;
    A.equal(fixtureSave.reason, FIXTURE_REASON, '启动时仍是夹具保存点');
    A.equal(fixtureSave.savedAt, FIXTURE_SAVED_AT);

    await selectUnit(p, 'p05-pawn');
    A.ok(/AP 1\/1/.test(await card(p)), '移动前选中卡 AP 1/1');
    const beforeMove = await st(p);
    shots.push(await shotBoard(p, 'p05-pawn-before-move.png'));
    await cell(p, { x: 2, y: 5 });
    await p.waitForFunction(() => { const u = window.__M0_DEBUG__.getState().units.find(v => v.id === 'p05-pawn'); return u && u.x === 2 && u.y === 5 && u.ap === 0; }, null, { timeout: 5000 });
    const moved = await st(p);
    const movedUnit = G(moved, 'p05-pawn');
    A.deepEqual([movedUnit.kind, movedUnit.x, movedUnit.y, movedUnit.ap, movedUnit.apLimit], ['pawn', 2, 5, 0, 1], '普通兵真实移动成功并消耗唯一行动');
    A.ok(/AP 0\/1/.test(await card(p)), '移动后选中卡 AP 0/1');
    A.equal(await raw(p), fixtureRaw, '普通移动不写续局（仍是夹具原文）');
    A.equal(await teamSpUI(p), '6');
    shots.push(await shotBoard(p, 'p05-pawn-moved-ap0.png'));

    await openSkills(p);
    const promotePanel = await skillText(p);
    A.ok(/转职弓兵/.test(promotePanel), '移动后转职入口仍可点击');
    A.ok(/2 公共 SP/.test(promotePanel), '转职显示 2 公共 SP');
    shots.push(await shotSkills(p, 'p05-pawn-promote-panel.png'));
    await p.locator('#skills [data-skill="promote-archer"]').click();
    await p.waitForFunction(() => { const u = window.__M0_DEBUG__.getState().units.find(v => v.id === 'p05-pawn'); return u && u.kind === 'archer'; }, null, { timeout: 5000 });
    const promoted = await st(p);
    const pu = G(promoted, 'p05-pawn');
    A.deepEqual([pu.kind, pu.x, pu.y, pu.ap, pu.apLimit, pu.attack], ['archer', 2, 5, 0, 1, 2], '转职后属性/位置正确且 AP 仍 0/1');
    A.equal(promoted.teamSp, 4, '转职扣 2 公共 SP：6→4');
    A.equal(await teamSpUI(p), '4');
    const promotedRaw = await raw(p);
    const promotedSave = JSON.parse(promotedRaw).battle;
    A.equal(promotedSave.reason, '升级', '成功转职是保存点');
    A.notEqual(promotedRaw, fixtureRaw, '升级写入真实续局，不再保留夹具原文');
    A.notEqual(promotedSave.savedAt, FIXTURE_SAVED_AT, '升级保存时间已更新');
    const su = promotedSave.state.units.find(u => u.id === 'p05-pawn');
    A.deepEqual([promotedSave.state.teamSp, su.kind, su.x, su.y, su.ap, su.apLimit, su.attack], [4, 'archer', 2, 5, 0, 1, 2], '保存内容含扣款、转职属性、移动位置与 AP=0/1');
    A.ok(/AP 0\/1/.test(await card(p)), '转职后选中卡仍 AP 0/1');
    A.ok(/前向 Lv\.2/.test(await skillText(p)), '转职后技能面板显示弓兵方向等级');
    shots.push(await shotBoard(p, 'p05-pawn-promoted-ap0.png'));
    const blockedBefore = await blockedRetry(p, 'p05-pawn', { x: 2, y: 6 });
    shots.push(await shotPage(p, 'p05-pawn-blocked-before-reload.png'));

    const reloadRaw = await raw(p);
    const initBefore = await initStats(p);
    await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitView(p, 'battle');
    const restored = await st(p);
    const ru = G(restored, 'p05-pawn');
    A.deepEqual([ru.kind, ru.x, ru.y, ru.ap, ru.apLimit, ru.attack, restored.teamSp], ['archer', 2, 5, 0, 1, 2, 4], '刷新后转职属性/位置/AP/扣款完整恢复');
    A.equal(await raw(p), reloadRaw, '刷新未覆盖真实续局（原文逐字节一致）');
    const reloadSave = JSON.parse(reloadRaw).battle;
    A.equal(reloadSave.reason, '升级', '刷新后仍是升级保存点，不是夹具');
    A.equal(reloadSave.savedAt, promotedSave.savedAt, '刷新后保存时间不变');
    const initAfter = await initStats(p);
    A.equal(initAfter.fixtureWrites, 1, '夹具只写入一次');
    A.ok(initAfter.initRuns >= 2, '初始化脚本在刷新时执行但被守卫跳过');
    shots.push(await shotPage(p, 'p05-pawn-reload-restored.png'));
    const continueEntry = await restoreViaContinue(p);
    shots.push(await shotPage(p, 'p05-pawn-continue-restored.png'));
    const afterContinue = await st(p);
    A.deepEqual([G(afterContinue, 'p05-pawn').kind, G(afterContinue, 'p05-pawn').x, G(afterContinue, 'p05-pawn').y, G(afterContinue, 'p05-pawn').ap, afterContinue.teamSp], ['archer', 2, 5, 0, 4], '继续入口返回后仍为同一保存点');
    await selectUnit(p, 'p05-pawn');
    await openSkills(p);
    A.ok(/前向 Lv\.2/.test(await skillText(p)), '刷新后弓兵方向技能仍在');
    shots.push(await shotSkills(p, 'p05-pawn-reload-skills.png'));
    const blockedAfter = await blockedRetry(p, 'p05-pawn', { x: 2, y: 6 });
    shots.push(await shotPage(p, 'p05-pawn-blocked-after-reload.png'));

    return {
      id: 'P05-普通兵移动→真实UI转职→刷新续局',
      type: '专项（明确夹具，非正常旅程自然转职）',
      pass: true,
      fixture: { unit: 'p05-pawn', start: { x: 2, y: 4 }, teamSp: 6, reason: FIXTURE_REASON, savedAt: FIXTURE_SAVED_AT },
      move: { to: { x: 2, y: 5 }, ap: [0, 1], rawUnchangedBeforeUpgrade: true, rawSha256: sha256(fixtureRaw) },
      upgrade: { skill: 'promote-archer', cost: 2, kind: pu.kind, attack: pu.attack, pos: pos(pu), ap: ap(pu), teamSpBefore: 6, teamSpAfter: promoted.teamSp, savedReason: promotedSave.reason, savedAt: promotedSave.savedAt, savedState: { teamSp: promotedSave.state.teamSp, kind: su.kind, attack: su.attack, x: su.x, y: su.y, ap: su.ap, apLimit: su.apLimit }, rawSha256: sha256(promotedRaw) },
      blockedBefore,
      reload: { view: await view(p), kind: ru.kind, attack: ru.attack, pos: pos(ru), ap: ap(ru), teamSp: restored.teamSp, rawUnchanged: true, rawSha256: sha256(reloadRaw), savedReason: reloadSave.reason, savedAt: reloadSave.savedAt, initRuns: initAfter.initRuns, fixtureWrites: initAfter.fixtureWrites },
      continueEntry,
      blockedAfter,
      screenshots: shots,
      note: '夹具仅初始化一次；刷新与菜单继续入口均未重写存档。普通兵移动本身不保存，升级保存点一并保存了移动位置与 AP=0。',
    };
  } finally { await ctx.close().catch(() => { }); }
}

async function runArcherCase(browser) {
  const fix = battleFixture({ id: 'p05-archer', kind: 'archer', x: 2, y: 4, teamSp: 5, enemy: { id: 'p05-target', kind: 'pawn', x: 2, y: 6 } });
  const save = saveFor(fix);
  const ctx = await fixtureContext(browser, save);
  const shots = [];
  try {
    const p = await ctx.newPage();
    await p.goto(report.base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'battle', null, { timeout: 60000 });
    const fixtureRaw = await raw(p);
    A.equal(fixtureRaw, save, '首次启动写入的弓兵夹具原文与预置一致');
    const s0 = await st(p);
    A.deepEqual([G(s0, 'p05-archer').kind, G(s0, 'p05-archer').x, G(s0, 'p05-archer').y, G(s0, 'p05-archer').ap, s0.teamSp, !G(s0, 'p05-target')], ['archer', 2, 4, 1, 5, false]);

    await selectUnit(p, 'p05-archer');
    A.ok(/AP 1\/1/.test(await card(p)), '攻击前选中卡 AP 1/1');
    A.ok(/前向 Lv\.2/.test(await card(p)), '攻击前前向等级 Lv.2');
    shots.push(await shotBoard(p, 'p05-archer-before-attack.png'));
    await cell(p, { x: 2, y: 6 });
    await p.waitForFunction(() => { const s = window.__M0_DEBUG__.getState(); const u = s.units.find(v => v.id === 'p05-archer'); return u && u.ap === 0 && !s.units.some(v => v.id === 'p05-target'); }, null, { timeout: 5000 });
    const attacked = await st(p);
    const au = G(attacked, 'p05-archer');
    A.deepEqual([au.x, au.y, au.ap, au.apLimit], [2, 4, 0, 1], '弓兵真实攻击后位置不变、AP 0/1');
    A.equal(attacked.teamSp, 6, '攻击击杀获得 1 公共 SP：5→6');
    A.equal(await teamSpUI(p), '6');
    const attackRaw = await raw(p);
    const attackSave = JSON.parse(attackRaw).battle;
    A.equal(attackSave.reason, '攻击结算', '真实攻击是保存点');
    A.equal(attackSave.state.units.some(u => u.id === 'p05-target'), false, '攻击击杀已保存');
    shots.push(await shotBoard(p, 'p05-archer-attacked-ap0.png'));

    await openSkills(p);
    const upgradePanel = await skillText(p);
    A.ok(/前向 Lv\.2/.test(upgradePanel) && /1 公共 SP/.test(upgradePanel), '消耗行动后前向强化可购买（1 公共 SP）');
    shots.push(await shotSkills(p, 'p05-archer-upgrade-panel.png'));
    await p.locator('#skills [data-skill="direction"][data-index="0"]').click();
    await p.waitForFunction(() => { const u = window.__M0_DEBUG__.getState().units.find(v => v.id === 'p05-archer'); return u && u.directionPaid[0] === 1; }, null, { timeout: 5000 });
    const upgraded = await st(p);
    const uu = G(upgraded, 'p05-archer');
    A.deepEqual([uu.kind, uu.x, uu.y, uu.ap, uu.apLimit, uu.directionPaid[0], upgraded.teamSp], ['archer', 2, 4, 0, 1, 1, 5], '前向强化成功：属性+1、扣 1 SP、位置与 AP 0/1 不变');
    A.equal(await teamSpUI(p), '5');
    A.ok(/前向 Lv\.3/.test(await skillText(p)), '强化后技能面板显示前向 Lv.3');
    const upgradedRaw = await raw(p);
    const upgradedSave = JSON.parse(upgradedRaw).battle;
    A.equal(upgradedSave.reason, '升级', '成功强化是保存点');
    A.notEqual(upgradedSave.savedAt, attackSave.savedAt, '升级保存时间已更新');
    const savedUnit = upgradedSave.state.units.find(u => u.id === 'p05-archer');
    A.deepEqual([upgradedSave.state.teamSp, savedUnit.kind, savedUnit.x, savedUnit.y, savedUnit.ap, savedUnit.apLimit, savedUnit.directionPaid[0]], [5, 'archer', 2, 4, 0, 1, 1], '保存内容含扣款、方向属性、位置与 AP=0/1');
    A.equal(upgradedSave.state.units.some(u => u.id === 'p05-target'), false, '升级保存仍保留攻击击杀结果');
    shots.push(await shotBoard(p, 'p05-archer-upgraded-ap0.png'));
    const blockedBefore = await blockedRetry(p, 'p05-archer', { x: 2, y: 5 });
    shots.push(await shotPage(p, 'p05-archer-blocked-before-reload.png'));

    const reloadRaw = await raw(p);
    await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitView(p, 'battle');
    const restored = await st(p);
    const ru = G(restored, 'p05-archer');
    A.deepEqual([ru.kind, ru.x, ru.y, ru.ap, ru.apLimit, ru.directionPaid[0], restored.teamSp], ['archer', 2, 4, 0, 1, 1, 5], '刷新后方向强化、扣款、位置与 AP=0/1 完整恢复');
    A.equal(restored.units.some(u => u.id === 'p05-target'), false, '刷新后攻击击杀仍保留');
    A.equal(await raw(p), reloadRaw, '刷新未覆盖真实续局（原文逐字节一致）');
    const reloadSave = JSON.parse(reloadRaw).battle;
    A.equal(reloadSave.reason, '升级', '刷新后仍是升级保存点');
    A.equal(reloadSave.savedAt, upgradedSave.savedAt, '刷新后保存时间不变');
    const initAfter = await initStats(p);
    A.equal(initAfter.fixtureWrites, 1, '夹具只写入一次');
    A.ok(initAfter.initRuns >= 2, '刷新时初始化脚本被守卫跳过');
    shots.push(await shotPage(p, 'p05-archer-reload-restored.png'));
    const continueEntry = await restoreViaContinue(p);
    const afterContinue = await st(p);
    A.deepEqual([G(afterContinue, 'p05-archer').directionPaid[0], G(afterContinue, 'p05-archer').ap, afterContinue.teamSp], [1, 0, 5], '继续入口返回后仍为同一保存点');
    await selectUnit(p, 'p05-archer');
    await openSkills(p);
    A.ok(/前向 Lv\.3/.test(await skillText(p)), '刷新后前向 Lv.3 仍在');
    shots.push(await shotSkills(p, 'p05-archer-reload-skills.png'));
    const blockedAfter = await blockedRetry(p, 'p05-archer', { x: 2, y: 5 });
    shots.push(await shotPage(p, 'p05-archer-blocked-after-reload.png'));

    return {
      id: 'P05-弓兵攻击→真实UI强化→刷新续局',
      type: '专项（明确夹具，非正常旅程自然升级）',
      pass: true,
      fixture: { unit: 'p05-archer', start: { x: 2, y: 4 }, target: { x: 2, y: 6 }, teamSp: 5, reason: FIXTURE_REASON, savedAt: FIXTURE_SAVED_AT },
      attack: { direction: 0, ap: [0, 1], kill: true, teamSpBefore: 5, teamSpAfter: attacked.teamSp, savedReason: attackSave.reason, savedAt: attackSave.savedAt, targetGone: true },
      upgrade: { skill: 'direction', index: 0, cost: 1, directionPaid: uu.directionPaid[0], pos: pos(uu), ap: ap(uu), teamSpBefore: 6, teamSpAfter: upgraded.teamSp, savedReason: upgradedSave.reason, savedAt: upgradedSave.savedAt, savedState: { teamSp: upgradedSave.state.teamSp, directionPaid: savedUnit.directionPaid[0], x: savedUnit.x, y: savedUnit.y, ap: savedUnit.ap, apLimit: savedUnit.apLimit, targetGone: true }, rawSha256: sha256(upgradedRaw) },
      blockedBefore,
      reload: { view: await view(p), directionPaid: ru.directionPaid[0], pos: pos(ru), ap: ap(ru), teamSp: restored.teamSp, targetGone: true, rawUnchanged: true, rawSha256: sha256(reloadRaw), savedReason: reloadSave.reason, savedAt: reloadSave.savedAt, initRuns: initAfter.initRuns, fixtureWrites: initAfter.fixtureWrites },
      continueEntry,
      blockedAfter,
      screenshots: shots,
      note: '夹具仅初始化一次；刷新与菜单继续入口均未重写存档。攻击与升级各为独立保存点，升级不补回已消耗行动。',
    };
  } finally { await ctx.close().catch(() => { }); }
}

(async () => {
  try {
    const started = await startServer(path.join(__dirname, '../web'));
    server = started.server;
    report.base = 'http://127.0.0.1:' + started.port;
    for (const f of FILES) if (fs.existsSync(f)) report.versions[f] = hash(f);
    browser = await pw.chromium.launch({ headless: true });
    for (const [id, fn] of [['P05-pawn', runPawnCase], ['P05-archer', runArcherCase]]) {
      try {
        const c = await fn(browser);
        report.cases.push(c);
        console.log('PASS ' + id + ' · ' + c.id);
      } catch (e) {
        failed++;
        report.cases.push({ id, pass: false, error: String(e && e.stack || e) });
        console.log('FAIL ' + id + ' · ' + (e && e.message || e));
      }
    }
    report.finishedAt = new Date().toISOString();
    for (const f of FILES) if (fs.existsSync(f)) report.versionsEnd[f] = hash(f);
    report.hashMatch = Object.keys(report.versions).every(f => report.versions[f] === report.versionsEnd[f]);
    report.failed = failed;
    fs.writeFileSync(path.join(dir, 'us024-p05-result.json'), JSON.stringify(report, null, 2));
    console.log(`\n${failed || report.pageErrors.length || !report.hashMatch ? 'FAILED' : 'ALL PASS'} · ${report.cases.filter(c => c.pass).length}/${report.cases.length} 项 · 页面错误 ${report.pageErrors.length} · 版本哈希一致 ${report.hashMatch}`);
    if (report.pageErrors.length) console.log('pageErrors:', report.pageErrors);
    process.exitCode = failed || report.pageErrors.length || !report.hashMatch ? 1 : 0;
  } catch (e) {
    console.error('RUN ERROR', e);
    fs.writeFileSync(path.join(dir, 'us024-p05-result.json'), JSON.stringify(Object.assign(report, { runError: String(e && e.stack || e) }), null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => { });
    if (server) await new Promise(r => server.close(r));
  }
})();
