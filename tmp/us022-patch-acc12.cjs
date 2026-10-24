// 一次性补丁：修正 getMarks 结构（返回的是已合并 userData 的对象）与 E04 夹具几何。
const fs = require('node:fs');
const p = 'tests/us022-acceptance-browser.cjs';
let t = fs.readFileSync(p, 'utf8');
// 1) marks 读取：getMarks() 返回 {type,x,y,layer,...}
t = t.split("window.__M0_DEBUG__.getMarks().map(m => Object.assign({}, m, { u: m.userData || {} })).filter(m => m.u.layer === 'move').map(m => m.u.x + ',' + m.u.y)")
  .join("window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').map(m => m.x + ',' + m.y)");
t = t.split("window.__M0_DEBUG__.getMarks().map(m => Object.assign({}, m, { u: m.userData || {} })).filter(m => m.u.layer === 'attack').map(m => m.u.x + ',' + m.u.y)")
  .join("window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'attack').map(m => m.x + ',' + m.y)");
t = t.split("window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'move').length")
  .join("window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'move').length");
t = t.split("window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'attack').length")
  .join("window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'attack').length");
t = t.split("window.__M0_DEBUG__.getMarks().map(m => m.userData || {}).filter(u => u.layer === 'freeze-zone').length")
  .join("window.__M0_DEBUG__.getMarks().filter(m => m && m.layer === 'freeze-zone').length");
// 2) E04 夹具：移动后目标仍在 5×5 内
t = t.split("      let s = eleFixture([P('ele', 'elephant', 4, 4), E('foe', 'rook', 4, 6)], { teamSp: 4 });")
  .join("      let s = eleFixture([P('ele', 'elephant', 4, 4), E('foe', 'rook', 5, 4)], { teamSp: 4 });");
t = t.split("      await cell(p, { x: 4, y: 6 });\n      await p.waitForTimeout(140);\n      cur = await st(p);\n      A.equal(G(cur, 'ele').elephantSkillUsed, true);")
  .join("      await cell(p, { x: 5, y: 4 });\n      await p.waitForTimeout(140);\n      cur = await st(p);\n      A.equal(G(cur, 'ele').elephantSkillUsed, true);");
fs.writeFileSync(p, t);
console.log('patched marks mapping + E04 fixture');
