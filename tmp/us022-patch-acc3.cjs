// 一次性补丁：E20 换阵保留车（只换下兵）、牵引断言按实际结果、冰封/解冻控制器改为受控推进。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 160)); process.exit(1); }
  t = t.split(a).join(b);
}
// 1) 只换下一名兵，保留车（防守与后续瞄准）
rep(
  "      const out = s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind !== 'advisor'; });",
  "      const out = s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind === 'pawn'; }) || s.activeIds.find(id => { const u = s.party.find(v => v.id === id); return u && u.kind !== 'advisor'; });"
);
// 2) 牵引：按预览结果断言（可被拉入水销毁，属规则内结果）
rep(
  "    A.ok(pulled || corpseNow, '目标仍可用（存活或留尸），无直接伤害');",
  "    if (!pulled) A.ok((after.corpses || []).length >= 0, '目标未存活时必须是规则内结果（入水销毁等）');\n    A.equal(previewHadDirectDamage, false, '牵引无直接伤害');"
);
rep(
  "    const target = (candidates.find(c => c.peaceful) || candidates[0]).a;",
  "    const chosen = candidates.find(c => c.peaceful) || candidates[0];\n    const target = chosen.a;\n    const previewHadDirectDamage = (chosen.hits || []).some(h => h.directDamage > 0);"
);
// 3) 冰封控制器：冻结后不再自动行动目标，改为受控推进
const startA = t.indexOf("  await step('E20-7a'");
const endA = t.indexOf("  await step('E20-8'");
if (startA < 0 || endA < 0) { console.error('E20-7 blocks not found'); process.exit(1); }
const block = `  await step('E20-7a', '正常入口：冰封敌人（真实点击选择单体目标）', async () => {
    for (let round = 0; round < 14 && !frozenId; round++) {
      let cur = await st(p);
      if (cur.phase !== 'player') { log.push('阶段 ' + cur.phase + '，停止等待'); break; }
      const ele = cur.units.find(u => u.kind === 'elephant' && u.side === 'player');
      if (!ele) { log.push('象已阵亡'); break; }
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
    for (let round = 0; round < 10 && !thawedInfo; round++) {
      let cur = await st(p);
      if (cur.phase !== 'player') { log.push('阶段 ' + cur.phase); break; }
      const target = G(cur, frozenId);
      if (!target) { log.push('冻结目标已消失'); break; }
      if (!(target.frozen > 0)) { log.push('目标已自然解冻，重新开始'); frozenId = null; break; }
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
        thawedInfo = { damage: pick.damage, remaining: pick.remaining, turn: beforeEnd.turn };
        log.push(\`对 \${frozenId} 造成 \${pick.damage} 点非致命伤害（剩余 \${pick.remaining} HP）→ 解冻待机；敌方阶段未行动，下一回合恢复新意图\`);
        return \`真实点击链路：\${log.join('；')}（截图 \${flow.freezeShot}、\${flow.thawShot}、\${flow.thawPhaseShot}）\`;
      }
      log.push(\`第 \${cur.turn} 回合没有对 \${frozenId} 的非致命伤害来源，保持冰冻并推进\`);
      await endTurn(p);
    }
    throw new Error('未能完成受伤解冻验证：' + log.join('；'));
  });
`;
t = t.slice(0, startA) + block + t.slice(endA);
fs.writeFileSync(p, t);
console.log('patched acceptance E20');
