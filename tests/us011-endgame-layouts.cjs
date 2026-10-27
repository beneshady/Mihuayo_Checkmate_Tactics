// 由运行时就绪的预置数据生成布局说明，避免文档与运行时两套坐标漂移。
// 用法：node tests/us011-endgame-layouts.cjs [输出路径]
const fs=require('node:fs'),path=require('node:path'),P=require('../web/js/presets.js'),R=require('../web/js/rules.js'),M=require('../web/js/maps.js');
const out=path.resolve(process.argv[2]||path.join(__dirname,'..','docs','us','us011-endgame-presets-evidence','layouts.md'));
const KW={king:'帅/将',rook:'车',horse:'马',cannon:'炮',pawn:'兵',archer:'弓',spearman:'枪',advisor:'士',elephant:'相'};
const label=u=>u.kind==='king'?(u.side==='player'?'帅':'将'):KW[u.kind];
const show=p=>`（${p[0]+1},${p[1]+1}）`;
const cells=map=>{const out={};for(let y=8;y>=0;y--){const row=[];for(let x=0;x<9;x++){const u=map.units.find(v=>v.x===x&&v.y===y),t=map.tiles[x+','+y],terrain={land:'',water:'水',bridge:'桥',mountain:'山',cracked:'裂山',forest:'林'}[t]||t;row.push(u?label(u):terrain||'·')}out['第'+(y+1)+'行']=row.join(' ')}return out};
let md='# 首批三张历史残局预置布局说明（运行时数据生成）\n\n';
md+=`生成脚本：\`tests/us011-endgame-layouts.cjs\`；数据版本：\`${P.VERSION}\`；生成时间：${new Date().toISOString()}。\n\n`;
md+='坐标均为内部零基坐标，括号内为界面显示的 +1 坐标。地界按行固定：y=0～3（第1～4行）我方地界、y=4（第5行）中央交界、y=5～8（第6～9行）敌方地界，与地形和棋子阵营无关。\n\n';
for(const d of P.list()){
 const map=P.mapOf(d.id),errors=M.validate(map),count=k=>d.terrain[k].length;
 md+=`## ${d.name}\n\n`;
 md+=`- 编号：\`${d.levelCode}\`；数据版本：${d.revision}；地图库名称：${d.name}\n`;
 md+=`- 来源：\`${d.source.file}\`（\`${d.source.folder}\`），${d.source.mapping}\n`;
 md+=`- 玩法提示：${d.summary}\n`;
 md+=`- 棋子：我方 ${d.units.filter(u=>u.side==='player').length} 子、敌方 ${d.units.filter(u=>u.side==='enemy').length} 子；地形：山 ${count('mountain')} / 水 ${count('water')} / 树林 ${count('forest')}；仅有地形：陆地（其余 81 格）\n`;
 md+=`- 现有地图校验：${errors.length?'未通过：'+errors.join('；'):'通过（0 项问题）'}\n`;
 if(d.deviations.length)md+=`- 改编差异：${d.deviations.join(' ')}\n`;else md+='- 改编差异：无（棋子与地形按识别稿）\n';
 if(d.notes)md+=`- 备注：${d.notes}\n`;
 md+='\n棋子清单（内部坐标 → 界面显示）：\n\n| 阵营 | 棋种 | 内部坐标 | 显示坐标 | 稳定 id |\n| --- | --- | --- | --- | --- |\n';
 for(const u of d.units)md+=`| ${u.side==='player'?'我方':'敌方'} | ${label(u)} | (${u.x},${u.y}) | ${show([u.x,u.y])} | \`${u.id}\` |\n`;
 md+='\n地形清单：\n\n';
 for(const [type,label] of [['mountain','完整山'],['water','水'],['forest','树林']])md+=`- ${label}：${d.terrain[type].map(p=>`(${p[0]},${p[1]})`).join('、')||'无'}\n`;
 md+='\n棋盘布局（上方为敌方第9行；单字为棋子，若格上无棋子则显示地形，空为陆地）：\n\n';
 md+='| 行 | 第1列 | 第2列 | 第3列 | 第4列 | 第5列 | 第6列 | 第7列 | 第8列 | 第9列 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
 const grid=cells(map);
 for(let y=8;y>=0;y--)md+=`| ${y+1} | ${grid['第'+(y+1)+'行'].split(' ').join(' | ')} |\n`;
 md+='\n';
}
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,md);
console.log('generated',out);
