// US-010 V2.3 rules: deterministic, no DOM / rendering / IO.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.M0=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
var C={width:9,height:9,river:4,bridges:[{x:1,y:4},{x:4,y:4},{x:7,y:4}],reward:0,price:0,
 playerPalace:{minX:3,maxX:5,minY:0,maxY:2,cx:4,cy:1},enemyPalace:{minX:3,maxX:5,minY:6,maxY:8,cx:4,cy:7},
 spawns:{king:{x:4,y:0},rook:{x:0,y:0},startingCannon:{x:1,y:2},startingPawn:{x:1,y:3},startingArcher:{x:4,y:3},startingSpearman:{x:7,y:3}},
 waveOne:[['pawn',1,5],['pawn',4,5],['pawn',7,5],['rook',8,7],['cannon',1,7],['advisor',3,8],['advisor',5,8],['king',4,8]],
 waveTwo:[['pawn',2,5],['pawn',5,5],['pawn',8,5],['rook',1,7],['cannon',7,7],['horse',4,6]],
 directions:[{x:0,y:1,name:'前'},{x:1,y:0,name:'右'},{x:0,y:-1,name:'后'},{x:-1,y:0,name:'左'}],
 splash:[{x:0,y:1,name:'N'},{x:1,y:1,name:'NE'},{x:1,y:0,name:'E'},{x:1,y:-1,name:'SE'},{x:0,y:-1,name:'S'},{x:-1,y:-1,name:'SW'},{x:-1,y:0,name:'W'},{x:-1,y:1,name:'NW'}],
 // US-018 我方仕固定侧位：玩家坐标 (4,2)/(6,2)，即零基 (3,1)/(5,1)。
 advisorCells:[{x:3,y:1},{x:5,y:1}],advisorPrice:5,advisorMax:2,
 // US-020 旅程层：可部署人口 4→8（每次 5 猫粮）、旅程增益按序解锁（每次 5 猫粮）、首次入营 8 猫粮。
 population:{initial:4,max:8,cost:5},buffCost:5,firstEntryReward:8,
 // US-021 我方马跳跃攻击与三项独立成长：初始距离 2 / 伤害 1 / 推动未解锁；上限 4 / 3 / 一次性解锁。
 horse:{jumpRange:2,maxJumpRange:4,jumpDamage:1,maxJumpDamage:3,pushCost:2,distanceCost:1,damageCost:2},
 // US-022 我方象：牵引初始同线 3 格（每 1 SP 四向 +1，上限 8）、冰封 2 SP 解锁初始 1 个敌方行动阶段
 // （每 2 SP +1，上限 3）、5 猫粮招募、固定 5×5 单敌范围；两技能共享每回合一次技能额度。
 elephant:{price:5,pullRange:3,maxPullRange:8,pullCost:1,freezeUnlockCost:2,freezeDurationCost:2,freezeDuration:1,maxFreezeDuration:3,freezeRadius:2},
 // US-020 教学关（第 0 关）：全陆地独立战局，复用既有棋子与结算；不计入三个正式关卡。
 tutorial:{name:'演武场',info:'教学关：查看敌情、移出危险、撤销移动、消除威胁、结束回合',units:[
  {id:'tut-king',side:'player',kind:'king',x:4,y:0},
  {id:'tut-rook',side:'player',kind:'rook',x:1,y:2},
  {id:'tut-spear',side:'player',kind:'spearman',x:6,y:2},
  {id:'tut-boss',side:'enemy',kind:'king',x:4,y:8},
  {id:'tut-e1',side:'enemy',kind:'pawn',x:1,y:3},
  {id:'tut-e2',side:'enemy',kind:'pawn',x:6,y:3}]}};
function cp(v){return JSON.parse(JSON.stringify(v));}function same(a,b){return!!a&&!!b&&a.x===b.x&&a.y===b.y;}function inside(p){return Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<C.width&&p.y>=0&&p.y<C.height;}
function at(s,p){return s.units.find(function(u){return same(u,p);});}function corpseAt(s,p){return(s.corpses||[]).find(function(c){return same(c,p);});}function occupied(s,p){return at(s,p)||corpseAt(s,p)||mountain(s,p);}function isBridge(p,s){return s&&s.tiles?terrain(s,p)==='bridge':C.bridges.some(function(b){return same(b,p);});}function isWater(p,s){return s&&s.tiles?terrain(s,p)==='water':p.y===C.river&&!isBridge(p);}function king(s,side){return s.units.find(function(u){return u.side===side&&u.kind==='king';});}
function terrain(s,p){return s.tiles?s.tiles[p.x+','+p.y]||'land':isWater(p)?'water':isBridge(p)?'bridge':'land';}
function mountain(s,p){var t=terrain(s,p);return t==='mountain'||t==='cracked';}
function fatalWater(u){return pawnish(u)||u.kind==='cannon';}
function wet(s,u){return isWater(u,s)&&(u.kind==='rook'||u.kind==='horse');}
function safePath(s,u,path){return !fatalWater(u)||!path.some(function(p){return isWater(p,s);});}
function defaultMap(){var tiles={};for(var y=0;y<9;y++)for(var x=0;x<9;x++)tiles[x+','+y]=isWater({x:x,y:y})?'water':isBridge({x:x,y:y})?'bridge':'land';[[0,8],[1,8],[7,8],[8,8],[2,2],[6,6]].forEach(function(p){tiles[p.join(',')]='mountain';});[[0,7],[7,7],[7,6],[8,6],[5,5],[6,5],[2,3],[3,3]].forEach(function(p){tiles[p.join(',')]='forest';});return{version:1,name:'三桥山口',tiles:tiles,units:[unit('king','player','king',4,0)].concat(playerTemplate(),enemyWaveOne()).map(function(u){return{id:u.id,side:u.side,kind:u.kind,x:u.x,y:u.y,rookRole:u.rookRole};})};}
function random(s){s.rng=((s.rng===undefined?0x12345678:s.rng)*1664525+1013904223)>>>0;return s.rng/4294967296;}
// US-022 统一撞山：山体 2 耐久，每撞一次只扣 1（完整山→开裂山→碎石地），累计两次变碎石地；
// 碎石地等同普通陆地（仅视觉区分，可通行、不占位、不阻挡、不作炮架）。直接攻击既有累计受击规则保持。
function rockHit(s,p,e){if(!mountain(s,p))return;e.mountains=e.mountains||[];if(e.mountains.some(function(q){return same(p,q);}))return;var before=terrain(s,p);s.tiles[p.x+','+p.y]=before==='mountain'?'cracked':'rubble';e.mountains.push({x:p.x,y:p.y,before:before,after:terrain(s,p)});}
function directHit(s,u,t,e,amount){if(terrain(s,t)==='forest'){e.conditional=true;if(e.preview){e.conditions=e.conditions||[];e.conditions.push(t.id);}else if(random(s)<.3){e.misses=e.misses||[];e.misses.push(t.id);return false;}}hit(e,t,amount===undefined?u.attack:amount);return true;}
function drown(s,u,e){if(isWater(u,s)&&(fatalWater(u)||u.kind==='king'&&u.side==='player')){u.hp=0;e.waterDeaths=e.waterDeaths||[];e.waterDeaths.push(u.id);}}
// US-021 我方马规则：日字普通移动（可被疾行扩展）+ 独立跳跃攻击（四方向 1～最大距离，落点四邻格直接伤害）。
// 敌方马仍只用原有日字走法，不读取这些字段，也不生成 horse-jump 动作。
function horseJumpRangeOf(u){var v=u&&u.horseJumpRange;return Number.isInteger(v)&&v>=C.horse.jumpRange?Math.min(C.horse.maxJumpRange,v):C.horse.jumpRange;}
function horseJumpDamageOf(u){var v=u&&u.horseJumpDamage;return Number.isInteger(v)&&v>=C.horse.jumpDamage?Math.min(C.horse.maxJumpDamage,v):C.horse.jumpDamage;}
function horseJumpReady(u){return !!u&&u.kind==='horse'&&u.side==='player'&&!u.horseJumpUsed;}
function horseJumpLandingOk(s,u,to){return inside(to)&&!same(u,to)&&!at(s,to)&&!corpseAt(s,to)&&!mountain(s,to)&&!isWater(to,s);}
function horseJumpAction(s,u,to){
 if(!u||u.side!=='player'||u.kind!=='horse'||!horseJumpReady(u)||wet(s,u))return;
 if(!inside(to)||same(u,to))return;
 var dx=to.x-u.x,dy=to.y-u.y;
 if(dx!==0&&dy!==0)return;
 var dist=Math.abs(dx)+Math.abs(dy);
 if(!dist||dist>horseJumpRangeOf(u))return;
 if(!horseJumpLandingOk(s,u,to))return;
 return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:'horse-jump',path:line(u,to),distance:dist,damage:horseJumpDamageOf(u)};
}
function horseLeg(u,dx,dy){return{x:u.x+(Math.abs(dx)===2?Math.sign(dx):0),y:u.y+(Math.abs(dy)===2?Math.sign(dy):0)};}
function horseEnemyShape(s,u,to){var ax=Math.abs(to.x-u.x),ay=Math.abs(to.y-u.y);return ax*ay===2&&!occupied(s,horseLeg(u,to.x-u.x,to.y-u.y));}
// 疾行只增加“日字落点四邻格”候选，不改变技能距离；马腿按对应日字路线判定，
// 原始日字点只作参照：它被占据不阻止选择其周围合法空格，最终落点仍须为空、非山体。
function horseNormalMove(s,u,to){
 if(at(s,to)||corpseAt(s,to)||mountain(s,to))return false;
 var expanded=buffState(s).move,found=false;
 [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(function(d){
  if(found)return;
  var ref={x:u.x+d[0],y:u.y+d[1]};
  if(!inside(ref))return;
  if(!u.horsePush&&occupied(s,horseLeg(u,d[0],d[1])))return;
  if(same(ref,to)){found=true;return;}
  if(expanded)C.directions.forEach(function(v){if(same({x:ref.x+v.x,y:ref.y+v.y},to))found=true;});
 });
 return found;
}
function horseNeighbors(to){return C.directions.map(function(d){return{cell:{x:to.x+d.x,y:to.y+d.y},dir:d};}).filter(function(x){return inside(x.cell);});}
function horsePushRecord(e,id,kind,from,to,status){e.pushes=e.pushes||[];var rec={id:id,kind:kind,from:cp(from),to:to?cp(to):null,status:status};e.pushes.push(rec);return rec;}
function horsePushLive(s,horse,target,dir,e){
 var from={x:target.x,y:target.y},to={x:target.x+dir.x,y:target.y+dir.y};
 // 沿用既有位移限制：宫内仕/敌将不能因推动出宫；仕为固定装置，不能被推动。
 if(!inside(to)){horsePushRecord(e,target.id,'unit',from,null,'outside');return;}
 if((target.kind==='advisor'||target.kind==='king'&&target.side!=='player')&&!inPalace(target.side,to)){horsePushRecord(e,target.id,'unit',from,null,'palace');return;}
 var blocker=at(s,to),body=corpseAt(s,to),wall=mountain(s,to);
 if(!blocker&&!body&&!wall){target.x=to.x;target.y=to.y;horsePushRecord(e,target.id,'unit',from,to,'pushed');drown(s,target,e);return;}
 // 沿用既有碰撞规则（US-010）：发动方 −1 / 被推目标 −2 / 阻挡单位 −1；尸体不受伤。
 // 阻挡物为仕（固定装置）时与被撞目标降为各 −1，与既有冲锋/震退的装置碰撞分支一致。
 var items=blocker&&blocker.device?[{unit:horse,damage:1},{unit:target,damage:1}]:[{unit:horse,damage:1},{unit:target,damage:2}];
 if(blocker)items.push({unit:blocker,damage:1});
 collision(e,items);
 horsePushRecord(e,target.id,'unit',from,null,wall?'collision-mountain':body?'collision-corpse':blocker&&blocker.device?'collision-advisor':'collision');
 if(wall)rockHit(s,to,e);
}
function horsePushCorpse(s,horse,body,dir,e){
 var from={x:body.x,y:body.y},to={x:body.x+dir.x,y:body.y+dir.y};
 if(!inside(to)){horsePushRecord(e,body.id,'corpse',from,null,'outside');return;}
 if(isWater(to,s)){s.corpses=s.corpses.filter(function(c){return c!==body;});horsePushRecord(e,body.id,'corpse',from,null,'water');return;}
 if(!at(s,to)&&!corpseAt(s,to)&&!mountain(s,to)){body.x=to.x;body.y=to.y;horsePushRecord(e,body.id,'corpse',from,to,'pushed');return;}
 var blocker=at(s,to),wall=mountain(s,to);
 if(blocker||wall){collision(e,[{unit:horse,damage:1}].concat(blocker?[{unit:blocker,damage:1}]:[]));horsePushRecord(e,body.id,'corpse',from,null,wall?'collision-mountain':'collision');if(wall)rockHit(s,to,e);return;}
 horsePushRecord(e,body.id,'corpse',from,null,'corpse');
}
// 技能结算顺序：先统一四邻格直接伤害 → 山体受击/坍塌 → 死亡留尸，再按更新后的战场推动与碰撞。
function applyHorseJump(s,u,a,e){
 var damage=horseJumpDamageOf(u),cells=horseNeighbors(a.to),targets=[],rocks=[];
 u.x=a.to.x;u.y=a.to.y;
 cells.forEach(function(x){var t=at(s,x.cell);if(t)targets.push(t);if(mountain(s,x.cell))rocks.push(x.cell);});
 targets.sort(function(x,y){return x.id.localeCompare(y.id);});
 targets.forEach(function(t){directHit(s,u,t,e,damage);});
 rocks.forEach(function(p){rockHit(s,p,e);});
 var directVictims=removeDead(s,u)||[];
 if(u.horsePush)cells.forEach(function(x){
  var t=at(s,x.cell);
  if(t){if(t.device){horsePushRecord(e,t.id,'unit',{x:t.x,y:t.y},null,'immovable');return;}if(e.misses&&e.misses.indexOf(t.id)>=0){horsePushRecord(e,t.id,'unit',{x:t.x,y:t.y},null,'dodged');return;}horsePushLive(s,u,t,x.dir,e);return;}
  var body=corpseAt(s,x.cell);if(body)horsePushCorpse(s,u,body,x.dir,e);
 });
 var chainVictims=removeDead(s,u)||[];
 e.victims=directVictims.concat(chainVictims);
}
// 旧档迁移：只补缺失字段，不覆盖新版本记录。旧战斗已用完旧共用行动的马（ap<=0）不因迁移获得本回合跳跃。
function ensureHorseFields(u){
 if(!u||u.side!=='player'||u.kind!=='horse')return u;
 if(u.horseJumpRange===undefined)u.horseJumpRange=C.horse.jumpRange;
 if(u.horseJumpDamage===undefined)u.horseJumpDamage=C.horse.jumpDamage;
 if(u.horsePush===undefined)u.horsePush=false;
 if(u.horseJumpUsed===undefined)u.horseJumpUsed=u.ap<=0;
 return u;
}
// 界面反馈理由：只描述规则，不改变状态；非法操作不消耗技能与行动。
function horseJumpReason(s,u,to){
 if(u.horseJumpUsed)return'本回合跳跃攻击已使用，下回合可再次释放';
 if(wet(s,u))return'马在水中不能发动跳跃攻击，请先普通移动离开水面';
 if(!inside(to))return'跳跃落点越界，不消耗技能';
 if(same(u,to))return'跳跃攻击不能原地释放，请选择上下左右 1～'+horseJumpRangeOf(u)+' 格空格';
 if(to.x!==u.x&&to.y!==u.y)return'跳跃攻击只能选择上下左右直线方向，不能斜向';
 var dist=Math.abs(to.x-u.x)+Math.abs(to.y-u.y);
 if(dist>horseJumpRangeOf(u))return'超过技能距离上限 '+horseJumpRangeOf(u)+' 格，不消耗技能';
 if(mountain(s,to))return'跳跃落点不能是山体，不消耗技能';
 if(isWater(to,s))return'跳跃落点不能是水格，不消耗技能';
 if(at(s,to)||corpseAt(s,to))return'跳跃落点必须为空，不消耗技能';
 return'该跳跃落点不合法';
}
function horseMoveReason(s,u,to){
 if(u.ap<=0)return'本回合已普通移动；仍可释放跳跃攻击';
 if(!inside(to))return'目标越界';
 if(same(u,to))return'请选择棋盘内其他格';
 if(at(s,to))return'普通移动不能攻击：点选空落点，攻击请切换“跳跃攻击”';
 if(corpseAt(s,to))return'尸体占格，不能作为普通移动落点';
 var dx=to.x-u.x,dy=to.y-u.y;
 if(Math.abs(dx)*Math.abs(dy)!==2&&!(buffState(s).move))return'普通移动只能走日字；跳跃攻击请切换模式';
 return'该目标不是合法日字落点；普通移动只到空格，攻击请切换“跳跃攻击”';
}
// US-022 我方象（控制法师，基础 1 HP）：普通移动为田字（斜向恰好 2 格，象眼被棋子/尸体/山阻挡），
// 落点须为空且不在敌方半场；可进入河道水格，不能过河。技能为牵引与冰封，共享每回合一次技能额度。
function elephantPullRangeOf(u){var v=u&&u.elephantPullRange;return Number.isInteger(v)&&v>=C.elephant.pullRange?Math.min(C.elephant.maxPullRange,v):C.elephant.pullRange;}
function elephantFreezeUnlocked(u){return!!(u&&u.kind==='elephant'&&u.side==='player'&&u.elephantFreezeUnlocked);}
function elephantFreezeDurationOf(u){if(!elephantFreezeUnlocked(u))return 0;var v=u.elephantFreezeDuration;return Number.isInteger(v)&&v>=C.elephant.freezeDuration?Math.min(C.elephant.maxFreezeDuration,v):C.elephant.freezeDuration;}
function elephantSkillReady(u){return!!u&&u.kind==='elephant'&&u.side==='player'&&!u.elephantSkillUsed;}
// 敌方半场：我方为 y>河道行；象自身不能过河，但两种技能都可跨河选目标。
function enemyHalf(side,p){return side==='player'?p.y>C.river:p.y<C.river;}
function elephantEye(u,to){return{x:(u.x+to.x)/2,y:(u.y+to.y)/2};}
// 田字落点：斜向恰好 2 格、棋盘内、象眼无棋子/尸体/山、落点为空且不在敌方半场。水格可作落点。
function elephantDianOk(s,u,to){return inside(to)&&!same(u,to)&&Math.abs(to.x-u.x)===2&&Math.abs(to.y-u.y)===2&&!occupied(s,elephantEye(u,to))&&!occupied(s,to)&&!enemyHalf(u.side,to);}
// 疾行扩展：以“合法田字落点”为参照，取其上下左右邻格；参照落点沿用合法口径（不照搬马可占用参照的特例）。
function elephantMoveRoutes(s,u,to){
 var out=[],expanded=buffState(s).move;
 [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(function(d){
  var ref={x:u.x+d[0],y:u.y+d[1]};
  if(!inside(ref))return;
  if(!elephantDianOk(s,u,ref))return;
  if(same(ref,to)){out.push({ref:cp(ref),extended:false});return;}
  if(!expanded)return;
  C.directions.forEach(function(v){if(same({x:ref.x+v.x,y:ref.y+v.y},to))out.push({ref:cp(ref),extended:true});});
 });
 return out;
}
function elephantMoveAction(s,u,to){
 if(!u||u.side!=='player'||u.kind!=='elephant'||u.ap<=0)return;
 if(!inside(to)||same(u,to)||!elephantLandingOk(s,u,to))return;
 // 普通田字：一次点击直接落到田字点，不追加一步。
 if(elephantDianOk(s,u,to))return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:'move',path:[cp(to)],dian:true,extended:false};
 // 疾行：田字落点 + 正交邻格，一次点击最终格；多条合法路线合并去重（同一最终格只生成一个动作）。
 var routes=elephantMoveRoutes(s,u,to);
 if(!routes.length)return;
 return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:'move',path:[routes[0].ref,cp(to)],dian:false,extended:true,ref:routes[0].ref,routeCount:routes.length};
}
function elephantLandingOk(s,u,to){return inside(to)&&!same(u,to)&&!occupied(s,to)&&!enemyHalf(u.side,to);}
// 牵引：四正交同线、实际距离 2～射程（1 格太近不可选）；可选友军/敌军/尸体（含我方主帅），
// 不选自身、我方仕（固定装置及其残骸）与山体；可越过棋子/尸体/山选择其后目标，无直接伤害。
function elephantPullAction(s,u,to){
 if(!elephantSkillReady(u))return;
 if(!inside(to)||same(u,to))return;
 if(to.x!==u.x&&to.y!==u.y)return;
 var dist=Math.abs(to.x-u.x)+Math.abs(to.y-u.y);
 if(dist<2||dist>elephantPullRangeOf(u))return;
 var live=at(s,to),body=corpseAt(s,to);
 if(!live&&!body)return;
 if(live&&live.device)return;
 if(body&&body.unit&&(body.unit.device||(body.unit.kind==='advisor'&&body.unit.side==='player')))return;
 return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:'elephant-pull',path:line(u,to),distance:dist,
  pullSteps:Math.floor(dist/2),targetId:live?live.id:body.unit.id,targetKind:live?'unit':'corpse'};
}
// 冰封：固定以自身为中心 5×5（横纵差各 ≤2，含斜向、截去棋盘外）选单个敌人，含敌将；
// 不选友军/尸体/山，无直接伤害，不受单位/尸体/山遮挡，可跨河。
function elephantFreezeAction(s,u,to){
 if(!elephantFreezeUnlocked(u)||!elephantSkillReady(u))return;
 if(!inside(to)||same(u,to))return;
 if(Math.abs(to.x-u.x)>C.elephant.freezeRadius||Math.abs(to.y-u.y)>C.elephant.freezeRadius)return;
 var target=at(s,to);
 if(!target||target.side!=='enemy')return;
 return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:'elephant-freeze',path:[cp(to)],targetId:target.id,duration:elephantFreezeDurationOf(u)};
}
// 冻结状态：frozen 为还需跳过的敌方行动阶段数；thawStandby 为“受伤解冻但本回合仍待机”标志。
function frozenSkip(u){return!!u&&u.side==='enemy'&&((Number.isInteger(u.frozen)&&u.frozen>0)||u.thawStandby===true);}
// 实际受伤清除全部剩余冻结阶段，但本回合仍待机；不额外吞掉下一回合（阶段结束时清 thawStandby）。
function thawFrozen(t){if(!t||t.side!=='enemy')return;if(Number.isInteger(t.frozen)&&t.frozen>0){t.frozen=0;t.thawStandby=true;}}
function elephantStepDir(u,target){return{x:u.x===target.x?0:Math.sign(u.x-target.x),y:u.y===target.y?0:Math.sign(u.y-target.y)};}
// 牵引结算：目标朝象逐格移动 floor(实际距离/2) 格，首次碰撞即停止，不连锁推动、不传递撞击；
// 不与施法象相撞（最多停在旁边）；撞击不造成死亡以外的额外效果。
function applyElephantPull(s,u,a,e){
 var live=at(s,a.to),body=corpseAt(s,a.to);
 if(!live&&!body)return;
 var isCorpse=!live&&!!body,target=live||body,id=isCorpse?body.unit.id:live.id;
 var steps=Number.isInteger(a.pullSteps)?a.pullSteps:Math.floor((a.distance||0)/2);
 e.pull={targetId:id,kind:isCorpse?'corpse':'unit',steps:steps,moved:0,status:'success',from:cp(target),to:cp(target)};
 for(var i=0;i<steps;i++){
  var dir=elephantStepDir(u,target),next={x:target.x+dir.x,y:target.y+dir.y};
  if(!inside(next)){e.pull.status='outside';break;}
  var blocker=at(s,next),block=corpseAt(s,next),wall=mountain(s,next);
  // 半场限制：我方目标不能被位移进敌方半场（多象互拉最多停在河道），且不因此造成碰撞伤害。
  if(!isCorpse&&live.side==='player'&&!blocker&&!block&&!wall&&enemyHalf('player',next)){e.pull.status='half';break;}
  if(isWater(next,s)){
   if(isCorpse){s.corpses=s.corpses.filter(function(c){return c!==body;});e.waterDeaths=e.waterDeaths||[];e.waterDeaths.push(body.unit.id);e.pull.status='water-destroyed';break;}
   if(fatalWater(live)||(live.kind==='king'&&live.side==='player')){live.hp=0;e.waterDeaths=e.waterDeaths||[];e.waterDeaths.push(live.id);e.pull.status='water-death';break;}
  }
  if(!blocker&&!block&&!wall){target.x=next.x;target.y=next.y;e.pull.moved++;e.pull.to=cp(target);continue;}
  if(isCorpse){
   if(blocker)hit(e,blocker,1,'collision');
   if(wall)rockHit(s,next,e);
   e.pull.status=wall?'collision-mountain':blocker?'collision-live':'collision-corpse';
   break;
  }
  if(blocker){hit(e,target,1,'collision');hit(e,blocker,1,'collision');e.pull.status='collision-live';}
  else if(block){hit(e,target,1,'collision');e.pull.status='collision-corpse';}
  else{hit(e,target,1,'collision');rockHit(s,next,e);e.pull.status='collision-mountain';}
  break;
 }
 if(e.pull.moved)e.pushed={id:id,to:cp(target)};
 e.pull.to=cp(target);
 e.victims=removeDead(s,u)||[];
}
// 冰封结算：不叠加、不缩短，取剩余阶段与本次时长的较大值；受伤解冻后再冻赋予完整本次时长。
function applyElephantFreeze(s,u,a,e){
 var target=at(s,a.to);
 if(!target||target.side!=='enemy')return;
 var duration=Number.isInteger(a.duration)&&a.duration>0?a.duration:elephantFreezeDurationOf(u);
 if(duration<=0)return;
 var before=Number.isInteger(target.frozen)&&target.frozen>0?target.frozen:0;
 target.frozen=Math.max(before,duration);
 target.thawStandby=false;
 e.freeze={target:target.id,duration:duration,before:before,after:target.frozen};
}
// 旧档迁移：只补缺失字段，不覆盖新版本记录；旧战斗已用完共用行动或已用完技能的象不因迁移获得本回合技能。
function ensureElephantFields(u){
 if(!u||u.side!=='player'||u.kind!=='elephant')return u;
 if(u.elephantPullRange===undefined)u.elephantPullRange=C.elephant.pullRange;
 if(u.elephantFreezeUnlocked===undefined)u.elephantFreezeUnlocked=false;
 if(u.elephantFreezeDuration===undefined)u.elephantFreezeDuration=0;
 if(u.elephantSkillUsed===undefined)u.elephantSkillUsed=u.ap<=0;
 return u;
}
// 界面反馈理由：只描述规则，不改变状态；非法操作不消耗技能与行动。
function elephantMoveReason(s,u,to){
 if(u.ap<=0)return'本回合已普通移动；仍可释放牵引或冰封';
 if(!inside(to))return'落点越界，不消耗移动';
 if(same(u,to))return'请选择斜向 2 格外的空格；象走田字';
 if(enemyHalf(u.side,to))return'象不能过河：只能落在己方半场或河道，不消耗移动';
 if(occupied(s,to))return'落点被棋子/尸体/山体占据，不消耗移动';
 var dx=to.x-u.x,dy=to.y-u.y;
 if(Math.abs(dx)===2&&Math.abs(dy)===2){var eye=elephantEye(u,to);if(occupied(s,eye))return`象眼 ${'('+(eye.x+1)+','+(eye.y+1)+')'} 被阻挡，不消耗移动`;return'该田字落点不合法';}
 var routes=elephantMoveRoutes(s,u,to);
 if(routes.length)return'该落点不合法';
 if(!buffState(s).move)return'基础移动只能走田字（斜向恰好 2 格）；疾行增益可扩展正交一步';
 return'疾行扩展只到合法田字落点的上下左右邻格；象眼/参照落点/最终格都须合法';
}
function elephantPullReason(s,u,to){
 if(u.elephantSkillUsed)return'本回合技能已使用（牵引与冰封共用一次），结束回合后恢复';
 if(!inside(to))return'目标越界，不消耗技能';
 if(same(u,to))return'不能牵引自己：请选择同线 2 格及以上的其他目标';
 if(to.x!==u.x&&to.y!==u.y)return'牵引只能选择上下左右同线目标，不能斜向';
 var dist=Math.abs(to.x-u.x)+Math.abs(to.y-u.y);
 if(dist<2)return'目标距离 1 格太近：牵引只能选择同线 2 格及以上的目标';
 if(dist>elephantPullRangeOf(u))return`超过牵引射程 ${elephantPullRangeOf(u)} 格，不消耗技能`;
 var live=at(s,to),body=corpseAt(s,to);
 if(!live&&!body)return mountain(s,to)?'山体不能被牵引，不消耗技能':'该格没有可牵引的目标（可选友军/敌军/尸体）';
 if(live&&live.device)return'仕是固定防御装置，不能被牵引，不消耗技能';
 if(body&&body.unit&&body.unit.device)return'仕残骸是固定装置，不能被牵引，不消耗技能';
 return'该目标不合法';
}
function elephantFreezeReason(s,u,to){
 if(!elephantFreezeUnlocked(u))return'冰封尚未解锁：需在营地用 2 公共 SP 解锁一次';
 if(u.elephantSkillUsed)return'本回合技能已使用（牵引与冰封共用一次），结束回合后恢复';
 if(!inside(to))return'目标越界，不消耗技能';
 if(Math.abs(to.x-u.x)>C.elephant.freezeRadius||Math.abs(to.y-u.y)>C.elephant.freezeRadius)return`超出冰封范围：以自身为中心 5×5（横纵差各不超过 ${C.elephant.freezeRadius} 格）`;
 var target=at(s,to);
 if(!target)return'冰封只能选择单个敌方单位，不能选空格或尸体';
 if(target.side!=='enemy')return'冰封只能选择敌方单位，不能选友军';
 return'该目标不合法';
}
function pawnish(u){return u.kind==='pawn'||u.kind==='archer'||u.kind==='spearman';}function palace(side){return side==='player'?C.playerPalace:C.enemyPalace;}function inPalace(side,p){var q=palace(side);return p.x>=q.minX&&p.x<=q.maxX&&p.y>=q.minY&&p.y<=q.maxY;}
function palaceDiag(side,a,b){var q=palace(side);return Math.abs(a.x-b.x)===1&&Math.abs(a.y-b.y)===1&&((a.x===q.cx&&a.y===q.cy)||(b.x===q.cx&&b.y===q.cy));}
function line(a,b){if(a.x!==b.x&&a.y!==b.y)return[];var dx=Math.sign(b.x-a.x),dy=Math.sign(b.y-a.y),out=[];if(!dx&&!dy)return out;for(var x=a.x+dx,y=a.y+dy;;x+=dx,y+=dy){out.push({x:x,y:y});if(x===b.x&&y===b.y)break;}return out;}
function maxHp(kind,side){if(kind==='king')return side==='enemy'?5:3;if(kind==='advisor')return side==='player'?2:1;if(kind==='rook'||kind==='cannon')return 2;if(kind==='spearman')return 2;return 1;}function power(kind){return kind==='archer'||kind==='cannon'?2:1;}
function unit(id,side,kind,x,y){var h=maxHp(kind,side),player=side==='player',rook=kind==='rook';var u={id:id,side:side,kind:kind,x:x,y:y,hp:h,maxHp:h,attack:kind==='king'&&side==='player'?0:power(kind),level:1,kills:0,ap:player?1:0,apLimit:player?1:0,combo:0,fortify:0,directionPaid:[0,0,0,0],cannonMask:0,cannonMoveAvailable:player&&kind==='cannon',cannonAttackAvailable:player&&kind==='cannon',rookRole:'base',rookMoveRange:4,rookChargeRange:1,rookPullRange:3,rookPush:false,rookMoveAvailable:player&&rook,rookChargeAvailable:player&&rook,commanderHealth:0,commanderMove:0,acted:false};
 // US-018 我方仕是固定防御装置：不占 AP、不可位移/移动，初始间隔 3、冷却状态就绪。
 if(kind==='advisor'&&side==='player'){u.device=true;u.towerInterval=3;u.lastFireTurn=null;u.ap=0;u.apLimit=0;}
 // US-021 我方马：保留日字普通移动，额外获得独立跳跃攻击；三项成长互相独立，敌方马不接入。
 if(kind==='horse'&&side==='player'){u.horseJumpRange=C.horse.jumpRange;u.horseJumpDamage=C.horse.jumpDamage;u.horsePush=false;u.horseJumpUsed=false;}
 // US-022 我方象：控制法师无普通攻击；牵引射程、冰封解锁/时长与技能额度按本回合独立记录。
 if(kind==='elephant'&&side==='player'){u.attack=0;u.elephantPullRange=C.elephant.pullRange;u.elephantFreezeUnlocked=false;u.elephantFreezeDuration=0;u.elephantSkillUsed=false;}
 return u;}
// US-020 2026-10-21 确认的正式新旅程普通队友：兵×2、马×1、车×1（无初始弓/枪/炮/仕），人口仍为 4。
// 两个普通兵使用不同稳定 ID；初始弓、枪只保留“普通兵 2 SP 转职”获取路径。
function playerTemplate(){return[unit('rook','player','rook',0,0),unit('starting-pawn','player','pawn',1,3),unit('starting-pawn-2','player','pawn',4,3),unit('starting-horse','player','horse',7,3)];}
function resetTurn(u){if(u.side!=='player')return;if(u.kind==='advisor'){u.ap=u.apLimit=0;u.acted=false;return;}if(u.kind==='rook'){u.ap=u.apLimit=1;u.rookMoveAvailable=true;u.rookChargeAvailable=u.rookRole!=='base';}else if(u.kind==='cannon'){u.ap=u.apLimit=1;u.cannonMoveAvailable=u.cannonAttackAvailable=true;}else{u.apLimit=pawnish(u)?1+u.combo:1;u.ap=u.apLimit;if(u.kind==='horse')u.horseJumpUsed=false;if(u.kind==='elephant'&&u.side==='player')u.elephantSkillUsed=false;}u.acted=false;}
function setActed(u){if(u.kind==='rook')u.acted=!u.rookMoveAvailable&&!u.rookChargeAvailable;else if(u.kind==='cannon')u.acted=!u.cannonMoveAvailable&&!u.cannonAttackAvailable;else if(u.kind==='horse'&&u.side==='player')u.acted=u.ap<=0&&u.horseJumpUsed;else if(u.kind==='elephant'&&u.side==='player')u.acted=u.ap<=0&&u.elephantSkillUsed;else u.acted=u.ap<=0;}
// US-020 旅程字段：population 为可部署普通队友上限，buffs 为旅程内同时生效的增益（取代互斥三选一），
// completed 为已通关正式关卡数，tutorial 记录本旅程教学结果，firstEntryRewarded 为首次入营奖励标志。
function emptyState(units){return{units:units||[],corpses:[],pendingAdvisorIds:[],intents:[],pendingSpawns:[],phase:'player',wave:1,turn:1,level:1,gold:0,teamSp:0,kills:0,highestLevel:1,buffs:{health:false,move:false,rescue:false},population:C.population.initial,completed:0,tutorial:null,firstEntryRewarded:false,rescueUsed:false,rescueRequired:false,reinforcementPreview:false,result:undefined,revision:0,party:[],activeIds:[],bench:[],entrySnapshot:null,levelSnapshot:null,settled:false,killLedger:{},killValues:{}};}
// 仅现有原始状态/快照入口使用；场上 > 尸体 > 队伍，与 syncParty 权威来源一致。
function migrateState(source){var s=cp(source);function migrate(n){var seen=Object.create(null),total=0;function visit(u){if(!u)return;if(u.side==='player'&&!seen[u.id]){seen[u.id]=true;total+=Number.isInteger(u.sp)&&u.sp>0?u.sp:0;}delete u.sp;ensureHorseFields(u);ensureElephantFields(u);}(n.units||[]).forEach(visit);(n.corpses||[]).forEach(function(c){visit(c.unit);});(n.party||[]).forEach(visit);if(!Object.prototype.hasOwnProperty.call(n,'teamSp'))n.teamSp=total;else if(!Number.isInteger(n.teamSp)||n.teamSp<0)n.teamSp=0;['entrySnapshot','levelSnapshot'].forEach(function(key){if(n[key])migrate(n[key]);});}migrate(s);return s;}
function commanderTarget(u){return u&&u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor'&&!u.device;}
// US-020 旅程增益：坚守/疾行/救援由主营地解锁并同时生效，只作用于普通队友（排除主帅与仕）。
function buffState(s){var b=s&&s.buffs;return{health:!!(b&&b.health),move:!!(b&&b.move),rescue:!!(b&&b.rescue)};}
function applyJourneyBuffs(s){
 var b=buffState(s),list=(s.units||[]).concat(s.party||[]);
 list.forEach(function(u){if(!commanderTarget(u))return;if(b.health&&!u.commanderHealth){u.commanderHealth=1;u.maxHp++;u.hp=Math.min(u.maxHp,u.hp+1);}if(b.move&&(u.kind==='rook'||u.kind==='cannon'||pawnish(u)))u.commanderMove=1;});
 return s;}
function enemyWaveOne(){return C.waveOne.map(function(w,i){return unit('w1-'+i,'enemy',w[0],w[1],w[2]);});}function pendingWaveTwo(){return C.waveTwo.map(function(w,i){return{id:'w2-'+i,kind:w[0],x:w[1],y:w[2],status:'pending'};});}
// 旧存档中的初始弓/枪 ID 只保留取位兼容（不迁移、不改写旧局）；新旅程使用兵×2、马×1。
function defaultPosition(id,index){var known={rook:{x:0,y:0},'starting-cannon':{x:1,y:2},'starting-pawn':{x:1,y:3},'starting-pawn-2':{x:4,y:3},'starting-horse':{x:7,y:3},'starting-archer':{x:4,y:3},'starting-spearman':{x:7,y:3}};return cp(known[id]||[{x:2,y:0},{x:6,y:0},{x:0,y:2},{x:8,y:2},{x:3,y:3},{x:5,y:3},{x:1,y:1},{x:7,y:1}][index%8]);}
function partyUnit(s,id){return(s.party||[]).find(function(u){return u.id===id;});}
// US-018 上阵仕：满血、冷却就绪、保留已买档位；布阵期只由固定侧位入口创建。
function advisorOnBoard(v,x,y){var u=cp(v);u.x=x;u.y=y;u.hp=u.maxHp;u.side='player';u.device=true;u.towerInterval=u.towerInterval||3;u.lastFireTurn=null;resetTurn(u);return u;}
function constructLevel(source,next,map){var s=emptyState();map=cp(map||defaultMap());s.mapSnapshot=map;s.mapName=map.name||'自定义地图';s.mapInfo=map.info||'';s.tiles=cp(map.tiles);s.rng=source.rng===undefined?(Math.random()*4294967296)>>>0:source.rng;s.testMap=!!source.testMap;s.level=next?source.level+1:1;s.completed=Math.max(0,s.level-1);s.gold=source.gold||0;s.teamSp=source.teamSp||0;
 // US-020 旅程字段随关卡保留：人口、旅程增益、教学结果与首次入营奖励标志均跨关继承。
 s.population=Number.isInteger(source.population)?source.population:C.population.initial;s.buffs=Object.assign({health:false,move:false,rescue:false},cp(source.buffs||{}));s.tutorial=source.tutorial||null;s.firstEntryRewarded=!!source.firstEntryRewarded;
 s.party=cp(source.testMap?source.party:source.party&&source.party.length?source.party:playerTemplate());s.activeIds=cp(source.activeIds&&source.activeIds.length?source.activeIds:s.party.map(function(u){return u.id;}));s.party.forEach(function(u){u.maxHp-=u.commanderHealth||0;u.commanderHealth=0;u.commanderMove=0;u.hp=u.maxHp;ensureHorseFields(u);ensureElephantFields(u);});s.bench=cp(source.bench||[]);var testKing=s.testMap&&map.units.find(function(u){return u.side==='player'&&u.kind==='king';});s.units=[unit('king','player','king',testKing?testKing.x:4,testKing?testKing.y:0)].concat(map.units.filter(function(u){return u.side==='enemy';}).map(function(u,i){return unit('w1-'+i,'enemy',u.kind,u.x,u.y);}));s.activeIds.forEach(function(id,index){var v=partyUnit(s,id);if(!v)return;if(v.kind==='advisor'&&!s.testMap)return;var u=cp(v),p=s.testMap?{x:u.x,y:u.y}:defaultPosition(id,index);if((occupied(s,p)||isWater(p,s)||!s.testMap&&u.kind==='advisor'&&!inPalace('player',p))){for(var y=0;y<4;y++){var found=false;for(var x=0;x<9;x++){if(!occupied(s,{x:x,y:y})&&!isWater({x:x,y:y},s)&&(u.kind!=='advisor'||inPalace('player',{x:x,y:y}))){p={x:x,y:y};found=true;break;}}if(found)break;}}u.x=p.x;u.y=p.y;u.hp=u.maxHp;u.side='player';resetTurn(u);s.units.push(u);});
 // US-018 仕固定左右侧位：初始化只占空侧位，绝不挤走、覆盖或叠放队友；冲突的仕进待布置，玩家腾格后手动放置。
 var advisorIndex=0;
 s.activeIds.forEach(function(id){var v=partyUnit(s,id);if(!v||v.kind!=='advisor'||s.testMap)return;var cell=C.advisorCells[advisorIndex++%C.advisorCells.length],p={x:cell.x,y:cell.y};if(occupied(s,p)||isWater(p,s)){s.pendingAdvisorIds.push(id);return;}s.units.push(advisorOnBoard(v,p.x,p.y));});s.units=s.units.filter(function(u){return u.side==='player';}).concat(s.units.filter(function(u){return u.side==='enemy';}));s.phase='deploy';
 // US-020 旅程增益在入关时统一应用一次：坚守/疾行同时生效，队伍与场上棋子数值一致，不逐关叠加。
 applyJourneyBuffs(s);
 s.entrySnapshot=cp(s);s.levelSnapshot=cp(s);return s;}
function newGame(map){return constructLevel(emptyState(),false,map);}
// US-020 从主营地/地图进入关卡：关卡号由旅程通关进度决定，进入即保存入关快照。
function startLevel(source,map){var n=cp(source);n.completed=Math.max(0,Number.isInteger(source.completed)?source.completed:0);n.level=n.completed;return constructLevel(n,true,map);}
function newTestGame(map){var source=emptyState();source.testMap=true;source.party=map.units.filter(function(u){return u.side==='player'&&u.kind!=='king';}).map(function(u){var v=unit(u.id,'player',u.kind,u.x,u.y);if(v.kind==='rook')v.rookRole=u.rookRole||'base';return v;});var s=constructLevel(source,false,map);s.entrySnapshot=null;s.levelSnapshot=null;s.phase='player';prepareEnemy(s);s.entrySnapshot=cp(s);s.levelSnapshot=cp(s);return s;}
// US-020 教学关（第 0 关）：全陆地独立战局，直接进入我方行动；教学结果由教学流程记录，不计入正式关卡进度。
function tutorialMap(){var tiles={};for(var y=0;y<9;y++)for(var x=0;x<9;x++)tiles[x+','+y]='land';return{version:1,name:C.tutorial.name,info:C.tutorial.info,tiles:tiles,units:cp(C.tutorial.units)};}
function tutorialGame(){var s=newTestGame(tutorialMap());s.entrySnapshot=null;s.levelSnapshot=null;s.phase='player';return s;}
function tutorialReward(s){return Object.keys(s.killLedger||{}).reduce(function(total,id){return total+((s.killValues&&s.killValues[id])||1);},0);}
// US-020 兼容入口：旅程增益改由主营地解锁并跨关保留。本函数只供夹具/回归直接设定增益，界面不再提供三选一。
function chooseCommanderBuff(s,buff){if(['health','move','rescue'].indexOf(buff)<0)return s;if(s.phase!=='deploy'&&s.buffs&&s.buffs[buff])return s;var n=cp(s);n.buffs=Object.assign({health:false,move:false,rescue:false},cp(n.buffs||{}));n.buffs[buff]=true;applyJourneyBuffs(n);
 if(n.phase==='deploy'){var c=confirmDeployment(n);if(c===n)return s;n=c;}
 return n;}
function pawnMove(u,dx,dy){var f=u.side==='player'?1:-1,cross=u.side==='player'?u.y>=5:u.y<=3;return(dx===0&&Math.sign(dy)===f)||(cross&&dy===0&&Math.abs(dx)>0);}
// US-019 我方帅：横竖一步不受九宫边界限制；斜向仅宫内米字线中心与四角；不能吃子/上山/主动入水。敌方将保持原规则。
function kingStep(s,u,to){var dx=to.x-u.x,dy=to.y-u.y,ax=Math.abs(dx),ay=Math.abs(dy),diag=inPalace(u.side,u)&&inPalace(u.side,to)&&palaceDiag(u.side,u,to);if(u.side==='player')return(ax+ay===1||diag)&&!at(s,to)&&!mountain(s,to)&&!isWater(to,s);return inPalace(u.side,u)&&inPalace(u.side,to)&&(ax+ay===1||diag);}
function ordinary(s,u,to,attackOnly){if(!inside(to)||same(u,to)||corpseAt(s,to))return;var t=at(s,to),rock=mountain(s,to);if(t&&t.side===u.side||wet(s,u)&&(t||rock))return;var dx=to.x-u.x,dy=to.y-u.y,ax=Math.abs(dx),ay=Math.abs(dy),ok=false,path=[cp(to)],limit=1+u.commanderMove;
 if(u.kind==='king')ok=kingStep(s,u,to);
 else if(u.kind==='advisor')ok=inPalace(u.side,u)&&inPalace(u.side,to)&&palaceDiag(u.side,u,to);
 else if(pawnish(u)){path=line(u,to);var dist=Math.max(ax,ay);ok=(u.kind==='pawn'||!t&&!rock)&&pawnMove(u,dx,dy)&&dist<=limit&&(!(t||rock)||dist===1)&&!path.slice(0,-1).some(function(p){return occupied(s,p);});}
 else if(u.kind==='horse'){ok=u.side==='player'?horseNormalMove(s,u,to):horseEnemyShape(s,u,to);}
 else if(u.kind==='cannon'&&(dx===0||dy===0)){path=line(u,to);var screens=path.slice(0,-1).filter(function(p){return occupied(s,p);}).length;ok=t||rock?screens===1:screens===0&&path.length<=3+u.commanderMove;}
 if(ok&&(attackOnly||(t||rock)||safePath(s,u,path)))return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:t||rock?'attack':'move',path:path};
}
function rookBase(s,u,to){if(!inside(to)||same(u,to)||(u.x!==to.x&&u.y!==to.y)||corpseAt(s,to)||!u.rookMoveAvailable)return;var t=at(s,to),rock=mountain(s,to);if(t&&t.side===u.side||(t||rock)&&u.rookRole!=='base'||wet(s,u)&&(t||rock))return;var path=line(u,to),limit=u.rookMoveRange+(u.commanderMove&&!t&&!rock?1:0);if(path.length>limit||path.slice(0,-1).some(function(p){return occupied(s,p);}))return;return{actor:u.id,from:{x:u.x,y:u.y},to:cp(to),type:t||rock?'attack':'rook-move',path:path};}
function rookCharge(s,u,to){if(!inside(to)||same(u,to)||(u.x!==to.x&&u.y!==to.y)||!u.rookChargeAvailable||wet(s,u))return;var t=at(s,to),body=corpseAt(s,to);if(t&&t.side===u.side)return;var path=line(u,to);if(path.length>u.rookChargeRange||path.slice(0,-1).some(function(p){return occupied(s,p);}))return;if(body)return u.rookPush?{actor:u.id,from:cp(u),to:cp(to),type:'charge-corpse',path:path}:undefined;return{actor:u.id,from:cp(u),to:cp(to),type:'charge',path:path};}
function rookPull(s,u,to){if(!inside(to)||same(u,to)||(u.x!==to.x&&u.y!==to.y)||!u.rookChargeAvailable||wet(s,u))return;var target=at(s,to)||corpseAt(s,to);if(!target||target.device)return;var path=line(u,to);if(path.length>u.rookPullRange||path.slice(0,-1).some(function(p){return occupied(s,p);}))return;var dx=Math.sign(to.x-u.x),dy=Math.sign(to.y-u.y),next={x:to.x-dx,y:to.y-dy};if(path.length===1){if(target.unit||target.side===u.side)return;return{actor:u.id,from:cp(u),to:cp(to),type:'pull-collision',path:path};}if(!inside(next)||occupied(s,next))return;if(target.device)return;if(target.side&&target.kind==='king'&&target.side!=='player'&&!inPalace(target.side,next))return;if(target.side&&target.kind==='advisor'&&!inPalace(target.side,next))return;return{actor:u.id,from:cp(u),to:cp(to),targetTo:next,type:'pull',path:path};}
function enemyRookActions(s,u){var out=[];for(var y=0;y<9;y++)for(var x=0;x<9;x++){var to={x:x,y:y},t=at(s,to),path=line(u,to);if(!path.length||corpseAt(s,to)||mountain(s,to)||path.slice(0,-1).some(function(p){return occupied(s,p);})||(t&&t.side===u.side))continue;if(!t&&path.length<=3)out.push({actor:u.id,from:cp(u),to:to,type:'move',path:path});if(t&&path.length===1&&!wet(s,u))out.push({actor:u.id,from:cp(u),to:to,type:'charge',path:path});}return out;}
function actionAt(s,u,to,mode){if(!u||u.side==='player'&&u.kind==='advisor')return;
 // US-021 我方马只有两个入口：普通移动（日字/疾行扩展）与跳跃攻击；跳跃不占普通移动，技能后不能再移动。
 if(u.side==='player'&&u.kind==='horse'){if(mode==='horse-jump')return horseJumpAction(s,u,to);if(u.ap<=0)return;return ordinary(s,u,to);}
 // US-022 我方象：普通移动（田字/疾行扩展）、牵引、冰封三个入口；牵引与冰封共用技能额度，成功施法后不能再移动。
 if(u.side==='player'&&u.kind==='elephant'){if(mode==='elephant-pull')return elephantPullAction(s,u,to);if(mode==='elephant-freeze')return elephantFreezeAction(s,u,to);return elephantMoveAction(s,u,to);}
 if(u.side==='player'&&u.kind!=='rook'&&u.kind!=='cannon'&&u.ap<=0)return;if(u.kind==='rook'){if(u.side==='enemy')return enemyRookActions(s,u).find(function(a){return same(a.to,to)&&(!mode||a.type===mode);});if(u.rookRole==='base')return rookBase(s,u,to);if(mode==='charge')return rookCharge(s,u,to);if(mode==='pull')return rookPull(s,u,to);return rookBase(s,u,to);}var a=ordinary(s,u,to);if(u.side==='player'&&u.kind==='cannon'&&a&&(a.type==='move'?!u.cannonMoveAvailable:!u.cannonAttackAvailable))return;return a;}
function directionRange(u,d){var paid=u.directionPaid[d]||0;return u.kind==='archer'?{min:2,max:2+paid}:{min:1,max:1+paid};}
function directionalAction(s,id,d){var u=s.units.find(function(v){return v.id===id;}),targets=[],rocks=[],path=[];if(!u||(u.kind!=='archer'&&u.kind!=='spearman')||u.side==='player'&&u.ap<=0||!Number.isInteger(d)||d<0||d>3)return;var vec=C.directions[d],range=directionRange(u,d);for(var i=1;i<=range.max;i++){var p={x:u.x+vec.x*i,y:u.y+vec.y*i};if(!inside(p))break;path.push(p);if(corpseAt(s,p))break;if(mountain(s,p)){if(i>=range.min)rocks.push(cp(p));break;}var t=at(s,p);if(!t)continue;if(t.side===u.side)break;if(u.kind==='archer'&&i<range.min)break;targets.push(t.id);if(u.kind==='archer')break;}if(targets.length||rocks.length)return{actor:u.id,from:cp(u),to:cp(path[path.length-1]),type:'directional',direction:d,path:path,targets:targets,mountains:rocks};}
function legalActions(s,id){var u=s.units.find(function(v){return v.id===id;});if(!u)return[];if(u.side==='player'&&u.kind==='advisor')return[];if(u.side==='enemy'&&u.kind==='rook')return enemyRookActions(s,u);if(u.side==='player'&&u.kind==='rook'&&!u.rookMoveAvailable&&!u.rookChargeAvailable)return[];if(u.side==='player'&&u.kind==='cannon'&&!u.cannonMoveAvailable&&!u.cannonAttackAvailable)return[];if(u.side==='player'&&u.kind!=='rook'&&u.kind!=='cannon'&&u.kind!=='horse'&&u.kind!=='elephant'&&u.ap<=0)return[];var out=[];for(var y=0;y<9;y++)for(var x=0;x<9;x++){var p={x:x,y:y};if(u.kind==='elephant'&&u.side==='player'){var em=elephantMoveAction(s,u,p);if(em)out.push(em);var ep=elephantPullAction(s,u,p);if(ep)out.push(ep);var ef=elephantFreezeAction(s,u,p);if(ef)out.push(ef);}else if(u.kind==='horse'&&u.side==='player'){if(u.ap>0){var hm=ordinary(s,u,p);if(hm)out.push(hm);}var hj=horseJumpAction(s,u,p);if(hj)out.push(hj);}else if(u.kind==='rook'&&u.side==='player'){var base=rookBase(s,u,p),skill=u.rookRole==='charge'?rookCharge(s,u,p):u.rookRole==='pull'?rookPull(s,u,p):undefined;if(base)out.push(base);if(skill)out.push(skill);}else{var a=ordinary(s,u,p);if(a&&!(u.kind==='cannon'&&u.side==='player'&&(a.type==='move'?!u.cannonMoveAvailable:!u.cannonAttackAvailable)))out.push(a);}}if(u.side==='player'&&(u.kind==='archer'||u.kind==='spearman'))for(var d=0;d<4;d++){var q=directionalAction(s,id,d);if(q)out.push(q);}return out;}
function enemyAttacks(s,u){var out=legalActions(s,u.id);if(u.kind==='archer'||u.kind==='spearman')for(var d=0;d<4;d++){var a=directionalAction(s,u.id,d);if(a)out.push(a);}return out.filter(function(a){return (a.type==='attack'||a.type==='charge'||a.type==='directional')&&!!at(s,a.to)||a.type==='directional'&&a.targets.length;});}function enemyMoves(s,u){return legalActions(s,u.id).filter(function(a){return a.type==='move';});}
function generateIntents(s){var k=king(s,'player');if(!k)return[];var out=[],order=0;s.units.filter(function(u){return u.side==='enemy';}).forEach(function(u){order++;
 // US-022 冻结/受伤解冻待机的敌人只生成“待机”意图，不显示也不保留原攻击线；到期后重新生成正常新意图。
 if(frozenSkip(u)){out.push({actor:u.id,kind:u.kind,from:cp(u),to:cp(u),type:'standby',frozen:true,path:[],order:order});return;}
 var attacks=enemyAttacks(s,u);attacks.sort(function(a,b){var ta=at(s,a.to),tb=at(s,b.to),pa=ta&&ta.kind==='king'?0:ta&&ta.kind==='rook'?1:2,pb=tb&&tb.kind==='king'?0:tb&&tb.kind==='rook'?1:2;return pa-pb||a.to.y-b.to.y||a.to.x-b.to.x;});var a=attacks[0];if(!a)out.push({actor:u.id,kind:u.kind,from:cp(u),to:cp(u),type:'standby',path:[],order:order});else{a=cp(a);a.order=order;a.kind=u.kind;a.offset={x:a.to.x-u.x,y:a.to.y-u.y};out.push(a);}});return out;}
function prepareEnemy(s){var k=king(s,'player');if(!k){s.intents=[];return{state:s,effects:[]};}var effects=[];s.units.filter(function(u){return u.side==='enemy';}).forEach(function(u){if(frozenSkip(u)){effects.push({actor:u.id,status:'frozen'});return;}var as=enemyAttacks(s,u);if(as.length){effects.push({actor:u.id,status:'ready'});return;}var moves=enemyMoves(s,u);moves.sort(function(a,b){var da=Math.abs(a.to.x-k.x)+Math.abs(a.to.y-k.y),db=Math.abs(b.to.x-k.x)+Math.abs(b.to.y-k.y);return da-db||a.to.y-b.to.y||a.to.x-b.to.x;});if(!moves.length){effects.push({actor:u.id,status:'standby'});return;}var e=apply(s,moves[0],false);e.status='prepared';effects.push(e);});s.intents=generateIntents(s);return{state:s,effects:effects};}
function intentTarget(s,i){var u=s.units.find(function(v){return v.id===i.actor;});return u&&i.offset?{x:u.x+i.offset.x,y:u.y+i.offset.y}:cp(i.to);}
function recordKill(s,actor,dead){if(!actor||actor.side!=='player'||!dead||dead.side!=='enemy'||s.killLedger[dead.id])return;s.killLedger[dead.id]=true;s.killValues=s.killValues||{};s.killValues[dead.id]=dead.kind==='king'?5:1;actor.kills++;actor.level++;s.teamSp++;s.kills++;s.highestLevel=Math.max(s.highestLevel,actor.level);}
function keepCorpse(u){return commanderTarget(u)||(u.kind==='advisor'&&u.side==='player');}
function leaveCorpse(s,u){if(isWater(u,s)||!keepCorpse(u))return;var body=cp(u);body.hp=0;s.corpses.push({id:'corpse-'+u.id,x:u.x,y:u.y,unit:body});}
function removeDead(s,actor){var all=s.units.filter(function(u){return u.hp<=0;});all.forEach(function(u){leaveCorpse(s,u);});s.units=s.units.filter(function(u){return u.hp>0;});var actorAlive=actor&&s.units.some(function(u){return u.id===actor.id;});all.forEach(function(dead){if(actor&&actor.side==='player'&&dead.side==='enemy'&&!s.killLedger[dead.id]){if(actorAlive)recordKill(s,actor,dead);else{s.killLedger[dead.id]=true;s.killValues=s.killValues||{};s.killValues[dead.id]=dead.kind==='king'?5:1;s.kills++;}}if(commanderTarget(dead)){var member=partyUnit(s,dead.id);if(member)Object.assign(member,cp(dead));}});return all.map(function(u){return u.id;});}
function terminal(s){if(!king(s,'player')){s.phase='result';s.result='dead';s.intents=[];return;}if(!king(s,'enemy'))finishVictory(s);}
function finishVictory(s){if(s.settled)return;s.pendingSpawns=[];s.intents=[];s.units.filter(function(u){return commanderTarget(u)&&u.kind==='rook'&&u.rookRole==='pull';}).forEach(function(){s.teamSp++;});var award=Object.keys(s.killLedger).reduce(function(total,id){return total+((s.killValues&&s.killValues[id])||(id==='w1-7'?5:1));},0);s.gold+=award;s.settled=true;s.phase='intermission';s.result='victory';s.completed=Math.max(s.completed||0,s.level||1);}
function consume(u,a){if(u.side!=='player')return;if(u.kind==='rook'){if(a.type==='rook-move'||a.type==='move'||a.type==='attack')u.rookMoveAvailable=false;else{u.rookMoveAvailable=false;u.rookChargeAvailable=false;u.ap=0;}}else if(u.kind==='cannon'){if(a.type==='move')u.cannonMoveAvailable=false;else{u.cannonMoveAvailable=false;u.cannonAttackAvailable=false;u.ap=0;}}else if(u.kind==='horse'&&u.side==='player'){if(a.type==='horse-jump'){u.horseJumpUsed=true;u.ap=0;}else u.ap=Math.max(0,u.ap-1);}else if(u.kind==='elephant'&&u.side==='player'){if(a.type==='elephant-pull'||a.type==='elephant-freeze'){u.elephantSkillUsed=true;u.ap=0;}else u.ap=Math.max(0,u.ap-1);}else u.ap=Math.max(0,u.ap-1);setActed(u);}
function hit(effect,t,amount,source){source=source||'direct';var before=t.hp;t.hp-=amount;if(effect.damage.indexOf(t.id)<0)effect.damage.push(t.id);var existing=effect.hits.find(function(h){return h.id===t.id;});if(existing){existing.damage+=amount;existing[source+'Damage']+=amount;}else{var h={id:t.id,kind:t.kind,side:t.side,before:before,damage:amount,x:t.x,y:t.y,directDamage:0,collisionDamage:0};h[source+'Damage']=amount;effect.hits.push(h);}
 // US-022 实际受伤（含碰撞伤害）清除全部剩余冻结阶段，但本回合仍待机：thawStandby 由本次敌方阶段消耗。
 if(amount>0)thawFrozen(t);}
function collision(effect,items){items.forEach(function(item){hit(effect,item.unit,item.damage,'collision');});}
function applyCharge(s,u,a,e){var target=at(s,a.to),rock=mountain(s,a.to),dx=Math.sign(a.to.x-u.x),dy=Math.sign(a.to.y-u.y),approach=target||rock?a.path.slice(0,-1):a.path;var water=approach.find(function(p){return isWater(p,s);});if(water){u.x=water.x;u.y=water.y;e.pushStatus='water-interrupted';return;}if(!target&&!rock){u.x=a.to.x;u.y=a.to.y;return;}var near={x:a.to.x-dx,y:a.to.y-dy};u.x=near.x;u.y=near.y;e.approachCell=cp(near);if(rock){rockHit(s,a.to,e);return;}if(!directHit(s,u,target,e))return;if(target.hp<=0){e.victims=removeDead(s,u);if(s.units.some(function(v){return v.id===u.id;})&&!corpseAt(s,a.to)){u.x=a.to.x;u.y=a.to.y;}return;}if(!u.rookPush)return;if(target.device){e.pushStatus='immovable';return;}var push={x:target.x+dx,y:target.y+dy};if(!inside(push)){e.pushStatus='outside';return;}if((target.kind==='advisor'||target.kind==='king'&&target.side!=='player')&&!inPalace(target.side,push)){e.pushStatus='palace';return;}var blocker=at(s,push),body=corpseAt(s,push),wall=mountain(s,push);if(!blocker&&!body&&!wall){target.x=push.x;target.y=push.y;e.pushed={id:target.id,to:cp(push)};e.pushStatus='pushed';drown(s,target,e);e.victims=removeDead(s,u);return;}e.pushStatus=wall?'collision-mountain':body?'collision-corpse':blocker&&blocker.device?'collision-advisor':'collision';var items=blocker&&blocker.device?[{unit:u,damage:1},{unit:target,damage:1}]:[{unit:u,damage:1},{unit:target,damage:2}];if(blocker)items.push({unit:blocker,damage:1});collision(e,items);if(wall)rockHit(s,push,e);e.victims=removeDead(s,u);if(s.units.some(function(v){return v.id===u.id;})&&!s.units.some(function(v){return v.id===target.id;})){u.x=a.to.x;u.y=a.to.y;}}
function applyPushCorpse(s,u,a,e){var body=corpseAt(s,a.to),dx=Math.sign(a.to.x-u.x),dy=Math.sign(a.to.y-u.y);if(!body)return;var water=a.path.slice(0,-1).find(function(p){return isWater(p,s);});if(water){u.x=water.x;u.y=water.y;e.pushStatus='water-interrupted';return;}var behind={x:body.x+dx,y:body.y+dy};e.approachCell={x:body.x-dx,y:body.y-dy};u.x=e.approachCell.x;u.y=e.approachCell.y;if(!inside(behind)){e.pushStatus='outside';return;}var blocker=at(s,behind),wall=mountain(s,behind);if(!blocker&&!wall&&!corpseAt(s,behind)){if(isWater(behind,s)){s.corpses=s.corpses.filter(function(c){return c!==body;});e.pushStatus='water';}else{body.x=behind.x;body.y=behind.y;e.pushed={id:body.id,to:cp(behind)};e.pushStatus='pushed';}return;}if(blocker||wall){hit(e,u,1,'collision');if(blocker)hit(e,blocker,1,'collision');if(wall)rockHit(s,behind,e);e.victims=removeDead(s,u);e.pushStatus=wall?'collision-mountain':'collision';}else e.pushStatus='corpse';}
function applyPull(s,u,a,e){var target=at(s,a.to)||corpseAt(s,a.to);if(!target)return;if(a.type==='pull-collision'){hit(e,u,1,'collision');hit(e,target,1,'collision');e.victims=removeDead(s,u);e.pushStatus='collision';return;}if(target.unit){if(isWater(a.targetTo,s)){s.corpses=s.corpses.filter(function(c){return c!==target;});e.pushStatus='water';}else{target.x=a.targetTo.x;target.y=a.targetTo.y;e.pushed={id:target.id,to:cp(a.targetTo)};e.pushStatus='pulled';}}else{target.x=a.targetTo.x;target.y=a.targetTo.y;e.pushed={id:target.id,to:cp(a.targetTo)};e.pushStatus='pulled';drown(s,target,e);e.victims=removeDead(s,u);}}
function apply(s,a,consumeAction,previewMode){var u=s.units.find(function(v){return v.id===a.actor;}),e={actor:a.actor,to:cp(a.from),actorTo:cp(a.from),path:cp(a.path||[]),approachCell:null,victims:[],damage:[],hits:[],pushed:null,pushStatus:null,status:'success',preview:!!previewMode};if(!u){e.status='removed';return e;}
 if(a.type==='move'||a.type==='rook-move'){u.x=a.to.x;u.y=a.to.y;e.to=cp(a.to);}else if(a.type==='charge')applyCharge(s,u,a,e);else if(a.type==='charge-corpse')applyPushCorpse(s,u,a,e);else if(a.type==='pull'||a.type==='pull-collision')applyPull(s,u,a,e);else if(a.type==='horse-jump')applyHorseJump(s,u,a,e);else if(a.type==='elephant-pull')applyElephantPull(s,u,a,e);else if(a.type==='elephant-freeze')applyElephantFreeze(s,u,a,e);else{var targets=[],cells=[];if(a.type==='directional'){targets=a.targets.map(function(id){return s.units.find(function(v){return v.id===id;});}).filter(Boolean);cells=a.mountains||[];}else if(u.kind==='cannon'){cells=[cp(a.to)];C.splash.forEach(function(d,i){if(u.cannonMask&1<<i){var p={x:a.to.x+d.x,y:a.to.y+d.y};if(inside(p))cells.push(p);}});targets=cells.map(function(p){return at(s,p);}).filter(Boolean);}else{cells=[cp(a.to)];var one=at(s,a.to);if(one)targets=[one];}var rocks=cells.filter(function(p){return mountain(s,p);});targets.sort(function(x,y){return x.id.localeCompare(y.id);});targets.forEach(function(t){directHit(s,u,t,e);});rocks.forEach(function(p){rockHit(s,p,e);});e.victims=removeDead(s,u);if(u.kind==='rook'&&s.units.some(function(v){return v.id===u.id;})){var dx=Math.sign(a.to.x-u.x),dy=Math.sign(a.to.y-u.y);u.x=a.to.x;u.y=a.to.y;if(rocks.length||targets[0]&&targets[0].hp>0){u.x=a.to.x-dx;u.y=a.to.y-dy;}}}
 if(consumeAction&&s.units.some(function(v){return v.id===u.id;}))consume(u,a);e.actorDead=!s.units.some(function(v){return v.id===u.id;});e.to=e.actorTo={x:u.x,y:u.y};e.landings=e.hits.map(function(h){var live=s.units.find(function(v){return v.id===h.id;});return{id:h.id,to:live?{x:live.x,y:live.y}:{x:h.x,y:h.y},dead:!live};});delete e.preview;syncParty(s);terminal(s);return e;}
function submitAction(s,a,previewMode){var u=s.units.find(function(v){return v.id===a.actor;});if(!u||u.side!=='player'||s.phase!=='player'||(u.kind==='rook'?!u.rookMoveAvailable&&!u.rookChargeAvailable:u.kind==='cannon'?!u.cannonMoveAvailable&&!u.cannonAttackAvailable:u.kind==='horse'?u.ap<=0&&u.horseJumpUsed:u.kind==='elephant'?u.ap<=0&&u.elephantSkillUsed:u.ap<=0)||(Number.isInteger(a.revision)&&a.revision!==s.revision))return{state:s};var mode=a.type==='charge-corpse'?'charge':a.type==='pull-collision'?'pull':a.type;var legal=a.type==='directional'?directionalAction(s,u.id,a.direction):actionAt(s,u,a.to,mode);if(!legal)return{state:s};var n=cp(s),effect=apply(n,legal,true,previewMode);n.revision=(s.revision||0)+1;legal.revision=s.revision;return{state:n,effect:effect,action:legal};}
function submit(s,id,to,mode){var u=s.units.find(function(v){return v.id===id;});if(!u||u.side!=='player'||s.phase!=='player')return{state:s};var a=actionAt(s,u,to,mode);return a?submitAction(s,a):{state:s};}function submitDirection(s,id,d){var a=directionalAction(s,id,d);return a?submitAction(s,a):{state:s};}
function frozenAttack(s,u,i,to){if(!inside(to)||same(u,to))return{invalid:'落点越界或与攻击者重合'};var path=line(u,to);if(u.kind==='cannon'){if(!path.length)return{invalid:'炮的攻击方向失效'};var rocks=path.filter(function(p){return mountain(s,p);});for(var j=0;j<rocks.length;j++){var rp=rocks[j],prefix=line(u,rp);if(prefix.slice(0,-1).filter(function(p){return occupied(s,p);}).length===1){to=cp(rp);path=prefix;break;}}var screens=path.slice(0,-1).filter(function(p){return occupied(s,p);}).length;if(screens!==1)return{invalid:screens?'炮架数量不为一':'缺少炮架'};return{actor:u.id,from:cp(u),to:to,type:'attack',path:path};}var rock=path.find(function(p){return mountain(s,p);});if(rock)to=cp(rock);var target=at(s,to);if(!target&&!mountain(s,to))return ordinary(s,u,to,true)?{missOnly:true,to:to}:{invalid:'攻击形状或路径失效'};var old=target&&target.side;if(target)target.side=u.side==='enemy'?'player':'enemy';var a=ordinary(s,u,to);if(target)target.side=old;if(!a)return{invalid:'攻击形状或路径失效'};a.type='attack';return a;}
function revalidate(s,i){var u=s.units.find(function(v){return v.id===i.actor;}),to=intentTarget(s,i);if(!u)return;if(i.type==='standby')return cp(i);if(wet(s,u))return{invalid:'水中无法攻击'};if(i.type==='directional'){var a=directionalAction(s,u.id,i.direction);return a||{missOnly:true,to:to};}if(i.type==='charge'){var path=line(u,to);if(!path.length||path.length>1||path.slice(0,-1).some(function(p){return occupied(s,p);}))return{invalid:'冲击路径失效'};return{actor:u.id,from:cp(u),to:to,type:'charge',path:path};}return frozenAttack(s,u,i,to);}
function enemyPhase(s,previewMode){var n=cp(s),effects=[],conditional=false;if(s.phase!=='player')return{state:n,effects:effects};
 // US-022 冻结：每个敌方行动阶段跳过行动并在阶段结束时递减；受伤解冻的敌人本次仍待机（thawStandby），下回合恢复。
 var skipped=Object.create(null);(n.units||[]).forEach(function(u){if(frozenSkip(u))skipped[u.id]=true;});
 n.intents.forEach(function(i){if(n.phase!=='player')return;var u=n.units.find(function(v){return v.id===i.actor;}),to=intentTarget(n,i),e;if(!u)e={actor:i.actor,to:to||cp(i.from),victims:[],damage:[],hits:[],status:'removed'};else if(skipped[i.actor])e={actor:i.actor,to:cp(u),victims:[],damage:[],hits:[],status:'standby',frozen:true,remaining:Number.isInteger(u.frozen)?u.frozen:0};else if(i.type==='standby')e={actor:i.actor,to:to||cp(i.from),victims:[],damage:[],hits:[],status:'standby'};else{var a=revalidate(n,i);if(!a||a.invalid)e={actor:i.actor,to:to||cp(i.from),victims:[],damage:[],hits:[],status:'cancelled',reason:a&&a.invalid};else if(a.missOnly)e={actor:i.actor,to:a.to,victims:[],damage:[],hits:[],status:'miss'};else e=apply(n,a,false,previewMode);}if(previewMode&&(conditional||e.conditional)){e.conditional=true;conditional=true;}effects.push(e);});
 (n.units||[]).forEach(function(u){if(u.side!=='enemy')return;if(Number.isInteger(u.frozen)&&u.frozen>0)u.frozen=Math.max(0,u.frozen-1);if(u.thawStandby)u.thawStandby=false;});
 return{state:n,effects:effects,conditional:conditional};}
// US-018 仕阶段：advisorPlan 为只读规划（UI 预览/危险预测/自动开火共用同一套锁敌规则）。
function advisorTurn(s){return Number.isInteger(s.turn)?s.turn:1;}
function advisorDistance(t,k){return k?Math.max(Math.abs(t.x-k.x),Math.abs(t.y-k.y)):0;}
function advisorTargets(s,u){var out=[];C.splash.forEach(function(d){var p={x:u.x+d.x,y:u.y+d.y},t=at(s,p);if(t&&t.side==='enemy')out.push(t);});var k=king(s,'player');out.sort(function(a,b){return advisorDistance(a,k)-advisorDistance(b,k)||a.hp-b.hp||a.y-b.y||a.x-b.x;});return out;}
function advisorPlan(s){return s.units.filter(function(u){return u.side==='player'&&u.kind==='advisor'&&u.device;}).sort(function(a,b){return a.x-b.x||a.y-b.y;}).map(function(u){var interval=u.towerInterval||3,last=Number.isInteger(u.lastFireTurn)?u.lastFireTurn:null,turn=advisorTurn(s),ready=last===null||turn-last>=interval,remaining=ready?0:Math.max(0,interval-(turn-last)),candidates=advisorTargets(s,u),target=candidates[0];return{id:u.id,x:u.x,y:u.y,interval:interval,lastFireTurn:last,ready:ready,remaining:remaining,targetId:target?target.id:null,targetCell:target?{x:target.x,y:target.y}:null,forest:target?terrain(s,target)==='forest':false,willFire:ready&&!!target,enemyIds:candidates.map(function(t){return t.id;})};});}
function advisorPhase(s,previewMode){var n=cp(s),effects=[];if(n.phase!=='player')return{state:n,effects:effects};
 advisorPlan(n).filter(function(p){return p.willFire;}).forEach(function(p){
  var u=n.units.find(function(v){return v.id===p.id;});if(!u)return;var target=n.units.find(function(v){return v.id===p.targetId;});
  var e={actor:p.id,kind:'advisor',from:{x:u.x,y:u.y},to:p.targetCell?cp(p.targetCell):{x:u.x,y:u.y},target:p.targetId,status:'hit',hits:[],damage:[],victims:[],conditional:!!p.forest};
  var before=target?target.hp:0;
  if(p.forest&&!previewMode&&random(n)<.3){e.status='miss';e.misses=[p.targetId];}
  else if(target){hit(e,target,u.attack||1);if(before>0&&target.hp<=0){e.kills=[target.id];if(!previewMode&&u.side==='player')recordKill(n,u,target);}}
  u.lastFireTurn=advisorTurn(n);effects.push(e);
 });
 if(effects.length)removeDead(n);
 return{state:n,effects:effects};}
// 统一流水线：仕阶段 → 胜负检查 → 敌攻；预览与实战共用，避免预测和结算顺序不一致。
function enemyTurn(s,previewMode){var shot=advisorPhase(s,previewMode),n=shot.state,shotConditional=shot.effects.some(function(e){return e.conditional;}),shotHit=shot.effects.some(function(e){return e.status==='hit';});
 if(shotHit)terminal(n);
 if(n.phase!=='player')return{state:n,effects:shot.effects.slice(),advisor:shot.effects,conditional:shotConditional};
 var out=enemyPhase(n,previewMode);
 return{state:out.state,effects:shot.effects.concat(out.effects),advisor:shot.effects,conditional:shotConditional||out.conditional};}
function attemptSpawns(s){var effects=[];s.pendingSpawns.forEach(function(p){if(p.status==='spawned')return;var pos={x:p.x,y:p.y},live=at(s,pos),body=corpseAt(s,pos);if(live&&live.side==='player'){live.hp-=1;removeDead(s);p.status='blocked';p.reason='友军占出生格，本次扣1并阻挡';effects.push({id:p.id,status:'blocked',to:pos});return;}if(live){p.status='blocked';p.reason='旧敌占出生格，暂缓重试（临时边界 TBD）';effects.push({id:p.id,status:'blocked-enemy',to:pos});return;}if(body)s.corpses=s.corpses.filter(function(c){return c!==body;});s.units.push(unit(p.id,'enemy',p.kind,p.x,p.y));p.status='spawned';p.reason=body?'清除尸体后入场':'已入场';effects.push({id:p.id,status:'spawned',to:pos});});return effects;}
function enterWaveTwo(s){s.wave=2;s.rescueRequired=false;s.reinforcementPreview=true;s.pendingSpawns=s.pendingSpawns.length?s.pendingSpawns:pendingWaveTwo();var effects=attemptSpawns(s);prepareEnemy(s);return effects;}
function endTurn(s){if(s.phase!=='player')return{state:s,effects:[]};var out=enemyTurn(s),n=out.state;n.revision=(s.revision||0)+1;if(n.phase!=='player')return{state:n,effects:out.effects};if(n.turn>=11){finishVictory(n);return{state:n,effects:out.effects};}n.turn++;n.units.forEach(resetTurn);if(n.turn===5){n.reinforcementPreview=true;n.pendingSpawns=pendingWaveTwo();}if(n.turn===6){if(buffState(n).rescue&&!n.rescueUsed){var targets=rescueTargets(n);if(targets.live.length||targets.corpses.length){n.phase='rescue';n.rescueRequired=true;n.intents=[];}else enterWaveTwo(n);}else enterWaveTwo(n);}else{if(n.turn>=7&&n.pendingSpawns.length)attemptSpawns(n);terminal(n);if(n.phase==='player')prepareEnemy(n);}return{state:n,effects:out.effects};}
// US-020 救援：只在第二波衔接时点触发一次；只可选受伤的存活普通队友，或尸体仍在场的普通队友。
// 主帅、仕/仕残骸、满血单位、已销毁尸体、非本场后备与敌方单位一律不可选。
function rescueTargets(s){var live=(s.units||[]).filter(function(u){return commanderTarget(u)&&u.hp>0&&u.hp<u.maxHp;}).map(function(u){return u.id;});var bodies=(s.corpses||[]).filter(function(c){return c.unit&&commanderTarget(c.unit);}).map(function(c){return c.unit.id;});return{live:live,corpses:bodies};}
function finishRescue(n,id){n.rescueUsed=true;n.revision=(n.revision||0)+1;if(id)n.units.filter(function(u){return u.side==='player'&&u.id===id;}).forEach(resetTurn);syncParty(n);n.phase='player';enterWaveTwo(n);terminal(n);return n;}
function rescue(s,id){if(s.phase!=='rescue'||s.rescueUsed)return s;var n=cp(s),targets=rescueTargets(n);
 if(targets.live.indexOf(id)>=0){var live=n.units.find(function(u){return u.id===id;});live.hp=live.maxHp;}
 else if(targets.corpses.indexOf(id)>=0){var body=n.corpses.find(function(c){return c.unit&&c.unit.id===id;}),revived=cp(body.unit);revived.hp=1;revived.x=body.x;revived.y=body.y;n.units.push(revived);n.corpses=n.corpses.filter(function(c){return c!==body;});}
 else return s;
 return finishRescue(n,id);}
function rescueSkip(s){if(s.phase!=='rescue'||s.rescueUsed)return s;return finishRescue(cp(s),null);}
function purchaseUpgrade(s,id,skill,index){
 if(['player','intermission','deploy'].indexOf(s.phase)<0)return s;
 var n=cp(s),u=n.units.find(function(v){return v.id===id&&v.side==='player';});
 // US-021 购买阶段：战斗中与布阵只为场上存活棋子购买；营地（intermission）可为上场与后备队友购买。
 if(!u){if(s.phase==='player'||s.phase==='deploy')return s;u=partyUnit(n,id);}
 if(!u||u.kind==='king')return s;
 if(u.kind==='horse'&&u.side==='player')ensureHorseFields(u);
 // US-018 仕只升级攻击间隔 3→2（3 SP）→1（5 SP），不提供强健或其他成长；档位立即影响下一次冷却判定。
 if(u.kind==='advisor'){if(skill!=='advisor-interval'||!(u.towerInterval>1))return s;var next=u.towerInterval>=3?2:1,acost=next===2?3:5;if(!Number.isInteger(n.teamSp)||n.teamSp<acost)return s;u.towerInterval=next;n.teamSp-=acost;n.revision=(s.revision||0)+1;syncParty(n);return n;}
 var cost=(skill==='promote-archer'||skill==='promote-spearman'||skill==='combo'||skill==='rook-charge-role'||skill==='rook-pull-role')?2:1;
 // US-021 三项马成长独立购买：推动 2 SP（一次性）、技能距离每次 1 SP、技能伤害每次 2 SP；无互相前置。
 if(u.kind==='horse'){if(skill==='horse-push')cost=C.horse.pushCost;else if(skill==='horse-jump-distance')cost=C.horse.distanceCost;else if(skill==='horse-jump-damage')cost=C.horse.damageCost;}
 // US-022 象成长：牵引射程每次 1 SP（四向一起 +1，上限 8）、冰封 2 SP 一次性解锁、冻结时长每次 2 SP（上限 3）；
 // 升级只作用于所选象，不改变其他象，也不刷新行动；冰封时长加长不改变固定 5×5 范围。
 if(u.kind==='elephant'){if(skill==='elephant-pull-range')cost=C.elephant.pullCost;else if(skill==='elephant-freeze-unlock')cost=C.elephant.freezeUnlockCost;else if(skill==='elephant-freeze-duration')cost=C.elephant.freezeDurationCost;}
 if(!Number.isInteger(n.teamSp)||n.teamSp<cost)return s;
 var ok=false;
 if(skill==='fortify'){u.maxHp++;u.hp++;u.fortify++;ok=true;}
 else if(skill==='promote-archer'&&u.kind==='pawn'){u.kind='archer';u.attack=2;ok=true;}
 else if(skill==='promote-spearman'&&u.kind==='pawn'){u.kind='spearman';u.maxHp++;u.hp++;ok=true;}
 else if(skill==='combo'&&pawnish(u)){u.combo++;ok=true;}
 else if(skill==='direction'&&(u.kind==='archer'||u.kind==='spearman')&&Number.isInteger(index)&&index>=0&&index<4&&u.directionPaid[index]<6){u.directionPaid[index]++;ok=true;}
 else if(skill==='rook-charge-role'&&u.kind==='rook'&&u.rookRole==='base'){u.rookRole='charge';u.rookChargeAvailable=true;ok=true;}
 else if(skill==='rook-pull-role'&&u.kind==='rook'&&u.rookRole==='base'){u.rookRole='pull';u.rookChargeAvailable=true;ok=true;}
 else if(skill==='rook-charge'&&u.kind==='rook'&&u.rookRole==='charge'&&u.rookChargeRange<8){u.rookChargeRange++;ok=true;}
 else if(skill==='rook-pull'&&u.kind==='rook'&&u.rookRole==='pull'&&u.rookPullRange<8){u.rookPullRange++;ok=true;}
 else if(skill==='rook-push'&&u.kind==='rook'&&u.rookRole==='charge'&&!u.rookPush){u.rookPush=true;ok=true;}
 else if(skill==='cannon-splash'&&u.kind==='cannon'&&Number.isInteger(index)&&index>=0&&index<8&&!(u.cannonMask&(1<<index))){u.cannonMask|=1<<index;ok=true;}
 else if(skill==='horse-push'&&u.kind==='horse'&&u.side==='player'&&!u.horsePush){u.horsePush=true;ok=true;}
 else if(skill==='horse-jump-distance'&&u.kind==='horse'&&u.side==='player'&&horseJumpRangeOf(u)<C.horse.maxJumpRange){u.horseJumpRange=horseJumpRangeOf(u)+1;ok=true;}
 else if(skill==='horse-jump-damage'&&u.kind==='horse'&&u.side==='player'&&horseJumpDamageOf(u)<C.horse.maxJumpDamage){u.horseJumpDamage=horseJumpDamageOf(u)+1;ok=true;}
 else if(skill==='elephant-pull-range'&&u.kind==='elephant'&&u.side==='player'&&elephantPullRangeOf(u)<C.elephant.maxPullRange){u.elephantPullRange=elephantPullRangeOf(u)+1;ok=true;}
 else if(skill==='elephant-freeze-unlock'&&u.kind==='elephant'&&u.side==='player'&&!elephantFreezeUnlocked(u)){u.elephantFreezeUnlocked=true;u.elephantFreezeDuration=Math.min(C.elephant.maxFreezeDuration,Math.max(Number.isInteger(u.elephantFreezeDuration)&&u.elephantFreezeDuration>0?u.elephantFreezeDuration:0,C.elephant.freezeDuration));ok=true;}
 else if(skill==='elephant-freeze-duration'&&u.kind==='elephant'&&u.side==='player'&&elephantFreezeUnlocked(u)&&elephantFreezeDurationOf(u)<C.elephant.maxFreezeDuration){u.elephantFreezeDuration=elephantFreezeDurationOf(u)+1;ok=true;}
 if(!ok)return s;
 n.teamSp-=cost;n.revision=(s.revision||0)+1;syncParty(n);return n;
}
function syncParty(s){s.party.forEach(function(base){var live=s.units.find(function(u){return u.id===base.id&&u.side==='player';}),body=s.corpses.find(function(c){return c.unit.id===base.id;});var current=live||(body&&body.unit);if(current)Object.assign(base,cp(current));});}
function buy(s,kind){if(s.phase!=='intermission'||['pawn','rook','horse','cannon','advisor','elephant'].indexOf(kind)<0)return s;var price=kind==='pawn'?3:kind==='cannon'?8:5;if(kind==='advisor'&&s.party.filter(function(u){return u.kind==='advisor';}).length>=C.advisorMax)return s;if(s.gold<price)return s;var n=cp(s),serial=0,id;do{id='recruit-'+kind+'-'+serial++;}while(n.party.some(function(u){return u.id===id;}));var recruit=unit(id,'player',kind,0,0);n.party.push(recruit);applyJourneyBuffs(n);if(kind==='advisor')n.activeIds.push(id);else if(activeOrdinary(n).length<populationLimit(n))n.activeIds.push(id);else n.bench.push(id);n.gold-=price;return n;}
// US-020 人口：只限制上场普通队友数量；主帅与仕不占人口，后备不限。持有数量不限，部署上限固定 4～8（越界存档按边界收敛）。
function populationLimit(s){return Number.isInteger(s.population)&&s.population>=C.population.initial?Math.min(C.population.max,s.population):C.population.initial;}
function activeOrdinary(s){return(s.activeIds||[]).filter(function(id){var u=partyUnit(s,id);return u&&u.kind!=='advisor'&&u.kind!=='king';});}
function setActiveRoster(s,ids){if(s.phase!=='intermission'||!Array.isArray(ids))return s;var fixed=s.party.filter(function(u){return u.kind==='advisor';}).map(function(u){return u.id;});ids=ids.filter(function(id){return fixed.indexOf(id)<0;}).concat(fixed);if(ids.filter(function(id){var u=partyUnit(s,id);return !u||u.kind!=='advisor';}).length>populationLimit(s)||new Set(ids).size!==ids.length||ids.some(function(id){return !partyUnit(s,id);}))return s;var n=cp(s);n.activeIds=ids.slice();n.bench=n.party.map(function(u){return u.id;}).filter(function(id){return ids.indexOf(id)<0;});return n;}
function nextLevel(s,map){if(s.phase!=='intermission')return s;var base=migrateState(s);syncParty(base);return constructLevel(base,true,map);}
function deploy(s,id,to){if(s.phase!=='deploy'||!inside(to)||to.y>C.river-1)return s;var n=cp(s),u=n.units.find(function(v){return v.id===id&&v.side==='player'&&v.kind!=='king';});
 // US-018 待布置仕：只在布阵阶段、目标侧位确实空出后手动放置；不覆盖、不挤走任何原有棋子。
 if(!u&&(n.pendingAdvisorIds||[]).indexOf(id)>=0){var pv=partyUnit(n,id);if(!pv||pv.kind!=='advisor'||!C.advisorCells.some(function(c){return same(c,to);})||occupied(n,to)||isWater(to,n))return s;n.pendingAdvisorIds=n.pendingAdvisorIds.filter(function(v){return v!==id;});n.units.push(advisorOnBoard(pv,to.x,to.y));return n;}
 if(!u)return s;
 if(u.kind==='advisor'){if(!C.advisorCells.some(function(c){return same(c,to);})||isWater(to,n)||mountain(n,to))return s;var other=at(n,to);if(other){if(other.id===u.id)return s;if(!(other.kind==='advisor'&&other.side==='player'))return s;other.x=u.x;other.y=u.y;}u.x=to.x;u.y=to.y;return n;}
 if(occupied(s,to)||isWater(to,s))return s;u.x=to.x;u.y=to.y;return n;}
function confirmDeployment(s){if(s.phase!=='deploy'||(s.pendingAdvisorIds||[]).length||s.units.filter(function(u){return u.side==='player';}).some(function(u){return !inside(u)||mountain(s,u)||isWater(u,s)||!s.testMap&&(u.y>=4||(u.kind==='king'&&!same(u,C.spawns.king))||(u.kind==='advisor'&&!C.advisorCells.some(function(c){return same(c,u);})))||s.units.some(function(v){return v.id!==u.id&&same(u,v);});}))return s;
 // US-020 人口校验：至少 1 名普通队友上场，且不超过当前人口；主帅与仕不占人口。入关快照保持进入关卡时的版本。
 // 独立测试地图（编辑器试玩/夹具）沿用原豁免，不套用正式旅程人口。
 var count=s.units.filter(function(u){return u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor'&&!u.device;}).length;
 if(!s.testMap&&(count<1||count>populationLimit(s)))return s;
 var n=cp(s);n.phase='player';prepareEnemy(n);return n;}
function retryLevel(s){if(s.result!=='dead'||!s.levelSnapshot)return s;var n=migrateState(s.levelSnapshot);n.phase='deploy';n.result=undefined;n.intents=[];n.revision=(s.revision||0)+1;
 // 重试仍以“确认进入关卡”时的入关快照为准；重试后的状态重新持有该快照，保证可再次重试。
 n.entrySnapshot=cp(n);n.levelSnapshot=cp(n);return n;}
function nextWave(s){return nextLevel(s);}
function actionReason(s,id,to,mode){var u=s.units.find(function(v){return v.id===id;});if(!u||u.side!=='player'||s.phase!=='player')return'当前不能行动';if(u.kind==='advisor')return'仕是固定防御装置：不能主动移动或攻击，结束回合后自动开火';if(u.kind==='king'){if(u.ap<=0)return'本回合已行动，下回合可移动';if(!inside(to)||same(u,to))return'请选择棋盘内其他空格';if(at(s,to))return'主帅不能攻击或吃子，只能移动到空格';if(mountain(s,to))return'山阻挡通行，主帅不能上山';if(isWater(to,s))return'主帅不能主动进入水格，不消耗行动';if(corpseAt(s,to))return'尸体占格，不能移动或攻击';if((to.x!==u.x&&to.y!==u.y)&&!(inPalace(u.side,u)&&inPalace(u.side,to)&&palaceDiag(u.side,u,to)))return'主帅斜走仅限宫内米字线中心与四角';return'该目标不合法';}
 // US-021 我方马：区分普通移动与跳跃攻击的拒绝理由，非法操作不消耗技能/行动。
 if(u.side==='player'&&u.kind==='horse')return mode==='horse-jump'?horseJumpReason(s,u,to):horseMoveReason(s,u,to);
 // US-022 我方象：区分普通移动与牵引/冰封的拒绝理由，非法操作不消耗技能/行动。
 if(u.side==='player'&&u.kind==='elephant')return mode==='elephant-pull'?elephantPullReason(s,u,to):mode==='elephant-freeze'?elephantFreezeReason(s,u,to):elephantMoveReason(s,u,to);
 if(wet(s,u)&&(mode==='pull'||mode==='charge'||at(s,to)||mountain(s,to)))return'水中无法攻击、冲锋或牵引，请先合法移出水面';if(mountain(s,to))return'山阻挡通行；攻击须符合本兵种走法，炮须另有且恰好一个炮架';if(!at(s,to)&&fatalWater(u)&&line(u,to).some(function(p){return isWater(p,s);}))return'禁止主动进入或经过致死水格，不消耗行动';if(corpseAt(s,to)&&u.kind!=='rook')return'尸体占格，不能移动或攻击';if(u.kind==='cannon'){if(!u.cannonMoveAvailable&&!u.cannonAttackAvailable)return'炮本回合已攻击，不能再移动或攻击';if(!inside(to)||same(u,to))return'请选择棋盘内其他格';if(u.x!==to.x&&u.y!==to.y)return'炮只能攻击横竖同线目标';var t=at(s,to),path=line(u,to),screens=path.slice(0,-1).filter(function(p){return occupied(s,p);}).length;if(t&&t.side!==u.side){if(!u.cannonAttackAvailable)return'炮本回合已攻击，不能再攻击';if(screens===0)return'目标与炮之间没有炮架';if(screens>1)return'目标与炮之间有多个炮架';}if(!t){if(!u.cannonMoveAvailable)return'炮本回合已移动，仍可攻击';if(screens>0)return'炮移动路径被阻挡';if(path.length>3+u.commanderMove)return'该空格超出炮的移动范围';}return'该目标不合法';}if(u.kind!=='rook'&&u.ap<=0)return'本回合已行动，下回合可攻击';return'该目标不合法';}
function preview(s,id,to,mode){var u=s.units.find(function(v){return v.id===id;}),a=u&&actionAt(s,u,to,mode);if(!a)return;var r=submitAction(s,Object.assign({revision:s.revision},a),true);if(!r.effect)return;a.revision=s.revision;var prediction=enemyTurn(r.state,true);if(r.effect.conditional){prediction.conditional=true;prediction.effects.forEach(function(e){e.conditional=true;});}return{action:a,effect:r.effect,state:r.state,prediction:prediction};}
function previewDirection(s,id,d){var a=directionalAction(s,id,d);if(!a)return;var r=submitAction(s,Object.assign({revision:s.revision},a),true);a.revision=s.revision;var prediction=enemyTurn(r.state,true);if(r.effect&&r.effect.conditional){prediction.conditional=true;prediction.effects.forEach(function(e){e.conditional=true;});}return r.effect?{action:a,effect:r.effect,state:r.state,prediction:prediction}:undefined;}
function upgradeChoices(s){var o=[];s.units.filter(function(u){return u.side==='player'&&u.kind!=='king'&&s.teamSp>0;}).forEach(function(u){function add(skill,i){var n=purchaseUpgrade(s,u.id,skill,i);if(n!==s)o.push({unit:u.id,skill:skill,index:i,state:n});}if(u.kind==='advisor'){add('advisor-interval');return;}add('fortify');if(pawnish(u))add('combo');if(u.kind==='pawn'){add('promote-archer');add('promote-spearman');}if(u.kind==='archer'||u.kind==='spearman')for(var d=0;d<4;d++)add('direction',d);if(u.kind==='rook'){add('rook-charge-role');add('rook-pull-role');add('rook-charge');add('rook-pull');add('rook-push');}if(u.kind==='horse'){add('horse-push');add('horse-jump-distance');add('horse-jump-damage');}if(u.kind==='elephant'){add('elephant-pull-range');add('elephant-freeze-unlock');add('elephant-freeze-duration');}if(u.kind==='cannon')for(var i=0;i<8;i++)add('cannon-splash',i);});return o;}
function* escapeAnalysis(s){var seen=new Set(),nodes=0;function* search(cur,plan){nodes++;yield;if(cur.phase==='intermission'||cur.result==='victory')return plan;if(cur.phase==='result')return;var resolved=enemyTurn(cur).state;if(king(resolved,'player')&&resolved.result!=='dead')return plan;var key=JSON.stringify([cur.units,cur.intents,cur.teamSp]);if(seen.has(key))return;seen.add(key);var ps=cur.units.filter(function(u){return u.side==='player';});for(var i=0;i<ps.length;i++){var as=legalActions(cur,ps[i].id);for(var j=0;j<as.length;j++){var r=submitAction(cur,as[j]);if(!r.effect)continue;var found=yield* search(r.state,plan.concat([as[j]]));if(found)return found;}}var ups=upgradeChoices(cur);for(var q=0;q<ups.length;q++){var step={type:'upgrade',actor:ups[q].unit,skill:ups[q].skill,index:ups[q].index};var safe=yield* search(ups[q].state,plan.concat([step]));if(safe)return safe;}}var plan=yield* search(cp(s),[]);return{safe:!!plan,plan:plan||[],nodes:nodes};}
function analyze(s){var it=escapeAnalysis(s),v=it.next();while(!v.done)v=it.next();return v.value;}function dangerNow(s){var k=king(s,'player');return!k||enemyTurn(s,true).effects.some(function(e){return e.damage.indexOf(k.id)>=0;});}function checkmate(s){return s;}
function fixtureState(name,variant){var s=emptyState([unit('king','player','king',4,0),unit('boss','enemy','king',4,8)]);function add(u){s.units.push(u);return u;}if(name==='P1'){if(variant==='river-edge'){add(unit('rook','player','rook',0,0));add(unit('pawn','player','pawn',4,3));add(unit('enemy','enemy','pawn',4,5));}else if(variant==='bridge-death'||variant==='water-death'){var x=variant==='bridge-death'?1:0,enemy=add(unit('enemy','enemy','pawn',x,5));add(unit('ally','player','horse',x,4));s.intents=[{actor:enemy.id,from:{x:x,y:5},to:{x:x,y:4},offset:{x:0,y:-1},type:'attack',path:[{x:x,y:4}],order:1}];return s;}else{add(unit('pawn','player','pawn',2,5));add(unit('e1','enemy','pawn',2,6));add(unit('e2','enemy','pawn',3,5));}}else if(name==='P2'){var r=add(unit('rook','player','rook',1,4));r.rookRole='charge';r.rookChargeRange=3;r.rookPush=true;add(unit('target','enemy','rook',4,4));if(variant==='blocked')add(unit('block','enemy','pawn',5,4));}else if(name==='P3'){if(variant==='basic-growth'){add(unit('cannon','player','cannon',2,1));add(unit('screen-a','player','horse',2,2));add(unit('target-a','enemy','pawn',2,4));add(unit('screen-b','player','horse',3,1));add(unit('target-b','enemy','rook',5,1));add(unit('splash-b','enemy','pawn',6,1));}else{var c=add(unit('cannon','player','cannon',4,1));s.teamSp=2;add(unit('screen','enemy','pawn',4,3));add(unit('target','enemy','rook',4,5));add(unit('north','enemy','rook',4,6));add(unit('east','enemy','rook',5,5));}}else if(name==='P4'){var c4=add(unit('cannon','player','cannon',4,1));s.teamSp=1;add(unit('screen','player','horse',4,3));add(unit('target','enemy','rook',4,4));}else if(name==='P5'){var c5=add(unit('cannon','player','cannon',2,1));s.teamSp=8;add(unit('screen','enemy','pawn',2,3));add(unit('target','enemy','rook',2,5));}else if(name==='P6'){var k=king(s,'player');k.hp=1;s.teamSp=variant==='mate'?0:1;k.ap=0;setActed(k);var er=add(unit('threat','enemy','rook',4,1));s.intents=[{actor:er.id,from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'charge',path:[{x:4,y:0}],order:1}];return s;}else if(name==='P7'){if(variant==='archer-range'||variant==='archer-blind'){add(unit('archer','player','archer',4,3));add(unit(variant==='archer-blind'?'near':'target','enemy','pawn',4,variant==='archer-blind'?4:5));if(variant==='archer-blind')add(unit('far','enemy','pawn',4,5));}else{var p=add(unit('pawn','player',variant==='spearman'?'spearman':'archer',2,5));p.directionPaid[0]=2;p.attack=p.kind==='archer'?2:1;add(unit('near','enemy','pawn',2,6));add(unit('far','enemy','pawn',2,8));if(variant==='blocked')add(unit('block','player','horse',2,7));}}else if(name==='P8'){if(variant==='enemy-empty'){var er8=add(unit('enemy-rook','enemy','rook',0,4));s.intents=[{actor:er8.id,from:{x:0,y:4},to:{x:0,y:3},offset:{x:0,y:-1},type:'charge',path:[{x:0,y:3}],order:1}];return s;}var r8=add(unit('rook','player','rook',1,1));r8.rookRole='charge';r8.rookChargeRange=3;if(variant==='kill')add(unit('target','enemy','pawn',4,1));else if(variant==='survive')add(unit('target','enemy','rook',4,1));}else if(name==='P9'){if(variant==='escape'){add(unit('runner','player','rook',2,1));var escape=add(unit('enemy','enemy','pawn',4,1));s.intents=[{actor:escape.id,from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'attack',path:[{x:4,y:0}],order:1}];return s;}if(variant==='push-line'){var pr=add(unit('rook','player','rook',1,3));pr.rookRole='charge';pr.rookChargeRange=2;pr.rookPush=true;var pushed=add(unit('enemy-rook','enemy','rook',3,3));s.intents=[{actor:pushed.id,from:{x:3,y:3},to:{x:3,y:2},offset:{x:0,y:-1},type:'charge',path:[{x:3,y:2}],order:1}];return s;}if(variant==='friendly-fire'){var lead=add(unit('lead','enemy','pawn',4,2));add(unit('friend','enemy','pawn',4,1));s.intents=[{actor:lead.id,from:{x:4,y:2},to:{x:4,y:1},offset:{x:0,y:-1},type:'attack',path:[{x:4,y:1}],order:1}];return s;}if(variant==='cannon-rack'){var ec=add(unit('enemy-cannon','enemy','cannon',2,5));add(unit('rack','player','horse',2,3));add(unit('target','player','rook',2,1));s.intents=[{actor:ec.id,from:{x:2,y:5},to:{x:2,y:1},offset:{x:0,y:-4},type:'attack',path:[{x:2,y:4},{x:2,y:3},{x:2,y:2},{x:2,y:1}],order:1}];return s;}if(variant==='chain'){var first=add(unit('first','enemy','pawn',2,3)),cannon=add(unit('second','enemy','cannon',2,4));add(unit('rack','player','horse',2,2));add(unit('target','player','rook',2,0));s.intents=[{actor:first.id,from:{x:2,y:3},to:{x:2,y:2},offset:{x:0,y:-1},type:'attack',path:[{x:2,y:2}],order:1},{actor:cannon.id,from:{x:2,y:4},to:{x:2,y:0},offset:{x:0,y:-4},type:'attack',path:[{x:2,y:3},{x:2,y:2},{x:2,y:1},{x:2,y:0}],order:2}];return s;}}s.intents=s.units.filter(function(u){return u.side==='enemy';}).map(function(u,i){return{actor:u.id,from:{x:u.x,y:u.y},to:{x:u.x,y:u.y},type:'standby',path:[],order:i+1};});return s;}
// US-020 主营地：入营即执行原跨关恢复（满血、阵亡队友与仕恢复），并只在新旅程首次入营时发放 8 猫粮与免费坚守增益。
function campRecover(s){var n=cp(s);(n.party||[]).forEach(function(u){u.hp=u.maxHp;u.ap=u.apLimit||0;u.acted=false;u.lastFireTurn=null;if(u.kind==='horse'&&u.side==='player')u.horseJumpUsed=false;if(u.kind==='elephant'&&u.side==='player')u.elephantSkillUsed=false;});(n.units||[]).forEach(function(u){if(u.side==='player')u.hp=u.maxHp;});return n;}
function enterCamp(s){var n=campRecover(s);n.phase='intermission';
 if(!n.firstEntryRewarded){n.firstEntryRewarded=true;n.gold=(n.gold||0)+C.firstEntryReward;n.buffs=Object.assign({health:false,move:false,rescue:false},cp(n.buffs||{}));n.buffs.health=true;}
 // 入营时统一校验并应用一次旅程增益：已应用的队友不会被重复加成，缺项的旅程状态在此补齐。
 applyJourneyBuffs(n);
 return n;}
function expandPopulation(s){if(s.phase!=='intermission')return s;var p=populationLimit(s);if(p>=C.population.max||(s.gold||0)<C.population.cost)return s;var n=cp(s);n.population=p+1;n.gold-=C.population.cost;return n;}
function buffUnlockable(s,key){var b=buffState(s);if(key==='health')return!b.health;if(key==='move')return b.health&&!b.move;if(key==='rescue')return b.move&&!b.rescue;return false;}
function unlockBuff(s,key){if(s.phase!=='intermission'||!buffUnlockable(s,key)||(s.gold||0)<C.buffCost)return s;var n=cp(s);n.buffs=Object.assign({health:false,move:false,rescue:false},cp(n.buffs||{}));n.buffs[key]=true;n.gold-=C.buffCost;applyJourneyBuffs(n);return n;}
// 旅程存档：只序列化旅程级字段；玩家级标志（曾完成教学、指引已处理）由存档层单独管理，新旅程不清除。
function journeyRecord(s){var ids=(s.activeIds||[]).filter(function(id){return partyUnit(s,id);});return{gold:s.gold||0,teamSp:s.teamSp||0,population:populationLimit(s),buffs:Object.assign({health:false,move:false,rescue:false},cp(s.buffs||{})),party:cp(s.party||[]),activeIds:cp(ids),bench:cp((s.bench||[]).filter(function(id){return partyUnit(s,id);})),completed:Math.max(0,Number.isInteger(s.completed)?s.completed:0),tutorial:s.tutorial||null,firstEntryRewarded:!!s.firstEntryRewarded};}
function stateFromJourney(record){var s=emptyState();if(!record)return s;
 s.gold=record.gold||0;s.teamSp=record.teamSp||0;s.population=Number.isInteger(record.population)?record.population:C.population.initial;s.buffs=Object.assign({health:false,move:false,rescue:false},cp(record.buffs||{}));s.party=cp(record.party||[]);s.party.forEach(ensureHorseFields);s.party.forEach(ensureElephantFields);s.activeIds=cp((record.activeIds||[]).filter(function(id){return partyUnit(s,id);}));s.bench=cp((record.bench||[]).filter(function(id){return partyUnit(s,id);}));s.completed=Math.max(0,Number.isInteger(record.completed)?record.completed:0);s.level=s.completed+1;s.tutorial=record.tutorial||null;s.firstEntryRewarded=!!record.firstEntryRewarded;s.phase='intermission';s.units=[];
 var keep=s.activeIds.slice();s.bench=s.party.map(function(u){return u.id;}).filter(function(id){return keep.indexOf(id)<0;});
 return s;}
return{terrain:terrain,mountain:mountain,fatalWater:fatalWater,horseJumpAction:horseJumpAction,horseJumpRangeOf:horseJumpRangeOf,horseJumpDamageOf:horseJumpDamageOf,horseJumpReady:horseJumpReady,ensureHorseFields:ensureHorseFields,ensureElephantFields:ensureElephantFields,elephantMoveAction:elephantMoveAction,elephantPullAction:elephantPullAction,elephantFreezeAction:elephantFreezeAction,elephantPullRangeOf:elephantPullRangeOf,elephantFreezeDurationOf:elephantFreezeDurationOf,elephantFreezeUnlocked:elephantFreezeUnlocked,elephantSkillReady:elephantSkillReady,frozenSkip:frozenSkip,defaultMap:defaultMap,newTestGame:newTestGame,CONFIG:C,copy:cp,migrateState:migrateState,same:same,at:at,corpseAt:corpseAt,occupied:occupied,isBridge:isBridge,isWater:isWater,king:king,unit:unit,emptyState:emptyState,newGame:newGame,startLevel:startLevel,tutorialGame:tutorialGame,tutorialMap:tutorialMap,tutorialReward:tutorialReward,chooseCommanderBuff:chooseCommanderBuff,inside:inside,inPalace:inPalace,line:line,actionAt:actionAt,actionReason:actionReason,directionRange:directionRange,directionalAction:directionalAction,legalActions:legalActions,submit:submit,submitDirection:submitDirection,submitAction:submitAction,prepareEnemy:prepareEnemy,generateIntents:generateIntents,intentTarget:intentTarget,enemyPhase:enemyPhase,enemyTurn:enemyTurn,advisorPlan:advisorPlan,advisorPhase:advisorPhase,endTurn:endTurn,purchaseUpgrade:purchaseUpgrade,buy:buy,rescue:rescue,rescueTargets:rescueTargets,rescueSkip:rescueSkip,commanderTarget:commanderTarget,nextWave:nextWave,nextLevel:nextLevel,setActiveRoster:setActiveRoster,deploy:deploy,confirmDeployment:confirmDeployment,retryLevel:retryLevel,dangerNow:dangerNow,escapeAnalysis:escapeAnalysis,analyze:analyze,checkmate:checkmate,preview:preview,previewDirection:previewDirection,fixtureState:fixtureState,resetTurn:resetTurn,attemptSpawns:attemptSpawns,applyJourneyBuffs:applyJourneyBuffs,buffState:buffState,buffUnlockable:buffUnlockable,populationLimit:populationLimit,activeOrdinary:activeOrdinary,campRecover:campRecover,enterCamp:enterCamp,expandPopulation:expandPopulation,unlockBuff:unlockBuff,journeyRecord:journeyRecord,stateFromJourney:stateFromJourney};
});
