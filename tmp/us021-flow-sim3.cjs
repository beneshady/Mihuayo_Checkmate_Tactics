const R=require('../web/js/rules.js');
let s=R.newGame();s.phase='intermission';s=R.enterCamp(s);s=R.buy(s,'horse');s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='starting-horse').concat('recruit-horse-0'));
let lv=R.startLevel(s,R.defaultMap());const hid='recruit-horse-0';lv=R.deploy(lv,hid,{x:7,y:3});let live=R.confirmDeployment(lv);
const G=(st,id)=>st.units.find(u=>u.id===id);
let r=R.submit(live,hid,{x:7,y:5},'horse-jump');live=r.state;
live=R.purchaseUpgrade(live,hid,'horse-jump-distance');
live=R.copy(live);
let out=R.endTurn(live);live=out.state;
console.log('turn2 horse',G(live,hid)&&[G(live,hid).x,G(live,hid).y,G(live,hid).hp],'sp',live.teamSp);
r=R.submit(live,hid,{x:4,y:5},'horse-jump');live=r.state;
console.log('after jump3 sp',live.teamSp,'horse',G(live,hid)&&[G(live,hid).x,G(live,hid).y]);
out=R.endTurn(live);live=out.state;
console.log('turn3 phase',live.phase,'turn',live.turn,'horse',G(live,hid)&&[G(live,hid).x,G(live,hid).y,G(live,hid).hp],'ap',G(live,hid)&&G(live,hid).ap);
console.log('move options',G(live,hid)?R.legalActions(live,hid).filter(a=>a.type==='move').map(a=>[a.to.x,a.to.y]):null);
console.log('turn3 effects',out.effects.map(e=>[e.actor,e.status,e.damage]));

