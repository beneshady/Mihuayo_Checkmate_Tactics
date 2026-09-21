// US-001 正式局确定性回放：马/炮分支，两波胜利、首波花 SP、队友造成伤害。
const {test}=require('node:test'),A=require('node:assert/strict'),R=require('../web/js/rules.js');
for(const branch of ['horse','cannon'])test(`${branch} 分支：未注入资源的完整两波胜利`,()=>{
 let s=R.newGame(),wave1Upgrade=false,allyDamage=false,maxAnalysisMs=0;const log=require(`./replays/${branch}.json`);
 A.deepEqual(s.units.filter(u=>u.side==='player').map(u=>u.id),['king','rook','starting-cannon']);A.equal(s.units.reduce((n,u)=>n+u.sp,0),0);A.equal(s.gold,0);
 for(const [i,step] of log.entries()){
  if(s.phase==='player'){const before=JSON.stringify(s),t=performance.now(),a=R.analyze(s);maxAnalysisMs=Math.max(maxAnalysisMs,performance.now()-t);A.equal(a.safe,true,`步骤 ${i} 被判无解`);A.equal(JSON.stringify(s),before,'分析污染状态')}
  if(step.buy){A.equal(s.phase,'shop');A.equal(wave1Upgrade,true);const bought=R.buy(s,step.buy);A.notStrictEqual(bought,s);s=R.nextWave(bought);continue}
  if(step.upgrade){A.ok(s.phase==='player'||s.phase==='shop');const n=R.purchaseUpgrade(s,step.upgrade.actor,step.upgrade.skill,step.upgrade.index);A.notStrictEqual(n,s,`非法升级 @${i}`);if(s.wave===1)wave1Upgrade=true;s=n;continue}
  if(step.end){const n=R.endTurn(s).state;A.notStrictEqual(n,s,`非法结束 @${i}`);s=n;continue}
  const actor=s.units.find(u=>u.id===step.action.actor),r=R.submitAction(s,step.action);A.ok(actor,`单位不存在 @${i}`);A.ok(r.effect,`非法动作 @${i}: ${JSON.stringify(step.action)}`);if(s.wave===2&&actor.id===branch&&r.effect.damage.length)allyDamage=true;s=r.state;
 }
 A.equal(s.phase,'result');A.equal(s.result,'victory');A.equal(wave1Upgrade,true);A.equal(allyDamage,true);A.ok(s.highestLevel>=2);console.log(JSON.stringify({branch,steps:log.length,turn:s.turn,kills:s.kills,highestLevel:s.highestLevel,maxAnalysisMs:+maxAnalysisMs.toFixed(2)}));
});
