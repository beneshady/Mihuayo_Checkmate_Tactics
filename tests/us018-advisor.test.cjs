// US-018 我方仕（固定防御塔）：S01–S14 规则级定向回归 + 首轮验收退修 R1/R2。
// 运行：node tests/us018-advisor.test.cjs
// 说明：本文件显式构造/注入局面作为专项证据，不代表正常浏览器流程；S15 由 tests/us018-advisor-browser.cjs 覆盖。
const {test}=require('node:test');
const A=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../web/js/rules.js');
const p=(id,k,x,y)=>R.unit(id,'player',k,x,y),e=(id,k,x,y)=>R.unit(id,'enemy',k,x,y);
const g=(s,id)=>s.units.find(u=>u.id===id);
const LEFT={x:3,y:1},RIGHT={x:5,y:1};
function st(...us){const s=R.emptyState([p('king','king',4,0),e('boss','king',4,8),...us]);s.phase='player';s.intents=[];return s;}
function shop(gold){const s=R.newGame();s.phase='intermission';s.gold=gold;return s;}
function towers(s){return s.units.filter(u=>u.side==='player'&&u.kind==='advisor');}
function lastFire(s,id){return g(s,id).lastFireTurn;}

test('S01 新旅程无仕；商店 5 金币买入、两座封顶、余额不足不可买、其他售价不变',()=>{
  let s=R.newGame();
  A.equal(s.party.filter(u=>u.kind==='advisor').length,0,'新旅程不赠送仕');
  A.equal(s.units.filter(u=>u.side==='player'&&u.kind==='advisor').length,0);
  s.phase='intermission';s.gold=20;
  const n1=R.buy(s,'advisor');
  A.notStrictEqual(n1,s);A.equal(n1.gold,15,'每座 5 金币');
  const n2=R.buy(n1,'advisor');
  A.equal(n2.gold,10,'第二座 5 金币');
  const n3=R.buy(n2,'advisor');
  A.strictEqual(n3,n2,'最多持有两座：第三座拒绝');
  A.equal(n2.party.filter(u=>u.kind==='advisor').length,2);
  A.equal(n2.activeIds.length,R.newGame().activeIds.length+2,'仕在 activeIds 但不占 8 人名额');
  const poor=Object.assign(R.copy(s),{gold:4});
  A.strictEqual(R.buy(poor,'advisor'),poor,'余额不足不可买，不扣金币');
  const price={};for(const kind of ['pawn','rook','horse','cannon']){const base=shop(20),bought=R.buy(base,kind);price[kind]=base.gold-bought.gold;}
  A.deepEqual(price,{pawn:3,rook:5,horse:5,cannon:8},'既有兵车马炮价格不变');
});

test('S02 下一关固定侧位：第一座默认左侧、可选右侧、两座可交换、队友占位不覆盖、不占8人额、不受主帅buff、开战后不可移动换边',()=>{
  let s=shop(20);s=R.buy(R.buy(s,'advisor'),'advisor');
  s=R.nextLevel(s);
  A.equal(s.phase,'deploy');
  const [a,b]=towers(s);
  A.deepEqual([a.x,a.y],[LEFT.x,LEFT.y],'第一座默认左侧');
  A.deepEqual([b.x,b.y],[RIGHT.x,RIGHT.y],'第二座占另一侧位');
  A.equal(new Set(s.units.map(u=>u.x+','+u.y)).size,s.units.length,'无叠子');
  const swap=R.deploy(s,a.id,RIGHT);
  A.notStrictEqual(swap,s,'两座可交换侧位');
  A.deepEqual([g(swap,a.id).x,g(swap,a.id).y],[RIGHT.x,RIGHT.y]);
  A.deepEqual([g(swap,b.id).x,g(swap,b.id).y],[LEFT.x,LEFT.y]);
  A.strictEqual(R.deploy(s,a.id,{x:4,y:1}),s,'只能落在两个固定侧位');
  A.strictEqual(R.deploy(s,a.id,{x:0,y:1}),s,'不能落到其他格');
  // 单座 + 队友占住另一侧位：拒绝并提示先移开，不覆盖
  let one=shop(5);one=R.buy(one,'advisor');one=R.nextLevel(one);
  const t1=towers(one)[0],mate=g(one,'rook');
  const placed=R.deploy(one,mate.id,RIGHT);
  A.notStrictEqual(placed,one,'队友可占住另一侧位作为冲突场景');
  A.strictEqual(R.deploy(placed,t1.id,RIGHT),placed,'侧位被队友占据时拒绝交换，不覆盖');
  // 8 人上满仍可有两座仕，且编队不被挤到后备
  let full=R.newGame();full.phase='intermission';full.gold=60;
  for(let i=0;i<10;i++)full=R.buy(full,'pawn');
  A.equal(full.activeIds.filter(id=>full.party.find(u=>u.id===id).kind!=='advisor').length,8);
  full=R.buy(R.buy(full,'advisor'),'advisor');
  A.equal(full.activeIds.filter(id=>full.party.find(u=>u.id===id).kind==='advisor').length,2,'仕不占 8 人名额');
  A.ok(full.activeIds.length>=10);
  const roster=R.setActiveRoster(full,full.activeIds.filter(id=>full.party.find(u=>u.id===id).kind!=='advisor'));
  A.notStrictEqual(roster,full,'编队提交仍保留仕');
  A.equal(roster.activeIds.filter(id=>roster.party.find(u=>u.id===id).kind==='advisor').length,2,'仕固定上阵，不能被换下');
  A.ok(!roster.bench.some(id=>roster.party.find(u=>u.id===id).kind==='advisor'));
  // 不受主帅 buff，开战后不可移动/换边
  let lvl=R.chooseCommanderBuff(R.nextLevel(roster),'health');
  A.equal(lvl.phase,'player');
  const tower=g(lvl,towers(lvl)[0].id);
  A.deepEqual([tower.maxHp,tower.hp],[2,2],'仕不受坚守 HP buff');
  A.deepEqual(R.legalActions(lvl,tower.id),[],'开战后不能主动移动');
  A.strictEqual(R.submit(lvl,tower.id,{x:tower.x+1,y:tower.y}).state,lvl,'不能提交移动或攻击');
  A.match(R.actionReason(lvl,tower.id,{x:tower.x+1,y:tower.y}),/固定防御装置/);
  A.strictEqual(R.deploy(lvl,tower.id,RIGHT),lvl,'开战后不能换边');
});

test('S03 八邻格（含斜向）可射击、第二格不可、每座只选一个敌人、初始 2HP 伤害 1',()=>{
  const tower=p('a1','advisor',3,1);
  for(const d of R.CONFIG.splash){const s=st(tower);g(s,'king').x=8;g(s,'king').y=8;s.units.push(e('x','pawn',3+d.x,1+d.y));const plan=R.advisorPlan(s);A.equal(plan[0].targetId,'x','八邻格 '+d.name+' 可射击');}
  let s=st(tower);g(s,'king').x=8;s.units.push(e('far','pawn',5,3));
  A.equal(R.advisorPlan(s)[0].targetId,null,'第二格不可射击');
  s=st(tower);s.units.push(e('x','rook',4,2),e('y','rook',2,1));
  const plan=R.advisorPlan(s)[0];
  A.ok(plan.targetId);A.equal(plan.enemyIds.length,2,'射程内多个敌人时全部入候选');
  const out=R.enemyTurn(s);
  const shots=out.effects.filter(x=>x.kind==='advisor');
  A.equal(shots.length,1,'每座每次只开火一次');
  A.equal(shots[0].damage.length,1,'只打击一个敌人');
  A.equal(g(out.state,shots[0].damage[0]).hp,1,'伤害固定 1');
  A.equal(g(out.state,'x').hp+g(out.state,'y').hp,3,'另一个敌人未被伤害');
  A.deepEqual([tower.maxHp,tower.attack],[2,1],'初始 2HP / 伤害 1');
  // 敌方士不因共用 kind 被改：仍 1 HP、攻击 1、宫内米字斜走、不出宫
  const ea=e('ea','advisor',4,7);
  A.deepEqual([ea.maxHp,ea.hp,ea.attack],[1,1,1],'敌士数值不变');
  const es=st();const ad=e('ea','advisor',4,7);es.units.push(ad);
  A.equal(R.actionAt(es,ad,{x:3,y:8})?.type,'move','敌士宫内米字斜走不变');
  const corner=e('ea2','advisor',3,6);const es2=st();es2.units.push(corner);
  A.equal(R.actionAt(es2,corner,{x:4,y:7})?.type,'move','敌士宫内米字斜走保留');
  A.equal(R.actionAt(es2,corner,{x:2,y:6}),undefined,'敌士不能走出九宫');
});

test('S04 结束回合后敌攻前开火、中途推敌不立即开火、不能主动跳过、无目标不进冷却',()=>{
  // 结束回合后、敌攻前：仕先击杀威胁主师的敌人，敌攻不再命中
  let s=st(p('a1','advisor',3,1));
  const foe=e('foe','pawn',4,1);foe.hp=1;s.units.push(foe);
  s.intents=[{actor:'foe',from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'attack',path:[{x:4,y:0}],order:1}];
  A.equal(R.dangerNow(s),false,'危险预测先计入仕阶段');
  const out=R.endTurn(s);
  A.equal(out.effects[0].kind,'advisor','仕阶段先于敌方意图执行');
  A.equal(out.effects[0].status,'hit');
  A.equal(g(out.state,'foe'),undefined,'目标在敌攻前被仕击杀');
  A.equal(g(out.state,'king').hp,3,'敌攻被取消，主帅未受伤');
  A.equal(out.state.turn,2,'仕阶段不额外推进回合');
  // 中途推敌入射程：立即结算但不立即开火
  let push=st(p('a1','advisor',3,1));
  const car=p('car','rook',0,1);car.rookRole='charge';car.rookPush=true;push.units.push(car);
  const victim=e('victim','rook',1,1);victim.hp=victim.maxHp=4;push.units.push(victim);
  const before=JSON.parse(JSON.stringify(push));
  const pushed=R.submit(push,'car',{x:1,y:1},'charge');
  A.ok(pushed.effect);
  A.deepEqual([g(pushed.state,'victim').x,g(pushed.state,'victim').y],[2,1],'目标被推入射程');
  A.equal(lastFire(pushed.state,'a1'),null,'推入不立即开火');
  A.equal(g(pushed.state,'victim').hp,3,'推入未造成仕伤害');
  A.equal(pushed.state.turn,1,'无回合推进');
  A.deepEqual(before.intents,push.intents);
  // 不能主动跳过/操作
  A.deepEqual(R.legalActions(push,'a1'),[]);
  A.strictEqual(R.submit(push,'a1',{x:3,y:2}).state,push,'不能主动提交仕行动');
  // 就绪但无目标：不进入冷却
  const idle=R.endTurn(st(p('a1','advisor',3,1),p('b1','advisor',5,1)));
  A.equal(lastFire(idle.state,'a1'),null,'无目标保持就绪');
  A.deepEqual(idle.effects.filter(x=>x.kind==='advisor'),[]);
});

test('S05 冷却节奏：3 档第 1/4/7 回合、2 档第 1/3/5、1 档每回合，无 off-by-one',()=>{
  function cycle(interval,turns){
    const tower=p('a1','advisor',3,1);tower.towerInterval=interval;
    let s=st(tower);const fired=[];
    for(let t=1;t<=turns;t++){
      s.units=s.units.filter(u=>u.id!=='foe');
      s.units.push(e('foe','pawn',4,2),e('boss','king',4,8));
      s.units=s.units.filter((u,i,arr)=>arr.findIndex(v=>v.id===u.id)===i);
      const out=R.endTurn(s);s=out.state;
      if(out.effects.some(x=>x.kind==='advisor'&&x.status==='hit'))fired.push(t);
    }
    return fired;
  }
  A.deepEqual(cycle(3,10),[1,4,7,10],'间隔 3：1/4/7/10');
  A.deepEqual(cycle(2,7),[1,3,5,7],'间隔 2：1/3/5/7');
  A.deepEqual(cycle(1,5),[1,2,3,4,5],'间隔 1：每回合');
});

test('S06 选敌优先级：距帅最近→当前HP最低→行列升序；帅移动后重排',()=>{
  const tower=p('a1','advisor',3,1);
  let s=st(tower);
  s.units.push(e('near','rook',4,2),e('far','rook',1,0));
  s.units.find(u=>u.id==='far').hp=1;
  A.equal(R.advisorPlan(s)[0].targetId,'near','先比距帅距离（(4,2) 距 2 格，(2,1) 距 3 格）');
  s=st(tower);
  s.units.push(e('hi','rook',4,2),e('lo','rook',2,1));
  s.units.find(u=>u.id==='hi').hp=2;s.units.find(u=>u.id==='lo').hp=1;
  A.equal(R.advisorPlan(s)[0].targetId,'lo','同距离优先低 HP');
  s=st(tower);
  s.units.push(e('down','rook',4,2),e('left','rook',2,1));
  A.equal(R.advisorPlan(s)[0].targetId,'left','完全平局按玩家坐标行升序、再列升序（(3,2) 先于 (5,3)）');
  const moved=R.copy(s);g(moved,'king').x=4;g(moved,'king').y=4;
  A.equal(R.advisorPlan(moved)[0].targetId,'down','帅移动后按新位置重排（(5,3) 距 2 格、(3,2) 距 3 格）');
});

test('S07 两座同一局面锁定：1HP 敌人消耗两次攻击、不转火、奖励仅一次',()=>{
  const a=p('a1','advisor',3,1),b=p('b1','advisor',5,1);
  const s=st(a,b);
  const foe=e('foe','rook',4,2);foe.hp=1;s.units.push(foe);
  const out=R.enemyTurn(s);
  const shots=out.effects.filter(x=>x.kind==='advisor');
  A.equal(shots.length,2,'两座都开火');
  A.deepEqual(shots.map(x=>x.target),['foe','foe'],'两座锁定同一目标，不因先杀转火');
  A.deepEqual(shots.map(x=>x.status),['hit','hit'],'溢出命中仍消耗攻击');
  A.equal(g(out.state,'foe'),undefined);
  A.equal(out.state.teamSp,1,'击杀奖励只发一次');
  A.equal(Object.keys(out.state.killLedger).length,1,'击杀账本去重');
  A.deepEqual([lastFire(out.state,'a1'),lastFire(out.state,'b1')],[1,1],'两座都进入冷却');
  A.deepEqual([g(out.state,'a1').kills,g(out.state,'b1').kills],[1,0],'首个使 HP 归零的命中共记个人击杀');
  A.equal(out.state.kills,1);
});

test('S08 树林闪避两座独立判定：零/一/二次命中，均消耗攻击，预览不标必杀',()=>{
  const build=()=>{const s=st(p('a1','advisor',3,1),p('b1','advisor',5,1));const foe=e('foe','rook',4,2);foe.hp=foe.maxHp=5;s.units.push(foe);s.tiles={'4,2':'forest'};return s;};
  function seedFor(pattern){
    for(let seed=1;seed<200000;seed++){const c=R.copy(build());c.rng=seed;const got=R.advisorPhase(c).effects.map(x=>x.status);if(got.join()===pattern.join())return seed;}
    throw Error('未找到随机种子 '+pattern);
  }
  const cases=[['hit','hit'],['hit','miss'],['miss','hit'],['miss','miss']];
  for(const pattern of cases){
    const s=build();s.rng=seedFor(pattern);
    const out=R.advisorPhase(s);
    A.deepEqual(out.effects.map(x=>x.status),pattern,'独立随机：'+pattern.join('/'));
    A.deepEqual(out.effects.map(x=>x.conditional),[true,true],'树林条件伤害');
    A.deepEqual([lastFire(out.state,'a1'),lastFire(out.state,'b1')],[1,1],'闪避也消耗攻击并进入冷却');
    const hits=pattern.filter(x=>x==='hit').length;
    A.equal(g(out.state,'foe').hp,5-hits,'伤害等于命中次数');
    A.equal(out.state.teamSp,hits===2&&g(out.state,'foe')?0:0,'未击杀不发公共 SP');
  }
  const s=build();s.rng=seedFor(['miss','miss']);
  const pure=JSON.stringify(s);R.enemyTurn(s,true);A.equal(JSON.stringify(s),pure,'预览不消耗随机/不推进冷却');
  const preview=R.enemyTurn(s,true);
  A.equal(preview.effects.filter(x=>x.kind==='advisor').every(x=>x.conditional),true,'预览标注树林非必杀');
  A.equal(preview.conditional,true);
});

test('S09 升级只缩短间隔：3 SP→2、5 SP→1、只升级所选；不足/满级/重复不扣；禁止强健',()=>{
  const s=st(p('a1','advisor',3,1),p('b1','advisor',5,1));s.teamSp=8;
  A.strictEqual(R.purchaseUpgrade(s,'a1','fortify'),s,'禁止强健');
  A.strictEqual(R.purchaseUpgrade(s,'a1','combo'),s);
  A.equal(s.teamSp,8,'拒绝不扣公共 SP');
  const up1=R.purchaseUpgrade(s,'a1','advisor-interval');
  A.equal(up1.teamSp,5,'第一次升级 3 公共 SP');
  A.equal(g(up1,'a1').towerInterval,2);
  A.equal(g(up1,'b1').towerInterval,3,'只升级所选仕');
  const up2=R.purchaseUpgrade(up1,'a1','advisor-interval');
  A.equal(up2.teamSp,0,'第二次升级 5 公共 SP');
  A.equal(g(up2,'a1').towerInterval,1);
  A.strictEqual(R.purchaseUpgrade(up2,'a1','advisor-interval'),up2,'满级不再接受购买');
  A.equal(R.purchaseUpgrade(s,'a1','advisor-interval').teamSp,5,'同一局面重复提交结果一致，不重复扣款');
  const poor=st(p('a1','advisor',3,1));poor.teamSp=2;
  A.strictEqual(R.purchaseUpgrade(poor,'a1','advisor-interval'),poor,'不足 3 SP 拒绝');
  poor.teamSp=4;A.strictEqual(R.purchaseUpgrade(poor,'a1','advisor-interval').teamSp,1,'恰好够 3 SP 扣至 1');
  const maxed=R.copy(up2);maxed.teamSp=9;
  A.strictEqual(R.purchaseUpgrade(maxed,'a1','advisor-interval'),maxed,'满级即使有 SP 也拒绝');
  A.equal(g(up2,'a1').maxHp,2,'升级不增加 HP');
  A.equal(g(up2,'a1').attack,1,'升级不增加攻击');
  A.deepEqual(R.advisorPlan(R.copy(up2)).find(x=>x.id==='a1').interval,1,'档位立即生效');
});

test('S10 冷却途中升级保留已等待回合：满足新间隔本回合末才开火，购买当刻不开火',()=>{
  let s=st(p('a1','advisor',3,1));s.teamSp=3;
  g(s,'a1').lastFireTurn=1;s.turn=2;
  let plan=R.advisorPlan(s)[0];
  A.deepEqual([plan.ready,plan.remaining],[false,2],'3 档第 2 回合尚未就绪');
  s=R.purchaseUpgrade(s,'a1','advisor-interval');
  A.equal(g(s,'a1').lastFireTurn,1,'升级保留已等待回合');
  plan=R.advisorPlan(s)[0];
  A.deepEqual([plan.ready,plan.remaining],[false,1],'按新间隔重算：仍差 1 回合');
  s.units.push(e('foe','pawn',4,2));
  const buying=s;
  A.equal(g(buying,'foe').hp,1,'点击升级不立即攻击');
  s.turn=3;
  const out=R.enemyTurn(s);
  A.equal(out.effects.filter(x=>x.kind==='advisor'&&x.status==='hit').length,1,'第 3 回合满足新间隔后开火');
  A.equal(lastFire(out.state,'a1'),3);
  // 文档示例：第 1 回合开火、第 3 回合升到 2 档 → 第 3 回合末可开火
  let doc=st(p('a1','advisor',3,1));doc.teamSp=3;g(doc,'a1').lastFireTurn=1;doc.turn=3;
  A.equal(R.advisorPlan(doc)[0].ready,false,'3 档第 3 回合尚未满足间隔');
  doc=R.purchaseUpgrade(doc,'a1','advisor-interval');
  A.equal(g(doc,'a1').towerInterval,2);
  A.equal(R.advisorPlan(doc)[0].ready,true,'升级到 2 档后第 3 回合末满足间隔');
});

test('S11 第二波不重置冷却；新关满血保留档位并就绪；毁掉/毁骸的仕恢复；失败按入关快照还原',()=>{
  // 第二波
  let wave=st(p('a1','advisor',3,1),p('b1','advisor',5,1));wave.turn=5;g(wave,'a1').lastFireTurn=4;g(wave,'a1').towerInterval=3;
  const w2=R.endTurn(wave).state;
  A.equal(w2.wave,2);
  A.equal(lastFire(w2,'a1'),4,'换波不重置冷却');
  // 新关：满血、保留档位、就绪
  let s=shop(20);s=R.buy(R.buy(s,'advisor'),'advisor');
  s.party.filter(u=>u.kind==='advisor')[0].towerInterval=1;
  const lvl=R.nextLevel(s);
  const [a,b]=towers(lvl);
  A.deepEqual([a.x,a.y,b.x,b.y],[LEFT.x,LEFT.y,RIGHT.x,RIGHT.y]);
  A.deepEqual([a.hp,a.maxHp,b.hp,b.maxHp],[2,2,2,2],'新关满血');
  A.deepEqual([a.towerInterval,b.towerInterval],[1,3],'保留已买档位');
  A.deepEqual([a.lastFireTurn,b.lastFireTurn],[null,null],'新关冷却就绪');
  // 仕被摧毁：留残骸，下一关恢复
  lvl.phase='player';
  const killed=R.copy(lvl);
  g(killed,a.id).hp=1;
  killed.units.push(e('killer','rook',4,1));
  g(killed,'killer').hp=g(killed,'killer').maxHp=4;
  killed.intents=[{actor:'killer',from:{x:4,y:1},to:{x:3,y:1},offset:{x:-1,y:0},type:'charge',path:[{x:3,y:1}],order:1}];
  const dead=R.enemyPhase(killed).state;
  A.equal(g(dead,a.id),undefined,'仕 HP 归零后移除本体');
  A.ok(dead.corpses.some(c=>c.unit.id===a.id),'留下可推动残骸');
  dead.phase='intermission';
  const revive=R.nextLevel(dead);
  A.ok(towers(revive).some(u=>u.id===a.id&&u.hp===2),'被毁的仕下一关恢复满血');
  A.ok(towers(revive).some(u=>u.id===b.id&&u.hp===2),'另一座同样满血');
  // 失败重试：入关快照还原（不含本关新升级/花费）
  let run=shop(20);run=R.buy(run,'advisor');const lv2=R.nextLevel(run);
  lv2.phase='player';
  const entrySnap=JSON.parse(JSON.stringify(lv2.levelSnapshot));
  const tid=towers(lv2)[0].id;
  lv2.teamSp=5;const upgraded=R.purchaseUpgrade(lv2,tid,'advisor-interval');
  A.equal(upgraded.teamSp,2,'本关内花 3 SP 升到 2 档');
  upgraded.phase='result';upgraded.result='dead';
  const retried=R.retryLevel(upgraded);
  A.equal(retried.phase,'deploy');
  A.equal(retried.teamSp,entrySnap.teamSp,'失败重试回滚本关升级花费');
  const rt=towers(retried).find(u=>u.id===tid);
  A.equal(rt.towerInterval,3,'失败重试回到入关档位');
  A.deepEqual([rt.hp,rt.lastFireTurn],[2,null],'重试满血就绪');
});

test('S12 位移免疫不是伤害免疫：活仕不可推/拉、普通攻击扣血、被推撞双方各 1 且不连锁',()=>{
  const s=st(p('a1','advisor',3,1));
  const car=p('car','rook',4,1);car.rookRole='pull';s.units.push(car);
  A.strictEqual(R.actionAt(s,car,{x:3,y:1},'pull'),undefined,'牵引不能移动活仕');
  // 普通攻击可伤害，且受击不位移
  const hit=st(p('a1','advisor',3,1));
  hit.units.push(e('enemy','rook',4,1));
  hit.intents=[{actor:'enemy',from:{x:4,y:1},to:{x:3,y:1},offset:{x:-1,y:0},type:'charge',path:[{x:3,y:1}],order:1}];
  const after=R.enemyPhase(hit).state;
  A.equal(g(after,'a1').hp,1,'仕承受正常攻击 1 点');
  A.deepEqual([g(after,'a1').x,g(after,'a1').y],[3,1],'受击不位移');
  // 带震退的冲击：活仕不可被推动，位置不变但仍受 1 伤害
  const bump=st(p('a1','advisor',3,1));
  const frog=e('frog','rook',4,1);frog.rookPush=true;bump.units.push(frog);
  bump.intents=[{actor:'frog',from:{x:4,y:1},to:{x:3,y:1},offset:{x:-1,y:0},type:'charge',path:[{x:3,y:1}],order:1}];
  const pushed=R.enemyPhase(bump);
  A.equal(pushed.effects[0].pushStatus,'immovable','固定装置不被推动');
  A.deepEqual([g(pushed.state,'a1').x,g(pushed.state,'a1').y],[3,1]);
  A.equal(g(pushed.state,'a1').hp,1,'撞击仍造成 1 伤害');
  // 被推单位撞到仕：双方各 1，位置不变，不传递
  const col=st(p('a1','advisor',3,1));
  const pusher=e('pusher','rook',5,1);pusher.rookPush=true;col.units.push(pusher);
  const body=p('body','rook',4,1);body.hp=body.maxHp=4;col.units.push(body);
  col.intents=[{actor:'pusher',from:{x:5,y:1},to:{x:4,y:1},offset:{x:-1,y:0},type:'charge',path:[{x:4,y:1}],order:1}];
  const res=R.enemyPhase(col);
  A.equal(res.effects[0].pushStatus,'collision-advisor');
  A.deepEqual([g(res.state,'body').x,g(res.state,'body').y],[4,1],'不连锁移动');
  A.deepEqual([g(res.state,'a1').x,g(res.state,'a1').y],[3,1]);
  A.equal(g(res.state,'a1').hp,1,'仕受 1 碰撞');
  A.equal(g(res.state,'body').hp,2,'被推单位受 1 碰撞（直接 1 + 碰撞 1）');
});

test('S13 死亡留残骸占格、可推、入水销毁、不可治疗/复活；残骸仍可作炮架',()=>{
  let s=st(p('a1','advisor',3,1));
  s.units.push(e('killer','rook',4,1));
  g(s,'a1').hp=1;
  s.intents=[{actor:'killer',from:{x:4,y:1},to:{x:3,y:1},offset:{x:-1,y:0},type:'charge',path:[{x:3,y:1}],order:1}];
  const dead=R.enemyPhase(s).state;
  const body=dead.corpses.find(c=>c.unit.id==='a1');
  A.ok(body,'死亡留残骸');
  A.deepEqual([body.x,body.y],[3,1],'残骸占据原格');
  A.ok(R.occupied(dead,{x:3,y:1}),'残骸占格阻挡');
  // 不可治疗/复活
  const rescuePhase=Object.assign(R.copy(dead),{phase:'rescue',commanderBuff:'rescue',rescueUsed:false});
  A.strictEqual(R.rescue(rescuePhase,'a1'),rescuePhase,'仕不能被救援复活');
  // 残骸仍可作炮架
  const rack=st();rack.corpses=[{id:'corpse-a1',x:3,y:1,unit:p('a1','advisor',3,1)}];
  const cannon=p('can','cannon',3,0);rack.units.push(cannon);
  rack.units.push(e('target','rook',3,3));
  A.ok(R.actionAt(rack,cannon,{x:3,y:3}),'残骸可当炮架');
  // 可推动，入水销毁
  const push=st();push.corpses=[{id:'corpse-a1',x:3,y:1,unit:p('a1','advisor',3,1)}];
  const rook=p('cr','rook',2,1);rook.rookRole='charge';rook.rookPush=true;push.units.push(rook);
  const moved=R.submit(push,'cr',{x:3,y:1},'charge');
  A.deepEqual([moved.state.corpses[0].x,moved.state.corpses[0].y],[4,1],'残骸可被推动');
  const drown=st();drown.tiles={'4,1':'water'};
  drown.corpses=[{id:'corpse-a1',x:3,y:1,unit:p('a1','advisor',3,1)}];
  const cr2=p('cr2','rook',2,1);cr2.rookRole='charge';cr2.rookPush=true;drown.units.push(cr2);
  const sunk=R.submit(drown,'cr2',{x:3,y:1},'charge');
  A.equal(sunk.state.corpses.length,0,'残骸入水销毁');
  A.equal(g(sunk.state,'a1'),undefined,'不复活');
});

test('S14 预览纯净且与实际流水线一致：仕先敌后、无状态/随机/奖励副作用、不提前击杀',()=>{
  const s=st(p('a1','advisor',3,1));
  const foe=e('foe','pawn',4,1);foe.hp=1;s.units.push(foe);
  s.intents=[{actor:'foe',from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'attack',path:[{x:4,y:0}],order:1}];
  const before=JSON.stringify(s);
  const plan=R.advisorPlan(s);
  const preview=R.enemyTurn(s,true);
  A.equal(JSON.stringify(s),before,'预览与规划不改战局');
  A.equal(preview.effects[0].status,'hit');
  A.equal(g(preview.state,'foe'),undefined,'预览按仕先敌后预测击杀');
  A.equal(g(preview.state,'king').hp,3,'预览中敌攻被取消');
  A.equal(preview.state.revision,s.revision,'预览不推进版本');
  A.equal(preview.state.teamSp,s.teamSp,'预览不发奖/不加公共 SP');
  A.deepEqual(Object.keys(preview.state.killLedger),[],'预览不写击杀账本');
  const real=R.enemyTurn(s);
  A.deepEqual(real.effects.map(x=>[x.actor,x.status]),preview.effects.map(x=>[x.actor,x.status]),'预测与实际一致');
  A.equal(real.state.teamSp,1,'实际击杀发一次公共 SP');
  A.equal(plan[0].targetId,'foe');
  // 冷却中的仕不参与预测，危险预测与实战一致
  const cooling=R.copy(s);g(cooling,'a1').lastFireTurn=1;cooling.turn=2;
  A.equal(R.advisorPlan(cooling)[0].willFire,false);
  A.equal(R.dangerNow(cooling),true,'冷却中则敌攻命中主帅');
  const coolingReal=R.enemyTurn(cooling);
  A.ok(coolingReal.effects.some(x=>x.kind!=='advisor'&&x.damage.includes('king')));
  // 分析器与流水线一致：能靠仕阶段解围
  const safe=st(p('a1','advisor',3,1));const threat=e('threat','pawn',4,1);threat.hp=1;safe.units.push(threat);
  safe.units.push(p('ally','rook',0,1));
  Object.assign(g(safe,'king'),{ap:0});
  safe.intents=[{actor:'threat',from:{x:4,y:1},to:{x:4,y:0},offset:{x:0,y:-1},type:'attack',path:[{x:4,y:0}],order:1}];
  A.equal(R.dangerNow(safe),false);
  A.equal(R.analyze(R.copy(safe)).safe,true,'解围分析不把已可解围的局判为失败');
});

test('R1 救援死锁：只剩主帅与仕残骸时不进入救援、直接第二波；救援名单只含合法对象，UI 死亡名单排除仕/装置',()=>{
  // 仅仕残骸：无合法救援对象，必须直接走既有第二波流程，不能卡在 rescue
  let s=st();s.turn=5;s.commanderBuff='rescue';s.rescueUsed=false;
  s.corpses=[{id:'corpse-a1',x:3,y:1,unit:p('a1','advisor',3,1)}];
  const n=R.endTurn(s).state;
  A.equal(n.turn,6);
  A.equal(n.phase,'player','无可救援对象时不进入救援阶段');
  A.equal(n.wave,2,'直接进入第二波');
  A.ok(n.pendingSpawns.some(w=>w.status==='spawned'),'第二波正常出场');
  // 有普通队友残骸：仍进入救援；仕不能作为救援对象，普通队友可以
  let t=st();t.turn=5;t.commanderBuff='rescue';t.rescueUsed=false;
  t.corpses=[{id:'corpse-a1',x:3,y:1,unit:p('a1','advisor',3,1)},{id:'corpse-p1',x:2,y:2,unit:p('p1','pawn',2,2)}];
  const r=R.endTurn(t).state;
  A.equal(r.phase,'rescue','有合法对象时进入救援');
  A.strictEqual(R.rescue(r,'a1'),r,'规则层拒绝救援仕');
  const ok=R.rescue(r,'p1');
  A.notStrictEqual(ok,r,'普通队友可救援');
  A.equal(ok.phase,'player');A.equal(ok.wave,2);
  // 规则层与 UI 共用同一“合法救援对象”判定
  A.equal(R.commanderTarget(p('x','advisor',3,1)),false,'仕不是救援对象');
  A.equal(R.commanderTarget(Object.assign(p('y','rook',3,1),{device:true})),false,'装置不是救援对象');
  A.equal(R.commanderTarget(p('z','rook',3,1)),true);
  const src=fs.readFileSync(path.join(__dirname,'../web/js/app.js'),'utf8');
  A.match(src,/\.map\(c=>c\.unit\)\.filter\(R\.commanderTarget\)/,'UI 死亡名单排除仕/装置');
});

test('R2 初始化侧位冲突：保留队友原位置、仕进待布置、腾格后可放置、未清空不可确认、不新增后备',()=>{
  // 专项地图：车的默认位与前方被水占据，初始化时车自然落到左侧侧位 (3,1)，与仕侧位冲突
  const map=R.defaultMap();
  ['0,0','1,0','2,0','3,0','5,0','6,0','7,0','8,0','0,1','1,1','2,1'].forEach(k=>map.tiles[k]='water');
  const base=R.newGame(map);
  A.deepEqual([g(base,'rook').x,g(base,'rook').y],[LEFT.x,LEFT.y],'冲突夹具：无仕时车落左侧侧位');
  let inter=R.newGame(map);inter.phase='intermission';inter.gold=10;
  inter=R.buy(inter,'advisor');
  const one=R.nextLevel(inter,map);
  const advId=one.party.find(u=>u.kind==='advisor').id;
  A.deepEqual([g(one,'rook').x,g(one,'rook').y],[LEFT.x,LEFT.y],'初始化不挤走侧位队友');
  A.deepEqual(one.pendingAdvisorIds,[advId],'冲突仕转入待布置');
  A.equal(g(one,advId),undefined,'待布置仕没有棋子占格');
  A.equal(towers(one).length,0);
  A.equal(new Set(one.units.map(u=>u.x+','+u.y)).size,one.units.length,'无叠子');
  A.strictEqual(R.confirmDeployment(one),one,'待布置未清空不可确认');
  A.strictEqual(R.chooseCommanderBuff(one,'health'),one,'不能跳过布阵');
  A.strictEqual(R.deploy(one,advId,LEFT),one,'侧位被队友占据时不覆盖、不挤走');
  A.strictEqual(R.deploy(one,advId,{x:4,y:1}),one,'待布置仕只能落两个固定侧位');
  A.deepEqual([g(one,'rook').x,g(one,'rook').y],[LEFT.x,LEFT.y],'拒绝后队友位置不变');
  const moved=R.deploy(one,'rook',{x:4,y:1});
  A.notStrictEqual(moved,one,'玩家可手动腾格');
  A.deepEqual([g(moved,'rook').x,g(moved,'rook').y],[4,1]);
  const placed=R.deploy(moved,advId,LEFT);
  A.notStrictEqual(placed,moved,'腾格后可放置待布置仕');
  A.deepEqual(placed.pendingAdvisorIds,[],'放置后待布置清空');
  A.equal(towers(placed).length,1);
  A.deepEqual([towers(placed)[0].x,towers(placed)[0].y],[LEFT.x,LEFT.y]);
  A.deepEqual([towers(placed)[0].hp,towers(placed)[0].lastFireTurn],[2,null]);
  A.notStrictEqual(R.confirmDeployment(placed),placed,'全部合法后才可确认');
  // 两座仕：左位冲突时第一座待布置、第二座正常占右位；待布置不是后备，持有数仍按队伍计
  let two=R.newGame(map);two.phase='intermission';two.gold=10;
  two=R.buy(R.buy(two,'advisor'),'advisor');
  const pair=R.nextLevel(two,map);
  const advs=pair.party.filter(u=>u.kind==='advisor').map(u=>u.id);
  A.equal(advs.length,2);
  A.deepEqual(pair.pendingAdvisorIds,[advs[0]],'只有冲突的一座待布置');
  A.equal(towers(pair).length,1,'另一座正常占右侧位');
  A.deepEqual([towers(pair)[0].x,towers(pair)[0].y],[RIGHT.x,RIGHT.y]);
  A.ok(advs.every(id=>pair.activeIds.includes(id)),'待布置仕仍在上阵名单');
  A.ok(advs.every(id=>!pair.bench.includes(id)),'待布置不是后备系统');
  A.strictEqual(R.confirmDeployment(pair),pair,'两座未全部就位不可确认');
  const pairMoved=R.deploy(pair,'rook',{x:4,y:1});
  const pairPlaced=R.deploy(pairMoved,advs[0],LEFT);
  A.deepEqual(pairPlaced.pendingAdvisorIds,[],'第二座腾格后也可放置');
  A.equal(towers(pairPlaced).length,2);
  A.equal(new Set(pairPlaced.units.map(u=>u.x+','+u.y)).size,pairPlaced.units.length,'两座就位后无叠子');
  // UI 静态接线：待布置显示与确认拦截
  const src=fs.readFileSync(path.join(__dirname,'../web/js/app.js'),'utf8');
  A.match(src,/仕待布置/,'布阵面板显示待布置与侧位按钮');
  A.match(src,/仍有仕待布置/,'待布置未清空时确认布阵被拦截');
});
