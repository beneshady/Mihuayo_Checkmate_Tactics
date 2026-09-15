// Headless UI 集成测试：在 Node 中以桩 DOM / 桩 WebGLRenderer 加载真实
// three.js + rules.js + app.js，用真实射线数学模拟鼠标点选，把两条通关回放
// 完整通过 UI 打一遍（选子→预览→执行→结束回合→商店→第二波→胜利→重开）。
// 这是对“浏览器试玩”的自动化替代；真实浏览器中的渲染效果仍需人工试玩确认。
// 运行：node tests/ui-headless.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', 'web');
const VIEW_W = 1280, VIEW_H = 800;

// ---------- DOM / Canvas 桩 ----------
function makeCtx2d() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'canvas') return null;
      return noop;
    },
    set() { return true; }
  });
}
function makeCanvasEl() {
  const el = makeElement('canvas');
  el.width = 300; el.height = 150;
  el.getContext = () => makeCtx2d();
  return el;
}
function makeElement(id) {
  const classes = new Set();
  const e = {
    id, listeners: {}, children: [], classes, style: {},
    textContent: '', disabled: false, className: '',
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, f) => { (f === undefined ? !classes.has(c) : f) ? classes.add(c) : classes.delete(c); },
      contains: c => classes.has(c)
    },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    appendChild(c) { this.children.push(c); return c; },
    getBoundingClientRect() { return { left: 0, top: 0, width: VIEW_W, height: VIEW_H }; }
  };
  let html = '';
  Object.defineProperty(e, 'innerHTML', {
    get: () => html,
    set: v => { html = v; e.children.length = 0; } // 真浏览器中重写 innerHTML 会清空子节点
  });
  return e;
}
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const elements = {};
for (const m of html.matchAll(/id="([^"]+)"/g)) elements[m[1]] = makeElement(m[1]);
const el = id => {
  if (!elements[id]) throw new Error('缺少 DOM id: ' + id);
  return elements[id];
};
const overlayShown = id => el(id).classList.contains('show');

let rafCb = null;
global.document = {
  getElementById: id => el(id),
  createElement: tag => (tag === 'canvas' ? makeCanvasEl() : makeElement('dyn-' + tag))
};
global.window = global;
global.innerWidth = VIEW_W;
global.innerHeight = VIEW_H;
global.addEventListener = (t, f) => { (global.__winListeners = global.__winListeners || {})[t] = f; };
global.requestAnimationFrame = fn => { rafCb = fn; };

// ---------- 加载真实脚本 ----------
const THREE = require(path.join(WEB, 'vendor/three.min.js'));
global.THREE = THREE;
// WebGLRenderer 桩：仅替代 GPU 渲染，保留矩阵更新以驱动射线拾取
THREE.WebGLRenderer = function () {
  this.domElement = makeCanvasEl();
  global.__rendererCanvas = this.domElement;
  this.setPixelRatio = () => {};
  this.setSize = () => {};
  this.render = (scene, camera) => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  };
};
global.M0 = require(path.join(WEB, 'js/rules.js'));
require(path.join(WEB, 'js/app.js'));

// 与 app.js 完全一致的相机参数（用于把棋位换算为像素坐标）
const cam = new THREE.PerspectiveCamera(42, VIEW_W / VIEW_H, 0.1, 100);
function syncCamera() {
  cam.aspect = global.innerWidth / global.innerHeight;
  const pull = Math.max(1, 1.25 / cam.aspect);
  cam.position.set(0, 13.2 * pull, 11.8 * pull);
  cam.lookAt(0, 0, 0.35);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
}
syncCamera();

// ---------- 驱动工具 ----------
let vnow = 0;
const tick = () => new Promise(r => setTimeout(r, 0));
async function pumpFrames(ms, step = 80) {
  for (let t = 0; t < ms; t += step) {
    vnow += step;
    const cb = rafCb; rafCb = null;
    if (cb) cb(vnow);
    await tick();
  }
}
async function waitIdle(timeoutMs = 60000) {
  let waited = 0;
  while (waited < timeoutMs) {
    if (overlayShown('ov-shop') || overlayShown('ov-result')) return;
    if (el('btn-end').disabled === false) return;
    await pumpFrames(160);
    waited += 160;
  }
  throw new Error('waitIdle 超时：游戏未回到可操作状态');
}
function pixelOf(gx, gy) {
  const v = new THREE.Vector3(gx - 4, 0, 4.5 - gy).project(cam);
  return { clientX: (v.x + 1) / 2 * VIEW_W, clientY: (1 - v.y) / 2 * VIEW_H };
}
async function clickCell(gx, gy) {
  const p = pixelOf(gx, gy);
  const canvas = global.__rendererCanvas;
  assert.ok(canvas, '渲染器画布未创建');
  for (const f of canvas.listeners['pointerdown']) f({ button: 0, clientX: p.clientX, clientY: p.clientY });
  await tick();
}
async function clickBtn(id) {
  assert.ok(el(id).listeners['click'], '按钮未绑定事件: ' + id);
  for (const f of el(id).listeners['click']) f();
  await tick();
}
function intentRows() { return el('intent-list').children.filter(c => (c.className || '').includes('intent-row')).length; }
function allyRows() { return el('ally-list').children.filter(c => (c.className || '').includes('unit-row')).length; }

function assertHUD(mirror, note) {
  assert.equal(String(el('wave').textContent), String(mirror.wave), note + ' wave');
  assert.equal(String(el('turn').textContent), String(mirror.turn), note + ' turn');
  assert.equal(String(el('gold').textContent), String(mirror.gold), note + ' gold');
  assert.equal(String(el('kills').textContent), String(mirror.kills), note + ' kills');
  const k = M0.king(mirror, 'player');
  const onPips = el('king-hp').children.filter(c => (c.className || '').includes(' on')).length;
  assert.equal(onPips, k ? k.hp : 0, note + ' king hp');
  const r = mirror.units.find(u => u.id === 'rook');
  assert.equal(String(el('rook-lv').textContent), r ? 'Lv.' + r.level : '阵亡', note + ' rook lv');
  assert.equal(intentRows(), mirror.intents.length, note + ' intent rows');
  assert.equal(allyRows(), mirror.units.filter(u => u.side === 'player').length, note + ' ally rows');
}

async function playThroughUI(branch) {
  const replay = require(`./replays/${branch}.json`);
  let mirror = M0.newGame();
  await waitIdle();
  assertHUD(mirror, '初始');
  let pausedChecked = false;
  for (let i = 0; i < replay.length; i++) {
    const step = replay[i];
    if (step.buy) {
      assert.ok(overlayShown('ov-shop'), '步骤' + i + ' 应显示商店');
      assert.ok(mirror.highestLevel >= 2, '首波应已升级');
      await clickBtn('btn-buy-' + step.buy);
      mirror = M0.buy(mirror, step.buy);
      assert.equal(String(el('shop-gold').textContent), String(mirror.gold), '购买后余额');
      assert.equal(el('btn-buy-horse').disabled, true, '重复购买应禁用');
      assert.equal(el('btn-buy-cannon').disabled, true, '重复购买应禁用');
      await clickBtn('btn-next-wave');
      mirror = M0.nextWave(mirror);
      await waitIdle();
      assertHUD(mirror, '进入第二波');
      continue;
    }
    if (step.end) {
      await clickBtn('btn-end');
      if (overlayShown('ov-confirm')) {
        assert.ok(mirror.units.some(u => u.side === 'player' && !u.acted), '确认框只应在有未行动单位时出现');
        await clickBtn('btn-confirm-yes');
      }
      mirror = M0.endTurn(mirror).state;
      await waitIdle();
      assertHUD(mirror, '回合' + mirror.turn);
      if (!pausedChecked && mirror.turn >= 2) { // 中途验证暂停/继续不产生额外行动
        pausedChecked = true;
        await clickBtn('btn-pause');
        assert.ok(overlayShown('ov-pause'));
        await pumpFrames(1200);
        assert.equal(String(el('turn').textContent), String(mirror.turn), '暂停期间回合不得变化');
        await clickBtn('btn-resume');
        await waitIdle();
        assertHUD(mirror, '暂停后');
      }
      continue;
    }
    // 玩家动作：点选棋子 → 点目标 → 执行
    const actor = mirror.units.find(u => u.id === step.actor);
    assert.ok(actor, '回放中的单位应存活: ' + step.actor);
    await clickCell(actor.x, actor.y);
    await clickCell(step.to.x, step.to.y);
    assert.equal(el('btn-execute').disabled, false, '预览后执行应可用');
    await clickBtn('btn-execute');
    const mv = M0.submit(mirror, step.actor, step.to);
    assert.ok(mv.effect, '回放动作应合法');
    mirror = mv.state;
    await waitIdle();
    assertHUD(mirror, '步骤' + i);
  }
  assert.ok(overlayShown('ov-result'), '应显示结果页');
  assert.equal(String(el('result-title').textContent), '胜 利');
  assert.ok(el('result-stats').innerHTML.includes('Lv.3'), '结果应含最高等级 Lv.3');
  // 重开三次：不残留单位、金币、动作（GDD 8.2）
  for (let r = 0; r < 3; r++) {
    await clickBtn('btn-restart-2');
    mirror = M0.newGame();
    await waitIdle();
    assertHUD(mirror, '重开' + (r + 1));
    assert.equal(allyRows(), 2, '重开后应为初始两枚己方单位');
    assert.equal(intentRows(), 4, '重开后应重建第一波意图');
  }
  // 暂停菜单内重开
  await clickBtn('btn-pause');
  await clickBtn('btn-restart-1');
  await waitIdle();
  assert.equal(String(el('turn').textContent), '1');
  assert.equal(String(el('wave').textContent), '1');
  assert.equal(String(el('gold').textContent), '0');
}

test('horse 分支：UI 全流程通关（点选/预览/执行/结束/暂停/重开）', async () => {
  await playThroughUI('horse');
});
test('cannon 分支：UI 全流程通关（含商店购买与部署）', async () => {
  await playThroughUI('cannon');
});
