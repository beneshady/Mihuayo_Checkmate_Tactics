// US011 标准地图 JSON（formatVersion 2）纯转换：不依赖战斗规则、正式随机源或页面状态。
// 只交换关卡初始布局；导入拒绝无法无损保留的字段，导出每次生成新的 32 位随机种子。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.M0MapJson=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TYPES=['land','water','bridge','mountain','cracked','forest'],KINDS=['king','rook','horse','cannon','pawn','archer','spearman','advisor'],ROLES=['base','charge','pull'],
 ROOT_KEYS=['formatVersion','meta','map','units','turn','rng','result','history'],META_KEYS=['kind','battleId','displayName'],MAP_KEYS=['name','tiles'],UNIT_KEYS=['id','side','kind','x','y','rookRole'],TURN_KEYS=['round','phase'],HISTORY_KEYS=['commands'],
 TILE_KEY=/^([0-8]),([0-8])$/,RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
class MapJsonError extends Error{constructor(path,message){super(path+'：'+message);this.name='MapJsonError';this.path=path;this.reason=message;}}
function fail(path,message){throw new MapJsonError(path,message);}
function isObject(v){return typeof v==='object'&&v!==null&&!Array.isArray(v);}
function onlyKeys(obj,allowed,path){for(const key of Object.keys(obj))if(!allowed.includes(key))fail(path+'.'+key,'编辑器无法无损保留该字段；导入不会静默丢弃，请移除或改用标准字段');}
function filenameError(code){
 if(typeof code!=='string')return '必须是文本';
 if(!code)return '不能为空';
 if(code!==code.trim())return '首尾不能有空格';
 if(/[<>:"/\\|?*\u0000-\u001f]/.test(code))return '不能包含路径分隔符或系统非法字符 < > : " / \\ | ? * 及控制字符';
 if(code==='.'||code==='..')return '不能是目录跳转';
 if(code.endsWith('.'))return '不能以点结尾';
 if(RESERVED.test(code))return '不能使用系统保留设备名（如 CON、NUL、COM1）';
 if(code.length>100)return '过长（最多 100 个字符）';
 return '';
}
function validateMeta(levelCode,levelName){
 const errors=[],codeError=filenameError(levelCode);
 if(codeError)errors.push({field:'关卡编号',path:'meta.battleId',message:codeError});
 if(typeof levelName!=='string')errors.push({field:'关卡名称',path:'meta.displayName',message:'必须是文本'});
 else if(!levelName.trim())errors.push({field:'关卡名称',path:'meta.displayName',message:'不能为空'});
 return errors;
}
// 独立生成，不使用战场 rng / rules.js 随机源；仅供导出使用。
function generateRng(){
 const c=typeof globalThis!=='undefined'?globalThis.crypto:null;
 if(c&&typeof c.getRandomValues==='function'){const a=new Uint32Array(1);c.getRandomValues(a);return a[0];}
 return Math.floor(Math.random()*4294967296)>>>0;
}
function requireObject(value,path){if(!isObject(value))fail(path,'应为对象');return value;}
function requireString(value,path){if(typeof value!=='string')fail(path,'应为文本');return value;}
function buildDocument(map,meta,rng){
 if(!map||typeof map!=='object'||!map.tiles||!Array.isArray(map.units))fail('$','当前草稿不是可交换的地图');
 const metaErrors=validateMeta(meta&&meta.levelCode,meta&&meta.levelName);
 if(metaErrors.length)fail('$.meta.'+(metaErrors[0].path.slice(5)),metaErrors[0].message);
 if(!Number.isInteger(rng)||rng<0||rng>4294967295)fail('$.rng','导出必须使用新的 32 位无符号整数种子');
 const tiles={};
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){const t=map.tiles[x+','+y];if(t===undefined||t==='land')continue;if(!TYPES.includes(t))fail('$.map.tiles["'+x+','+y+'"]','未知地形 "'+t+'"');tiles[x+','+y]=t;}
 const units=map.units.map(function(u,index){const path='$.units['+index+']';
  if(!u||typeof u!=='object')fail(path,'应为对象');
  if(typeof u.id!=='string'||!u.id)fail(path+'.id','棋子 id 不能为空');
  if(u.side!=='player'&&u.side!=='enemy')fail(path+'.side','应为 "player" 或 "enemy"');
  if(!KINDS.includes(u.kind))fail(path+'.kind','未知棋种 "'+u.kind+'"');
  if(!Number.isInteger(u.x)||!Number.isInteger(u.y)||u.x<0||u.x>8||u.y<0||u.y>8)fail(path+'.x/y','坐标应为 0～8 的整数');
  const out={id:u.id,side:u.side,kind:u.kind,x:u.x,y:u.y};
  if(u.kind==='rook'){const role=u.rookRole||'base';if(!ROLES.includes(role))fail(path+'.rookRole','未知车职业 "'+role+'"');out.rookRole=role;}
  return out;
 });
 return{formatVersion:2,meta:{kind:'battleInit',battleId:meta.levelCode,displayName:meta.levelName},map:{name:map.name,tiles:tiles},units:units,turn:{round:1,phase:'player'},rng:rng,result:null,history:{commands:[]}};
}
function parseDocument(raw){
 const root=requireObject(raw,'$');
 onlyKeys(root,ROOT_KEYS,'$');
 if(typeof root.formatVersion!=='number'||!Number.isFinite(root.formatVersion))fail('$.formatVersion','应为数字');
 if(root.formatVersion!==2)fail('$.formatVersion','不支持的格式版本 '+root.formatVersion+'；当前仅支持 2');
 const metaRaw=requireObject(root.meta,'$.meta');
 onlyKeys(metaRaw,META_KEYS,'$.meta');
 const kind=requireString(metaRaw.kind,'$.meta.kind');
 if(kind!=='battleInit')fail('$.meta.kind',kind==='battleSave'?'是战斗存档（battleSave），不是初始战局；导入只接受 battleInit':'应为 "battleInit"，实际为 "'+kind+'"');
 const battleId=requireString(metaRaw.battleId,'$.meta.battleId'),codeError=filenameError(battleId);
 if(codeError)fail('$.meta.battleId',codeError);
 let displayName=null;
 if(Object.prototype.hasOwnProperty.call(metaRaw,'displayName')){displayName=requireString(metaRaw.displayName,'$.meta.displayName');if(!displayName.trim())fail('$.meta.displayName','不能为空');}
 const mapRaw=requireObject(root.map,'$.map');
 onlyKeys(mapRaw,MAP_KEYS,'$.map');
 let mapName=null;
 if(Object.prototype.hasOwnProperty.call(mapRaw,'name'))mapName=requireString(mapRaw.name,'$.map.name');
 const tilesRaw=requireObject(mapRaw.tiles,'$.map.tiles'),tiles={};
 for(let y=0;y<9;y++)for(let x=0;x<9;x++)tiles[x+','+y]='land';
 for(const key of Object.keys(tilesRaw)){
  if(!TILE_KEY.test(key))fail('$.map.tiles["'+key+'"]','地形键应为 0～8 的 "x,y"（如 "4,4"）');
  const t=tilesRaw[key];
  if(typeof t!=='string')fail('$.map.tiles["'+key+'"]','地形应为文本');
  if(!TYPES.includes(t))fail('$.map.tiles["'+key+'"]','未知地形 "'+t+'"');
  tiles[key]=t;
 }
 const unitsRaw=root.units;
 if(!Array.isArray(unitsRaw))fail('$.units','应为数组');
 const ids=new Set(),cells=new Set(),units=[];
 unitsRaw.forEach(function(item,index){
  const path='$.units['+index+']',u=requireObject(item,path);
  onlyKeys(u,UNIT_KEYS,path);
  const id=requireString(u.id,path+'.id');
  if(!id)fail(path+'.id','棋子 id 不能为空');
  if(ids.has(id))fail(path+'.id','重复的棋子 id "'+id+'"');
  ids.add(id);
  const side=requireString(u.side,path+'.side');
  if(side!=='player'&&side!=='enemy')fail(path+'.side','应为 "player" 或 "enemy"，实际为 "'+side+'"');
  const kind=requireString(u.kind,path+'.kind');
  if(!KINDS.includes(kind))fail(path+'.kind','未知棋种 "'+kind+'"');
  if(typeof u.x!=='number'||!Number.isFinite(u.x)||typeof u.y!=='number'||!Number.isFinite(u.y))fail(path+'.x/y','坐标应为数字');
  if(!Number.isInteger(u.x)||!Number.isInteger(u.y)||u.x<0||u.x>8||u.y<0||u.y>8)fail(path+'.x/y','坐标越界（'+u.x+','+u.y+'）；9×9 棋盘应为 0～8 的整数');
  const cell=u.x+','+u.y;
  if(cells.has(cell))fail(path+'.x/y','棋子重叠：坐标（'+(u.x+1)+','+(u.y+1)+'）已被占用');
  cells.add(cell);
  let rookRole='base';
  if(Object.prototype.hasOwnProperty.call(u,'rookRole')){
   const role=requireString(u.rookRole,path+'.rookRole');
   if(!ROLES.includes(role))fail(path+'.rookRole','未知车职业 "'+role+'"，仅支持 base/charge/pull');
   if(kind!=='rook')fail(path+'.rookRole','只有车支持 rookRole；该字段无法为其他棋种保留');
   rookRole=role;
  }
  units.push({id:id,side:side,kind:kind,x:u.x,y:u.y,rookRole:rookRole});
 });
 const turnRaw=requireObject(root.turn,'$.turn');
 onlyKeys(turnRaw,TURN_KEYS,'$.turn');
 if(typeof turnRaw.round!=='number'||turnRaw.round!==1)fail('$.turn.round','导入只接受初始战局：round 必须为数字 1');
 if(turnRaw.phase!=='player')fail('$.turn.phase','导入只接受初始战局：phase 必须为 "player"');
 if(typeof root.rng!=='number'||!Number.isInteger(root.rng)||root.rng<0||root.rng>4294967295)fail('$.rng','应为 0～4294967295 的 32 位无符号整数');
 if(!Object.prototype.hasOwnProperty.call(root,'result'))fail('$.result','缺少 result；初始战局必须为 null');
 if(root.result!==null)fail('$.result','导入只接受初始战局：result 必须为 null');
 const history=requireObject(root.history,'$.history');
 onlyKeys(history,HISTORY_KEYS,'$.history');
 if(!Array.isArray(history.commands))fail('$.history.commands','应为数组');
 if(history.commands.length)fail('$.history.commands','导入只接受初始战局：history.commands 必须为空');
 let levelName=displayName;
 if(levelName===null)levelName=typeof mapName==='string'&&mapName.trim()?mapName:battleId;
 const name=typeof mapName==='string'&&mapName.trim()?mapName:levelName;
 return{draft:{version:1,name:name,levelCode:battleId,levelName:levelName,tiles:tiles,units:units},meta:{levelCode:battleId,levelName:levelName}};
}
return{MapJsonError:MapJsonError,types:TYPES,kinds:KINDS,roles:ROLES,filenameError:filenameError,validateMeta:validateMeta,generateRng:generateRng,buildDocument:buildDocument,parseDocument:parseDocument};
});
