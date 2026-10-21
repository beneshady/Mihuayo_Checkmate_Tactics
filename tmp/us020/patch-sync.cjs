// Replace app.js syncOverlays with the US-020 flow version.
const fs=require('fs');
const p='web/js/app.js';
const lines=fs.readFileSync(p,'utf8').split('\n');
const idx=lines.findIndex(l=>l.startsWith('function syncOverlays()'));
if(idx<0)throw Error('syncOverlays not found');
const neu=[
"function rescueChoices(){const t=R.rescueTargets(state);return{live:state.units.filter(u=>t.live.indexOf(u.id)>=0),corpses:(state.corpses||[]).filter(c=>c.unit&&t.corpses.indexOf(c.unit.id)>=0).map(c=>c.unit)};}",
"function renderRescueOptions(){const root=$('rescue-options');if(!root)return;const t=rescueChoices(),",
" choices=t.live.map(u=>`<button data-rescue=\"${esc(u.id)}\">${unitName(u)}：回满 HP（当前 ${u.hp}/${u.maxHp}）</button>`).concat(t.corpses.map(u=>`<button data-rescue=\"${esc(u.id)}\">${unitName(u)}：在 ${point(u)} 复活 1 HP</button>`));",
" root.innerHTML=choices.join('')||'<span class=\"empty\">没有可救援对象，将直接进入第二波。</span>';",
" root.querySelectorAll('[data-rescue]').forEach(b=>b.onclick=()=>{const n=R.rescue(state,b.dataset.rescue);if(n===state)return;interactionRevision++;state=n;postState()});}",
"function syncOverlays(){",
" const campaign=!!window.M0Campaign,tutorialOn=!!(window.M0Tutorial&&window.M0Tutorial.active()),",
"  terminal=campaign&&state.phase==='intermission'&&state.level>=3;",
" $('ov-rescue').classList.toggle('show',state.phase==='rescue');",
" $('ov-deploy').hidden=state.phase!=='deploy';",
" $('ov-result').classList.toggle('show',!tutorialOn&&(state.phase==='result'||terminal));",
" if($('tutorial-hint'))$('tutorial-hint').hidden=!tutorialOn;",
" if(state.phase==='rescue')renderRescueOptions();",
" if(state.phase==='deploy'){",
"  $('deploy-roster').innerHTML=state.units.filter(u=>u.side==='player'&&u.kind!=='king').map(u=>`<button data-deploy=\"${esc(u.id)}\" class=\"${selected===u.id?'active':''}\">${unitName(u)} ${point(u)}</button>`).join('');",
"  $('deploy-roster').querySelectorAll('[data-deploy]').forEach(b=>b.onclick=()=>select(b.dataset.deploy));",
"  $('advisor-deploy').innerHTML=towerDeployHTML();",
"  $('advisor-deploy').querySelectorAll('[data-advisor-side]').forEach(b=>b.onclick=()=>{const to={x:Number(b.dataset.x),y:Number(b.dataset.y)},wasPending=(state.pendingAdvisorIds||[]).includes(b.dataset.advisorSide),n=R.deploy(state,b.dataset.advisorSide,to);if(n===state){toast('该侧位被队友占据，请先移开该队友，不会自动挤走或覆盖');return}state=n;postState();toast(`${wasPending?'仕已布置':'仕已换到'}${towerSideLabel(to)}`)});",
"  const ordinary=state.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,limit=R.populationLimit(state);",
"  $('deploy-population').textContent=`人口：上阵普通队友 ${ordinary}/${limit}（主帅与仕不占人口，至少 1 名）`;",
" }",
" if(terminal){$('result-title').textContent='三关通关';$('result-text').textContent=`第3关胜利 · 波次 ${state.wave} · 回合 ${state.turn} · 总击杀 ${state.kills} · 猫粮 ${state.gold}`;$('btn-restart-2').textContent='开始新一轮';}",
" else if(state.phase==='result'){$('btn-restart-2').textContent='从本关布阵重试';$('result-title').textContent=state.result==='victory'?'胜利':state.result==='mate'?'将死':'主帅阵亡';$('result-text').textContent=`波次 ${state.wave} · 回合 ${state.turn} · 总击杀 ${state.kills}`}",
"}"
];
lines.splice(idx,1,...neu);
fs.writeFileSync(p,lines.join('\n'));
console.log('replaced syncOverlays at line',idx+1);
