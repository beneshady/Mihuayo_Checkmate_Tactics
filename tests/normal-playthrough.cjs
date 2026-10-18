// 正式入口合法命令生成器；不注入局面、金币、SP或阶段。
const R=require('../web/js/rules.js');
function score(s){const k=R.king(s,'player');if(!k||s.result==='dead')return -100000;return (s.result==='victory'?10000:0)+k.hp*100+s.kills*25+s.units.filter(u=>u.side==='player'&&u.kind!=='king').reduce((v,u)=>v+u.hp*3+4,0);}
function generate(buff='move',initialState){
 let s=initialState?R.copy(initialState):R.newGame();const steps=[];
 function add(step,next){steps.push({...step,expected:{phase:next.phase,wave:next.wave,turn:next.turn,gold:next.gold,teamSp:next.teamSp,kills:next.kills,units:next.units.map(u=>[u.id,u.x,u.y,u.hp,u.kills])}});s=next;}
 add({type:'deploy',actor:'rook',to:{x:0,y:1}},R.deploy(s,'rook',{x:0,y:1}));
 add({type:'deploy',actor:'rook',to:{x:0,y:0}},R.deploy(s,'rook',{x:0,y:0}));
 add({type:'confirmDeployment'},R.confirmDeployment(s));
 add({type:'buff',buff},R.chooseCommanderBuff(s,buff));
 for(let guard=0;guard<20&&!['intermission','result'].includes(s.phase);guard++){
  if(s.phase==='rescue'){let best;for(const id of [...s.units.filter(u=>u.side==='player'&&!['king','advisor'].includes(u.kind)).map(u=>u.id),...s.corpses.map(c=>c.unit.id)]){const n=R.rescue(s,id);if(n!==s&&(!best||score(n)>score(best.n)))best={id,n};}if(!best)throw Error('rescue stalled');add({type:'rescue',actor:best.id},best.n);}
  for(let step=0;step<20&&s.phase==='player';step++){let best;const baseline=score(R.enemyPhase(s).state);for(const u of s.units.filter(u=>u.side==='player'))for(const a of R.legalActions(s,u.id)){const r=R.submitAction(s,a);if(!r.effect)continue;const v=score(R.enemyPhase(r.state).state);if(v>baseline&&(!best||v>best.v))best={a,n:r.state,v};}if(!best)break;add({type:'action',action:best.a},best.n);}
  if(s.phase==='player')add({type:'end'},R.endTurn(s).state);
 }
 if(s.phase!=='intermission'||s.wave!==2||s.turn!==11||s.gold<6)throw Error('normal replay failed '+JSON.stringify({phase:s.phase,turn:s.turn,wave:s.wave,gold:s.gold,kills:s.kills}));
 return {steps,state:s};
}
module.exports={generate,R};
