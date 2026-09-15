// M0 象棋战术游戏 —— 纯规则引擎（无 DOM、无渲染、无随机、无 IO）。
// 规则语义对齐 docs/design/m0-gdd.md；预测、将死分析与实际结算复用同一套函数。
// 浏览器中挂载全局 M0；Node 中以 CommonJS 导出（module.exports）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.M0 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = {
    width: 9, height: 10,
    kingHP: 3, enemyKingHP: 2,
    upgradeXP: [0, 2, 4], // 各等级累计 XP 门槛：Lv1=0, Lv2=2, Lv3=4
    reward: 2, price: 2,
    spawns: { king: { x: 4, y: 0 }, rook: { x: 0, y: 0 }, horse: { x: 2, y: 0 }, cannon: { x: 1, y: 2 } },
    // 波次配置：[棋种, x, y]，数组顺序即敌方公开执行顺序（GDD 6.1）
    waves: [
      [['pawn', 0, 3], ['pawn', 2, 5], ['cannon', 4, 6], ['king', 4, 9]],
      [['pawn', 4, 4], ['horse', 2, 6], ['cannon', 6, 6], ['rook', 0, 7], ['king', 4, 9]]
    ]
  };

  function unit(id, side, kind, x, y) {
    return {
      id: id, side: side, kind: kind, x: x, y: y,
      hp: kind === 'king' ? (side === 'player' ? CONFIG.kingHP : CONFIG.enemyKingHP) : 1,
      xp: 0, level: 1, acted: false
    };
  }

  function copy(s) { return JSON.parse(JSON.stringify(s)); }
  function same(a, b) { return a.x === b.x && a.y === b.y; }
  function at(s, p) {
    for (var i = 0; i < s.units.length; i++) if (same(s.units[i], p)) return s.units[i];
  }
  function king(s, side) {
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (u.side === side && u.kind === 'king') return u;
    }
  }
  function inside(p) {
    return Number.isInteger(p.x) && Number.isInteger(p.y) &&
      p.x >= 0 && p.x < CONFIG.width && p.y >= 0 && p.y < CONFIG.height;
  }

  // 同一行/列上从 a（不含）到 b（含）的棋位序列；不同行列返回空。
  function line(a, b) {
    if (a.x !== b.x && a.y !== b.y) return [];
    var dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y), out = [];
    for (var x = a.x + dx, y = a.y + dy; x !== b.x || y !== b.y; x += dx, y += dy) out.push({ x: x, y: y });
    out.push({ x: b.x, y: b.y });
    return out;
  }

  // 几何合法性：不检查行动次数。玩家操作、意图执行、将死分析共用（GDD 4.3）。
  function actionAt(s, u, to) {
    if (!inside(to) || same(u, to)) return;
    var target = at(s, to);
    if (target && target.side === u.side) return; // 不能落在友军位置、不能攻击友军
    var dx = to.x - u.x, dy = to.y - u.y, ax = Math.abs(dx), ay = Math.abs(dy);
    var path = [{ x: to.x, y: to.y }], valid = false;
    if (u.kind === 'king') {
      var cy = u.side === 'player' ? 1 : 8;
      var inPalace = function (p) { return p.x >= 3 && p.x <= 5 && Math.abs(p.y - cy) <= 1; };
      // 自定义九宫：横竖一步；斜步仅限中心与四角之间的米字连线（GDD 3.1）
      var diagonal = ax === 1 && ay === 1 && ((u.x === 4 && u.y === cy) || (to.x === 4 && to.y === cy));
      valid = inPalace(u) && inPalace(to) && (ax + ay === 1 || diagonal);
    } else if (u.kind === 'pawn') {
      // 仅敌方有卒：向 y 减小前进；过河（y<=4）后可横向一步，不能后退
      valid = (dx === 0 && dy === -1) || (u.y <= 4 && ax === 1 && dy === 0);
    } else if (u.kind === 'horse') {
      var leg = { x: u.x + (ax === 2 ? Math.sign(dx) : 0), y: u.y + (ay === 2 ? Math.sign(dy) : 0) };
      valid = ax * ay === 2 && !at(s, leg);
    } else if (u.kind === 'rook' || u.kind === 'cannon') {
      if (dx === 0 || dy === 0) {
        path = line(u, to);
        var blockers = path.slice(0, -1).map(function (p) { return at(s, p); }).filter(Boolean);
        if (u.kind === 'cannon') {
          // 炮：移动要求路径无阻挡；攻击要求恰好一个任意阵营炮架（GDD 3.2）
          valid = target ? blockers.length === 1 : blockers.length === 0;
        } else if (target) {
          // 车：普通移动不能越子。攻击时路径上不能有友军，且途中敌人+目标总数
          // 不超过等级上限（敌方车固定 Lv.1，等价于普通车吃子）。
          var enemies = blockers.every(function (v) { return v.side !== u.side; });
          valid = enemies && blockers.length + 1 <= u.level;
        } else {
          valid = blockers.length === 0;
        }
      }
    }
    if (valid) return {
      actor: u.id, from: { x: u.x, y: u.y }, to: { x: to.x, y: to.y },
      type: target ? 'attack' : 'move', path: path
    };
  }

  function legalActions(s, id) {
    var u = s.units.find(function (v) { return v.id === id; });
    if (!u) return [];
    var out = [];
    for (var y = 0; y < CONFIG.height; y++) for (var x = 0; x < CONFIG.width; x++) {
      var a = actionAt(s, u, { x: x, y: y });
      if (a) out.push(a);
    }
    return out;
  }

  // 敌方意图：基于同一棋盘快照独立决策，不模拟其他敌人（GDD 4.4）。
  // 无合法动作的敌人记为 standby（待机），仍占用公开序号。
  function generateIntents(s) {
    var commander = king(s, 'player');
    if (!commander) return [];
    var intents = [], order = 0;
    s.units.forEach(function (u) {
      if (u.side !== 'enemy') return;
      order++; // 公开执行序号按敌方在配置中的固定顺序分配（GDD 6.1）
      var actions = legalActions(s, u.id);
      var choice;
      if (actions.length) {
        var priority = function (a) {
          var t = at(s, a.to);
          return t ? (t.kind === 'king' ? 0 : t.kind === 'rook' ? 1 : 2) : 3;
        };
        var distance = function (a) {
          return Math.abs(a.to.x - commander.x) + Math.abs(a.to.y - commander.y);
        };
        actions.sort(function (a, b) {
          return priority(a) - priority(b) ||
            (a.type === 'move' && b.type === 'move' ? distance(a) - distance(b) : 0) ||
            a.to.y - b.to.y || a.to.x - b.to.x;
        });
        choice = Object.assign({}, actions[0], { order: order });
      } else {
        choice = {
          actor: u.id, from: { x: u.x, y: u.y }, to: { x: u.x, y: u.y },
          type: 'standby', path: [], order: order
        };
      }
      intents.push(choice);
    });
    return intents;
  }

  // 终局优先级：先判主帅阵亡（失败），再判敌将阵亡（当前波胜利）（GDD 5.3）。
  function terminal(s) {
    if (!king(s, 'player')) { s.phase = 'result'; s.result = 'dead'; }
    else if (!king(s, 'enemy')) {
      if (s.wave === 1) {
        s.phase = 'shop'; s.gold += CONFIG.reward;
        s.units = s.units.filter(function (u) { return u.side === 'player'; }); // 退场不算击杀
      } else { s.phase = 'result'; s.result = 'victory'; }
    }
    if (s.phase !== 'player') s.intents = [];
  }

  // 在状态 s 上原子结算动作 a（调用方保证 s 为可变副本）。
  function apply(s, a) {
    var u = s.units.find(function (v) { return v.id === a.actor; });
    var effect = { actor: u.id, to: { x: a.to.x, y: a.to.y }, victims: [], damage: [], status: 'success' };
    var targets;
    if (a.type === 'attack' && u.kind === 'rook') {
      // 车攻击沿路径由近到远结算（敌方车 Lv.1 时路径上仅有目标本身）
      targets = a.path.map(function (p) { return at(s, p); }).filter(Boolean);
    } else if (a.type === 'attack') {
      targets = [at(s, a.to)];
    } else {
      targets = [];
    }
    var stopped = false;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      t.hp--;
      effect.damage.push(t.id);
      if (t.hp <= 0) {
        s.units = s.units.filter(function (v) { return v.id !== t.id; });
        effect.victims.push(t.id);
        if (u.side === 'player') s.kills++;
      }
      if (t.kind === 'king') { stopped = true; break; } // 主帅/敌将受击即止，攻击者不前进
    }
    if (!stopped) { u.x = a.to.x; u.y = a.to.y; }
    effect.to = { x: u.x, y: u.y };
    if (u.side === 'player' && u.kind === 'rook') {
      u.xp += effect.victims.length; // 只有亲手击杀计入 XP
      u.level = 1 + CONFIG.upgradeXP.slice(1).filter(function (xp) { return u.xp >= xp; }).length;
      s.highestLevel = Math.max(s.highestLevel, u.level);
    }
    u.acted = true;
    // 行动者阵亡则删除其待执行意图
    s.intents = s.intents.filter(function (it) {
      return s.units.some(function (v) { return v.id === it.actor; });
    });
    terminal(s);
    return effect;
  }

  // 玩家提交动作：非法指令不消耗行动，返回原状态（GDD 3.3）。
  function submit(s, id, to) {
    var u = s.units.find(function (v) { return v.id === id; });
    if (s.phase !== 'player' || !u || u.side !== 'player' || u.acted) return { state: s };
    var a = actionAt(s, u, to);
    if (!a) return { state: s };
    var next = copy(s);
    return { state: next, effect: apply(next, a), action: a };
  }

  // 敌方阶段：按公开顺序逐条用实际棋盘复检并结算（GDD 4.2/4.3）。
  // 预测、将死分析叶节点与真实执行共用本函数。
  function enemyPhase(s) {
    var next = copy(s), effects = [];
    if (s.phase !== 'player') return { state: next, effects: effects };
    s.intents.forEach(function (intent) {
      if (next.phase !== 'player') return; // 波次结束/失败后停止剩余动作
      var u = next.units.find(function (v) { return v.id === intent.actor; });
      var failure = {
        actor: intent.actor, to: { x: intent.from.x, y: intent.from.y },
        victims: [], damage: [], status: u ? 'cancelled' : 'removed'
      };
      if (intent.type === 'standby') {
        effects.push({ actor: intent.actor, to: { x: intent.from.x, y: intent.from.y }, victims: [], damage: [], status: 'standby' });
        return;
      }
      if (!u || !same(u, intent.from)) { effects.push(failure); return; }
      var occupant = at(next, intent.to);
      if (intent.type === 'move' && occupant) { effects.push(failure); return; } // 目标被占则取消，不改攻击
      if (intent.type === 'attack' && u.kind === 'cannon' && !occupant) {
        // 炮目标变空：炮架恰好一个则原地打空，否则取消；均不移动、不换目标
        var blockers = line(u, intent.to).slice(0, -1).filter(function (p) { return at(next, p); });
        effects.push(Object.assign({}, failure, { status: blockers.length === 1 ? 'miss' : 'cancelled' }));
        return;
      }
      var a = actionAt(next, u, intent.to);
      if (!a) { effects.push(failure); return; }
      var effect = apply(next, a);
      if (intent.type === 'attack' && !occupant) effect.status = 'miss'; // 移到原目标位置 = 落空
      effects.push(effect);
    });
    return { state: next, effects: effects };
  }

  function endTurn(s) {
    if (s.phase !== 'player') return { state: s, effects: [] };
    var r = enemyPhase(s);
    var next = r.state;
    if (next.phase === 'player') {
      next.turn++;
      next.units.forEach(function (u) { u.acted = false; });
      next.intents = generateIntents(next);
    }
    return { state: next, effects: r.effects };
  }

  function buy(s, kind) {
    if (s.phase !== 'shop' || s.bought || s.gold < CONFIG.price ||
      (kind !== 'horse' && kind !== 'cannon')) return s;
    var next = copy(s), spawn = CONFIG.spawns[kind];
    next.gold -= CONFIG.price;
    next.bought = true;
    next.units.push(unit(kind, 'player', kind, spawn.x, spawn.y));
    return next;
  }

  function nextWave(s) {
    if (s.phase !== 'shop') return s;
    var next = copy(s);
    next.wave = 2;
    next.phase = 'player';
    next.units.forEach(function (u) {
      var p = CONFIG.spawns[u.kind];
      u.x = p.x; u.y = p.y; u.acted = false;
    });
    addWave(next);
    return next;
  }

  function newGame() {
    var s = {
      units: [unit('king', 'player', 'king', 4, 0), unit('rook', 'player', 'rook', 0, 0)],
      intents: [], phase: 'player', wave: 1, turn: 1,
      gold: 0, bought: false, kills: 0, highestLevel: 1, result: undefined
    };
    addWave(s);
    return s;
  }
  function addWave(s) {
    CONFIG.waves[s.wave - 1].forEach(function (w, i) {
      s.units.push(unit('w' + s.wave + '-' + i, 'enemy', w[0], w[1], w[2]));
    });
    s.intents = generateIntents(s);
  }

  // 将军提示：立即结束回合会使主帅受到至少 1 点伤害（GDD 5.1）。
  function dangerNow(s) {
    if (s.phase !== 'player') return false;
    var k = king(s, 'player');
    if (!k) return true;
    var r = enemyPhase(s);
    return r.effects.some(function (e) { return e.damage.indexOf(k.id) >= 0; });
  }

  // 预告将死分析：穷尽剩余己方行动的组合与顺序（GDD 5.1/5.2）。
  // 每节点 yield 一次，供浏览器按时间片运行；超时从不返回将死。
  // 调用方丢弃旧 generator 即可取消（重开后旧分析自然失效）。
  function* escapeAnalysis(s) {
    var visited = new Set(), nodes = 0;
    function* search(current, plan) {
      nodes++; yield;
      if (current.phase === 'shop' || current.result === 'victory') return plan; // 提前斩将结束当前波
      if (current.phase === 'result') return undefined;
      var resolved = enemyPhase(current).state; // 现在结束回合的敌方阶段
      if (king(resolved, 'player') && resolved.result !== 'dead') return plan; // 主帅可存活
      var key = JSON.stringify(current.units);
      if (visited.has(key)) return undefined;
      visited.add(key);
      var actors = current.units.filter(function (v) { return v.side === 'player' && !v.acted; });
      for (var i = 0; i < actors.length; i++) {
        var actions = legalActions(current, actors[i].id);
        for (var j = 0; j < actions.length; j++) {
          var a = actions[j];
          var found = yield* search(submit(current, a.actor, a.to).state, plan.concat([a]));
          if (found) return found;
        }
      }
      return undefined;
    }
    var plan = yield* search(s, []);
    return { safe: plan !== undefined, plan: plan || [], nodes: nodes };
  }

  function analyze(s) {
    var it = escapeAnalysis(s), step = it.next();
    while (!step.done) step = it.next();
    return step.value;
  }

  // 将死判定：穷尽后无存活/斩将方案才判负（GDD 5.1/5.2）。
  function checkmate(s) {
    if (s.phase !== 'player' || analyze(s).safe) return s;
    var next = copy(s);
    next.phase = 'result'; next.result = 'mate'; next.intents = [];
    return next;
  }

  // UI 预览：一次调用拿到动作、结算效果、后续敌方阶段预测，均不改动真实局面。
  function preview(s, id, to) {
    var r = submit(s, id, to);
    if (!r.effect) return null;
    return { action: r.action, effect: r.effect, state: r.state, prediction: enemyPhase(r.state) };
  }

  return {
    CONFIG: CONFIG, newGame: newGame, copy: copy, same: same, at: at, king: king, unit: unit,
    line: line, actionAt: actionAt, legalActions: legalActions, generateIntents: generateIntents,
    submit: submit, enemyPhase: enemyPhase, endTurn: endTurn, buy: buy, nextWave: nextWave,
    dangerNow: dangerNow, escapeAnalysis: escapeAnalysis, analyze: analyze, checkmate: checkmate,
    preview: preview
  };
});
