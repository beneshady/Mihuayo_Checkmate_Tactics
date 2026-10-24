// US-022 R2 精准补验（真实浏览器）：Codex 首轮审阅列出的缺口 3（E18 保存边界补验）、
// 缺口 4（E20 升级后实际使用 4 格牵引）、缺口 5（E21 横版状态纠正为部分通过）。
// 独立脚本与新证据目录 docs/us/us022-evidence-r2/，不覆盖、不改写首轮 tests/us022-acceptance-browser.cjs 与其证据。
// 分段标注：正常入口＝从菜单真实点击；副本＝应用自身存档恢复入口（隔离 localStorage），夹具只摆放初始局面。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const R = require('../web/js/rules.js');
const base = process.env.M0_TEST_URL || 'http://127.0.0.1:8777';
const dir = path.resolve(process.env.US022_R2_EVIDENCE_DIR || 'docs/us/us022-evidence-r2');
fs.mkdirSync(dir, { recursive: true });
const VERSION_FILES = ['web/index.html', 'web/js/rules.js', 'web/js/app.js', 'web/js/campaign.js', 'web/js/maps.js', 'tests/us022-r2-rules.test.cjs', 'tests/us022-r2-acceptance-browser.cjs'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report = {
  scope: 'US-022 R2 精准补验：E15/E11 见 tests/us022-r2-rules.test.cjs；本文件覆盖 E18 保存边界、E20 升级后使用、E21 横版状态纠正',
  startedAt: new Date().toISOString(), steps: [], pageErrors: [], layout: {}, versions: {}, versionsEnd: {},
  versionsNote: 'versions 为运行开始时的文件 SHA-256，versionsEnd 为运行结束时的同一批文件；两者一致才说明证据对应实际交付版本'
};
for (const f of VERSION_FILES) if (fs.existsSync(f)) report.versions[f] = hash(f);
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
  await p.waitForTimeout(200);
}
async function waitView(p, view) { await p.waitForFunction(v => window.M0Campaign && window.M0Campaign.info().view === v, view, { timeout: 30000 }); }
async function waitPlayer(p) { await p.waitForFunction(() => window.__M0_DEBUG__ && window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 20000 }); }
async function openWithSave(browser, save, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 } });
  await ctx.addInitScript(`try{if(!localStorage.getItem('m0-journey-v1'))localStorage.setItem('m0-journey-v1',${JSON.stringify(JSON.stringify(save))});}catch(e){}`);
  const p = await ctx.newPage();
  p.on('pageerror', e => report.pageErrors.push(e.message));
  await p.goto(base + '/');
  await p.waitForFunction(() => !!window.__M0_DEBUG__ || (window.M0Campaign && window.M0Campaign.info().view === 'menu'), null, { timeout: 30000 });
  return { ctx, p };
}
function playerSave(over) { return Object.assign({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: null, battle: null }, over || {}); }
const unit = (id, side, kind, x, y) => R.unit(id, side, kind, x, y);
const P = (id, kind, x, y) => unit(id, 'player', kind, x, y);
const E = (id, kind, x, y) => unit(id, 'enemy', kind, x, y);
function land() { const t = {}; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) t[x + ',' + y] = 'land'; return t; }
async function selectAlly(p, id) {
  const ally = p.locator('[data-unit="' + id + '"]');
  if (await ally.first().isVisible()) { await ally.first().click(); return; }
  await p.locator('#mobile-tools [data-ui-view="units"]').click();
  await p.locator('[data-unit="' + id + '"]').first().click();
  if (await p.locator('#btn-mobile-info-close').isVisible()) await p.locator('#btn-mobile-info-close').click();
}
async function selectMode(p, mode) { await p.locator(`#rook-modes [data-mode="${mode}"]`).click(); await p.waitForTimeout(60); }
async function openSkills(p) {
  await p.evaluate(() => { const d = document.querySelector('details.upgrade-section'); if (d) d.open = true; });
  await p.locator('#skills [data-skill]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
  await p.waitForTimeout(60);
}
function point(p) { return p ? `(${p.x + 1},${p.y + 1})` : '无'; }
// 自动游玩评估（与首轮验收相同思路，全部经真实点击提交）
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
async function autoTurn(p, excludeIds) {
  for (let q = 0; q < 8; q++) {
    const cur = await st(p);
    if (cur.phase !== 'player') break;
    const a = chooseAction(cur, excludeIds || []);
    if (!a) break;
    await doAction(p, a);
  }
  const cur = await st(p);
  if (cur.phase === 'rescue') { await p.locator('#btn-rescue-skip').click(); await p.waitForTimeout(120); return; }
  if ((await st(p)).phase === 'player') await endTurn(p);
}

/* ================= 缺口 4：E20 正常链路，升级后实际使用 4 格牵引 ================= */
// 在布阵阶段挑选“象一次田字移动后可对齐、且中间两格清空”的距离 4 直线目标
function range4Plans(s) {
  const ele = s.units.find(u => u.side === 'player' && u.kind === 'elephant');
  if (!ele || ele.elephantSkillUsed) return [];
  const starts = [{ move: null, at: { x: ele.x, y: ele.y } }];
  if (ele.ap > 0) for (const m of R.legalActions(s, ele.id).filter(a => a.type === 'move')) starts.push({ move: m, at: m.to });
  const out = [];
  for (const st0 of starts) {
    for (const e of s.units.filter(u => u.side === 'enemy' && u.kind !== 'king')) {
      const dx = e.x - st0.at.x, dy = e.y - st0.at.y;
      if (dx !== 0 && dy !== 0) continue;
      if (Math.abs(dx) + Math.abs(dy) !== 4) continue;
      const sx = Math.sign(st0.at.x - e.x), sy = Math.sign(st0.at.y - e.y);
      const cells = [{ x: e.x + sx, y: e.y + sy }, { x: e.x + 2 * sx, y: e.y + 2 * sy }];
      const clear = cells.every(q => R.inside(q) && !R.at(s, q) && !R.corpseAt(s, q) && !R.mountain(s, q) && !R.isWater(q, s));
      if (!clear) continue;
      out.push({ move: st0.move, eleAt: st0.at, target: e, steps: cells });
    }
  }
  return out;
}
// 升级后（射程 4）该目标是否真的可牵引：规则层预演（不改动局面）
function pullLegalAt4(s, targetId) {
  const n = R.copy(s);
  const ele = n.units.find(u => u.kind === 'elephant' && u.side === 'player');
  ele.elephantPullRange = 4;
  const t = n.units.find(u => u.id === targetId);
  return !!R.elephantPullAction(n, ele, { x: t.x, y: t.y });
}
async function normalChainUpgradePull(browser) {
  const flow = {};
  const { ctx, p } = await openWithSave(browser, playerSave());
  await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
  try {
    await step('E20R2-1', '正常入口：新旅程→跳过教学→主营地', async () => {
      await p.locator('#flow-new').click();
      await waitView(p, 'tutorial');
      await p.locator('#tutorial-skip').click();
      await p.locator('#tutorial-skip-yes').click();
      await waitView(p, 'camp');
      if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
      const s = await st(p);
      A.equal(s.gold, 8, '首次入营 8 猫粮');
      A.ok(!s.party.some(u => u.kind === 'elephant'), '初始无象');
      return `正常点击进入主营地：猫粮 ${s.gold}、公共 SP ${s.teamSp}、无象`;
    });
    await step('E20R2-2', '正常入口：第 1 关真实战斗赚猫粮/SP（为后续升级提供资源）', async () => {
      await p.locator('#camp-leave').click();
      await waitView(p, 'map');
      await p.locator('#campaign button[data-region="0"]').click();
      await p.locator('#flow-enter').click();
      await waitView(p, 'battle');
      const play = async () => {
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
        await waitPlayer(p);
        for (let turns = 0; turns < 14; turns++) {
          cur = await st(p);
          if (cur.phase !== 'player') break;
          await autoTurn(p);
          if ((await st(p)).phase !== 'player') break;
        }
        return await st(p);
      };
      let s = await play();
      let attempts = 1;
      while (s.phase === 'result' && s.result === 'dead' && attempts < 4) {
        await p.locator('#btn-restart-2').click();
        await p.waitForTimeout(300);
        attempts++;
        s = await play();
      }
      A.equal(s.phase, 'intermission', '第 1 关胜利结算回营（实际 ' + s.phase + '/' + s.result + '）');
      A.ok(s.teamSp >= 1, '正常战斗至少赚到 1 公共 SP（实际 ' + s.teamSp + '）');
      A.ok(s.gold >= 5, '正常战斗至少赚到招募象的 5 猫粮（实际 ' + s.gold + '）');
      flow.level1 = { teamSp: s.teamSp, gold: s.gold, kills: s.kills, turn: s.turn, attempts };
      await shot(p, 'e20r2-1-level1-earn.png');
      return `第 1 关真实点击完成（第 ${attempts} 次尝试）：胜利、击杀 ${s.kills}、公共 SP ${s.teamSp}、猫粮 ${s.gold}`;
    });
    await p.waitForTimeout(300);
    await step('E20R2-3', '正常入口：营地招募象并换阵上象（保留车）', async () => {
      if ((await st(p)).phase === 'intermission') await waitView(p, 'camp');
      if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
      const gold0 = (await st(p)).gold;
      await p.locator('[data-recruit="elephant"]').click();
      await p.waitForFunction(() => window.__M0_DEBUG__.getState().party.some(u => u.kind === 'elephant'), null, { timeout: 8000 });
      let s = await st(p);
      A.equal(s.gold, gold0 - 5, '招募象扣 5 猫粮');
      const ele = s.party.find(u => u.kind === 'elephant');
      if (!(s.activeIds || []).includes(ele.id)) {
        const out = s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind === 'pawn'; }) || s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind !== 'advisor'; });
        await p.locator(`[data-camp-roster="${out}"]`).click();
        await p.waitForTimeout(120);
        await p.locator(`[data-camp-roster="${ele.id}"]`).click();
        await p.waitForTimeout(150);
      }
      s = await st(p);
      A.ok(s.activeIds.includes(ele.id), '象已上阵');
      A.ok(s.activeIds.some(id => (s.party.find(v => v.id === id) || {}).kind === 'rook'), '保留车在阵');
      flow.camp = { gold: s.gold, teamSp: s.teamSp, range: R.elephantPullRangeOf(s.party.find(u => u.id === ele.id)) };
      await shot(p, 'e20r2-2-camp-roster.png');
      return `营地：猫粮 ${gold0}→${s.gold} 招募象并上阵（公共 SP ${s.teamSp}，牵引射程仍为 ${flow.camp.range} 格，未在营地升级）`;
    });
    await step('E20R2-4', '正常入口：第 2 关布阵（为 4 格牵引准备线路）', async () => {
      await p.locator('#camp-leave').click();
      await waitView(p, 'map');
      await p.locator('#campaign button[data-region="1"]').click();
      await p.locator('#flow-enter').click();
      await waitView(p, 'battle');
      let cur = await st(p);
      A.equal(cur.phase, 'deploy', '进入第 2 关布阵');
      const ele = cur.units.find(u => u.side === 'player' && u.kind === 'elephant');
      A.ok(ele, '布阵阶段象在场');
      // 以“距离 4 直线 + 中间两格可清空”为目标挑选象的布阵格，并把挡路队友挪开
      let chosen = null;
      for (let y = 0; y <= 3 && !chosen; y++) for (let x = 0; x <= 8 && !chosen; x++) {
        const c = { x: x, y: y };
        if (R.at(cur, c) && R.at(cur, c).id !== ele.id) continue;
        if (R.mountain(cur, c) || R.isWater(c, cur)) continue;
        for (const e of cur.units.filter(u => u.side === 'enemy' && u.kind !== 'king')) {
          const dx = e.x - c.x, dy = e.y - c.y;
          if (dx !== 0 && dy !== 0) continue;
          if (Math.abs(dx) + Math.abs(dy) !== 4) continue;
          const sx = Math.sign(c.x - e.x), sy = Math.sign(c.y - e.y);
          const steps = [{ x: e.x + sx, y: e.y + sy }, { x: e.x + 2 * sx, y: e.y + 2 * sy }];
          if (!steps.every(q => R.inside(q) && !R.mountain(cur, q) && !R.isWater(q, cur))) continue;
          if (steps.some(q => (R.at(cur, q) || {}).kind === 'king')) continue;
          chosen = { cell: c, target: e, steps };
          break;
        }
      }
      A.ok(chosen, '存在可作为 4 格牵引准备的布阵格');
      // 先把占用线路两格的队友挪到无关空格，再放象
      const taken = new Set([ele.id]);
      const freeCell = (skip) => {
        for (let y = 0; y <= 3; y++) for (let x = 0; x <= 8; x++) {
          const c = { x: x, y: y };
          if (R.mountain(cur, c) || R.isWater(c, cur) || R.at(cur, c)) continue;
          if (skip.some(q => q.x === c.x && q.y === c.y)) continue;
          if (cur.units.some(u => u.side === 'player' && u.x === c.x && u.y === c.y)) continue;
          return c;
        }
        return null;
      };
      for (const q of chosen.steps) {
        cur = await st(p);
        const occ = R.at(cur, q);
        if (occ && occ.side === 'player' && occ.kind !== 'king' && !taken.has(occ.id)) {
          const dest = freeCell(chosen.steps.concat([chosen.cell]));
          A.ok(dest, '为挡路队友找到替代格');
          await selectAlly(p, occ.id);
          await cell(p, dest);
          await p.waitForTimeout(80);
          taken.add(occ.id);
        }
      }
      cur = await st(p);
      const occAtCell = R.at(cur, chosen.cell);
      if (occAtCell && occAtCell.side === 'player' && occAtCell.id !== ele.id) {
        const dest = freeCell(chosen.steps.concat([chosen.cell]));
        A.ok(dest, '为占用象目标格的队友找到替代格');
        await selectAlly(p, occAtCell.id);
        await cell(p, dest);
        await p.waitForTimeout(80);
      }
      await selectAlly(p, ele.id);
      await cell(p, chosen.cell);
      await p.waitForTimeout(120);
      cur = await st(p);
      A.deepEqual([G(cur, ele.id).x, G(cur, ele.id).y], [chosen.cell.x, chosen.cell.y], '象已布置到目标格');
      await shot(p, 'e20r2-3-deploy.png');
      await p.locator('#btn-deploy-confirm').click();
      await waitPlayer(p);
      flow.deploy = { eleAt: chosen.cell, plannedTarget: chosen.target.id, path: chosen.steps };
      const now = await st(p);
      const t = now.units.find(u => u.id === chosen.target.id);
      return `第 2 关布阵：象 ${point(chosen.cell)}，计划目标 ${chosen.target.kind}@${point(chosen.target)}；确认布阵后目标位置 ${t ? point(t) : '已移动'}（公共 SP ${now.teamSp}）`;
    });
    await step('E20R2-5', '正常入口：射程 3 时拒绝 4 格目标 → 真实购买升级 → 同一目标真实牵引位移 2 格', async () => {
      const rec = { found: null, reject: null, upgrade: null, pull: null };
      for (let turn = 0; turn < 10; turn++) {
        let cur = await st(p);
        if (cur.phase !== 'player') break;
        const ele = cur.units.find(u => u.id === (cur.units.find(x => x.kind === 'elephant' && x.side === 'player') || {}).id);
        if (!ele) break;
        if (ele.elephantSkillUsed) { await autoTurn(p, [ele.id]); continue; }
        const plans = range4Plans(cur).filter(x => pullLegalAt4(cur, x.target.id));
        if (!plans.length) { await autoTurn(p, [ele.id]); continue; }
        const plan = plans[0];
        rec.found = { target: plan.target.id, kind: plan.target.kind, at: point(plan.target), eleAt: point(plan.eleAt), move: plan.move ? point(plan.move.to) : null };
        // 1) 射程 3：真实点击 4 格外的目标 → 应被拒绝且不消耗技能
        await selectAlly(p, ele.id);
        if (plan.move) { await selectMode(p, 'elephant-move'); await cell(p, plan.move.to); await p.waitForTimeout(120); }
        cur = await st(p);
        rec.rangeBefore = R.elephantPullRangeOf(G(cur, ele.id));
        const skillBefore = G(cur, ele.id).elephantSkillUsed;
        const targetNow = G(cur, plan.target.id);
        A.ok(targetNow, '目标仍在场上');
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-pull');
        await hoverCell(p, { x: targetNow.x, y: targetNow.y });
        await cell(p, { x: targetNow.x, y: targetNow.y });
        await p.waitForTimeout(200);
        const rejectText = await p.locator('#preview-box').innerText();
        const afterReject = await st(p);
        A.match(rejectText, /超过牵引射程 3 格/, '射程 3 时点击 4 格目标被拒绝');
        A.equal(afterReject.teamSp, cur.teamSp, '拒绝不扣 SP');
        A.equal(G(afterReject, ele.id).elephantSkillUsed, skillBefore, '拒绝不消耗技能');
        A.deepEqual([G(afterReject, plan.target.id).x, G(afterReject, plan.target.id).y], [targetNow.x, targetNow.y], '拒绝不位移');
        rec.reject = { text: rejectText.slice(0, 120), range: rec.rangeBefore, sp: cur.teamSp };
        await shot(p, 'e20r2-4-reject-range3.png');
        // 2) 真实点击技能面板购买“牵引射程” 3→4
        const sp0 = afterReject.teamSp;
        A.ok(sp0 >= 1, '有足够公共 SP 购买射程升级（' + sp0 + '）');
        await selectAlly(p, ele.id);
        await openSkills(p);
        const btn = p.locator('#skills [data-skill="elephant-pull-range"]');
        A.equal(await btn.count(), 1, '技能面板存在“牵引射程”按钮');
        await btn.click();
        await p.waitForTimeout(220);
        const afterUp = await st(p);
        A.equal(R.elephantPullRangeOf(G(afterUp, ele.id)), 4, '射程升级为 4 格');
        A.equal(afterUp.teamSp, sp0 - 1, '射程升级扣 1 公共 SP');
        rec.upgrade = { range0: 3, range1: 4, sp0, sp1: afterUp.teamSp };
        await shot(p, 'e20r2-5-range-upgraded.png');
        // 3) 同一目标再次真实点击牵引：距离 4 → 位移 2 格
        const before = G((await st(p)), plan.target.id);
        const dist = Math.abs(before.x - G(afterUp, ele.id).x) + Math.abs(before.y - G(afterUp, ele.id).y);
        A.equal(dist, 4, '牵引前目标仍在实际距离 4');
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-pull');
        await hoverCell(p, { x: before.x, y: before.y });
        const previewText = await p.locator('#preview-box').innerText();
        await cell(p, { x: before.x, y: before.y });
        await p.waitForTimeout(250);
        const after = await st(p);
        const targetAfter = G(after, plan.target.id);
        const moved = targetAfter ? Math.abs(targetAfter.x - before.x) + Math.abs(targetAfter.y - before.y) : null;
        A.ok(targetAfter, '目标存活（无碰撞）');
        A.equal(moved, 2, '升级后的 4 格牵引实际位移 2 格（floor(4/2)）');
        A.equal(G(after, ele.id).elephantSkillUsed, true, '消耗本回合技能');
        A.equal(G(after, ele.id).ap, 0, '施法后锁定普通移动');
        rec.pull = { dist, moved, from: point(before), to: point(targetAfter), preview: previewText.split('\n')[0] };
        await shot(p, 'e20r2-6-pull-used.png');
        await shotBoard(p, 'e20r2-6-pull-used-board.png');
        break;
      }
      A.ok(rec.found && rec.reject && rec.upgrade && rec.pull, '完整取得“拒绝→升级→实际牵引”三步证据：' + JSON.stringify(rec).slice(0, 300));
      flow.pullUse = rec;
      return `正常链路：目标 ${rec.found.kind}@${rec.found.at}（象 ${rec.found.eleAt}${rec.found.move ? '，先田字移动到 ' + rec.found.move : ''}）；射程 3 点击被拒“${rec.reject.text}”；购买升级 3→4、SP ${rec.upgrade.sp0}→${rec.upgrade.sp1}；同一目标真实牵引：距离 ${rec.pull.dist}、位移 ${rec.pull.moved} 格 ${rec.pull.from}→${rec.pull.to}，预览“${rec.pull.preview}”（截图 e20r2-4/5/6）`;
    });
  } finally {
    flow.pageErrors = report.pageErrors.slice();
    flow.save = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('m0-journey-v1')); } catch (e) { return null; } });
    report.normalChain = { level1: flow.level1, camp: flow.camp, deploy: flow.deploy, pullUse: flow.pullUse || null };
    await ctx.close();
  }
  return flow;
}

/* ================= 缺口 3：E18 保存边界补验（隔离副本，应用自身存档入口） ================= */
function battleFixture(opts) {
  const o = opts || {};
  const s = R.emptyState([P('king', 'king', 4, 0), E('boss', 'king', 8, 8)].concat(o.units || []));
  s.tiles = Object.assign(land(), o.tiles || {});
  s.phase = 'player';
  s.teamSp = o.teamSp === undefined ? 3 : o.teamSp;
  s.gold = 9; s.level = 2; s.completed = 1; s.wave = 1; s.turn = 3;
  s.mapName = '三桥山口';
  s.buffs = { health: true, move: false, rescue: false };
  s.party = (o.units || []).filter(u => u.side === 'player').map(u => R.copy(u));
  s.activeIds = s.party.map(u => u.id);
  (o.mutate || (() => { }))(s);
  if (o.prepareIntents) { s.intents = []; R.prepareEnemy(s); }
  s.entrySnapshot = R.copy(s); s.levelSnapshot = R.copy(s);
  return s;
}
function saveFromState(s, savedAt) {
  const journey = R.journeyRecord(s);
  return playerSave({ journey, battle: { version: 1, state: s, savedAt: savedAt || '2026-10-24T02:00:00.000Z', reason: 'US022 R2 副本' } });
}
async function readSave(p) { return p.evaluate(() => { try { return JSON.parse(localStorage.getItem('m0-journey-v1')); } catch (e) { return null; } }); }
async function saveBoundarySection(browser) {
  // ---- E18-R2-a：实际 UI 牵引 → 写续局 → 刷新恢复（位置/技能消耗） ----
  await step('E18R2-a', '副本：实际 UI 牵引后写续局并锁撤，刷新后位置与技能消耗正确恢复', async () => {
    const s = battleFixture({
      units: [P('ele', 'elephant', 0, 4), E('foe', 'rook', 3, 4)],
      mutate: st0 => { const e = st0.units.find(u => u.id === 'ele'); e.elephantPullRange = 5; }
    });
    const { ctx, p } = await openWithSave(browser, saveFromState(s));
    await waitView(p, 'battle'); await waitPlayer(p);
    try {
      const savedAt0 = (await readSave(p)).battle.savedAt;
      let cur = await st(p);
      A.deepEqual([G(cur, 'foe').x, G(cur, 'foe').y], [3, 4], '前置：目标在 (4,5)');
      A.equal(await p.locator('#btn-undo').isDisabled(), true, '初始无移动可撤销');
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await hoverCell(p, { x: 3, y: 4 });
      const previewText = await p.locator('#preview-box').innerText();
      await cell(p, { x: 3, y: 4 });
      await p.waitForTimeout(250);
      cur = await st(p);
      A.deepEqual([G(cur, 'foe').x, G(cur, 'foe').y], [2, 4], '实际牵引把目标拉近 1 格');
      A.equal(G(cur, 'foe').hp, 2, '无伤位移：HP 不变');
      A.equal(G(cur, 'ele').elephantSkillUsed, true, '牵引消耗技能');
      A.equal(await p.locator('#btn-undo').isDisabled(), true, '成功施法锁定撤销');
      const saved1 = await readSave(p);
      A.notEqual(saved1.battle.savedAt, savedAt0, '牵引写入续局（savedAt 变化）');
      A.deepEqual([saved1.battle.state.units.find(u => u.id === 'foe').x, saved1.battle.state.units.find(u => u.id === 'foe').y], [2, 4], '续局记录位移结果');
      A.equal(saved1.battle.state.units.find(u => u.id === 'ele').elephantSkillUsed, true, '续局记录技能已消耗');
      const shotA = await shot(p, 'e18r2-a-pull-saved.png');
      await p.reload();
      await waitView(p, 'battle'); await waitPlayer(p);
      const back = await st(p);
      A.deepEqual([G(back, 'foe').x, G(back, 'foe').y], [2, 4], '刷新后位置按保存点恢复');
      A.equal(G(back, 'ele').elephantSkillUsed, true, '刷新后技能消耗状态恢复');
      A.equal(await p.locator('#btn-undo').isDisabled(), true, '刷新后撤销仍锁定');
      const shotB = await shot(p, 'e18r2-a-pull-reload.png');
      return `副本续局：牵引预览“${previewText.split('\n')[0]}”，真实点击后目标 (4,5)→(3,5)、技能已用、撤销锁定、savedAt 变化且续局含位移与技能状态；刷新后位置 (3,5)、技能已用、撤销仍锁定（截图 ${shotA}、${shotB}）`;
    } finally { await ctx.close(); }
  });
  // ---- E18-R2-b：撞山开裂 → 写续局 → 刷新保留 ----
  await step('E18R2-b', '副本：牵引撞山开裂后写续局，刷新后山体开裂状态与伤害保留', async () => {
    const s = battleFixture({
      units: [P('ele', 'elephant', 0, 4), E('foe', 'rook', 3, 4)],
      tiles: { '2,4': 'mountain' },
      mutate: st0 => { const e = st0.units.find(u => u.id === 'ele'); e.elephantPullRange = 5; }
    });
    const { ctx, p } = await openWithSave(browser, saveFromState(s));
    await waitView(p, 'battle'); await waitPlayer(p);
    try {
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await cell(p, { x: 3, y: 4 });
      await p.waitForTimeout(250);
      let cur = await st(p);
      A.equal(cur.tiles['2,4'], 'cracked', '牵引撞山：开裂（只扣 1 耐久）');
      A.equal(G(cur, 'foe').hp, 1, '撞山 −1');
      A.equal(G(cur, 'foe').x, 3, '撞山当次停在山前');
      const saved = await readSave(p);
      A.equal(saved.battle.state.tiles['2,4'], 'cracked', '续局写入开裂地形');
      const shotA = await shot(p, 'e18r2-b-cracked-saved.png');
      await shotBoard(p, 'e18r2-b-cracked-saved-board.png');
      await p.reload();
      await waitView(p, 'battle'); await waitPlayer(p);
      cur = await st(p);
      A.equal(cur.tiles['2,4'], 'cracked', '刷新后开裂地形保留');
      A.equal(G(cur, 'foe').hp, 1, '刷新后目标 HP 保留');
      A.equal(R.mountain(cur, { x: 2, y: 4 }), true, '开裂山刷新后仍阻挡');
      const shotB = await shot(p, 'e18r2-b-cracked-reload.png');
      return `副本：牵引撞山后 tiles(3,5)=cracked、目标 HP 2→1 并停在山前；续局记录开裂地形；刷新后开裂、HP、阻挡均正确恢复（截图 ${shotA}、${shotB}）`;
    } finally { await ctx.close(); }
  });
  // ---- E18-R2-c：已开裂山再撞成碎石地 → 写续局 → 刷新保留 ----
  await step('E18R2-c', '副本：撞毁成碎石地后写续局，刷新后碎石地保留且不再阻挡', async () => {
    const s = battleFixture({
      units: [P('ele', 'elephant', 0, 4), E('foe', 'rook', 3, 4)],
      tiles: { '2,4': 'cracked' },
      mutate: st0 => { const e = st0.units.find(u => u.id === 'ele'); e.elephantPullRange = 5; }
    });
    const { ctx, p } = await openWithSave(browser, saveFromState(s));
    await waitView(p, 'battle'); await waitPlayer(p);
    try {
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      await cell(p, { x: 3, y: 4 });
      await p.waitForTimeout(250);
      let cur = await st(p);
      A.equal(cur.tiles['2,4'], 'rubble', '第二次撞击后变碎石地');
      A.equal(R.mountain(cur, { x: 2, y: 4 }), false, '碎石地不再阻挡');
      A.equal(G(cur, 'foe').hp, 1, '目标 −1 且存活');
      const saved = await readSave(p);
      A.equal(saved.battle.state.tiles['2,4'], 'rubble', '续局写入碎石地');
      const shotA = await shot(p, 'e18r2-c-rubble-saved.png');
      await shotBoard(p, 'e18r2-c-rubble-saved-board.png');
      await p.reload();
      await waitView(p, 'battle'); await waitPlayer(p);
      cur = await st(p);
      A.equal(cur.tiles['2,4'], 'rubble', '刷新后碎石地保留');
      A.equal(R.mountain(cur, { x: 2, y: 4 }), false, '刷新后碎石地仍不阻挡');
      const shotB = await shot(p, 'e18r2-c-rubble-reload.png');
      return `副本：已开裂山被牵引撞击后 tiles(3,5)=rubble、不阻挡、目标存活；续局记录碎石地；刷新后碎石地及通行判定正确恢复（截图 ${shotA}、${shotB}）`;
    } finally { await ctx.close(); }
  });
  // ---- E18-R2-d：受伤解冻但本回合待机 → 写续局 → 刷新 → 再执行敌方阶段仍待机 ----
  await step('E18R2-d', '副本：受伤解冻待机状态写续局，刷新后进入敌方阶段仍待机（不攻击、不多吞回合）', async () => {
    const s = battleFixture({
      units: [P('ele', 'elephant', 4, 3), P('ele2', 'elephant', 4, 5), E('foe', 'rook', 4, 1)],
      tiles: { '4,2': 'mountain' },
      prepareIntents: true,
      mutate: st0 => {
        const e = st0.units.find(u => u.id === 'ele'); e.elephantFreezeUnlocked = true; e.elephantFreezeDuration = 1;
        const e2 = st0.units.find(u => u.id === 'ele2'); e2.elephantPullRange = 5;
      }
    });
    const { ctx, p } = await openWithSave(browser, saveFromState(s));
    await waitView(p, 'battle'); await waitPlayer(p);
    try {
      let cur = await st(p);
      A.equal(G(cur, 'foe').frozen === undefined || G(cur, 'foe').frozen === 0, true, '前置：目标未被冻结');
      const intent0 = (await p.locator('#intent-list').innerText()).replace(/\s+/g, ' ');
      // 1) 真实点击冰封 (4,1)
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-freeze');
      await cell(p, { x: 4, y: 1 });
      await p.waitForTimeout(250);
      cur = await st(p);
      A.equal(G(cur, 'foe').frozen, 1, '真实冰封 1 阶段');
      const intentFrozen = (await p.locator('#intent-list').innerText()).replace(/\s+/g, ' ');
      // 2) 第二只象把已冻结目标拉向山体，造成 1 点伤害（受伤解冻但本回合待机）
      await selectAlly(p, 'ele2');
      await selectMode(p, 'elephant-pull');
      await cell(p, { x: 4, y: 1 });
      await p.waitForTimeout(250);
      cur = await st(p);
      A.equal(G(cur, 'foe').hp, 1, '碰撞造成 1 点非致命伤害（车 2→1）');
      A.equal(G(cur, 'foe').frozen, 0, '受伤清除剩余冻结');
      A.equal(G(cur, 'foe').thawStandby, true, '受伤解冻但本回合待机');
      const saved = await readSave(p);
      A.equal(saved.battle.state.units.find(u => u.id === 'foe').thawStandby, true, '续局记录解冻待机');
      const shotA = await shot(p, 'e18r2-d-thaw-saved.png');
      // 3) 刷新（不结束回合）
      await p.reload();
      await waitView(p, 'battle'); await waitPlayer(p);
      cur = await st(p);
      A.equal(G(cur, 'foe').frozen, 0, '刷新后冻结阶段仍为 0');
      A.equal(G(cur, 'foe').thawStandby, true, '刷新后解冻待机标志保留');
      A.equal(G(cur, 'foe').hp, 1, '刷新后 HP 保留');
      const shotB = await shot(p, 'e18r2-d-thaw-reload.png');
      // 4) 刷新后再执行敌方阶段：仍待机、不攻击、不额外吞回合
      const kingHp0 = G(cur, 'king').hp;
      const turn0 = cur.turn;
      await endTurn(p);
      const after = await st(p);
      A.equal(G(after, 'king').hp, kingHp0, '敌方阶段被解冻待机的目标仍不攻击（主帅未掉血）');
      A.equal(G(after, 'foe').thawStandby, false, '该阶段结束后清除解冻待机标志');
      A.equal(after.turn, turn0 + 1, '只消耗本回合，不额外吞掉下一整回合');
      A.equal(R.frozenSkip(G(after, 'foe')), false, '下一回合恢复正常（不再被跳过）');
      const shotC = await shot(p, 'e18r2-d-thaw-enemy-phase.png');
      return `副本：冻结意图“${intentFrozen}”→ 冰封后 frozen=1 → 第二只象牵引撞山 1 伤 → frozen=0 且 thawStandby=true 并写入续局；刷新后 frozen=0、thawStandby=true、HP=1 均保留；刷新后真实结束回合：敌方阶段该单位仍待机（主帅 HP ${kingHp0}→${G(after, 'king').hp} 未掉血）、标志清除、回合 ${turn0}→${after.turn}（截图 ${shotA}、${shotB}、${shotC}）`;
    } finally { await ctx.close(); }
  });
  // ---- E18-R2-e：失败购买不改保存 ----
  await step('E18R2-e', '副本：SP 不足的购买被禁用，点击不改动状态也不写续局', async () => {
    const s = battleFixture({
      units: [P('ele', 'elephant', 0, 4), E('foe', 'rook', 3, 4)],
      teamSp: 1,
      mutate: st0 => { const e = st0.units.find(u => u.id === 'ele'); e.elephantPullRange = 5; }
    });
    const { ctx, p } = await openWithSave(browser, saveFromState(s));
    await waitView(p, 'battle'); await waitPlayer(p);
    try {
      const savedAt0 = (await readSave(p)).battle.savedAt;
      await selectAlly(p, 'ele');
      await openSkills(p);
      const btn = p.locator('#skills [data-skill="elephant-freeze-unlock"]');
      A.equal(await btn.count(), 1, '技能面板显示“解锁冰封”按钮');
      const disabled = await btn.isDisabled();
      A.equal(disabled, true, 'SP 1 不足 2 时按钮禁用');
      const label = (await btn.innerText()).replace(/\s+/g, ' ');
      const before = await st(p);
      if (disabled) { await btn.click({ force: true }); await p.waitForTimeout(200); }
      const after = await st(p);
      A.equal(after.teamSp, before.teamSp, '点击后公共 SP 不变');
      A.equal(R.elephantFreezeUnlocked(G(after, 'ele')), false, '点击后仍未解锁');
      A.equal((await readSave(p)).battle.savedAt, savedAt0, '失败购买不写续局（savedAt 不变）');
      const shotA = await shot(p, 'e18r2-e-failed-buy.png');
      return `副本：公共 SP 1 时“解锁冰封（2 SP）”按钮禁用（按钮文案“${label}”），强制真实点击后 SP 仍 1、冰封仍未解锁、续局 savedAt 未变（截图 ${shotA}）`;
    } finally { await ctx.close(); }
  });
}

/* ================= 缺口 5：E21 横版状态纠正（部分通过，不修布局） ================= */
async function mobileSection(browser) {
  await step('E21R2-横版', '手机横版 844×390：入口可达=通过；棋盘操作受既有布局阻塞=未通过（不修布局）', async () => {
    const viewport = { width: 844, height: 390 };
    const { ctx, p } = await openWithSave(browser, playerSave(), viewport);
    await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'menu', null, { timeout: 30000 });
    const entry = {};
    try {
      await p.locator('#flow-new').click();
      await waitView(p, 'tutorial');
      await p.locator('#tutorial-skip').click();
      await p.locator('#tutorial-skip-yes').click();
      await waitView(p, 'camp');
      if (await p.locator('#camp-guide').isVisible()) await p.locator('#camp-guide-close').click();
      entry.recruitVisible = await p.locator('[data-recruit="elephant"]').isVisible();
      if (entry.recruitVisible) {
        await p.locator('[data-recruit="elephant"]').click();
        await p.waitForFunction(() => window.__M0_DEBUG__.getState().party.some(u => u.kind === 'elephant'), null, { timeout: 8000 });
        entry.recruited = true;
      }
      const campShot = await shot(p, 'e21r2-844x390-camp-recruit.png');
      entry.campSkillVisible = await p.locator('#camp-skills [data-skill="elephant-pull-range"]').first().isVisible().catch(() => false);
      const campSkillShot = await shot(p, 'e21r2-844x390-camp-skills.png');
      A.equal(entry.recruitVisible, true, '横版营地招募象按钮可见');
      A.equal(entry.recruited, true, '横版营地可招募象');
    } finally { await ctx.close(); }
    // 战斗内（独立夹具页）测量棋盘与模式入口
    const battleCtx = await browser.newContext({ viewport });
    const bp = await battleCtx.newPage();
    bp.on('pageerror', e => report.pageErrors.push(e.message));
    await bp.goto(base + '/?device-preview=regression&validation=us022-r2-mobile');
    await bp.waitForFunction(() => !!window.__M0_DEBUG__);
    await bp.evaluate(() => window.M0Display.setMode && window.M0Display.setMode('mobile'));
    const battle = battleFixture({
      units: [P('ele', 'elephant', 4, 3), E('foe', 'pawn', 4, 5)],
      mutate: st0 => { const e = st0.units.find(u => u.id === 'ele'); e.elephantFreezeUnlocked = true; e.elephantFreezeDuration = 1; }
    });
    await bp.evaluate(x => window.__M0_DEBUG__.setState(x), battle);
    await bp.waitForTimeout(250);
    const layout = await bp.evaluate(() => {
      const g = window.__M0_DEBUG__.grid, c00 = g.screenPoint({ x: 0, y: 0 }), c10 = g.screenPoint({ x: 1, y: 0 }), c01 = g.screenPoint({ x: 0, y: 1 }), c88 = g.screenPoint({ x: 8, y: 8 });
      const scene = document.getElementById('scene').getBoundingClientRect();
      const board = { x0: Math.min(c00.x, c88.x), y0: Math.min(c00.y, c88.y), x1: Math.max(c00.x, c88.x), y1: Math.max(c00.y, c88.y) };
      return {
        viewport: { w: innerWidth, h: innerHeight }, layoutMode: document.getElementById('game-viewport').dataset.layoutMode,
        scene: { w: Math.round(scene.width), h: Math.round(scene.height) },
        boardW: Math.round(board.x1 - board.x0), boardH: Math.round(board.y1 - board.y0),
        cellW: Math.round(Math.hypot(c10.x - c00.x, c10.y - c00.y)), cellH: Math.round(Math.hypot(c01.x - c00.x, c01.y - c00.y))
      };
    });
    report.layout['mobile-844x390'] = layout;
    await selectAlly(bp, 'ele');
    const modesText = (await bp.locator('#rook-modes').innerText()).replace(/\s+/g, ' ');
    const reach = await bp.evaluate(() => {
      const out = {};
      for (const m of ['elephant-move', 'elephant-pull', 'elephant-freeze']) {
        const b = document.querySelector(`#rook-modes [data-mode="${m}"]`);
        if (!b) { out[m] = null; continue; }
        const r = b.getBoundingClientRect();
        out[m] = { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0, disabled: b.disabled };
      }
      return out;
    });
    const modesShot = await shot(bp, 'e21r2-844x390-modes.png');
    const boardShot = await shotBoard(bp, 'e21r2-844x390-board.png');
    // 尝试棋盘点选：记录实际是否可点中目标（4×4px 单格下不可靠）
    let boardClick = { attempted: true, registered: false, note: '' };
    try {
      await selectMode(bp, 'elephant-freeze');
      await cell(bp, { x: 4, y: 5 });
      await bp.waitForTimeout(300);
      const s2 = await st(bp);
      boardClick.registered = !!(G(s2, 'foe') && G(s2, 'foe').frozen >= 1);
      boardClick.note = boardClick.registered
        ? '点击坐标恰好命中目标格（单格 ' + layout.cellW + '×' + layout.cellH + 'px，无法目视可靠定位）'
        : '点击未命中目标格（单格 ' + layout.cellW + '×' + layout.cellH + 'px，棋盘不可目视操作）';
    } catch (e) { boardClick = { attempted: true, registered: false, note: '点击异常：' + e.message }; }
    const targetShot = await shot(bp, 'e21r2-844x390-freeze-attempt.png');
    await battleCtx.close();
    report.mobile = { viewport, layout, modesText, reach, boardClick, campSkillVisible: entry.campSkillVisible };
    // 判定：入口可达=通过；棋盘操作未通过（既有布局阻塞），整项为部分通过
    A.equal(entry.recruitVisible && entry.recruited, true, '横版招募入口可达');
    A.match(modesText, /牵引/, '横版模式入口包含牵引');
    A.match(modesText, /冰封/, '横版模式入口包含冰封');
    A.ok(reach['elephant-freeze'] && reach['elephant-freeze'].visible && reach['elephant-freeze'].h > 20, '横版冰封模式按钮可点击');
    const boardUsable = layout.cellW >= 20 && layout.cellH >= 20;
    A.equal(boardUsable, false, '横版棋盘单格仍远小于可操作尺寸（既有布局问题，本轮不修）');
    return `手机横版 844×390（布局 ${layout.layoutMode}）：营地招募象可点、营地技能入口可见=${entry.campSkillVisible}、战斗模式按钮“${modesText}”可点（冰封按钮 ${reach['elephant-freeze'] && reach['elephant-freeze'].h}px）；但棋盘区 ${layout.scene.w}×${layout.scene.h}px、单格 ${layout.cellW}×${layout.cellH}px，棋盘点选${boardClick.registered ? '偶然命中但不可目视可靠定位' : '未能命中目标'}（${boardClick.note}）——**E21 整项为“部分通过：入口可达；横版棋盘操作未通过/受既有布局阻塞”**，本轮不修复既有布局（截图 ${campShot}、${campSkillShot}、${modesShot}、${boardShot}、${targetShot}）`;
  });
}

/* ================= 主流程 ================= */
if (require.main === module) {
  (async () => {
    const only = process.argv[2] || 'all';
    const browser = await pw.chromium.launch();
    try {
      if (only === 'all' || only === 'normal') { try { await normalChainUpgradePull(browser); } catch (e) { bad('E20R2', '正常流程', '未完成', e); } }
      if (only === 'all' || only === 'save') { try { await saveBoundarySection(browser); } catch (e) { bad('E18R2', '保存边界段', '未完成', e); } }
      if (only === 'all' || only === 'mobile') { try { await mobileSection(browser); } catch (e) { bad('E21R2', '手机横版段', '未完成', e); } }
    } finally {
      report.finishedAt = new Date().toISOString();
      for (const f of VERSION_FILES) if (fs.existsSync(f)) report.versionsEnd[f] = hash(f);
      report.versionsStable = Object.keys(report.versions).every(f => report.versions[f] === report.versionsEnd[f]);
      report.summary = { total: report.steps.length, pass: report.steps.filter(x => x.pass).length, fail: failed, pageErrors: report.pageErrors.length, versionsStable: report.versionsStable };
      fs.writeFileSync(path.join(dir, 'browser-r2-result.json'), JSON.stringify(report, null, 2));
      await browser.close();
      console.log('SUMMARY ' + JSON.stringify(report.summary));
      process.exit(failed ? 1 : 0);
    }
  })();
}
module.exports = { normalChainUpgradePull, saveBoundarySection, mobileSection };
