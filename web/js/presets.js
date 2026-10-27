// US-011 2026-10-24 历史残局预置：只读内置模板，编辑器读取为独立草稿。
// 坐标均为内部零基坐标（x=0～8 左→右，y=0～8 我方底边→敌方顶边）；界面显示 +1。
// 数据来源与改编差异见 docs/design/endgame-presets-2026-10-24.md；本文件是运行时唯一坐标来源。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.M0Presets=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='endgame-presets-2026-10-24';
// 双方地界按行固定，与格子地形和格上棋子阵营无关：y=0～3 我方、y=4 中央交界、y=5～8 敌方。
const BOUNDARY={player:{minY:0,maxY:3,label:'我方地界',rows:'第1～4行'},center:{minY:4,maxY:4,label:'中央交界',rows:'第5行'},enemy:{minY:5,maxY:8,label:'敌方地界',rows:'第6～9行'}};
const DEFS=[
 {
  id:'endgame-nine-rings',
  name:'大九连环·山口破阵',
  levelCode:'endgame-nine-rings',
  levelName:'大九连环·山口破阵',
  revision:1,
  source:{file:'大九连环.png',folder:'D:/Projects/mihuayou/残局',title:'大九连环',mapping:'删除原图空白 r=4 行；r<4 映射 y=8-r；r>4 映射 y=9-r；不删棋、不合并格子'},
  summary:'双炮与侧翼车分工；山可作炮架、可被撞裂形成通道；两侧水池提供位移击杀机会，中路与侧路都保留，不依赖一条河。',
  terrain:{mountain:[[2,4],[5,4],[7,6]],water:[[0,4],[0,5],[8,4]],forest:[[1,3],[3,4],[7,3]]},
  units:[
   {id:'nine-p-king',side:'player',kind:'king',x:4,y:0},
   {id:'nine-p-rook',side:'player',kind:'rook',x:7,y:0,rookRole:'base'},
   {id:'nine-p-cannon-1',side:'player',kind:'cannon',x:7,y:1},
   {id:'nine-p-cannon-2',side:'player',kind:'cannon',x:7,y:2},
   {id:'nine-p-pawn-1',side:'player',kind:'pawn',x:0,y:7},
   {id:'nine-p-pawn-2',side:'player',kind:'pawn',x:4,y:7},
   {id:'nine-p-pawn-3',side:'player',kind:'pawn',x:8,y:7},
   {id:'nine-p-pawn-4',side:'player',kind:'pawn',x:4,y:4},
   {id:'nine-p-pawn-5',side:'player',kind:'pawn',x:6,y:4},
   {id:'nine-e-king',side:'enemy',kind:'king',x:5,y:8},
   {id:'nine-e-rook',side:'enemy',kind:'rook',x:5,y:6,rookRole:'base'},
   {id:'nine-e-cannon',side:'enemy',kind:'cannon',x:8,y:6},
   {id:'nine-e-pawn-1',side:'enemy',kind:'pawn',x:8,y:5},
   {id:'nine-e-pawn-2',side:'enemy',kind:'pawn',x:2,y:1},
   {id:'nine-e-pawn-3',side:'enemy',kind:'pawn',x:3,y:1}
  ],
  deviations:['固定第二波兵出生点为内部（5,5），策划山位（5,5）与之冲突；山移至（5,4），保留中央炮架与击穿通道，其余地形和棋子不变。'],
  notes:'来源截图由主策划目视识别；运行时数据与设计表逐项一致（见任务证据）。'
 },
 {
  id:'endgame-two-wolves',
  name:'炮打两狼关·池边牵制',
  levelCode:'endgame-two-wolves',
  levelName:'炮打两狼关·池边牵制',
  revision:1,
  source:{file:'跑打两狼关.jpeg',folder:'D:/Projects/mihuayou/残局',title:'炮打两狼关',mapping:'删除原图空白 r=4 行；r<4 映射 y=8-r；r>4 映射 y=9-r；文件名按原图，显示名用“炮打两狼关”'},
  summary:'上方炮车进攻与下方护帅两线压力；水池改变接近路径，山提供炮架，不能只靠随机闪避保命。',
  terrain:{water:[[2,3],[2,4],[5,3]],mountain:[[0,5],[7,4]],forest:[[1,4],[7,3],[8,7]]},
  units:[
   {id:'wolves-p-king',side:'player',kind:'king',x:4,y:0},
   {id:'wolves-p-rook',side:'player',kind:'rook',x:6,y:8,rookRole:'base'},
   {id:'wolves-p-cannon',side:'player',kind:'cannon',x:5,y:8},
   {id:'wolves-p-pawn-1',side:'player',kind:'pawn',x:1,y:7},
   {id:'wolves-p-pawn-2',side:'player',kind:'pawn',x:5,y:7},
   {id:'wolves-p-pawn-3',side:'player',kind:'pawn',x:6,y:6},
   {id:'wolves-p-pawn-4',side:'player',kind:'pawn',x:4,y:3},
   {id:'wolves-e-king',side:'enemy',kind:'king',x:3,y:8},
   {id:'wolves-e-rook-1',side:'enemy',kind:'rook',x:1,y:8,rookRole:'base'},
   {id:'wolves-e-rook-2',side:'enemy',kind:'rook',x:5,y:1,rookRole:'base'},
   {id:'wolves-e-cannon',side:'enemy',kind:'cannon',x:8,y:5},
   {id:'wolves-e-pawn-1',side:'enemy',kind:'pawn',x:6,y:3},
   {id:'wolves-e-pawn-2',side:'enemy',kind:'pawn',x:3,y:1}
  ],
  deviations:[],
  notes:'炮车已深入敌后是原图布局，不是识别错误；自动准备移动会先改变敌方入场位置。'
 },
 {
  id:'endgame-west',
  name:'征西·林地侧攻',
  levelCode:'endgame-west',
  levelName:'征西·林地侧攻',
  revision:1,
  source:{file:'征西.png',folder:'D:/Projects/mihuayou/残局',title:'征西',mapping:'删除原图空白 r=6 行；r<6 映射 y=8-r；r>6 映射 y=9-r；不删棋、不合并格子'},
  summary:'右侧相与双车配合，牵引可改变攻防位置；两条侧攻通道，池边有位移空间，森林不是胜利必需条件。',
  terrain:{water:[[7,1],[7,2],[1,4]],mountain:[[2,4],[7,5]],forest:[[5,3],[8,4],[2,6]]},
  units:[
   {id:'west-p-king',side:'player',kind:'king',x:3,y:0},
   // 我方象：现行规则支持田字移动与牵引/冰封；敌方不提供象。
   {id:'west-p-elephant',side:'player',kind:'elephant',x:6,y:0},
   {id:'west-p-rook-1',side:'player',kind:'rook',x:6,y:3,rookRole:'base'},
   {id:'west-p-rook-2',side:'player',kind:'rook',x:8,y:3,rookRole:'base'},
   {id:'west-p-cannon-1',side:'player',kind:'cannon',x:6,y:5},
   {id:'west-p-cannon-2',side:'player',kind:'cannon',x:6,y:4},
   {id:'west-p-pawn-1',side:'player',kind:'pawn',x:2,y:7},
   {id:'west-p-pawn-2',side:'player',kind:'pawn',x:4,y:7},
   {id:'west-e-king',side:'enemy',kind:'king',x:5,y:8},
   {id:'west-e-cannon',side:'enemy',kind:'cannon',x:4,y:8},
   {id:'west-e-rook',side:'enemy',kind:'rook',x:5,y:6,rookRole:'base'},
   {id:'west-e-pawn-1',side:'enemy',kind:'pawn',x:0,y:2},
   {id:'west-e-pawn-2',side:'enemy',kind:'pawn',x:3,y:2},
   {id:'west-e-pawn-3',side:'enemy',kind:'pawn',x:4,y:1}
  ],
  deviations:[],
  notes:'外部 formatVersion=2 的 UNIT_KINDS 不含 elephant，本图标准导出会被拒绝；本机保存与独立测试保留相。'
 }
];
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
DEFS.forEach(freeze);Object.freeze(DEFS);
function zoneOf(y){if(!Number.isInteger(y))return null;if(y<=BOUNDARY.player.maxY)return'player';if(y>=BOUNDARY.enemy.minY)return'enemy';return'center';}
function tilesOf(def){const tiles={};for(let y=0;y<9;y++)for(let x=0;x<9;x++)tiles[x+','+y]='land';for(const type of ['mountain','water','forest'])for(const [x,y] of def.terrain[type])tiles[x+','+y]=type;return tiles;}
function copyUnits(def){return def.units.map(u=>{const out={id:u.id,side:u.side,kind:u.kind,x:u.x,y:u.y};if(u.kind==='rook')out.rookRole=u.rookRole||'base';return out;});}
function mapOf(def){if(typeof def==='string')def=DEFS.find(d=>d.id===def);if(!def)throw Error('没有该残局预置');return{version:1,name:def.name,levelCode:def.levelCode,levelName:def.levelName,tiles:tilesOf(def),units:copyUnits(def)};}
function list(){return DEFS.map(def=>({id:def.id,name:def.name,levelCode:def.levelCode,levelName:def.levelName,revision:def.revision,source:JSON.parse(JSON.stringify(def.source)),summary:def.summary,deviations:def.deviations.slice(),notes:def.notes,units:copyUnits(def),terrain:{mountain:def.terrain.mountain.map(p=>p.slice()),water:def.terrain.water.map(p=>p.slice()),forest:def.terrain.forest.map(p=>p.slice())}}));}
return{VERSION,BOUNDARY,zoneOf,list,get:id=>DEFS.find(d=>d.id===id)||null,mapOf};
});
