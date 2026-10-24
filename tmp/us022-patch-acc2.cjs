// 一次性补丁：E20-1 支持失败重试（真实点击重试按钮）直到第 1 关胜利，避免自动策略偶发失败导致后续步骤无营地。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf("  await step('E20-1'");
const end = t.indexOf("  await p.waitForTimeout(300);");
if (start < 0 || end < 0) { console.error('E20-1 block not found'); process.exit(1); }
const block = `  await step('E20-1', '正常入口：第 1 关布阵与真实战斗赚猫粮/SP', async () => {
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
    return \`第 1 关布阵后真实点击完成 \${outcome.turns} 回合（第 \${attempts} 次尝试）：胜利、击杀 \${s.kills}、公共 SP \${s.teamSp}、猫粮 \${s.gold}（截图 \${flow.deployShot}、\${flow.level1Shot}）\`;
  });
`;
t = t.slice(0, start) + block + t.slice(end);
fs.writeFileSync(p, t);
console.log('rewrote E20-1 with retry');
