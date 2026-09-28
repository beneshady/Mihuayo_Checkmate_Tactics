(function () {
  'use strict';
  const G = TerrainGame, $ = id => document.getElementById(id);
  let state = G.createState(), selected = null, mode = 'move', pending = null, history = [], confirmation = null;
  let editing = false, customMap = null, editorBackup = null, editHistory = [], redoHistory = [], brush = 'relocate', team = 'player', moving = null, nextId = 0;
  const storageKey = 'terrain-wave.map.v1';
  const terrainTools = [['relocate','↔ 移动棋子'],['land','▧ 陆地'],['water','≈ 水'],['bridge','▰ 桥'],['mountain','▲ 山'],['cracked','◭ 开裂山'],['forest','♠ 树林'],['erase','⌫ 删除棋子']];
  function selectBrush(value) { brush = value; moving = null; render(); }
  function rememberEdit() { editHistory.push(G.copy(state)); redoHistory = []; }
  function paint(p) {
    const occupant = G.at(state,p);
    if (brush === 'relocate') {
      if (occupant) { moving = occupant.id; show(`已选择${G.label(occupant)}，点击空格移动；Esc 取消。`); render(); return; }
      const u = state.units.find(v=>v.id===moving);
      if (!u) { show('先点一枚棋子，再点目标空格。'); return; }
      if (G.mountain(state,p)) { show('山上不能放棋子，请先换成可通行地形。'); return; }
      rememberEdit(); u.x=p.x;u.y=p.y; moving=null; show('棋子已移动，编辑中不消耗行动。');
    } else if (brush === 'erase') {
      if (!occupant) { show('这里没有棋子。更改地形请选对应画笔。'); return; }
      rememberEdit();state.units=state.units.filter(v=>v.id!==occupant.id);show('已删除棋子，地形保留；可撤销。');
    } else if (brush.includes(':')) {
      const [side,kind]=brush.split(':');
      if (occupant) { show('该格已有棋子。请用“移动棋子”或“删除棋子”，避免误覆盖。'); return; }
      if (G.mountain(state,p)) { show('山上不能放棋子，请先更换地形。'); return; }
      if (side==='enemy' && kind!=='king' && state.units.filter(v=>v.side==='enemy').length>=8) { show('本实验最多八枚敌人；请先移动或删除一枚。'); return; }
      rememberEdit();
      const existing=kind==='king' && state.units.find(v=>v.side===side&&v.kind===kind);
      if(existing){existing.x=p.x;existing.y=p.y;}
      else { let id;do{id=`edit-${++nextId}`;}while(state.units.some(v=>v.id===id));state.units.push(G.unit(id,side,kind,p.x,p.y)); }
      show(`${side==='player'?'我方':'敌方'}棋子已放置，可继续点空格。`);
    } else {
      const value=brush==='mountain'?2:brush==='cracked'?1:brush;
      if (occupant && typeof value==='number') { show('山会占格，请先移开或删除这里的棋子。'); return; }
      if(G.terrain(state,p)===value)return;
      rememberEdit();state.tiles[G.key(p)]=value;show(`${position(p)}已改为${terrainTools.find(t=>t[0]===brush)[1]}。`);
    }
    render();
  }
  function enterEditor() {
    if(editing||confirmation)return;
    editorBackup={state:G.copy(state),selected,mode,pending:G.copy(pending),history:G.copy(history)};
    state=G.copy(customMap || G.createState($('scenario').value,{skipPrepare:true}));
    state.result=null;editing=true;editHistory=[];redoHistory=[];selected=null;pending=null;moving=null;brush='relocate';
    show('编辑初始地图：选画笔后点格子。测试中的伤亡不会修改原稿。');render();$('workspace').scrollIntoView({block:'start'});
  }
  function renderEditor() {
    $('workspace').className=editing?'editing':'';
    $('editor').hidden=$('edit-toolbar').hidden=!editing;
    $('play-panel').hidden=$('intent-panel').hidden=$('log-panel').hidden=editing;
    $('edit-map').textContent=customMap?'返回编辑':'编辑地图';$('edit-map').hidden=editing;
    if(!editing)return;
    $('quick-tools').replaceChildren();
    for(const [value,text] of terrainTools){const b=document.createElement('button');b.textContent=text;b.setAttribute('aria-label',`画笔：${text.slice(2)}`);b.setAttribute('aria-pressed',String(brush===value));b.className=brush===value?'active':'';b.onclick=()=>selectBrush(value);$('quick-tools').append(b);}
    $('team-player').className=team==='player'?'active':'';$('team-enemy').className=team==='enemy'?'active':'';
    $('piece-tools').replaceChildren();
    for(const kind of team==='player'?['king','rook','cannon','pawn','archer','spear','horse']:['king','advisor','rook','cannon','pawn','horse']){
      const value=`${team}:${kind}`,sample=G.unit('preview',team,kind,1,1),b=document.createElement('button');
      b.textContent=G.name(sample);b.setAttribute('aria-label',`放置${G.label(sample)}`);b.setAttribute('aria-pressed',String(brush===value));b.className=`unit-tool ${team}${brush===value?' active':''}`;b.onclick=()=>selectBrush(value);$('piece-tools').append(b);
    }
    const sample=brush.includes(':')?G.unit('preview',...brush.split(':'),1,1):null;
    $('brush-status').textContent=sample?`正在放置：${G.label(sample)} · 点击空格，可连续放置`:brush==='relocate'?(moving?'已选中棋子 → 点击空格移动':'移动棋子：先点棋子，再点空格'):`当前画笔：${terrainTools.find(t=>t[0]===brush)[1]} · 点格子应用`;
    const errors=G.validateMap(state);
    $('map-errors').textContent=errors.length?`开始测试前请修正：\n${errors.join('\n')}`:`✓ 可以测试 · 我方 ${state.units.filter(v=>v.side==='player').length} 枚 / 敌方 ${state.units.filter(v=>v.side==='enemy').length} 枚`;
    $('map-errors').className=errors.length?'map-invalid':'map-valid';
    $('test-map').disabled=!!errors.length;$('edit-undo').disabled=!editHistory.length;$('edit-redo').disabled=!redoHistory.length;
  }
  const terrainName = p => G.mountain(state, p) ? `山（剩余 ${G.terrain(state, p)} 次命中）` : ({ water: '水', bridge: '桥', forest: '树林', land: '陆地', 0: '坍塌陆地' }[G.terrain(state, p)]);
  const position = p => `第${p.x}列第${p.y}行`;
  function current() { return state.units.find(u => u.id === selected && u.hp > 0); }
  function show(text) { $('banner').textContent = text; }
  function choose(id) { selected = id; pending = null; show(''); render(); }
  function actionFor(u, p) { return mode === 'move' ? G.moveAction(state, u, p) : G.attackAction(state, u, p); }
  function previewText(action) {
    if (action.type === 'move') return `危险移动：经过水格 ${G.key(action.drown)} 时立即阵亡，不会抵达更远的目标。确认后不可撤销。`;
    const examples = [0, 1].map(roll => {
      const trial = G.copy(state), count = trial.log.length;
      G.execute(trial, action, () => roll);
      return trial.log.slice(count).join('；') || `冲击到 ${G.key(action.to)} / 攻击落空`;
    });
    return examples[0] === examples[1] ? examples[0] : `树林掩护：有一定概率闪避。\n闪避时：${examples[0]}\n命中时：${examples[1]}\n多目标各自判断；不预先揭示结果。`;
  }
  function clickCell(p) {
    if(editing){paint(p);return;}
    if (state.result || confirmation) return;
    const occupant = G.at(state, p), u = current();
    if (occupant && occupant.side === 'player') { choose(occupant.id); return; }
    if (!u) { show(`${position(p)} · ${terrainName(p)}。先选择我方棋子。`); return; }
    const action = actionFor(u, p);
    if (!action) { pending = null; show('该动作不可执行：检查行动次数、阻挡、射程与炮架。'); render(); return; }
    if (mode === 'move' && !action.drown) {
      history.push(G.copy(state)); state = G.submit(state, u.id, p, mode).state; pending = null; show('移动完成，可撤销。'); render();
    } else { pending = action; show('请查看预览，再确认执行。'); render(); }
  }
  function render() {
    const u = current(), forecasts = editing?[]:G.forecast(state), threats = new Map();
    for (const row of forecasts) for (const cell of row.threat) threats.set(cell, [...(threats.get(cell) || []), row.order]);
    const board = $('board'); board.replaceChildren();
    for (const p of G.cells().sort((a, b) => (b.x + b.y) - (a.x + a.y))) {
      const cell = document.createElement('button'), occupant = G.at(state, p), type = G.terrain(state, p);
      const tclass = G.mountain(state, p) ? 'mountain' : type === 0 ? 'rubble' : type;
      const valid = !editing && u && !state.result && actionFor(u, p);
      cell.className = `cell ${tclass}${valid ? ` legal ${mode}` : ''}${occupant && occupant.id === selected ? ' selected' : ''}${pending && G.same(p, pending.to) ? ' pending' : ''}${p.x >= 4 && p.x <= 6 && (p.y <= 3 || p.y >= 7) ? ' palace' : ''}`;
      cell.style.left = `${(370 + (p.x - p.y) * 39) / 7.4}%`;
      cell.style.top = `${(493 - (p.x + p.y - 2) * 25) / 5.7}%`;
      cell.style.zIndex = 20 - p.x - p.y;
      if(editing){cell.style.left=`${(p.x-.5)*100/9}%`;cell.style.top=`${(9.5-p.y)*100/9}%`;cell.style.zIndex=1;if(occupant&&occupant.id===moving)cell.className+=' selected';}
      cell.setAttribute('aria-label', `${position(p)} ${terrainName(p)}${occupant ? ` ${G.label(occupant)} 生命${occupant.hp}` : ' 空格'}`);
      cell.title = cell.getAttribute('aria-label'); cell.dataset.cell = G.key(p);
      if (occupant) {
        const piece = document.createElement('span'); piece.className = `piece ${occupant.side}${occupant.attacked ? ' spent' : ''}`;
        piece.textContent = G.name(occupant); const hp = document.createElement('small'); hp.textContent = `${occupant.hp}/${occupant.maxHp}`; piece.append(hp); cell.append(piece);
      } else if (['water', 'forest', 'mountain', 'rubble'].includes(tclass)) {
        const symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = tclass === 'mountain' ? (type === 2 ? '▲' : '◭') : ({ water: '≈', forest: '♠', rubble: '·' }[tclass]); cell.append(symbol);
      }
      const coords = document.createElement('span'); coords.className = 'coords'; coords.textContent = G.key(p); cell.append(coords);
      if (threats.has(G.key(p)) && !state.result) { const mark = document.createElement('span'); mark.className = 'danger-mark'; mark.textContent = `!${threats.get(G.key(p)).join('/')}`; cell.append(mark); }
      cell.addEventListener('click', () => clickCell(p)); board.append(cell);
    }
    $('status').textContent = editing ? '地图编辑 · 正在调整初始布局' : state.result ? (state.result === 'victory' ? '本波胜利 · 敌将已阵亡' : '战斗失败 · 我方帅阵亡') : `第 ${state.turn} 回合 · 我方行动 · 击杀 ${state.kills}`;
    $('roster').replaceChildren();
    for (const ally of state.units.filter(v => v.side === 'player' && v.hp > 0)) {
      const b = document.createElement('button'); b.textContent = `${G.name(ally)} ${ally.hp}♥`; b.className = ally.id === selected ? 'active' : ''; b.disabled = !!state.result || !!confirmation;
      b.setAttribute('aria-label', `选择我方${G.name(ally)}`); b.onclick = () => choose(ally.id); $('roster').append(b);
    }
    $('selection').textContent = u ? `${G.label(u)} · ${position(u)} · 生命 ${u.hp}/${u.maxHp} · 伤害 ${u.damage}。${['rook', 'cannon'].includes(u.kind) ? `移动 ${!u.moved && !u.attacked ? 1 : 0} / 攻击 ${!u.attacked ? 1 : 0}` : `共用行动 ${!u.moved && !u.attacked ? 1 : 0}`}。${u.kind === 'rook' ? '冲击 3 格 · 已预设震退' : ['archer', 'spear'].includes(u.kind) ? '四向射程 3 格；点目标即选该方向' : ''}${G.terrain(state, u) === 'water' ? '水中不能攻击，须先普通移动离水。' : ''}` : '选择一枚我方棋子。';
    $('move').className = mode === 'move' ? 'active' : ''; $('attack').className = mode === 'attack' ? 'active' : '';
    $('move').disabled = $('attack').disabled = !u || !!state.result || !!confirmation;
    $('preview').textContent = pending ? previewText(pending) : '点选棋子，再点选高亮格。普通安全移动立即执行；攻击需要确认。';
    $('execute').disabled = $('cancel').disabled = !pending || !!state.result || !!confirmation;
    $('undo').disabled = !history.length || !!state.result || !!confirmation; $('end').disabled = !!state.result || !!confirmation;
    $('restart').disabled = $('scenario').disabled = !!confirmation;
    $('end').hidden=$('undo').hidden=$('restart').hidden=editing;$('scenario').disabled=editing||!!confirmation;$('edit-map').disabled=!!confirmation;
    $('confirmation').hidden = !confirmation;
    $('confirmation-text').textContent = confirmation === 'restart' ? '重开本场景？当前独立实验进度将清空。' : '结束回合？未使用的行动将放弃，敌人按冻结意图依序攻击。';
    $('confirm-action').textContent = confirmation === 'restart' ? '确认重开' : '确定结束回合';
    $('intents').replaceChildren();
    for (const row of forecasts) {
      const div = document.createElement('div'); div.className = 'intent'; const title = document.createElement('b');
      const actor = state.units.find(v => v.id === row.actor && v.hp > 0);
      const aim = actor && !row.standby ? ` (${G.key(actor)}) → (${actor.x + row.dx},${actor.y + row.dy})` : '';
      title.textContent = `${row.order}. 敌方${row.name}${aim} ${row.conditional ? '· 条件结果' : ''}`;
      const detail = document.createElement('small'); detail.textContent = row.outcomes.slice(0, 3).join(' / ') + (row.outcomes.length > 3 ? ' / 另有条件分支' : ''); div.append(title, detail); $('intents').append(div);
    }
    $('log').replaceChildren(); for (const text of state.log.slice(-7).reverse()) { const li = document.createElement('li'); li.textContent = text; $('log').append(li); }
    renderEditor();
  }
  $('move').onclick = () => { mode = 'move'; pending = null; render(); };
  $('attack').onclick = () => { mode = 'attack'; pending = null; render(); };
  $('cancel').onclick = () => { pending = null; show('已取消，未消耗行动。'); render(); };
  $('execute').onclick = () => {
    if (!pending || state.result) return;
    const result = G.submit(state, pending.actor, pending.to, pending.type);
    if (!result) { pending = null; show('动作已失效，请重新选择。'); render(); return; }
    state = result.state; history = []; pending = null; show(state.result ? '本场战斗已结束。可重开尝试其他路线。' : '动作完成，已锁定此前移动。'); render();
  };
  $('undo').onclick = () => { if (!history.length || state.result) return; state = history.pop(); pending = null; show('已撤销最近一次普通移动。'); render(); };
  $('end').onclick = () => { if (state.result) return; confirmation = 'end'; render(); };
  function restart() { state = customMap && $('scenario').value==='custom'?G.startMap(customMap):G.createState($('scenario').value); selected = null; mode = 'move'; pending = null; history = []; confirmation = null; show('新的独立战局已开始。'); render(); }
  $('restart').onclick = () => { confirmation = 'restart'; render(); };
  $('dismiss-action').onclick = () => { confirmation = null; render(); };
  $('confirm-action').onclick = () => {
    if (confirmation === 'restart') { restart(); return; }
    if (confirmation !== 'end' || state.result) return;
    confirmation = null; state = G.endTurn(state); pending = null; history = []; show(state.result ? '本场战斗已结束。' : '敌方已完成攻击与下一轮准备。'); render();
  };
  $('scenario').onchange = () => {customMap=null;restart();};
  $('edit-map').onclick=enterEditor;
  $('team-player').onclick=()=>{team='player';render();};$('team-enemy').onclick=()=>{team='enemy';render();};
  $('edit-undo').onclick=()=>{if(!editing||!editHistory.length)return;redoHistory.push(G.copy(state));state=editHistory.pop();moving=null;show('已撤销编辑。');render();};
  $('edit-redo').onclick=()=>{if(!editing||!redoHistory.length)return;editHistory.push(G.copy(state));state=redoHistory.pop();moving=null;show('已重做编辑。');render();};
  $('cancel-edit').onclick=()=>{if(!editing)return;({state,selected,mode,pending,history}=editorBackup);editing=false;moving=null;show('已返回原战局，未应用此次编辑。');render();};
  $('test-map').onclick=()=>{
    if(!editing||G.validateMap(state).length)return;
    customMap=G.copy(state);state=G.startMap(customMap);editing=false;selected=null;pending=null;history=[];moving=null;$('scenario').value='custom';
    show('正在测试你的地图。随时点“返回编辑”修改原稿。');render();$('workspace').scrollIntoView({block:'start'});
  };
  $('save-map').onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify({version:1,map:state}));$('save-status').textContent='✓ 已保存到本机。再次保存将更新这一份地图。';}catch(e){$('save-status').textContent='浏览器未允许本地保存；当前页面仍保留地图，请勿刷新。';}};
  $('load-map').onclick=()=>{
    try{
      const raw=localStorage.getItem(storageKey);if(!raw){$('save-status').textContent='还没有保存的地图，请先布置并保存。';return;}
      const data=JSON.parse(raw);const clean=G.readDraft(data);
      rememberEdit();state=clean;moving=null;show('已读取本机地图，可撤销这次读取。');render();$('save-status').textContent='✓ 已读取保存的地图。';
    }catch(e){$('save-status').textContent='无法读取保存的地图，当前编辑未改变。';}
  };
  document.addEventListener('keydown',event=>{
    if(!editing||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'edit-redo':'edit-undo').onclick();}
    if(event.key==='Escape'){moving=null;render();}
  });
  render();
})();
