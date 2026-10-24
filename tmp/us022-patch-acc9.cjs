// 一次性补丁：牵引证据改为“先田字移动到同线位置再牵引”，并把牵引排在冰封之前（更贴近需求顺序）。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
// 1) 新增“移动后牵引”计划搜索
const anchor = "  function findPullOpportunity(cur) {";
if (t.split(anchor).length - 1 !== 1) { console.error('findPullOpportunity anchor missing'); process.exit(1); }
const plan = `  // 先田字移动到与敌人同线、再牵引；两步都在同一回合内由真实点击完成
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
  function findPullOpportunity(cur) {`;
t = t.split(anchor).join(plan);
// 2) playTurnAdaptive：牵引段改为“移动+牵引”计划，并排在冰封段之前
const startPull = t.indexOf("    // 4) 牵引证据（仅一次）");
const endPull = t.indexOf("    // 5) 升级证据（仅一次）");
const startFreeze = t.indexOf("    // 3) 冰封 + 同回合非致命伤害（解冻证据）");
if (startPull < 0 || endPull < 0 || startFreeze < 0) { console.error('playTurnAdaptive blocks not found'); process.exit(1); }
const pullBlock = t.slice(startPull, endPull);
const freezeBlock = t.slice(startFreeze, startPull);
const newPull = `    // 3) 牵引证据（仅一次）：先田字移动到同线位置，再真实点击牵引目标
    if (!chain.pull && !chain.thaw) {
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
`;
t = t.slice(0, startPull) + t.slice(endPull);            // 去掉旧牵引段
t = t.slice(0, startFreeze) + newPull + t.slice(startFreeze); // 在冰封段前插入新牵引段
fs.writeFileSync(p, t);
console.log('pull plan injected before freeze block');
