// US-020 教学关（第 0 关）：按真实操作推进的 7 步流程，只在本关生效，不修改战斗规则。
// 与 app.js 的接口：allow(kind,detail) 在提交前拦截不属于当前步骤的操作；notify(type,payload) 接收实际操作事件。
(function(root,factory){root.M0Tutorial=factory(root.M0||(typeof module==='object'?null:null));})(typeof globalThis!=='undefined'?globalThis:this,function(R){
'use strict';
var ROOK='tut-rook',SPEAR='tut-spear',KING='king',E1='w1-1',E2='w1-2',SAFE={x:2,y:2};
var STEPS=[
 {id:'protect',title:'保护主帅',copy:'保护我方主帅：他阵亡即失败。先看清眼前这两次攻击的落点。',button:'知道了'},
 {id:'scout',title:'查看敌情',copy:'把指针移到左侧敌兵（或点击它），查看本回合锁定的攻击路径。'},
 {id:'move',title:'移出危险',copy:'选中车，移动到高亮的（3,3）。离开被锁定的格子，敌方攻击就会落空。'},
 {id:'undo',title:'学会撤销',copy:'点“撤销移动”回到原位，再走一次同样的移动。'},
 {id:'attack',title:'消除威胁',copy:'选中枪兵，攻击相邻的右侧敌兵（7,4），让它无法执行攻击。'},
 {id:'end',title:'结束回合',copy:'必要的操作都完成了，点“结束回合”并确认结算。'},
 {id:'done',title:'完成教学',copy:'你已学会查看敌情、移动、撤销、攻击与结束回合。',button:'前往主营地'}
];
var running=false,finished=false,index=0,scoutDone=false,firstMove=false,undoDone=false,attackDone=false;
function $(id){return typeof document==='undefined'?null:document.getElementById(id);}
function step(){return STEPS[index];}
function panel(){return $('tutorial-hint');}
function esc(v){return String(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function scene(id){return typeof window!=='undefined'&&window.__M0_DEBUG__?window.__M0_DEBUG__.getState():null;}
function label(id){
 var s=scene();if(!s)return id;
 var u=(s.units||[]).concat(s.party||[]).find(function(v){return v.id===id;});
 if(!u)return id;
 var names={king:u.side==='enemy'?'将':'帅',rook:'车',spearman:'枪兵',pawn:'兵',horse:'马',cannon:'炮',archer:'弓',advisor:u.side==='player'?'仕':'士'};
 return names[u.kind]||id;
}
function render(){
 var box=panel();if(!box)return;
 if(!running){box.hidden=true;return;}
 box.hidden=false;
 var s=step(),label$=$('tutorial-step-label'),title=$('tutorial-step-title'),copy=$('tutorial-step-copy'),actions=$('tutorial-step-actions');
 if(label$)label$.textContent='教学 '+(index+1)+'/'+STEPS.length+(finished?' · 已完成':'');
 if(title)title.textContent=s.title;
 if(copy)copy.textContent=s.copy;
 if(!actions)return;
 actions.replaceChildren();
 if(s.button){
  var b=document.createElement('button');b.className='primary';b.id=s.id==='done'?'tutorial-finish':'tutorial-ack';
  b.textContent=s.button;
  b.onclick=s.id==='done'?function(){window.M0Campaign&&window.M0Campaign.tutorialFinished&&window.M0Campaign.tutorialFinished();}:function(){index=1;render();};
  actions.appendChild(b);
 }
}
function hint(text){if(typeof window!=='undefined'&&window.M0Campaign&&window.M0Campaign.hint)window.M0Campaign.hint(text);return text;}
function matchesMove(detail){
 return detail&&detail.actor===ROOK&&detail.to&&detail.to.x===SAFE.x&&detail.to.y===SAFE.y;
}
// 返回 null 表示放行；返回字符串表示拦截并提示（不消耗行动、不推进步骤）。
function allow(kind,detail){
 if(!running||finished)return null;
 var s=step();
 if(index===0)return hint('先读完第 1 步说明，再开始教学操作。');
 if(kind==='skill')return hint('教学关没有技能升级。');
 if(kind==='undo')return index===3||index===2?null:hint('这一步不需要撤销移动。');
 if(kind==='end'){
  if(index===5)return null;
  if(index===6)return null;
  return null;
 }
 if(kind==='move'){
  if(s.id==='move'||s.id==='undo')return matchesMove(detail)?null:hint('请把车移到高亮的（3,3）。');
  return hint('当前步骤还不需要移动其他棋子。');
 }
 if(kind==='attack'){
  if(s.id==='attack')return detail&&detail.actor===SPEAR&&(detail.targets||[]).indexOf(E2)>=0?null:hint('请用枪兵攻击右侧敌兵（7,4）。');
  return hint('当前步骤不需要攻击。');
 }
 return null;
}
function notify(type,payload){
 if(!running||finished)return;
 if(type==='hover'&&payload===E1&&index===1){scoutDone=true;index=2;render();return;}
 if(type==='action'){
  var a=payload&&payload.action;if(!a)return;
  if(index===2&&matchesMove(a)){firstMove=true;index=3;render();return;}
  if(index===3&&undoDone&&matchesMove(a)){index=4;render();return;}
  if(index===4&&a.actor===SPEAR&&(a.targets||[]).indexOf(E2)>=0){attackDone=true;index=5;render();return;}
  return;
 }
 if(type==='undo'&&index===3){undoDone=true;render();return;}
 if(type==='end'){
  var before=payload&&payload.before,after=payload&&payload.state;
  if(index!==5||!after)return;
  var damaged=(before?before.units:[]).some(function(u){
   var now=(after.units||[]).find(function(v){return v.id===u.id;});
   return u.side==='player'&&u.hp>0&&!(now&&now.hp===u.hp);
  });
  if(damaged)return hint('我方受到了伤害：请先确认车已离开被锁定的格子。');
  index=6;finished=true;render();
  window.M0Campaign&&window.M0Campaign.tutorialGoals&&window.M0Campaign.tutorialGoals(scene());
  return;
 }
}
return{
 start:function(){running=true;finished=false;index=0;scoutDone=false;firstMove=false;undoDone=false;attackDone=false;render();},
 stop:function(){running=false;finished=false;index=0;render();},
 active:function(){return running;},
 finished:function(){return finished;},
 step:function(){return step().id;},
 progress:function(){return{step:index+1,total:STEPS.length,id:step().id,done:finished};},
 allow:allow,notify:notify,render:render,
 STEPS:STEPS,SAFE:SAFE,ROOK:ROOK,SPEAR:SPEAR,E1:E1,E2:E2,KING:KING
};
});
