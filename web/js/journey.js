// US-020 旅程存档：保存旅程级（猫粮/SP/队伍/人口/增益/关卡进度/首次入营奖励）、玩家级标志，
// 以及正式关卡内的续局状态。进入关卡后锁定流程，刷新/关闭继续时恢复续局而不是回营；写入失败必须抛错。
// 保存边界：普通移动与撤回不单独写入；攻击、成功升级、救援与回合/阶段推进等确认保存点才更新续局。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.M0Journey=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var KEY='m0-journey-v1',VERSION=1;
function emptyPlayer(){return{tutorialCompleted:false,campGuideSeen:false};}
function emptyData(){return{version:VERSION,player:emptyPlayer(),journey:null,battle:null};}
function normalizePlayer(source){var p=emptyPlayer(),raw=source&&typeof source==='object'?source:{};p.tutorialCompleted=raw.tutorialCompleted===true;p.campGuideSeen=raw.campGuideSeen===true;return p;}
function normalizeJourney(source){
 if(!source||typeof source!=='object')return null;
 if(!Array.isArray(source.party)||!source.party.length)return null;
 var buffs=source.buffs&&typeof source.buffs==='object'?source.buffs:{};
 return{
  gold:Number.isInteger(source.gold)&&source.gold>=0?source.gold:0,
  teamSp:Number.isInteger(source.teamSp)&&source.teamSp>=0?source.teamSp:0,
  population:Number.isInteger(source.population)?source.population:4,
  buffs:{health:buffs.health===true,move:buffs.move===true,rescue:buffs.rescue===true},
  party:source.party,
  activeIds:Array.isArray(source.activeIds)?source.activeIds:[],
  bench:Array.isArray(source.bench)?source.bench:[],
  completed:Number.isInteger(source.completed)&&source.completed>=0?source.completed:0,
  tutorial:source.tutorial==='completed'||source.tutorial==='skipped'?source.tutorial:null,
  firstEntryRewarded:source.firstEntryRewarded===true
 };
}
// 正式关卡续局：只在当前关卡已确认进入时存在。state 保存最近一次确认保存点（入关、攻击、升级、救援、回合推进或胜负），普通移动不单独写入。
function normalizeBattle(source){
 if(!source||typeof source!=='object'||!source.state||typeof source.state!=='object')return null;
 var state=source.state;
 if(typeof state.phase!=='string'||!Array.isArray(state.units))return null;
 return{version:1,state:state,savedAt:typeof source.savedAt==='string'?source.savedAt:null,reason:typeof source.reason==='string'?source.reason:null};
}
function read(storage){
 var raw=null;
 try{raw=storage.getItem(KEY);}catch(e){return Object.assign(emptyData(),{error:'本地存储不可用，本次进度无法保存'});}
 if(raw===null||raw===undefined||raw==='')return Object.assign(emptyData(),{error:null});
 var data;
 try{data=JSON.parse(raw);}catch(e){return Object.assign(emptyData(),{error:'存档损坏，已忽略旧数据'});}
 if(!data||data.version!==VERSION)return Object.assign(emptyData(),{error:'存档版本不兼容，已忽略旧数据'});
 return{version:VERSION,player:normalizePlayer(data.player),journey:normalizeJourney(data.journey),battle:normalizeBattle(data.battle),error:null};
}
// 单键整体写入：玩家级、旅程级与当前关卡续局要么一起成功，要么都不生效。
function write(storage,data){
 var payload={version:VERSION,player:normalizePlayer(data&&data.player),journey:normalizeJourney(data&&data.journey),battle:normalizeBattle(data&&data.battle)};
 try{storage.setItem(KEY,JSON.stringify(payload));}catch(e){throw Error('保存失败：本机存储不可用或空间不足，本次操作已撤销');}
 return payload;
}
return{KEY,VERSION,emptyPlayer,emptyData,normalizePlayer,normalizeJourney,normalizeBattle,read,write};
});
