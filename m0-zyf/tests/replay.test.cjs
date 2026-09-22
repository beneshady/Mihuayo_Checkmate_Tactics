const {test}=require('node:test');const assert=require('node:assert/strict');const R=require('../.test/rules/game.js');
for(const branch of ['horse','cannon'])test(`${branch} 真实配置完整通关、首波 Lv.2、整局 Lv.3、队友操作`,()=>{
  let s=R.newGame(),allyActed=false,maxMs=0;
  for(const step of require(`./replays/${branch}.json`)){
    if(s.phase==='player'){const before=JSON.stringify(s),start=performance.now();assert(R.analyze(s).safe);maxMs=Math.max(maxMs,performance.now()-start);assert.equal(JSON.stringify(s),before);}
    if(step.buy){assert.equal(s.phase,'shop');assert(s.highestLevel>=2);s=R.nextWave(R.buy(s,step.buy));}
    else if(step.end)s=R.endTurn(s);
    else {const move=R.submit(s,step.actor,step.to);assert(move.effect,JSON.stringify(step));s=move.state;if(step.actor==='ally')allyActed=true;}
  }
  assert.equal(s.result,'victory');assert.equal(s.highestLevel,3);assert(allyActed);
  console.log(JSON.stringify({branch,turn:s.turn,kills:s.kills,kingHP:R.king(s,'player').hp,highestLevel:s.highestLevel,maxAnalysisMs:+maxMs.toFixed(3)}));
});
