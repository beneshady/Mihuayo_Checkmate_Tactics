// M0 象棋战术游戏 —— three.js 表现层与交互。
// 依赖：vendor/three.min.js（全局 THREE）、js/rules.js（全局 M0）。
// 所有规则判定均通过 M0 完成；本文件只负责展示、点选、动画与输入锁。
(function () {
  'use strict';
  var R = window.M0;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 常量 ----------
  var CHARS = {
    player: { king: '帅', rook: '车', horse: '马', cannon: '炮' },
    enemy: { king: '将', rook: '车', horse: '马', cannon: '炮', pawn: '卒' }
  };
  var NAMES = {
    player: { king: '帅', rook: '车', horse: '马', cannon: '炮' },
    enemy: { king: '敌将', rook: '敌车', horse: '敌马', cannon: '敌炮', pawn: '卒' }
  };
  var FONT = '"KaiTi","STKaiti","SimSun",serif';
  var COLOR = {
    allyBody: 0xb03a2a, allyTop: '#f7ecd4', allyChar: '#a83200', allyRing: '#b03a2a',
    enemyBody: 0x2b3a4a, enemyTop: '#232f3d', enemyChar: '#e8c05a', enemyRing: '#d9a441',
    attack: 0xe05252, move: 0xe8c14a, cancel: 0x8a8f9a, path: 0x4a90d9,
    landing: 0x37c6d0, victim: 0xe05252, moveDot: 0x58c46a
  };

  // ---------- 游戏状态 ----------
  var state = R.newGame();
  var epoch = 0;                 // 重开代际：旧回调凭此作废
  var selection = null;          // 选中的己方单位 id
  var previewData = null;        // M0.preview 结果（{action,effect,state,prediction}）
  var paused = false;
  var locks = new Set();         // 输入锁原因：anim/analysis/pause/confirm/shop/result
  var analysisCache = new Map();
  var executedIntentArrows = []; // 敌方阶段执行时的高亮句柄

  function locked() { return locks.size > 0; }
  function lock(why) { locks.add(why); updateButtons(); }
  function unlock(why) { locks.delete(why); updateButtons(); }

  // ---------- three.js 基础 ----------
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c);
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  $('scene').appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.82));
  var sun = new THREE.DirectionalLight(0xfff2dd, 0.65);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  function world(p) { return { x: p.x - 4, z: 4.5 - p.y }; }
  function pos(gx, gy) { return { x: gx, y: gy }; }

  // ---------- 棋盘 ----------
  var CELL = 120, MARGIN = 55, BW = 1080, BH = 1200;
  function makeBoardTexture() {
    var cv = document.createElement('canvas');
    cv.width = BW; cv.height = BH;
    var c = cv.getContext('2d');
    var P = function (gx, gy) { return { x: MARGIN + gx * CELL, y: MARGIN + (9 - gy) * CELL }; };
    c.fillStyle = '#d8b277';
    c.fillRect(0, 0, BW, BH);
    // 木纹底色微渐变
    var g = c.createLinearGradient(0, 0, BW, BH);
    g.addColorStop(0, 'rgba(255,240,210,0.16)');
    g.addColorStop(1, 'rgba(90,60,30,0.10)');
    c.fillStyle = g; c.fillRect(0, 0, BW, BH);
    // 九宫底色（红方下 / 蓝方上）
    function palaceTint(x0, y0, color) {
      var a = P(x0, y0), b = P(x0 + 2, y0 + 2);
      c.fillStyle = color;
      c.fillRect(a.x - CELL / 2, b.y - CELL / 2, CELL * 3, CELL * 3);
    }
    palaceTint(3, 0, 'rgba(216,84,63,0.12)');
    palaceTint(3, 7, 'rgba(96,140,200,0.12)');
    // 河界带
    var rTop = P(0, 5), rBot = P(8, 4);
    c.fillStyle = 'rgba(70,110,160,0.10)';
    c.fillRect(P(0, 5).x - CELL / 2, P(0, 5).y - CELL / 2, CELL * 9, CELL);
    // 网格线
    c.strokeStyle = '#5a3d22'; c.lineWidth = 5; c.lineCap = 'round';
    for (var gy = 0; gy <= 9; gy++) {
      var h0 = P(0, gy), h1 = P(8, gy);
      c.beginPath(); c.moveTo(h0.x, h0.y); c.lineTo(h1.x, h1.y); c.stroke();
    }
    for (var gx = 0; gx <= 8; gx++) {
      if (gx === 0 || gx === 8) {
        var v0 = P(gx, 0), v1 = P(gx, 9);
        c.beginPath(); c.moveTo(v0.x, v0.y); c.lineTo(v1.x, v1.y); c.stroke();
      } else {
        var a1 = P(gx, 0), a2 = P(gx, 4), b1 = P(gx, 5), b2 = P(gx, 9);
        c.beginPath(); c.moveTo(a1.x, a1.y); c.lineTo(a2.x, a2.y); c.stroke();
        c.beginPath(); c.moveTo(b1.x, b1.y); c.lineTo(b2.x, b2.y); c.stroke();
      }
    }
    // 九宫米字线（对角线过中心）
    c.lineWidth = 4;
    [[3, 0, 5, 2], [5, 0, 3, 2], [3, 7, 5, 9], [5, 7, 3, 9]].forEach(function (seg) {
      var s = P(seg[0], seg[1]), e = P(seg[2], seg[3]);
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(e.x, e.y); c.stroke();
    });
    // 河界文字
    c.fillStyle = '#7a5a38';
    c.font = '600 62px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var mid = (P(0, 5).y + P(0, 4).y) / 2;
    c.fillText('楚 河', P(2, 0).x, mid);
    c.fillText('漢 界', P(6, 0).x, mid);
    // 外框
    c.strokeStyle = '#4a3018'; c.lineWidth = 12;
    c.strokeRect(P(0, 0).x - 24, P(0, 9).y - 24, CELL * 8 + 48, CELL * 9 + 48);
    c.lineWidth = 3;
    c.strokeRect(P(0, 0).x - 10, P(0, 9).y - 10, CELL * 8 + 20, CELL * 9 + 20);
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }
  var boardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(BW / CELL, BH / CELL),
    new THREE.MeshBasicMaterial({ map: makeBoardTexture() })
  );
  boardMesh.rotation.x = -Math.PI / 2;
  scene.add(boardMesh);
  var table = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 50),
    new THREE.MeshBasicMaterial({ color: 0x101218 })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.03;
  scene.add(table);

  // ---------- 贴图与精灵工具 ----------
  var textureCache = new Map();
  function cachedTexture(key, draw) {
    if (textureCache.has(key)) return textureCache.get(key);
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    draw(cv.getContext('2d'));
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    textureCache.set(key, tex);
    return tex;
  }
  function pieceTopTexture(u) {
    var ally = u.side === 'player';
    var lvTxt = u.kind === 'rook' && u.level > 1 ? (u.level === 2 ? '二' : '三') : '';
    return cachedTexture('top:' + u.side + ':' + u.kind + ':' + u.hp + ':' + lvTxt, function (c) {
      c.clearRect(0, 0, 256, 256);
      if (ally) {
        c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2);
        c.fillStyle = COLOR.allyTop; c.fill();
        c.lineWidth = 12; c.strokeStyle = COLOR.allyRing; c.stroke();
        c.lineWidth = 3;
        c.beginPath(); c.arc(128, 128, 98, 0, Math.PI * 2); c.stroke();
      } else {
        var r = 26;
        c.beginPath();
        c.moveTo(16 + r, 20); c.arcTo(240, 20, 240, 236, r); c.arcTo(240, 236, 16, 236, r);
        c.arcTo(16, 236, 16, 20, r); c.arcTo(16, 20, 240, 20, r); c.closePath();
        c.fillStyle = COLOR.enemyTop; c.fill();
        c.lineWidth = 9; c.strokeStyle = COLOR.enemyRing; c.stroke();
      }
      var ch = CHARS[u.side][u.kind];
      c.fillStyle = ally ? COLOR.allyChar : COLOR.enemyChar;
      c.font = '700 118px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ch, 128, ally ? 116 : 118);
      if (u.kind === 'king') { // 生命值点
        var maxHp = ally ? R.CONFIG.kingHP : R.CONFIG.enemyKingHP;
        var w = 30, x0 = 128 - (maxHp - 1) * w / 2;
        for (var i = 0; i < maxHp; i++) {
          c.beginPath(); c.arc(x0 + i * w, 214, 11, 0, Math.PI * 2);
          if (i < u.hp) { c.fillStyle = ally ? '#c0392b' : '#d9a441'; c.fill(); }
          else { c.lineWidth = 3; c.strokeStyle = ally ? '#c0392b' : '#d9a441'; c.stroke(); }
        }
      }
      if (lvTxt) { // 车等级徽记
        c.beginPath(); c.arc(206, 52, 27, 0, Math.PI * 2);
        c.fillStyle = '#a83200'; c.fill();
        c.fillStyle = '#ffe9c8';
        c.font = '700 34px ' + FONT;
        c.fillText(lvTxt, 206, 55);
      }
    });
  }
  function badgeTexture(text, bg, fg) {
    return cachedTexture('bd:' + text + ':' + bg + ':' + fg, function (c) {
      c.clearRect(0, 0, 256, 256);
      c.beginPath(); c.arc(128, 128, 108, 0, Math.PI * 2);
      c.fillStyle = bg; c.fill();
      c.lineWidth = 10; c.strokeStyle = fg; c.stroke();
      c.fillStyle = fg;
      c.font = '700 ' + (text.length > 1 ? 86 : 120) + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, 128, text.length > 1 ? 140 : 136);
    });
  }
  function makeSprite(text, bg, fg, scale) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: badgeTexture(text, bg, fg), transparent: true, depthTest: false
    }));
    sp.scale.setScalar(scale || 0.5);
    sp.renderOrder = 30;
    return sp;
  }

  // ---------- 棋子视图 ----------
  var pieceLayer = new THREE.Group();
  var fxLayer = new THREE.Group();
  var arrowLayer = new THREE.Group();
  arrowLayer.position.y = 0.035; // 抬高避免与棋盘平面深度冲突
  var hlLayer = new THREE.Group();
  scene.add(pieceLayer, fxLayer, arrowLayer, hlLayer);
  var views = new Map(); // id -> { group, mats:[side,top,bottom], actedRing }

  function buildView(u) {
    var group = new THREE.Group();
    var ally = u.side === 'player';
    var geo = new THREE.CylinderGeometry(0.42, 0.44, 0.24, ally ? 36 : 4, 1);
    if (!ally) geo.rotateY(Math.PI / 4); // 敌方为方形棋子（非颜色区分）
    var side = new THREE.MeshLambertMaterial({ color: ally ? COLOR.allyBody : COLOR.enemyBody });
    var top = new THREE.MeshBasicMaterial({ map: pieceTopTexture(u) });
    var bottom = new THREE.MeshLambertMaterial({ color: ally ? 0x8a2a1c : 0x1c2836 });
    var mesh = new THREE.Mesh(geo, [side, top, bottom]);
    mesh.position.y = 0.13;
    group.add(mesh);
    var pick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.47, 0.8, 10),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })
    );
    pick.position.y = 0.4;
    pick.userData.unitId = u.id;
    group.add(pick);
    var actedRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 28),
      new THREE.MeshBasicMaterial({ color: 0x6a6f7a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    actedRing.rotation.x = -Math.PI / 2;
    actedRing.position.y = 0.015;
    actedRing.visible = false;
    group.add(actedRing);
    var w = world(u);
    group.position.set(w.x, 0, w.z);
    pieceLayer.add(group);
    var view = { group: group, mats: [side, top, bottom], actedRing: actedRing, pick: pick, baseColor: ally ? COLOR.allyBody : COLOR.enemyBody };
    views.set(u.id, view);
    refreshView(u, view);
    return view;
  }
  function refreshView(u, view) {
    view = view || views.get(u.id);
    if (!view) return;
    view.mats[1].map = pieceTopTexture(u);
    view.mats[1].needsUpdate = true;
    var acted = u.side === 'player' && u.acted;
    view.actedRing.visible = !!acted;
    view.mats.forEach(function (m) {
      m.transparent = !!acted;
      m.opacity = acted ? 0.45 : 1;
    });
    var w = world(u);
    view.group.position.set(w.x, 0, w.z);
  }
  function disposeView(id) {
    var v = views.get(id);
    if (!v) return;
    pieceLayer.remove(v.group);
    v.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    });
    views.delete(id);
  }
  function rebuildPieces() {
    Array.from(views.keys()).forEach(disposeView);
    state.units.forEach(buildView);
  }

  // ---------- 平面几何工具（箭头 / 路径条，直接用世界坐标构造，避免旋转歧义） ----------
  function quad(a, b, width, color, opacity) {
    var dx = b.x - a.x, dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return null;
    var px = -dz / len * width / 2, pz = dx / len * width / 2;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      a.x + px, 0, a.z + pz, b.x + px, 0, b.z + pz, b.x - px, 0, b.z - pz,
      a.x + px, 0, a.z + pz, b.x - px, 0, b.z - pz, a.x - px, 0, a.z - pz
    ], 3));
    var m = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 1 : opacity,
      side: THREE.DoubleSide, depthWrite: false
    });
    var mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 10;
    return mesh;
  }
  function tri(tip, dir, size, color, opacity) {
    var l = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    var ux = dir.x / l, uz = dir.z / l;
    var px = -uz, pz = ux;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      tip.x, 0, tip.z,
      tip.x - ux * size + px * size * 0.62, 0, tip.z - uz * size + pz * size * 0.62,
      tip.x - ux * size - px * size * 0.62, 0, tip.z - uz * size - pz * size * 0.62
    ], 3));
    var m = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 1 : opacity,
      side: THREE.DoubleSide, depthWrite: false
    });
    var mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 10;
    return mesh;
  }
  function flatDisc(p, r, color, opacity, inner) {
    var geo = inner == null ? new THREE.CircleGeometry(r, 32) : new THREE.RingGeometry(inner, r, 32);
    var m = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 0.9 : opacity,
      side: THREE.DoubleSide, depthWrite: false
    });
    var mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    var w = world(p);
    mesh.position.set(w.x, 0.02 + Math.random() * 0.004, w.z);
    mesh.renderOrder = 8;
    return mesh;
  }
  function clearGroup(g) {
    for (var i = g.children.length - 1; i >= 0; i--) {
      var o = g.children[i];
      g.remove(o);
      o.traverse(function (x) {
        if (x.geometry) x.geometry.dispose();
        if (x.material && !Array.isArray(x.material)) x.material.dispose();
      });
    }
  }

  // ---------- 敌方意图箭头 ----------
  // predicted: M0.enemyPhase(局面).effects，与 state.intents 逐条对齐（GDD 4.3：预测/结算同一实现）
  function rebuildIntents(displayState, predicted) {
    clearGroup(arrowLayer);
    executedIntentArrows = [];
    displayState.intents.forEach(function (intent, i) {
      var eff = predicted[i];
      var status = eff ? eff.status : 'cancelled';
      var unit = displayState.units.find(function (u) { return u.id === intent.actor; });
      if (!unit) return;
      var grp = new THREE.Group();
      var color = intent.type === 'attack' ? COLOR.attack : COLOR.move;
      var dead = status === 'cancelled' || status === 'removed';
      var whiff = status === 'miss';
      var col = dead ? COLOR.cancel : color;
      var op = dead ? 0.55 : 0.92;
      if (intent.type !== 'standby' && !(intent.from.x === intent.to.x && intent.from.y === intent.to.y)) {
        var a = world(intent.from), b = world(intent.to);
        var dx = b.x - a.x, dz = b.z - a.z;
        var len = Math.sqrt(dx * dx + dz * dz);
        var ux = dx / len, uz = dz / len;
        var start = { x: a.x + ux * 0.52, z: a.z + uz * 0.52 };
        var end = { x: b.x - ux * 0.3, z: b.z - uz * 0.3 };
        if (dead || whiff) { // 虚线
          var segs = 4, gap = (len - 0.82) / segs / 5;
          for (var s = 0; s < segs; s++) {
            var t0 = s / segs, t1 = t0 + 1 / segs - gap / Math.max(len - 0.82, 0.01);
            var m0 = { x: start.x + (end.x - start.x) * t0, z: start.z + (end.z - start.z) * t0 };
            var m1 = { x: start.x + (end.x - start.x) * Math.max(t1, t0 + 0.05), z: start.z + (end.z - start.z) * Math.max(t1, t0 + 0.05) };
            var q = quad(m0, m1, 0.1, col, op);
            if (q) grp.add(q);
          }
        } else {
          var q2 = quad(start, end, 0.13, col, op);
          if (q2) grp.add(q2);
        }
        if (!dead) grp.add(tri(b, { x: dx, z: dz }, 0.34, col, op));
      }
      var badge = intent.type === 'standby'
        ? makeSprite('休', '#3a4050', '#c8cede', 0.46)
        : makeSprite(String(intent.order), dead ? '#4a4f58' : '#5a3530', dead ? '#c8cede' : '#ffd27a', 0.5);
      var bw = world(intent.from);
      badge.position.set(bw.x, 0.62, bw.z);
      grp.add(badge);
      if (dead) {
        var xx = makeSprite('✗', 'rgba(0,0,0,0)', '#e05252', 0.5);
        var xw = world(intent.to);
        xx.position.set(xw.x, 0.18, xw.z);
        grp.add(xx);
      } else if (whiff) {
        var wm = makeSprite('空', 'rgba(0,0,0,0)', '#e8c14a', 0.44);
        var ww = world(intent.to);
        wm.position.set(ww.x, 0.18, ww.z);
        grp.add(wm);
      }
      arrowLayer.add(grp);
      executedIntentArrows.push({ group: grp, baseOp: op });
    });
  }
  function markIntentDone(i, ok) {
    var h = executedIntentArrows[i];
    if (!h) return;
    h.group.traverse(function (o) {
      if (o.material) o.material.opacity = ok ? 0.4 : 0.28;
    });
  }
  function pulseIntent(i, on) {
    var h = executedIntentArrows[i];
    if (!h) return;
    h.group.traverse(function (o) {
      if (o.material && !o.isSprite) o.material.opacity = on ? 1 : h.baseOp;
    });
  }

  // ---------- 选中与预览高亮 ----------
  var legalCache = null; // {id, actions}
  function refreshHighlights() {
    clearGroup(hlLayer);
    legalCache = null;
    if (!selection || state.phase !== 'player') return;
    var u = state.units.find(function (x) { return x.id === selection; });
    if (!u || u.side !== 'player') { selection = null; return; }
    var ring = flatDisc(u, 0.56, 0xe8c14a, 0.95, 0.46);
    hlLayer.add(ring);
    if (u.acted) { legalCache = { id: u.id, actions: [] }; return; } // 已行动：仅查看
    var actions = R.legalActions(state, u.id);
    legalCache = { id: u.id, actions: actions };
    actions.forEach(function (a) {
      var isMove = a.type === 'move';
      hlLayer.add(flatDisc(a.to, isMove ? 0.2 : 0.42, isMove ? COLOR.moveDot : COLOR.victim,
        isMove ? 0.85 : 0.95, isMove ? null : 0.3));
    });
  }
  function drawPreviewFx(pd) {
    clearGroup(fxLayer);
    // 路径（含目标），蓝色细条
    var from = world(pd.action.from);
    pd.action.path.forEach(function (p) {
      var q = quad(from, world(p), 0.06, COLOR.path, 0.95);
      if (q) { q.position.y = 0.05; fxLayer.add(q); }
      from = world(p);
    });
    // 落点
    fxLayer.add(flatDisc(pd.effect.to, 0.3, COLOR.landing, 1, 0.18));
    // 受害者（击杀）与伤害标记：执行前局面中的位置
    pd.effect.victims.forEach(function (id) {
      var u = state.units.find(function (x) { return x.id === id; });
      if (!u) return;
      fxLayer.add(flatDisc(u, 0.42, COLOR.victim, 1, 0.3));
      var sp = makeSprite('杀', 'rgba(0,0,0,0)', '#ff8f8f', 0.5);
      var w = world(u);
      sp.position.set(w.x, 0.5, w.z);
      fxLayer.add(sp);
    });
    pd.effect.damage.forEach(function (id) {
      if (pd.effect.victims.indexOf(id) >= 0) return;
      var u = state.units.find(function (x) { return x.id === id; });
      if (!u) return;
      var sp = makeSprite('−1', 'rgba(0,0,0,0)', '#ffb24a', 0.5);
      var w = world(u);
      sp.position.set(w.x, 0.55, w.z);
      fxLayer.add(sp);
    });
    // 车被将/帅挡停：在起点标“停”
    if (pd.action.type === 'attack' && pd.action.actor === 'rook' &&
      pd.effect.to.x === pd.action.from.x && pd.effect.to.y === pd.action.from.y) {
      var sp2 = makeSprite('停', 'rgba(0,0,0,0)', '#4a90d9', 0.5);
      var w2 = world(pd.action.from);
      sp2.position.set(w2.x, 0.55, w2.z);
      fxLayer.add(sp2);
    }
  }

  // ---------- 临时精灵（漂浮提示） ----------
  var tempSprites = [];
  function popup(text, p, color, ttl) {
    var sp = makeSprite(text, 'rgba(20,22,30,0.85)', color, 0.62);
    var w = world(p);
    sp.position.set(w.x, 0.9, w.z);
    fxLayer.add(sp);
    tempSprites.push({ sp: sp, age: 0, ttl: ttl || 900 });
  }
  function updateTempSprites(dt) {
    for (var i = tempSprites.length - 1; i >= 0; i--) {
      var t = tempSprites[i];
      t.age += dt;
      t.sp.position.y = 0.9 + t.age / t.ttl * 0.35;
      t.sp.material.opacity = Math.max(0, 1 - t.age / t.ttl);
      if (t.age >= t.ttl) {
        fxLayer.remove(t.sp);
        tempSprites.splice(i, 1);
      }
    }
  }

  // ---------- 动画队列 ----------
  var animQueue = [];
  var animCur = null;
  var drainedCb = null;
  function setDrained(fn) {
    drainedCb = fn;
    if (!animQueue.length && !animCur) { // 队列本就为空时立即结算，避免回调悬挂
      setTimeout(drainNotify, 0);
    }
  }
  function clearAnim() { animQueue.length = 0; animCur = null; drainedCb = null; }
  function qMove(id, from, to, dur) {
    animQueue.push({ kind: 'move', id: id, from: world(from), to: world(to), dur: dur || 260, t: 0 });
  }
  function qKill(id) { animQueue.push({ kind: 'kill', id: id, t: 0, dur: 300 }); }
  function qDamage(id) { animQueue.push({ kind: 'damage', id: id, t: 0, dur: 340 }); }
  function qWait(ms) { animQueue.push({ kind: 'wait', t: 0, dur: ms }); }
  function qFn(fn) { animQueue.push({ kind: 'fn', fn: fn }); }
  function pumpAnim(dt) {
    if (!animCur && animQueue.length) {
      animCur = animQueue.shift();
      animCur.t = 0;
      if (animCur.kind === 'fn') { animCur.fn(); animCur = null; if (!animQueue.length) drainNotify(); return; }
    }
    if (!animCur) return;
    animCur.t += dt;
    var k = Math.min(1, animCur.t / animCur.dur);
    var v = views.get(animCur.id);
    if (animCur.kind === 'move' && v) {
      var e = k * k * (3 - 2 * k);
      v.group.position.x = animCur.from.x + (animCur.to.x - animCur.from.x) * e;
      v.group.position.z = animCur.from.z + (animCur.to.z - animCur.from.z) * e;
      v.group.position.y = Math.sin(e * Math.PI) * 0.22;
    } else if (animCur.kind === 'kill' && v) {
      v.group.scale.setScalar(1 + 0.3 * k);
      v.group.rotation.z = k * 0.6;
      v.mats.forEach(function (m) { m.transparent = true; m.opacity = 1 - k; });
      v.actedRing.visible = false;
    } else if (animCur.kind === 'damage' && v) {
      var flash = Math.sin(k * Math.PI);
      v.mats[0].color.setHex(v.baseColor).lerp(new THREE.Color(0xff4040), flash * 0.85);
      v.group.position.y = Math.sin(k * Math.PI * 3) * 0.03;
    }
    if (k >= 1) {
      if (animCur.kind === 'kill') disposeView(animCur.id);
      if (animCur.kind === 'damage' && v) {
        v.mats[0].color.setHex(v.baseColor);
        v.group.position.y = 0;
      }
      animCur = null;
      if (!animQueue.length) drainNotify();
    }
  }
  function drainNotify() {
    var cb = drainedCb;
    drainedCb = null;
    if (cb) cb();
  }

  // ---------- HUD 与面板 ----------
  function updateHUD() {
    $('wave').textContent = state.wave;
    $('turn').textContent = state.turn;
    var k = R.king(state, 'player'), b = R.king(state, 'enemy');
    renderPips($('king-hp'), k ? k.hp : 0, R.CONFIG.kingHP, 'ally');
    renderPips($('boss-hp'), b ? b.hp : 0, R.CONFIG.enemyKingHP, 'enemy');
    var rook = state.units.find(function (u) { return u.side === 'player' && u.kind === 'rook'; });
    if (rook) {
      $('rook-lv').textContent = 'Lv.' + rook.level;
      var next = rook.level === 1 ? 2 : rook.level === 2 ? 4 : null;
      $('rook-xp').textContent = next ? 'XP ' + rook.xp + '/' + next : 'XP MAX';
    } else {
      $('rook-lv').textContent = '阵亡';
      $('rook-xp').textContent = '';
    }
    $('gold').textContent = state.gold;
    $('kills').textContent = state.kills;
  }
  function renderPips(el, hp, max, cls) {
    el.innerHTML = '';
    for (var i = 0; i < max; i++) {
      var d = document.createElement('span');
      d.className = 'pip ' + cls + (i < hp ? ' on' : '');
      el.appendChild(d);
    }
  }
  function updateAllyList() {
    var el = $('ally-list');
    el.innerHTML = '';
    state.units.filter(function (u) { return u.side === 'player'; }).forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'unit-row ally' + (u.id === selection ? ' cur' : '');
      var info = NAMES.player[u.kind] + ' (' + u.x + ',' + u.y + ')';
      if (u.kind === 'king') info += ' HP ' + u.hp;
      if (u.kind === 'rook') info += ' Lv.' + u.level + ' XP' + u.xp;
      row.innerHTML = '<span class="icon">' + CHARS.player[u.kind] + '</span><span>' + info + '</span>' +
        (u.acted ? '<span class="acted-tag">已行动</span>' : '');
      el.appendChild(row);
    });
  }
  function statusText(intent, eff, st) {
    var nameOf = function (id) {
      var u = st.units.find(function (x) { return x.id === id; });
      if (u) return NAMES[u.side][u.kind];
      // 可能已被击杀：从意图路径反查不可靠，直接标注
      return '单位';
    };
    switch (eff.status) {
      case 'standby': return '<span class="st-standby">待机（无合法动作）</span>';
      case 'removed': return '<span class="st-removed">取消（行动者已阵亡）</span>';
      case 'cancelled': return '<span class="st-cancelled">取消（条件失效）</span>';
      case 'miss':
        var moved = !(eff.to.x === intent.from.x && eff.to.y === intent.from.y);
        return '<span class="st-miss">落空' + (moved ? '·移至 (' + eff.to.x + ',' + eff.to.y + ')' : '·原地打空') + '</span>';
      default:
        if (eff.victims.length) return '<span class="st-success">命中·击杀 ' + eff.victims.map(nameOf).join('、') + '</span>';
        if (eff.damage.length) return '<span class="st-success">命中·' + eff.damage.map(nameOf).join('、') + ' −1</span>';
        return '<span class="st-success">' + (intent.type === 'attack' ? '将执行攻击' : '将移动') + '</span>';
    }
  }
  function updateIntentPanel(displayState, predicted) {
    var el = $('intent-list');
    el.innerHTML = '';
    if (displayState.phase !== 'player') return;
    displayState.intents.forEach(function (intent, i) {
      var eff = predicted[i];
      if (!eff) return;
      var unit = displayState.units.find(function (u) { return u.id === intent.actor; });
      if (!unit) return;
      var row = document.createElement('div');
      row.className = 'intent-row';
      var act = intent.type === 'standby' ? '待机' :
        (intent.type === 'attack' ? '攻击' : '移动') + '→(' + intent.to.x + ',' + intent.to.y + ')';
      row.innerHTML = '<span class="num">' + intent.order + '</span>' +
        NAMES.enemy[unit.kind] + '(' + intent.from.x + ',' + intent.from.y + ') ' + act +
        '<br>' + statusText(intent, eff, displayState);
      el.appendChild(row);
    });
  }
  function updatePreviewBox() {
    var box = $('preview-box');
    if (!previewData) {
      if (selection) {
        var u = state.units.find(function (x) { return x.id === selection; });
        if (u) {
          var desc = { king: '九宫内横竖一步或米字斜步；受击不吸引敌人前进。', rook: '直线移动/攻击；按等级最多贯穿 1/2/3 个直线敌人，遇将帅造成 1 伤并停在起点。', horse: '日字移动，怕马腿。', cannon: '直线移动；攻击需恰好一个炮架。' }[u.kind];
          box.innerHTML = '<span class="title">' + NAMES.player[u.kind] + '</span>（' + u.x + ',' + u.y + '）' +
            (u.acted ? ' <span style="color:#9aa0b0">已行动，本回合不能再提交动作</span>' : '') + '<br>' + desc;
          return;
        }
      }
      box.innerHTML = '点选我方棋子后选择目标，这里会显示路径、伤害与敌方威胁变化。';
      return;
    }
    var pd = previewData;
    var u = state.units.find(function (x) { return x.id === pd.action.actor; });
    var lines = [];
    var actDesc = pd.action.type === 'attack' ? '攻击' : '移动';
    lines.push('<span class="title">' + (u ? NAMES.player[u.kind] : '') + ' (' + pd.action.from.x + ',' + pd.action.from.y +
      ')→(' + pd.action.to.x + ',' + pd.action.to.y + ') ' + actDesc + '</span>');
    if (pd.effect.victims.length) lines.push('击杀：' + pd.effect.victims.length + ' 个单位');
    if (pd.effect.damage.length > pd.effect.victims.length) lines.push('对将/帅造成 1 点伤害（攻击者停在起点）');
    lines.push('动作后落点：(' + pd.effect.to.x + ',' + pd.effect.to.y + ')');
    var kingDanger = false;
    var k = R.king(state, 'player');
    pd.prediction.effects.forEach(function (e) {
      if (k && e.damage.indexOf(k.id) >= 0) kingDanger = true;
    });
    if (kingDanger) lines.push('<span class="warn">⚠ 执行后敌方阶段：主帅将受到伤害！</span>');
    else lines.push('执行后敌方阶段：主帅无直接伤害');
    var rook2 = pd.state.units.find(function (x) { return x.id === 'rook' && x.side === 'player'; });
    if (rook2 && u && u.id === 'rook' && rook2.level > u.level)
      lines.push('🔥 升级至 Lv.' + rook2.level + '（本次攻击范围不变）');
    box.innerHTML = lines.join('<br>');
  }
  function updateDanger() {
    var el = $('banner');
    el.className = ''; el.style.display = 'none';
    if (state.phase !== 'player') return;
    var danger;
    if (previewData) {
      var k = R.king(state, 'player');
      danger = k && previewData.prediction.effects.some(function (e) { return e.damage.indexOf(k.id) >= 0; });
    } else danger = R.dangerNow(state);
    if (danger) {
      el.className = 'danger';
      el.textContent = previewData ? '⚠ 预览：执行后主帅将受到伤害（可考虑其他方案）' : '⚠ 将军：现在结束回合，主帅将受到伤害';
      el.style.display = 'block';
    }
  }
  function updateButtons() {
    var inPlayer = state.phase === 'player' && !locked() && !paused;
    $('btn-execute').disabled = !(inPlayer && previewData);
    $('btn-cancel').disabled = !(inPlayer && (selection || previewData));
    $('btn-end').disabled = !(state.phase === 'player' && !locked() && !paused);
    $('btn-pause').disabled = paused || state.phase === 'result';
  }
  function showBannerInfo(text) {
    var el = $('banner');
    el.className = 'info';
    el.textContent = text;
    el.style.display = 'block';
  }
  function hideBanner() {
    var el = $('banner');
    el.className = ''; el.style.display = 'none';
  }

  // ---------- 局面刷新 ----------
  function predictEffects(s) {
    if (s.phase !== 'player' || !s.intents.length) return [];
    return R.enemyPhase(s).effects;
  }
  function refreshAll() {
    updateHUD();
    updateAllyList();
    var pred = predictEffects(state);
    rebuildIntents(state, pred);
    updateIntentPanel(state, pred);
    refreshHighlights();
    updatePreviewBox();
    updateDanger();
    updateButtons();
  }

  // ---------- 将死分析（分帧，GDD 5.2） ----------
  var analysisRunning = false;
  function stateKey(s) { return JSON.stringify([s.units, s.intents]); }
  function runAnalysis() {
    if (state.phase !== 'player') { updateButtons(); return; }
    var key = stateKey(state);
    if (analysisCache.has(key)) { finishAnalysis(analysisCache.get(key)); return; }
    var myEpoch = epoch;
    analysisRunning = true;
    lock('analysis');
    showBannerInfo('分析局势…');
    var it = R.escapeAnalysis(state);
    function slice() {
      if (myEpoch !== epoch) return; // 旧局作废，静默停止
      if (paused) { setTimeout(slice, 90); return; }
      var t0 = performance.now(), step;
      do { step = it.next(); } while (!step.done && performance.now() - t0 < 12);
      if (step.done) { analysisCache.set(key, step.value); finishAnalysis(step.value); }
      else setTimeout(slice, 0);
    }
    function finishAnalysis(res) {
      analysisRunning = false;
      unlock('analysis');
      if (myEpoch !== epoch) return;
      if (!res.safe) {
        state = R.checkmate(state); // 判将死（analyze 内部复用缓存语义一致）
        hideBanner();
        refreshAll();
        showResult();
      } else {
        updateDanger();
        updateButtons();
      }
    }
    setTimeout(slice, 0);
  }

  // ---------- 交互：点选 ----------
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var hoverCell = null;
  var hoverMarker = flatDisc({ x: -9, y: -9 }, 0.24, 0xffffff, 0.35, 0.12);
  hoverMarker.visible = false;
  scene.add(hoverMarker);

  function pickAt(ev) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var picks = [];
    views.forEach(function (v) { picks.push(v.pick); });
    picks.push(boardMesh);
    var hits = raycaster.intersectObjects(picks, false);
    if (!hits.length) return null;
    var h = hits[0];
    if (h.object.userData.unitId) {
      return { unitId: h.object.userData.unitId };
    }
    var x = h.point.x, z = h.point.z;
    var gx = Math.round(x + 4), gy = Math.round(4.5 - z);
    if (gx < 0 || gx > 8 || gy < 0 || gy > 9) return null;
    if (Math.abs(x - (gx - 4)) > 0.42 || Math.abs(z - (4.5 - gy)) > 0.42) return null;
    return { cell: { x: gx, y: gy } };
  }
  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (locked() || paused) return;
    if (state.phase !== 'player') return;
    var hit = pickAt(ev);
    if (!hit) { clearPreview(true); return; }
    if (hit.unitId) {
      var u = state.units.find(function (x) { return x.id === hit.unitId; });
      if (!u) return;
      if (u.side === 'player') {
        if (selection !== u.id) { selection = u.id; clearPreview(false); }
        else clearPreview(false); // 再点自己：保持选中
        refreshAll();
        return;
      }
      // 敌方棋子：若为当前合法攻击目标则进入预览，否则仅提示
      tryPreview(u);
      return;
    }
    if (hit.cell) {
      var cu = R.at(state, hit.cell);
      if (cu && cu.side === 'player') { selection = cu.id; clearPreview(false); refreshAll(); return; }
      tryPreview({ x: hit.cell.x, y: hit.cell.y });
      return;
    }
  }
  function tryPreview(target) {
    if (!selection) return;
    var to = target.x != null ? target : null;
    var cu = to ? R.at(state, to) : target;
    if (!to) to = { x: cu.x, y: cu.y };
    if (!legalCache || legalCache.id !== selection) return;
    var ok = legalCache.actions.some(function (a) { return a.to.x === to.x && a.to.y === to.y; });
    if (!ok) {
      var u = state.units.find(function (x) { return x.id === selection; });
      if (cu && cu.side === 'enemy' && u) {
        updatePreviewBoxInfoEnemy(cu);
      } else clearPreview(true);
      return;
    }
    var pd = R.preview(state, selection, to);
    if (!pd) { clearPreview(true); return; }
    previewData = pd;
    drawPreviewFx(pd);
    var pred = pd.prediction.effects;
    rebuildIntents(pd.state, pred);
    updateIntentPanel(pd.state, pred);
    updatePreviewBox();
    updateDanger();
    updateButtons();
  }
  function updatePreviewBoxInfoEnemy(cu) {
    var box = $('preview-box');
    var desc = {
      king: '敌将：2 HP；受击不吸引攻击者前进。斩杀即获胜/结束本波。',
      rook: '敌车：直线攻击，固定一级（单目标）。',
      horse: '敌马：日字移动，注意马腿。',
      cannon: '敌炮：需恰好一个炮架才能攻击。',
      pawn: '敌卒：只能向我校前进；过河后可横走。'
    }[cu.kind];
    box.innerHTML = '<span class="title">' + NAMES.enemy[cu.kind] + '</span>（' + cu.x + ',' + cu.y + '）HP ' + cu.hp + '<br>' + desc +
      '<br><span style="color:#9aa0b0">点选我方棋子后可选择目标。</span>';
  }
  function clearPreview(clearSelectionToo) {
    previewData = null;
    clearGroup(fxLayer);
    tempSprites.length = 0;
    if (clearSelectionToo) selection = null;
    refreshHighlights();
    updatePreviewBox();
    if (state.phase === 'player') {
      var pred = predictEffects(state);
      rebuildIntents(state, pred);
      updateIntentPanel(state, pred);
    }
    updateDanger();
    updateButtons();
    updateAllyList();
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', function (ev) {
    if (locked() || paused || state.phase !== 'player') { hoverMarker.visible = false; return; }
    var hit = pickAt(ev);
    if (hit && hit.cell) {
      var w = world(hit.cell);
      hoverMarker.visible = true;
      hoverMarker.position.set(w.x, 0.03, w.z);
    } else hoverMarker.visible = false;
  });
  renderer.domElement.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    if (!locked() && !paused) clearPreview(true);
  });

  // ---------- 动作提交 ----------
  function executePreview() {
    if (!previewData || locked() || paused || state.phase !== 'player') return;
    var pd = previewData;
    var actorId = pd.action.actor;
    var before = state;
    state = pd.state;
    previewData = null;
    selection = null;
    clearGroup(fxLayer);
    tempSprites.length = 0;
    lock('anim');
    hideBanner();
    // 动画：伤害闪烁 → 击杀淡出 → 攻击者移动
    pd.effect.damage.forEach(function (id) { qDamage(id); });
    pd.effect.victims.forEach(function (id) { qKill(id); });
    if (!(pd.effect.to.x === pd.action.from.x && pd.effect.to.y === pd.action.from.y)) {
      qMove(actorId, pd.action.from, pd.effect.to, 300);
    }
    qWait(120);
    var myEpoch = epoch;
    setDrained(function () {
      if (myEpoch !== epoch) return;
      unlock('anim');
      rebuildPieces();
      if (state.phase === 'shop') { showShop(); return; }
      if (state.phase === 'result') { showResult(); return; }
      refreshAll();
      runAnalysis(); // 分析完成后解锁输入
    });
  }

  // ---------- 结束回合与敌方阶段 ----------
  function requestEndTurn() {
    if (state.phase !== 'player' || locked() || paused) return;
    clearPreview(false);
    var unacted = state.units.filter(function (u) { return u.side === 'player' && !u.acted; });
    if (unacted.length) {
      $('confirm-text').innerHTML = '仍有 <b style="color:var(--accent)">' + unacted.length + '</b> 枚未行动单位（' +
        unacted.map(function (u) { return NAMES.player[u.kind]; }).join('、') + '）。<br>确定要结束回合吗？';
      $('ov-confirm').classList.add('show');
      lock('confirm');
      return;
    }
    doEndTurn();
  }
  function doEndTurn() {
    if (state.phase !== 'player' || locked() && !locks.has('confirm')) return;
    unlock('confirm');
    $('ov-confirm').classList.remove('show');
    if (state.phase !== 'player') return;
    hideBanner();
    clearPreview(true);
    lock('anim');
    var myEpoch = epoch;
    var prevIntents = state.intents;
    var result = R.endTurn(state);
    var prevState = state;
    state = result.state;
    var effects = result.effects;
    // 顺序动画：逐条意图高亮 → 结算表现
    effects.forEach(function (eff, i) {
      var intent = prevIntents[i];
      if (!intent) return;
      qFn(function () { pulseIntent(i, true); });
      qWait(300);
      qFn(function () {
        pulseIntent(i, false);
        var st = eff.status;
        if (st === 'cancelled') popup('✗', intent.from, '#c8cede');
        else if (st === 'miss') popup('空', intent.from, '#e8c14a');
        else if (st === 'standby') popup('休', intent.from, '#c8cede');
      });
      if (eff.status === 'success' || eff.status === 'miss') {
        eff.damage.forEach(function (id) {
          if (eff.victims.indexOf(id) < 0) qDamage(id);
        });
        eff.victims.forEach(function (id) { qKill(id); });
        if (!(eff.to.x === intent.from.x && eff.to.y === intent.from.y)) {
          qMove(intent.actor, intent.from, eff.to, 300);
        }
      }
      qFn(function () { markIntentDone(i, eff.status === 'success'); });
      qWait(160);
    });
    qWait(250);
    setDrained(function () {
      if (myEpoch !== epoch) return;
      unlock('anim');
      rebuildPieces();
      if (state.phase === 'shop') { showShop(); return; }
      if (state.phase === 'result') { showResult(); return; }
      refreshAll();
      runAnalysis();
    });
  }

  // ---------- 商店 ----------
  function refreshShop() {
    $('shop-gold').textContent = state.gold;
    var bought = state.bought || state.gold < R.CONFIG.price;
    $('btn-buy-horse').disabled = bought;
    $('btn-buy-cannon').disabled = bought;
    $('btn-buy-horse').textContent = state.bought ? '已购买' : '购 买';
    $('btn-buy-cannon').textContent = state.bought ? '已购买' : '购 买';
    $('good-horse').classList.toggle('sold', state.bought);
    $('good-cannon').classList.toggle('sold', state.bought);
    var rows = state.units.filter(function (u) { return u.side === 'player'; }).map(function (u) {
      var info = CHARS.player[u.kind] + ' ' + NAMES.player[u.kind];
      if (u.kind === 'king') info += '：HP ' + u.hp;
      if (u.kind === 'rook') info += '：Lv.' + u.level + '（XP ' + u.xp + '）';
      return info;
    });
    $('shop-team').innerHTML = '存活队伍：<br>' + rows.join('<br>');
  }
  function showShop() {
    clearPreview(true);
    clearAnim();
    unlock('anim');
    rebuildPieces();
    updateHUD(); // 顶部金币/波次等随入店刷新
    refreshShop();
    $('ov-shop').classList.add('show');
    lock('shop');
    updateButtons();
  }
  function buy(kind) {
    if (state.phase !== 'shop' || state.bought || state.gold < R.CONFIG.price) return; // 防连点/负余额
    state = R.buy(state, kind);
    refreshShop();
  }

  // ---------- 结果 ----------
  function showResult() {
    clearPreview(true);
    clearAnim();
    unlock('anim');
    hideBanner();
    rebuildPieces();
    clearGroup(arrowLayer);
    updateHUD();
    var t = $('result-title');
    if (state.result === 'victory') {
      t.textContent = '胜 利';
      t.className = '';
      $('result-text').textContent = '第二波敌将已被斩杀，全军退散。';
    } else if (state.result === 'mate') {
      t.textContent = '将 死';
      t.className = 'lose';
      $('result-text').textContent = '穷尽所有剩余行动，均无法让主帅在敌方阶段后存活。';
    } else {
      t.textContent = '主帅阵亡';
      t.className = 'lose';
      $('result-text').textContent = '主帅生命值归零。';
    }
    $('result-stats').innerHTML =
      '到达波次：<b>' + state.wave + ' / 2</b><br>' +
      '历经回合：<b>' + state.turn + '</b><br>' +
      '总击杀：<b>' + state.kills + '</b><br>' +
      '车最高等级：<b>Lv.' + state.highestLevel + '</b>';
    $('ov-result').classList.add('show');
    lock('result');
    updateButtons();
  }

  // ---------- 重开 ----------
  function startNewGame() {
    epoch++;
    clearAnim();
    clearPreview(true);
    paused = false;
    locks.clear();
    analysisCache.clear();
    ['ov-shop', 'ov-result', 'ov-pause', 'ov-confirm'].forEach(function (id) {
      $(id).classList.remove('show');
    });
    state = R.newGame();
    selection = null;
    previewData = null;
    hideBanner();
    clearGroup(arrowLayer);
    clearGroup(fxLayer);
    tempSprites.length = 0;
    rebuildPieces();
    refreshAll();
    runAnalysis();
  }

  // ---------- 按钮绑定 ----------
  $('btn-execute').addEventListener('click', executePreview);
  $('btn-cancel').addEventListener('click', function () { if (!locked() && !paused) clearPreview(true); });
  $('btn-end').addEventListener('click', requestEndTurn);
  $('btn-pause').addEventListener('click', function () {
    if (paused) return;
    paused = true;
    lock('pause');
    $('ov-pause').classList.add('show');
    updateButtons();
  });
  $('btn-resume').addEventListener('click', function () {
    if (!paused) return;
    paused = false;
    unlock('pause');
    $('ov-pause').classList.remove('show');
    updateButtons();
  });
  $('btn-confirm-yes').addEventListener('click', doEndTurn);
  $('btn-confirm-no').addEventListener('click', function () {
    unlock('confirm');
    $('ov-confirm').classList.remove('show');
  });
  $('btn-buy-horse').addEventListener('click', function () { buy('horse'); });
  $('btn-buy-cannon').addEventListener('click', function () { buy('cannon'); });
  $('btn-next-wave').addEventListener('click', function () {
    if (state.phase !== 'shop') return;
    unlock('shop');
    $('ov-shop').classList.remove('show');
    lock('anim');
    var myEpoch = epoch;
    state = R.nextWave(state);
    clearGroup(arrowLayer);
    clearGroup(fxLayer);
    rebuildPieces();
    refreshAll();
    runAnalysis();
    unlock('anim');
  });
  $('btn-restart-1').addEventListener('click', startNewGame);
  $('btn-restart-2').addEventListener('click', startNewGame);
  $('btn-help').addEventListener('click', function () {
    var el = $('help-text');
    var show = el.style.display === 'none';
    el.style.display = show ? 'block' : 'none';
    $('btn-help').textContent = show ? '收起' : '展开';
  });

  // ---------- 相机与自适应 ----------
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    var aspect = w / h;
    var pull = Math.max(1, 1.25 / aspect); // 窄屏拉远，保证棋盘完整（不绑定特定分辨率）
    camera.position.set(0, 13.2 * pull, 11.8 * pull);
    camera.lookAt(0, 0, 0.35);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', layout);

  // ---------- 主循环 ----------
  var lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(now - lastT, 80);
    lastT = now;
    if (!paused) {
      pumpAnim(dt);
      updateTempSprites(dt);
      if (selection && !locked() && state.phase === 'player') {
        // 选中环呼吸
        hlLayer.children.forEach(function (o) {
          if (o.geometry && o.geometry.type === 'RingGeometry' && o.material.color.getHex() === 0xe8c14a) {
            o.material.opacity = 0.7 + 0.25 * Math.sin(now / 260);
          }
        });
      }
    }
    renderer.render(scene, camera);
  }

  // ---------- 启动 ----------
  layout();
  rebuildPieces();
  refreshAll();
  runAnalysis();
  requestAnimationFrame(frame);
})();
