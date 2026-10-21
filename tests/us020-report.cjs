// 由 us020-result.json 生成交付用验收表（保持证据与文档一致）。
// 用法：node tests/us020-report.cjs [证据目录]，默认 docs/us/us020-evidence-r2。
const fs=require('fs'),path=require('path');
const dir=process.env.M0_EVIDENCE_DIR||process.argv[2]||'docs/us/us020-evidence-r2';
const file=path.resolve(dir,'us020-result.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const rows=data.results.map(r=>`| ${r.id} | ${r.type} | ${r.result} | ${String(r.detail).replace(/\|/g,'／').replace(/\s+/g,' ')} | ${r.evidence||'—'} |`);
const lines=[
 '| 用例ID及子分支 | 类型 | 结果 | 实际前置与步骤/检查 | 证据 |',
 '| --- | --- | --- | --- | --- |',
 ...rows
];
const summary=[
 '',
 `- 用例行数：${data.results.length}；通过 ${data.results.filter(r=>r.result==='通过').length}；失败 ${data.results.filter(r=>r.result!=='通过').length}。`,
 `- 页面错误（pageerror）：${data.pageErrors.length}${data.pageErrors.length?`：${JSON.stringify(data.pageErrors.slice(0,5))}`:''}。`,
 `- 截图：${data.shots.join('、')||'—'}（${new Set(data.shots).size} 个唯一文件，目录 ${dir.replace(/\\/g,'/')}/）。`,
 '- 文件哈希（最终工作区版本）：',
 ...Object.entries(data.hashes).map(([f,h])=>`  - \`${f}\`：${h}`),
 `- 生成时间：${data.finishedAt}。`
].join('\n');
process.stdout.write(lines.join('\n')+'\n'+summary+'\n');
