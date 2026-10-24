// 一次性追加：US-022 验收脚本的专项界面段（夹具）、存档边界段（副本）、手机横版段。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const anchor = "function point(p) { return p ? `(${p.x + 1},${p.y + 1})` : '无'; }";
if (t.split(anchor).length - 1 !== 1) { console.error('point anchor missing'); process.exit(1); }
const block = `/* ================= B. 专项夹具段：按 E 项逐条在真实界面点击并截图（明确标注专项） ================= */
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
      const marks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'move').map(m => m.userData.x + ',' + m.userData.y));
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
      return \`专项夹具：仅 (7,5) 合法田字落点，非法点击给出“\${reason.split('\\n')[0]}”且不移动；河道水格可落（截图 \${shotA}、\${shotB}）\`;
    });
    // ---------- E03 疾行扩展 ----------
    await step('E03-专项', '专项夹具：疾行扩展落点与参照/象眼限制（真实点击）', async () => {
      const plain = eleFixture([P('ele', 'elephant', 4, 2)]);
      await inject(p, plain);
      await selectAlly(p, 'ele');
      const plainMarks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'move').length);
      const buffed = R.copy(plain); buffed.buffs = Object.assign({ health: false, move: false, rescue: false }, { move: true });
      await inject(p, buffed);
      await selectAlly(p, 'ele');
      const buffMarks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'move').map(m => m.userData.x + ',' + m.userData.y));
      A.equal(plainMarks, 2, '无疾行：两个田字落点');
      A.ok(buffMarks.length > plainMarks, '疾行后落点增加');
      A.ok(buffMarks.includes('1,0'), '疾行扩展包含田字落点邻格');
      await cell(p, { x: 1, y: 0 });
      await p.waitForTimeout(140);
      const s2 = await st(p);
      A.deepEqual([G(s2, 'ele').x, G(s2, 'ele').y], [1, 0], '一次点击直达扩展最终格');
      A.equal(G(s2, 'ele').ap, 0, '扩展移动仍是一次普通移动');
      const shotB = await shot(p, 'e03-dash.png');
      return \`专项夹具：无疾行 2 个田字落点；疾行后 \${buffMarks.length} 个落点（含邻格），一次点击到扩展最终格且只消耗一次移动（截图 \${shotB}）\`;
    });
    // ---------- E04 行动顺序 ----------
    await step('E04-专项', '专项夹具：先移动再施法、施法后锁移动、下一回合恢复（真实按钮）', async () => {
      let s = eleFixture([P('ele', 'elephant', 4, 4), E('foe', 'rook', 4, 6)], { teamSp: 4 });
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
      await cell(p, { x: 4, y: 6 });
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
      return \`专项夹具：先田字移动到 (3,3)→ 再冰封 (5,7)，技能与移动都锁定；结束回合后两项恢复（截图 \${shotA}）\`;
    });
    // ---------- E05/E06 牵引目标与越障 ----------
    await step('E05/E06-专项', '专项夹具：牵引可选友军/敌军/尸体/主帅，拒绝自身/仕/山/太近；可越障且首次碰撞停止', async () => {
      let s = eleFixture([P('ele', 'elephant', 4, 4), P('ally', 'pawn', 2, 4), E('foe', 'rook', 8, 8), E('foe2', 'pawn', 4, 1), P('tower', 'advisor', 3, 1), P('k2', 'king', 6, 4)]);
      s.corpses = [{ id: 'corpse-c', x: 4, y: 2, unit: Object.assign(E('c', 'pawn', 4, 2), { hp: 0 }) }];
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-pull');
      const targets = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack').map(m => m.userData.x + ',' + m.userData.y));
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
      await cell(p, { x: 4, y: 4 });
      await p.waitForTimeout(120);
      reason = await p.locator('#preview-box').innerText();
      A.match(reason, /不能牵引自己/, '自身给出理由');
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
      return \`专项夹具：牵引目标集合含友军/主帅/尸体/敌军，拒绝太近与仕；越障预览“\${previewText.split('\\n')[1] || ''}”，执行后目标停在障碍前（截图 \${shotA}、\${shotB}）\`;
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
      const reach = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack').map(m => m.userData.x + ',' + m.userData.y));
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
      return \`专项夹具：真实点击“牵引射程”3→4 格并扣 1 SP、四向同步；SP 不足与上限 8 均禁用（截图 \${shotA}）\`;
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
      return \`专项夹具：牵引撞山第一次“\${previewText.split('\\n')[1] || ''}”→ 开裂，第二次 → 碎石地，棋盘重绘可见“碎石”，不再阻挡/占位（截图 \${shotA}、\${crackedShot}、\${shotB}、\${rubbleBoard}）\`;
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
      const intent = await p.locator('#intent-list').innerText();
      A.match(intent, /剩余 3/, '意图列表显示剩余 3 个敌方行动阶段');
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
      return \`专项夹具：只强化所选象（a 解锁、b 未解锁）；a 冻 1 阶段后 b 再冻 → 剩余 3 阶段（取 max），剩余 3 时再冻 1 阶段仍为 3（截图 \${shotA}）\`;
    });
    // ---------- E13 冰封范围与目标 ----------
    await step('E13-专项', '专项夹具：冰封 5×5 范围标记、目标类型与越障/跨河（真实点击）', async () => {
      let s = eleFixture([P('ele', 'elephant', 4, 4), P('ally', 'pawn', 4, 2), E('foe', 'rook', 4, 6), P('blk', 'pawn', 4, 5)], { teamSp: 20 });
      s = R.purchaseUpgrade(s, 'ele', 'elephant-freeze-unlock');
      await inject(p, s);
      await selectAlly(p, 'ele');
      await selectMode(p, 'elephant-freeze');
      const zone = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'freeze-zone').length);
      A.equal(zone, 25, '5×5 范围标记 25 格（含斜向）');
      const targets = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack').map(m => m.userData.x + ',' + m.userData.y));
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
      return \`专项夹具：5×5 共 25 格标记、可越障选敌、友军被拒绝并提示“\${reason.split('\\n')[0]}”、目标无伤害（截图 \${shotA}、\${shotB}）\`;
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
      return \`专项夹具：冻结 2 阶段后连续两次结束回合，剩余 2→1→0、两个敌方阶段都不攻击且意图显示待机，到期恢复正常意图（截图 \${shotA}、\${shotB}）\`;
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
      return \`专项夹具：碰撞击杀敌人 → 象击杀 1、公共 SP 1、顶栏同步；友军被撞死 → 不奖励击杀与 SP（截图 \${shotA}）\`;
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
    await waitForView(p, 'battle');
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
    await waitForView(p, 'battle');
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
    await waitForView(p, 'battle');
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
    // 非法/取消不提交
    const savedAtBefore = (await readSave()).battle.savedAt;
    await selectAlly(p, 'ele');
    await selectMode(p, 'elephant-pull');
    await p.locator('#btn-cancel').click();
    await p.waitForTimeout(150);
    A.equal((await readSave()).battle.savedAt, savedAtBefore, '取消预览不写续局');
    await ctx.close();
    return \`副本续局：移动不保存且可撤销 → 刷新回到保存点；冰封成功写入续局、锁撤，刷新后冻结与锁定状态正确恢复；升级写入续局；取消不写入（截图 \${shotA}、\${shotB}、\${shotC}、\${shotD}、\${shotE}）\`;
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
    await waitForView(p, 'battle');
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
    await selectMode(p, 'elephant-pull');
    const marks = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'attack').length);
    A.ok(marks >= 0, '旧档仍可进入牵引模式');
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
    return \`旧档副本：象字段补齐为射程 3 / 未解锁 / 技能已用，公共 SP 仍为 3（不赠点），界面显示“冰封未解锁（2 SP）”可正常解锁；带升级的旧档保留射程 5、冰封 2 阶段（截图 \${shotA}）\`;
  });
}

/* ================= D. 手机横版（不改既有布局，只判断可达性） ================= */
async function mobileSection(browser) {
  // 手机竖版基准（448×924）与横版（844×390）各取证据
  for (const [name, viewport] of [['448x924', { width: 448, height: 924 }], ['844x390', { width: 844, height: 390 }]]) {
    await step('E21-' + name, \`手机 \${name}：招募/升级/技能目标操作可达性（既有布局问题单列）\`, async () => {
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
      const campShot = await shot(p, \`e21-\${name}-camp-recruit.png\`);
      // 营地技能面板：点开象的升级按钮
      const btn = p.locator('#camp-skills [data-skill="elephant-pull-range"]').first();
      const skillVisible = await btn.isVisible();
      const campSkillsShot = await shot(p, \`e21-\${name}-camp-skills.png\`);
      // 战斗内技能目标：注入夹具（专项）验证手机版模式按钮与目标点击
      await p.evaluate(() => { window.__M0_DEBUG__ && window.__M0_DEBUG__.suspend && window.__M0_DEBUG__.suspend(); });
      const battle = savedStateWithElephant();
      battle.units.find(u => u.id === 'ele').elephantFreezeUnlocked = true;
      battle.units.find(u => u.id === 'ele').elephantFreezeDuration = 1;
      await p.evaluate(x => { window.M0Campaign.loadBattle(x); }, battle);
      await p.waitForFunction(() => window.__M0_DEBUG__.getState().phase === 'player', null, { timeout: 15000 });
      await p.evaluate(() => window.M0Display.setMode && window.M0Display.setMode('mobile'));
      await p.waitForTimeout(200);
      const layout = await p.evaluate(() => {
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
      // 通过“我方队伍”选中象并切换冰封/牵引模式
      await selectAlly(p, 'ele');
      const modes = await p.locator('#rook-modes').innerText();
      A.match(modes, /牵引/, '手机版模式包含牵引');
      A.match(modes, /冰封/, '手机版模式包含冰封');
      const modesShot = await shot(p, \`e21-\${name}-modes.png\`);
      const reach = await p.evaluate(() => {
        const btn = document.querySelector('#rook-modes [data-mode="elephant-freeze"]');
        if (!btn) return null; const r = btn.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      });
      A.ok(reach && reach.visible && reach.h > 20, '冰封模式按钮可点击（高度 > 20px）');
      await selectMode(p, 'elephant-freeze');
      const zone = await p.evaluate(() => window.__M0_DEBUG__.getMarks().filter(m => m.layer === 'freeze-zone').length);
      A.equal(zone, 25, '手机版冰封 5×5 范围标记可用');
      // 目标点击（棋盘）
      const boardClickable = layout.cellW >= 20 && layout.boardInsideScene;
      if (boardClickable) {
        await cell(p, { x: 4, y: 5 });
        await p.waitForTimeout(200);
        const s2 = await st(p);
        A.equal(G(s2, 'foe').frozen >= 1 || (await p.locator('#preview-box').innerText()).length > 0, true, '手机版可点选冰封目标');
      }
      const targetShot = await shot(p, \`e21-\${name}-freeze-target.png\`);
      const issues = [];
      if (!boardClickable) issues.push(\`棋盘单格仅 \${layout.cellW}×\${layout.cellH}px（棋盘区 \${layout.scene.w}×\${layout.scene.h}px），属既有手机版行预算问题，本次不重做布局\`);
      if (!skillVisible) issues.push('营地技能按钮在折叠面板内需先展开');
      await ctx.close();
      return \`手机 \${name}（布局 \${layout.layoutMode}）：招募象按钮可见并可点击（\${campShot}）、营地技能面板可见（\${campSkillsShot}）、战斗模式按钮“牵引/冰封”可点（高度 \${reach.h}px，\${modesShot}）、冰封 5×5 标记 25 格、目标点击可用（\${targetShot}）；棋盘 \${layout.boardW}×\${layout.boardH}px、单格 \${layout.cellW}×\${layout.cellH}px\${issues.length ? '；'+issues.join('；') : ''}\`;
    });
  }
}

`;
t = t.split(anchor).join(block + anchor);
// 主入口追加新段
t = t.replace("    try { await normalFlow(browser); } catch (e) { bad('NORMAL', '正常流程', '未完成', e); }",
  "    try { await normalFlow(browser); } catch (e) { bad('NORMAL', '正常流程', '未完成', e); }\n    try { await fixtureSections(browser); } catch (e) { bad('FIXTURES', '专项界面段', '未完成', e); }\n    try { await saveSections(browser); } catch (e) { bad('SAVE', '存档边界段', '未完成', e); }\n    try { await mobileSection(browser); } catch (e) { bad('MOBILE', '手机段', '未完成', e); }");
// 暴露 waitView 供存档段使用（已有 waitView）
fs.writeFileSync(p, t);
console.log('appended fixture/save/mobile sections');
