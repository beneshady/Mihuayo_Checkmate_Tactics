// 临时模拟：按正常流程（跳过教学→营地招募马→换阵→布阵→战斗）寻找 US-021 H20 的可复现链路。
const R=require('../web/js/rules.js');
const map=()=>R.defaultMap();
function campState(){const s=R.newGame();s.phase='intermission';const c=R.enterCamp(s);return c;}
let s=campState();
console.log('camp gold',s.gold,'sp',s.teamSp,'party',s.party.map(u=>u.id),'active',s.activeIds);
s=R.buy(s,'horse');console.log('after recruit gold',s.gold,'party',s.party.map(u=>u.id),'active',s.activeIds,'bench',s.bench);
s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='starting-horse').concat('recruit-horse-0'));
console.log('roster active',s.activeIds,'bench',s.bench);
let lv=R.startLevel(s,map());
console.log('deploy units',lv.units.map(u=>[u.id,u.kind,u.x,u.y]));
// 布阵：马放到 (7,3)
const horseId=lv.activeIds.find(id=>(lv.party.find(u=>u.id===id)||{}).kind==='horse');
const H=(st)=>st.units.find(u=>u.id===horseId);
lv=R.deploy(lv,horseId,{x:7,y:3});
let live=R.confirmDeployment(lv);
console.log('horse',H(live).x,H(live).y,'sp',live.teamSp,'phase',live.phase);
// 第一回合：直接跳跃到 (7,4)
let r=R.submit(live,horseId,{x:7,y:4},'horse-jump');
console.log('jump1 effect',!!r.effect,r.effect&&r.effect.hits.map(h=>[h.id,h.damage]),'victims',r.effect&&r.effect.victims,'sp',r.state.teamSp,'horse',H(r.state).x,H(r.state).y);
live=r.state;
let bought=R.purchaseUpgrade(live,horseId,'horse-jump-distance');
console.log('buy distance ->',R.horseJumpRangeOf(H(bought)),'sp',bought.teamSp);
live=bought;
const out=R.endTurn(live);
live=out.state;
console.log('after enemy turn phase',live.phase,'turn',live.turn,'horse',H(live)&&[H(live).x,H(live).y],'units',live.units.filter(u=>u.side==='player').map(u=>[u.id,u.x,u.y,u.hp]));
console.log('enemy effects',out.effects.map(e=>[e.actor,e.status,e.damage]));
const acts=R.legalActions(live,horseId).filter(a=>a.type==='horse-jump');
console.log('jump options turn2',acts.map(a=>[a.to.x,a.to.y,a.distance]));

