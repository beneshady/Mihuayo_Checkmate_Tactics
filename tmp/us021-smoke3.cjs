const R=require('../web/js/rules.js');
function base(x,y){const s=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',8,8),R.unit('h','player','horse',x,y)]);s.phase='player';s.tiles={};for(let yy=0;yy<9;yy++)for(let xx=0;xx<9;xx++)s.tiles[xx+','+yy]='land';return s;}
let s=base(2,2);
console.log('base day (4,3)',!!R.actionAt(s,s.units.find(u=>u.id==='h'),{x:4,y:3}));
console.log('base expanded (2,4) no buff',!!R.actionAt(s,s.units.find(u=>u.id==='h'),{x:2,y:4}));
s.buffs={health:false,move:true,rescue:false};
console.log('buff expanded (2,4) via (1,4)/(3,4)',!!R.actionAt(s,s.units.find(u=>u.id==='h'),{x:2,y:4}));
s.units.push(R.unit('block','player','pawn',3,2));
console.log('buff expanded (4,3) leg blocked',!!R.actionAt(s,s.units.find(u=>u.id==='h'),{x:4,y:3}));  // leg (3,2) blocked
// 参照格占用不阻止
s.units.push(R.unit('ref','player','pawn',1,4));
console.log('ref occupied (1,4) itself not landing; (2,4) still ok',!!R.actionAt(s,s.units.find(u=>u.id==='h'),{x:2,y:4}));
// 解锁后免马腿
let s2=base(2,2);s2.units.push(R.unit('block','player','pawn',3,2));s2.teamSp=2;let n=R.purchaseUpgrade(s2,'h','horse-push');
console.log('unlock leg (4,3)',!!R.actionAt(n,n.units.find(u=>u.id==='h'),{x:4,y:3}));
console.log('move type',R.actionAt(n,n.units.find(u=>u.id==='h'),{x:4,y:3}).type);
// 疾行不改变技能距离
let s3=base(2,2);s3.buffs={health:false,move:true,rescue:false};
console.log('jump dist 2',!!R.actionAt(s3,s3.units.find(u=>u.id==='h'),{x:2,y:4},'horse-jump'));
console.log('jump dist 3',!!R.actionAt(s3,s3.units.find(u=>u.id==='h'),{x:2,y:5},'horse-jump'));
// 技能距离升级
let s4=base(2,2);s4.teamSp=1;let n4=R.purchaseUpgrade(s4,'h','horse-jump-distance');
console.log('range2->3 jump 3',!!R.actionAt(n4,n4.units.find(u=>u.id==='h'),{x:2,y:5},'horse-jump'));
