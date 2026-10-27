// US-024 真实浏览器验收：取消兵/弓/枪连动（额外行动），每回合固定 1 AP。
// 主验收 P06/P02 走正常入口：菜单→真实教学→主营地→选关→第一关布阵→确认开战→真实点击攻击/移动/撤销/结束回合。
// P04 的弓兵/枪兵在主营地、布阵、战斗面板使用应用自身续局入口摆放专项夹具，结果中明确标注，不冒充正常流程。
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { startServer } = require('./us011-static-server.cjs');
const R = require('../web/js/rules.js');
const dir = path.resolve(process.env.US024_EVIDENCE_DIR || 'docs/us/us024-evidence');
fs.mkdirSync(dir, { recursive: true });
const FILES = ['web/index.html', 'web/js/rules.js', 'web/js/app.js', 'tests/us024-pawn-fixed-action.test.cjs', 'tests/us024-pawn-acceptance-browser.cjs'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report = {
  scope: 'US-024：兵/弓/枪取消连动（额外行动）升级，每回合固定 1 次行动；旧存档不迁移',
  startedAt: new Date().toISOString(), base: null, steps: [], pageErrors: [], versions: {}, versionsEnd: {},
  versionsNote: 'versions 为开始时的文件 SHA-256，versionsEnd 为结束时的同一批文件；一致才说明证据对应实际交付版本',
};
let failed = 0, browser, server, p04Texts = {};
const ok = (id, kind, detail, evidence) => { report.steps.push({ id, kind, pass: true, detail, evidence: evidence || null }); console.log('PASS ' + id + ' · ' + detail); };
const bad = (id, kind, detail, err) => { failed++; report.steps.push({ id, kind, pass: false, detail, error: String(err && err.stack || err) }); console.log('FAIL ' + id + ' · ' + detail + ' · ' + (err && err.message || err)); };
async function step(id, kind, fn) { try { const d = await fn(); ok(id, kind, d); } catch (e) { bad(id, kind, '执行失败', e); } }
const st = p => p.evaluate(() => window.__M0_DEBUG__.getState());
const G = (s, id) => s.units.find(u => u.id === id);
const fmt = p => '（' + (p.x + 1) + ',' + (p.y + 1) + '）';
const snap = async (p, name, locator) => {
  const target = locator ? p.locator(locator) : p;
  if (locator) await target.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(120);
  await target.screenshot({ path: path.join(dir, name) });
  return name;
};
async function shotBoard(p, name) {
  const box = await p.evaluate(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, Math.min(r.width, window.innerWidth)), height: Math.max(1, Math.min(r.height, window.innerHeight)) }; });
  await p.screenshot({ path: path.join(dir, name), clip: box });
  return name;
}
async function waitView(p, v) { await p.waitForFunction(v => window.M0Campaign && window.M0Campaign.info().view === v, v, { timeout: 30000 }); }
async function clickCell(p, to) {
  const xy = await p.evaluate(t => window.__M0_DEBUG__.grid.screenPoint(t), to);
  await p.mouse.click(xy.x, xy.y);
  await p.waitForTimeout(220);
  return xy;
}
async function banner(p) { return (await p.evaluate(() => document.getElementById('banner').textContent || '')).trim(); }
async function card(p) { return (await p.evaluate(() => document.getElementById('selected-card').textContent || '')).replace(/\s+/g, ' '); }
async function skillText(p) { return (await p.evaluate(() => document.getElementById('skills').textContent || '')).replace(/\s+/g, ' ').trim(); }
async function campSkillText(p) { return (await p.evaluate(() => document.getElementById('camp-skills').textContent || '')).replace(/\s+/g, ' ').trim(); }
async function openSkills(p) { await p.locator('.upgrade-section').evaluate(el => { el.open = true; }); await p.waitForTimeout(100); }
async function selectUnit(p, id) { await p.locator(`#ally-list [data-unit="${id}"]`).click(); await p.waitForTimeout(160); }
async function selectDeploy(p, id) { await p.locator(`#deploy-roster [data-deploy="${id}"]`).click(); await p.waitForTimeout(160); }
async function endTurn(p) {
  await p.locator('#btn-end').click({ timeout: 8000 });
  await p.locator('#btn-confirm-yes').click({ timeout: 8000 });
  await p.waitForTimeout(350);
  return st(p);
}
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

    /* ---------- 正常入口：教学 → 主营地 → 第一关布阵 ---------- */
    await runTutorial(p);
    if (await p.locator('#camp-guide').isVisible()) { await p.locator('#camp-guide-close').click(); await p.waitForTimeout(100); }
    await p.locator('.camp-skills').scrollIntoViewIfNeeded();
    const campText = await campSkillText(p);
    A.ok(!/连动/.test(campText), '正常旅程主营地技能列表无连动');
    A.ok(/强健/.test(campText) && /转职弓兵/.test(campText) && /转职枪兵/.test(campText), '正常旅程普通兵的强健/转职入口仍在');
    const campShot = await snap(p, 'p06-camp-skills.png', '#camp-skills');
    ok('P06-camp', '正常浏览器（正常入口）', `新旅程主营地：普通兵技能列表「${campText}」。无「连动/行动次数升级」，强健与转职弓/枪保留。`, campShot);

    await p.locator('#camp-leave').click();
    await waitView(p, 'map');
    await p.locator('#flow-enter').click();
    await waitView(p, 'battle');
    const deploy = await st(p);
    A.equal(deploy.phase, 'deploy', '进入第一关布阵');
    await openSkills(p);
    const dp = pawns(deploy)[0];
    await selectDeploy(p, dp.id);
    const deployText = await skillText(p);
    A.ok(!/连动/.test(deployText), '布阵期普通兵技能面板无连动');
    A.ok(/转职弓兵/.test(deployText) && /转职枪兵/.test(deployText), '布阵期转职入口仍在');
    const deployShot = await snap(p, 'p06-deploy-skills.png', '#skills');
    ok('P06-deploy', '正常浏览器（正常入口）', `第一关布阵选中普通兵 ${dp.id}：技能面板「${deployText}」。无连动，转职入口保留。`, deployShot);

    await p.locator('#btn-deploy-confirm').click();
    await p.waitForTimeout(300);
    const opened = await st(p);
    A.equal(opened.phase, 'player', '确认布阵后进入我方行动');
    const myPawns = pawns(opened);
    A.equal(myPawns.length, 2, '新旅程上阵两个普通兵');
    await openSkills(p);
    await selectUnit(p, myPawns[0].id);
    const battleText = await skillText(p);
    A.ok(!/连动/.test(battleText), '战斗技能面板无连动');
    A.ok(/转职弓兵/.test(battleText) && /转职枪兵/.test(battleText), '战斗技能面板转职入口仍在');
    const battleShot = await snap(p, 'p06-battle-skills.png', '#skills');

    /* ---------- P06 回合1：两枚兵各攻击正前方桥面敌兵 ---------- */
    const attacks = [];
    for (const base of myPawns) {
      const s = await st(p);
      if (s.phase !== 'player') break;
      const u = G(s, base.id);
      if (!u || u.ap <= 0) continue;
      const fwd = { x: u.x, y: u.y + 1 };
      const t = R.at(s, fwd);
      if (!t || t.side !== 'enemy') continue;
      await selectUnit(p, u.id);
      const pre = await card(p);
      A.ok(/AP 1\/1/.test(pre), '攻击前选中卡显示 AP 1/1：' + pre);
      await clickCell(p, fwd);
      const post = await st(p);
      const me = G(post, u.id);
      const dead = !G(post, t.id);
      attacks.push({ id: u.id, from: { x: u.x, y: u.y }, to: fwd, target: t.id, targetKind: t.kind, dead, ap: me ? me.ap : null });
      A.ok(dead || G(post, t.id).hp < t.hp, `${u.id} 正前方攻击命中 ${t.id}`);
      A.deepEqual([me.ap, me.apLimit], [0, 1], `${u.id} 攻击后 AP 0/1`);
      const shot = await shotBoard(p, 'p06-attack-' + u.id + '.png');
      attacks[attacks.length - 1].shot = shot;
      // 同一棋子再点正前方空格/后续格：应因本回合已行动被拒绝，状态不变
      await clickCell(p, { x: u.x, y: u.y + 1 });
      const again = await st(p);
      const reason = await banner(p);
      A.deepEqual([G(again, u.id).x, G(again, u.id).y, G(again, u.id).ap], [u.x, u.y, 0], `${u.id} 攻击后第二次行动未执行`);
      A.ok(/本回合已行动/.test(reason), `${u.id} 第二次行动被拒绝并说明原因：${reason}`);
      attacks[attacks.length - 1].reason = reason;
      attacks[attacks.length - 1].apAfterRetry = G(again, u.id).ap;
    }
    A.ok(attacks.length >= 1, '正常流程至少完成一次实际攻击');
    report.normalAttacks = attacks;
    if (attacks.length) ok('P06-attack', '正常浏览器（正常入口）', `${attacks.map(a => `${a.id} ${fmt(a.from)}→${fmt(a.to)} 攻击 ${a.targetKind} ${a.target}（${a.dead ? '击杀' : '命中'}），AP ${a.ap}/1；再点正前方被拒绝「${a.reason}」`).join('；')}。`, attacks.map(a => a.shot).join(','));

    /* ---------- 回合2：真实移动 → 第二次行动被拒 → 撤销恢复 AP → 再次移动 ---------- */
    const afterTurn1 = await endTurn(p);
    A.equal(afterTurn1.phase, 'player', '第 1 回合结束回到我方行动');
    const movePawn = pawns(afterTurn1).find(u => u.ap === 1 && !R.at(afterTurn1, { x: u.x, y: u.y + 1 }));
    A.ok(movePawn, '第 2 回合有可向前移动的普通兵');
    await selectUnit(p, movePawn.id);
    const moveCard = await card(p);
    A.ok(/AP 1\/1/.test(moveCard), '移动前选中卡 AP 1/1');
    const from = { x: movePawn.x, y: movePawn.y }, to = { x: movePawn.x, y: movePawn.y + 1 };
    await clickCell(p, to);
    const moved = await st(p);
    A.deepEqual([G(moved, movePawn.id).x, G(moved, movePawn.id).y, G(moved, movePawn.id).ap], [to.x, to.y, 0], '首次移动成功并消耗 AP');
    const movedShot = await shotBoard(p, 'p06-move.png');
    await clickCell(p, { x: to.x, y: to.y + 1 });
    const blocked = await st(p);
    const blockReason = await banner(p);
    A.deepEqual([G(blocked, movePawn.id).x, G(blocked, movePawn.id).y], [to.x, to.y], '移动后第二次行动未执行');
    A.ok(/本回合已行动/.test(blockReason), '移动后第二次行动被拒绝：' + blockReason);
    const blockedShot = await shotBoard(p, 'p06-move-second-blocked.png');
    await p.locator('#btn-undo').click();
    await p.waitForTimeout(250);
    const undone = await st(p);
    A.deepEqual([G(undone, movePawn.id).x, G(undone, movePawn.id).y, G(undone, movePawn.id).ap], [from.x, from.y, 1], '撤销移动恢复位置与 1 AP（既有规则）');
    const undoShot = await shotBoard(p, 'p06-undo-restored.png');
    await clickCell(p, to);
    const movedAgain = await st(p);
    A.deepEqual([G(movedAgain, movePawn.id).x, G(movedAgain, movePawn.id).y, G(movedAgain, movePawn.id).ap], [to.x, to.y, 0], '撤销后可再次合法移动，仍只消耗 1 AP');
    const finalShot = await shotBoard(p, 'p06-move-again.png');
    ok('P02/P06-move', '正常浏览器（正常入口）', `第 2 回合普通兵 ${movePawn.id} ${fmt(from)}→${fmt(to)} 移动成功 AP 1→0；再点 ${fmt({ x: to.x, y: to.y + 1 })} 被拒绝「${blockReason}」、棋子不动；点「撤销移动」回到 ${fmt(from)} 且 AP 恢复 1；再次移动成功仍为 0/1。`, [movedShot, blockedShot, undoShot, finalShot].join(','));

    const afterTurn2 = await endTurn(p);
    const livePawn = pawns(afterTurn2).find(u => u.id === movePawn.id);
    A.ok(livePawn, '移动的普通兵在敌方阶段后仍存活');
    A.deepEqual([livePawn.ap, livePawn.apLimit], [1, 1], '第 3 回合开始恢复固定 1/1，未因移动/撤销叠加');
    const nextShot = await shotBoard(p, 'p06-next-turn-ap.png');
    ok('P06-next-turn', '正常浏览器（正常入口）', `第 ${afterTurn2.turn} 回合开始，${movePawn.id} 行动预算恢复为 ${livePawn.ap}/${livePawn.apLimit}（固定 1）。`, nextShot);
    await ctx.close();

    /* ---------- P04 专项：主营地三种兵技能候选 ---------- */
    await step('P04-camp-fixture', '专项（应用续局入口摆放夹具）', async () => {
      const fix = R.newGame();
      fix.phase = 'intermission'; fix.teamSp = 10; fix.gold = 10;
      fix.party = [R.unit('fix-pawn', 'player', 'pawn', 1, 3), R.unit('fix-archer', 'player', 'archer', 4, 3), R.unit('fix-spear', 'player', 'spearman', 7, 3)];
      fix.activeIds = fix.party.map(u => u.id); fix.bench = []; fix.units = []; fix.corpses = []; fix.intents = [];
      const save = JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: R.journeyRecord(fix) });
      const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      await ctx2.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
      const p2 = await ctx2.newPage(); p2.setDefaultTimeout(45000);
      p2.on('pageerror', e => report.pageErrors.push(e.message));
      await p2.goto(report.base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p2.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'camp', null, { timeout: 60000 });
      if (await p2.locator('#camp-guide').isVisible()) { await p2.locator('#camp-guide-close').click(); await p2.waitForTimeout(100); }
      await p2.locator('.camp-skills').scrollIntoViewIfNeeded();
      const text = await campSkillText(p2);
      A.ok(!/连动|行动次数/.test(text), '专项营地三种兵无连动/行动次数升级');
      for (const [id, label] of [['fix-pawn', '普通兵'], ['fix-archer', '弓兵'], ['fix-spear', '枪兵']]) {
        const block = await p2.locator('.skill-unit', { hasText: id }).textContent();
        A.ok(!/连动/.test(block), id + ' 无连动');
        if (id === 'fix-pawn') A.ok(/转职弓兵/.test(block) && /转职枪兵/.test(block), '普通兵转职候选仍在');
        else A.ok(/前向 Lv/.test(block) && /后向 Lv/.test(block), label + ' 四向强化候选仍在');
        A.ok(/强健/.test(block), label + ' 强健候选仍在');
      }
      const shot = await snap(p2, 'p04-camp-three-kinds.png', '#camp-skills');
      // 真实点击一次合法升级，确认其他技能仍可使用且只扣公共 SP
      const spBefore = (await p2.evaluate(() => window.M0Campaign.info())).teamSp;
      await p2.locator('.skill-unit', { hasText: 'fix-pawn' }).locator('[data-skill="fortify"]').click();
      await p2.waitForTimeout(250);
      const spAfter = (await p2.evaluate(() => window.M0Campaign.info())).teamSp;
      A.equal(spAfter, spBefore - 1, '营地点击强健成功并只扣 1 公共 SP');
      await ctx2.close();
      return `专项营地夹具：普通兵/弓兵/枪兵技能列表均无连动；普通兵保留转职弓/枪，弓/枪保留四向强化，三者均保留强健。真实点击普通兵「强健」后公共 SP ${spBefore}→${spAfter}。证据 ${shot}`;
    });

    /* ---------- P04 专项：布阵与战斗三种兵技能面板 ---------- */
    await step('P04-deploy-battle-fixture', '专项（应用续局入口摆放夹具）', async () => {
      const fix = R.newGame();
      fix.phase = 'deploy'; fix.teamSp = 10; fix.gold = 0; fix.turn = 1; fix.wave = 1;
      fix.units = [R.unit('king', 'player', 'king', 4, 0), R.unit('fix-pawn', 'player', 'pawn', 1, 3), R.unit('fix-archer', 'player', 'archer', 4, 3), R.unit('fix-spear', 'player', 'spearman', 7, 3), R.unit('boss', 'enemy', 'king', 4, 8)];
      fix.party = [R.unit('fix-pawn', 'player', 'pawn', 1, 3), R.unit('fix-archer', 'player', 'archer', 4, 3), R.unit('fix-spear', 'player', 'spearman', 7, 3)];
      fix.activeIds = fix.party.map(u => u.id); fix.bench = []; fix.corpses = []; fix.intents = []; fix.pendingAdvisorIds = [];
      const save = JSON.stringify({ version: 1, player: { tutorialCompleted: true, campGuideSeen: true }, journey: R.journeyRecord(fix), battle: { version: 1, state: fix, savedAt: new Date().toISOString(), reason: 'US-024 专项夹具：三种兵布阵/战斗技能面板' } });
      const ctx3 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      await ctx3.addInitScript(`try{localStorage.setItem('m0-journey-v1',${JSON.stringify(save)});}catch(e){}`);
      const p3 = await ctx3.newPage(); p3.setDefaultTimeout(45000);
      p3.on('pageerror', e => report.pageErrors.push(e.message));
      await p3.goto(report.base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p3.waitForFunction(() => window.M0Campaign && window.M0Campaign.info().view === 'battle' && window.__M0_DEBUG__.getState().phase === 'deploy', null, { timeout: 60000 });
      await openSkills(p3);
      for (const id of ['fix-pawn', 'fix-archer', 'fix-spear']) {
        await selectDeploy(p3, id);
        const text = await skillText(p3);
        (p04Texts[id] = p04Texts[id] || {}).deploy = text;
        A.ok(!/连动/.test(text), id + ' 布阵面板无连动');
        if (id === 'fix-pawn') A.ok(/转职弓兵/.test(text) && /转职枪兵/.test(text), '布阵普通兵转职候选仍在');
        else A.ok(/前向 Lv/.test(text) && /后向 Lv/.test(text), id + ' 布阵四向强化候选仍在');
        await snap(p3, 'p04-deploy-' + id + '.png', '#skills');
      }
      const deployShot = await shotBoard(p3, 'p04-deploy-board.png');
      await p3.locator('#btn-deploy-confirm').click();
      await p3.waitForTimeout(350);
      A.equal((await st(p3)).phase, 'player', '专项夹具确认布阵后进入战斗');
      await openSkills(p3);
      for (const id of ['fix-pawn', 'fix-archer', 'fix-spear']) {
        await selectUnit(p3, id);
        const text = await skillText(p3);
        (p04Texts[id] = p04Texts[id] || {}).battle = text;
        A.ok(!/连动/.test(text), id + ' 战斗面板无连动');
        if (id === 'fix-pawn') A.ok(/转职弓兵/.test(text) && /转职枪兵/.test(text), '战斗普通兵转职候选仍在');
        else A.ok(/前向 Lv/.test(text) && /后向 Lv/.test(text), id + ' 战斗四向强化候选仍在');
        await snap(p3, 'p04-battle-' + id + '.png', '#skills');
      }
      const battleShot = await shotBoard(p3, 'p04-battle-board.png');
      await ctx3.close();
      return `专项夹具：布阵与战斗分别选中普通兵/弓兵/枪兵，三个面板均无「连动」；普通兵转职、弓/枪四向强化均保留。面板全文已写入 report.p04Texts。证据 ${deployShot},${battleShot} 及 p04-deploy-*.png、p04-battle-*.png`;
    });

    report.finishedAt = new Date().toISOString();
    for (const f of FILES) if (fs.existsSync(f)) report.versionsEnd[f] = hash(f);
    report.hashMatch = Object.keys(report.versions).every(f => report.versions[f] === report.versionsEnd[f]);
    report.failed = failed;
    report.p04Texts = p04Texts;
    fs.writeFileSync(path.join(dir, 'us024-result.json'), JSON.stringify(report, null, 2));
    console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} · ${report.steps.length} 项 · 页面错误 ${report.pageErrors.length} · 版本哈希一致 ${report.hashMatch}`);
    if (report.pageErrors.length) console.log('pageErrors:', report.pageErrors);
    process.exitCode = failed || report.pageErrors.length || !report.hashMatch ? 1 : 0;
  } catch (e) {
    console.error('RUN ERROR', e);
    fs.writeFileSync(path.join(dir, 'us024-result.json'), JSON.stringify(Object.assign(report, { runError: String(e && e.stack || e) }), null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => { });
    if (server) await new Promise(r => server.close(r));
  }
})();
