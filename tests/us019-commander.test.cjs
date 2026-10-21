// US-019 我方主帅纯辅助与宫内外移动：K01-K07、K09-K11 规则级定向回归。
// 运行：node tests/us019-commander.test.cjs
// 说明：本文件使用注入局面（emptyState/unit 显式构造）作为专项证据，不代表正常浏览器流程；K08 由 us019-king-browser.cjs 覆盖。
const {test}=require('node:test');
const A=require('node:assert/strict');
const R=require('../web/js/rules.js');
function st(...units){const s=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',4,8),...units]);s.intents=s.units.filter(u=>u.side==='enemy').map((u,i)=>({actor:u.id,from:{x:u.x,y:u.y},to:{x:u.x,y:u.y},type:'standby',path:[],order:i+1}));return s;}
function G(s,id){return s.units.find(u=>u.id===id)}
function pullRook(){const r=R.unit('pull','player','rook',0,1);r.rookRole='pull';r.rookPullRange=3;return r}
function withKingAt(s,x,y){const k=G(s,'king');k.x=x;k.y=y;return s}

test('K01 主帅无普通攻击/吃子：动作、预览、提交与提示一致拒绝，不消耗行动或公共 SP',()=>{
 const s=st(R.unit('e','enemy','pawn',4,1));s.teamSp=2;
 const k=G(s,'king');
 A.equal(k.attack,0,'新版我方主帅攻击力为0');
 A.equal(R.actionAt(s,k,{x:4,y:1}),undefined,'不能对敌方棋子构造攻击动作');
 A.ok(R.legalActions(s,'king').length>0);
 A.ok(R.legalActions(s,'king').every(a=>a.type==='move'),'主帅合法动作只有移动');
 const before=JSON.stringify(s);
 A.strictEqual(R.submit(s,'king',{x:4,y:1}).state,s,'直接提交吃子被拒绝');
 A.equal(JSON.stringify(s),before,'拒绝不改变局面');
 A.match(R.actionReason(s,'king',{x:4,y:1}),/不能攻击或吃子/);
 A.equal(G(s,'king').ap,1,'不消耗行动');
 A.equal(s.teamSp,2,'不消耗公共 SP');
});

test('K04 宫内横竖一步与中心↔四角米字斜走，非中心斜向禁止',()=>{
 const s=withKingAt(st(),4,1);
 const k=G(s,'king');
 for(const to of [{x:3,y:1},{x:5,y:1},{x:4,y:0},{x:4,y:2}])A.equal(R.actionAt(s,k,to)?.type,'move','中心横竖 '+to.x+','+to.y);
 for(const to of [{x:3,y:0},{x:5,y:0},{x:3,y:2},{x:5,y:2}])A.equal(R.actionAt(s,k,to)?.type,'move','中心↔四角米字 '+to.x+','+to.y);
 const t=withKingAt(st(),3,1);
 A.equal(R.actionAt(t,G(t,'king'),{x:4,y:0}),undefined,'非中心斜向连接禁止');
 A.equal(R.actionAt(t,G(t,'king'),{x:2,y:2}),undefined,'非中心斜向连接禁止(反向)');
});

test('K04/K05 横竖一步可出宫，斜向不可出宫；宫外仅上下左右，可横竖回宫',()=>{
 const s=withKingAt(st(),3,1);
 A.equal(R.actionAt(s,G(s,'king'),{x:2,y:1})?.type,'move','宫内横竖一步出宫');
 const d=withKingAt(st(),3,0);
 A.equal(R.actionAt(d,G(d,'king'),{x:2,y:1}),undefined,'不可斜向离宫');
 const out=withKingAt(st(),2,1);
 const k=G(out,'king');
 for(const to of [{x:2,y:0},{x:2,y:2},{x:1,y:1}])A.equal(R.actionAt(out,k,to)?.type,'move','宫外直向 '+to.x+','+to.y);
 A.equal(R.actionAt(out,k,{x:1,y:0}),undefined,'宫外斜向禁止');
 A.equal(R.actionAt(out,k,{x:1,y:2}),undefined,'宫外斜向禁止');
 A.equal(R.actionAt(out,k,{x:3,y:1})?.type,'move','横竖一步回宫');
 A.equal(R.actionAt(out,k,{x:3,y:0}),undefined,'不能斜着回宫');
});

test('K06/K10 友军牵引可把主帅移出九宫；阻挡不可牵引；强制入水立即死亡失败；桥梁按陆地',()=>{
 const build=tiles=>{const s=withKingAt(st(),3,1);s.units.push(pullRook());if(tiles)s.tiles=tiles;return s};
 let s=build();
 let out=R.submit(s,'pull',{x:3,y:1},'pull');
 A.equal(out.effect.pushStatus,'pulled');
 A.deepEqual([G(out.state,'king').x,G(out.state,'king').y],[2,1],'被牵引出九宫');
 A.ok(!R.inPalace('player',G(out.state,'king')),'实际已出宫');
 A.equal(out.state.result,undefined,'未死亡');
 const k=G(out.state,'king');
 A.equal(R.actionAt(out.state,k,{x:2,y:0})?.type,'move','出宫后立即采用宫外规则');
 A.equal(R.actionAt(out.state,k,{x:1,y:0}),undefined,'出宫后不能斜走');
 s=build();s.units.push(R.unit('block','player','pawn',2,1));
 A.strictEqual(R.actionAt(s,G(s,'pull'),{x:3,y:1},'pull'),undefined,'路径被占不能牵引');
 s=build({'2,1':'water'});
 out=R.submit(s,'pull',{x:3,y:1},'pull');
 A.deepEqual([out.state.phase,out.state.result],['result','dead'],'强制入水立即死亡并失败');
 A.equal(G(out.state,'king'),undefined);
 s=build({'2,1':'bridge'});
 out=R.submit(s,'pull',{x:3,y:1},'pull');
 A.equal(out.state.result,undefined,'桥格不触发入水死亡');
 A.equal(G(out.state,'king').hp,3);
});

test('K07 主帅仍受攻击伤害，死亡仍判负（不因纯辅助免疫）',()=>{
 const s=st(R.unit('e','enemy','rook',4,1));G(s,'king').hp=1;
 s.intents=[{actor:'e',from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'charge',path:[{x:4,y:0}],order:1}];
 const out=R.enemyPhase(s);
 A.ok(out.effects[0].damage.includes('king'),'主帅正常受击');
 A.deepEqual([out.state.phase,out.state.result],['result','dead'],'主帅死亡仍失败');
});

test('K02 主帅保持团队 buff 选择与对象排除，出宫不关闭 buff',()=>{
 let s=R.newGame();
 s=R.chooseCommanderBuff(s,'move');
 A.equal(s.buffs.move,true,'US-020：疾行走旅程增益字段，仍跨关保留');
 A.equal(G(s,'king').commanderMove,0,'主帅本人不吃移动 buff');
 A.equal(G(s,'rook').commanderMove,1,'队友吃到移动 buff');
 withKingAt(s,2,1);
 A.equal(G(s,'rook').commanderMove,1,'出宫后 buff 仍生效');
 A.equal(G(s,'king').maxHp,3,'主帅基础 HP 不变');
 let h=R.chooseCommanderBuff(R.newGame(),'health');
 A.deepEqual([G(h,'king').maxHp,G(h,'rook').maxHp],[3,3],'health buff 只给队友');
});

test('K03 主帅个人升级全部禁用，公共 SP 不为主帅扣除；队友仍可升级',()=>{
 const s=st(R.unit('r','player','rook',0,1));s.teamSp=9;
 for(const skill of ['fortify','combo','promote-archer','promote-spearman','direction','rook-charge-role','rook-charge','rook-push','cannon-splash'])
  A.strictEqual(R.purchaseUpgrade(s,'king',skill,0),s,'主帅不能购买 '+skill);
 A.equal(s.teamSp,9,'拒绝不扣公共 SP');
 const n=R.purchaseUpgrade(s,'r','fortify');
 A.notStrictEqual(n,s,'队友仍可用公共 SP 升级');
 A.deepEqual([n.teamSp,G(n,'r').maxHp],[8,3]);
});

test('K09 敌将仍受九宫限制，敌方与主帅规则不共享误改',()=>{
 const s=st();
 const boss=G(s,'boss');
 A.equal(R.actionAt(s,boss,{x:4,y:7})?.type,'move','敌将宫内直走合法');
 A.equal(R.actionAt(s,boss,{x:3,y:8})?.type,'move','敌将宫内横走合法');
 A.equal(R.actionAt(s,boss,{x:4,y:5}),undefined,'敌将不能走出九宫');
 A.equal(R.actionAt(s,boss,{x:3,y:6}),undefined,'敌将非中心斜向禁止');
 const centre=withKingAt(st(),4,7);
 const b2=G(centre,'boss');b2.x=4;b2.y=7;
 A.equal(R.actionAt(centre,b2,{x:3,y:6})?.type,'move','敌将米字斜走保留');
 // 敌方牵引车不能把敌将拉出九宫
 const t=st();const er=R.unit('er','enemy','rook',0,7);er.rookRole='pull';er.rookPullRange=3;t.units.push(er);
 const boss2=G(t,'boss');boss2.x=3;boss2.y=7;
 A.strictEqual(R.actionAt(t,er,{x:3,y:7},'pull'),undefined,'敌将不能被拉出九宫');
});

test('K11 新旅程直接使用新帅规则，跨关与失败重试保持',()=>{
 let s=R.newGame();
 A.deepEqual([G(s,'king').x,G(s,'king').y,G(s,'king').attack],[4,0,0]);
 s=R.chooseCommanderBuff(s,'health');
 A.equal(R.actionAt(s,G(s,'king'),{x:4,y:1})?.type,'move');
 s=R.submit(s,'king',{x:4,y:1}).state;
 A.equal(G(s,'king').ap,0,'移动消耗本回合行动');
 G(s,'king').ap=1;
 A.equal(R.actionAt(s,G(s,'king'),{x:3,y:0})?.type,'move','九宫中心可米字斜走');
 A.equal(R.actionAt(s,G(s,'king'),{x:4,y:0})?.type,'move');
 let out=R.endTurn(s).state;
 A.equal(out.level,1);
 const dead=R.copy(s);
 const k=G(dead,'king');k.hp=0;
 const retried=R.retryLevel(Object.assign(dead,{result:'dead',phase:'result'}));
 A.equal(retried.phase,'deploy');
 A.deepEqual([G(retried,'king').x,G(retried,'king').y],[4,0],'重试回到新规则出生位');
 A.equal(G(retried,'king').attack,0,'重试仍是纯辅助主帅');
});

test('K10 主动移动入水被拒绝且不消耗行动，桥梁格按陆地跨河',()=>{
 const s=withKingAt(st(),2,1);s.tiles={'1,1':'water'};
 const k=G(s,'king');
 A.equal(R.actionAt(s,k,{x:1,y:1}),undefined,'宫外不能主动走入水格');
 const before=JSON.stringify(s);
 A.strictEqual(R.submit(s,'king',{x:1,y:1}).state,s,'提交入水被拒绝');
 A.equal(JSON.stringify(s),before,'拒绝不改变局面');
 A.equal(G(s,'king').ap,1,'不消耗行动');
 A.match(R.actionReason(s,'king',{x:1,y:1}),/主动进入水格/);
 const t=withKingAt(st(),4,1);t.tiles={'4,2':'water'};
 A.equal(R.actionAt(t,G(t,'king'),{x:4,y:2}),undefined,'宫内同样不能主动入水');
 // 无 tiles 时使用默认三桥：第 4 行除 (1,4)(4,4)(7,4) 外为水。
 const b=withKingAt(st(),1,3);
 A.equal(R.actionAt(b,G(b,'king'),{x:2,y:4}),undefined,'非桥水格不可入');
 A.equal(R.actionAt(b,G(b,'king'),{x:1,y:4})?.type,'move','桥梁格按陆地可进入');
 const crossed=R.submit(b,'king',{x:1,y:4}).state;
 A.deepEqual([G(crossed,'king').x,G(crossed,'king').y],[1,4],'实际走到桥上');
 A.equal(crossed.result,undefined,'过桥不触发入水死亡');
 A.equal(G(crossed,'king').hp,3,'桥梁不扣血');
 G(crossed,'king').ap=1;
 A.equal(R.actionAt(crossed,G(crossed,'king'),{x:2,y:4}),undefined,'桥旁水格仍不可入');
 A.equal(R.actionAt(crossed,G(crossed,'king'),{x:1,y:5})?.type,'move','沿桥梁继续跨到对岸');
});

test('K06/K10 现有冲击接口可把主帅推出九宫并正常扣血，强制入水立即判负，桥格不判死',()=>{
 const build=tiles=>{const s=withKingAt(st(),3,1);const r=R.unit('charge','enemy','rook',4,1);r.rookPush=true;s.units.push(r);if(tiles)s.tiles=tiles;s.intents=[{actor:'charge',from:{x:4,y:1},to:{x:3,y:1},offset:{x:-1,y:0},type:'charge',path:[{x:3,y:1}],order:1}];return s};
 let s=build(),out=R.enemyPhase(s);
 A.ok(G(out.state,'king'),'主帅仍存活');
 A.deepEqual([G(out.state,'king').x,G(out.state,'king').y],[2,1],'被冲击推出九宫');
 A.ok(!R.inPalace('player',G(out.state,'king')),'实际已出宫');
 A.equal(G(out.state,'king').hp,2,'冲击正常扣血');
 A.equal(out.effects[0].pushStatus,'pushed');
 A.deepEqual(out.effects[0].pushed,{id:'king',to:{x:2,y:1}});
 A.deepEqual([out.state.phase,out.state.result],['player',undefined],'未死亡仍可行动');
 const k=G(out.state,'king');
 A.equal(R.actionAt(out.state,k,{x:1,y:1})?.type,'move','冲击出宫后宫外直向可用');
 A.equal(R.actionAt(out.state,k,{x:1,y:0}),undefined,'冲击出宫后不能斜走');
 s=build({'2,1':'water'});
 out=R.enemyPhase(s);
 A.deepEqual([out.state.phase,out.state.result],['result','dead'],'强制入水立即死亡并失败');
 A.equal(G(out.state,'king'),undefined);
 A.ok((out.effects[0].waterDeaths||[]).includes('king'),'记录入水致死');
 s=build({'2,1':'bridge'});
 out=R.enemyPhase(s);
 A.equal(out.state.result,undefined,'桥格不触发入水死亡');
 A.equal(G(out.state,'king').hp,2,'桥格仍只受冲击伤害');
});

test('K11 实际 nextLevel 跨关后仍用新帅规则：攻击 0、无升级、宫内米字与宫外直向保持',()=>{
 let s=R.newGame();
 s=R.chooseCommanderBuff(s,'move');
 A.equal(s.phase,'player');
 s.phase='intermission';s.result='victory';
 const n0=R.nextLevel(s);
 A.equal(n0.level,2,'实际 nextLevel 进入下一关');
 A.deepEqual([G(n0,'king').x,G(n0,'king').y,G(n0,'king').attack],[4,0,0],'跨关后主帅仍攻击 0 且回出生位');
 const n=R.chooseCommanderBuff(n0,'move');
 A.equal(n.phase,'player');
 const k=G(n,'king');
 A.equal(k.maxHp,3,'跨关后基础 HP 不变');
 A.equal(R.actionAt(n,k,{x:4,y:1})?.type,'move','宫内横竖一步');
 A.equal(R.actionAt(n,k,{x:3,y:1}),undefined,'出生位不在中心，斜向米字线不成立');
 withKingAt(n,4,1);
 for(const to of [{x:3,y:0},{x:5,y:0},{x:3,y:2},{x:5,y:2}])A.equal(R.actionAt(n,G(n,'king'),to)?.type,'move','跨关后中心米字 '+to.x+','+to.y);
 n.units.push(R.unit('e2','enemy','pawn',4,2));
 A.equal(R.actionAt(n,G(n,'king'),{x:4,y:2}),undefined,'跨关后仍不能吃子');
 A.match(R.actionReason(n,'king',{x:4,y:2}),/不能攻击或吃子/);
 n.teamSp=3;
 A.strictEqual(R.purchaseUpgrade(n,'king','fortify'),n,'跨关后仍不能购买主帅升级');
 A.equal(n.teamSp,3,'拒绝不扣公共 SP');
});
