import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const path='D:/Projects/mihuayou/gamehack2026/outputs/01a0bf14-7f85-7282-bb8d-672064556a58/美术资产清单.xlsx';
const backup='D:/Projects/mihuayou/gamehack2026/tmp/art-assets/original.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(backup));
const rows=JSON.parse(await fs.readFile('D:/Projects/mihuayou/gamehack2026/tmp/art-assets/resources.json','utf8'));
const main=wb.worksheets.getItem('美术资产清单');
const original=main.getRange('A6:I76').values;
const source=wb.worksheets.getItem('源文件盘点');
const sourceBefore=source.getUsedRange().values;
const newRows=rows.map((r,i)=>[`A-${String(87+i).padStart(3,'0')}`,r[0],r[1],r[2],r[3],['启动界面','菜单界面','关卡地图'].includes(r[0])?'独立美术样稿中预留':'现有HTML/CSS或资源规格预留','预留／待制作','2026-10-05 美术需求',r[8]]);
main.tables.items[0].rows.add(null,newRows);
const last=91+rows.length;
for(let i=92;i<=last;i++){main.getRange(`A${i}:I${i}`).copyFrom(main.getRange(`A${i%2?91:90}:I${i%2?91:90}`),'all');}
main.getRange(`A92:I${last}`).values=newRows;
main.getRange(`A92:I${last}`).format.rowHeight=60;
main.getRange(`A92:I${last}`).format.wrapText=true;
main.getRange(`A92:I${last}`).format.verticalAlignment='center';
main.getRange('A2').values=[['范围：主原型、独立地形实验、Loading/主菜单/三关地图美术占位；三关规则与流程接入 TBD。']];
main.getRange('A3').values=[[`共 ${86+rows.length} 项视觉元素/组件记录；本次新增 ${rows.length} 项。传统棋子14款、扩展棋子2款、己方技能效果24项、地形19项保留。UI交付规格详见“界面规格”。`]];
const updates={
72:['战斗背景与主布局','桌面／手机2套','桌面菱形棋盘四角HUD；手机一屏布局','CSS响应式布局','组件总项；面板切图复用A-109起通用资源，桌面1920×1080、手机1344×2772'],
73:['战斗状态栏','桌面／手机2套','波次、回合、主帅HP、金币、击杀','CSS卡片＋文字','桌面左上；手机仅保留紧凑主要数值，完整状态折叠'],
74:['我方单位列表与棋子徽记','敌我可区分，己方9棋种槽位','选棋与单位状态','CSS卡片＋汉字徽记','徽记复用棋子；默认/选中/行动耗尽；未实现棋种仍仅预留'],
75:['当前棋子信息卡','桌面详情／手机摘要','属性、行动余量、等级、SP','CSS信息卡＋文字','长说明可展开，动态数值不烘焙'],
76:['技能条目与禁用状态','1套＋图标槽位','升级、转职、方向和炮扩散','CSS按钮＋文字','可购买/已解锁/缺SP/当前阶段不可购买；专属技能仍为己方'],
77:['方向与车模式按钮','四方向＋移动/冲锋/牵引','弓枪方向；车职业模式','CSS按钮＋选中描边','默认/选中/禁用；手机触控面积至少44逻辑像素'],
78:['敌方意图列表与序号','1套','敌方行动顺序和预期状态','折叠列表＋序号','成功/失效/落空/已移除/待机需区分'],
79:['动作预览与受击警告','桌面详情／手机摘要','路径、伤害、友伤、主帅威胁','信息卡＋棋盘标记','友伤醒目；桌面点目标直接攻击，手机保留执行确认'],
80:['战斗操作按钮','执行/取消/撤销/结束回合/暂停','桌面左上与手机底部','CSS按钮','桌面隐藏执行按钮；底板共用通用按钮皮肤'],
81:['结束回合确认弹窗','1套','结算敌方阶段前确认','遮罩＋对话框','确认/继续行动；未行动名单为独立悬停组件'],
82:['暂停弹窗','1套','继续/重新开始','遮罩＋对话框','复用面板、遮罩、主次按钮'],
83:['商店与商品卡','兵/车/马/炮4类','关间整备与上阵后备','对话框＋商品卡＋队伍列表','商品像复用棋子；价格、阵容容量实时文字'],
84:['终局弹窗','胜利/阵亡/将死3态','战斗结果','对话框＋状态文字','独立结果标题装饰详见新增条目；统计数字实时文字'],
85:['短提示与危险提示','普通/成功/警告3态','购买、重开、操作失败、危险反馈','短提示横幅＋文字','底板复用；提示色必须同时有文字或图标辨识']
};
for(const [id,u] of Object.entries(updates)){const index=Number(id)+5;main.getRange(`C${index}:F${index}`).values=[[u[0],u[1],u[2],u[3]]];main.getRange(`H${index}:I${index}`).values=[['2026-10-05 当前UI核对',u[4]]];}
// 原有棋子、地形、技能行保持逐值一致。
if(JSON.stringify(main.getRange('A6:I76').values)!==JSON.stringify(original))throw new Error('Unrelated asset rows changed');
source.getRange('A7').values=[['新增的Loading、菜单和三关地图为HTML/CSS/SVG占位，尚无正式插画或切图。资源预留清单已建立；独立地形实验和旧源图片保留。']];
if(JSON.stringify(source.getRange('A1:H6').values)!==JSON.stringify(sourceBefore.slice(0,6)))throw new Error('Source file inventory changed');

function createSheet(name,title,note,headers,data,widths){const s=wb.worksheets.add(name);s.showGridLines=false;s.getRange('A1').values=[[title]];s.getRange('A1').format.font={name:'Microsoft YaHei',size:18,bold:true,color:'#18364D'};s.mergeCells('A2:I3');s.getRange('A2').values=[[note]];s.getRange('A2:I3').format.wrapText=true;s.getRange('A2:I3').format.rowHeight=25;s.getRange('A2:I3').format.font={name:'Microsoft YaHei',size:11,color:'#526471'};s.getRange('A5:I5').values=[headers];s.getRange(`A6:I${5+data.length}`).values=data;s.getRange(`A5:I${5+data.length}`).format.font={name:'Microsoft YaHei',size:11};s.getRange(`A5:I${5+data.length}`).format.wrapText=true;s.getRange(`A6:I${5+data.length}`).format.rowHeight=76;s.getRange(`A6:I${5+data.length}`).format.verticalAlignment='center';s.getRange('A5:I5').format.fill='#183E5A';s.getRange('A5:I5').format.font={name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'};s.getRange('A5:I5').format.rowHeight=30;for(let c=0;c<widths.length;c++)s.getRangeByIndexes(0,c,data.length+5,1).format.columnWidth=widths[c];for(let r=6;r<=data.length+5;r+=2)s.getRange(`A${r}:I${r}`).format.fill='#EDF4F8';s.tables.add(`A5:I${5+data.length}`,true,name==='界面规格'?'UiSpecs':'MapRegions');s.freezePanes.freezeRows(5);return s;}
const specs=rows.map((r,i)=>[`A-${String(87+i).padStart(3,'0')}`,r[1],r[7],r[4],r[5],r[6],r[3],r[2],r[8]]);
for(const [id,u] of Object.entries(updates))specs.unshift([`A-${String(id).padStart(3,'0')}`,u[0],'现有组件总项；复用通用资源','桌面1920×1080；手机1344×2772','容器PNG九宫格/图标SVG；文字由代码','详见用途与主清单',u[2],u[1],u[4]]);
specs.sort((a,b)=>a[0].localeCompare(b[0]));
createSheet('界面规格','UI 美术交付规格','尺寸为建议制作像素。手机参考布局448×924，资源按3倍制作；桌面1920×1080并支持缩放。编号与主清单一一对应，组件总项和子资源不能简单相加为图片数。最终风格、历史疆界、动画和功能接入待确认。',['编号','资源/组件','替换槽位名','建议尺寸 px','格式与切图','交互状态','使用位置','数量/变体','交付说明'],specs,[12,29,29,34,34,30,27,26,53]);
const reference='https://commons.wikimedia.org/wiki/File:ZH-战国七雄地图.jpg';
createSheet('地图分区','三关地图美术分区','三关是新的美术预留，不等同于战斗内的两波敌军。示意图只表达西→中→东南的关卡构图，不是战国七国疆界复原。三关敌阵、解锁方式、具体疆界与年代均 TBD。',['关卡','暂定区域名','区域槽位','构图位置','视觉主题','重点资源','状态预留','玩法接入','参考与说明'],[
 [1,'关中','region-01','西部','山隘、城塞、土黄色','区域高亮、节点、山隘插画','未解锁/可挑战/选中/通关','TBD，美术样稿未接入战斗','地理题材参考；关卡边界为设计草案。'+reference],
 [2,'中原','region-02','中央','平原、河流、城邑、青绿','区域高亮、节点、城邑插画','未解锁/可挑战/选中/通关','TBD，美术样稿未接入战斗','国别归属、地图年代不作精确标注。'+reference],
 [3,'江淮','region-03','东南','水网、林地、蓝绿','区域高亮、节点、水泽插画','未解锁/可挑战/选中/通关','TBD，美术样稿未接入战斗','战国题材局部地图，非现代全国行政图。'+reference]
],[10,16,20,14,30,33,33,37,65]);
wb.worksheets.getItem('地图分区').getRange('A6:A8').setNumberFormat('0');
for(const name of ['界面规格','地图分区'])wb.worksheets.getItem(name).getRange('A1:I1').format.rowHeight=34;
console.log((await wb.inspect({kind:'table',range:`'美术资产清单'!A92:I96`,include:'values,formulas',tableMaxRows:5,tableMaxCols:9,maxChars:3000})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'formula errors'})).ndjson);
for(const [name,range,file] of [['美术资产清单','A92:I98','main-after'],['界面规格','A19:I24','specs-after'],['地图分区','A1:I8','map-after']]){const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(`D:/Projects/mihuayou/gamehack2026/tmp/art-assets/${file}.png`,new Uint8Array(await blob.arrayBuffer()));}
await fs.writeFile('D:/Projects/mihuayou/gamehack2026/tmp/art-assets/verification.json',JSON.stringify({newAssets:rows.length,totalAssets:86+rows.length,uiSpecs:specs.length,unrelatedRowsPreserved:true}));
await (await SpreadsheetFile.exportXlsx(wb)).save(path);
console.log('Exported',path,rows.length,'new assets');
