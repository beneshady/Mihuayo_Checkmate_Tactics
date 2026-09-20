// US-001：T01-T60 与士专项。运行：node tests/rules.test.cjs
const {test}=require('node:test');
const A=require('node:assert/strict');
const R=require('../web/js/rules.js'),U=R.unit;
function F(...xs){const s=R.emptyState([U('king','player','king',4,0),U('boss','enemy','king',4,8),...xs]);standby(s);return s;}
function G(s,id){return s.units.find(u=>u.id===id)}
function standby(s){s.intents=s.units.filter(u=>u.side==='enemy').map((u,i)=>({actor:u.id,from:{x:u.x,y:u.y},to:{x:u.x,y:u.y},type:'standby',path:[],order:i+1}));return s}
function act(s,id,to,mode){return R.submit(s,id,to,mode).state}
function up(s,id,skill,index){return R.purchaseUpgrade(s,id,skill,index)}
function grant(s,id,n){G(s,id).sp=n;return s}
function turn(s){standby(s);return R.endTurn(s).state}

test('T01-T07 属性、个人成长、强健、非法购买',()=>{
 const p=U('p','player','pawn',0,0),r=U('r','player','rook',0,0),c=U('c','player','cannon',0,0);
 A.deepEqual([p.attack,p.hp,p.level,p.sp,p.ap],[1,1,1,0,1]);
 A.deepEqual([r.rookMoveRange,r.rookChargeRange,r.attack,r.hp,r.ap,r.rookMoveAvailable,r.rookChargeAvailable],[3,1,1,2,1,true,true]);
 A.deepEqual([c.attack,c.hp,c.ap,c.cannonMask],[2,2,1,0]);
 let s=F(U('p','player','pawn',2,4),U('e','enemy','pawn',2,5));s=act(s,'p',{x:2,y:5});
 A.deepEqual([G(s,'p').kills,G(s,'p').level,G(s,'p').sp],[1,2,1]);A.deepEqual([G(s,'king').level,G(s,'king').sp],[1,0]);
 s=F(U('r','player','rook',1,4),U('e','enemy','rook',2,4));s=act(s,'r',{x:2,y:4},'charge');A.deepEqual([G(s,'r').level,G(s,'r').sp,G(s,'e').hp],[1,0,1]);
 s=F(U('h','player','horse',1,1),U('r','player','rook',0,1));G(s,'king').sp=1;G(s,'h').sp=1;G(s,'r').sp=1;G(s,'r').hp=1;
 s=up(up(up(s,'king','fortify'),'h','fortify'),'r','fortify');A.deepEqual([G(s,'king').hp,G(s,'h').maxHp,G(s,'r').hp,G(s,'r').maxHp],[4,2,2,3]);
 A.strictEqual(up(s,'boss','fortify'),s);A.strictEqual(up(s,'king','rook-push'),s);const ended=R.copy(s);ended.phase='result';A.strictEqual(up(ended,'king','fortify'),ended);
});

test('T03-T04 炮一发多杀、友伤不发成长、只扣一次 AP',()=>{
 let s=F(U('c','player','cannon',4,0),U('screen','player','horse',4,2),U('target','enemy','pawn',4,4),U('north','enemy','pawn',4,5),U('east','enemy','pawn',5,4),U('ally','player','horse',3,4));
 const c=G(s,'c');c.cannonMask=(1<<0)|(1<<2)|(1<<6);const out=R.submit(s,'c',{x:4,y:4});s=out.state;
 A.equal(out.effect.victims.length,4);A.deepEqual([G(s,'c').kills,G(s,'c').level,G(s,'c').sp,G(s,'c').ap],[3,4,3,0]);A.equal(G(s,'ally'),undefined);
});

test('T08-T13 四向早期距离、河界、阻挡、连动延迟且独立',()=>{
 let s=F(U('a','player','archer',2,3),U('e','enemy','pawn',2,5));grant(s,'a',1);s=up(s,'a','direction',0);
 A.deepEqual(G(s,'a').directionPaid,[1,0,0,0]);A.equal(G(s,'a').attack,2);A.ok(R.directionalAction(s,'a',0));A.equal(R.directionalAction(s,'a',1),undefined);
 let q=U('q','player','pawn',1,3);s=F(q);A.equal(R.actionAt(s,q,{x:2,y:3}),undefined);q.y=4;A.equal(R.actionAt(s,q,{x:2,y:4}),undefined);q.y=5;A.ok(R.actionAt(s,q,{x:2,y:5}));
 s=F(U('a','player','archer',2,4),U('ally','player','horse',2,5),U('far','enemy','pawn',2,6));G(s,'a').directionPaid[0]=3;A.equal(R.directionalAction(s,'a',0),undefined);
 s=F(U('p','player','pawn',2,4),U('q','player','pawn',4,4));grant(s,'p',1);A.strictEqual(up(s,'p','combo'),s);G(s,'p').sp=4;G(s,'p').ap=0;
 s=up(s,'p','combo');A.deepEqual([G(s,'p').ap,G(s,'p').combo],[0,1]);s=up(s,'p','combo');s=turn(s);A.deepEqual([G(s,'p').ap,G(s,'p').apLimit],[3,3]);
 s=act(s,'p',{x:2,y:5});s=act(s,'p',{x:3,y:5});s=act(s,'p',{x:3,y:6});A.equal(G(s,'p').ap,0);A.equal(G(s,'q').ap,1);A.strictEqual(R.submit(s,'p',{x:4,y:6}).state,s);
});

test('T14-T16 车两种距离独立、封顶、阻挡、震退一次性',()=>{
 let s=F(U('r','player','rook',0,1),U('block','player','horse',0,3));grant(s,'r',20);s=up(s,'r','rook-move');
 A.deepEqual([G(s,'r').rookMoveRange,G(s,'r').rookChargeRange],[4,1]);A.equal(R.actionAt(s,G(s,'r'),{x:0,y:4},'rook-move'),undefined);
 for(let i=0;i<3;i++)s=up(s,'r','rook-move');for(let i=0;i<6;i++)s=up(s,'r','rook-charge');const sp=G(s,'r').sp;
 A.strictEqual(up(s,'r','rook-move'),s);A.strictEqual(up(s,'r','rook-charge'),s);A.equal(G(s,'r').sp,sp);s=up(s,'r','rook-push');A.equal(G(s,'r').rookPush,true);A.strictEqual(up(s,'r','rook-push'),s);A.equal(G(s,'r').attack,1);
});

test('T17-T20 车接近、击杀占位、震退、阻挡、强制跨河',()=>{
 let s=F(U('r','player','rook',1,4),U('e','enemy','rook',4,4));Object.assign(G(s,'r'),{rookChargeRange:3,rookPush:true});s=act(s,'r',{x:4,y:4},'charge');A.deepEqual([G(s,'r').x,G(s,'e').x,G(s,'e').hp],[3,5,1]);
 s=F(U('r','player','rook',1,4),U('e','enemy','pawn',4,4));Object.assign(G(s,'r'),{rookChargeRange:3,rookPush:true});s=act(s,'r',{x:4,y:4},'charge');A.equal(R.at(s,{x:4,y:4}).id,'r');A.equal(G(s,'r').kills,1);
 s=F(U('r','player','rook',1,4),U('e','enemy','rook',4,4),U('b','enemy','pawn',5,4));Object.assign(G(s,'r'),{rookChargeRange:3,rookPush:true});let blocked=R.submit(s,'r',{x:4,y:4},'charge');s=blocked.state;A.equal(G(s,'e').x,4);A.equal(G(s,'b').hp,1);A.equal(blocked.effect.pushStatus,'occupied');
 s=F(U('r','player','rook',1,3),U('p','enemy','rook',3,3));Object.assign(G(s,'r'),{rookChargeRange:2,rookPush:true});s=act(s,'r',{x:3,y:3},'charge');A.equal(G(s,'p').x,4);
 s=F(U('r','player','rook',3,8),U('a','enemy','advisor',5,8));Object.assign(G(s,'boss'),{x:4,y:7});Object.assign(G(s,'r'),{rookChargeRange:2,rookPush:true});Object.assign(G(s,'a'),{hp:2,maxHp:2});const palace=R.submit(s,'r',{x:5,y:8},'charge');s=palace.state;A.deepEqual([G(s,'a').x,G(s,'a').y],[5,8]);A.equal(palace.effect.pushStatus,'palace');
});

test('T21 被推敌人按新位置重验证旧目标',()=>{
 let s=F(U('r','player','rook',6,3),U('e','enemy','rook',4,3));Object.assign(G(s,'r'),{rookChargeRange:2,rookPush:true});s.intents=[{actor:'e',from:{x:4,y:3},to:{x:1,y:3},type:'move',path:[],order:1}];s=act(s,'r',{x:4,y:3},'charge');A.equal(G(R.enemyPhase(s).state,'e').x,1);
 s=F(U('r','player','rook',4,1),U('e','enemy','rook',4,3));Object.assign(G(s,'r'),{rookChargeRange:2,rookPush:true});s.intents=[{actor:'e',from:{x:4,y:3},to:{x:1,y:3},type:'move',path:[],order:1}];s=act(s,'r',{x:4,y:3},'charge');A.equal(R.enemyPhase(s).effects[0].status,'cancelled');
});

test('T22-T27 炮架、远攻、固定 mask、参数、裁边',()=>{
 let s=F(U('c','player','cannon',0,0),U('target','enemy','rook',0,7));A.equal(R.actionAt(s,G(s,'c'),{x:0,y:7}),undefined);s.units.push(U('screen','player','horse',0,3));A.ok(R.actionAt(s,G(s,'c'),{x:0,y:7}));A.equal(R.actionAt(s,G(s,'c'),{x:4,y:0}),undefined);s.units.push(U('screen2','enemy','pawn',0,5));A.equal(R.actionAt(s,G(s,'c'),{x:0,y:7}),undefined);
 s=F(U('c','player','cannon',4,0));grant(s,'c',12);s=up(up(s,'c','cannon-splash',0),'c','cannon-splash',2);A.equal(G(s,'c').cannonMask,5);A.strictEqual(up(s,'c','cannon-splash',0),s);for(const bad of [-1,8,1.5])A.strictEqual(up(s,'c','cannon-splash',bad),s);for(const i of [1,3,4,5,6,7])s=up(s,'c','cannon-splash',i);A.equal(G(s,'c').cannonMask,255);A.strictEqual(up(s,'c','cannon-splash',1),s);
 const cover=(x,y)=>1+R.CONFIG.splash.filter(d=>R.inside({x:x+d.x,y:y+d.y})).length;A.deepEqual([cover(4,4),cover(0,4),cover(0,0)],[9,6,4]);
});

test('炮基础攻击零 SP 可用、AP 门控、成长后下回合扩散',()=>{
 let s=R.fixtureState('P3','basic-growth'),c=G(s,'cannon');
 A.deepEqual([c.level,c.sp,c.ap,c.cannonMask,c.attack],[1,0,1,0,2]);
 let shot=R.actionAt(s,c,{x:2,y:4});A.ok(shot);A.equal(shot.type,'attack');
 let out=R.submitAction(s,shot);s=out.state;
 A.equal(G(s,'target-a'),undefined);A.deepEqual([G(s,'cannon').level,G(s,'cannon').sp,G(s,'cannon').ap],[2,1,0]);
 A.equal(R.legalActions(s,'cannon').length,0);A.equal(R.actionReason(s,'cannon',{x:5,y:1}),'本回合已行动，下回合可攻击');
 A.strictEqual(R.submit(s,'cannon',{x:5,y:1}).state,s);
 s=R.purchaseUpgrade(s,'cannon','cannon-splash',2);A.deepEqual([G(s,'cannon').sp,G(s,'cannon').cannonMask],[0,4]);
 s=R.endTurn(s).state;A.equal(G(s,'cannon').ap,1);
 out=R.submit(s,'cannon',{x:5,y:1});s=out.state;
 A.ok(out.effect);A.equal(G(s,'target-b'),undefined);A.equal(G(s,'splash-b'),undefined);A.ok(G(s,'boss'));
});

test('炮架边界与失败原因不消耗 AP',()=>{
 let s=F(U('c','player','cannon',0,0),U('target','enemy','rook',0,5));
 for(const [to,reason] of [[{x:0,y:5},'目标与炮之间没有炮架'],[{x:2,y:2},'炮只能攻击横竖同线目标']]){
  const before=JSON.stringify(s);A.strictEqual(R.submit(s,'c',to).state,s);A.equal(R.actionReason(s,'c',to),reason);A.equal(JSON.stringify(s),before);A.equal(G(s,'c').ap,1);
 }
 s.units.push(U('screen-enemy','enemy','pawn',0,2));A.ok(R.actionAt(s,G(s,'c'),{x:0,y:5}));
 s.units.push(U('screen-friend','player','horse',0,3));A.equal(R.actionAt(s,G(s,'c'),{x:0,y:5}),undefined);A.equal(R.actionReason(s,'c',{x:0,y:5}),'目标与炮之间有多个炮架');A.equal(G(s,'c').ap,1);
 s=F(U('c','player','cannon',0,0),U('screen-friend','player','horse',0,2),U('target','enemy','rook',0,5));A.ok(R.actionAt(s,G(s,'c'),{x:0,y:5}));
});

test('T28-T30 炮冻结炮架、同时结算、隔子溅射、不追溯',()=>{
 let s=F(U('c','player','cannon',4,0),U('screen','enemy','pawn',4,3),U('target','enemy','pawn',4,4),U('side','enemy','pawn',5,4));G(s,'c').cannonMask=(1<<4)|(1<<2);
 const out=R.submit(s,'c',{x:4,y:4});s=out.state;for(const id of ['screen','target','side'])A.ok(out.effect.victims.includes(id));const dead=out.effect.victims.slice();G(s,'c').sp=1;s=up(s,'c','cannon-splash',0);A.deepEqual(out.effect.victims,dead);
});

test('T31-T33 占位、锁定重验证、双方将帅同死己方失败',()=>{
 let s=F(U('p','player','pawn',2,4),U('e','enemy','pawn',2,5));s=act(s,'p',{x:2,y:5});A.deepEqual([G(s,'p').x,G(s,'p').y],[2,4]);s=F(U('r','player','rook',2,4),U('e','enemy','pawn',2,5));s=act(s,'r',{x:2,y:5},'charge');A.deepEqual([G(s,'r').x,G(s,'r').y],[2,5]);
 s=F(U('e','enemy','pawn',2,5),U('p','player','pawn',2,4));s.intents=[{actor:'e',from:{x:2,y:5},to:{x:2,y:4},type:'attack',path:[],order:1}];s.units=s.units.filter(u=>u.id!=='p');A.equal(R.enemyPhase(s).effects[0].status,'miss');A.deepEqual([G(R.enemyPhase(s).state,'e').x,G(R.enemyPhase(s).state,'e').y],[2,5]);s.units.push(U('h','player','horse',2,4));A.equal(G(R.enemyPhase(s).state,'h'),undefined);s.units=s.units.filter(u=>u.id!=='h');s.units.push(U('friend','enemy','pawn',2,4));A.equal(R.enemyPhase(s).effects[0].status,'cancelled');
 s=F(U('er','enemy','rook',0,4));s.intents=[{actor:'er',from:{x:0,y:4},to:{x:0,y:3},type:'charge',path:[{x:0,y:3}],order:1}];const emptyCharge=R.enemyPhase(s);A.deepEqual([G(emptyCharge.state,'er').x,G(emptyCharge.state,'er').y,emptyCharge.effects[0].status,emptyCharge.effects[0].hits.length],[0,3,'success',0]);
 s=F(U('c','player','cannon',3,0));s.wave=2;Object.assign(G(s,'king'),{x:3,y:3,hp:1});Object.assign(G(s,'boss'),{x:3,y:4,hp:1});G(s,'c').cannonMask=1<<4;s=act(s,'c',{x:3,y:4});A.equal(s.result,'dead');A.equal(G(s,'king'),undefined);A.equal(G(s,'boss'),undefined);
});

test('T34-T38 模拟纯净、升级解围、车双段搜索、unknown、旧预览失效',()=>{
 let s=R.fixtureState('P6'),before=JSON.stringify(s);R.preview(s,'king',{x:3,y:1});R.enemyPhase(s);R.dangerNow(s);const analysis=R.analyze(s);A.equal(JSON.stringify(s),before);A.equal(analysis.safe,true);A.equal(analysis.plan[0].type,'upgrade');let n=up(s,'king','fortify');A.deepEqual([G(n,'king').hp,G(n,'king').maxHp],[2,4]);A.equal(G(R.enemyPhase(n).state,'king').hp,1);
 const mate=R.fixtureState('P6','mate');A.equal(R.dangerNow(mate),true);A.equal(R.analyze(mate).safe,false);const ended=R.checkmate(mate);A.deepEqual([ended.phase,ended.result,ended.intents.length],['result','mate',0]);
 s=F(U('r','player','rook',0,1),U('threat','enemy','pawn',4,1));Object.assign(G(s,'king'),{hp:1,ap:0});G(s,'r').rookChargeRange=1;s.intents=[{actor:'threat',from:{x:4,y:1},to:{x:4,y:0},type:'attack',path:[{x:4,y:0}],order:1}];const a=R.analyze(s);A.equal(a.safe,true);A.ok(a.plan.some(x=>x.type==='rook-move'));A.ok(a.plan.some(x=>x.type==='charge'));
 s=R.fixtureState('P6');before=JSON.stringify(s);const first=R.escapeAnalysis(s).next();A.equal(first.done,false);A.equal(s.phase,'player');A.equal(JSON.stringify(s),before);
 s=F(U('r','player','rook',0,1));grant(s,'r',4);const preview=R.preview(s,'r',{x:0,y:2},'rook-move');s=up(s,'r','rook-charge');A.strictEqual(R.submitAction(s,preview.action).state,s);s=up(s,'r','rook-push');const sp=G(s,'r').sp;A.strictEqual(up(s,'r','rook-push'),s);A.equal(G(s,'r').sp,sp);
});

test('T39-T40 跨波继承、新购干净、奖励一次、重开清零',()=>{
 let s=F(U('r','player','rook',0,0));Object.assign(G(s,'r'),{level:4,kills:3,sp:3,hp:1,rookChargeRange:3,rookMoveAvailable:false,rookChargeAvailable:false});s.phase='shop';s.gold=2;s=R.buy(s,'horse');A.deepEqual([G(s,'horse').level,G(s,'horse').sp],[1,0]);s=R.nextWave(s);A.deepEqual([G(s,'r').level,G(s,'r').hp,G(s,'r').rookChargeRange,G(s,'r').rookMoveAvailable],[4,1,3,true]);
 s=F(U('r','player','rook',4,7));G(s,'boss').hp=1;s=act(s,'r',{x:4,y:8},'charge');A.deepEqual([s.phase,s.gold],['shop',2]);A.strictEqual(R.endTurn(s).state,s);
 for(let i=0;i<3;i++){const z=R.newGame();A.deepEqual([z.wave,z.turn,z.gold,z.kills,z.units.length],[1,1,0,0,10]);}
});

test('T41-T46 转职赠送一次、继承、总等级无上限、职业隔离',()=>{
 for(const kind of ['archer','spearman']){let s=F(U('p','player','pawn',2,4));Object.assign(G(s,'p'),{sp:4,level:5,kills:4,maxHp:3,hp:2,combo:1,fortify:2,ap:0});s=up(s,'p','promote-'+kind);const q=G(s,'p');A.deepEqual([q.id,q.kind,q.level,q.kills,q.combo,q.ap],['p',kind,5,4,1,0]);if(kind==='archer')A.deepEqual([q.attack,q.hp,q.maxHp],[2,2,3]);else A.deepEqual([q.attack,q.hp,q.maxHp],[1,3,4]);A.strictEqual(up(s,'p','promote-'+(kind==='archer'?'spearman':'archer')),s);}
 let s=F(U('a','player','spearman',2,4),U('e1','enemy','pawn',2,5),U('e2','enemy','pawn',2,6),U('e3','enemy','pawn',2,7));Object.assign(G(s,'a'),{level:9,directionPaid:[6,0,0,0]});s=R.submitDirection(s,'a',0).state;A.deepEqual([G(s,'a').level,G(s,'a').sp,G(s,'a').directionPaid[0]],[12,3,6]);A.strictEqual(up(s,'a','direction',0),s);s=up(s,'a','direction',2);A.equal(G(s,'a').directionPaid[2],1);
 let p=F(U('p','player','pawn',1,4));grant(p,'p',9);A.strictEqual(up(p,'p','direction',0),p);p=up(p,'p','promote-archer');A.strictEqual(up(p,'p','promote-spearman'),p);
});

test('T47-T50 方向参数、枪贯穿、友军截断、多杀成长',()=>{
 for(const kind of ['archer','spearman']){const s=grant(F(U('u','player',kind,2,4)),'u',10);for(const bad of [-1,4,1.5])A.strictEqual(up(s,'u','direction',bad),s);}
 let s=F(U('u','player','spearman',2,4),U('e1','enemy','pawn',2,5),U('e2','enemy','pawn',2,7),U('other','enemy','pawn',3,4));G(s,'u').directionPaid[0]=2;s=R.submitDirection(s,'u',0).state;A.equal(G(s,'e1'),undefined);A.equal(G(s,'e2'),undefined);A.ok(G(s,'other'));A.deepEqual([G(s,'u').kills,G(s,'u').level,G(s,'u').sp],[2,3,2]);
 s=F(U('u','player','spearman',2,4),U('e1','enemy','pawn',2,5),U('ally','player','horse',2,6),U('e2','enemy','pawn',2,7));G(s,'u').directionPaid[0]=2;s=R.submitDirection(s,'u',0).state;A.equal(G(s,'e1'),undefined);A.ok(G(s,'ally'));A.ok(G(s,'e2'));A.strictEqual(R.submitDirection(s,'u',1).state,s);
});

test('T51-T56 车空冲、先移后冲、封额、独立升级、非法条件和杀将',()=>{
 let s=F(U('r','player','rook',1,1));s=act(s,'r',{x:1,y:2},'charge');A.deepEqual([G(s,'r').x,G(s,'r').rookMoveAvailable,G(s,'r').rookChargeAvailable],[1,false,false]);A.strictEqual(R.submit(s,'r',{x:2,y:2},'rook-move').state,s);
 s=F(U('r','player','rook',1,1),U('e','enemy','rook',4,4));Object.assign(G(s,'r'),{sp:1,rookChargeRange:2});s=act(s,'r',{x:1,y:4},'rook-move');A.deepEqual([G(s,'r').ap,G(s,'r').rookMoveAvailable,G(s,'r').rookChargeAvailable],[1,false,true]);s=up(s,'r','rook-charge');A.equal(G(s,'r').rookChargeRange,3);s=act(s,'r',{x:4,y:4},'charge');A.equal(G(s,'r').x,3);
 s=F(U('r','player','rook',2,6),U('friend','player','horse',3,6));A.strictEqual(R.submit(s,'r',{x:2,y:6},'charge').state,s);A.strictEqual(R.submit(s,'r',{x:3,y:6},'charge').state,s);G(s,'r').rookChargeRange=2;Object.assign(G(s,'boss'),{x:2,y:7,hp:1});s.wave=2;s=act(s,'r',{x:2,y:7},'charge');A.equal(R.at(s,{x:2,y:7}).id,'r');A.equal(s.result,'victory');
});

test('T57-T60 四向封顶、direction 命令、9×9、两波、炮 NE',()=>{
 let s=F(U('a','player','archer',3,3),U('e','enemy','pawn',3,4));grant(s,'a',30);for(let d=0;d<4;d++)for(let i=0;i<6;i++)s=up(s,'a','direction',d);A.deepEqual(G(s,'a').directionPaid,[6,6,6,6]);for(let d=0;d<4;d++)A.strictEqual(up(s,'a','direction',d),s);A.equal(R.directionalAction(s,'a',undefined),undefined);A.equal(R.directionalAction(s,'a',4),undefined);A.ok(R.directionalAction(s,'a',0));
 s=R.newGame();A.deepEqual([R.CONFIG.width,R.CONFIG.height,R.CONFIG.river],[9,9,4]);A.equal(s.units.filter(u=>u.side==='enemy').length,8);for(const p of [{x:8,y:0},{x:0,y:8},{x:8,y:8}])A.equal(R.inside(p),true);for(const p of [{x:9,y:0},{x:0,y:9},{x:-1,y:0},{x:0,y:-1}])A.equal(R.inside(p),false);const shop=R.copy(s);shop.phase='shop';shop.units=shop.units.filter(u=>u.side==='player');const w2=R.nextWave(shop);A.equal(w2.units.filter(u=>u.side==='enemy').length,8);A.deepEqual(w2.units.filter(u=>u.side==='enemy').map(u=>[u.kind,u.x,u.y]),R.CONFIG.waves[1]);
 s=F(U('c','player','cannon',2,0),U('screen','player','horse',2,2),U('target','enemy','rook',2,4),U('ne','enemy','pawn',3,5));grant(s,'c',8);s=up(s,'c','cannon-splash',1);s=act(s,'c',{x:2,y:4});A.equal(G(s,'ne'),undefined);s=grant(F(U('c','player','cannon',2,0)),'c',8);for(let i=0;i<8;i++)s=up(s,'c','cannon-splash',i);A.equal(G(s,'c').cannonMask,255);A.equal(G(s,'c').directionPaid.length,4);
});

test('士专项：宫内米字、意图、炮架、马腿、禁止推出宫',()=>{
 let s=F(U('a','enemy','advisor',4,7));let a=G(s,'a');A.ok(R.actionAt(s,a,{x:3,y:8}));A.ok(R.actionAt(s,a,{x:5,y:6}));A.equal(R.actionAt(s,a,{x:4,y:8}),undefined);A.equal(R.actionAt(s,a,{x:2,y:7}),undefined);s.intents=R.generateIntents(s);A.ok(s.intents.find(i=>i.actor==='a'));
 s=F(U('h','player','horse',0,5),U('a','enemy','advisor',1,5));A.equal(R.actionAt(s,G(s,'h'),{x:2,y:6}),undefined);s=F(U('c','player','cannon',2,4),U('a','enemy','advisor',2,6),U('target','enemy','rook',2,7));A.ok(R.actionAt(s,G(s,'c'),{x:2,y:7}));
 s=F(U('r','player','rook',3,8),U('a','enemy','advisor',5,8));Object.assign(G(s,'boss'),{x:4,y:7});Object.assign(G(s,'r'),{rookChargeRange:2,rookPush:true});Object.assign(G(s,'a'),{hp:2,maxHp:2});s=act(s,'r',{x:5,y:8},'charge');A.deepEqual([G(s,'a').x,G(s,'a').y],[5,8]);
});

test('US-002 河道、宫、外缘与炮跨8步',()=>{
 let s=F(U('p','player','pawn',4,3),U('e','enemy','pawn',6,5));A.ok(R.actionAt(s,G(s,'p'),{x:4,y:4}));s=act(s,'p',{x:4,y:4});A.equal(R.actionAt(s,G(s,'p'),{x:5,y:4}),undefined);G(s,'p').ap=1;s=act(s,'p',{x:4,y:5});A.ok(R.actionAt(s,G(s,'p'),{x:5,y:5}));A.equal(R.actionAt(s,G(s,'p'),{x:4,y:4}),undefined);
 s=F(U('e','enemy','pawn',4,5));A.ok(R.actionAt(s,G(s,'e'),{x:4,y:4}));G(s,'e').y=4;A.equal(R.actionAt(s,G(s,'e'),{x:3,y:4}),undefined);G(s,'e').y=3;A.ok(R.actionAt(s,G(s,'e'),{x:3,y:3}));A.equal(R.actionAt(s,G(s,'e'),{x:4,y:4}),undefined);
 s=R.emptyState([U('king','player','king',4,0),U('boss','enemy','king',8,8),U('r','player','rook',4,8),U('p','enemy','pawn',4,5)]);G(s,'p').hp=G(s,'p').maxHp=2;G(s,'r').rookChargeRange=3;G(s,'r').rookPush=true;standby(s);s=act(s,'r',{x:4,y:5},'charge');A.deepEqual([G(s,'p').x,G(s,'p').y],[4,4]);A.equal(R.actionAt(s,G(s,'p'),{x:3,y:4}),undefined);
 s=F(U('c','player','cannon',0,0),U('screen','player','horse',0,4),U('target','enemy','rook',0,8));const shot=R.actionAt(s,G(s,'c'),{x:0,y:8});A.ok(shot);A.equal(shot.path.length,8);
 for(let i=1;i<=8;i++)for(const u of R.fixtureState('P'+i).units)A.equal(R.inside(u),true,`P${i}:${u.id}`);const river=R.fixtureState('P1','river-edge');A.ok(R.actionAt(river,G(river,'pawn'),{x:4,y:4}));A.ok(R.actionAt(river,G(river,'rook'),{x:0,y:3},'rook-move'));
});
