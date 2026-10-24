const R=require('../web/js/rules.js');
let s=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',0,8),R.unit('h','player','horse',4,4),R.unit('e','enemy','pawn',6,7)]);
s.phase='player';
let m=R.submit(s,'h',{x:5,y:6},undefined);
let j=R.submit(m.state,'h',{x:6,y:6},'horse-jump');
const h=j.state.units.find(u=>u.id==='h');
console.log('jump effect',!!j.effect,'e alive',!!j.state.units.find(u=>u.id==='e'),'h',h.x,h.y,'used',h.horseJumpUsed,'ap',h.ap,'sp',j.state.teamSp);
console.log('move after jump',!!R.actionAt(j.state,h,{x:5,y:6},undefined));
let s3=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',0,8),R.unit('h','player','horse',4,4),R.unit('e','enemy','pawn',4,1),R.unit('a','enemy','rook',5,2),R.unit('f','player','pawn',3,2)]);
s3.phase='player';s3.teamSp=2;
let bought=R.purchaseUpgrade(s3,'h','horse-push');
let j2=R.submit(bought,'h',{x:4,y:2},'horse-jump');
if(!j2.effect){console.log('no effect');process.exit(1);}
const find=id=>{const u=j2.state.units.find(x=>x.id===id);return u?[u.x,u.y,u.hp]:null};
console.log('push effect',JSON.stringify({e:find('e'),a:find('a'),f:find('f'),h:find('h'),pushes:j2.effect.pushes,victims:j2.effect.victims,corpses:j2.state.corpses.map(c=>[c.unit.id,c.x,c.y]),sp:j2.state.teamSp}));
// 山体
let s4=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',0,8),R.unit('h','player','horse',4,4)]);
s4.phase='player';s4.tiles={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)s4.tiles[x+','+y]='land';s4.tiles['4,1']='mountain';s4.tiles['5,3']='mountain';
let j3=R.submit(s4,'h',{x:4,y:2},'horse-jump');
console.log('rocks1',JSON.stringify({mountains:j3.effect.mountains,hits:j3.effect.hits,tiles:[j3.state.tiles['4,1'],j3.state.tiles['5,3']]}));
let j4=R.submit(j3.state,'h',{x:4,y:4},'horse-jump');
console.log('rocks2',JSON.stringify({mountains:j4.effect.mountains,hits:j4.effect.hits,tiles:[j4.state.tiles['4,1'],j4.state.tiles['5,3']]}));
