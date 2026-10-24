// 更新 US-021 文档中的步数、截图数与哈希（不作为交付物）。
const fs=require('fs');
const p='docs/us/US-021-horse-jump-skills.md';
let c=fs.readFileSync(p,'utf8');
function rep(a,b){if(!c.includes(a))throw Error('miss: '+a.slice(0,60));c=c.split(a).join(b);}
rep('`browser-result.json` + 27 张关键截图','`browser-result.json` + 29 张关键截图');
rep(
"| H01 | 规则定向 + 浏览器专项/正常入口 | 普通移动不结算伤害/山体；先移后跳可击杀；跳跃后普通移动按钮禁用且强制点击无变化；同回合不能二次跳跃；下一回合两额度恢复 | `us021-horse.test.cjs` H01；browser `H01-界面`、`H01-专项界面`（`h01-move-then-jump.png`）、`H20-5/6` |",
"| H01 | 规则定向 + 浏览器专项/正常入口 | 普通移动不结算伤害/山体；先移后跳可击杀；跳跃后普通移动按钮禁用且强制点击无变化；同回合不能二次跳跃；下一回合两额度恢复 | `us021-horse.test.cjs` H01；browser `H01-界面`、`H01-专项界面`（`h01-move-then-jump.png`）、`H20-5/6/7` |"
);
rep(
"| H20 | 正常入口实际浏览器（桌面 + 手机横版） | 新旅程→跳过教学→营地（猫粮 8/SP 0）→点击招募马（8→3，后备）→换阵上阵→选关→布阵确认→跳跃预览/取消→基础跳跃击杀（SP 1）→购买技能距离（1 SP，即时 3 格）→结束回合→3 格跳跃再击杀；手机横版同链路跳跃与普通移动可达；全程 0 pageerror | browser `H20-1`～`H20-6`、`H20-手机横版`；`h20-*.png` 8 张；`browser-result.json` |",
"| H20 | 正常入口实际浏览器（桌面 + 手机横版） | 新旅程→跳过教学→营地（猫粮 8/SP 0）→点击招募马（8→3，后备）→换阵上阵→选关→布阵确认→跳跃预览/取消→基础跳跃击杀（SP 1）→购买技能距离（1 SP，即时 3 格）→结束回合→3 格跳跃再击杀→第 3 回合普通移动到 (5,3) 并撤回恢复；手机横版同链路跳跃与普通移动可达；全程 0 pageerror | browser `H20-1`～`H20-7`、`H20-手机横版`；`h20-*.png` 10 张；`browser-result.json` |"
);
rep(
"- `node tests/us021-acceptance-browser.cjs`（服务：`python -m http.server 8777 --bind 127.0.0.1`，工作目录 `web/`）→ 25 步全部通过，`pageErrors=0`，结果写入 `docs/us/us021-evidence/browser-result.json`。",
"- `node tests/us021-acceptance-browser.cjs`（服务：`python -m http.server 8777 --bind 127.0.0.1`，工作目录 `web/`）→ 26 步全部通过，`pageErrors=0`，结果写入 `docs/us/us021-evidence/browser-result.json`。"
);
rep("| `tests/us021-acceptance-browser.cjs`（新增） | `9c1b3661e497db389995920f3f56ce98ade623c620396ce5f9a07537db7ce69e` |",
    "| `tests/us021-acceptance-browser.cjs`（新增） | `0df42a5fe81441157dff7498393812c631a46c843c15d0caccb797b36ff77074` |");
rep("| `docs/us/us021-evidence/browser-result.json` | `ac4d628b56f1a5bbe9284727af396794c14f0a8c240d9b9a7462abac37db1617` |",
    "| `docs/us/us021-evidence/browser-result.json` | `4ce2a1cf4eca51b72800b034532be4a02c10b2954ff3b9e33bc2a4e20b2a8d0e` |");
fs.writeFileSync(p,c);
console.log('doc updated');
