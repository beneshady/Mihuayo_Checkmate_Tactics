// US-020: bridge + debug API + tutorial hooks for app.js.
const fs=require('fs');
const p='web/js/app.js';
let src=fs.readFileSync(p,'utf8');

function replaceOnce(from,to,label){
  if(src.indexOf(from)<0)throw Error('anchor not found: '+label);
  src=src.replace(from,to);
  console.log('patched '+label);
}

// A. 顶部状态栏显示旅程增益集合
replaceOnce(
  "$('commander-buff').textContent=buff;",
  "$('commander-buff').textContent=buff;"
);
replaceOnce(
  "const k=R.king(state,'player'),b=R.king(state,'enemy'),buff={health:'坚守：队友最大 HP +1',move:'疾行：队友普通移动 +1',rescue:'救援：第6回合一次'}[state.commanderBuff]||'未选择';",
  "const k=R.king(state,'player'),b=R.king(state,'enemy'),buffs=state.buffs||{},buff=[buffs.health?'坚守':null,buffs.move?'疾行':null,buffs.rescue?'救援':null].filter(Boolean).join(' + ')||'未解锁';",
  'renderTop buffs'
);

// B. 教学闸门与通知
replaceOnce(
  "function G(id){return state.units.find(u=>u.id===id)}",
  [
    "function G(id){return state.units.find(u=>u.id===id)}",
    "// US-020 教学关闸门：不属于当前步骤的操作被拦截，不消耗行动也不推进步骤。",
    "function tutorialGate(kind,detail){const t=window.M0Tutorial;if(!t||!t.active())return true;const block=t.allow(kind,detail);if(block){toast(block);return false;}return true;}",
    "function tutorialNotify(type,payload){const t=window.M0Tutorial;if(t&&t.active())t.notify(type,payload);}"
  ].join('\n'),
  'tutorial helpers'
);

replaceOnce(
  "function directMove(action){const r=R.submitAction(state,action);if(!r.effect)return false;",
  "function directMove(action){if(!tutorialGate('move',action))return false;const r=R.submitAction(state,action);if(!r.effect)return false;tutorialNotify('action',{action:r.action||action});",
  'directMove gate'
);
replaceOnce(
  "function execute(){if(!preview)return;",
  "function execute(){if(!preview)return;const gateKind=preview.action.type==='directional'||preview.action.type==='attack'?'attack':'move';if(!tutorialGate(gateKind,preview.action))return;",
  'execute gate'
);
replaceOnce(
  "function undoMove(){const item=moveHistory.pop();if(!item)return;",
  "function undoMove(){const item=moveHistory.pop();if(!item)return;tutorialNotify('undo',{});",
  'undo notify'
);
replaceOnce(
  "function hoverEnemy(id){const u=G(id);",
  "function hoverEnemy(id){const u=G(id);if(u&&u.side==='enemy')tutorialNotify('hover',u.id);",
  'hover notify'
);
replaceOnce(
  "$('btn-confirm-yes').onclick=()=>{$('ov-confirm').classList.remove('show');clearMoveHistory();interactionRevision++;const out=R.endTurn(state);",
  "$('btn-confirm-yes').onclick=()=>{if(!tutorialGate('end'))return;$('ov-confirm').classList.remove('show');clearMoveHistory();interactionRevision++;const before=R.copy(state);const out=R.endTurn(state);tutorialNotify('end',{before,state:out.state,effects:out.effects});",
  'end turn gate'
);
replaceOnce(
  "function buySkill(skill,index){const u=G(selected),",
  "function buySkill(skill,index){if(!tutorialGate('skill'))return;const u=G(selected),",
  'skill gate'
);

// C. 主营地技能清单（上场与后备都可用公共 SP 升级）
replaceOnce(
  "function clearMoveHistory(){moveHistory=[]}",
  [
    "// US-020 主营地技能清单：直接复用战斗内的 skillDefs，覆盖上场与后备队友。",
    "function campSkillList(){return(state.party||[]).map(u=>({id:u.id,kind:u.kind,level:u.level,name:u.side==='enemy'?'将':unitName(u),active:(state.activeIds||[]).indexOf(u.id)>=0,note:u.kind==='king'?'主帅无个人升级，公共 SP 也不能用于主帅':''})).map(entry=>Object.assign(entry,{skills:skillDefs(partyUnit(entry.id)||{kind:'king',directionPaid:[0,0,0,0]}).map(d=>({skill:d[0],index:d[1],label:d[3],desc:d[4],cost:d[2],maxed:!!d[5],disabled:!!d[5]||state.teamSp<d[2]}))}));}",
    "function partyUnit(id){return(state.party||[]).find(u=>u.id===id);}",
    "function clearMoveHistory(){moveHistory=[]}"
  ].join('\n'),
  'campSkillList'
);

// D. 桥接 API
const bridgeOld=src.match(/window\.__M0_CAMPAIGN__=\{[\s\S]*?\n/);
if(!bridgeOld)throw Error('bridge not found');
replaceOnce(
  bridgeOld[0],
  [
    "window.__M0_CAMPAIGN__={",
    " state:()=>R.copy(state),",
    " newJourney:()=>{initial();$('ov-pause').classList.remove('show');$('ov-confirm').classList.remove('show');postState();},",
    " startTutorial:()=>{interactionRevision++;clearMoveHistory();state=R.tutorialGame();selected=preview=directionGhost=null;$('ov-result').classList.remove('show');interactionRevision++;postState();return R.copy(state);},",
    " loadCamp:record=>{interactionRevision++;clearMoveHistory();state=R.stateFromJourney(record);selected=preview=directionGhost=null;paused=true;if(renderFrame!==null){cancelAnimationFrame(renderFrame);renderFrame=null;}postState();return R.copy(state);},",
    " enterCamp:()=>{interactionRevision++;state=R.enterCamp(state);postState();return R.copy(state);},",
    " enterLevel:n=>{if(n!==(state.completed||0)+1||n>3)return false;const next=R.startLevel(state,mapStore?.level(n));if(next===state||next.level!==n)return false;interactionRevision++;clearMoveHistory();selected=preview=directionGhost=null;state=next;paused=false;$('ov-result').classList.remove('show');postState();return true;},",
    " camp:act=>{let next=state;if(!act)return{ok:false,state:R.copy(state)};",
    "  if(act.type==='buy')next=R.buy(state,act.kind);",
    "  else if(act.type==='expand')next=R.expandPopulation(state);",
    "  else if(act.type==='buff')next=R.unlockBuff(state,act.key);",
    "  else if(act.type==='roster')next=R.setActiveRoster(state,act.ids);",
    "  else if(act.type==='upgrade')next=R.purchaseUpgrade(state,act.id,act.skill,act.index);",
    "  if(next===state)return{ok:false,state:R.copy(state)};interactionRevision++;state=next;postState();return{ok:true,state:R.copy(state)};},",
    " campSkills:()=>campSkillList(),",
    " restore:s=>{interactionRevision++;clearMoveHistory();state=R.copy(s);postState();return R.copy(state);},",
    " suspend:()=>{paused=true;if(renderFrame!==null){cancelAnimationFrame(renderFrame);renderFrame=null;}},",
    " resume:()=>{paused=false;$('ov-pause').classList.remove('show');resize();startRenderLoop();}};"
  ].join('\n'),
  'campaign bridge'
);

// E. 菜单按钮（商店已由主营地取代）
replaceOnce(
  "for(const id of ['btn-menu-pause','btn-menu-shop','btn-menu-result']){",
  "for(const id of ['btn-menu-pause','btn-menu-result']){",
  'menu buttons'
);

// F. 调试入口：结束回合也推进教学
replaceOnce(
  "endTurn:()=>{clearMoveHistory();interactionRevision++;state=R.endTurn(state).state;preview=directionGhost=null;postState()}",
  "endTurn:()=>{clearMoveHistory();interactionRevision++;const before=R.copy(state);const out=R.endTurn(state);state=out.state;preview=directionGhost=null;tutorialNotify('end',{before,state:out.state,effects:out.effects});postState()}",
  'debug endTurn'
);

fs.writeFileSync(p,src);
console.log('app.js patched');
