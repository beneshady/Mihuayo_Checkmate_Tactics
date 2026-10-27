// US-023（编号暂定）兵系四向走法：真实浏览器验收。
// 主验收走正常入口：菜单→真实教学→主营地→选关→第一关布阵→确认开战→逐回合真实点击跨河，再验证横走与后退。
// 转职弓/枪使用应用自身续局恢复入口摆放夹具（专项，结果里标注），动作仍全部经真实点击与引擎结算。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { startServer } = require('./us011-static-server.cjs');
const R = require('../web/js/rules.js');
const dir = path.resolve(process.env.US023_EVIDENCE_DIR || 'docs/us/us023-evidence');
fs.mkdirSync(dir, { recursive: true });
const FILES = ['web/index.html', 'web/js/rules.js', 'web/js/app.js', 'tests/us023-pawn-four-direction.test.cjs', 'tests/us023-pawn-acceptance-browser.cjs'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report = {
  scope: 'US-023：兵与转职兵进入敌方半区后可前后左右移动（未过河仍只能向前）',
  startedAt: new Date().toISOString(), base: null, steps: [], pageErrors: [], versions: {}, versionsEnd: {},
  versionsNote: 'versions 为开始时的文件 SHA-256，versionsEnd 为结束时的同一批文件；一致才说明证据对应实际交付版本',
};
let failed = 0, browser, server;
const ok = (id, kind, detail, evidence) => { report.steps.push({ id, kind, pass: true, detail, evidence: evidence || null }); console.log('PASS ' + id + ' · ' + detail); };
const bad = (id, kind, detail, err) => { failed++; report.steps.push({ id, kind, pass: false, detail, error: String(err && err.stack || err) }); console.log('FAIL ' + id + ' · ' + detail + ' · ' + (err && err.message || err)); };
async function step(id, kind, fn) { try { const d = await fn(); ok(id, kind, d); } catch (e) { bad(id, kind, '执行失败', e); } }

const st = p => p.evaluate(() => window.__M0_DEBUG__.getState());
const G = (s, id) => s.units.find(u => u.id === id);
const fmt = p => '（' + (p.x + 1) + ',' + (p.y + 1) + '）';
async function shot(p, name) { await p.screenshot({ path: path.join(dir, name) }); return name; }
async function shotBoard(p, name) {
  const box = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, Math.min(r.width, window.innerWidth)), height: Math.max(1, Math.min(r.height, window.innerHeight)) }; });
  await p.screenshot({ path: path.join(dir, name), clip: box });
  return name;
}
async function waitView(p, v) { await p.waitForFunction(v => window.M0Campaign && window.M0Campaign.info().view === v, v, { timeout: 30000 }); }
async function clickCell(p, to) {
  const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to);
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(160);
  return xy;
}
async function banner(p) { return (await p.evaluate(() => document.getElementById('banner').textContent || '')).trim(); }
async function card(p) { return (await p.evaluate(() => document.getElementById('selected-card').textContent || '')).replace(/\s+/g, ' '); }
async function mobileCard(p) { return (await p.evaluate(() => document.getElementById('mobile-selected').textContent || '')).replace(/\s+/g, ' '); }
const turnLog = [];
async function endTurn(p) {
  await p.locator('#btn-end').click({ timeout: 8000 });
  await p.locator('#btn-confirm-yes').click({ timeout: 8000 });
  await p.waitForTimeout(300);
  const s = await st(p);
  turnLog.push({
    turn: s.turn, phase: s.phase, result: s.result,
    kings: s.units.filter(u => u.kind === 'king').map(u => u.side + ':' + u.hp + '/' + u.maxHp),
    player: s.units.filter(u => u.side === 'player').map(u => `${u.id}@${u.x},${u.y} hp${u.hp} ap${u.ap}`),
    enemy: s.units.filter(u => u.side === 'enemy').map(u => `${u.id}@${u.x},${u.y} hp${u.hp}`),
  });
}
async function selectOnBoard(p, u) { await clickCell(p, { x: u.x, y: u.y }); }
// 真实教学序列（首次教学无跳过），与既有 US-020 验收一致
async function runTutorial(p) {
  await p.locator('#flow-new').click();
  await waitView(p, 'tutorial');
  await p.locator('#tutorial-enter').click();
  await waitView(p, 'battle');
  await p.locator('#tutorial-ack').click();
  const hover = await p.evaluate(() => window.__M0_DEBUG__.grid.screenPoint({ x: 1, y: 3 }));
  await p.mouse.move(hover.x, hover.y);
  await p.waitForTimeout(150);
  await p.locator('[data-unit="tut-rook"]').click();
  await clickCell(p, { x: 2, y: 2 });
  await p.locator('#btn-undo').click();
  await p.locator('[data-unit="tut-rook"]').click();
  await clickCell(p, { x: 2, y: 2 });
  await p.locator('[data-unit="tut-spear"]').click();
  await clickCell(p, { x: 6, y: 3 });
  await endTurn(p);
  A.equal(await p.locator('#ov-tutorial').isVisible(), true, '教学完成提示出现');
  await p.locator('#tutorial-done-ok').click();
  await waitView(p, 'camp');
}
const pawns = s => s.units.filter(u => u.side === 'player' && u.kind === 'pawn');
const crossedPawns = s => pawns(s).filter(u => R.pawnCrossed(u));

(async () => {
  try {
    const started = await startServer(path.join(__dirname, '../web'));
    server = started.server;
    report.base = 'http://127.0.0.1:' + started.port;
    for (const f of FILES) if (fs.existsSync(f)) report.versions[f] = hash(f);
    browser = await pw.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(45000);
    p.on('pageerror', e => report.pageErrors.push(e.message));
    await p.goto(report.base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view !== 'loading', null, { timeout: 60000 });

    /* ---------- N01 正常入口：教学 → 营地 → 第一关布阵 ---------- */
    await runTutorial(p);
    if (await p.locator('#camp-guide').isVisible()) { await p.locator('#camp-guide-close').click(); await p.waitForTimeout(80); }
    await p.locator('#camp-leave').click();
    await waitView(p, 'map');
    await p.locator('#flow-enter').click();
    await waitView(p, 'battle');
    const deploy = await st(p);
    A.equal(deploy.phase, 'deploy', '进入第一关布阵');
    const deployShot = await shotBoard(p, 'n01-deploy.png');
    await p.locator('#btn-deploy-confirm').click();
    await p.waitForTimeout(250);
    const opened = await st(p);
    A.equal(opened.phase, 'player', '确认布阵后进入我方行动');
    const myPawns = pawns(opened);
    A.equal(myPawns.length, 2, '新旅程上阵两个普通兵');
    const bridgePawn = myPawns.find(u => [1, 4, 7].includes(u.x));
    A.ok(bridgePawn, '至少一名兵位于桥列（第 2/5/8 列），可正面跨河');
    ok('N01', '正常浏览器（正常入口）', `菜单→首次教学完整 7 步→主营地→选关地图→确认进入第一关→布阵（兵 ${myPawns.map(u => fmt(u)).join('、')}）→确认开战进入我方行动。`, deployShot);

    /* ---------- N02 未过河：身后与左侧被拒绝，且不消耗行动 ---------- */
    const s1 = await st(p);
    const base1 = G(s1, bridgePawn.id);
    await selectOnBoard(p, base1);
    const cardBefore = await card(p);
    const cardShot = await shotBoard(p, 'n02-uncrossed-card.png');
    await clickCell(p, { x: base1.x, y: base1.y - 1 });
    const backState = await st(p);
    const backReason = await banner(p);
    const blockedShot = await shotBoard(p, 'n02-uncrossed-back-blocked.png');
    A.deepEqual([G(backState, bridgePawn.id).x, G(backState, bridgePawn.id).y], [base1.x, base1.y], '未过河点身后空格：棋子不动');
    A.equal(G(backState, bridgePawn.id).ap, 1, '被拒绝的后退不消耗 AP');
    await selectOnBoard(p, G(backState, bridgePawn.id));
    await clickCell(p, { x: base1.x - 1, y: base1.y });
    const sideState = await st(p);
    A.deepEqual([G(sideState, bridgePawn.id).x, G(sideState, bridgePawn.id).y], [base1.x, base1.y], '未过河点左侧空格：棋子不动');
    A.ok(/未过河只能向前/.test(backReason), '拒绝理由说明未过河限制');
    A.ok(/未过河：仅向前/.test(cardBefore), '选中卡提示未过河只能向前');
    ok('N02', '正常浏览器（正常入口）', `兵 ${fmt(base1)} 未过河：点身后 ${fmt({ x: base1.x, y: base1.y - 1 })} 与左侧 ${fmt({ x: base1.x - 1, y: base1.y })} 均未移动、AP 仍 1；拒绝理由「${backReason}」；选中卡「${cardBefore}」。`, cardShot + ',' + blockedShot);

    /* ---------- N03 逐回合真实点击跨河 ---------- */
    const march = [];
    async function marchOneTurn() {
      const before = await st(p);
      if (before.phase !== 'player') return;
      const list = pawns(before).filter(u => !R.pawnCrossed(u) && [1, 4, 7].includes(u.x));
      for (const u of list) {
        const now = await st(p);
        const live = G(now, u.id);
        if (!live || live.ap <= 0) continue;
        const to = { x: live.x, y: live.y + 1 };
        const occupied = !!R.at(now, to);
        await selectOnBoard(p, live);
        await clickCell(p, to);
        const post = await st(p);
        const me = G(post, live.id);
        march.push({ turn: now.turn, id: live.id, from: { x: live.x, y: live.y }, to, occupied, moved: !!me && me.x === to.x && me.y === to.y, kills: post.kills });
      }
    }
    for (let turns = 0; turns < 9; turns++) {
      const before = await st(p);
      if (before.phase !== 'player') break;
      await marchOneTurn();
      if (crossedPawns(await st(p)).length) break;
      await endTurn(p);
    }
    const s3 = await st(p);
    const crossed = crossedPawns(s3);
    const marchShot = await shotBoard(p, 'n03-crossed.png');
    A.ok(crossed.length >= 1, '正常点击把兵推进到敌方半区（第 6 行及以后）');
    ok('N03', '正常浏览器（正常入口）', `逐回合真实点击跨河：${march.map(m => `第${m.turn}回合 ${m.id} ${fmt(m.from)}→${fmt(m.to)}${m.occupied ? '（占格为敌，按规则结算攻击）' : ''}${m.moved ? '移动成功' : '未移动'}`).join('；')}。过河后的兵：${crossed.map(u => fmt(u)).join('、')}。`, marchShot);

    /* ---------- N04 后退（核心改动）：跨河后下一个回合先在桥列纵向回退 ---------- */
    async function attemptDirection(kind, beforeShotName) {
      const s = await st(p);
      if (s.phase !== 'player') return { stop: 'phase ' + s.phase + ' result ' + s.result + ' turn ' + s.turn };
      const cands = [];
      for (const u of crossedPawns(s)) {
        if (u.ap <= 0) continue;
        const cells = kind === 'side' ? [{ x: u.x + 1, y: u.y }, { x: u.x - 1, y: u.y }] : [{ x: u.x, y: u.y - 1 }];
        for (const q of cells) if (R.inside(q) && !R.occupied(s, q) && !R.isWater(q, s)) cands.push({ u, q });
      }
      if (!cands.length) return { stop: 'no-candidate', turn: s.turn, crossed: crossedPawns(s).map(u => `${u.id}@${u.x},${u.y} ap${u.ap}`) };
      const { u, q } = cands[0];
      await selectOnBoard(p, u);
      const cardText = await card(p);
      const mobileText = await mobileCard(p);
      const preShot = beforeShotName ? await shotBoard(p, beforeShotName) : null;
      await clickCell(p, q);
      const post = await st(p);
      const me = G(post, u.id);
      return { ok: !!me && me.x === q.x && me.y === q.y, id: u.id, from: { x: u.x, y: u.y }, to: q, at: me ? { x: me.x, y: me.y } : null, card: cardText, mobile: mobileText, preShot, apBefore: u.ap, apAfter: me ? me.ap : null, postCard: await card(p) };
    }
    await endTurn(p);
    const back = await attemptDirection('back', 'n04-crossed-card.png');
    A.ok(back.ok, '过河后纵向后退成功：' + JSON.stringify(back.stop ? back : { from: back.from, to: back.to, at: back.at }));
    A.ok(/已进敌方半区：前后左右/.test(back.card || ''), `过河选中卡显示四向走法：${back.card}`);
    A.ok(/已过河：前后左右/.test(back.mobile || ''), '手机卡片同步显示已过河四向走法');
    const crossedShot = back.preShot;
    const backwardShot = await shotBoard(p, 'n04-backward-moved.png');
    A.equal(back.apAfter, 0, '后退消耗 1 AP');
    A.ok(!/已进敌方半区/.test(back.postCard || ''), '退回河道后卡片恢复未过河提示');
    ok('N04', '正常浏览器（正常入口）', `过河兵 ${back.id} 在 ${fmt(back.from)} 选中卡「${back.card}」（手机卡片「已过河：前后左右」）→ 点身后空格 ${fmt(back.to)} → 实际后退到 ${fmt(back.at)}（AP ${back.apBefore}→${back.apAfter}）；退回河道后卡片「${back.postCard}」。`, crossedShot + ',' + backwardShot);

    /* ---------- N05 横走：另一枚兵跨河后横向一步 ---------- */
    await marchOneTurn();
    await endTurn(p);
    let side = await attemptDirection('side');
    if (!side.ok) { await endTurn(p); side = await attemptDirection('side'); }
    A.ok(side.ok, '过河后横向移动成功：' + JSON.stringify(side.stop ? side : { from: side.from, to: side.to, at: side.at }));
    const sideShot = await shotBoard(p, 'n05-sideways.png');
    ok('N05', '正常浏览器（正常入口）', `过河兵 ${side.id} 在 ${fmt(side.from)} 点横向空格 ${fmt(side.to)} → 移动到 ${fmt(side.at)}（AP ${side.apBefore}→${side.apAfter}）。与 N04 的后退合起来，进入敌方半区后前、后、左、右均可移动。`, sideShot);
    const targetId = side.id;

    /* ---------- N06 规则面板文案 ---------- */
    await step('N06', '正常浏览器（页面静态文案）', async () => {
      const rulesText = await p.evaluate(() => { const d = document.querySelector('.optional-mobile'); return d ? d.textContent : ''; });
      A.ok(/进入敌方半区后可前后左右一步/.test(rulesText), '规则面板列出兵系四向走法');
      return '页面「规则与夹具」面板出现「兵（含转职弓/枪）未过河只能向前一步，进入敌方半区后可前后左右一步」。';
    });

    /* ---------- N07 手机横版卡片 ---------- */
    await step('N07', '正常浏览器（手机横版 844×390）', async () => {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(450);
      const s7 = await st(p);
      const mob = G(s7, targetId) || pawns(s7)[0];
      await clickCell(p, { x: mob.x, y: mob.y });
      const mobileNow = await mobileCard(p);
      const mobileShot = await shot(p, 'n07-mobile-844x390.png');
      A.ok(/前后左右|仅向前/.test(mobileNow), '手机卡片显示兵系方向提示');
      await p.setViewportSize({ width: 1400, height: 900 });
      return `横版点选兵 ${fmt(mob)}，手机卡片「${mobileNow}」（已过河显示「前后左右」，未过河显示「仅向前」）。证据 ${mobileShot}`;
    });
    await ctx.close();

    /* ---------- F01 专项：转职弓/枪继承四向走法 ---------- */
    await step('F01', '专项（应用续局入口摆放夹具）', async () => {
      const fix = R.newGame();
      fix.phase = 'player';
      fix.units = [R.unit('king', 'player', 'king', 4, 0), R.unit('fix-spear', 'player', 'spearman', 4, 5), R.unit('fix-archer', 'player', 'archer', 1, 5), R.unit('boss', 'enemy', 'king', 4, 8)];
      fix.party = []; fix.activeIds = []; fix.bench = []; fix.corpses = []; fix.intents = [];
      fix.units.forEach(R.resetTurn);
      const save = JSON.stringify({
        version: 1, player: { tutorialCompleted: true, campGuideSeen: true },
        journey: R.journeyRecord(fix),
        battle: { version: 1, state: fix, savedAt: new Date().toISOString(), reason: 'US-023 专项夹具：转职弓/枪位于敌方半区' },
      });
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await ctx2.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
      const p2 = await ctx2.newPage();
      p2.setDefaultTimeout(45000);
      p2.on('pageerror', e => report.pageErrors.push(e.message));
      await p2.goto(report.base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p2.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'battle', null, { timeout: 60000 });
      await p2.waitForFunction(() => window.__M0_DEBUG__ && window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 30000 });
      const fixShot = await shotBoard(p2, 'f01-fixture.png');
      const results = [];
      for (const id of ['fix-spear', 'fix-archer']) {
        const s = await st(p2);
        const u = G(s, id);
        A.ok(u, id + ' 在场上');
        await selectOnBoard(p2, u);
        const text = await card(p2);
        A.ok(/已进敌方半区：前后左右/.test(text), id + ' 选中卡显示四向走法');
        const to = { x: u.x, y: u.y - 1 };
        await clickCell(p2, to);
        const post = await st(p2);
        const me = G(post, id);
        A.deepEqual([me.x, me.y], [to.x, to.y], id + ' 过河后退一格成功');
        results.push({ id, kind: me.kind, from: { x: u.x, y: u.y }, to: { x: me.x, y: me.y }, card: text });
      }
      const fixBackShot = await shotBoard(p2, 'f01-promoted-backward.png');
      await ctx2.close();
      return `${results.map(r => `${r.kind} ${fmt(r.from)}→${fmt(r.to)}（卡片「${r.card}」）`).join('；')}：转职弓兵与枪兵在敌方半区同样可后退，未过河时仍只向前（规则层 A03 覆盖）。证据 ${fixShot},${fixBackShot}`;
    });

    report.finishedAt = new Date().toISOString();
    report.turnLog = turnLog;
    for (const f of FILES) if (fs.existsSync(f)) report.versionsEnd[f] = hash(f);
    report.hashMatch = Object.keys(report.versions).every(f => report.versions[f] === report.versionsEnd[f]);
    report.failed = failed;
    report.march = march;
    fs.writeFileSync(path.join(dir, 'us023-result.json'), JSON.stringify(report, null, 2));
    console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} · ${report.steps.length} 项 · 页面错误 ${report.pageErrors.length} · 版本哈希一致 ${report.hashMatch}`);
    if (report.pageErrors.length) console.log('pageErrors:', report.pageErrors);
    process.exitCode = failed || report.pageErrors.length || !report.hashMatch ? 1 : 0;
  } catch (e) {
    console.error('RUN ERROR', e);
    report.turnLog = turnLog;
    fs.writeFileSync(path.join(dir, 'us023-result.json'), JSON.stringify(Object.assign(report, { runError: String(e && e.stack || e) }), null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => { });
    if (server) await new Promise(r => server.close(r));
  }
})();
