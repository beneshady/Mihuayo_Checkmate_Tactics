// 回放测试：真实初始配置完整通关（马/炮两分支），对应 GDD 8.2 浏览器试玩要求。
// 每个玩家动作前都像 UI 一样运行将死分析并断言安全；记录最坏分析耗时。
// 运行：node tests/replay.test.cjs（需先运行 node tests/find-playthrough.cjs 生成回放）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../web/js/rules.js');

for (const branch of ['horse', 'cannon']) {
  test(`${branch} 分支：完整通关、首波升级、购买参战、整局 Lv.3`, () => {
    let s = R.newGame();
    let allyActed = false, maxMs = 0, upgradedWave1 = false, bought = false;
    const log = require(`./replays/${branch}.json`);
    for (const step of log) {
      if (s.phase === 'player') {
        const before = JSON.stringify(s);
        const t0 = performance.now();
        const a = R.analyze(s);
        maxMs = Math.max(maxMs, performance.now() - t0);
        assert(a.safe, `第 ${s.turn} 回合被误判将死: ${before}`);
        assert.equal(JSON.stringify(s), before, '分析不得改变真实对局');
      }
      if (step.buy) {
        assert.equal(s.phase, 'shop');
        assert(s.highestLevel >= 2, '首波应已升级');
        upgradedWave1 = true;
        s = R.nextWave(R.buy(s, step.buy));
        bought = true;
      } else if (step.end) {
        s = R.endTurn(s).state;
      } else {
        const move = R.submit(s, step.actor, step.to);
        assert(move.effect, `非法动作 ${JSON.stringify(step)} @ turn ${s.turn}`);
        s = move.state;
        if (step.actor === branch) allyActed = true;
      }
    }
    assert.equal(s.result, 'victory');
    assert.equal(s.phase, 'result');
    assert.equal(s.highestLevel, 3, '应存在整局 Lv.3 路径');
    assert(upgradedWave1 && bought && allyActed);
    console.log(JSON.stringify({
      branch: branch, steps: log.length, turns: s.turn, kills: s.kills,
      kingHP: R.king(s, 'player').hp, highestLevel: s.highestLevel,
      maxAnalysisMs: +maxMs.toFixed(3)
    }));
  });
}
