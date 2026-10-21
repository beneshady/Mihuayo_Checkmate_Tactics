// Update assertions invalidated by the US-020 contract.
const fs=require('fs');
function patch(file,pairs){
 let t=fs.readFileSync(file,'utf8');
 for(const [a,b] of pairs){
  if(t.indexOf(a)<0)throw Error('anchor missing in '+file+': '+a.slice(0,60));
  t=t.split(a).join(b);
 }
 fs.writeFileSync(file,t);
 console.log('patched '+file);
}
patch('tests/shared-sp.test.cjs',[
 ["s.phase='deploy';A.strictEqual(R.purchaseUpgrade(s,'s','fortify'),s);",
  "s.phase='deploy';A.notStrictEqual(R.purchaseUpgrade(s,'s','fortify'),s,'US-020 R07：布阵期也允许使用公共 SP（失败重试时回滚到入关状态）');s.teamSp=9;"]
]);
patch('tests/us018-advisor.test.cjs',[
 ["A.match(src,/\\.map\\(c=>c\\.unit\\)\\.filter\\(R\\.commanderTarget\\)/,'UI 死亡名单排除仕/装置');",
  "A.match(src,/R\\.rescueTargets\\(state\\)/,'US-020：UI 救援名单复用规则层 rescueTargets，自动排除仕/装置与满血单位');"]
]);
