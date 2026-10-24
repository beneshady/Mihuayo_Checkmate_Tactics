// 临时模拟 2：正常流程下逐回合观察，寻找稳定链路。
const R=require('../web/js/rules.js');
const map=()=>R.defaultMap();
function showBoard(s,tag){console.log(tag,'turn',s.turn,'phase',s.phase,'sp',s.teamSp,'kills',s.kills);console.log('  player',s.units.filter(u=>u.side==='player').map(u=>[u.id,u.kind,u.x,u.y,u.hp]));console.log('  enemy ',s.units.filter(u=>u.side==='enemy').map(u=>[u.id,u.kind,u.x,u.y,u.hp]));console.log('  intents',s.intents.map(i=>[i.actor,i.type,JSON.stringify(R.intentTarget(s,i))]));}
let s=R.newGame();s.phase='intermission';s=R.enterCamp(s);s=R.buy(s,'horse');s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='starting-horse').concat('recruit-horse-0'));
let lv=R.startLevel(s,map());
const horseId='recruit-horse-0';
lv=R.deploy(lv,horseId,{x:7,y:3});
let live=R.confirmDeployment(lv);
showBoard(live,'after confirm');
const H=st=>st.units.find(u=>u.id===horseId);
console.log('jump options',R.legalActions(live,horseId).filter(a=>a.type==='horse-jump').map(a=>[a.to.x,a.to.y,a.distance]));
let r=R.submit(live,horseId,{x:7,y:5},'horse-jump');
console.log('jump1',!!r.effect, r.effect&&r.effect.hits.map(h=>[h.id,h.damage]), r.effect&&r.effect.victims, 'sp', r.state.teamSp);
live=r.state;
let b=R.purchaseUpgrade(live,horseId,'horse-jump-distance');
console.log('buy distance',R.horseJumpRangeOf(H(b)),'sp',b.teamSp);
live=b;
const out=R.endTurn(live);live=out.state;
showBoard(live,'after turn1');
console.log('turn1 effects',out.effects.map(e=>[e.actor,e.status,e.damage]));
console.log('jump options t2',R.legalActions(live,horseId).filter(a=>a.type==='horse-jump').map(a=>[a.to.x,a.to.y,a.distance]));
