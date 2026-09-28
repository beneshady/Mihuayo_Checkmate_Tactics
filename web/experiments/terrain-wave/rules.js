/* 独立地形实验；不加载或修改主原型。坐标为玩家视角 1～9。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TerrainGame = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const names = { king: '帅', pawn: '兵', archer: '弓', spear: '枪', rook: '车', cannon: '炮', horse: '马', advisor: '士' };
  const copy = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const inside = p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 1 && p.x <= 9 && p.y >= 1 && p.y <= 9;
  const key = p => `${p.x},${p.y}`;
  const at = (s, p) => s.units.find(u => u.hp > 0 && same(u, p));
  const terrain = (s, p) => s.tiles[key(p)] ?? 'land';
  const mountain = (s, p) => typeof terrain(s, p) === 'number' && terrain(s, p) > 0;
  const occupied = (s, p) => !!at(s, p) || mountain(s, p);
  const fatalWater = u => ['pawn', 'archer', 'spear', 'cannon'].includes(u.kind);
  const name = u => u.side === 'enemy' && u.kind === 'king' ? '将' : names[u.kind];
  const label = u => `${u.side === 'player' ? '我方' : '敌方'}${name(u)}`;
  const cells = () => Array.from({ length: 81 }, (_, i) => ({ x: i % 9 + 1, y: Math.floor(i / 9) + 1 }));
  function unit(id, side, kind, x, y) {
    const hp = kind === 'king' ? (side === 'player' ? 3 : 2) : ['rook', 'cannon', 'spear'].includes(kind) ? 2 : 1;
    return { id, side, kind, x, y, hp, maxHp: hp, damage: ['cannon', 'archer'].includes(kind) ? 2 : 1,
      moved: false, attacked: false, range: side === 'player' && ['rook', 'archer', 'spear'].includes(kind) ? 3 : 1,
      push: side === 'player' && kind === 'rook', splash: [] };
  }
  function inPalace(u, p) { return p.x >= 4 && p.x <= 6 && (u.side === 'player' ? p.y >= 1 && p.y <= 3 : p.y >= 7 && p.y <= 9); }
  function stepShape(s, u, p) {
    const dx = p.x - u.x, dy = p.y - u.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (['pawn', 'archer', 'spear'].includes(u.kind)) return (dy === (u.side === 'player' ? 1 : -1) && dx === 0) || (dy === 0 && ax === 1);
    if (u.kind === 'horse') return ax * ay === 2 && !occupied(s, { x: u.x + (ax === 2 ? Math.sign(dx) : 0), y: u.y + (ay === 2 ? Math.sign(dy) : 0) });
    const cy = u.side === 'player' ? 2 : 8;
    const diagonal = ax === 1 && ay === 1 && ((u.x === 5 && u.y === cy) || (p.x === 5 && p.y === cy));
    return inPalace(u, p) && (u.kind === 'advisor' ? diagonal : ax + ay === 1 || diagonal);
  }
  function line(a, b) {
    if (same(a, b) || (a.x !== b.x && a.y !== b.y)) return [];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y), out = [];
    for (let x = a.x + dx, y = a.y + dy; ; x += dx, y += dy) { out.push({ x, y }); if (x === b.x && y === b.y) break; }
    return out;
  }
  function moveAction(s, u, p, enemy = false) {
    if (!inside(p) || same(u, p) || occupied(s, p)) return null;
    if (!enemy && (u.moved || u.attacked)) return null;
    let path;
    if (['rook', 'cannon'].includes(u.kind)) {
      path = line(u, p);
      if (!path.length || path.length > 3 || path.some(q => occupied(s, q))) return null;
    } else { if (!stepShape(s, u, p)) return null; path = [p]; }
    const drown = fatalWater(u) && path.find(q => terrain(s, q) === 'water');
    return { type: 'move', actor: u.id, to: p, path, drown: drown || null };
  }
  function attackAction(s, u, p, frozen = false) {
    if (!inside(p) || same(u, p)) return null;
    if (terrain(s, u) === 'water' && ['rook', 'horse'].includes(u.kind)) return null;
    if (!frozen && (u.attacked || (!['rook', 'cannon'].includes(u.kind) && u.moved))) return null;
    const target = at(s, p), rock = mountain(s, p), path = line(u, p);
    if (!frozen && target && target.side === u.side) return null;
    let targets = [];
    if (['archer', 'spear'].includes(u.kind)) {
      if (!path.length || path.length > u.range) return null;
      const dx = Math.sign(p.x - u.x), dy = Math.sign(p.y - u.y);
      for (let n = 1; n <= u.range; n++) {
        const q = { x: u.x + dx * n, y: u.y + dy * n };
        if (!inside(q)) break;
        const victim = at(s, q);
        if (victim && victim.side === u.side) break;
        if (victim || mountain(s, q)) targets.push(q);
        if (mountain(s, q) || (victim && u.kind === 'archer')) break;
      }
      if (!targets.length || !targets.some(q => same(q, p))) return null;
    } else if (u.kind === 'rook') {
      if (!path.length || path.length > u.range || path.slice(0, -1).some(q => occupied(s, q))) return null;
      targets = [p];
    } else if (u.kind === 'cannon') {
      if (!path.length || path.slice(0, -1).filter(q => occupied(s, q)).length !== 1 || (!frozen && !target && !rock)) return null;
      targets = [p, ...u.splash.map(d => ({ x: p.x + d.x, y: p.y + d.y }))].filter(inside);
    } else {
      if (!stepShape(s, u, p) || (!frozen && !target && !rock)) return null;
      targets = [p];
    }
    return { type: 'attack', actor: u.id, to: p, targets, path };
  }
  function note(s, text) { s.log.push(text); }
  function terminal(s) {
    if (!s.units.some(u => u.side === 'player' && u.kind === 'king' && u.hp > 0)) s.result = 'defeat';
    else if (!s.units.some(u => u.side === 'enemy' && u.kind === 'king' && u.hp > 0)) s.result = 'victory';
  }
  function died(s, u, killer, reason) {
    u.hp = 0;
    if (killer && killer.side === 'player' && u.side === 'enemy') s.kills++;
    note(s, `${label(u)}${reason}阵亡${killer && killer.side === 'player' && u.side === 'enemy' ? ` · 归${label(killer)}击杀（本实验无成长）` : ''}`);
  }
  function water(s, u, killer) {
    if (terrain(s, u) === 'water' && fatalWater(u)) { died(s, u, killer, '落水'); return true; }
    return false;
  }
  function execute(s, action, random = Math.random) {
    const u = s.units.find(v => v.id === action.actor && v.hp > 0);
    if (!u || s.result) return;
    if (action.type === 'move') {
      for (const p of action.path) { u.x = p.x; u.y = p.y; if (water(s, u, null)) break; }
      u.moved = true;
      note(s, `${label(u)}移动至 ${key(u)}`);
      terminal(s); return;
    }
    u.attacked = true; u.moved = true;
    const primary = at(s, action.to), rock = mountain(s, action.to);
    if (u.kind === 'rook') {
      const approach = primary || rock ? action.path.slice(0, -1) : action.path;
      for (const p of approach) {
        u.x = p.x; u.y = p.y;
        if (terrain(s, p) === 'water') { note(s, `${label(u)}冲击在 ${key(p)} 入水中断`); return; }
      }
    }
    // 先冻结受击集合，山或炮架的本次破坏不改变此次覆盖。
    const hits = action.targets.map(p => ({ p, victim: at(s, p), rock: mountain(s, p) }));
    let primaryHit = false;
    for (const hit of hits) {
      if (hit.rock) {
        s.tiles[key(hit.p)]--;
        note(s, `山 ${key(hit.p)} ${s.tiles[key(hit.p)] === 0 ? '坍塌为陆地' : '开裂 · 再命中一次坍塌'}`);
      }
      if (!hit.victim) continue;
      const victim = hit.victim;
      if (terrain(s, hit.p) === 'forest' && random() < 0.3) { note(s, `${label(victim)}借树林闪避 · 无伤害、无击退`); continue; }
      if (victim === primary) primaryHit = true;
      victim.hp -= u.damage;
      note(s, `${label(u)}命中${label(victim)}，伤害 ${u.damage}`);
      if (victim.hp <= 0) died(s, victim, u, '受击');
    }
    if (u.kind === 'rook' && primaryHit && primary) {
      if (primary.hp <= 0) { u.x = action.to.x; u.y = action.to.y; }
      else if (u.push) {
        const p = { x: primary.x + Math.sign(primary.x - u.x), y: primary.y + Math.sign(primary.y - u.y) };
        if (inside(p) && !occupied(s, p) && (!['king', 'advisor'].includes(primary.kind) || inPalace(primary, p))) {
          primary.x = p.x; primary.y = p.y;
          note(s, `${label(primary)}被震退至 ${key(p)}`); water(s, primary, u);
        } else note(s, '震退受阻 · 无额外伤害');
      }
    }
    // 拆山从不占位；环境击杀也不追位。
    s.units = s.units.filter(v => v.hp > 0);
    terminal(s);
  }
  function enemyChoice(s, u) {
    return s.units.filter(v => v.side === 'player' && v.hp > 0)
      .sort((a, b) => priority(a) - priority(b) || a.y - b.y || a.x - b.x)
      .map(v => attackAction(s, u, v, true)).find(Boolean);
  }
  function priority(u) { return u.kind === 'king' ? 0 : u.kind === 'rook' ? 1 : 2; }
  function prepare(s) {
    for (const u of s.units.filter(v => v.side === 'enemy' && v.hp > 0)) {
      if (enemyChoice(s, u)) continue;
      const king = s.units.find(v => v.side === 'player' && v.kind === 'king');
      if (!king) break;
      const choices = cells().map(p => moveAction(s, u, p, true)).filter(a => a && !a.drown);
      const distance = p => Math.abs(p.x - king.x) + Math.abs(p.y - king.y);
      choices.push({ type: 'stay', to: { x: u.x, y: u.y } });
      choices.sort((a, b) => distance(a.to) - distance(b.to) || a.to.y - b.to.y || a.to.x - b.to.x);
      if (choices[0].type === 'move') { u.x = choices[0].to.x; u.y = choices[0].to.y; }
    }
    s.intents = s.units.filter(u => u.side === 'enemy' && u.hp > 0).map((u, i) => {
      const a = enemyChoice(s, u);
      return { actor: u.id, name: name(u), order: i + 1, dx: a ? a.to.x - u.x : 0, dy: a ? a.to.y - u.y : 0, standby: !a };
    });
    for (const u of s.units) { u.moved = false; u.attacked = false; }
    note(s, `第 ${s.turn} 回合 · 敌方准备完毕，攻击方向已锁定`);
  }
  function intentAction(s, intent) {
    const u = s.units.find(v => v.id === intent.actor && v.hp > 0);
    if (!u) return { reason: '攻击者已阵亡' };
    if (intent.standby) return { reason: '待机（不补选动作）' };
    const to = { x: u.x + intent.dx, y: u.y + intent.dy };
    if (terrain(s, u) === 'water' && ['rook', 'horse'].includes(u.kind)) return { to, reason: '水中无法攻击' };
    const action = attackAction(s, u, to, true);
    return action ? { to, action } : { to, reason: '路径 / 炮架 / 走法失效' };
  }
  // 敌方至多 8 次单目标攻击，逐次枚举树林命中/闪避分支；不读取真实随机数。
  function forecast(s) {
    let branches = [copy(s)];
    const rows = [];
    for (const intent of s.intents) {
      const outcomes = new Set(), threat = new Set(), next = [];
      for (const branch of branches) {
        if (branch.result) { outcomes.add('此前已结束战斗'); next.push(branch); continue; }
        const info = intentAction(branch, intent);
        if (!info.action) { outcomes.add(info.reason); next.push(branch); continue; }
        const target = at(branch, info.to), rock = mountain(branch, info.to);
        const uncertain = target && terrain(branch, info.to) === 'forest';
        for (const roll of uncertain ? [0, 1] : [1]) {
          const b = copy(branch), count = b.log.length;
          execute(b, info.action, () => roll);
          const changed = b.log.slice(count);
          outcomes.add(changed.join('；') || (rock ? '命中山' : '落空'));
          threat.add(key(info.to)); next.push(b);
        }
      }
      rows.push({ ...intent, outcomes: [...outcomes], threat: [...threat], conditional: outcomes.size > 1 });
      branches = next;
    }
    return rows;
  }
  function endTurn(original, random = Math.random) {
    const s = copy(original);
    if (s.result) return s;
    for (const intent of s.intents) {
      const info = intentAction(s, intent);
      if (info.action) execute(s, info.action, random);
      else note(s, `敌方${intent.name}：${info.reason}`);
      if (s.result) break;
    }
    if (!s.result) { s.turn++; prepare(s); }
    return s;
  }
  function submit(original, id, to, mode, random = Math.random) {
    const s = copy(original), u = s.units.find(v => v.id === id && v.hp > 0 && v.side === 'player');
    if (!u || s.result) return null;
    const a = mode === 'move' ? moveAction(s, u, to) : attackAction(s, u, to);
    if (!a) return null;
    execute(s, a, random);
    return { state: s, action: a };
  }
  function createState(scenario = 'main', options = {}) {
    const s = { units: [], tiles: {}, turn: 1, kills: 0, result: null, log: [], intents: [], scenario };
    for (let x = 1; x <= 9; x++) s.tiles[`${x},5`] = [2, 5, 8].includes(x) ? 'bridge' : 'water';
    for (const [x, y] of [[3, 4], [7, 6], [3, 7], [7, 3]]) s.tiles[`${x},${y}`] = 2;
    for (const [x, y] of [[5, 6], [8, 6], [5, 4], [6, 7], [4, 3]]) s.tiles[`${x},${y}`] = 'forest';
    s.units = [unit('king', 'player', 'king', 5, 1), unit('rook', 'player', 'rook', 1, 1), unit('cannon', 'player', 'cannon', 2, 3),
      unit('pawn', 'player', 'pawn', 2, 4), unit('archer', 'player', 'archer', 5, 4), unit('spear', 'player', 'spear', 8, 4),
      ...[['pawn', 2, 6], ['pawn', 5, 6], ['pawn', 8, 6], ['rook', 9, 8], ['cannon', 2, 8], ['advisor', 4, 9], ['advisor', 6, 9], ['king', 5, 9]].map(([kind, x, y], i) => unit(`e${i}`, 'enemy', kind, x, y))];
    if (scenario !== 'main') {
      s.tiles = {}; s.units = [unit('king', 'player', 'king', 5, 1), unit('boss', 'enemy', 'king', 5, 9)];
      if (scenario === 'water') {
        s.tiles['4,5'] = 'water'; s.tiles['7,5'] = 'water';
        s.units.push(unit('rook', 'player', 'rook', 4, 8), unit('target', 'enemy', 'cannon', 4, 6), unit('pawn', 'player', 'pawn', 7, 4));
      } else if (scenario === 'mountain') {
        s.tiles['3,3'] = 2;
        s.units.push(unit('rook', 'player', 'rook', 1, 3), unit('archer', 'player', 'archer', 3, 2), unit('cannon', 'player', 'cannon', 3, 1), unit('target', 'enemy', 'rook', 3, 6));
      } else if (scenario === 'forest') {
        s.tiles['4,4'] = 'forest'; s.tiles['5,2'] = 'forest';
        s.units.push(unit('rook', 'player', 'rook', 2, 4), unit('target', 'enemy', 'rook', 4, 4), unit('guard', 'player', 'pawn', 5, 2), unit('lead', 'enemy', 'pawn', 5, 3), unit('shooter', 'enemy', 'cannon', 5, 5));
      }
      s.intents = s.units.filter(u => u.side === 'enemy').map((u, i) => ({ actor: u.id, name: name(u), order: i + 1, dx: 0, dy: u.id === 'shooter' ? -4 : u.id === 'lead' ? -1 : 0, standby: !['shooter', 'lead'].includes(u.id) }));
      note(s, '专项练习：首回合按展示布局开始；结束回合后恢复正常敌方准备。');
    } else if (!options.skipPrepare) prepare(s);
    return s;
  }
  function validateMap(s) {
    const errors = [];
    for (const side of ['player', 'enemy']) if (s.units.filter(u => u.side === side && u.kind === 'king').length !== 1) errors.push(`${side === 'player' ? '我方帅' : '敌方将'}必须恰好一枚。`);
    if (s.units.filter(u => u.side === 'enemy').length > 8) errors.push('本单波实验最多放置 8 枚敌人，以保持条件预览清晰。');
    if (new Set(s.units.map(key)).size !== s.units.length) errors.push('棋子不能重叠。');
    for (const u of s.units) {
      if (!inside(u)) errors.push(`${label(u)}在棋盘外。`);
      if (mountain(s, u)) errors.push(`${label(u)}不能放在山上。`);
      if (fatalWater(u) && terrain(s, u) === 'water') errors.push(`${label(u)}不能以入水即死的状态开局。`);
      if (['king', 'advisor'].includes(u.kind) && !inPalace(u, u)) errors.push(`${label(u)}须放在自己的九宫内。`);
    }
    for (const p of cells()) if (terrain(s, p) === 'water' && p.x >= 4 && p.x <= 6 && (p.y <= 3 || p.y >= 7)) errors.push(`九宫内 ${key(p)} 不能放水：将帅与士的入水规则尚未设计。`);
    return [...new Set(errors)];
  }
  function startMap(draft) {
    const errors = validateMap(draft);
    if (errors.length) throw new Error(errors.join('\n'));
    const s = copy(draft);
    s.turn = 1; s.kills = 0; s.result = null; s.log = []; s.intents = []; s.scenario = 'custom';
    for (const u of s.units) { u.moved = false; u.attacked = false; }
    prepare(s); return s;
  }
  function readDraft(data) {
    if(!data||data.version!==1||!data.map||!Array.isArray(data.map.units)||data.map.units.length>81||!data.map.tiles||typeof data.map.tiles!=='object') throw Error('地图格式不正确');
    const s={units:[],tiles:{},turn:1,kills:0,result:null,log:[],intents:[],scenario:'custom'};
    for(const [k,value] of Object.entries(data.map.tiles)){
      if(!/^[1-9],[1-9]$/.test(k)||!['land','bridge','water','forest',0,1,2].includes(value))throw Error('地形不正确');
      s.tiles[k]=value;
    }
    data.map.units.forEach((u,i)=>{
      if(!u||!['player','enemy'].includes(u.side)||!Object.hasOwn(names,u.kind)||!inside(u)||!Number.isInteger(u.hp)||u.hp<1||u.hp>99||!Number.isInteger(u.maxHp)||u.maxHp<u.hp||u.maxHp>99)throw Error('棋子不正确');
      const fresh=unit(`loaded-${i}`,u.side,u.kind,u.x,u.y);fresh.hp=u.hp;fresh.maxHp=u.maxHp;s.units.push(fresh);
    });
    if(new Set(s.units.map(key)).size!==s.units.length)throw Error('棋子重叠');
    return s;
  }
  return { copy, same, inside, key, at, terrain, mountain, occupied, name, label, cells, unit, line, moveAction, attackAction, execute, prepare, intentAction, forecast, endTurn, submit, createState, validateMap, startMap, readDraft };
});
