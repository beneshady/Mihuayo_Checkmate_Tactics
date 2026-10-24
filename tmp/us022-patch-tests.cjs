// 一次性补丁：US-022 统一撞山后，既有断言中的“坍塌为陆地”改为“碎石地”（等同陆地，仅视觉区分）。
const fs = require('node:fs');
function patch(file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  for (const [a, b, n] of pairs) {
    const count = t.split(a).length - 1;
    if (count !== n) { console.error(file, 'anchor count', count, 'expected', n, ':'); console.error(a); process.exit(1); }
    t = t.split(a).join(b);
  }
  fs.writeFileSync(file, t);
  console.log('patched', file);
}
patch('tests/terrain.test.cjs', [
  ["let r=R.submitDirection(s,'p',1);A.equal(r.state.tiles['2,2'],'land');", "let r=R.submitDirection(s,'p',1);A.equal(r.state.tiles['2,2'],'rubble');", 1],
  ["r=act(r.state,'r',{x:2,y:2});A.equal(r.state.tiles['2,2'],'land');", "r=act(r.state,'r',{x:2,y:2});A.equal(r.state.tiles['2,2'],'rubble');", 1],
  ["const r=act(s,'c',{x:2,y:2});A.equal(r.state.tiles['1,2'],'land');", "const r=act(s,'c',{x:2,y:2});A.equal(r.state.tiles['1,2'],'rubble');", 1],
  ["A.equal(r.state.tiles['3,2'],'land');A.equal(G(r.state,'behind').hp,1);", "A.equal(r.state.tiles['3,2'],'rubble');A.equal(G(r.state,'behind').hp,1);", 1],
  ["A.equal(G(r.state,'r').hp,1);A.equal(r.state.tiles['3,2'],'land');", "A.equal(G(r.state,'r').hp,1);A.equal(r.state.tiles['3,2'],'rubble');", 1]
]);
patch('tests/us021-horse.test.cjs', [
  ["assert.equal(second.state.tiles['4,1'],'land','第二次受击坍塌为陆地');", "assert.equal(second.state.tiles['4,1'],'rubble','第二次受击坍塌为碎石地（US-022 统一撞山，等同陆地）');", 1]
]);
