// 独立策划诊断：正式入口、合法命令，无资源/阶段/阵容注入。
// 这是确定性策略样本，不是玩家胜率统计，也不替代浏览器验收。
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const rulesPath = path.resolve(__dirname, '../../web/js/rules.js');
const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(rulesPath)).digest('hex');
const R = require(rulesPath);
function value(s) {
  const k = R.king(s, 'player');
  if (!k || s.result === 'dead') return -100000;
  const friends = s.units.filter(u => u.side === 'player' && u.kind !== 'king');
  return (s.result === 'victory' ? 10000 : 0) + k.hp * 100 + s.kills * 25 +
    friends.reduce((v, u) => v + u.hp * 3 + 4, 0);
}
function evaluate(s, policy) {
  return policy === 'greedy-safe' || policy === 'king-only' ? value(R.enemyPhase(s).state) : value(s);
}
function run(buff, policy) {
  let s = R.newGame();
  if (s.phase === 'deploy') s = R.confirmDeployment(s);
  s = R.chooseCommanderBuff(s, buff);
  const initial = s.units.filter(u => u.side === 'player').map(u => ({id:u.id,hp:u.hp}));
  const opening = s.intents.filter(i => i.type !== 'standby').map(i => ({actor:i.actor,to:R.intentTarget(s,i)}));
  const log = [];
  for (let guard = 0; guard < 20 && s.phase !== 'intermission' && s.phase !== 'result'; guard++) {
    if (s.phase === 'rescue') {
      const candidates = [...s.units.filter(u => u.side==='player' && u.kind!=='king').map(u=>u.id),
        ...s.corpses.filter(c=>c.unit).map(c=>c.unit.id)];
      let best;
      for (const id of candidates) { const n=R.rescue(s,id); if(n!==s && (!best || value(n)>value(best.s))) best={s:n,id}; }
      if (!best) return {buff,policy,error:'rescue-stalled',log};
      s=best.s; log.push({rescue:best.id,turn:s.turn});
    }
    if (s.phase !== 'player') return {buff,policy,error:'unexpected-phase',phase:s.phase,log};
    const round = {turn:s.turn,wave:s.wave,actions:[],enemyCount:s.units.filter(u=>u.side==='enemy').length};
    if(policy!=='wait') for(let step=0;step<20 && s.phase==='player';step++) {
      let best, baseline=evaluate(s,policy);
      for(const u of s.units.filter(u=>u.side==='player' && (policy!=='king-only'||u.kind==='king'))) for(const a of R.legalActions(s,u.id)) {
        const r=R.submitAction(s,a); if(!r.effect) continue;
        const score=evaluate(r.state,policy);
        if(score>baseline && (!best || score>best.score)) best={s:r.state,a,score};
      }
      if(!best) break;
      s=best.s; round.actions.push({actor:best.a.actor,type:best.a.type,to:best.a.to,direction:best.a.direction});
    }
    if(s.phase==='player') s=R.endTurn(s).state;
    round.kingHp=R.king(s,'player')?.hp||0; round.kills=s.kills; round.phase=s.phase;
    log.push(round);
  }
  return {buff,policy,initial,opening,result:s.result||s.phase,turn:s.turn,wave:s.wave,
    kills:s.kills,gold:s.gold,kingHp:R.king(s,'player')?.hp||0,
    survivors:s.units.filter(u=>u.side==='player'&&u.kind!=='king').map(u=>u.id),log};
}
const results=[];
for(const buff of ['health','move','rescue']) for(const policy of ['wait','greedy-attack','greedy-safe','king-only']) results.push(run(buff,policy));
function protectOpening() {
  let s=R.newGame(); if(s.phase==='deploy')s=R.confirmDeployment(s);
  s=R.chooseCommanderBuff(s,'move'); const log=[];
  for(const [id,to,mode] of [['starting-pawn',{x:1,y:4}],['starting-cannon',{x:4,y:2}],['starting-cannon',{x:4,y:4}]]) {
    const r=R.submit(s,id,to,mode); if(!r.effect)return{error:'opening action rejected',id,to};
    s=r.state;log.push({actor:id,to});
  }
  const r=R.submitDirection(s,'starting-spearman',0);if(!r.effect)return{error:'spear action rejected'};
  s=R.endTurn(r.state).state;
  return{log,kills:s.kills,allies:s.units.filter(u=>u.side==='player').map(u=>({id:u.id,hp:u.hp,maxHp:u.maxHp})),turn:s.turn};
}
const openingSolution=protectOpening();
const afterHash=crypto.createHash('sha256').update(fs.readFileSync(rulesPath)).digest('hex');
console.log(JSON.stringify({rulesSHA256:beforeHash,sourceUnchanged:beforeHash===afterHash,
  methodology:'12 deterministic diagnostic samples, no upgrades/redeployment; not human win-rate; no injected state',openingSolution,results},null,2));
