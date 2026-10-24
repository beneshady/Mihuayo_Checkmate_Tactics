// 临时探针 2：核对 US-021 边界细节，不作为交付证据。
const R=require('../web/js/rules.js');
const land=()=>{const t={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)t[x+','+y]='land';return t;};
function mk(units,opts){const s=R.emptyState(units);s.phase='player';s.tiles=Object.assign(land(),(opts&&opts.tiles)||{});Object.assign(s,opts||{});if(opts&&opts.tiles)s.tiles=Object.assign(land(),opts.tiles);if(!opts||opts.phase===undefined)s.phase='player';return s;}
const U=R.unit;const G=(s,id)=>s.units.find(u=>u.id===id);
const H=(s,id,x,y,mode)=>R.actionAt(s,G(s,id),{x,y},mode);
const show=(...a)=>console.log(...a.map(v=>typeof v==='object'?JSON.stringify(v):v));

console.log('--- H16 疾行：对角扩展不应存在 + 参照格占用');
const d1=(()=>{const s=mk([U('king','player','king',8,0),U('boss','enemy','king',0,8),U('h','player','horse',2,2)]);s.buffs={health:false,move:true,rescue:false};return s;})();
show('日字(4,3)',!!H(d1,'h',4,3),'扩展(2,3)应是?',!!H(d1,'h',2,3),'扩展(3,3)',!!H(d1,'h',3,3),'对角扩展(5,4)应否',!!H(d1,'h',5,4),'无疾行时(2,3)',(()=>{const s=mk([U('king','player','king',8,0),U('boss','enemy','king',0,8),U('h','player','horse',2,2)]);return !!H(s,'h',2,3)})());
const d3=(()=>{const s=mk([U('king','player','king',8,0),U('boss','enemy','king',0,8),U('h','player','horse',2,2)]);s.buffs={health:false,move:true,rescue:false};s.units.push(U('ref','player','pawn',4,3));return s;})();
show('参照(4,3)被占 → (4,4)仍可选',!!H(d3,'h',4,4));

console.log('--- H09 山两次命中');
const mt=mk([U('king','player','king',0,0),U('boss','enemy','king',8,8),U('h','player','horse',4,4)],{tiles:{'4,1':'mountain','5,3':'mountain'}});
const j1=R.submit(mt,'h',{x:4,y:2},'horse-jump');
show('山1',j1.effect.mountains,j1.state.tiles['4,1'],'位置',G(j1.state,'h').x,G(j1.state,'h').y);
G(j1.state,'h').horseJumpUsed=false;G(j1.state,'h').ap=1;
const j2=R.submit(j1.state,'h',{x:4,y:0},'horse-jump');
show('山2',j2.effect.mountains,j2.state.tiles['4,1']);
// 伤害提升不多算山
const mt2=(()=>{const s=mk([U('king','player','king',0,0),U('boss','enemy','king',8,8),U('h','player','horse',4,4)],{tiles:{'4,1':'mountain'}});s.teamSp=2;return R.purchaseUpgrade(s,'h','horse-jump-damage');})();
const j3=R.submit(mt2,'h',{x:4,y:2},'horse-jump');
show('强化伤害对山次数',j3.effect.mountains,j3.state.tiles['4,1']);

console.log('--- H05 四邻伤害/斜邻不受/友军');
const h5=mk([U('king','player','king',0,0),U('boss','enemy','king',8,8),U('h','player','horse',4,4),U('n','enemy','pawn',4,1),U('e','enemy','pawn',5,2),U('s','player','rook',4,3),U('w','player','pawn',3,2),U('diag','enemy','pawn',5,3)]);
const r5=R.submit(h5,'h',{x:4,y:2},'horse-jump');
show('hits',r5.effect.hits.map(h=>[h.id,h.damage,h.directDamage]),'diag存活',!!G(r5.state,'diag'),'落点',G(r5.state,'h').x,G(r5.state,'h').y);
// 强化伤害
const h5b=mk([U('king','player','king',0,0),U('boss','enemy','king',8,8),U('h','player','horse',4,4),U('n','enemy','pawn',4,1),U('s','player','rook',4,3)],{teamSp:2});
const h5c=R.purchaseUpgrade(h5b,'h','horse-jump-damage');
const r5c=R.submit(h5c,'h',{x:4,y:2},'horse-jump');
show('强化伤害2点',r5c.effect.hits.map(h=>[h.id,h.damage]),'victims',r5c.effect.victims);

console.log('--- H14 友军尸体同次外推 + 入水销毁');
const f14=mk([U('king','player','king',0,0),U('boss','enemy','king',8,8),U('h','player','horse',4,4),U('ally','player','pawn',4,1),U('ally2','player','pawn',5,2)],{teamSp:2,tiles:{'6,2':'water'}});
const f14p=R.purchaseUpgrade(f14,'h','horse-push');
G(f14p,'ally').hp=1;G(f14p,'ally2').hp=1;
const r14=R.submit(f14p,'h',{x:4,y:2},'horse-jump');
show('pushes',r14.effect.pushes,'corpses',r14.state.corpses.map(c=>[c.unit.id,c.x,c.y]),'kills',r14.state.kills,'sp',r14.state.teamSp,'victims',r14.effect.victims);

console.log('--- H15 双王同亡');
const both=mk([U('king','player','king',4,1),U('boss','enemy','king',3,2),U('h','player','horse',4,3),U('x','enemy','pawn',5,2)]);
G(both,'king').hp=1;G(both,'boss').hp=1;
const rb=R.submit(both,'h',{x:4,y:2},'horse-jump');
show('victims',rb.effect.victims,'result',rb.state.result,'phase',rb.state.phase,'kingAlive',!!G(rb.state,'king'),'bossAlive',!!G(rb.state,'boss'),'boss邻格也结算',!G(rb.state,'x'));

console.log('--- H07 绊马脚与推动');
const leg=mk([U('king','player','king',8,0),U('boss','enemy','king',0,8),U('h','player','horse',2,2),U('blk','player','pawn',3,2)],{teamSp:2});
show('未解锁日字被挡',!!R.actionAt(leg,G(leg,'h'),{x:4,y:3}));
const legU=R.purchaseUpgrade(leg,'h','horse-push');show('解锁后可走',!!R.actionAt(legU,G(legU,'h'),{x:4,y:3}));

console.log('--- H13 快照/重试/跨关');
let camp=R.newGame();camp.phase='intermission';camp.gold=20;camp.teamSp=10;
const lv=R.startLevel(camp,R.defaultMap());
const horseId=lv.units.find(u=>u.kind==='horse').id;
const snapSp=lv.teamSp;
show('关卡马字段',[G(lv,horseId).horseJumpRange,G(lv,horseId).horseJumpDamage,G(lv,horseId).horsePush],'phase',lv.phase);
const bought=R.purchaseUpgrade(lv,horseId,'horse-push');
show('布阵购买',G(bought,horseId).horsePush,'sp',bought.teamSp,'快照sp',bought.levelSnapshot.teamSp,'快照push',G(bought.levelSnapshot,horseId).horsePush);
const fighting=R.confirmDeployment(bought);
const battleBuy=R.purchaseUpgrade(fighting,horseId,'horse-jump-damage');
show('战斗购买',R.horseJumpDamageOf(G(battleBuy,horseId)),'sp',battleBuy.teamSp);
const dead=R.copy(battleBuy);dead.result='dead';dead.phase='result';
const retry=R.retryLevel(dead);
show('重试后 push/dmg/sp',G(retry,horseId).horsePush,R.horseJumpDamageOf(G(retry,horseId)),retry.teamSp,'phase',retry.phase);
const campReady=R.copy(bought);campReady.phase='intermission';const next=R.nextLevel(campReady,R.defaultMap());
show('下一关 push 保留',G(next,horseId).horsePush,'sp',next.teamSp);

console.log('--- 敌方马走法不变（对照原始公式）');
const en=mk([U('king','player','king',4,0),U('boss','enemy','king',4,8),U('eh','enemy','horse',1,4),U('leg','player','pawn',1,3),U('t','player','pawn',2,2)]);
show('遮挡日字',!!H(en,'eh',2,2),'可走日字',!!H(en,'eh',3,5),'无跳模式',!!H(en,'eh',1,2,'horse-jump'));

