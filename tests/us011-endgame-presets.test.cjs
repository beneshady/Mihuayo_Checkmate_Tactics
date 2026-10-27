// US-011 2026-10-24 首批三张历史残局预置定向测试（静态/规则层）。
// 核对预置数据与设计文档识别稿、现行地图校验、我方象编辑保存、无象两图标准导出、测试局完整阵容与地界映射。
const T=require('node:test'),A=require('node:assert/strict'),R=require('../web/js/rules.js'),M=require('../web/js/maps.js'),MJ=require('../web/js/mapjson.js'),P=require('../web/js/presets.js');
const key=u=>[u.side,u.kind,u.x,u.y].join('|');
const uniq=list=>list.map(key).sort();
function memory(){const values=new Map();let fail=false;return{values,getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');values.set(k,v);},setFail:v=>fail=v};}
// 设计文档 docs/design/endgame-presets-2026-10-24.md 的识别稿（内部零基坐标）。
const EXPECTED={
 'endgame-nine-rings':{
  units:[
   ['player','king',4,0],['player','rook',7,0],['player','cannon',7,1],['player','cannon',7,2],
   ['player','pawn',0,7],['player','pawn',4,7],['player','pawn',8,7],['player','pawn',4,4],['player','pawn',6,4],
   ['enemy','king',5,8],['enemy','rook',5,6],['enemy','cannon',8,6],['enemy','pawn',8,5],['enemy','pawn',2,1],['enemy','pawn',3,1]],
  terrain:{mountain:[['2,4'],['7,6']],water:[['0,4'],['0,5'],['8,4']],forest:[['1,3'],['3,4'],['7,3']]},
  deviation:{from:['5,5'],to:['5,4'],reason:'固定第二波兵出生点'}},
 'endgame-two-wolves':{
  units:[
   ['player','king',4,0],['player','rook',6,8],['player','cannon',5,8],['player','pawn',1,7],['player','pawn',5,7],['player','pawn',6,6],['player','pawn',4,3],
   ['enemy','king',3,8],['enemy','rook',1,8],['enemy','rook',5,1],['enemy','cannon',8,5],['enemy','pawn',6,3],['enemy','pawn',3,1]],
  terrain:{water:[['2,3'],['2,4'],['5,3']],mountain:[['0,5'],['7,4']],forest:[['1,4'],['7,3'],['8,7']]},
  deviation:null},
 'endgame-west':{
  units:[
   ['player','king',3,0],['player','elephant',6,0],['player','rook',6,3],['player','rook',8,3],['player','cannon',6,5],['player','cannon',6,4],['player','pawn',2,7],['player','pawn',4,7],
   ['enemy','king',5,8],['enemy','cannon',4,8],['enemy','rook',5,6],['enemy','pawn',0,2],['enemy','pawn',3,2],['enemy','pawn',4,1]],
  terrain:{water:[['7,1'],['7,2'],['1,4']],mountain:[['2,4'],['7,5']],forest:[['5,3'],['8,4'],['2,6']]},
  deviation:null}
};
function terrainKeys(map,type){const out=[];for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(map.tiles[x+','+y]===type)out.push(x+','+y);return out.sort();}
T('P01 三张预置与设计识别稿逐子一致（阵营/兵种/坐标），地形一致且唯一改编可追溯',()=>{
 A.equal(P.list().length,3);
 for(const [id,exp] of Object.entries(EXPECTED)){
  const map=P.mapOf(id),units=uniq(map.units.map(u=>[u.side,u.kind,u.x,u.y]));
  A.deepEqual(units,uniq(exp.units),id+' 棋子');
  for(const type of ['mountain','water','forest']){
   const actual=terrainKeys(map,type),expected=exp.terrain[type].map(k=>k[0]).sort();
   if(exp.deviation&&type==='mountain'){A.ok(actual.includes(exp.deviation.to[0]),'山改编位 '+exp.deviation.to[0]);A.ok(!actual.includes(exp.deviation.from[0]),'固定出生点不放山 '+exp.deviation.from[0]);A.deepEqual(actual.filter(k=>k!==exp.deviation.to[0]),expected.filter(k=>k!==exp.deviation.from[0]));}
   else A.deepEqual(actual,expected,id+' '+type);
  }
  const def=P.get(id);A.equal(def.source.file,{ 'endgame-nine-rings':'大九连环.png','endgame-two-wolves':'跑打两狼关.jpeg','endgame-west':'征西.png'}[id]);
  if(exp.deviation){A.ok(def.deviations.some(t=>t.includes(exp.deviation.from[0])&&t.includes(exp.deviation.to[0])&&t.includes(exp.deviation.reason)),id+' 改编说明');}else A.deepEqual(def.deviations,[]);
 }
});
T('P03 三张原稿通过现有地图校验；九宫无山水、固定第二波出生点可通行、无致死水/站山/重叠',()=>{
 for(const id of Object.keys(EXPECTED)){
  const map=P.mapOf(id);A.deepEqual(M.validate(map),[],id);
  for(const q of [R.CONFIG.playerPalace,R.CONFIG.enemyPalace])for(let y=q.minY;y<=q.maxY;y++)for(let x=q.minX;x<=q.maxX;x++)A.ok(!['water','mountain','cracked'].includes(map.tiles[x+','+y]),id+' 九宫 '+x+','+y);
  for(const [kind,x,y] of R.CONFIG.waveTwo)A.ok(['land','bridge','forest'].includes(map.tiles[x+','+y]),id+' 第二波出生点 '+x+','+y);
  A.equal(map.units.filter(u=>u.side==='enemy').length>8,false);
  A.equal(map.units.filter(u=>u.side==='player'&&u.kind==='king').length,1);
  A.equal(map.units.filter(u=>u.side==='enemy'&&u.kind==='king').length,1);
 }
});
T('P01/P07 预置为只读模板：mapOf 返回独立副本，编辑不修改内置数据；同一预置两次读取互不影响',()=>{
 const def=P.get('endgame-nine-rings'),before=JSON.stringify(def);
 const a=P.mapOf('endgame-nine-rings');a.tiles['0,0']='forest';a.units[0].x=0;a.units.push({id:'x',side:'player',kind:'pawn',x:1,y:1});
 A.equal(JSON.stringify(P.get('endgame-nine-rings')),before);
 const b=P.mapOf('endgame-nine-rings');A.equal(b.tiles['0,0'],'land');A.equal(b.units.find(u=>u.id==='nine-p-king').x,4);A.equal(b.units.length,15);
 A.throws(()=>{P.get('endgame-west').units.push({id:'y'});},/not extensible|read only/i);
});
T('P03 三张预置独立测试局加载完整双方阵容，相保留且带现行我方象字段，原稿与模板不被测试改动',()=>{
 for(const id of Object.keys(EXPECTED)){
  const map=P.mapOf(id),snapshot=JSON.stringify(map),state=R.newTestGame(map);
  A.equal(JSON.stringify(map),snapshot,id+' 原稿未被测试改动');
  const playerNonKing=map.units.filter(u=>u.side==='player'&&u.kind!=='king');
  A.equal(state.units.length,1+map.units.filter(u=>u.side==='enemy').length+playerNonKing.length,id+' 完整阵容入场');
  for(const u of playerNonKing){const on=state.units.find(v=>v.id===u.id);A.ok(on,id+' 入场 '+u.id);A.equal(on.x,u.x);A.equal(on.y,u.y);}
  for(const u of map.units.filter(u=>u.side==='enemy'))A.ok(state.units.some(v=>v.side==='enemy'&&v.kind===u.kind),id+' 敌种 '+u.kind);
  const elephant=map.units.find(u=>u.kind==='elephant');
  if(elephant){const on=state.units.find(v=>v.id===elephant.id);A.ok(on);A.equal(on.kind,'elephant');A.equal(on.attack,0);A.equal(on.elephantPullRange,R.CONFIG.elephant.pullRange);A.equal(on.elephantFreezeUnlocked,false);A.equal(on.elephantSkillReady||R.elephantSkillReady(on),true);}
  A.equal(state.phase,'player','准备阶段后进入我方行动');
  A.equal(state.testMap,true);
  A.equal(state.gold,0);A.equal(state.teamSp,0);
 }
});
T('P03 准备移动只改敌方入场位置，不改阵营/兵种/数量；差异可解释',()=>{
 const map=P.mapOf('endgame-west'),state=R.newTestGame(map);
 const enemies=map.units.filter(u=>u.side==='enemy');
 A.equal(state.units.filter(u=>u.side==='enemy').length,enemies.length);
 A.deepEqual(state.units.filter(u=>u.side==='enemy').map(u=>u.kind).sort(),enemies.map(u=>u.kind).sort());
 const moved=state.units.filter(u=>u.side==='enemy'&&!enemies.some(e=>e.kind===u.kind&&e.x===u.x&&e.y===u.y));
 A.ok(moved.every(u=>R.inside(u)&&!R.mountain(state,u)),'准备移动落在合法格');
});
T('地界按行固定：0～3 我方、4 中央、5～8 敌方，与地形/棋子阵营无关',()=>{
 A.deepEqual([0,1,2,3,4,5,6,7,8].map(P.zoneOf),['player','player','player','player','center','enemy','enemy','enemy','enemy']);
 A.equal(P.BOUNDARY.player.label,'我方地界');A.equal(P.BOUNDARY.center.label,'中央交界');A.equal(P.BOUNDARY.enemy.label,'敌方地界');
 A.equal(P.zoneOf(undefined),null);A.equal(P.zoneOf(9),'enemy');
 const map=P.mapOf('endgame-west');map.tiles['0,0']='water';map.units.push({id:'enemy-in-our-half',side:'enemy',kind:'pawn',x:0,y:0});
 A.equal(P.zoneOf(0),'player');
});
T('P02/P07 我方象可保存读取；敌方象与过河象被校验拒绝；象可在河道水格出生',()=>{
 A.ok(M.kinds.includes('elephant'));
 const lib=M.library(memory()),map=P.mapOf('endgame-west');
 A.deepEqual(M.validate(map),[]);
 const rec=lib.save(map,'征西含相');
 const loaded=lib.load(rec.id).map;
 A.ok(loaded.units.some(u=>u.kind==='elephant'&&u.side==='player'&&u.x===6&&u.y===0));
 const enemyElephant=P.mapOf('endgame-west');enemyElephant.units.find(u=>u.id==='west-e-cannon').kind='elephant';
 A.ok(M.validate(enemyElephant).some(e=>e.includes('敌方象')));
 const crossed=P.mapOf('endgame-west');crossed.units.find(u=>u.id==='west-p-elephant').y=5;
 A.ok(M.validate(crossed).some(e=>e.includes('象不能过河')));
 const river=P.mapOf('endgame-west');const el=river.units.find(u=>u.id==='west-p-elephant');el.x=1;el.y=4;
 A.ok(river.tiles['1,4']==='water');A.deepEqual(M.validate(river),[],'象可在河道水格出生');
 A.ok(M.validate(P.mapOf('endgame-west'),true).length>0,'征西帅位不是正式绑定帅位，正式绑定应提示');
});
T('P07 无象两图标准导出可导入往返；征西标准导出明确拒绝且不产生假兼容',()=>{
 for(const id of ['endgame-nine-rings','endgame-two-wolves']){
  const map=P.mapOf(id),doc=MJ.buildDocument(map,{levelCode:P.get(id).levelCode,levelName:P.get(id).levelName},123456789);
  A.equal(doc.formatVersion,2);A.equal(doc.meta.battleId,P.get(id).levelCode);
  const parsed=MJ.parseDocument(JSON.parse(JSON.stringify(doc))).draft;
  A.deepEqual(parsed.tiles,map.tiles,id+' 地形往返');
  A.deepEqual(parsed.units.map(key).sort(),map.units.map(key).sort(),id+' 棋子往返');
  A.equal(parsed.name,map.name);A.equal(parsed.levelName,map.levelName);
 }
 const west=P.mapOf('endgame-west');
 A.throws(()=>MJ.buildDocument(west,{levelCode:'endgame-west',levelName:'征西·林地侧攻'},1),e=>/暂不支持象/.test(e.message));
 const json=JSON.parse(JSON.stringify(MJ.buildDocument(P.mapOf('endgame-two-wolves'),{levelCode:'endgame-two-wolves',levelName:'炮打两狼关·池边牵制'},7)));
 json.units[0].kind='elephant';
 A.throws(()=>MJ.parseDocument(json),e=>/不支持象/.test(e.message));
});
T('旧地图兼容：新增象不改变既有地图读取与校验，默认地图仍无象',()=>{
 const lib=M.library(memory()),rec=lib.save(R.defaultMap(),'旧图');
 const old=lib.load(rec.id).map;
 A.deepEqual(M.validate(old),[]);
 A.equal(old.units.some(u=>u.kind==='elephant'),false);
 A.equal(Object.keys(old.tiles).length,81);
});
