// 临时搜索：为 US018 S15 浏览器脚本找一条正常规则内、自然赚到 >=5 金币/SP 的首关路线。
const R=require('../web/js/rules.js');
const SEED=20261018;
function heur(s){
  const k=R.king(s,'player');if(!k||s.result==='dead'||s.result==='mate')return -1e9;
  const own=s.units.filter(u=>u.side==='player');
  return (s.phase==='intermission'?1e6:0)+s.kills*1000+k.hp*60+s.hp*20+own.reduce((n,u)=>n+u.hp*8+4,0)
    +s.units.filter(u=>u.side==='enemy').length*-30-SEED*0+(s.turn||1)*-3;
}
function sig(s){return JSON.stringify([s.phase,s.turn,s.wave,s.gold,s.teamSp,s.kills,s.units,s.corpses,s.intents]);}
function actList(s,u){return R.legalActions(s,u.id);}
function expandTurn(start,width,depth){
  let layer=[{s:start,acts:[]}],best=[{s:start,acts:[]}];
  for(let step=0;step<depth;step++){
    const next=[];
    for(const n of layer){
      const st=n.s;
      for(const u of st.units.filter(u=>u.side==='player')){
        for(const a of actList(st,u)){
          const r=R.submitAction(st,a);if(!r.effect)continue;
          if(r.effect.preview)continue;
          next.push({s:r.state,acts:n.acts.concat([{actor:a.actor,type:a.type,to:a.type==='directional'?null:cp(a.to),direction:a.type==='directional'?a.direction:undefined}])});
        }
      }
    }
    if(!next.length)break;
    next.sort((a,b)=>heur(b.s)-heur(a.s));
    layer=next.slice(0,width);best=best.concat(layer);
  }
  return best;
}
function cp(v){return JSON.parse(JSON.stringify(v));}
function walk(buff){
  let s=R.newGame();s.rng=SEED;
  s=R.chooseCommanderBuff(R.confirmDeployment(s),buff);
  let beam=[{s,log:[]}];const seen=new Set();
  for(let turn=0;turn<12;turn++){
    const next=[];
    for(const n of beam){
      if(n.s.phase==='intermission'){next.push(n);continue;}
      if(n.s.phase!=='player')continue;
      for(const cand of expandTurn(n.s,45,5)){
        const ended=R.endTurn(cand.s);
        next.push({s:ended.state,log:n.log.concat([{turn:cand.s.turn,acts:cand.acts}])});
        if(ended.state.phase==='player'&&ended.state.result===undefined&&ended.state.turn!==cand.s.turn){
          // 也保留不结束回合的分支（同回合继续行动），交给下一层
        }
      }
    }
    if(!next.length)break;
    next.sort((a,b)=>heur(b.s)-heur(a.s));
    beam=[];const local=new Set();
    for(const n of next){
      const k=sig(n.s);if(local.has(k))continue;local.add(k);beam.push(n);
      if(beam.length>=160)break;
    }
    console.log('turn',turn+1,'beam',beam.length,'best',JSON.stringify({phase:beam[0].s.phase,turn:beam[0].s.turn,gold:beam[0].s.gold,teamSp:beam[0].s.teamSp,kills:beam[0].s.kills,kingHp:R.king(beam[0].s,'player')?.hp}));
    if(beam.some(n=>n.s.phase==='intermission'))break;
  }
  const best=beam.filter(n=>n.s.phase==='intermission').sort((a,b)=>heur(b.s)-heur(a.s))[0]||beam.sort((a,b)=>heur(b.s)-heur(a.s))[0];
  return best;
}
for(const buff of ['health','move']){
  const best=walk(buff);
  console.log('=== buff',buff,'===',JSON.stringify({phase:best.s.phase,gold:best.s.gold,teamSp:best.s.teamSp,kills:best.s.kills,turn:best.s.turn}));
  console.log(JSON.stringify(best.log));
}
