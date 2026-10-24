const R=require('../web/js/rules.js');
function show(x){console.log(JSON.stringify(x));}
// 基础跳跃：马 (4,4)，落点 (4,2)，四邻格敌人
let s=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',0,8),R.unit('h','player','horse',4,4),R.unit('e1','enemy','pawn',3,2),R.unit('e2','enemy','pawn',5,2),R.unit('f1','player','pawn',4,1),R.unit('d','enemy','pawn',5,3)]);
s.phase='player';
console.log('jump action',!!R.actionAt(s,s.units.find(u=>u.id==='h'),{x:4,y:2},'horse-jump'));
let r=R.submit(s,'h',{x:4,y:2},'horse-jump');
console.log('state units',r.state.units.map(u=>[u.id,u.hp,u.x,u.y]));
console.log('effect',JSON.stringify({hits:r.effect.hits,victims:r.effect.victims,to:r.effect.to,status:r.effect.status}));
console.log('killled',r.state.kills,'sp',r.state.teamSp);
// after jump cannot move
console.log('after jump move?',R.actionAt(r.state,r.state.units.find(u=>u.id==='h'),{x:5,y:2},undefined));
// normal move then jump
let s2=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',0,8),R.unit('h','player','horse',4,4)]);
s2.phase='player';
let m=R.submit(s2,'h',{x:5,y:6},undefined);
console.log('move ok',!!m.effect,[m.state.units.find(u=>u.id==='h').x,m.state.units.find(u=>u.id==='h').y],m.state.units.find(u=>u.id==='h').ap,m.state.units.find(u=>u.id==='h').horseJumpUsed);
console.log('jump after move',!!R.actionAt(m.state,m.state.units.find(u=>u.id==='h'),{x:5,y:4},'horse-jump'));

