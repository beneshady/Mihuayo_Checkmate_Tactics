// 一次性补丁：US-022 象模式接入 app.js 的预览/点选/悬停路径。
const fs = require('node:fs');
const p = 'web/js/app.js';
let t = fs.readFileSync(p, 'utf8');
function rep(a, b, n = 1) {
  const c = t.split(a).length - 1;
  if (c !== n) { console.error('anchor count', c, 'expected', n); console.error(a); process.exit(1); }
  t = t.split(a).join(b);
}
rep(
  "return R.preview(state,u.id,p,u.kind==='rook'?rookMode:u.kind==='horse'?horseMode:undefined)}",
  "return R.preview(state,u.id,p,modeOf(u))}"
);
rep(
  "const action=R.actionAt(state,u,p,u.kind==='rook'?rookMode:u.kind==='horse'?horseMode:undefined);",
  "const action=R.actionAt(state,u,p,modeOf(u));"
);
rep(
  "const reason=R.actionReason(state,u.id,p,u.kind==='rook'?rookMode:u.kind==='horse'?horseMode:undefined);",
  "const reason=R.actionReason(state,u.id,p,modeOf(u));"
);
rep(
  "key=`${selected}:${rookMode}:${horseMode}:${interactionRevision}:${p?point(p):''}`;",
  "key=`${selected}:${rookMode}:${horseMode}:${elephantMode}:${interactionRevision}:${p?point(p):''}`;"
);
// 牵引模式：点选友军/尸体目标不再改为选中该棋子。
rep(
  "const t=R.at(state,p);if(t&&t.side==='player'&&!(u.kind==='rook'&&rookMode==='pull')){select(t.id);return}",
  "const t=R.at(state,p);if(t&&t.side==='player'&&!(u.kind==='rook'&&rookMode==='pull')&&!elephantSkillMode(u)){select(t.id);return}"
);
rep(
  "if(u.side==='player'&&!(selected&&G(selected)?.rookRole==='pull'&&rookMode==='pull'&&u.id!==selected)){select(u.id);return}",
  "if(u.side==='player'&&!(selected&&G(selected)?.rookRole==='pull'&&rookMode==='pull'&&u.id!==selected)&&!(selected&&elephantSkillMode(G(selected))&&u.id!==selected)){select(u.id);return}"
);
// 施法动作按攻击类走教学闸门（教学关无象，仅保持分类一致）。
rep(
  "const gateKind=['directional','attack','horse-jump'].includes(preview.action.type)?'attack':'move';",
  "const gateKind=['directional','attack','horse-jump','elephant-pull','elephant-freeze'].includes(preview.action.type)?'attack':'move';"
);
fs.writeFileSync(p, t);
console.log('patched app.js interaction paths');
