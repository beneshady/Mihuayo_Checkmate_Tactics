// 一次性补丁：US-022 冻结状态在意图列表/棋盘标记/血量标签中可辨。
const fs = require('node:fs');
const p = 'web/js/app.js';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 120)); process.exit(1); }
  t = t.split(a).join(b);
}
// 1) 意图列表：冰冻/受伤解冻直接显示“待机”，不恢复旧攻击线。
rep(
  "function renderIntents(){const byActor=intentEffects(),types={move:'移动',attack:'攻击',charge:'冲击',standby:'待机'},statuses={success:'可执行',cancelled:'将失效',miss:'将落空',removed:'已移除',standby:'待机'};$('intent-list').innerHTML=state.intents.map(i=>{const u=G(i.actor),effect=byActor.get(i.actor),",
  "function renderIntents(){const byActor=intentEffects(),types={move:'移动',attack:'攻击',charge:'冲击',standby:'待机'},statuses={success:'可执行',cancelled:'将失效',miss:'将落空',removed:'已移除',standby:'待机'};$('intent-list').innerHTML=state.intents.map(i=>{const u=G(i.actor),frozen=u&&u.side==='enemy'?(Number.isInteger(u.frozen)&&u.frozen>0?u.frozen:u.thawStandby?'thaw':null):null;if(frozen)return `<div class=\"intent frozen\"><span class=\"order\">${i.order}</span>${intentName(i,u)} · 待机（${frozen==='thaw'?'受伤解冻 · 本回合待机，下回合恢复':`冰封 · 剩余 ${frozen} 个敌方行动阶段`}）<br>冻结期间不能移动或攻击，可被位移 · 不显示原攻击线</div>`;const effect=byActor.get(i.actor),"
);
// 2) 棋盘意图总览：冰冻/解冻待机的敌人不画旧攻击落点。
rep(
  "function renderIntentOverview(){const effects=intentEffects();state.intents.forEach(i=>{if(i.type==='standby')return;",
  "function renderIntentOverview(){const effects=intentEffects();state.intents.forEach(i=>{if(i.type==='standby')return;const actor=G(i.actor);if(actor&&R.frozenSkip(actor))return;"
);
// 3) 血量标签：附冻结剩余阶段数，冰封/解冻待机在棋盘上直接可见。
rep(
  "label.textContent=`${u.hp}/${u.maxHp}`;",
  "label.textContent=`${u.hp}/${u.maxHp}${u.side==='enemy'&&Number.isInteger(u.frozen)&&u.frozen>0?' ❄'+u.frozen:''}${u.side==='enemy'&&u.thawStandby?' ❄解冻':''}`;"
);
// 4) 选中象时默认模式：可动则移动，否则若技能可用则牵引。
rep(
  "if(u.kind==='horse'&&u.side==='player')horseMode=u.ap>0?'horse-move':'horse-jump';",
  "if(u.kind==='horse'&&u.side==='player')horseMode=u.ap>0?'horse-move':'horse-jump';if(u.kind==='elephant'&&u.side==='player')elephantMode=u.ap>0?'elephant-move':u.elephantSkillUsed?'elephant-move':'elephant-pull';"
);
// 5) 调试入口：与 setRookMode/setHorseMode 对齐。
rep(
  "setHorseMode:m=>{horseMode=m},",
  "setHorseMode:m=>{horseMode=m},setElephantMode:m=>{elephantMode=m},"
);
fs.writeFileSync(p, t);
console.log('patched app.js freeze display');
