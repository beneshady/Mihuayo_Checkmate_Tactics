// 确定性 beam search 仅用于生成验收动作记录，不进入游戏 AI。
const R=require('../.test/rules/game.js');
const fs=require('node:fs');
function score(s){
  const r=s.units.find(u=>u.id==='rook'), k=R.king(s,'player'), e=R.king(s,'enemy');
  if(!k||!r||s.result==='dead')return -1e6;
  return (s.wave-1)*220+(s.phase==='shop'?190:0)+(s.result==='victory'?500:0)+s.kills*18+r.xp*12+k.hp*25-(e?e.hp*22:0)-s.turn*3-(e?(Math.abs(r.x-e.x)+Math.abs(r.y-e.y))*2:0);
}
function find(branch){
  let beam=[{s:R.newGame(),log:[]}];const seen=new Set();
  for(let depth=0;depth<80;depth++){
    const next=[];
    for(const {s,log} of beam){
      if(s.result==='victory'&&s.highestLevel===3&&log.some(a=>a.actor==='ally')){return log;}
      if(s.phase==='result')continue;
      if(s.phase==='shop'){
        if(s.highestLevel<2)continue;
        next.push({s:R.nextWave(R.buy(s,branch)),log:[...log,{buy:branch}]});continue;
      }
      const candidates=[];
      for(const u of s.units.filter(u=>u.side==='player'&&!u.acted))for(const a of R.legalActions(s,u.id)){
        const n=R.submit(s,u.id,a.to).state;candidates.push({s:n,log:[...log,{actor:u.id,to:a.to}]});
      }
      candidates.push({s:R.endTurn(s),log:[...log,{end:true}]});
      for(const c of candidates){
        if(score(c.s)<-1e5)continue;
        const key=JSON.stringify([c.s.wave,c.s.phase,c.s.units,c.s.intents]);if(seen.has(key))continue;seen.add(key);next.push(c);
      }
    }
    next.sort((a,b)=>score(b.s)-score(a.s));beam=next.slice(0,160);
    if(depth%10===0)console.log(branch,depth,beam.length,beam[0]&&score(beam[0].s));
  }
  throw Error('未找到 '+branch);
}
fs.mkdirSync('game/tests/replays',{recursive:true});
for(const branch of ['horse','cannon']){const log=find(branch);fs.writeFileSync(`game/tests/replays/${branch}.json`,JSON.stringify(log,null,2)+'\n');console.log(branch,log.length);}
