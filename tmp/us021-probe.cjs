// 临时探针：核对 US-021 规则细节，不作为交付证据。
const R=require('../web/js/rules.js');
const land=()=>{const t={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)t[x+','+y]='land';return t;};
function mk(units,opts){const s=R.emptyState(units);s.phase='player';s.tiles=Object.assign(land(),(opts&&opts.tiles)||{});Object.assign(s,opts||{});if(opts&&opts.tiles)s.tiles=Object.assign(land(),opts.tiles);return s;}
const U=R.unit;const G=(s,id)=>s.units.find(u=>u.id===id);
const H=(s,id,x,y,mode)=>R.actionAt(s,G(s,id),{x,y},mode);
const submit=(s,id,x,y,mode)=>R.submit(s,id,{x,y},mode);
const show=(...a)=>console.log(...a.map(v=>typeof v==='object'?JSON.stringify(v):v));

console.log('--- 基础跳跃 & 行动顺序');
let s=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4),U('e1','enemy','pawn',3,2),U('e2','enemy','pawn',5,2),U('f1','player','pawn',4,1),U('d','enemy','pawn',5,3)]);
show('四方向2格', H(s,'h',4,2,'horse-jump'), '1格', H(s,'h',4,3,'horse-jump'), '3格', H(s,'h',4,1,'horse-jump'), '斜向', H(s,'h',5,3,'horse-jump'), '原地', H(s,'h',4,4,'horse-jump'));
const j=submit(s,'h',4,2,'horse-jump');
show('跳跃后', j.state.units.map(u=>[u.id,u.x,u.y,u.hp]).join('|'), 'kills',j.state.kills,'sp',j.state.teamSp,'跳后能否移动',H(j.state,'h',5,2));
console.log('--- 先移后跳');
let s2=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)]);
const m=submit(s2,'h',5,6);show('移动后 ap',G(m.state,'h').ap,'jumpUsed',G(m.state,'h').horseJumpUsed,'跳可用',H(m.state,'h',5,4,'horse-jump'));

console.log('--- 水中 & 越障碍');
let s3=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',2,4)],{tiles:{'2,4':'water'}});
show('水中跳',H(s3,'h',2,2,'horse-jump'),'水中移出',H(s3,'h',3,2));
let s4=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4),U('b','player','pawn',4,3),U('w','enemy','pawn',5,2)],{tiles:{'4,2':'mountain'}});
show('越过棋子+山落空',H(s4,'h',4,2,'horse-jump'),'落山',H(s4,'h',4,2,'horse-jump'),'落水',(()=>{const t=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)],{tiles:{'4,2':'water'}});return H(t,'h',4,2,'horse-jump')})(),'落界外',H(s4,'h',4,0,'horse-jump'),'落友军',H(s4,'h',3,2,'horse-jump'));
// 越尸
let s4b=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)]);s4b.corpses.push({id:'c',x:4,y:3,unit:U('dead','player','pawn',4,3)});
show('越尸',H(s4b,'h',4,2,'horse-jump'));

console.log('--- 购买');
let b=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)]);b.teamSp=1;
show('推动 2SP 不足',R.purchaseUpgrade(b,'h','horse-push')===b);
let b2=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)]);b2.teamSp=5;
let p1=R.purchaseUpgrade(b2,'h','horse-push');show('推动后面',G(p1,'h').horsePush,'sp',p1.teamSp);
let p2=R.purchaseUpgrade(p1,'h','horse-jump-distance');show('距离',R.horseJumpRangeOf(G(p2,'h')),'sp',p2.teamSp);
let p3=R.purchaseUpgrade(p2,'h','horse-jump-damage');show('伤害',R.horseJumpDamageOf(G(p3,'h')),'sp',p3.teamSp);
show('重复解锁',R.purchaseUpgrade(p3,'h','horse-push')===p3);
let maxed=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)]);maxed.teamSp=99;
for(let i=0;i<5;i++)maxed=R.purchaseUpgrade(maxed,'h','horse-jump-distance');
show('距离上限',R.horseJumpRangeOf(G(maxed,'h')),'sp',maxed.teamSp);
for(let i=0;i<5;i++)maxed=R.purchaseUpgrade(maxed,'h','horse-jump-damage');
show('伤害上限',R.horseJumpDamageOf(G(maxed,'h')),'sp',maxed.teamSp);

console.log('--- 推动');
let ps=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4),U('e','enemy','pawn',4,1),U('f','player','rook',3,2),U('wall','enemy','rook',5,2)]);ps.teamSp=2;ps=R.purchaseUpgrade(ps,'h','horse-push');
const pj=R.submit(ps,'h',{x:4,y:2},'horse-jump');
show('push effect',pj.effect.pushes,'事后',pj.state.units.map(u=>[u.id,u.x,u.y,u.hp]).join('|'),'山',pj.effect.mountains);
// 尸体推动
let pc=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)]);pc.teamSp=2;pc.corpses=[{id:'cb',x:3,y:2,unit:U('dead','player','pawn',3,2)},{id:'cw',x:5,y:2,unit:U('dead','enemy','pawn',5,2)}];pc.tiles['4,2']='land';pc.tiles['2,2']='land';pc.tiles['6,2']='water';
pc=R.purchaseUpgrade(pc,'h','horse-push');
const pcj=R.submit(pc,'h',{x:4,y:2},'horse-jump');
show('尸体推动',pcj.effect.pushes,'corpses',pcj.state.corpses.map(c=>[c.unit.id,c.x,c.y]));
// 山两次
let mt=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)],{tiles:{'4,1':'mountain','5,3':'mountain'}});
let j1=submit(mt,'h',4,2,'horse-jump');
show('山1',j1.effect.mountains, j1.state.tiles['4,1'], j1.state.tiles['5,3']);
G(j1.state,'h').horseJumpUsed=false;G(j1.state,'h').ap=1;
let j2=submit(j1.state,'h',4,4,'horse-jump');
show('山2',j2.effect.mountains, j2.state.tiles['4,1'], j2.state.tiles['5,3']);
// 高伤害不多算山
let mt2=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4)],{tiles:{'4,1':'mountain'},teamSp:2});
mt2=R.purchaseUpgrade(mt2,'h','horse-jump-damage');
let j3=submit(mt2,'h',4,2,'horse-jump');show('强化伤害对山',j3.effect.mountains,j3.state.tiles['4,1']);

console.log('--- 树林闪避');
function forestCase(seed){const s=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4),U('fa','enemy','pawn',4,1),U('fb','player','pawn',3,2)],{tiles:{'4,1':'forest','3,2':'forest'},teamSp:2});s.rng=seed;s.phase='player';const b=R.purchaseUpgrade(s,'h','horse-push',undefined);const r=R.submit(b,'h',{x:4,y:2},'horse-jump');return {misses:r.effect.misses,pushes:r.effect.pushes,units:r.state.units.map(u=>[u.id,u.x,u.y,u.hp])};}
show('seed0',forestCase(0));
show('seed200',forestCase(200));
show('seed500',forestCase(500));

console.log('--- 暴风雪山/入水/友军尸体');
let f14=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',4,4),U('ally','player','pawn',4,1),U('east','enemy','pawn',5,2)],{teamSp:2,tiles:{'2,2':'water'}});
f14=R.purchaseUpgrade(f14,'h','horse-push');
G(f14,'ally').hp=1;
const r14=R.submit(f14,'h',{x:4,y:2},'horse-jump');
show('友军尸体推动',r14.effect.pushes,'corpses',r14.state.corpses.map(c=>[c.unit.id,c.x,c.y]),'victims',r14.effect.victims,'units',r14.state.units.map(u=>[u.id,u.x,u.y,u.hp]));

console.log('--- 双王同亡');
let both=mk([U('king','player','king',4,0),U('boss','enemy','king',4,1),U('h','player','horse',4,3),U('x','enemy','pawn',3,2)],{teamSp:0});
G(both,'king').hp=1;G(both,'boss').hp=1;
const rb=R.submit(both,'h',{x:4,y:2},'horse-jump');
show('双亡',rb.effect.victims,'result',rb.state.result,'phase',rb.state.phase,'bossAlive',!!G(rb.state,'boss'),'kingAlive',!!G(rb.state,'king'));

console.log('--- 敌方马不变');
let en=mk([U('king','player','king',4,0),U('boss','enemy','king',4,8),U('eh','enemy','horse',1,4),U('leg','player','pawn',1,3)]);
show('敌方日字',H(en,'eh',2,2),'跳模式',H(en,'eh',1,2,'horse-jump'),'马腿挡',H(en,'eh',3,5));
show('敌方意图',R.generateIntents(en).map(i=>[i.actor,i.type,JSON.stringify(i.to)]));
add: {
  const en2=mk([U('king','player','king',4,0),U('boss','enemy','king',4,8),U('eh','enemy','horse',2,4),U('t','player','pawn',4,5)]);
  show('敌方攻击意图',R.generateIntents(en2).map(i=>[i.actor,i.type,JSON.stringify(i.to)]));
}

console.log('--- 旧档迁移');
const old=R.newGame();
const oldHorse=old.party.find(u=>u.kind==='horse');
delete oldHorse.horseJumpRange;delete oldHorse.horseJumpDamage;delete oldHorse.horsePush;delete oldHorse.horseJumpUsed;
const rec=R.journeyRecord(old);
const loaded=R.stateFromJourney(rec);
const lh=loaded.party.find(u=>u.kind==='horse');
show('迁移字段',[lh.horseJumpRange,lh.horseJumpDamage,lh.horsePush,lh.horseJumpUsed],'teamSp',loaded.teamSp,'id',lh.id,'kills',lh.kills);
const again=R.stateFromJourney(R.journeyRecord(loaded));
show('重复迁移',[again.party.find(u=>u.kind==='horse').horseJumpRange,again.teamSp]);
// 已强化不被覆盖
const enhanced=R.stateFromJourney(rec);const eh=enhanced.party.find(u=>u.kind==='horse');eh.horseJumpRange=4;eh.horseJumpDamage=3;eh.horsePush=true;
const keep=R.stateFromJourney(R.journeyRecord(enhanced));const kh=keep.party.find(u=>u.kind==='horse');
show('强化保留',[kh.horseJumpRange,kh.horseJumpDamage,kh.horsePush]);
// 已用旧行动
const used=R.newGame();const u2=used.party.find(x=>x.kind==='horse');u2.ap=0;delete u2.horseJumpUsed;
const migrated=R.migrateState(used);show('ap0 迁移 horseJumpUsed',migrated.units.find(u=>u.id==='starting-horse')?migrated.units.find(u=>u.id==='starting-horse').horseJumpUsed:'(no unit)');

console.log('--- 疾行');
function dash(extra){const s=mk([U('king','player','king',4,0),U('boss','enemy','king',0,8),U('h','player','horse',2,2)]);s.buffs={health:false,move:true,rescue:false};if(extra)extra(s);return s;}
let d1=dash();show('日字(4,3)',H(d1,'h',4,3),'扩展(2,3)',H(d1,'h',2,3),'扩展(2,4)',H(d1,'h',2,4),'斜邻(3,3)',H(d1,'h',3,3));
let d2=dash(s=>{s.units.push(U('leg','player','pawn',3,2));});show('马腿挡(3,2)',H(d2,'h',4,3),'同格另一路线? (2,4)',H(d2,'h',2,4));
let d3=dash(s=>{s.units.push(U('ref','player','pawn',4,3));});show('参照格被占(4,3)',H(d3,'h',4,4),'参照占(4,1)',H(d3,'h',4,0));
let d4=dash(s=>{s.units.push(U('leg','player','pawn',3,2));s.teamSp=2;});d4=R.purchaseUpgrade(d4,'h','horse-push');show('解锁后免马腿(4,3)',H(d4,'h',4,3));
show('疾行不增技能距离',H(d1,'h',2,4,'horse-jump'),'2格',H(d1,'h',2,0,'horse-jump'));
