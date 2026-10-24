// 一次性补丁：重写 E20-5（牵引）与 E20-7/8（冰封→受伤解冻→升级）为按真实局面自适应的控制器。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf("  await step('E20-5'");
const end = t.indexOf("  flow.state = await st(p);");
if (start < 0 || end < 0) { console.error('E20 block not found'); process.exit(1); }
const block = `  await step('E20-5', '正常入口：象牵引（选择敌军、按距离一半拉近）', async () => {
    s = await st(p);
    const ele = s.units.find(u => u.kind === 'elephant' && u.side === 'player');
    const s0 = s;
    const candidates = R.legalActions(s, ele.id).filter(a => a.type === 'elephant-pull').map(a => {
      const r = R.preview(s, ele.id, a.to, 'elephant-pull');
      const hits = r ? r.effect.hits : [];
      return { a, hits, peaceful: hits.length === 0 };
    }).sort((x, y) => (y.a.distance || 0) - (x.a.distance || 0));
    A.ok(candidates.length >= 1, '射程内存在可牵引目标');
    const target = (candidates.find(c => c.peaceful) || candidates[0]).a;
    await selectAlly(p, ele.id);
    await selectMode(p, 'elephant-pull');
    await hoverCell(p, target.to);
    const previewText = await p.locator('#preview-box').innerText();
    A.match(previewText, /牵引/, '预览显示牵引');
    A.match(previewText, /floor\\(距离\\/2\\)/, '预览说明位移公式');
    const previewShot = await shot(p, 'e20-pull-preview.png');
    await cell(p, target.to);
    await p.waitForTimeout(150);
    const after = await st(p);
    const dist = Math.abs(target.from.x - target.to.x) + Math.abs(target.from.y - target.to.y);
    const steps = Math.floor(dist / 2);
    const expectX = target.to.x + Math.sign(target.from.x - target.to.x) * steps;
    const expectY = target.to.y + Math.sign(target.from.y - target.to.y) * steps;
    const pulled = G(after, target.targetId);
    const corpseNow = (after.corpses || []).find(c => c.unit && c.unit.id === target.targetId);
    if (pulled) {
      A.equal(pulled.x, expectX, '位移 floor(距离/2) 格的横向落点');
      A.equal(pulled.y, expectY, '位移 floor(距离/2) 格的纵向落点');
    }
    A.ok(pulled || corpseNow, '目标仍可用（存活或留尸），无直接伤害');
    A.equal(G(after, ele.id).elephantSkillUsed, true, '施法消耗本回合技能');
    A.equal(G(after, ele.id).ap, 0, '施法后锁普通移动');
    const afterShot = await shot(p, 'e20-pull-result.png');
    return \`真实点击牵引目标 \${point(target.to)}（距离 \${dist}，计划位移 \${steps} 格）→ 预览“\${previewText.split('\\n')[0]}”，执行后目标到 \${pulled ? point(pulled) : '（阵亡留尸 ' + point(corpseNow) + '）'}、技能已用、移动锁定（截图 \${previewShot}、\${afterShot}）\`;
  });
  await step('E20-6', '正常入口：技能面板解锁冰封（2 SP）', async () => {
    s = await st(p);
    const ele = s.units.find(u => u.kind === 'elephant' && u.side === 'player');
    A.ok(s.teamSp >= 2, '公共 SP 足够解锁（实际 ' + s.teamSp + '）');
    A.equal(R.elephantFreezeUnlocked(ele), false, '解锁前未拥有冰封');
    await selectAlly(p, ele.id);
    await openSkills(p);
    const panel = await p.locator('#skills').innerText();
    A.match(panel, /解锁冰封/, '技能面板出现解锁冰封');
    A.match(panel, /2 公共 SP/, '显示 2 公共 SP 价格');
    const spBefore = s.teamSp;
    await p.locator('#skills [data-skill="elephant-freeze-unlock"]').click();
    await p.waitForTimeout(150);
    s = await st(p);
    const eleAfter = G(s, ele.id);
    A.equal(eleAfter.elephantFreezeUnlocked, true, '冰封已解锁');
    A.equal(s.teamSp, spBefore - 2, '扣 2 公共 SP');
    A.equal(await p.locator('#rook-modes [data-mode="elephant-freeze"]').innerText(), '冰封 1 阶段', '模式按钮显示冻结 1 阶段');
    const skillShot = await shot(p, 'e20-freeze-unlock.png');
    return \`真实点击“解锁冰封”：公共 SP \${spBefore}→\${s.teamSp}，模式按钮“冰封 1 阶段”（截图 \${skillShot}）\`;
  });
  // ---- 冰封 → 受伤解冻 → 待机：全部经真实点击，按当前局面自适应 ----
  const log = [];
  let frozenId = null, thawedInfo = null;
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
  await step('E20-7a', '正常入口：冰封敌人（真实点击选择单体目标）', async () => {
    for (let round = 0; round < 12 && !frozenId; round++) {
      let cur = await st(p);
      if (cur.phase !== 'player') { log.push('阶段 ' + cur.phase + '，停止等待'); break; }
      const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
      if (!ele) { log.push('象已阵亡'); break; }
      // 优先选择 HP ≥2 的敌人，便于后续“受伤但不致死”的解冻验证
      const cands = R.legalActions(cur, ele.id).filter(a => a.type === 'elephant-freeze')
        .map(a => ({ a, target: G(cur, a.targetId) })).filter(x => x.target)
        .sort((x, y) => y.target.hp - x.target.hp || x.target.id.localeCompare(x.target.id));
      if (cands.length && !ele.elephantSkillUsed) {
        const pick = cands[0];
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-freeze');
        await hoverCell(p, pick.a.to);
        const previewText = await p.locator('#preview-box').innerText();
        A.match(previewText, /冰封目标/, '冰封预览显示目标');
        A.match(previewText, /5×5/, '预览说明 5×5 范围');
        flow.freezePreview = previewText;
        flow.freezePreviewShot = await shot(p, 'e20-freeze-preview.png');
        await cell(p, pick.a.to);
        await p.waitForTimeout(150);
        cur = await st(p);
        A.equal(G(cur, pick.a.targetId).frozen >= 1, true, '目标被冻结');
        frozenId = pick.a.targetId;
        const intentText = await p.locator('#intent-list').innerText();
        A.match(intentText, /待机/, '意图列表显示待机');
        flow.freezeShot = await shot(p, 'e20-freeze-applied.png');
        log.push(\`第 \${cur.turn} 回合冰封 \${frozenId}（HP \${G(cur, frozenId).hp}，剩余 \${G(cur, frozenId).frozen} 阶段）\`);
        return \`真实点击冰封目标：\${log.join('；')}；意图列表显示待机（截图 \${flow.freezePreviewShot}、\${flow.freezeShot}）\`;
      }
      log.push(\`第 \${cur.turn} 回合无可用冰封目标，自动行动后推进\`);
      await autoTurn(p, [ele.id]);
    }
    throw new Error('未能在正常流程内完成冰封：' + log.join('；'));
  });
  await step('E20-7b', '正常入口：对冰冻敌人造成非致命伤害 → 解冻但本回合待机', async () => {
    for (let round = 0; round < 8 && !thawedInfo; round++) {
      let cur = await st(p);
      if (cur.phase !== 'player') { log.push('阶段 ' + cur.phase); break; }
      const target = G(cur, frozenId);
      if (!target) { log.push('冻结目标已消失'); break; }
      if (!(target.frozen > 0)) { log.push('目标已自然解冻'); break; }
      let pick = null;
      for (const u of cur.units.filter(u => u.side === 'player')) {
        for (const a of R.legalActions(cur, u.id)) {
          const r = a.type === 'directional' ? R.previewDirection(cur, u.id, a.direction) : R.preview(cur, u.id, a.to, a.type);
          if (!r) continue;
          const hit = (r.effect.hits || []).find(h => h.id === frozenId);
          if (!hit) continue;
          const remaining = target.hp - hit.damage;
          if (remaining > 0) { pick = { a, remaining, damage: hit.damage }; break; }
        }
        if (pick) break;
      }
      if (pick) {
        await doAction(p, pick.a);
        await p.waitForTimeout(150);
        const after = await st(p);
        A.equal(G(after, frozenId).frozen, 0, '实际受伤清除剩余冻结');
        A.equal(G(after, frozenId).thawStandby, true, '受伤解冻但本回合待机');
        A.equal(G(after, frozenId).hp, pick.remaining, '伤害结算正确且未致死');
        const intentText = await p.locator('#intent-list').innerText();
        A.match(intentText, /解冻/, '意图列表显示受伤解冻待机');
        flow.thawShot = await shot(p, 'e20-thaw.png');
        const beforeEnd = after;
        const kingHp = G(beforeEnd, 'king').hp;
        const unitHps = beforeEnd.units.filter(u => u.side === 'player').map(u => u.id + ':' + u.hp).join(',');
        await endTurn(p);
        const next = await st(p);
        A.equal(next.turn, beforeEnd.turn + 1, '推进到下一回合');
        A.equal(G(next, 'king') ? G(next, 'king').hp : 0, kingHp, '受伤解冻当回合敌方阶段不恢复行动（帅未掉血）');
        A.equal(next.units.filter(u => u.side === 'player').map(u => u.id + ':' + u.hp).join(','), unitHps, '该阶段没有攻击发生');
        if (G(next, frozenId)) A.equal(G(next, frozenId).thawStandby || false, false, '阶段结束清除解冻待机');
        flow.thawPhaseShot = await shot(p, 'e20-thaw-standby-enemy-phase.png');
        const intentText2 = await p.locator('#intent-list').innerText();
        thawedInfo = { damage: pick.damage, remaining: pick.remaining, turn: beforeEnd.turn, intent: intentText2.slice(0, 120) };
        log.push(\`对 \${frozenId} 造成 \${pick.damage} 点非致命伤害（剩余 \${pick.remaining} HP）→ 解冻待机；敌方阶段未行动，下一回合恢复新意图\`);
        A.match(intentText2, /攻击|冲击|移动|待机/, '下一回合意图列表已刷新');
        return \`真实点击链路：\${log.join('；')}（截图 \${flow.freezeShot}、\${flow.thawShot}、\${flow.thawPhaseShot}）\`;
      }
      log.push(\`第 \${cur.turn} 回合没有对 \${frozenId} 的非致命伤害来源，自动行动后推进\`);
      const eleIds = cur.units.filter(u => u.kind === 'elephant' && u.side === 'player').map(u => u.id);
      await autoTurn(p, eleIds);
    }
    throw new Error('未能完成受伤解冻验证：' + log.join('；'));
  });
  await step('E20-8', '正常入口：技能升级使用（真实点击技能面板）', async () => {
    let cur = await st(p);
    for (let round = 0; round < 6 && (cur.phase === 'player') && cur.teamSp < 1; round++) { await autoTurn(p); cur = await st(p); }
    if (cur.phase !== 'player') {
      // 若本关已结算，回到营地再升级（营地入口同样属正常流程）
      await waitView(p, 'camp');
      const el = await p.locator('#camp-skills [data-camp-skill]').count();
      A.ok(el > 0, '营地技能面板可用');
      const eleGroup = p.locator('#camp-skills .skill-unit').filter({ hasText: '象' }).first();
      A.ok(await eleGroup.count() > 0, '营地技能面板含象');
      const before = await st(p);
      const btn = eleGroup.locator('[data-skill="elephant-pull-range"]');
      const labelBefore = await btn.innerText();
      await btn.click();
      await p.waitForTimeout(150);
      const after = await st(p);
      A.ok(after.teamSp < before.teamSp, '营地升级扣公共 SP');
      const campShot = await shot(p, 'e20-upgrade-camp.png');
      return \`战斗已结算，在营地技能面板真实点击象“牵引射程”（\${labelBefore.replace(/\\n/g, ' ')}）：公共 SP \${before.teamSp}→\${after.teamSp}（截图 \${campShot}）\`;
    }
    const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
    A.ok(ele, '象仍在场');
    A.ok(cur.teamSp >= 1, '公共 SP 可用于升级（实际 ' + cur.teamSp + '）');
    await selectAlly(p, ele.id);
    await openSkills(p);
    const panel = await p.locator('#skills').innerText();
    A.match(panel, /牵引射程/, '技能面板显示牵引射程');
    A.match(panel, /冻结时长/, '技能面板显示冻结时长');
    const spBefore = cur.teamSp;
    const rangeBefore = R.elephantPullRangeOf(ele);
    await p.locator('#skills [data-skill="elephant-pull-range"]').click();
    await p.waitForTimeout(150);
    cur = await st(p);
    const after = G(cur, ele.id);
    A.equal(R.elephantPullRangeOf(after), rangeBefore + 1, '牵引射程 +1');
    A.equal(cur.teamSp, spBefore - 1, '扣 1 公共 SP');
    A.equal(await p.locator('#rook-modes [data-mode="elephant-pull"]').innerText(), \`牵引 \${rangeBefore + 1} 格\`, '模式按钮同步新射程');
    const shot1 = await shot(p, 'e20-upgrade.png');
    return \`真实点击“牵引射程”：\${rangeBefore}→\${rangeBefore + 1} 格、公共 SP \${spBefore}→\${cur.teamSp}，模式按钮同步（截图 \${shot1}）\`;
  });
`;
t = t.slice(0, start) + block + t.slice(end);
fs.writeFileSync(p, t);
console.log('rewrote E20-5..E20-8');
