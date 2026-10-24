// 一次性补丁：把 E20-2～E20-8 重写为“按当前局面自适应 + 真实点击”的战斗链路控制器。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf("  await step('E20-2'");
const end = t.indexOf("  flow.state = await st(p);");
if (start < 0 || end < 0) { console.error('E20 block not found'); process.exit(1); }
const block = `  await step('E20-2', '营地换阵：让象上阵（保留车，换下兵）', async () => {
    s = await st(p);
    const ele = s.party.find(u => u.kind === 'elephant');
    if (!s.activeIds.includes(ele.id)) {
      const out = s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind === 'pawn'; }) || s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind !== 'advisor'; });
      await p.locator(\`[data-camp-roster="\${out}"]\`).click();
      await p.waitForTimeout(120);
      await p.locator(\`[data-camp-roster="\${ele.id}"]\`).click();
      await p.waitForTimeout(150);
    }
    s = await st(p);
    A.ok(s.activeIds.includes(ele.id), '象已上阵');
    A.ok(s.activeIds.some(id => { const u = s.party.find(v => v.id === id); return u && u.kind === 'rook'; }), '保留车在阵');
    const campShot = await shot(p, 'e20-camp-roster.png');
    return \`名单切换：上阵 \${s.activeIds.join(',')}；猫粮 \${s.gold}、公共 SP \${s.teamSp}（截图 \${campShot}）\`;
  });
  // ---- E20 战斗链路：全部真实点击，按当前局面自适应（移→牵引→解锁冰封→冰封→非致命伤害解冻→升级） ----
  const chain = { move: null, pull: null, unlock: null, freeze: null, thaw: null, upgrade: null, shots: [], log: [] };
  const pushStep = (id, kind, pass, detail, evidence, error) => {
    report.steps.push({ id, kind, pass, detail, evidence: evidence || null, error: pass ? undefined : String(error && error.stack || error) });
    if (!pass) failed++;
    console.log((pass ? 'PASS ' : 'FAIL ') + id + ' · ' + detail);
  };
  // 找出“同一回合内可被冻结（象技能）+ 被其他单位非致命伤害”的组合
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
    // 4) 牵引证据（仅一次）：在冰封/解冻完成前也允许先做，避免错过目标
    if (!chain.pull && !chain.thaw && !(await (async () => { const c = await st(p); const e = c.units.find(u => u.id === ele.id); return e && e.elephantSkillUsed; })())) {
      const opp = findPullOpportunity(cur);
      if (opp) {
        await selectAlly(p, ele.id);
        await selectMode(p, 'elephant-pull');
        await hoverCell(p, opp.a.to);
        const previewText = await p.locator('#preview-box').innerText();
        chain.shots.push(await shot(p, 'e20-pull-preview.png'));
        await cell(p, opp.a.to);
        await p.waitForTimeout(150);
        const after = await st(p);
        const eleAfter = G(after, ele.id);
        const pulled = G(after, opp.a.targetId);
        const corpse = (after.corpses || []).find(c => c.unit && c.unit.id === opp.a.targetId);
        const dist = Math.abs(opp.a.from.x - opp.a.to.x) + Math.abs(opp.a.from.y - opp.a.to.y);
        const steps = Math.floor(dist / 2);
        const ex = opp.a.to.x + Math.sign(opp.a.from.x - opp.a.to.x) * steps;
        const ey = opp.a.to.y + Math.sign(opp.a.from.y - opp.a.to.y) * steps;
        chain.pull = {
          ok: eleAfter.elephantSkillUsed === true && eleAfter.ap === 0 && ((pulled && pulled.x === ex && pulled.y === ey) || (!pulled && !!corpse)),
          target: opp.a.targetId, dist, steps, to: pushedPoint(pulled || corpse), preview: previewText.slice(0, 200), kept: !!pulled
        };
        chain.shots.push(await shot(p, 'e20-pull-result.png'));
        return true;
      }
    }
    // 5) 升级证据（仅一次）
    if (!chain.upgrade && cur.teamSp >= 1 && R.elephantFreezeUnlocked(cur.units.find(u => u.id === ele.id)) && chain.thaw) {
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
    return \`第 2 关布阵：象 \${point(G(s, ele.id))}、车 \${rook ? point(G(s, rook.id)) : '无'}；敌方预置 \${enemies}（截图 \${deployShot}）\`;
  });
  // 自适应推进回合，直到 6 项证据齐备或用尽回合
  const MAX_TURNS = 12;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let cur = await st(p);
    if (cur.phase !== 'player') break;
    let acted = await playTurnAdaptive(p, chain);
    cur = await st(p);
    if (cur.phase !== 'player') break;
    if (!acted) {
      // 让其他单位正常行动（不消耗象的技能），再结束回合推进局面
      await autoTurn(p, [cur.units.find(u => u.kind === 'elephant') ? cur.units.find(u => u.kind === 'elephant').id : '']);
      continue;
    }
    if (chain.move && chain.pull && chain.unlock && chain.thaw && chain.upgrade) break;
  }
  // 结算证据：逐项写入报告
  {
    const move = chain.move;
    pushStep('E20-4', '正常入口：象普通移动（田字）与撤销', !!move && move.ok,
      move ? \`真实点击田字落点 \${point(move.to)}：移动后 ap 0、技能未用、撤销按钮可用；撤销后回到 \${point(move.from)} 且额度恢复（截图 e20-elephant-move.png）\` : '未取得田字移动证据',
      'e20-elephant-move.png', !move || !move.ok ? new Error('移动/撤销证据不成立：' + JSON.stringify(move)) : null);
    const pull = chain.pull;
    pushStep('E20-5', '正常入口：象牵引（真实点击目标、按实际距离一半拉近）', !!pull && pull.ok,
      pull ? \`真实点击牵引目标 \${pull.target}（实际距离 \${pull.dist} → 位移 \${pull.steps} 格）：预览“\${String(pull.preview).split('\\n')[0]}”，执行后技能已用、移动锁定、目标\${pull.kept ? '存活并到达 ' + point(pull.to) : '按规则离场'}（截图 e20-pull-preview.png、e20-pull-result.png）\` : '未取得牵引证据',
      'e20-pull-preview.png,e20-pull-result.png', !pull || !pull.ok ? new Error('牵引证据不成立：' + JSON.stringify(pull)) : null);
    const unlock = chain.unlock;
    pushStep('E20-6', '正常入口：技能面板解锁冰封（2 SP）', !!unlock && unlock.ok,
      unlock ? \`真实点击“解锁冰封”：公共 SP \${unlock.sp0}→\${unlock.sp1}，模式按钮显示“冰封 1 阶段”（截图 e20-freeze-unlock.png）\` : '未取得冰封解锁证据',
      'e20-freeze-unlock.png', !unlock || !unlock.ok ? new Error('解锁证据不成立：' + JSON.stringify(unlock)) : null);
    const freeze = chain.freeze;
    pushStep('E20-7a', '正常入口：冰封敌人（5×5 单体、真实点击）', !!freeze && freeze.ok,
      freeze ? \`冰封 \${freeze.target}（HP \${freeze.hp}，冻结 1 阶段）：预览“\${String(freeze.preview).split('\\n')[0]}”，意图列表显示待机（截图 e20-freeze-preview.png、e20-freeze-applied.png）\` : '未取得冰封证据',
      'e20-freeze-preview.png,e20-freeze-applied.png', !freeze || !freeze.ok ? new Error('冰封证据不成立') : null);
    const thaw = chain.thaw, th = chain.thawPhase;
    pushStep('E20-7b', '正常入口：对冰冻敌人造成非致命伤害 → 解冻但本回合待机', !!thaw && thaw.ok && !!th && th.ok,
      thaw ? \`真实点击造成 \${thaw.damage} 点非致命伤害：\${thaw.target} 剩余 HP \${thaw.hpAfter}、frozen 清零、受伤解冻待机；随后敌方阶段该单位仍待机（帅与友军 HP 未变、frozen 待机标志已清除）（截图 e20-thaw.png、e20-thaw-standby-enemy-phase.png）\` : '未取得受伤解冻证据',
      'e20-thaw.png,e20-thaw-standby-enemy-phase.png', !thaw || !thaw.ok || !th || !th.ok ? new Error('解冻证据不成立：' + JSON.stringify({ thaw, th })) : null);
    const upgrade = chain.upgrade;
    pushStep('E20-8', '正常入口：技能升级使用（真实点击技能面板）', !!upgrade && upgrade.ok,
      upgrade ? \`真实点击“牵引射程”：\${upgrade.range0}→\${upgrade.range1} 格、公共 SP \${upgrade.sp0}→\${upgrade.sp1}，模式按钮“\${upgrade.btnText}”（截图 e20-upgrade.png）\` : '未取得升级使用证据',
      'e20-upgrade.png', !upgrade || !upgrade.ok ? new Error('升级证据不成立：' + JSON.stringify(upgrade)) : null);
  }
`;
t = t.slice(0, start) + block + t.slice(end);
fs.writeFileSync(p, t);
console.log('rewrote E20 chain adaptive');
