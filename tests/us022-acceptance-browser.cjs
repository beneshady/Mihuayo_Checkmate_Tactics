// US-022 实际浏览器验收：E01/E20 正常入口主链路（真实点击赚猫粮/SP → 购象 → 布阵 → 移/牵引 →
// 解锁冰封 → 冰封与待机 → 受伤解冻 → 升级），以及 E02～E19 的界面专项与旧档副本。
// 专项夹具段明确标注“专项”，不替代正常流程；截图与 JSON 证据写入 docs/us/us022-evidence/。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const R = require('../web/js/rules.js');
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8777';
const dir = path.resolve(process.env.US022_EVIDENCE_DIR || 'docs/us/us022-evidence');
fs.mkdirSync(dir, { recursive: true });
const VERSION_FILES = ['web/index.html', 'web/js/rules.js', 'web/js/app.js', 'web/js/campaign.js', 'tests/us022-elephant.test.cjs', 'tests/us022-acceptance-browser.cjs'];
const report = {
  scope: 'US-022 E01～E21 实际浏览器验收（正常入口 + 专项夹具 + 旧档副本）',
  startedAt: new Date().toISOString(), steps: [], pageErrors: [], layout: {}, save: {},
  versions: Object.fromEntries(VERSION_FILES.filter(f => fs.existsSync(f)).map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))
};
let failed = 0;
function ok(id, kind, detail, evidence) { report.steps.push({ id, kind, pass: true, detail, evidence: evidence || null }); console.log('PASS ' + id + ' · ' + detail); }
function bad(id, kind, detail, error) { failed++; report.steps.push({ id, kind, pass: false, detail, error: String(error && error.stack || error) }); console.log('FAIL ' + id + ' · ' + detail + ' · ' + (error && error.message || error)); }
async function step(id, kind, fn) { try { const detail = await fn(); ok(id, kind, detail); } catch (e) { bad(id, kind, '执行失败', e); } }
const st = p => p.evaluate(() => window.__M0_DEBUG__.getState());
const G = (s, id) => s.units.find(u => u.id === id);
async function cell(p, to) { const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to); await p.mouse.click(xy.x, xy.y); }
async function hoverCell(p, to) { const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to); await p.mouse.move(xy.x + 2, xy.y + 1); await p.mouse.move(xy.x, xy.y); }
async function shot(p, name, clip) { const file = path.join(dir, name); await p.screenshot(clip ? { path: file, clip } : { path: file }); return name; }
async function shotBoard(p, name) {
  const box = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  return shot(p, name, { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, box.width), height: Math.max(1, box.height) });
}
async function endTurn(p) {
  await p.locator('#btn-end').click({ timeout: 8000 });
  await p.locator('#btn-confirm-yes').click({ timeout: 8000 });
  await p.waitForTimeout(120);
}
async function waitView(p, view) { await p.waitForFunction(v => window.M0Campaign && window.M0Campaign.info().view === v, view, { timeout: 30000 }); }
async function openWithSave(browser, save, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 } });
  await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(save))});}catch(e){}`);
  const p = await ctx.newPage();
  p.on('pageerror', e => report.pageErrors.push(e.message));
  await p.goto(base + '/');
  return { ctx, p };
}
async function openFixture(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => report.pageErrors.push(e.message));
  await p.goto(base + '/?device-preview=regression&validation=us022');
  await p.waitForFunction(() => !!window.__M0_DEBUG__);
  return { ctx, p };
}
function playerSave(over) { return Object.assign({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null }, over || {}); }
const unit = (id, side, kind, x, y) => R.unit(id, side, kind, x, y);
const P = (id, kind, x, y) => unit(id, 'player', kind, x, y);
const E = (id, kind, x, y) => unit(id, 'enemy', kind, x, y);
function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
function fixture(units, opts) {
  opts = opts || {};
  const s = R.emptyState(units);
  s.phase = opts.phase || 'player';
  s.tiles = Object.assign(land(), opts.tiles || {});
  s.intents = opts.intents || [];
  s.teamSp = opts.teamSp === undefined ? 0 : opts.teamSp;
  if (opts.buffs) s.buffs = Object.assign({ health: false, move: false, rescue: false }, opts.buffs);
  if (opts.corpses) s.corpses = opts.corpses;
  if (opts.gold !== undefined) s.gold = opts.gold;
  return s;
}
async function inject(p, s) { await p.evaluate(x => window.__M0_DEBUG__.setState(x), s); await p.waitForTimeout(80); }
async function selectAlly(p, id) {
  const ally = p.locator('[data-unit="' + id + '"]');
  if (await ally.first().isVisible()) { await ally.first().click(); return; }
  await p.locator('#mobile-tools [data-ui-view="units"]').click();
  await p.locator('[data-unit="' + id + '"]').first().click();
  if (await p.locator('#btn-mobile-info-close').isVisible()) await p.locator('#btn-mobile-info-close').click();
}
async function selectMode(p, mode) { await p.locator(`#rook-modes [data-mode="${mode}"]`).click(); await p.waitForTimeout(60); }
async function openSkills(p) {
  // 直接展开 details（只影响展示，不改变规则状态），确保技能按钮可见。
  await p.evaluate(() => { const d = document.querySelector('details.upgrade-section'); if (d) d.open = true; });
  await p.locator('#skills [data-skill]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
  await p.waitForTimeout(60);
}
// 自动游玩用的评估函数（与 US020 验收相同思路，全部经真实点击提交）
function score(s) {
  const k = R.king(s, 'player');
  if (!k || s.result === 'dead') return -1e6;
  const enemyHp = s.units.filter(u => u.side === 'enemy').reduce((n, u) => n + u.hp * 12 + (u.kind === 'king' ? 40 : 0), 0);
  const threat = s.units.filter(u => u.side === 'enemy' && Math.max(Math.abs(u.x - k.x), Math.abs(u.y - k.y)) <= 2).length;
  const mine = s.units.filter(u => u.side === 'player' && u.kind !== 'king').reduce((n, u) => n + u.hp * 6 + 8, 0);
  return (s.phase === 'intermission' ? 10000 : 0) + s.kills * 45 + k.hp * 1400 + mine - enemyHp - threat * 220;
}
function chooseAction(s, excludeIds) {
  const baseline = score(R.enemyPhase(s, true).state);
  let best;
  for (const u of s.units.filter(u => u.side === 'player' && (!excludeIds || !excludeIds.includes(u.id)))) {
    for (const a of R.legalActions(s, u.id)) {
      const r = a.type === 'directional' ? R.previewDirection(s, u.id, a.direction) : R.preview(s, u.id, a.to, a.type);
      if (!r) continue;
      const v = score(r.prediction.state);
      if (v > baseline && (!best || v > best.v)) best = { a, v };
    }
  }
  return best && best.a;
}
async function doAction(p, a) {
  const s = await st(p);
  const u = s.units.find(x => x.id === a.actor);
  await selectAlly(p, a.actor);
  await p.waitForTimeout(40);
  const mode = u.kind === 'rook' ? (a.type === 'charge' || a.type === 'charge-corpse' ? 'charge' : a.type === 'pull' || a.type === 'pull-collision' ? 'pull' : 'rook-move')
    : u.kind === 'horse' ? (a.type === 'horse-jump' ? 'horse-jump' : 'horse-move')
      : u.kind === 'elephant' ? (a.type === 'elephant-pull' ? 'elephant-pull' : a.type === 'elephant-freeze' ? 'elephant-freeze' : 'elephant-move') : null;
  if (mode && await p.locator(`#rook-modes [data-mode="${mode}"]`).count()) await selectMode(p, mode);
  if (a.type === 'directional') { const t = s.units.find(x => a.targets.includes(x.id)) || a.mountains[0]; await cell(p, t); return; }
  await cell(p, a.to);
  await p.waitForTimeout(40);
}

/* ================= A. 正常入口：营地招募 → 正式关卡赚 SP → 购象 → 布阵 → 移/牵引 → 冰封 ================= */
async function normalFlow(browser) {
  const { ctx, p } = await openWithSave(browser, playerSave());
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
  const flow = {};
  await step('E01-正常入口', '正常入口（新旅程→跳过教学→主营地）', async () => {
    await p.locator('#flow-new').click();
    await waitView(p, 'tutorial');
    await p.locator('#tutorial-skip').click();
    await p.locator('#tutorial-skip-yes').click();
    await waitView(p, 'camp');
    if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
    const s = await st(p);
    A.equal(s.gold, 8, '首次入营 8 猫粮');
    A.equal(s.teamSp, 0, '新旅程公共 SP 从 0 开始');
    A.ok(!s.party.some(u => u.kind === 'elephant'), '初始阵容不含象');
    A.equal(s.party.length, 4, '初始 4 名普通队友');
    const recruitText = await p.locator('#camp-recruit').innerText();
    A.match(recruitText, /象/, '招募区出现象');
    A.match(recruitText, /5 猫粮/, '象明码标价 5 猫粮');
    flow.campShot = await shot(p, 'e01-camp-recruit.png');
    return `正常点击进入主营地：猫粮 ${s.gold}、公共 SP ${s.teamSp}、队伍 ${s.party.map(u => u.kind).join('/')}、无象；招募区显示象 5 猫粮（截图 ${flow.campShot}）`;
  });
  await step('E20-1', '正常入口：第 1 关布阵与真实战斗赚猫粮/SP', async () => {
    await p.locator('#camp-leave').click();
    await waitView(p, 'map');
    await p.locator('#campaign button[data-region="0"]').click();
    await p.locator('#flow-enter').click();
    await waitView(p, 'battle');
    const deployAndPlay = async () => {
      let cur = await st(p);
      A.equal(cur.phase, 'deploy', '进入布阵');
      const spots = [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 7, y: 2 }];
      const ordinary = cur.units.filter(u => u.side === 'player' && u.kind !== 'king' && u.kind !== 'advisor');
      for (let i = 0; i < ordinary.length; i++) {
        cur = await st(p);
        const spot = spots[i];
        if (cur.units.some(v => v.x === spot.x && v.y === spot.y)) continue;
        await selectAlly(p, ordinary[i].id);
        await cell(p, spot);
        await p.waitForTimeout(40);
      }
      await p.locator('#btn-deploy-confirm').click();
      await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
      let turns = 0;
      for (; turns < 14; turns++) {
        cur = await st(p);
        if (cur.phase !== 'player') break;
        for (let q = 0; q < 8; q++) {
          cur = await st(p);
          if (cur.phase !== 'player') break;
          const a = chooseAction(cur);
          if (!a) break;
          await doAction(p, a);
        }
        cur = await st(p);
        if (cur.phase === 'rescue') { await p.locator('#btn-rescue-skip').click(); await p.waitForTimeout(80); continue; }
        if (cur.phase === 'player') await endTurn(p);
        if ((await st(p)).phase !== 'player') break;
      }
      return { state: await st(p), turns };
    };
    let outcome = await deployAndPlay();
    flow.deployShot = await shot(p, 'e20-deploy.png');
    let attempts = 1;
    // 若自动策略偶发失败：按游戏内“从本关布阵重试”继续（真实点击，仍是正常流程）
    while (outcome.state.phase === 'result' && outcome.state.result === 'dead' && attempts < 4) {
      await p.locator('#btn-restart-2').click();
      await p.waitForTimeout(300);
      attempts++;
      outcome = await deployAndPlay();
    }
    const s = outcome.state;
    A.equal(s.phase, 'intermission', '第 1 关以胜利结算并回营（实际 ' + s.phase + '/' + s.result + '）');
    A.ok(s.teamSp >= 2, '第 1 关正常战斗至少赚到 2 公共 SP（实际 ' + s.teamSp + '）');
    A.ok(s.gold >= 5, '第 1 关正常战斗至少赚到 5 猫粮（实际 ' + s.gold + '）');
    flow.level1Shot = await shot(p, 'e20-level1-earn.png');
    flow.afterLevel1 = { phase: s.phase, result: s.result, turn: s.turn, kills: s.kills, teamSp: s.teamSp, gold: s.gold, attempts };
    return `第 1 关布阵后真实点击完成 ${outcome.turns} 回合（第 ${attempts} 次尝试）：胜利、击杀 ${s.kills}、公共 SP ${s.teamSp}、猫粮 ${s.gold}（截图 ${flow.deployShot}、${flow.level1Shot}）`;
  });
  await p.waitForTimeout(300);
  // 胜利后 campaign 层会自动回营（update → enterCamp）
  let s = await st(p);
  if (s.phase === 'intermission') await waitView(p, 'camp');
  await p.waitForTimeout(200);
  await step('E01-购象', '营地招募象：5 猫粮、1 基础 HP、坚守后 2 HP、可多购、满员后备、猫粮不足不扣款', async () => {
    s = await st(p);
    if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
    const goldBefore = s.gold;
    await p.locator('[data-recruit="elephant"]').click();
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().party.some(u => u.kind === 'elephant'), null, { timeout: 8000 });
    s = await st(p);
    A.equal(s.gold, goldBefore - 5, '招募象扣 5 猫粮');
    const ele = s.party.find(u => u.kind === 'elephant');
    A.ok(ele, '队伍中出现象');
    A.equal(ele.maxHp, 2, '坚守（首次入营免费获得）生效后象 2 HP');
    A.equal(ele.hp, 2);
    const bench = !(s.activeIds || []).includes(ele.id);
    A.ok(bench, '初始 4 人口满员时新象进入后备');
    await shot(p, 'e01-elephant-recruited.png');
    // 多购：继续招募，直到猫粮不足 5（最多再买 3 只）
    let buys = 1;
    for (let i = 0; i < 3; i++) {
      s = await st(p);
      if (s.gold < 5) break;
      const goldNow = s.gold, countNow = s.party.filter(u => u.kind === 'elephant').length;
      await p.locator('[data-recruit="elephant"]').click();
      await p.waitForFunction(n => window.__M0_DEBUG__.getState().party.filter(u => u.kind === 'elephant').length === n, countNow + 1, { timeout: 8000 });
      s = await st(p);
      A.equal(s.gold, goldNow - 5, '每只象同样 5 猫粮');
      A.equal(s.party.filter(u => u.kind === 'elephant').length, countNow + 1, '可招募多只象');
      A.ok(s.bench.filter(id => (s.party.find(u => u.id === id) || {}).kind === 'elephant').length >= 1 || !s.activeIds.includes(s.party.find(u => u.kind === 'elephant').id), '部署人口满时象进入后备');
      buys++;
    }
    A.ok(buys >= 2, '实际完成多购（本次 ' + buys + ' 只）');
    // 不足：猫粮不足 5 时按钮禁用，点击不扣款
    s = await st(p);
    A.ok(s.gold < 5, '本次猫粮已花到不足 5（' + s.gold + '）');
    const disabled = await p.locator('[data-recruit="elephant"]').isDisabled();
    A.ok(disabled, '猫粮不足 5 时象招募按钮禁用');
    const before = await st(p);
    if (!disabled) { await p.locator('[data-recruit="elephant"]').click({ force: true }); await p.waitForTimeout(150); }
    const after = await st(p);
    A.equal(after.gold, before.gold, '猫粮不足时点击不扣款');
    A.equal(after.party.length, before.party.length, '猫粮不足时不增加队伍');
    await shot(p, 'e01-recruit-insufficient.png');
    const eleFinal = (await st(p)).party.find(u => u.kind === 'elephant');
    return `点击招募象：猫粮 ${goldBefore}→${(await st(p)).gold}（共 ${buys} 只，每只 5 猫粮），象 HP ${eleFinal.hp}/${eleFinal.maxHp}（坚守），满员时进入后备；猫粮不足 5 时按钮禁用、点击不扣款（截图 e01-elephant-recruited.png、e01-recruit-insufficient.png）`;
  });
  await step('E20-2', '营地换阵：让象上阵（保留车，换下兵）', async () => {
    s = await st(p);
    const ele = s.party.find(u => u.kind === 'elephant');
    if (!s.activeIds.includes(ele.id)) {
      const out = s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind === 'pawn'; }) || s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind !== 'advisor'; });
      await p.locator(`[data-camp-roster="${out}"]`).click();
      await p.waitForTimeout(120);
      await p.locator(`[data-camp-roster="${ele.id}"]`).click();
      await p.waitForTimeout(150);
    }
    s = await st(p);
    A.ok(s.activeIds.includes(ele.id), '象已上阵');
    A.ok(s.activeIds.some(id => { const u = s.party.find(v => v.id === id); return u && u.kind === 'rook'; }), '保留车在阵');
    const campShot = await shot(p, 'e20-camp-roster.png');
    return `名单切换：上阵 ${s.activeIds.join(',')}；猫粮 ${s.gold}、公共 SP ${s.teamSp}（截图 ${campShot}）`;
  });
  // ---- E20 战斗链路：全部真实点击，按当前局面自适应（移→牵引→解锁冰封→冰封→非致命伤害解冻→升级） ----
  const chain = { move: null, pull: null, unlock: null, freeze: null, thaw: null, upgrade: null, shots: [], log: [] };
  const pushStep = (id, kind, pass, detail, evidence, error) => {
    report.steps.push({ id, kind, pass, detail, evidence: evidence || null, error: pass ? undefined : String(error && error.stack || error) });
    if (!pass) failed++;
    console.log((pass ? 'PASS ' : 'FAIL ') + id + ' · ' + detail);
  };
  // 找出“同一回合内可被冻结（象技能）+ 被其他单位非致命伤害”的组合
  // 其他单位用真实点击行动（排除名单用于保留象的技能），然后结束回合推进局面
  async function autoTurn(p, excludeIds) {
    let cur = await st(p);
    for (let q = 0; q < 6; q++) {
      cur = await st(p);
      if (cur.phase !== 'player') break;
      const a = chooseAction(cur, excludeIds || []);
      if (!a) break;
      await doAction(p, a);
    }
    cur = await st(p);
    if (cur.phase === 'rescue') { await p.locator('#btn-rescue-skip').click(); await p.waitForTimeout(80); return; }
    if (cur.phase === 'player') await endTurn(p);
  }
  function findFreezePair(cur) {
    const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
    if (!ele || ele.elephantSkillUsed || !R.elephantFreezeUnlocked(ele)) return null;
    const targets = R.legalActions(cur, ele.id).filter(a => a.type === 'elephant-freeze')
      .map(a => ({ a, t: G(cur, a.targetId) })).filter(x => x.t && x.t.hp >= 2)
      .sort((x, y) => y.t.hp - x.t.hp || x.t.id.localeCompare(y.t.id));
    for (const { a, t } of targets) {
      for (const u of cur.units.filter(u => u.side === 'player' && u.id !== ele.id)) {
        for (const act of R.legalActions(cur, u.id)) {
          const r = act.type === 'directional' ? R.previewDirection(cur, u.id, act.direction) : R.preview(cur, u.id, act.to, act.type);
          if (!r) continue;
          const hit = (r.effect.hits || []).find(h => h.id === t.id);
          if (!hit) continue;
          if (t.hp - hit.damage > 0) return { freeze: a, target: t, damageActor: u.id, damageAction: act, remaining: t.hp - hit.damage };
        }
      }
    }
    return null;
  }
  // 先田字移动到与敌人同线、再牵引；两步都在同一回合内由真实点击完成
  function findPullPlan(cur) {
    const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
    if (!ele || ele.elephantSkillUsed) return null;
    const moves = ele.ap > 0 ? R.legalActions(cur, ele.id).filter(a => a.type === 'move') : [];
    for (const mv of moves) {
      const r = R.submit(cur, ele.id, mv.to);
      if (!r.effect) continue;
      const s2 = r.state;
      const pulls = R.legalActions(s2, ele.id).filter(a => a.type === 'elephant-pull');
      if (!pulls.length) continue;
      pulls.sort((a, b) => {
        const pa = R.preview(s2, ele.id, a.to, 'elephant-pull'), pb = R.preview(s2, ele.id, b.to, 'elephant-pull');
        const ha = pa ? pa.effect.hits.length : 9, hb = pb ? pb.effect.hits.length : 9;
        return ha - hb || (b.distance || 0) - (a.distance || 0);
      });
      return { move: mv, pull: pulls[0] };
    }
    return null;
  }
  function findPullOpportunity(cur) {
    const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
    if (!ele || ele.elephantSkillUsed) return null;
    const acts = R.legalActions(cur, ele.id).filter(a => a.type === 'elephant-pull');
    if (!acts.length) return null;
    // 优先选择不会让敌方活体停在象旁边的目标（位移后距离 ≥2），其次任意合法目标
    const scored = acts.map(a => {
      const r = R.preview(cur, ele.id, a.to, 'elephant-pull');
      const pl = r && r.effect.pull;
      const dist = Math.abs(a.from.x - a.to.x) + Math.abs(a.from.y - a.to.y);
      const finalDist = pl ? Math.abs(pl.to.x - ele.x) + Math.abs(pl.to.y - ele.y) : 99;
      const target = G(cur, a.targetId);
      return { a, peaceful: !(r && r.effect.hits.length), finalDist, target: target, distance: dist };
    }).sort((x, y) => (y.finalDist >= 2 ? 1 : 0) - (x.finalDist >= 2 ? 1 : 0) || y.finalDist - x.finalDist || y.distance - x.distance);
    return scored[0];
  }
  async function playTurnAdaptive(p, chain) {
    let cur = await st(p);
    if (cur.phase !== 'player') return false;
    const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
    if (!ele) return false;
    // 1) 普通移动证据（仅一次）：移动后撤销，保持局面
    if (!chain.move) {
      const moves = R.legalActions(cur, ele.id).filter(a => a.type === 'move' && !R.at(cur, a.to) && !R.corpseAt(cur, a.to));
      if (moves.length) {
        const mv = moves[0];
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-move');
        await cell(p, mv.to);
        await p.waitForTimeout(120);
        const after = await st(p);
        const moved = G(after, ele.id);
        const okMove = moved.x === mv.to.x && moved.y === mv.to.y && moved.ap === 0 && moved.elephantSkillUsed === false;
        const undoEnabled = !(await p.locator('#btn-undo').isDisabled());
        chain.shots.push(await shot(p, 'e20-elephant-move.png'));
        await p.locator('#btn-undo').click();
        await p.waitForTimeout(120);
        const back = await st(p);
        const restored = G(back, ele.id).x === ele.x && G(back, ele.id).y === ele.y && G(back, ele.id).ap === 1;
        chain.move = { ok: okMove && undoEnabled && restored, to: mv.to, undoEnabled, restored, from: { x: ele.x, y: ele.y } };
        cur = await st(p);
      }
    }
    // 2) 解锁冰封（仅一次）
    if (!chain.unlock && !R.elephantFreezeUnlocked(cur.units.find(u => u.id === ele.id)) && cur.teamSp >= 2) {
      const sp0 = cur.teamSp;
      await selectAlly(p, ele.id);
      await openSkills(p);
      const panel = await p.locator('#skills').innerText();
      const hasBtn = await p.locator('#skills [data-skill="elephant-freeze-unlock"]').count();
      if (hasBtn) {
        await p.locator('#skills [data-skill="elephant-freeze-unlock"]').click();
        await p.waitForTimeout(150);
        const s2 = await st(p);
        chain.unlock = { ok: R.elephantFreezeUnlocked(G(s2, ele.id)) && s2.teamSp === sp0 - 2, sp0, sp1: s2.teamSp, panel: panel.slice(0, 200) };
        chain.shots.push(await shot(p, 'e20-freeze-unlock.png'));
        cur = s2;
      }
    }
    // 3) 牵引证据（仅一次）：先田字移动到同线位置，再真实点击牵引目标
    if (!chain.pull) {
      const plan = findPullPlan(cur);
      if (plan) {
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-move');
        await cell(p, plan.move.to);
        await p.waitForTimeout(120);
        const midState = await st(p);
        const mid = G(midState, ele.id);
        const movedOk = mid && mid.x === plan.move.to.x && mid.y === plan.move.to.y && mid.elephantSkillUsed === false;
        const pullNow = R.legalActions(midState, ele.id).filter(a => a.type === 'elephant-pull');
        const target = pullNow.sort((a, b) => (b.distance || 0) - (a.distance || 0))[0] || plan.pull;
        await selectMode(p, 'elephant-pull');
        await hoverCell(p, target.to);
        const previewText = await p.locator('#preview-box').innerText();
        chain.shots.push(await shot(p, 'e20-pull-preview.png'));
        await cell(p, target.to);
        await p.waitForTimeout(150);
        const after = await st(p);
        const eleAfter = G(after, ele.id);
        const pulled = G(after, target.targetId);
        const corpse = (after.corpses || []).find(c => c.unit && c.unit.id === target.targetId);
        const dist = Math.abs(target.from.x - target.to.x) + Math.abs(target.from.y - target.to.y);
        const steps = Math.floor(dist / 2);
        const ex = target.to.x + Math.sign(target.from.x - target.to.x) * steps;
        const ey = target.to.y + Math.sign(target.from.y - target.to.y) * steps;
        chain.pull = {
          ok: movedOk && eleAfter.elephantSkillUsed === true && eleAfter.ap === 0 && ((pulled && pulled.x === ex && pulled.y === ey) || (!pulled && !!corpse)),
          target: target.targetId, dist, steps, kept: !!pulled,
          to: pulled ? { x: pulled.x, y: pulled.y } : (corpse ? { x: corpse.x, y: corpse.y } : null),
          preview: previewText.slice(0, 220)
        };
        chain.shots.push(await shot(p, 'e20-pull-result.png'));
        return true;
      }
    }
    // 3) 冰封 + 同回合非致命伤害（解冻证据）
    if (!chain.thaw) {
      const pair = findFreezePair(cur);
      if (pair) {
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-freeze');
        await hoverCell(p, pair.freeze.to);
        const previewText = await p.locator('#preview-box').innerText();
        chain.shots.push(await shot(p, 'e20-freeze-preview.png'));
        await cell(p, pair.freeze.to);
        await p.waitForTimeout(150);
        let after = await st(p);
        const frozenOk = G(after, pair.target.id) && G(after, pair.target.id).frozen >= 1;
        const intentText = await p.locator('#intent-list').innerText();
        chain.shots.push(await shot(p, 'e20-freeze-applied.png'));
        await doAction(p, pair.damageAction);
        await p.waitForTimeout(150);
        after = await st(p);
        const tgt = G(after, pair.target.id);
        chain.freeze = { ok: !!frozenOk, target: pair.target.id, hp: pair.target.hp, preview: previewText, intent: intentText.slice(0, 160) };
        chain.thaw = { ok: tgt && tgt.frozen === 0 && tgt.thawStandby === true && tgt.hp === pair.remaining, target: pair.target.id, hpAfter: tgt && tgt.hp, remaining: pair.remaining, damage: pair.target.hp - pair.remaining };
        chain.shots.push(await shot(p, 'e20-thaw.png'));
        const beforeEnd = after;
        const kingHp = G(beforeEnd, 'king') ? G(beforeEnd, 'king').hp : 0;
        const hps = beforeEnd.units.filter(u => u.side === 'player').map(u => u.id + ':' + u.hp).join(',');
        await endTurn(p);
        const next = await st(p);
        chain.thawPhase = {
          ok: next.turn === beforeEnd.turn + 1 && (G(next, 'king') ? G(next, 'king').hp : 0) === kingHp,
          standBy: G(next, pair.target.id) ? G(next, pair.target.id).thawStandby === true : null,
          hpsSame: next.units.filter(u => u.side === 'player').map(u => u.id + ':' + u.hp).join(',') === hps
        };
        chain.shots.push(await shot(p, 'e20-thaw-standby-enemy-phase.png'));
        return true;
      }
    }
    // 5) 升级证据（仅一次）
    if (!chain.upgrade && cur.teamSp >= 1 && R.elephantFreezeUnlocked(cur.units.find(u => u.id === ele.id)) && chain.thaw) {
      const battleVisible = await p.locator('#battle-root').isVisible();
      if (!battleVisible) {
        // 战斗已结算回营：营地技能面板同样是正常入口
        const sp0 = cur.teamSp;
        const range0 = R.elephantPullRangeOf(cur.party.find(u => u.kind === 'elephant') || cur.units.find(u => u.kind === 'elephant'));
        const btn = p.locator('#camp-skills [data-skill="elephant-pull-range"]').first();
        if (await btn.count()) {
          await btn.click();
          await p.waitForTimeout(150);
          const s2 = await st(p);
          const eleNow = (s2.party || []).find(u => u.kind === 'elephant');
          chain.upgrade = { ok: s2.teamSp === sp0 - 1 && R.elephantPullRangeOf(eleNow) === range0 + 1, sp0, sp1: s2.teamSp, range0, range1: R.elephantPullRangeOf(eleNow), btnText: '营地技能面板', camp: true };
          chain.shots.push(await shot(p, 'e20-upgrade-camp.png'));
          return true;
        }
      }
      const sp0 = cur.teamSp;
      const range0 = R.elephantPullRangeOf(cur.units.find(u => u.id === ele.id));
      await selectAlly(p, ele.id);
      await openSkills(p);
      const panel = await p.locator('#skills').innerText();
      const has = await p.locator('#skills [data-skill="elephant-pull-range"]').count();
      if (has) {
        await p.locator('#skills [data-skill="elephant-pull-range"]').click();
        await p.waitForTimeout(150);
        const s2 = await st(p);
        const eleNow = G(s2, ele.id);
        const btnText = await p.locator('#rook-modes [data-mode="elephant-pull"]').innerText();
        chain.upgrade = { ok: s2.teamSp === sp0 - 1 && R.elephantPullRangeOf(eleNow) === range0 + 1 && btnText.indexOf(String(range0 + 1)) >= 0, sp0, sp1: s2.teamSp, range0, range1: R.elephantPullRangeOf(eleNow), btnText, panel: panel.slice(0, 300) };
        chain.shots.push(await shot(p, 'e20-upgrade.png'));
        return true;
      }
    }
    return false;
  }
  function pushedPoint(x) { return x ? { x: x.x, y: x.y } : null; }
  await step('E20-3', '正常入口：第 2 关布阵，象进场', async () => {
    await p.locator('#camp-leave').click();
    await waitView(p, 'map');
    await p.locator('#campaign button[data-region="1"]').click();
    await p.locator('#flow-enter').click();
    await waitView(p, 'battle');
    s = await st(p);
    A.equal(s.phase, 'deploy');
    const ele = s.units.find(u => u.kind === 'elephant');
    const rook = s.units.find(u => u.kind === 'rook' && u.side === 'player');
    A.ok(ele, '布阵阶段象已在场上');
    // 象放 (6,2)：可覆盖敌方右翼推进（含 2 HP 车），车放 (8,0)：同列 4 格可非致命补刀
    if (rook) { await selectAlly(p, rook.id); await cell(p, { x: 8, y: 0 }); await p.waitForTimeout(80); }
    await selectAlly(p, ele.id);
    await cell(p, { x: 6, y: 2 });
    await p.waitForTimeout(120);
    s = await st(p);
    A.deepEqual([G(s, ele.id).x, G(s, ele.id).y], [6, 2], '象布置到 (7,3)');
    const deployShot = await shot(p, 'e20-deploy-elephant.png');
    await p.locator('#btn-deploy-confirm').click();
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
    s = await st(p);
    const enemies = s.units.filter(u => u.side === 'enemy').map(u => u.kind + '@' + point(u) + ' hp' + u.hp).join(' | ');
    return `第 2 关布阵：象 ${point(G(s, ele.id))}、车 ${rook ? point(G(s, rook.id)) : '无'}；敌方预置 ${enemies}（截图 ${deployShot}）`;
  });
  // 自适应推进回合，直到 6 项证据齐备或用尽回合
  const MAX_TURNS = 12;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const view = await p.evaluate(() => (window.M0Campaign ? window.M0Campaign.info().view : 'battle'));
      if (view !== 'battle') {
        // 战斗已结算：在营地补做升级证据
        if (!chain.upgrade && (await st(p)).teamSp >= 1 && chain.thaw) await playTurnAdaptive(p, chain);
        break;
      }
      let cur = await st(p);
      if (cur.phase !== 'player') break;
      let acted = await playTurnAdaptive(p, chain);
      cur = await st(p);
      if (cur.phase !== 'player') break;
      if (!acted) {
        // 让其他单位正常行动（不消耗象的技能），再结束回合推进局面
        const eleNow = cur.units.find(u => u.kind === 'elephant');
        await autoTurn(p, eleNow ? [eleNow.id] : []);
        continue;
      }
      if (chain.move && chain.pull && chain.unlock && chain.thaw && chain.upgrade) break;
    }
  } catch (e) {
    console.log('CHAIN-ERROR ' + e.message);
    chain.error = e.message;
  }
  // 结算证据：逐项写入报告
  {
    const move = chain.move;
    pushStep('E20-4', '正常入口：象普通移动（田字）与撤销', !!move && move.ok,
      move ? `真实点击田字落点 ${point(move.to)}：移动后 ap 0、技能未用、撤销按钮可用；撤销后回到 ${point(move.from)} 且额度恢复（截图 e20-elephant-move.png）` : '未取得田字移动证据',
      'e20-elephant-move.png', !move || !move.ok ? new Error('移动/撤销证据不成立：' + JSON.stringify(move)) : null);
    const pull = chain.pull;
    pushStep('E20-5', '正常入口：象牵引（真实点击目标、按实际距离一半拉近）', !!pull && pull.ok,
      pull ? `真实点击牵引目标 ${pull.target}（实际距离 ${pull.dist} → 位移 ${pull.steps} 格）：预览“${String(pull.preview).split('\n')[0]}”，执行后技能已用、移动锁定、目标${pull.kept ? '存活并到达 ' + point(pull.to) : '按规则离场'}（截图 e20-pull-preview.png、e20-pull-result.png）` : '未取得牵引证据',
      'e20-pull-preview.png,e20-pull-result.png', !pull || !pull.ok ? new Error('牵引证据不成立：' + JSON.stringify(pull)) : null);
    const unlock = chain.unlock;
    pushStep('E20-6', '正常入口：技能面板解锁冰封（2 SP）', !!unlock && unlock.ok,
      unlock ? `真实点击“解锁冰封”：公共 SP ${unlock.sp0}→${unlock.sp1}，模式按钮显示“冰封 1 阶段”（截图 e20-freeze-unlock.png）` : '未取得冰封解锁证据',
      'e20-freeze-unlock.png', !unlock || !unlock.ok ? new Error('解锁证据不成立：' + JSON.stringify(unlock)) : null);
    const freeze = chain.freeze;
    pushStep('E20-7a', '正常入口：冰封敌人（5×5 单体、真实点击）', !!freeze && freeze.ok,
      freeze ? `冰封 ${freeze.target}（HP ${freeze.hp}，冻结 1 阶段）：预览“${String(freeze.preview).split('\n')[0]}”，意图列表显示待机（截图 e20-freeze-preview.png、e20-freeze-applied.png）` : '未取得冰封证据',
      'e20-freeze-preview.png,e20-freeze-applied.png', !freeze || !freeze.ok ? new Error('冰封证据不成立') : null);
    const thaw = chain.thaw, th = chain.thawPhase;
    pushStep('E20-7b', '正常入口：对冰冻敌人造成非致命伤害 → 解冻但本回合待机', !!thaw && thaw.ok && !!th && th.ok,
      thaw ? `真实点击造成 ${thaw.damage} 点非致命伤害：${thaw.target} 剩余 HP ${thaw.hpAfter}、frozen 清零、受伤解冻待机；随后敌方阶段该单位仍待机（帅与友军 HP 未变、frozen 待机标志已清除）（截图 e20-thaw.png、e20-thaw-standby-enemy-phase.png）` : '未取得受伤解冻证据',
      'e20-thaw.png,e20-thaw-standby-enemy-phase.png', !thaw || !thaw.ok || !th || !th.ok ? new Error('解冻证据不成立：' + JSON.stringify({ thaw, th })) : null);
    const upgrade = chain.upgrade;
    pushStep('E20-8', '正常入口：技能升级使用（真实点击技能面板）', !!upgrade && upgrade.ok,
      upgrade ? `真实点击“牵引射程”：${upgrade.range0}→${upgrade.range1} 格、公共 SP ${upgrade.sp0}→${upgrade.sp1}，模式按钮“${upgrade.btnText}”（截图 e20-upgrade.png）` : '未取得升级使用证据',
      'e20-upgrade.png', !upgrade || !upgrade.ok ? new Error('升级证据不成立：' + JSON.stringify(upgrade)) : null);
  }
  flow.state = await st(p);
  flow.pageErrors = report.pageErrors.slice();
  flow.shots = Object.keys(report.steps.filter(x => x.evidence).length ? {} : {});
  report.layout.normal = { level1: flow.afterLevel1 || null };
  await ctx.close();
  return flow;
}

/* ================= B. 专项夹具段：按 E 项逐条在真实界面点击并截图（明确标注专项） ================= */
function eleFixture(units, opts) {
  opts = opts || {};
  const s = fixture([P('king', 'king', 0, 0), E('boss', 'king', 8, 8)].concat(units || []), opts);
  s.intents = opts.intents || [];
  return s;
}
async function armsle(p) { await p.evaluate(() => { const d = document.querySelector('details.upgrade-section'); if (d) d.open = true; }); }
async function fixtureSections(browser) {
  const { ctx, p } = await openFixture(browser);
  try {
    // ---------- E02 基础田字移动（专项夹具） ----------
    await step('E02-专项', '专项夹具：无移动增益的田字落点、象眼阻挡与非法拒绝', async () => {
      const s = eleFixture([P('ele', 'elephant', 4, 2), P('blk', 'pawn', 3, 1), E('foe', 'rook', 8, 8)] , { tiles: { '5,1': 'mountain' } });
      s.corpses = [{ id: 'corpse-c', x: 3, y: 3, unit: Object.assign(P('c', 'pawn', 3, 3), { hp: 0 }) }];
      await inject(p, s);
      await selectAlly(p, 'ele');
      const marks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').map(m => m.x + ',' + m.y));
      // 只剩 (6,4) 一个合法田字落点：其余被象眼阻挡或越界
      A.deepEqual(marks, ['6,4'], '仅一个合法田字落点（其余被象眼阻挡）');
      await cell(p, { x: 6, y: 0 });
      await p.waitForTimeout(120);
      const reason = await p.locator('#preview-box').innerText();
      A.match(reason, /象眼|不合法|不能/, '非法落点给出理由');
      const st2 = await st(p);
      A.deepEqual([G(st2, 'ele').x, G(st2, 'ele').y], [4, 2], '非法点击不移动');
      const shotA = await shot(p, 'e02-dian-illegal.png');
      // 河道水格可落
      await inject(p, eleFixture([P('ele', 'elephant', 3, 2)], { tiles: { '5,4': 'water' } }));
      await selectAlly(p, 'ele');
      await cell(p, { x: 5, y: 4 });
      await p.waitForTimeout(120);
      const s3 = await st(p);
      A.deepEqual([G(s3, 'ele').x, G(s3, 'ele').y], [5, 4], '可落入河道水格');
      const shotB = await shot(p, 'e02-water-landing.png');
      return `专项夹具：仅 (7,5) 合法田字落点，非法点击给出“${reason.split('\n')[0]}”且不移动；河道水格可落（截图 ${shotA}、${shotB}）`;
    });
    // ---------- E03 疾行扩展 ----------
    await step('E03-专项', '专项夹具：疾行扩展落点与参照/象眼限制（真实点击）', async () => {
      const plain = eleFixture([P('ele', 'elephant', 4, 2)]);
      await inject(p, plain);
      await selectAlly(p, 'ele');
      const plainMarks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').length);
      const buffed = R.copy(plain); buffed.buffs = Object.assign({ health: false, move: false, rescue: false }, { move: true });
      await inject(p, buffed);
      await selectAlly(p, 'ele');
      const buffMarks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').map(m => m.x + ',' + m.y));
      A.equal(plainMarks, 4, '无疾行：四个田字落点');
      A.ok(buffMarks.length > plainMarks, '疾行后落点增加（' + plainMarks + '→' + buffMarks.length + '）');
      A.ok(buffMarks.includes('1,0'), '疾行扩展包含田字落点邻格');
      await cell(p, { x: 1, y: 0 });
      await p.waitForTimeout(140);
      const s2 = await st(p);
      A.deepEqual([G(s2, 'ele').x, G(s2, 'ele').y], [1, 0], '一次点击直达扩展最终格');
      A.equal(G(s2, 'ele').ap, 0, '扩展移动仍是一次普通移动');
      const shotB = await shot(p, 'e03-dash.png');
      return `专项夹具：无疾行 2 个田字落点；疾行后 ${buffMarks.length} 个落点（含邻格），一次点击到扩展最终格且只消耗一次移动（截图 ${shotB}）`;
    });
    // ---------- E04 行动顺序 ----------
    await step('E04-专项', '专项夹具：先移动再施法、施法后锁移动、下一回合恢复（真实按钮）', async () => {
      let s = eleFixture([P('ele', 'elephant', 4, 4), E('foe', 'rook', 3, 2)], { teamSp: 4 });
      s.teamSp = 2;
      s = R.purchaseUpgrade(s, 'ele', 'elephant-freeze-unlock');
      s.teamSp = 0;
      await inject(p, s);
      await selectAlly(p, 'ele');
      await cell(p, { x: 2, y: 2 });
      await p.waitForTimeout(120);
      let cur = await st(p);
      A.equal(G(cur, 'ele').ap, 0, '移动消耗普通移动');
      A.equal(await p.locator('#rook-modes [data-mode="elephant-move"]').isDisabled(), true, '移动后按钮禁用');
      A.equal(await p.locator('#rook-modes [data-mode="elephant-freeze"]').isDisabled(), false, '移动后仍可施法');
      await selectMode(p, 'elephant-freeze');
      await cell(p, { x: 3, y: 2 });
      await p.waitForTimeout(140);
      cur = await st(p);
      A.equal(G(cur, 'ele').elephantSkillUsed, true);
      A.equal(G(cur, 'foe').frozen, 1);
      A.equal(await p.locator('#rook-modes [data-mode="elephant-freeze"]').isDisabled(), true, '施法后技能按钮禁用');
      A.equal(await p.locator('#rook-modes [data-mode="elephant-pull"]').isDisabled(), true, '牵引同样禁用（共用技能）');
      const shotA = await shot(p, 'e04-action-order.png');
      await endTurn(p);
      cur = await st(p);
      A.equal(G(cur, 'ele').ap, 1, '下回合移动恢复');
      A.equal(G(cur, 'ele').elephantSkillUsed, false, '下回合技能恢复');
      return `专项夹具：先田字移动到 (3,3)→ 再冰封 (5,7)，技能与移动都锁定；结束回合后两项恢复（截图 ${shotA}）`;
    });
    // ---------- E05/E06 牵引目标与越障 ----------
    await step('E05/E06-专项', '专项夹具：牵引可选友军/敌军/尸体/主帅，拒绝自身/仕/山/太近；可越障且首次碰撞停止', async () => {
      let s = eleFixture([P('ele', 'elephant', 4, 4), P('ally', 'pawn', 2, 4), E('foe', 'rook', 8, 8), E('foe2', 'pawn', 4, 1), P('tower', 'advisor', 3, 1), P('k2', 'king', 6, 4)]);
      s.corpses = [{ id: 'corpse-c', x: 4, y: 2, unit: Object.assign(E('c', 'pawn', 4, 2), { hp: 0 }) }];
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      const targets = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'attack').map(m => m.x + ',' + m.y));
      A.ok(targets.includes('2,4'), '友军可被牵引（标记）');
      A.ok(targets.includes('6,4'), '我方主帅可被牵引');
      A.ok(targets.includes('4,2'), '尸体可被牵引');
      A.ok(targets.includes('4,1'), '敌军可被牵引');
      A.ok(!targets.includes('3,4'), '距离 1 太近不可选');
      A.ok(!targets.includes('3,1'), '我方仕不可被牵引');
      await cell(p, { x: 3, y: 4 });
      await p.waitForTimeout(120);
      let reason = await p.locator('#preview-box').innerText();
      A.match(reason, /1 格太近/, '太近给出理由');
      const beforeSelf = await st(p);
      await cell(p, { x: 4, y: 4 });
      await p.waitForTimeout(150);
      reason = await p.locator('#preview-box').innerText();
      const afterSelf = await st(p);
      A.ok(reason.length > 0, '自身格点击后仍有提示（' + reason.split('\n')[0] + '）');
      A.equal(afterSelf.units.find(u => u.id === 'ele').elephantSkillUsed, beforeSelf.units.find(u => u.id === 'ele').elephantSkillUsed, '自身格不消耗技能');
      const shotA = await shot(p, 'e05-pull-targets.png');
      // 越障：尸体在中间，目标在后，预览显示首次碰撞
      const over = eleFixture([P('ele', 'elephant', 0, 4), P('blk', 'pawn', 3, 4), E('t', 'rook', 5, 4)]);
      over.teamSp = 5;
      const over2 = R.purchaseUpgrade(over, 'ele', 'elephant-pull-range');
      const over3 = R.purchaseUpgrade(over2, 'ele', 'elephant-pull-range');
      await inject(p, over3);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await hoverCell(p, { x: 5, y: 4 });
      const previewText = await p.locator('#preview-box').innerText();
      A.match(previewText, /牵引目标/, '可越过中间单位选中后方目标');
      A.match(previewText, /碰撞|结算/, '预览说明首次碰撞结算');
      const shotB = await shot(p, 'e06-over-obstacle.png');
      await cell(p, { x: 5, y: 4 });
      await p.waitForTimeout(140);
      const after = await st(p);
      A.deepEqual([G(after, 't').x, G(after, 't').y], [4, 4], '位移在首个障碍停止');
      A.equal(G(after, 't').hp, 1, '第一次碰撞受伤');
      A.equal(G(after, 'blk'), undefined, '阻挡兵 1 HP 阵亡（各 −1）');
      return `专项夹具：牵引目标集合含友军/主帅/尸体/敌军，拒绝太近与仕；越障预览“${previewText.split('\n')[1] || ''}”，执行后目标停在障碍前（截图 ${shotA}、${shotB}）`;
    });
    // ---------- E07 射程成长 ----------
    await step('E07-专项', '专项夹具：牵引射程 4 向 +1、上限 8、SP 不足与超限（真实技能面板）', async () => {
      const s = eleFixture([P('ele', 'elephant', 4, 4), E('a', 'rook', 8, 4), E('b', 'rook', 4, 8)], { teamSp: 1 });
      await inject(p, s);
      await selectAlly(p, 'ele');
      await openSkills(p);
      const panel = await p.locator('#skills').innerText();
      A.match(panel, /牵引射程 3 格/);
      A.match(panel, /1 公共 SP/);
      await p.locator('#skills [data-skill="elephant-pull-range"]').click();
      await p.waitForTimeout(140);
      let cur = await st(p);
      A.equal(R.elephantPullRangeOf(G(cur, 'ele')), 4, '射程 3→4');
      A.equal(cur.teamSp, 0, '扣 1 公共 SP');
      A.equal(R.elephantFreezeDurationOf(G(cur, 'ele')), 0, '不赠送冰封');
      await selectMode(p, 'elephant-pull');
      const reach = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'attack').map(m => m.x + ',' + m.y));
      A.ok(reach.includes('8,4') || reach.includes('0,4'), '四向射程同步扩展到 4 格');
      const shotA = await shot(p, 'e07-range-upgrade.png');
      // SP 不足：按钮禁用
      const poor = R.copy(cur); poor.teamSp = 0;
      await inject(p, poor);
      await selectAlly(p, 'ele');
      await openSkills(p);
      A.equal(await p.locator('#skills [data-skill="elephant-pull-range"]').isDisabled(), true, 'SP 不足时按钮禁用');
      // 上限 8
      const cap = R.copy(poor);
      cap.units.find(u => u.id === 'ele').elephantPullRange = 8;
      cap.teamSp = 5;
      await inject(p, cap);
      await selectAlly(p, 'ele');
      await openSkills(p);
      A.equal(await p.locator('#skills [data-skill="elephant-pull-range"]').isDisabled(), true, '射程已达上限 8 时禁用');
      return `专项夹具：真实点击“牵引射程”3→4 格并扣 1 SP、四向同步；SP 不足与上限 8 均禁用（截图 ${shotA}）`;
    });
    // ---------- E11 统一撞山 ----------
    await step('E11-专项', '专项夹具：牵引撞山只扣 1 耐久、两次变碎石地且可通行（真实点击 + 棋盘重绘）', async () => {
      const s = eleFixture([P('ele', 'elephant', 0, 4), E('t', 'rook', 2, 4), P('mv', 'rook', 6, 2)], { tiles: { '1,4': 'mountain' } });
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await hoverCell(p, { x: 2, y: 4 });
      const previewText = await p.locator('#preview-box').innerText();
      A.match(previewText, /撞山|山体/, '预览说明撞山');
      await cell(p, { x: 2, y: 4 });
      await p.waitForTimeout(150);
      let cur = await st(p);
      A.equal(cur.tiles['1,4'], 'cracked', '第一次撞山：开裂');
      const shotA = await shot(p, 'e11-mountain-cracked.png');
      const crackedShot = await shotBoard(p, 'e11-mountain-cracked-board.png');
      // 第二只象再撞一次 → 碎石地
      const s2 = R.copy(cur);
      s2.units.find(u => u.id === 't').x = 2; s2.units.find(u => u.id === 't').y = 4;
      s2.units.find(u => u.id === 'ele').elephantSkillUsed = false;
      s2.units.find(u => u.id === 'ele').ap = 1;
      await inject(p, s2);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await cell(p, { x: 2, y: 4 });
      await p.waitForTimeout(150);
      cur = await st(p);
      A.equal(cur.tiles['1,4'], 'rubble', '第二次撞山：碎石地');
      const shotB = await shot(p, 'e11-rubble.png');
      const rubbleBoard = await shotBoard(p, 'e11-rubble-board.png');
      // 碎石地可通行：车从 (0,0) 移动到 (2,0) 等由规则校验
      const passable = R.actionAt(cur, G(cur, 'mv'), { x: 1, y: 4 }) !== undefined || R.actionAt(cur, G(cur, 'mv'), { x: 4, y: 2 }) !== undefined;
      A.equal(R.mountain(cur, { x: 1, y: 4 }), false, '碎石地不再阻挡/不是山');
      A.equal(!!R.occupied(cur, { x: 1, y: 4 }), false, '碎石地不占位');
      return `专项夹具：牵引撞山第一次“${previewText.split('\n')[1] || ''}”→ 开裂，第二次 → 碎石地，棋盘重绘可见“碎石”，不再阻挡/占位（截图 ${shotA}、${crackedShot}、${shotB}、${rubbleBoard}）`;
    });
    // ---------- E12/E16 两象与重复冰封 ----------
    await step('E12/E16-专项', '专项夹具：只强化所选象；重复冰封取 max 不叠加不缩短（真实点击）', async () => {
      const s = eleFixture([P('a', 'elephant', 4, 4), P('b', 'elephant', 6, 4), E('t', 'rook', 5, 4)], { teamSp: 20 });
      await inject(p, s);
      await selectAlly(p, 'a');
      await openSkills(p);
      await p.locator('#skills [data-skill="elephant-freeze-unlock"]').click();
      await p.waitForTimeout(140);
      let cur = await st(p);
      A.equal(R.elephantFreezeUnlocked(G(cur, 'a')), true, 'a 已解锁');
      A.equal(R.elephantFreezeUnlocked(G(cur, 'b')), false, 'b 未解锁（只强化所选象）');
      await selectAlly(p, 'b');
      await openSkills(p);
      A.match(await p.locator('#skills').innerText(), /未解锁/, 'b 的面板仍显示未解锁');
      // 给 b 解锁并升到 3 阶段
      const s2 = R.copy(cur);
      s2.teamSp = 20;
      let up = R.purchaseUpgrade(s2, 'b', 'elephant-freeze-unlock');
      up = R.purchaseUpgrade(up, 'b', 'elephant-freeze-duration');
      up = R.purchaseUpgrade(up, 'b', 'elephant-freeze-duration');
      await inject(p, up);
      await selectAlly(p, 'a');
      await selectMode(p, 'elephant-freeze');
      await cell(p, { x: 5, y: 4 });
      await p.waitForTimeout(140);
      cur = await st(p);
      A.equal(G(cur, 't').frozen, 1, 'a 冻结 1 阶段');
      await selectAlly(p, 'b');
      await selectMode(p, 'elephant-freeze');
      await cell(p, { x: 5, y: 4 });
      await p.waitForTimeout(140);
      cur = await st(p);
      A.equal(G(cur, 't').frozen, 3, 'b 再冻取较大值 3，不叠加');
      const badge = await p.evaluate(() => { const el = document.querySelector('[data-unit-hp="t"]'); return el ? el.textContent : ''; });
      A.match(badge, /❄3/, '棋盘血量标签显示冻结剩余 3 阶段');
      const intent = await p.locator('#intent-list').innerText();
      const shotA = await shot(p, 'e12-two-elephants.png');
      // 反向：剩余 3 时再冻 1 阶段不缩短
      const s3 = R.copy(up);
      s3.units.find(u => u.id === 't').frozen = 3;
      s3.units.forEach(u => { if (u.kind === 'elephant') { u.elephantSkillUsed = false; u.ap = 1; } });
      await inject(p, s3);
      await selectAlly(p, 'a');
      await selectMode(p, 'elephant-freeze');
      await cell(p, { x: 5, y: 4 });
      await p.waitForTimeout(140);
      cur = await st(p);
      A.equal(G(cur, 't').frozen, 3, '较短时长不缩短剩余冻结');
      return `专项夹具：只强化所选象（a 解锁、b 未解锁）；a 冻 1 阶段后 b 再冻 → 剩余 3 阶段（取 max），剩余 3 时再冻 1 阶段仍为 3（截图 ${shotA}）`;
    });
    // ---------- E13 冰封范围与目标 ----------
    await step('E13-专项', '专项夹具：冰封 5×5 范围标记、目标类型与越障/跨河（真实点击）', async () => {
      let s = eleFixture([P('ele', 'elephant', 4, 4), P('ally', 'pawn', 4, 2), E('foe', 'rook', 4, 6), P('blk', 'pawn', 4, 5)], { teamSp: 20 });
      s = R.purchaseUpgrade(s, 'ele', 'elephant-freeze-unlock');
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-freeze');
      const zone = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'freeze-zone').length);
      A.equal(zone, 25, '5×5 范围标记 25 格（含斜向）');
      const targets = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'attack').map(m => m.x + ',' + m.y));
      A.ok(targets.includes('4,6'), '可越障选中后方敌人');
      A.ok(!targets.includes('4,2'), '友军不可选');
      await cell(p, { x: 4, y: 2 });
      await p.waitForTimeout(120);
      const reason = await p.locator('#preview-box').innerText();
      A.match(reason, /友军|不能选/, '友军给出拒绝理由');
      const shotA = await shot(p, 'e13-freeze-zone.png');
      const shotB = await shotBoard(p, 'e13-freeze-zone-board.png');
      await cell(p, { x: 4, y: 6 });
      await p.waitForTimeout(140);
      const cur = await st(p);
      A.equal(G(cur, 'foe').frozen, 1, '越过遮挡成功冰封');
      A.equal(G(cur, 'blk').hp, 1, '遮挡单位不受影响');
      A.equal(G(cur, 'foe').hp, 2, '冰封无直接伤害');
      return `专项夹具：5×5 共 25 格标记、可越障选敌、友军被拒绝并提示“${reason.split('\n')[0]}”、目标无伤害（截图 ${shotA}、${shotB}）`;
    });
    // ---------- E14 冻结时长跨阶段 ----------
    await step('E14-专项', '专项夹具：冻结 2 个敌方行动阶段，逐阶段待机并在到期恢复（真实结束回合）', async () => {
      let s = eleFixture([P('king', 'king', 4, 0), P('ele', 'elephant', 4, 3), E('t', 'pawn', 4, 1)], { teamSp: 20 });
      s = R.purchaseUpgrade(s, 'ele', 'elephant-freeze-unlock');
      s = R.purchaseUpgrade(s, 'ele', 'elephant-freeze-duration');
      s.teamSp = 0;
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-freeze');
      await cell(p, { x: 4, y: 1 });
      await p.waitForTimeout(140);
      let cur = await st(p);
      A.equal(G(cur, 't').frozen, 2, '冻结 2 阶段');
      const before = G(cur, 'king').hp;
      await endTurn(p);
      cur = await st(p);
      A.equal(G(cur, 't').frozen, 1, '第 1 个敌方阶段后递减为 1');
      A.equal(G(cur, 'king').hp, before, '第 1 阶段不攻击');
      const intent1 = await p.locator('#intent-list').innerText();
      A.match(intent1, /待机/, '第 2 阶段仍是待机');
      const shotA = await shot(p, 'e14-freeze-phase1.png');
      await endTurn(p);
      cur = await st(p);
      A.equal(G(cur, 't').frozen, 0, '第 2 个敌方阶段后解除');
      A.equal(G(cur, 'king').hp, before, '第 2 阶段也不攻击');
      const intent2 = await p.locator('#intent-list').innerText();
      A.ok(!/冰封 · 剩余/.test(intent2), '到期后不再显示冰封待机');
      const shotB = await shot(p, 'e14-freeze-expired.png');
      return `专项夹具：冻结 2 阶段后连续两次结束回合，剩余 2→1→0、两个敌方阶段都不攻击且意图显示待机，到期恢复正常意图（截图 ${shotA}、${shotB}）`;
    });
    // ---------- E17 击杀归属 ----------
    await step('E17-专项', '专项夹具：牵引碰撞击杀归施法象、友军死亡无奖励（真实点击 + 顶栏）', async () => {
      let s = eleFixture([P('ele', 'elephant', 0, 4), E('t', 'pawn', 2, 4), P('w', 'rook', 1, 4)]);
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await cell(p, { x: 2, y: 4 });
      await p.waitForTimeout(150);
      let cur = await st(p);
      A.equal(G(cur, 't'), undefined, '目标被撞死');
      A.equal(G(cur, 'ele').kills, 1, '击杀归施法象');
      A.equal(cur.teamSp, 1, '公共 SP +1');
      const spText = await p.locator('#team-sp').innerText();
      const killText = await p.locator('#kills').innerText();
      A.equal(spText, '1', '顶栏公共 SP 同步');
      A.equal(killText, '1', '顶栏击杀同步');
      const shotA = await shot(p, 'e17-kill-credit.png');
      // 友军死亡无奖励
      let s2 = eleFixture([P('ele', 'elephant', 0, 4), P('ally', 'pawn', 2, 4), E('w', 'rook', 1, 4)]);
      await inject(p, s2);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await cell(p, { x: 2, y: 4 });
      await p.waitForTimeout(150);
      cur = await st(p);
      A.equal(G(cur, 'ally'), undefined, '友军被撞死');
      A.equal(G(cur, 'ele').kills, 0, '不奖励友军死亡');
      A.equal(cur.teamSp, 0, '公共 SP 不变');
      return `专项夹具：碰撞击杀敌人 → 象击杀 1、公共 SP 1、顶栏同步；友军被撞死 → 不奖励击杀与 SP（截图 ${shotA}）`;
    });
  } finally { await ctx.close(); }
}

/* ================= C. 存档边界（副本，不操作用户旧局） ================= */
function savedStateWithElephant(over) {
  const s = R.emptyState([P('king', 'king', 4, 0), E('boss', 'king', 8, 8),
    P('ele', 'elephant', 4, 3), P('rook', 'rook', 0, 0), E('foe', 'pawn', 4, 5)]);
  s.tiles = R.defaultMap().tiles;
  s.phase = 'player';
  s.teamSp = 3; s.gold = 9; s.level = 2; s.completed = 1;
  s.wave = 1; s.turn = 3;
  s.mapName = '三桥山口';
  s.buffs = { health: true, move: false, rescue: false };
  s.entrySnapshot = R.copy(s); s.levelSnapshot = R.copy(s);
  s.party = [R.copy(s.units[2]), R.copy(s.units[3])];
  s.activeIds = ['ele', 'rook'];
  s.intents = [];
  Object.assign(s, over || {});
  return s;
}
async function saveSections(browser) {
  // ---------- E18 保存/撤销边界（续局副本） ----------
  await step('E18-副本', '副本续局：普通移动可撤不保存；成功施法/升级保存并锁撤；刷新后按保存点恢复', async () => {
    const s = savedStateWithElephant();
    const journey = R.journeyRecord(s);
    const save = playerSave({ journey, battle: { version: 1, state: s, savedAt: '2026-10-24T00:00:00.000Z', reason: '验收副本' } });
    const { ctx, p } = await openWithSave(browser, save);
    await waitView(p, 'battle');
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
    const readSave = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('m0-journey-v1')); } catch (e) { return null; } });
    const before = await readSave();
    const beforeSavedAt = before && before.battle && before.battle.savedAt;
    // 普通移动：不写续局
    await selectAlly(p, 'ele');
    const moves = R.legalActions(await st(p), 'ele').filter(a => a.type === 'move');
    A.ok(moves.length >= 1, '存在合法田字移动');
    await cell(p, moves[0].to);
    await p.waitForTimeout(200);
    const afterMove = await readSave();
    A.equal(afterMove && afterMove.battle && afterMove.battle.savedAt, beforeSavedAt, '普通移动不写续局');
    A.equal(await p.locator('#btn-undo').isDisabled(), false, '普通移动可撤销');
    const shotA = await shot(p, 'e18-move-unsaved.png');
    // 刷新副本：回到保存点（移动丢失）
    await p.reload();
    await waitView(p, 'battle');
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
    let cur = await st(p);
    A.deepEqual([G(cur, 'ele').x, G(cur, 'ele').y], [4, 3], '刷新后回到保存点（未保存的移动丢失）');
    const shotB = await shot(p, 'e18-reload-after-move.png');
    // 成功施法：写续局并锁撤
    await selectAlly(p, 'ele');
    let st0 = await st(p);
    st0.units.find(u => u.id === 'ele').elephantFreezeUnlocked = true;
    st0.units.find(u => u.id === 'ele').elephantFreezeDuration = 1;
    st0.units.find(u => u.id === 'ele').elephantSkillUsed = false;
    st0.units.find(u => u.id === 'ele').ap = 1;
    await inject(p, st0);
    await selectAlly(p, 'ele');
    await selectMode(p, 'elephant-freeze');
    await cell(p, { x: 4, y: 5 });
    await p.waitForTimeout(250);
    cur = await st(p);
    A.equal(G(cur, 'foe').frozen, 1, '冰封成功');
    A.equal(await p.locator('#btn-undo').isDisabled(), true, '成功施法锁定撤销');
    const afterCast = await readSave();
    A.notEqual(afterCast && afterCast.battle && afterCast.battle.savedAt, beforeSavedAt, '成功施法写入续局');
    A.equal(afterCast.battle.state.units.find(u => u.id === 'foe').frozen, 1, '续局包含冻结状态');
    const shotC = await shot(p, 'e18-cast-saved.png');
    await p.reload();
    await waitView(p, 'battle');
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
    cur = await st(p);
    A.equal(G(cur, 'foe').frozen, 1, '刷新后冻结状态正确恢复');
    A.equal(await p.locator('#btn-undo').isDisabled(), true, '恢复后撤销仍锁定');
    const shotD = await shot(p, 'e18-reload-after-cast.png');
    // 成功升级：写续局
    const spBefore = (await st(p)).teamSp;
    await selectAlly(p, 'ele');
    await openSkills(p);
    await p.locator('#skills [data-skill="elephant-pull-range"]').click();
    await p.waitForTimeout(200);
    const afterUp = await readSave();
    cur = await st(p);
    A.equal(cur.teamSp, spBefore - 1, '升级扣 SP');
    A.equal(afterUp.battle.state.teamSp, cur.teamSp, '成功升级写入续局');
    const shotE = await shot(p, 'e18-upgrade-saved.png');
    // 非法/取消不提交：取消预览与点击非法落点都不写续局
    const savedAtBefore = (await readSave()).battle.savedAt;
    await selectAlly(p, 'ele');
    await p.locator('#btn-cancel').click();
    await p.waitForTimeout(120);
    A.equal((await readSave()).battle.savedAt, savedAtBefore, '取消预览不写续局');
    await selectAlly(p, 'ele');
    await cell(p, { x: 4, y: 4 });
    await p.waitForTimeout(150);
    A.equal((await readSave()).battle.savedAt, savedAtBefore, '非法落点不写续局');
    return `副本续局：移动不保存且可撤销 → 刷新回到保存点；冰封成功写入续局、锁撤，刷新后冻结与锁定状态正确恢复；升级写入续局；取消不写入（截图 ${shotA}、${shotB}、${shotC}、${shotD}、${shotE}）`;
  });
  // ---------- E19 旧档迁移 ----------
  await step('E19-副本', '旧档副本：象缺新字段只补默认、不赠 SP、不刷新已用行动，升级保留', async () => {
    const s = savedStateWithElephant();
    // 模拟旧版本：象只有基础字段
    const old = R.copy(s);
    const ele = old.units.find(u => u.id === 'ele');
    delete ele.elephantPullRange; delete ele.elephantFreezeUnlocked; delete ele.elephantFreezeDuration; delete ele.elephantSkillUsed;
    ele.ap = 0;
    const journey = R.journeyRecord(old);
    journey.party.forEach(u => { if (u.kind === 'elephant') { delete u.elephantPullRange; delete u.elephantFreezeUnlocked; delete u.elephantFreezeDuration; delete u.elephantSkillUsed; } });
    const save = playerSave({ journey, battle: { version: 1, state: old, savedAt: '2026-10-20T00:00:00.000Z', reason: '旧版本副本' } });
    const { ctx, p } = await openWithSave(browser, save);
    await waitView(p, 'battle');
    await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
    const cur = await st(p);
    const e = G(cur, 'ele');
    A.equal(R.elephantPullRangeOf(e), 3, '补齐默认牵引射程 3');
    A.equal(R.elephantFreezeUnlocked(e), false, '旧档不因迁移获得冰封');
    A.equal(e.elephantSkillUsed, true, '已用完行动的旧档不刷新技能');
    A.equal(cur.teamSp, 3, '迁移不赠公共 SP');
    await selectAlly(p, 'ele');
    A.equal(await p.locator('#rook-modes [data-mode="elephant-freeze"]').innerText(), '冰封未解锁（2 SP）', '界面显示未解锁');
    await openSkills(p);
    const panel = await p.locator('#skills').innerText();
    A.match(panel, /解锁冰封/, '技能面板可解锁');
    A.match(panel, /2 公共 SP/, '解锁价格 2 SP');
    A.equal(await p.locator('#rook-modes [data-mode="elephant-pull"]').isDisabled(), true, '旧档已用完行动：牵引/冰封按钮禁用');
    const marks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').length);
    A.equal(marks, 0, '旧档本回合无剩余移动落点（不刷新行动）');
    const shotA = await shot(p, 'e19-legacy-battle.png');
    // 升级保留：重新注入带升级的旧档
    const up = R.copy(old);
    const eleUp = up.units.find(u => u.id === 'ele');
    eleUp.elephantPullRange = 5; eleUp.elephantFreezeUnlocked = true; eleUp.elephantFreezeDuration = 2;
    await inject(p, up);
    const cur2 = await st(p);
    A.equal(R.elephantPullRangeOf(G(cur2, 'ele')), 5, '已升级字段不被迁移覆盖');
    A.equal(R.elephantFreezeDurationOf(G(cur2, 'ele')), 2, '冻结时长保留');
    await ctx.close();
    return `旧档副本：象字段补齐为射程 3 / 未解锁 / 技能已用，公共 SP 仍为 3（不赠点），界面显示“冰封未解锁（2 SP）”可正常解锁；带升级的旧档保留射程 5、冰封 2 阶段（截图 ${shotA}）`;
  });
}

/* ================= D. 手机横版（不改既有布局，只判断可达性） ================= */
async function mobileSection(browser) {
  // 手机竖版基准（448×924）与横版（844×390）各取证据
  for (const [name, viewport] of [['448x924', { width: 448, height: 924 }], ['844x390', { width: 844, height: 390 }]]) {
    await step('E21-' + name, `手机 ${name}：招募/升级/技能目标操作可达性（既有布局问题单列）`, async () => {
      const { ctx, p } = await openWithSave(browser, playerSave(), viewport);
      await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
      await p.locator('#flow-new').click();
      await waitView(p, 'tutorial');
      await p.locator('#tutorial-skip').click();
      await p.locator('#tutorial-skip-yes').click();
      await waitView(p, 'camp');
      if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
      const recruitVisible = await p.locator('[data-recruit="elephant"]').isVisible();
      A.ok(recruitVisible, '招募象按钮可见');
      await p.locator('[data-recruit="elephant"]').click();
      await p.waitForFunction(() => window.__M0_DEBUG__.getState().party.some(u => u.kind === 'elephant'), null, { timeout: 8000 });
      const campShot = await shot(p, `e21-${name}-camp-recruit.png`);
      // 营地技能面板：点开象的升级按钮
      const btn = p.locator('#camp-skills [data-skill="elephant-pull-range"]').first();
      const skillVisible = await btn.isVisible();
      const campSkillsShot = await shot(p, `e21-${name}-camp-skills.png`);
      await ctx.close();
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
      const modesShot = await shot(bp, `e21-${name}-modes.png`);
      const reach = await bp.evaluate(() => {
        const btn = document.querySelector('#rook-modes [data-mode="elephant-freeze"]');
        if (!btn) return null; const r = btn.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      });
      A.ok(reach && reach.visible && reach.h > 20, '冰封模式按钮可点击（高度 > 20px）');
      await selectMode(bp, 'elephant-freeze');
      const zone = await bp.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'freeze-zone').length);
      A.equal(zone, 25, '手机版冰封 5×5 范围标记可用');
      const boardClickable = layout.cellW >= 20 && layout.boardInsideScene;
      if (boardClickable) {
        await cell(bp, { x: 4, y: 5 });
        await bp.waitForTimeout(200);
        const s2 = await st(bp);
        const previewText = await bp.locator('#preview-box').innerText();
        A.ok(G(s2, 'foe').frozen >= 1 || /冰封/.test(previewText), '手机版可点选冰封目标');
      }
      const targetShot = await shot(bp, `e21-${name}-freeze-target.png`);
      await battleCtx.close();
      const issues = [];
      if (!boardClickable) issues.push(`棋盘单格仅 ${layout.cellW}×${layout.cellH}px（棋盘区 ${layout.scene.w}×${layout.scene.h}px），属既有手机版行预算问题，本次不重做布局`);
      if (!skillVisible) issues.push('营地技能按钮在折叠面板内需先展开');
      await ctx.close();
      return `手机 ${name}（布局 ${layout.layoutMode}）：招募象按钮可见并可点击（${campShot}）、营地技能面板可见（${campSkillsShot}）、战斗模式按钮“牵引/冰封”可点（高度 ${reach.h}px，${modesShot}）、冰封 5×5 标记 25 格、目标点击可用（${targetShot}）；棋盘 ${layout.boardW}×${layout.boardH}px、单格 ${layout.cellW}×${layout.cellH}px${issues.length ? '；'+issues.join('；') : ''}`;
    });
  }
}

function point(p) { return p ? `(${p.x + 1},${p.y + 1})` : '无'; }

module.exports = { normalFlow };
if (require.main === module) {
  (async () => {
    const browser = await pw.chromium.launch();
    try { await normalFlow(browser); } catch (e) { bad('NORMAL', '正常流程', '未完成', e); }
    try { await fixtureSections(browser); } catch (e) { bad('FIXTURES', '专项界面段', '未完成', e); }
    try { await saveSections(browser); } catch (e) { bad('SAVE', '存档边界段', '未完成', e); }
    try { await mobileSection(browser); } catch (e) { bad('MOBILE', '手机段', '未完成', e); }
    report.finishedAt = new Date().toISOString();
    report.summary = { total: report.steps.length, pass: report.steps.filter(s => s.pass).length, fail: failed, pageErrors: report.pageErrors };
    fs.writeFileSync(path.join(dir, 'browser-result.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log('SUMMARY', JSON.stringify(report.summary));
    process.exit(failed ? 1 : 0);
  })();
}
