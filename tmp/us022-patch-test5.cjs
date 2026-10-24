// 一次性补丁：修正 E15-A 与 E16 的同回合重冻夹具（第三人象）。
const fs = require('node:fs');
const p = 'tests/us022-elephant.test.cjs';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 160)); process.exit(1); }
  t = t.split(a).join(b);
}
// E15 A：不需要 prepareEnemy（否则无攻击的敌人会被移动）
rep(
  "  s.teamSp = 0;\n  s.intents = []; R.prepareEnemy(s);\n  const f = freeze(s, 'e1', 4, 6);",
  "  s.teamSp = 0;\n  const f = freeze(s, 'e1', 4, 6);"
);
// E16 第三段：改为三只象（a 冻结、b 牵引致伤、c 同回合重新冻结）
const start = t.indexOf("  // 受伤解冻后同回合另一只象再冻：完整本次时长");
const end = t.indexOf("/* ---------------- E17 击杀归属 ---------------- */");
if (start < 0 || end < 0) { console.error('E16 tail block not found'); process.exit(1); }
t = t.slice(0, start) + `  // 受伤解冻后同回合另一只象再冻：完整本次时长（第三只象提供技能机会）
  let s3 = base([P('a', 'elephant', 5, 6), P('b', 'elephant', 0, 4), P('c', 'elephant', 6, 2), E('t', 'rook', 5, 4)], { tiles: { '3,4': 'mountain' } });
  s3 = withFreeze(s3, 'a', 1);
  s3 = R.purchaseUpgrade(addSp(s3, 2), 'b', 'elephant-freeze-unlock');
  s3 = R.purchaseUpgrade(addSp(s3, 2), 'c', 'elephant-freeze-unlock');
  s3 = withRange(s3, 'b', 5);
  s3.teamSp = 0;
  const fa = freeze(s3, 'a', 5, 4);
  assert.ok(fa.effect);
  assert.equal(G(fa.state, 't').frozen, 1);
  const hit = pull(fa.state, 'b', 5, 4);
  assert.ok(hit.effect, 'b 牵引已冻结目标撞山');
  assert.equal(G(hit.state, 't').frozen, 0, '受伤先解冻');
  assert.equal(G(hit.state, 't').thawStandby, true);
  assert.deepEqual([G(hit.state, 't').x, G(hit.state, 't').y], [4, 4], '受伤后目标停在碰撞前');
  const refreeze = freeze(hit.state, 'c', 4, 4);
  assert.ok(refreeze.effect, '同回合另一只象可重新冰封');
  assert.equal(G(refreeze.state, 't').frozen, 1, '赋予完整本次时长（c 为 1 阶段）');
  assert.equal(G(refreeze.state, 't').thawStandby, false, '重新冰封清除解冻待机');
  assert.equal(G(refreeze.state, 'a').elephantSkillUsed, true, 'a 已用技能');
  assert.equal(G(refreeze.state, 'b').elephantSkillUsed, true, 'b 已用技能（牵引）');
  assert.equal(G(refreeze.state, 'c').elephantSkillUsed, true, '消耗重新冰封的象技能机会');
});

` + t.slice(end);
fs.writeFileSync(p, t);
console.log('patched E15-A/E16');
