// 用最新 us020-result.json 重新生成 5.2 章节，保持文档与证据一致。
const fs=require('fs'),path=require('path');
const data=JSON.parse(fs.readFileSync('docs/us/us020-evidence/us020-result.json','utf8'));
const rows=data.results.map(r=>`| ${r.id} | ${r.type} | ${r.result} | ${String(r.detail).replace(/\|/g,'／').replace(/\s+/g,' ')} | ${r.evidence||'—'} |`);
const shots=[...new Set(data.shots)];
const section=[
 '### 5.2 逐条验收结果（浏览器 + 规则）',
 '',
 '| 用例ID及子分支 | 类型 | 结果 | 实际前置与步骤/检查 | 证据 |',
 '| --- | --- | --- | --- | --- |',
 ...rows,
 '',
 `- 用例行数：${data.results.length}；通过 ${data.results.filter(r=>r.result==='通过').length}；失败 ${data.results.filter(r=>r.result!=='通过').length}。`,
 `- 页面错误（pageerror）：${data.pageErrors.length}。`,
 `- 截图（${shots.length} 张，目录 \`docs/us/us020-evidence/\`）：${shots.join('、')}。`,
 '- 补充证据：`c27-mode-switch.json`（显示模式切换，0 pageerror）、`c27-mode-mobile-camp.png`、`c27-mode-mobile-battle.png`。',
 '- 文件哈希（本轮证据对应的交付版本）：',
 ...Object.entries(data.hashes).map(([f,h])=>`  - \`${f}\`：${h}`),
 `- 生成时间：${data.finishedAt}。`,
 '',
 ''
].join('\n');
const p='docs/us/US-020-main-camp.md';
let t=fs.readFileSync(p,'utf8');
const start=t.indexOf('### 5.2 逐条验收结果');
const end=t.indexOf('### 5.3');
if(start<0||end<0||end<start)throw Error('section markers missing');
t=t.slice(0,start)+section+t.slice(end);
fs.writeFileSync(p,t);
console.log('5.2 regenerated from evidence, rows',rows.length);
