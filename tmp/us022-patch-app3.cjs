// 一次性补丁：US-022 象技能预览文案（牵引轨迹/落点/碰撞/入水/山，冰封范围/时长/待机）。
const fs = require('node:fs');
const p = 'web/js/app.js';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a.slice(0, 160)); process.exit(1); }
  t = t.split(a).join(b);
}
// 动作类型名称
rep(
  "charges:'冲击',directional:'方向攻击','rook-move':'普通移动','horse-jump':'跳跃攻击','charge-corpse':'冲锋推尸',pull:'牵引','pull-corpse':'牵引尸体','pull-collision':'贴身强拉'}",
  "charges:'冲击',directional:'方向攻击','rook-move':'普通移动','horse-jump':'跳跃攻击','charge-corpse':'冲锋推尸',pull:'牵引','pull-corpse':'牵引尸体','pull-collision':'贴身强拉','elephant-pull':'象 · 牵引','elephant-freeze':'象 · 冰封'}",
  0
);
rep(
  "types={move:'移动',attack:'攻击',charge:'冲击',directional:'方向攻击','rook-move':'普通移动','horse-jump':'跳跃攻击','charge-corpse':'冲锋推尸',pull:'牵引','pull-corpse':'牵引尸体','pull-collision':'贴身强拉'}",
  "types={move:'移动',attack:'攻击',charge:'冲击',directional:'方向攻击','rook-move':'普通移动','horse-jump':'跳跃攻击','charge-corpse':'冲锋推尸',pull:'牵引','pull-corpse':'牵引尸体','pull-collision':'贴身强拉','elephant-pull':'象 · 牵引','elephant-freeze':'象 · 冰封'}"
);
// 象预览文案：接在马的预览块之后
rep(
  "const hits=e.hits.length?e.hits.map(h=>hitHTML(h)+(e.landings||[]).filter(l=>l.id===h.id).map(l=>`<small>结算落点 ${point(l.to)}${l.dead?'（阵亡）':''}</small>`).join('')).join(''):'<span class=\"empty\">无伤害</span>';",
  "let elephant='';if(a.type==='elephant-pull'){const pl=e.pull||{},tgt=G(pl.targetId)||R.corpseAt(state,a.to),from=pl.from||a.to,to=pl.to||a.to,status={success:'位移，无碰撞则无伤害',outside:'棋盘外，停止','half':'敌方半场限制，停止且不造成碰撞伤害','water-death':'首个水格致死，牵引终止','water-destroyed':'尸体入水销毁，牵引终止','collision-live':'撞活体：双方各 −1，停止','collision-corpse':'撞尸体：目标 −1，尸体保留，停止','collision-mountain':'撞山：目标 −1，山一次受击，停止','collision-corpse-corpse':'尸体撞尸体：仅停止，无伤害'};elephant=`<br>牵引目标 ${pl.kind==='corpse'?'尸体':'单位'} ${esc(pl.targetId||'')} @ ${point(a.to)} · 实际距离 ${a.distance} 格 → 计划位移 ${pl.steps} 格（floor(距离/2)）<br>起点 ${point(from)} · 预计落点 ${point(to)} · 实际位移 ${pl.moved||0} 格<br>结算：${status[pl.status]||pl.status||'无目标'}${e.waterDeaths&&e.waterDeaths.length?`<br><span class=\"warn\">入水：${e.waterDeaths.map(esc).join('、')}（无尸体；归施法象击杀）</span>`:''}`;}if(a.type==='elephant-freeze'){const fz=e.freeze||{},target=G(a.targetId);elephant=`<br>冰封目标 ${target?`${target.side==='player'?'友军':'敌军'}${unitName(target)}`:'敌人'} @ ${point(a.to)} · 冻结 ${fz.duration||a.duration} 个敌方行动阶段（原剩余 ${fz.before||0}）<br>范围：以自身为中心 5×5（横纵差各 ≤2，可跨河、不受遮挡）· 无直接伤害<br>敌方阶段将显示“待机”并跳过行动；受伤立即解冻但本回合仍待机`;}"
);
rep(
  "${charge||`：${point(a.from)} → ${point(a.to)}`}${cannon}${horse}",
  "${charge||`：${point(a.from)} → ${point(a.to)}`}${cannon}${horse}${elephant}"
);
// 山体坍塌文案：碎石地
rep(
  "${p.after==='cracked'?'开裂（再命中一次坍塌）':'坍塌为陆地'}",
  "${p.after==='cracked'?'开裂（再命中一次坍塌为碎石地）':'坍塌为碎石地（等同陆地、可通行、不作炮架）'}"
);
fs.writeFileSync(p, t);
console.log('patched app.js preview text');
