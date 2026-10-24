/* US-020 旅程主流程：菜单 → 教学（第0关）→ 主营地 → 选关地图 → 布阵战斗 → 回营/通关。
   本层只管流程、存档与营地/地图 UI；战斗规则与状态仍由 rules.js + app.js 持有。 */
(async function(){'use strict';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const internal=params.has('fixture')||params.get('editor-test')==='1'||params.has('device-preview');
document.body.classList.toggle('campaign-player',!internal);
const names=['关中','中原','江淮'],symbols=['隘','城','泽'];
const RECRUITS=[['pawn','兵','HP 1 · 3 猫粮'],['rook','基础车','HP 2 / 攻击 4 格 · 5 猫粮'],['horse','马','日字走位 · 5 猫粮'],['cannon','炮','隔一炮架 / 攻击 2 · 8 猫粮'],['advisor','仕','固定防御塔 HP 2 · 5 猫粮 · 最多两座'],['elephant','象','控制法师 HP 1（坚守后 2）· 牵引/冰封 · 5 猫粮']];
const PRICES={pawn:3,rook:5,horse:5,cannon:8,advisor:5,elephant:5};
const TERRAIN_LABEL={land:'陆',water:'水',bridge:'桥',mountain:'山',cracked:'裂',rubble:'碎',forest:'林'};
const KIND_LABEL={king:'帅',rook:'车',horse:'马',cannon:'炮',pawn:'兵',archer:'弓',spearman:'枪',advisor:'仕',elephant:'象'};
let view='loading',journey=null,player=null,selected=1,tutorialOn=false,current=null,campNotice='',_tutorialState=null,battleLocked=false;
const rules=()=>window.M0,bridge=()=>window.__M0_CAMPAIGN__;
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function store(){try{return window.localStorage;}catch(e){return null;}}
function loadSave(){const storage=store();if(!storage)return{player:window.M0Journey.emptyPlayer(),journey:null,battle:null,error:'本地存储不可用，本次进度无法保存'};return window.M0Journey.read(storage);}
function persist(state,extra,battle,reason){
 const storage=store();if(!storage)return '本地存储不可用，本次操作已撤销';
 const record={player:player,journey:rules().journeyRecord(state)};
 if(extra)Object.assign(record.journey,extra);
 if(battle)record.battle={version:1,state:rules().copy(battle),savedAt:new Date().toISOString(),reason:reason||'正式关卡内自动续局'};
 try{window.M0Journey.write(storage,record);}catch(e){return e.message||'保存失败，本次操作已撤销';}
 journey=record.journey;
 return null;
}
function persistPlayer(){const storage=store();if(!storage)return '本地存储不可用';try{window.M0Journey.write(storage,{player,journey});}catch(e){return e.message||'保存失败';}return null;}
function persistBattle(state,reason){
 if(!battleLocked||tutorialOn||view!=='battle'||!journey)return;
 const storage=store();if(!storage){toast('本地存储不可用，续局无法保存');return;}
 const record={player,journey:rules().journeyRecord(state),battle:{version:1,state:rules().copy(state),savedAt:new Date().toISOString(),reason:reason||'正式关卡内自动续局'}};
 try{window.M0Journey.write(storage,record);journey=record.journey;}catch(e){toast(e.message||'续局保存失败');}
}
function clearBattleSave(){
 if(!journey)return;
 const storage=store();if(!storage)return;
 try{window.M0Journey.write(storage,{player,journey,battle:null});}catch(e){toast(e.message||'旧续局清理失败');}
}
function show(next){
 if(battleLocked&&(next==='camp'||next==='map')){
  toast('已确认进入关卡：布阵/战斗期间不能返回主营地或重选关卡');
  next='battle';
 }
 view=next;const battle=next==='battle';
 $('campaign').hidden=battle;$('battle-root').hidden=!battle;
 ['loading','menu','map','tutorial','camp'].forEach(v=>{const el=$('flow-'+v);if(el)el.hidden=v!==next;});
 if(window.__M0_CAMPAIGN__){
  if(battle)window.__M0_CAMPAIGN__.resume();else window.__M0_CAMPAIGN__.suspend();
 }
 if(next==='map')renderMap();
 if(next==='menu')$('flow-continue').hidden=!journey||(journey.completed||0)>=3;
 window.dispatchEvent(new Event('resize'));
}
function toast(msg){const b=$('banner');if(!b)return;b.textContent=msg;b.className='show';clearTimeout(toast.t);toast.t=setTimeout(()=>b.className='',2600);}

/* ---------- 菜单 ---------- */
function menu(){if(view==='battle')returnView='battle';else if(view==='map')returnView='map';else if(view==='camp')returnView='camp';show('menu');}
let returnView='battle';
function requestNew(){if(journey){$('flow-new-confirm').hidden=false;return;}start();}
function start(){
 // 新旅程：先清掉可能存在的旧关卡续局，再进入第 0 关教学入口。
 clearBattleSave();
 battleLocked=false;
 window.M0Tutorial&&window.M0Tutorial.stop();
 tutorialOn=false;
 show('tutorial');renderTutorial();
}
$('flow-new').onclick=requestNew;
$('flow-new-yes').onclick=()=>{$('flow-new-confirm').hidden=true;start();};
$('flow-new-no').onclick=()=>$('flow-new-confirm').hidden=true;
$('flow-continue').onclick=()=>{
 if(battleLocked){show('battle');return;}
 if(returnView==='battle'){show('battle');return;}
 if(journey&&journey.completed<3){show('map');return;}
 show('map');
};
$('flow-back').onclick=()=>backToCamp();
$('flow-menu-link').onclick=()=>{if(journey)menu();else menu();};
$('camp-menu').onclick=()=>menu();
$('flow-reload').onclick=()=>location.reload();

/* ---------- 教学（第 0 关） ---------- */
const TUTORIAL_STEPS=['保护主帅','查看敌情','移出危险','学会撤销','消除威胁','结束回合','完成教学'];
function renderTutorial(){
 $('tutorial-checklist').innerHTML=TUTORIAL_STEPS.map((t,i)=>`<li><span>${i+1}</span>${esc(t)}</li>`).join('');
 const canSkip=!!(player&&player.tutorialCompleted);
 $('tutorial-skip').disabled=!canSkip;
 $('tutorial-skip-reason').textContent=canSkip?'你曾完成过教学，本旅程可以直接跳到主营地（不产生教学猫粮）。':'首次游玩必须完成教学，完成前不能跳过进入主营地。';
 $('tutorial-back').onclick=menu;
}
$('tutorial-enter').onclick=()=>{
 tutorialOn=true;
 bridge().startTutorial();
 show('battle');
 window.M0Tutorial.start();
};
$('tutorial-skip').onclick=()=>{if(!(player&&player.tutorialCompleted)){toast('首次游玩必须完成教学');return;}$('tutorial-skip-confirm').hidden=false;};
$('tutorial-skip-no').onclick=()=>$('tutorial-skip-confirm').hidden=true;
$('tutorial-skip-yes').onclick=()=>{$('tutorial-skip-confirm').hidden=true;finishTutorial('skipped',0);};
// 教学结果复用战斗内 overlay：完成与失败都停留在教学，不进入主营地。
function showTutorialOverlay(kind,state){
 const box=$('ov-tutorial'),title=$('tutorial-overlay-title'),body=$('tutorial-overlay-body'),actions=$('tutorial-overlay-actions');
 if(!box)return;
 if(kind==='done'){
  title.textContent='教学完成';
  body.innerHTML=`<p>你已完成全部教学目标（不必击杀敌方将）。本次教学击杀结算 <b>${rules().tutorialReward(state)} 猫粮</b>，会带入旅程。</p><p>进入主营地还会获得新旅程首次入营的 8 猫粮与免费坚守。</p>`;
  actions.innerHTML='<button id="tutorial-done-ok" class="primary">前往主营地</button>';
  actions.querySelector('#tutorial-done-ok').onclick=()=>{box.classList.remove('show');finishTutorial('completed',rules().tutorialReward(_tutorialState||state));};
 }else{
  title.textContent='教学失败';
  body.innerHTML='<p>主帅阵亡。首次教学不能跳过，也不会进入主营地；请重试直到完成教学目标。</p>';
  actions.innerHTML='<button id="tutorial-retry" class="primary">重新开始教学</button><button id="tutorial-fail-menu">返回菜单</button>';
  actions.querySelector('#tutorial-retry').onclick=()=>{box.classList.remove('show');bridge().startTutorial();window.M0Tutorial.start();show('battle');};
  actions.querySelector('#tutorial-fail-menu').onclick=()=>{box.classList.remove('show');tutorialOn=false;window.M0Tutorial.stop();menu();};
 }
 box.classList.add('show');
}
function finishTutorial(outcome,reward){
 tutorialOn=false;
 window.M0Tutorial.stop();
 const fresh=rules().journeyRecord(rules().newGame());
 const record=Object.assign(fresh,{gold:outcome==='completed'?reward:0,tutorial:outcome});
 if(outcome==='completed')player.tutorialCompleted=true;
 const campState=bridge().loadCamp(record);
 enterCamp(campState,`${outcome==='completed'?'教学完成':"已跳过教学"} · 本次旅程首次入营：+8 猫粮，免费获得坚守（普通队友最大 HP +1）`);
}

/* ---------- 主营地 ---------- */
function mountCamp(state,notice){
 campNotice=notice||'';
 renderCamp(state);
 $('flow-loading').hidden=true;
 $('campaign').hidden=false;$('battle-root').hidden=true;
 ['loading','menu','map','tutorial'].forEach(v=>{const el=$('flow-'+v);if(el)el.hidden=true;});
 $('flow-camp').hidden=false;
 window.__M0_CAMPAIGN__.suspend();
 window.dispatchEvent(new Event('resize'));
}
function enterCamp(state,notice){
 view='camp';
 battleLocked=false;
 const healed=bridge().enterCamp();          // 回营恢复 + 首次入营奖励（幂等）
 const err=persist(healed);
 if(err)toast(err);
 mountCamp(err?state:healed,notice);
 if(player&&!player.campGuideSeen)showGuide(true);
}
// US-020 从选关地图返回主营地：只保留准备成果，不做恢复、不发奖励（恢复只发生在关卡推进时）。
function backToCamp(){
 if(!journey){menu();return;}
 if(battleLocked){show('battle');return;}
 view='camp';
 const state=bridge().state();
 mountCamp(state,'已返回主营地：已购买人口、队友、解锁增益与技能均保留');
}
// US-020 同一笔交易防重复提交：同一个动作在同一个事件任务内重复触发（重复提交/双击冒泡）只执行一次，
// 任务结束后自动释放；不同动作与后续独立点击不受影响，仍可连续购买。
const inflight={};
function campAction(act){
 const key=JSON.stringify(act);
 if(inflight[key])return true;
 inflight[key]=true;
 Promise.resolve().then(()=>{delete inflight[key];});
 const before=rules().copy(bridge().state());
 const result=bridge().camp(act);
 if(!result.ok)return false;
 const err=persist(result.state);
 if(err){bridge().restore(before);toast(err);renderCamp(before);return false;}
 renderCamp(result.state);
 return true;
}
function renderCamp(state){
 if(!state)state=bridge().state();
 current=state;
 const buffs=state.buffs||{};
 const limit=rules().populationLimit(state),actives=rules().activeOrdinary(state).length;
 // US-020 R04：持有普通队友总数（含后备）与部署人口／上限分开显示，均不限持有数量；
 // 主帅与仕单独显示，且都不计入这两个普通队友数字。
 const total=(state.party||[]).filter(u=>u.kind!=='advisor'&&u.kind!=='king').length;
 const backups=Math.max(0,total-actives),advisors=(state.party||[]).filter(u=>u.kind==='advisor').length;
 const summary=[
  ['猫粮',`<b class="camp-value">${state.gold}</b>`],
  ['公共 SP',`<b class="camp-value">${state.teamSp}</b>（全队共用，与猫粮分开）`],
  ['队友总数：',`<b class="camp-value">${total}</b>（其中后备 ${backups}）· 持有普通队友数量不限`],
  ['部署人口：',`<b class="camp-value">${actives}／${limit}</b>（上阵普通队友／部署上限，后备不占部署人口）`],
  ['主帅：',`1 · 自动上场（不计入队友总数与部署人口）`],
  ['仕：',`${advisors}/2 座 · 固定上阵、无后备（不计入队友总数与部署人口）`],
  ['旅程进度',`已通关 ${state.completed||0}/3 · 下一个挑战：第 ${(state.completed||0)+1} 关`],
  ['旅程增益',`${buffs.health?'<span class="ok">坚守 ✓</span>':'<span class="warn">坚守 ×</span>'} ${buffs.move?'<span class="ok">疾行 ✓</span>':'<span class="warn">疾行 ×</span>'} ${buffs.rescue?'<span class="ok">救援 ✓</span>':'<span class="warn">救援 ×</span>'}`],
  ['教学结果',state.tutorial==='completed'?'已完成（本次旅程）':state.tutorial==='skipped'?'本次已跳过（历史资格保留）':'未处理']
 ];
 $('camp-summary').innerHTML=summary.map(([k,v])=>`<p><span class="camp-key">${k}</span><span>${v}</span></p>`).join('');
 $('camp-banner').hidden=!campNotice;$('camp-banner').textContent=campNotice;
 $('camp-roster').innerHTML=state.party.map(u=>{
  if(u.kind==='advisor')return `<button class="camp-unit fixed" disabled>固定上阵 · 仕 · ${esc(u.id)} · 间隔 ${u.towerInterval||3} 回合</button>`;
  const on=(state.activeIds||[]).indexOf(u.id)>=0;
  return `<button class="camp-unit ${on?'active':''}" data-camp-roster="${esc(u.id)}">${on?'上阵':'后备'} · ${KIND_LABEL[u.kind]||u.kind} · ${esc(u.id)} · Lv.${u.level} · 击杀 ${u.kills}</button>`;
 }).join('');
 $('camp-roster-hint').textContent=`队友总数：${total}（其中后备 ${backups}）· 部署人口：${actives}／${limit}；点击切换上阵/后备。后备不占部署人口，持有普通队友数量不限、不能出售。`;
 $('camp-roster').querySelectorAll('[data-camp-roster]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.campRoster,ids=(state.activeIds||[]).indexOf(id)>=0?state.activeIds.filter(v=>v!==id):state.activeIds.concat(id);
  if(!campAction({type:'roster',ids}))toast(`部署人口已达上限 ${actives}／${limit}：请先换下一名，或提升部署上限（按钮“部署上限 +1 · 5猫粮”）`);
 });
 $('camp-recruit').innerHTML=RECRUITS.map(([kind,label,desc])=>{
  const price=PRICES[kind],full=kind==='advisor'&&advisors>=2;
  return `<div class="good"><b>${label}</b><p>${desc}</p><button data-recruit="${kind}" ${state.gold<price||full?'disabled':''}>招募${label}（${price} 猫粮）</button>${full?'<small>已达上限：最多两座仕</small>':''}</div>`;
 }).join('');
 $('camp-recruit').querySelectorAll('[data-recruit]').forEach(b=>b.onclick=()=>{
  if(!campAction({type:'buy',kind:b.dataset.recruit}))toast('猫粮不足或已达上限（仕最多两座），未扣款');
 });
 const canExpand=limit<8&&state.gold>=5,health=buffs.health,move=buffs.move,rescue=buffs.rescue;
 $('camp-growth').innerHTML=[
  `<div class="growth-row"><div><b>部署上限 +1</b><p>部署上限 ${limit}/8${limit>=8?' · 已达上限 8':''} · 每次 5 猫粮，只提高 1 名可部署普通队友上限（不增加持有队友、不赠送棋子）</p></div><button data-camp-expand ${canExpand?'':'disabled'}>部署上限 +1 · 5猫粮</button></div>`,
  `<div class="growth-row"><div><b>疾行</b><p>普通队友移动 +1${move?' · <span class="ok">已解锁</span>':''}${health?'':' · <span class="warn">需先获得坚守</span>'}</p></div><button data-camp-buff="move" ${!health||move||state.gold<5?'disabled':''}>${move?'已解锁':'解锁（5 猫粮）'}</button></div>`,
  `<div class="growth-row"><div><b>救援</b><p>每关第二波开始前一次救援机会${rescue?' · <span class="ok">已解锁</span>':''}${move?'':' · <span class="warn">先解锁移动增益</span>'}</p></div><button data-camp-buff="rescue" ${!move||rescue||state.gold<5?'disabled':''}>${rescue?'已解锁':'解锁（5 猫粮）'}</button></div>`
 ].join('');
 $('camp-growth').querySelectorAll('[data-camp-expand]').forEach(b=>b.onclick=()=>{if(!campAction({type:'expand'}))toast('猫粮不足或部署上限已满 8，未扣款');});
 $('camp-growth').querySelectorAll('[data-camp-buff]').forEach(b=>b.onclick=()=>{
  const key=b.dataset.campBuff;
  if(!campAction({type:'buff',key}))toast(key==='rescue'?'需先解锁移动增益或猫粮不足，未扣款':'未满足条件或猫粮不足，未扣款');
 });
 renderCampSkills(state);
}
function renderCampSkills(state){
 const groups=bridge().campSkills?(bridge().campSkills()||[]):[];
 $('camp-skills').innerHTML=groups.map(g=>{
  const skills=g.skills&&g.skills.length?g.skills.map(s=>`<button class="skill" data-camp-skill="${esc(g.id)}" data-skill="${s.skill}" data-index="${s.index===null||s.index===undefined?'':s.index}" ${s.disabled?'disabled':''}><span>${esc(s.label)}<small>${esc(s.desc)}</small></span><span>${s.cost} 公共 SP</span></button>`).join(''):`<p class="hint">${esc(g.note||'该棋子暂无可升级项')}</p>`;
  return `<div class="skill-unit"><p><b>${esc(g.name)}</b> · ${g.active?'上阵':'后备'} · Lv.${g.level} · ${esc(g.id)}</p>${skills}</div>`;
 }).join('')||'<p class="hint">当前没有可升级的棋子。</p>';
 $('camp-skills').querySelectorAll('[data-camp-skill]').forEach(b=>b.onclick=()=>{
  if(!campAction({type:'upgrade',id:b.dataset.campSkill,skill:b.dataset.skill,index:b.dataset.index===''?undefined:Number(b.dataset.index)}))toast('公共 SP 不足或已达上限，未扣款');
 });
}
$('camp-leave').onclick=()=>{if(!journey)persist(bridge().state());show('map');selected=((bridge().state().completed||0)+1);renderMap();};
$('camp-help').onclick=()=>showGuide(false);
$('camp-guide-close').onclick=()=>closeGuide();$('camp-guide-skip').onclick=()=>closeGuide();
function showGuide(){ $('camp-guide').hidden=false; }
function closeGuide(){ $('camp-guide').hidden=true; if(player&&!player.campGuideSeen){player=Object.assign({},player,{campGuideSeen:true});const err=persistPlayer();if(err)toast(err);} }

/* ---------- 选关地图与预览 ---------- */
function renderMap(){
 if(battleLocked){show('battle');return;}
 const state=bridge().state(),completed=state&&state.completed||0;
 journey=journey||rules().journeyRecord(state);
 selected=Math.min(3,Math.max(1,selected||completed+1));
 const maxOpen=Math.min(3,completed+1);
 if(selected>maxOpen&&completed>=maxOpen)selected=Math.max(1,Math.min(3,completed));
 $('flow-level-number').textContent='第'+selected+'关';
 $('flow-level-name').textContent=names[selected-1];
 $('flow-level-symbol').textContent=symbols[selected-1];
 $('flow-level-copy').textContent=selected<=completed?'本关已通关，不能重复挑战。':selected===completed+1?'当前可挑战关卡，确认进入后保存入关快照。':'尚未解锁：先完成第'+(completed+1)+'关。';
 const allowed=selected===completed+1&&completed<3;
 $('flow-enter').disabled=!allowed;
 $('flow-enter').textContent=allowed?'确认进入第'+selected+'关':'第'+selected+'关不可进入';
 $('flow-lock').textContent=selected<=completed?'已通关（不提供重复刷猫粮/SP）':allowed?'进入后保存入关快照，布阵与战斗期间不能回营':'解锁前仅可预览';
 document.querySelectorAll('#campaign [data-region]').forEach(b=>{
  const n=Number(b.dataset.region)+1;b.classList.toggle('selected',n===selected);
  if(b.tagName==='BUTTON'){b.setAttribute('aria-pressed',String(n===selected));b.textContent=n+' · '+names[n-1]+' · '+(n<=completed?'已完成':n===completed+1?'待挑战':'未解锁');}
 });
 renderPreview(selected);
}
function renderPreview(n){
 const map=window.M0Maps?window.M0Maps.library(store()||{getItem:()=>null,setItem:()=>{}}).level(n):null;
 const grid=$('level-preview-grid');if(!grid)return;
 if(!map){grid.innerHTML='';$('preview-name').textContent='—';$('preview-enemies').textContent='';return;}
 $('preview-name').textContent=map.name||'关卡地图';
 const enemies=map.units.filter(u=>u.side==='enemy'),king=map.units.find(u=>u.side==='player'&&u.kind==='king');
 const cells=[];
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){
  const terrain=map.tiles[x+','+y]||'land',enemy=enemies.find(u=>u.x===x&&u.y===y),mine=king&&king.x===x&&king.y===y;
  const glyph=enemy?KIND_LABEL[enemy.kind]||'敌':mine?'帅':'';
  cells.push(`<span class="pv-cell terrain-${terrain}" data-terrain="${terrain}" data-x="${x}" data-y="${y}">${glyph}</span>`);
 }
 grid.innerHTML=cells.join('');
 $('preview-enemies').textContent=`第一波敌方 ${enemies.length} 枚：`+enemies.map(u=>`${KIND_LABEL[u.kind]||u.kind}（${u.x+1},${u.y+1}）`).join('、');
}
document.querySelectorAll('#campaign [data-region]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.region)+1;renderMap();});
$('flow-enter').onclick=()=>enterLevel(selected);
function enterLevel(n){
 if(battleLocked){toast('已确认进入关卡：刷新/继续只能回到当前布阵或战斗，不能重选关卡');show('battle');return false;}
 const state=bridge().state();
 if(n!==(state.completed||0)+1||n>3){toast('该关卡当前不可进入');return false;}
 if(!bridge().enterLevel(n)){toast('无法进入该关，请返回主营地检查队伍');return false;}
 battleLocked=true;
 const next=bridge().state();
 const err=persist(next,null,next,'进入关卡快照');       // 确认进入即保存入关快照与续局锁定
 if(err)toast(err);
 show('battle');
 return true;
}

/* ---------- 战斗状态回调 ---------- */
function update(state){
 if(view!=='battle')return;
 if(state.phase==='intermission'){
  if(state.level>=3){persist(state,null,state,'最终关胜利');return;}   // 最终关胜利：保留终局续局，刷新不回到可购物营地
  persist(state);
  enterCamp(state,`第 ${state.level} 关胜利 · 本关结算后猫粮 ${state.gold} · 队伍已满血恢复`);
  return;
 }
 if(state.phase==='result'){
  if(tutorialOn)showTutorialOverlay('fail',state);
  return;
 }
}
window.M0Campaign=internal?null:{
 menu,requestNew,start,update,enter:enterLevel,toMap:()=>{if(battleLocked){show('battle');return;}selected=(bridge().state().completed||0)+1;show('map');renderMap();},
 saveBattle:(state,reason)=>persistBattle(state,reason),clearBattle:()=>clearBattleSave(),
 hint:text=>{toast(text);return text;},
 tutorialGoals:state=>{_tutorialState=state;showTutorialOverlay('done',state);},
 tutorialFinished:()=>{const state=bridge().state();finishTutorial('completed',rules().tutorialReward(state));},
 info:()=>{
  const state=bridge()&&bridge().state?bridge().state():null;
  return{journey:!!journey,completed:(state&&state.completed)||0,selected,view,
   gold:state&&state.gold,teamSp:state&&state.teamSp,population:state&&state.population,
   buffs:state&&state.buffs,tutorial:player&&player.tutorialCompleted?'completed':'unseen',
   guideSeen:!!(player&&player.campGuideSeen)};
 }
};

/* ---------- 启动 ---------- */
const scripts=['vendor/three.min.js','js/rules.js','js/maps.js','js/journey.js','js/tutorial.js','js/app.js','js/ui.js'];
let startupError=null;const failed=e=>{startupError=e.error||Error(e.message);};window.addEventListener('error',failed);
try{
 for(const src of scripts){
  $('flow-load-status').textContent='正在准备棋盘与旅程…';
  await new Promise((ok,no)=>{const el=document.createElement('script');el.src=src+'?v=us020r2';el.onload=ok;el.onerror=()=>no(Error('资源加载失败：'+src));document.body.append(el);});
  if(startupError)throw startupError;
 }
 if(!window.__M0_CAMPAIGN__)throw Error('战斗入口未准备好');
 window.removeEventListener('error',failed);
 const saved=loadSave();
 player=saved.player||window.M0Journey.emptyPlayer();
 journey=saved.journey||null;
 if(saved.error)toast(saved.error);
 if(internal){show('battle');return;}
 if(saved.battle&&saved.battle.state){
  // 正式关卡续局：恢复入关锁定，绝不因刷新/关闭继续绕回主营地或地图。
  battleLocked=true;
  bridge().loadBattle(saved.battle.state);
  show('battle');
  const restored=bridge().state();
  update(restored);
  toast(`已恢复第 ${restored.level} 关续局：${restored.phase==='deploy'?'仍在布阵':restored.phase==='rescue'?'救援机会待处理':restored.phase==='result'?'等待失败重试':restored.phase==='intermission'?'最终关结算':'已恢复到上次保存点（普通移动不单独保存）'}`);
 }else if(journey){
  // 只恢复最近一次合法回营后的旅程状态；已进入关卡的续局由上面的 battle 分支优先。
  const state=bridge().loadCamp(journey);
  enterCamp(state,'已恢复上次旅程的营地状态，不重复发奖也不退猫粮');
 }else{
  show('menu');
 }
}catch(e){
 window.removeEventListener('error',failed);show('loading');
 $('flow-load-status').textContent='准备失败：'+e.message;
 $('flow-reload').hidden=false;
 $('flow-reload').onclick=()=>location.reload();
}
})();
