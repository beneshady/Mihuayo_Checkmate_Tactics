// US-020 规则层验收：主营地、猫粮、人口、旅程增益、救援、快照与存档。
// 只做规则/存档断言；浏览器流程见 tests/us020-acceptance-browser.cjs。夹具余额仅用于边界，不代表正常流程。
const test=require('node:test'),A=require('node:assert/strict'),R=require('../web/js/rules.js'),J=require('../web/js/journey.js');
const G=(s,id)=>s.units.find(u=>u.id===id),P=(s,id)=>(s.party||[]).find(u=>u.id===id);
function camp(gold=0){const s=R.newGame();s.phase='intermission';s.gold=gold;return s;}
function memory(){const values=new Map();return{values,getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>{values.set(k,String(v));},fail:false};}

test('C03 教学关：实际完成结算 1 猫粮，初始队伍无炮无仕、SP 0、人口 4',()=>{
 const s=R.tutorialGame();
 A.equal(s.phase,'player','教学直接进入我方行动，不经过部署与三选一');
 A.equal(s.population,4);
 A.equal(s.teamSp,0);
 A.deepEqual(s.party.map(u=>u.kind),['rook','spearman'],'教学只用帅、车、枪兵');
 A.equal(s.party.some(u=>u.kind==='cannon'||u.kind==='advisor'),false);
 // 真实击杀：枪兵打掉相邻敌兵
 const a=R.directionalAction(s,'tut-spear',0);
 A.deepEqual(a.targets,['w1-2']);
 const after=R.submitAction(s,a).state;
 A.equal(R.tutorialReward(after),1,'教学猫粮按实际击杀结算');
 A.equal(after.gold,0,'未结算前不发放');
});

test('C03/R03 首次入营：+8 猫粮与免费坚守各一次，当前 HP 同步新上限',()=>{
 let s=camp(1);                        // 教学实得 1 猫粮
 s=R.enterCamp(s);
 A.equal(s.firstEntryRewarded,true);
 A.equal(s.gold,9,'教学猫粮 + 8');
 A.deepEqual(s.buffs,{health:true,move:false,rescue:false});
 const rook=P(s,'rook');
 A.equal(rook.maxHp,3);A.equal(rook.hp,3,'获得上限后当前 HP 同步满血');
 const again=R.enterCamp(s);
 A.equal(again.gold,9,'重复入营不重复发奖');
 A.equal(P(again,'rook').maxHp,3,'坚守不叠加');
 A.equal(P(again,'rook').commanderHealth,1);
});

test('C04 首次奖励与队伍状态全队一致：主帅与仕不受坚守影响',()=>{
 let s=camp(0);s.party.push(R.unit('adv-1','player','advisor',0,0));s.activeIds.push('adv-1');
 s=R.enterCamp(s);
 A.equal(P(s,'adv-1').maxHp,2,'仕不享受坚守');
 A.equal(G(s,'king')&&G(s,'king').maxHp,3,'主帅不享受坚守');
 A.equal(P(s,'starting-pawn').maxHp,2,'兵 1→2');
 A.equal(P(s,'starting-pawn-2').maxHp,2,'第二个兵 1→2');
 A.equal(P(s,'starting-horse').maxHp,2,'马 1→2');
});

test('C07 人口扩编：4→8 每次 5 猫粮，满级拒绝，余额 4 拒绝 5 通过',()=>{
 let s=camp(20);
 const seq=[];for(let i=0;i<4;i++){s=R.expandPopulation(s);seq.push([s.population,s.gold]);}
 A.deepEqual(seq,[[5,15],[6,10],[7,5],[8,0]],'依次 5/6/7/8 人口与余额');
 const maxed=R.expandPopulation(s);
 A.strictEqual(maxed,s,'满级拒绝，不赠送人口');
 const poor=camp(4);A.strictEqual(R.expandPopulation(poor),poor,'余额 4 拒绝');
 const exact=camp(5);A.equal(R.expandPopulation(exact).population,5,'余额 5 恰好成功');
 A.equal(R.populationLimit({}),4,'缺省人口 4');
});

test('C08 人口只限上场普通队友：招募不阻断、后备不限、0 与超限不能开战、主帅与仕不占人口',()=>{
 let s=camp(60);
 for(let i=0;i<4;i++)s=R.buy(s,'pawn');
 A.equal(R.activeOrdinary(s).length,4,'人口 4 已满');
 const recruit=R.buy(s,'pawn');
 A.equal(R.activeOrdinary(recruit).length,4,'满员时新队友进后备，不阻断购买');
 A.ok(recruit.bench.length>=1);
 A.strictEqual(R.setActiveRoster(recruit,recruit.activeIds.concat('recruit-pawn-4')),recruit,'超人口拒绝编队');
 let full=R.setActiveRoster(recruit,recruit.activeIds.filter(id=>id!=='rook'));
 A.equal(R.activeOrdinary(full).length,3,'可主动少上阵');
 const board=R.startLevel(full,R.defaultMap());
 A.equal(board.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,3);
 let empty=full;
 A.notStrictEqual(R.confirmDeployment(board),board,'3 人布阵合法');
 // 0 名普通队友：不能确认布阵
 const zero=R.startLevel(camp(0),R.defaultMap());
 zero.units=zero.units.filter(u=>u.side==='enemy'||u.kind==='king');
 A.strictEqual(R.confirmDeployment(zero),zero,'至少 1 名普通队友才能开战');
 // 超人口：专项构造 5 名普通队友
 const over=R.startLevel(camp(0),R.defaultMap());
 over.units.push(R.unit('extra-a','player','pawn',3,1),R.unit('extra-b','player','horse',5,1),R.unit('extra-c','player','archer',6,1));
 A.strictEqual(R.confirmDeployment(over),over,'超过人口不得确认布阵');
 over.population=8;
 A.equal(R.confirmDeployment(over).phase,'player','扩编后同样编队可开战');
 // 仕不占人口
 let withAdvisor=camp(20);withAdvisor=R.buy(withAdvisor,'advisor');
 A.equal(withAdvisor.party.filter(u=>u.kind==='advisor').length,1);
 A.equal(R.activeOrdinary(withAdvisor).length,4,'仕不进普通人口计数');
 A.ok(withAdvisor.activeIds.includes('recruit-advisor-0'),'仕固定上阵');
});

test('C09 招募价格与币种：炮 8、仕 5、兵 3、车 5、马 5，无出售接口',()=>{
 const prices={pawn:3,rook:5,horse:5,cannon:8,advisor:5};
 for(const [kind,price] of Object.entries(prices)){
  const before=camp(price+1),count=before.party.filter(u=>u.kind===kind).length,after=R.buy(before,kind);
  A.equal(after.gold,1,`${kind} 售价 ${price}`);
  A.equal(after.party.filter(u=>u.kind===kind).length,count+1,`${kind} 购入成功`);
 }
 A.equal(typeof R.sell,'undefined','不提供出售/遣散');
 let advisors=camp(20);advisors=R.buy(advisors,'advisor');advisors=R.buy(advisors,'advisor');
 A.equal(advisors.party.filter(u=>u.kind==='advisor').length,2);
 A.strictEqual(R.buy(advisors,'advisor'),advisors,'仕最多两座，第三座拒绝');
 const cannon=R.buy(camp(7),'cannon');A.equal(cannon.gold,7,'猫粮不足时不扣款');
 A.equal(cannon.party.some(u=>u.kind==='cannon'),false);
 A.equal(Object.keys({gold:R.newGame().gold}).length,1,'只有 gold 一个钱包字段');
 A.equal(R.newGame().gold,0,'新局 0 猫粮');
});

test('C10/C11 旅程增益顺序解锁：坚守→疾行→救援，各 5 猫粮且不可跳跃',()=>{
 let s=camp(10);
 A.equal(R.buffUnlockable(s,'move'),false,'没有坚守不能解锁疾行');
 A.equal(R.buffUnlockable(s,'rescue'),false,'没有移动不能解锁救援');
 A.strictEqual(R.unlockBuff(s,'move'),s,'前置不足时拒绝且不扣款');
 A.strictEqual(R.unlockBuff(s,'rescue'),s);
 s=R.enterCamp(s);                                  // 首次入营免费取得坚守
 A.equal(s.firstEntryRewarded,true);
 A.equal(s.gold,18);
 s=R.unlockBuff(s,'move');
 A.equal(s.gold,13,'疾行 5 猫粮');
 A.equal(R.buffUnlockable(s,'rescue'),true,'移动后救援可解锁');
 s=R.unlockBuff(s,'rescue');
 A.equal(s.gold,8,'救援再 5 猫粮');
 A.deepEqual(s.buffs,{health:true,move:true,rescue:true},'三个增益同时生效');
 A.strictEqual(R.unlockBuff(s,'move'),s,'已解锁不重复扣款');
 A.strictEqual(R.unlockBuff(s,'rescue'),s);
 const noHealth=camp(10);A.strictEqual(R.unlockBuff(noHealth,'rescue'),noHealth,'不能跳过移动直接解锁救援');
});

test('C12 增益继承：普通队友 +1 HP/+1 移速，主帅与仕排除，攻击与射程不变',()=>{
 let s=camp(0);s.buffs={health:true,move:true,rescue:false};
 s=R.applyJourneyBuffs(s);
 const rook=P(s,'rook'),pawn2=P(s,'starting-pawn-2');
 A.equal(rook.maxHp,3);A.equal(rook.commanderMove,1);
 A.equal(rook.rookMoveRange+rook.commanderMove,5,'车移动 4→5');
 A.equal(rook.attack,1,'攻击不变');
 A.equal(pawn2.attack,1,'新初始阵容无自带弓，攻击不变');
 A.equal(pawn2.commanderMove,1);
 A.equal(pawn2.maxHp,2,'兵 1+坚守 1');
 const level=R.startLevel(s,R.defaultMap());
 A.equal(G(level,'rook').maxHp,3,'入关继承且只加一次');
 A.equal(G(level,'rook').commanderMove,1);
 A.equal(G(level,'king').commanderMove,0,'主帅排除');
 A.equal(G(level,'king').maxHp,3);
 // 跨关仍只保留一份加成
 const next=R.nextLevel(Object.assign(R.copy(s),{phase:'intermission',completed:0}),R.defaultMap());
 A.equal(next.level,2);
 A.equal(P(next,'rook').maxHp,3,'跨关不重复叠加');
 A.equal(P(next,'rook').commanderMove,1);
 A.equal(P(next,'starting-pawn-2').maxHp,2,'新阵容兵跨关保持 +1 上限');
 // 反复应用不叠加
 const twice=R.applyJourneyBuffs(R.applyJourneyBuffs(s));
 A.equal(P(twice,'rook').maxHp,3);
 // 新招募队友继承
 const bought=R.buy(Object.assign(R.copy(s),{gold:5,phase:'intermission'}),'pawn');
 A.equal(P(bought,'recruit-pawn-0').maxHp,2,'兵 1+1');
 // 仕不继承
 s.party.push(R.unit('adv-x','player','advisor',0,0));s.activeIds.push('adv-x');
 const withAdv=R.applyJourneyBuffs(s);
 A.equal(P(withAdv,'adv-x').maxHp,2);A.equal(P(withAdv,'adv-x').commanderMove,0);
});

test('C06/C23 入关快照：进入关卡即记录，布阵期升级在失败重试时回滚',()=>{
 let s=camp(30);s.teamSp=9;s.completed=0;
 const entered=R.startLevel(s,R.defaultMap());
 A.equal(entered.phase,'deploy');
 A.equal(entered.level,1);
 A.equal(entered.levelSnapshot.teamSp,9,'快照在入关时点');
 // 布阵期花 SP 升级
 const upgraded=R.purchaseUpgrade(entered,'rook','rook-charge-role');
 A.equal(upgraded.teamSp,7);
 A.notStrictEqual(upgraded,entered);
 // 失败重试回到入关状态
 const dead=Object.assign(R.copy(upgraded),{phase:'result',result:'dead'});
 const retry=R.retryLevel(dead);
 A.equal(retry.phase,'deploy');
 A.equal(retry.teamSp,9,'布阵期消费回滚');
 A.equal(P(retry,'rook').rookRole,'base');
 A.ok(retry.levelSnapshot,'重试后仍持有入关快照，可再次重试');
 const dead2=Object.assign(R.copy(retry),{phase:'result',result:'dead'});
 A.equal(R.retryLevel(dead2).teamSp,9);
});

test('C05 进入关卡资格：关卡号只由通关进度推导，已通关关卡回到同一进度',()=>{
 let s=camp(0);s.completed=2;
 const n=R.startLevel(s,R.defaultMap());
 A.equal(n.level,3,'下一关由通关进度推导');
 A.equal(n.completed,2);
 const first=R.startLevel(camp(0),R.defaultMap());
 A.equal(first.level,1,'新旅程从第 1 关开始');
 A.equal(R.startLevel(Object.assign(camp(0),{completed:1}),R.defaultMap()).level,2);
});

test('C16 救援对象：只含受伤存活普通队友与仍在场尸体',()=>{
 const s=R.emptyState([R.unit('king','player','king',4,0),R.unit('boss','enemy','king',4,8)]);
 const healthy=R.unit('ok','player','pawn',1,1),hurt=R.unit('hurt','player','rook',2,1),dead=R.unit('dead','player','spearman',3,1),adv=R.unit('adv','player','advisor',3,2);
 hurt.hp=1;
 s.units.push(healthy,hurt,adv);
 s.corpses.push({id:'corpse-dead',x:3,y:1,unit:dead},{id:'corpse-adv',x:4,y:2,unit:Object.assign(R.copy(adv),{hp:0})});
 s.phase='rescue';
 const t=R.rescueTargets(s);
 A.deepEqual(t.live,['hurt'],'满血普通队友不可救援');
 A.deepEqual(t.corpses,['dead'],'仕残骸不可救援');
 A.strictEqual(R.rescue(s,'ok'),s,'满血目标拒绝');
 A.strictEqual(R.rescue(s,'king'),s,'主帅拒绝');
 A.strictEqual(R.rescue(s,'adv'),s,'仕拒绝');
 const revived=R.rescue(s,'dead');
 A.equal(revived.units.find(u=>u.id==='dead').hp,1,'尸体原位 1 HP 复活');
 A.equal(revived.corpses.some(c=>c.unit.id==='dead'),false,'尸体移除');
 A.equal(revived.rescueUsed,true);
 A.equal(revived.wave,2,'救援后进入第二波');
 A.strictEqual(R.rescue(revived,'hurt'),revived,'本关只一次');
});

test('C14 救援回满按含增益上限；跳过后本关不再触发；无目标自动进第二波',()=>{
 let s=camp(0);s.buffs={health:true,move:false,rescue:true};s=R.applyJourneyBuffs(s);
 const level=R.startLevel(s,R.defaultMap());
 const board=R.confirmDeployment(level);
 A.equal(board.phase,'player');
 let cur=R.copy(board);
 cur.turn=5;cur.wave=1;
 G(cur,'starting-pawn-2').hp=1;
 const out=R.endTurn(cur).state;
 A.equal(out.phase,'rescue','第 5→6 回合进入救援');
 A.equal(out.turn,6);
 G(out,'starting-horse').hp=1;                       // 专项：确保存在受伤目标（马含坚守上限 2）
 const healed=R.rescue(out,'starting-horse');
 A.equal(G(healed,'starting-horse').hp,G(healed,'starting-horse').maxHp,'回复到含增益上限');
 A.equal(G(healed,'starting-horse').maxHp,2,'马 1+坚守 1');
 A.equal(healed.wave,2);
 A.strictEqual(R.rescue(healed,'starting-pawn-2'),healed,'本关只触发一次');
 // 跳过
 let skip=R.copy(board);skip.turn=5;skip.wave=1;G(skip,'starting-pawn-2').hp=1;
 const atRescue=R.endTurn(skip).state;
 A.equal(atRescue.phase,'rescue');
 const skipped=R.rescueSkip(atRescue);
 A.equal(skipped.phase,'player');
 A.equal(skipped.rescueUsed,true);
 A.equal(skipped.wave,2);
 // 无合法目标自动跳过
 let none=R.copy(board);none.turn=5;none.wave=1;none.intents=[];
 none.units=none.units.filter(u=>u.side==='player'||u.kind==='king');   // 专项：只留远处敌将，保证本回合无人受伤
 none.units.forEach(u=>{if(u.side==='player')u.hp=u.maxHp;});
 const noTarget=R.endTurn(none).state;
 A.equal(noTarget.phase,'player','没有可救援对象时直接进入第二波');
 A.equal(noTarget.wave,2);
});

test('C18 回营恢复：满血、阵亡队友与仕恢复，身份与成长保留',()=>{
 const s=R.enterCamp(camp(0));                        // 首次入营已发奖，后续只做恢复
 s.completed=1;
 const level=R.startLevel(s,R.defaultMap());
 const hurt=R.copy(level);
 G(hurt,'starting-pawn').hp=0;
 G(hurt,'starting-pawn-2').hp=1;
 G(hurt,'starting-pawn-2').level=3;P(hurt,'starting-pawn-2').level=3;
 hurt.party.push(R.unit('adv-1','player','advisor',3,1));
 hurt.units.push(Object.assign(R.unit('adv-1','player','advisor',3,1),{device:true,towerInterval:2,hp:0}));
 P(hurt,'adv-1').towerInterval=2;                    // 专项：同步成长（正常流程由 syncParty 完成）
 const goldBefore=hurt.gold;
 const recovered=R.enterCamp(hurt);
 A.equal(P(recovered,'starting-pawn').hp,P(recovered,'starting-pawn').maxHp,'阵亡队友恢复满血');
 A.equal(P(recovered,'starting-pawn-2').hp,P(recovered,'starting-pawn-2').maxHp,'伤员恢复满血');
 A.equal(P(recovered,'starting-pawn-2').level,3,'成长保留');
 A.equal(P(recovered,'adv-1').hp,2,'仕恢复');
 A.equal(P(recovered,'adv-1').towerInterval,2,'仕档位保留');
 A.equal(recovered.gold,goldBefore,'不重复发首次入营奖励');
 A.equal(recovered.buffs.health,true,'增益保留');
});

test('C18 回营恢复：满血、阵亡队友与仕恢复，身份与成长保留（含二次恢复）',()=>{
 let s=camp(0);s.firstEntryRewarded=true;s.buffs={health:true,move:false,rescue:false};s=R.applyJourneyBuffs(s);   // 已有坚守：伤员上限为 2
 const level=R.startLevel(s,R.defaultMap());
 const hurt=R.copy(level);
 G(hurt,'starting-pawn').hp=0;
 G(hurt,'starting-pawn-2').hp=1;
 G(hurt,'starting-pawn-2').level=3;P(hurt,'starting-pawn-2').level=3;
 const recovered=R.enterCamp(hurt);
 A.equal(P(recovered,'starting-pawn').hp,P(recovered,'starting-pawn').maxHp,'阵亡队友恢复');
 A.equal(P(recovered,'starting-pawn-2').hp,P(recovered,'starting-pawn-2').maxHp,'伤员满血');
 A.equal(P(recovered,'starting-pawn-2').level,3,'成长保留');
 A.equal(recovered.phase,'intermission');
 A.equal(recovered.gold,0,'已领过首次奖励时不再发');
});

test('C19 公共 SP：营地为上场与后备同伴升级，共用一个池',()=>{
 let s=camp(10);s.teamSp=6;s.population=4;
 s=R.buy(s,'pawn');                                   // 满员 → 后备
 const benchId=s.bench[0];
 A.ok(benchId);
 A.equal(R.activeOrdinary(s).length,4);
 const up=R.purchaseUpgrade(s,benchId,'promote-archer');
 A.notStrictEqual(up,s,'后备队友可在营地升级');
 A.equal(up.teamSp,4);
 A.equal(P(up,benchId).kind,'archer');
 const up2=R.purchaseUpgrade(s,'rook','fortify');
 A.equal(P(up2,'rook').maxHp,3);
 A.equal(up2.teamSp,5);
 const more=R.purchaseUpgrade(up2,'rook','fortify');
 A.notStrictEqual(more,up2,'同一队友可继续升级，不受单次回营限制');
 const poor=Object.assign(R.copy(s),{teamSp:0});
 A.strictEqual(R.purchaseUpgrade(poor,'rook','fortify'),poor,'公共 SP 不足时拒绝且不扣款');
});

test('C20 主帅无个人升级、仕只升级攻击间隔 3/5 SP',()=>{
 let s=camp(0);s.teamSp=9;
 A.strictEqual(R.purchaseUpgrade(s,'king','fortify'),s,'主帅无个人升级');
 s.party.push(R.unit('adv-1','player','advisor',0,0));
 s.units.push(R.unit('adv-1','player','advisor',3,1));
 const a1=R.purchaseUpgrade(s,'adv-1','advisor-interval');
 A.equal(P(a1,'adv-1').towerInterval,2);
 A.equal(a1.teamSp,6,'3 SP');
 const a2=R.purchaseUpgrade(a1,'adv-1','advisor-interval');
 A.equal(P(a2,'adv-1').towerInterval,1);
 A.equal(a2.teamSp,1,'5 SP');
 A.strictEqual(R.purchaseUpgrade(a2,'adv-1','fortify'),a2,'仕不能强健/治疗');
 A.strictEqual(R.purchaseUpgrade(a2,'adv-1','advisor-interval'),a2,'满级拒绝');
});

test('C13 重复提交同一交易不重复扣款，合法连续购买不受限制',()=>{
 let s=camp(20);
 const once=R.expandPopulation(s),twice=R.expandPopulation(once);
 A.equal(once.population,5);A.equal(once.gold,15);
 A.equal(twice.population,6);A.equal(twice.gold,10,'连续扩编是不同交易');
 const same=R.expandPopulation(twice);
 A.equal(same.population,7);
 const maxed=R.expandPopulation(camp(0));
 A.strictEqual(maxed,camp(0)===maxed?maxed:maxed,'空余额拒绝');
 const buffed=R.unlockBuff(R.enterCamp(camp(10)),'move');
 A.strictEqual(R.unlockBuff(buffed,'move'),buffed,'同一增益不重复扣款');
});

test('C17/R09 续局存档：battle 与旅程同键往返，损坏/缺字段不冒充有效续局',()=>{
 const storage=memory(),s=camp(12);s.teamSp=4;s.population=6;s.completed=1;s.tutorial='completed';s.firstEntryRewarded=true;
 const battle={version:1,state:R.startLevel(s,R.defaultMap()),savedAt:'2026-10-21T00:00:00.000Z',reason:'攻击结算'};
 J.write(storage,{player:{tutorialCompleted:true,campGuideSeen:true},journey:R.journeyRecord(s),battle});
 const back=J.read(storage);
 A.ok(back.battle,'续局字段可读');
 A.equal(back.battle.state.phase,'deploy');
 A.equal(back.battle.state.level,2);
 A.equal(back.battle.state.rescueUsed,false);
 A.equal(back.battle.reason,'攻击结算','保存原因随续局往返');
 A.equal(back.battle.savedAt,'2026-10-21T00:00:00.000Z');
 A.deepEqual(back.journey.buffs,{health:false,move:false,rescue:false});
 A.equal(back.error,null);
 const old=memory();J.write(old,{player:{},journey:R.journeyRecord(s),battle:null});A.equal(J.read(old).battle,null,'旧/回营存档没有续局');
 const bad=memory();bad.setItem(J.KEY,JSON.stringify({version:1,player:{},journey:R.journeyRecord(s),battle:{state:{phase:'deploy'}}}));A.equal(J.read(bad).battle,null,'缺 units 的续局不冒充有效');
});

test('C17 救援使用/跳过：本关一次、下一关重置、失败重试恢复第二波机会',()=>{
 let s=camp(0);s.buffs={health:true,move:false,rescue:true};s=R.applyJourneyBuffs(s);s.firstEntryRewarded=true;
 let level=R.confirmDeployment(R.startLevel(s,R.defaultMap()));
 level.turn=5;level.wave=1;
 G(level,'starting-pawn-2').hp=1;
 const at=R.endTurn(level).state;
 A.equal(at.phase,'rescue');
 const skipped=R.rescueSkip(at);
 A.equal(skipped.rescueUsed,true);A.equal(skipped.wave,2);
 A.strictEqual(R.rescueSkip(skipped),skipped,'跳过后本关不能再次救援');
 // 下一关重置本关消耗，但需要重新推进到第 6 回合才能获得一次机会
 const victory=R.copy(skipped);victory.phase='intermission';victory.result='victory';victory.level=1;victory.completed=1;
 const next=R.nextLevel(victory,R.defaultMap());
 A.equal(next.level,2);A.equal(next.rescueUsed,false,'下一关重新拥有机会');
 const nextBoard=R.confirmDeployment(next);nextBoard.turn=5;nextBoard.wave=1;G(nextBoard,'starting-pawn-2').hp=1;
 A.equal(R.endTurn(nextBoard).state.phase,'rescue','下一关第 6 回合再次触发');
 // 失败重试恢复到入关快照：本关消耗清除、wave1、到第二波可再次触发一次
 const board=R.confirmDeployment(R.startLevel(s,R.defaultMap()));
 G(board,'starting-pawn-2').hp=1;
 board.phase='rescue';board.rescueRequired=true;
 const used=R.rescue(board,'starting-pawn-2');
 A.equal(used.rescueUsed,true);
 const dead=Object.assign(R.copy(used),{phase:'result',result:'dead'});
 const retry=R.retryLevel(dead);
 A.equal(retry.phase,'deploy');A.equal(retry.rescueUsed,false);A.equal(retry.wave,1);
 const retryBoard=R.confirmDeployment(retry);retryBoard.turn=5;retryBoard.wave=1;
 const hurt=G(retryBoard,'starting-pawn-2');hurt.hp=1;
 const retryRescue=R.endTurn(retryBoard).state;
 A.equal(retryRescue.phase,'rescue','重试推进到第 6 回合可再次触发');
 A.equal(R.rescueSkip(retryRescue).rescueUsed,true);
});

test('C17/C24 存档：旅程字段往返一致，损坏存档被忽略，写入失败抛错',()=>{
 const storage=memory();
 const s=camp(12);s.teamSp=4;s.population=6;s.completed=1;s.tutorial='completed';s.firstEntryRewarded=true;
 s.buffs={health:true,move:true,rescue:false};
 const record=R.journeyRecord(s);
 J.write(storage,{player:{tutorialCompleted:true,campGuideSeen:true},journey:record});
 const back=J.read(storage);
 A.equal(back.error,null);
 A.deepEqual(back.player,{tutorialCompleted:true,campGuideSeen:true});
 A.equal(back.journey.gold,12);
 A.equal(back.journey.population,6);
 A.equal(back.journey.completed,1);
 A.deepEqual(back.journey.buffs,{health:true,move:true,rescue:false});
 const restored=R.stateFromJourney(back.journey);
 A.equal(restored.phase,'intermission');
 A.equal(restored.level,2,'恢复后从下一关继续');
 A.deepEqual(restored.activeIds,record.activeIds);
 A.deepEqual(restored.party.map(u=>u.id),record.party.map(u=>u.id));
 // 损坏/版本不兼容
 storage.setItem(J.KEY,'{oops');
 A.equal(J.read(storage).journey,null);
 A.match(J.read(storage).error,/损坏/);
 storage.setItem(J.KEY,JSON.stringify({version:900,player:{},journey:record}));
 A.match(J.read(storage).error,/版本/);
 // 写入失败
 const failing=memory();failing.setItem=()=>{throw Error('quota');};
 A.throws(()=>J.write(failing,{player:{},journey:record}),/保存失败/);
});

test('C25 新旅程重置旅程但不重置玩家级标志',()=>{
 const storage=memory();
 J.write(storage,{player:{tutorialCompleted:true,campGuideSeen:true},journey:R.journeyRecord(Object.assign(camp(5),{completed:2}))});
 const before=J.read(storage);
 A.equal(before.player.tutorialCompleted,true);
 J.write(storage,{player:before.player,journey:R.journeyRecord(R.newGame())});
 const after=J.read(storage);
 A.equal(after.player.tutorialCompleted,true,'教学完成资格保留');
 A.equal(after.player.campGuideSeen,true,'指引已看标志保留');
 A.equal(after.journey.completed,0,'关卡进度重置');
 A.equal(after.journey.gold,0,'猫粮重置');
 A.equal(after.journey.population,4,'人口重置');
 A.equal(after.journey.firstEntryRewarded,false,'首次入营奖励重新可用');
});

test('R02/R08 取消三选一：确认布阵后直接进入我方行动并准备意图',()=>{
 let s=camp(0);
 const level=R.startLevel(s,R.defaultMap());
 A.equal(level.phase,'deploy');
 A.equal(level.intents.length,0,'布阵期尚未准备敌方意图');
 const started=R.confirmDeployment(level);
 A.equal(started.phase,'player');
 A.ok(started.intents.length>0);
 A.equal(started.commanderBuff,undefined,'不再存在互斥三选一字段');
});

test('C19-U1/C24-U1 规则：移动后升级保留一致局面，非法升级不提交，重试仍回入关快照',()=>{
 const s=camp(0);s.teamSp=4;
 const board=R.confirmDeployment(R.startLevel(s,R.defaultMap()));
 const move=R.legalActions(board,'rook').find(a=>a.type==='rook-move');
 A.ok(move,'车有合法普通移动');
 const moved=R.submitAction(board,move).state;
 A.equal(moved.teamSp,4,'普通移动不改变公共 SP');
 A.deepEqual([G(moved,'rook').x,G(moved,'rook').y],[move.to.x,move.to.y],'普通移动在内存生效');
 const up=R.purchaseUpgrade(moved,'rook','fortify');
 A.notStrictEqual(up,moved);
 A.equal(up.teamSp,3,'成功升级只扣 1 SP');
 A.equal(G(up,'rook').fortify,1);
 A.deepEqual([G(up,'rook').x,G(up,'rook').y],[move.to.x,move.to.y],'升级保留先前的普通移动');
 A.equal(P(up,'rook').fortify,1,'队伍成长与场上同步');
 A.strictEqual(R.purchaseUpgrade(up,'king','fortify'),up,'主帅非法升级不提交');
 A.strictEqual(R.purchaseUpgrade(up,'rook','rook-pull'),up,'前置不满足的升级不提交');
 const dead=Object.assign(R.copy(up),{phase:'result',result:'dead'});
 const retry=R.retryLevel(dead);
 A.equal(retry.phase,'deploy');
 A.equal(retry.teamSp,4,'失败重试回滚入关 SP');
 A.deepEqual([G(retry,'rook').x,G(retry,'rook').y],[0,0],'失败重试回滚到入关位置');
 A.equal(G(retry,'rook').fortify,0,'失败重试回滚成长');
});

test('C23-M2 规则：攻击结算含先前移动与击杀，失败重试仍按入关快照回滚',()=>{
 const s=camp(0);s.teamSp=0;
 const board=R.confirmDeployment(R.startLevel(s,R.defaultMap()));
 const move=R.legalActions(board,'rook').find(a=>a.type==='rook-move');
 const moved=R.submitAction(board,move).state;
 const attack=R.legalActions(moved,'starting-pawn').find(a=>a.type==='attack');
 A.ok(attack,'兵有合法攻击');
 const after=R.submitAction(moved,attack).state;
 A.equal(after.killLedger['w1-0'],true,'攻击结算击杀');
 A.equal(after.teamSp,1,'真实击杀 +1 公共 SP');
 A.deepEqual([G(after,'rook').x,G(after,'rook').y],[move.to.x,move.to.y],'攻击后保留先前普通移动');
 const dead=Object.assign(R.copy(after),{phase:'result',result:'dead'});
 const retry=R.retryLevel(dead);
 A.equal(retry.phase,'deploy');
 A.equal(retry.teamSp,0,'重试回滚击杀 SP');
 A.deepEqual([G(retry,'starting-pawn').x,G(retry,'starting-pawn').y],[1,3],'重试回到入关站位');
 A.deepEqual([G(retry,'rook').x,G(retry,'rook').y],[0,0]);
 A.equal(retry.killLedger['w1-0'],undefined,'重试不保留本关击杀账本');
});

// US-020 2026-10-21 初始阵容调整验收（A01～A03 规则层）；浏览器实际证据见 docs/us/us020-evidence-r4-lineup/。
const BASE_IDS=['rook','starting-pawn','starting-pawn-2','starting-horse'];
test('A01 新旅程基础阵容：兵2马1车1、主帅保留、人口4、ID互异、站位合法、满血与初营 HP 增益',()=>{
 const s=R.newGame();
 A.deepEqual(s.party.map(u=>u.id),BASE_IDS,'普通队友：车×1、兵×2、马×1');
 A.equal(new Set(BASE_IDS).size,BASE_IDS.length,'两个普通兵使用不同稳定 ID');
 A.deepEqual(s.party.map(u=>u.kind),['rook','pawn','pawn','horse']);
 A.equal(s.party.filter(u=>u.kind==='pawn').length,2,'两个普通兵');
 const players=s.units.filter(u=>u.side==='player');
 A.equal(players.filter(u=>u.kind==='king').length,1,'主帅保留');
 A.equal(players.some(u=>['archer','spearman','cannon','advisor'].includes(u.kind)),false,'无初始弓/枪/炮/仕');
 A.equal(s.population,4,'人口仍为 4');A.equal(s.activeIds.length,4);A.equal(new Set(s.activeIds).size,4);
 A.equal(new Set(s.units.map(u=>u.x+','+u.y)).size,s.units.length,'站位合法无重叠');
 players.forEach(u=>{A.equal(R.inside(u),true);A.equal(R.mountain(s,u),false,'不能站山');A.equal(R.isWater(u,s),false,'不能站水');A.ok(u.y<4,'我方半场');});
 players.filter(u=>u.kind!=='king').forEach(u=>A.equal(u.hp,u.maxHp,'新局满血'));
 const camp=R.enterCamp(s);
 A.equal(camp.gold,8,'首次入营 8 猫粮');A.equal(camp.teamSp,0,'公共 SP 0');
 A.deepEqual(camp.buffs,{health:true,move:false,rescue:false},'免费坚守');
 A.deepEqual(camp.party.map(u=>[u.id,u.maxHp,u.hp,u.commanderHealth]),[['rook',3,3,1],['starting-pawn',2,2,1],['starting-pawn-2',2,2,1],['starting-horse',2,2,1]],'初营 HP 增益只加一次且满血');
 const level=R.startLevel(camp,R.defaultMap());
 const board=R.confirmDeployment(level);
 A.notStrictEqual(board,level,'四人布阵合法');
 A.equal(board.phase,'player');
 A.equal(board.units.filter(u=>u.side==='player'&&u.kind!=='king').length,4,'人口 4 全部上阵');
 A.equal(board.units.some(u=>u.side==='player'&&['archer','spearman','cannon','advisor'].includes(u.kind)),false);
 A.equal(board.units.filter(u=>u.side==='player'&&u.kind==='king').length,1,'主帅保留');
});
test('A02 完成与跳过同一基础阵容；新旅程重置；旧局与跨关队伍不改写',()=>{
 const completed=R.journeyRecord(R.newGame());
 const skipped=R.journeyRecord(R.newGame());
 A.deepEqual(completed.party,skipped.party,'两条入营路径基础阵容一致');
 A.deepEqual(skipped.party.map(u=>u.id),BASE_IDS);
 A.deepEqual([skipped.gold,skipped.teamSp,skipped.population,skipped.completed,skipped.firstEntryRewarded],[0,0,4,0,false],'新旅程重置：猫粮/SP/人口/进度');
 A.deepEqual(skipped.buffs,{health:false,move:false,rescue:false});
 const camped=R.enterCamp(R.newGame());
 A.deepEqual([camped.gold,camped.teamSp],[8,0],'跳过路径只发首营 8 猫粮，不补发教学收益');
 A.deepEqual(camped.buffs,{health:true,move:false,rescue:false},'两条路径首营增益一致');
 const storage=memory();
 J.write(storage,{player:{tutorialCompleted:true,campGuideSeen:true},journey:R.journeyRecord(Object.assign(R.newGame(),{completed:2,gold:30,teamSp:5}))});
 const before=J.read(storage);
 J.write(storage,{player:before.player,journey:R.journeyRecord(R.newGame())});
 const after=J.read(storage);
 A.equal(after.player.tutorialCompleted,true,'教学跳过资格不被新旅程清空');
 A.deepEqual(after.journey.party.map(u=>u.id),BASE_IDS,'新旅程回到基础阵容');
 A.deepEqual([after.journey.completed,after.journey.gold,after.journey.population],[0,0,4]);
 const legacy={gold:12,teamSp:3,population:5,buffs:{health:true,move:true,rescue:false},party:[R.unit('rook','player','rook',0,0),R.unit('starting-pawn','player','pawn',1,3),R.unit('starting-archer','player','archer',4,3),R.unit('starting-spearman','player','spearman',7,3)],activeIds:['rook','starting-pawn','starting-archer','starting-spearman'],bench:[],completed:1,tutorial:'completed',firstEntryRewarded:true};
 const restored=R.stateFromJourney(legacy);
 A.deepEqual(restored.party.map(u=>u.id),legacy.party.map(u=>u.id),'旧局队伍原样恢复，不迁移成新阵容');
 A.deepEqual(restored.activeIds,legacy.activeIds);
 const cross=R.nextLevel(restored,R.defaultMap());
 A.deepEqual(cross.party.map(u=>u.kind).sort(),['archer','pawn','rook','spearman'],'跨关保留旧队伍');
 A.equal(cross.units.some(u=>u.id==='starting-pawn-2'||u.id==='starting-horse'),false,'不向旧局注入新初始单位');
 A.equal(cross.gold,12,'跨关资源沿用');
});
test('A03 两个普通兵分别转职弓/枪：独立、费用与技能沿用原规则（专项：注入公共 SP）',()=>{
 let s=R.newGame();s.phase='intermission';s.teamSp=6;   // 专项：注入公共 SP，仅验证转职链路
 A.equal(s.party.filter(u=>u.kind==='pawn').length,2,'新旅程有两个普通兵');
 const archer=R.purchaseUpgrade(s,'starting-pawn','promote-archer');
 A.notStrictEqual(archer,s);A.equal(archer.teamSp,4,'转职弓兵 2 SP');
 A.deepEqual([P(archer,'starting-pawn').kind,P(archer,'starting-pawn').attack,P(archer,'starting-pawn').maxHp],['archer',2,1],'弓攻击 +1、不额外加血');
 A.equal(P(archer,'starting-pawn-2').kind,'pawn','另一兵未受影响');
 const both=R.purchaseUpgrade(archer,'starting-pawn-2','promote-spearman');
 A.equal(both.teamSp,2,'第二兵独立 2 SP');
 A.deepEqual([P(both,'starting-pawn-2').kind,P(both,'starting-pawn-2').hp,P(both,'starting-pawn-2').maxHp],['spearman',2,2],'枪当前/最大 HP 各 +1');
 A.equal(P(both,'starting-pawn').kind,'archer','两兵职业各自独立');
 A.strictEqual(R.purchaseUpgrade(both,'starting-pawn','promote-spearman'),both,'已转职兵不能重复转职');
 const poor=Object.assign(R.copy(s),{teamSp:1});
 A.strictEqual(R.purchaseUpgrade(poor,'starting-pawn','promote-archer'),poor,'SP 不足拒绝且不扣款');
 A.strictEqual(R.purchaseUpgrade(both,'rook','promote-archer'),both,'非普通兵不能转职');
 const level=R.startLevel(both,R.defaultMap());
 const board=R.confirmDeployment(level);
 A.notStrictEqual(board,level,'转职后四人布阵合法');
 const archerUnit=board.units.find(u=>u.id==='starting-pawn'),spearUnit=board.units.find(u=>u.id==='starting-pawn-2');
 A.deepEqual([archerUnit.kind,R.directionRange(archerUnit,0)],['archer',{min:2,max:2}],'弓初始射程沿用');
 A.equal(R.directionalAction(board,'starting-pawn',0),undefined,'弓相邻 1 格盲区沿用');
 A.deepEqual([spearUnit.kind,spearUnit.hp,spearUnit.maxHp],['spearman',2,2],'入关保留枪转职加成');
 A.ok(R.directionalAction(board,'starting-pawn-2',0),'枪四向攻击可用');
});

// US-020 R04（2026-10-21 再确认）普通队友持有数、部署人口与招募：P01～P07 规则断言。
// P01～P06 的余额/名单边界属专项夹具；P07 的存档往返与失败重试为规则/存档断言。P08 为帮助文案，见浏览器脚本。
test('P01 持有 7、上阵 4、后备 3、部署上限 4 分别计数：持有数量不限',()=>{
 let s=camp(9);
 s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='starting-horse'));   // 主动换下 1 人，空出部署名额
 for(let i=0;i<3;i++)s=R.buy(s,'pawn');                                  // 9 猫粮 → 3 名兵
 const ordinary=s.party.filter(u=>u.kind!=='advisor'&&u.kind!=='king');
 A.equal(ordinary.length,7,'队友总数 7（含后备）');
 A.equal(R.activeOrdinary(s).length,4,'部署人口 4');
 A.equal(ordinary.length-R.activeOrdinary(s).length,3,'其中后备 3');
 A.equal(R.populationLimit(s),4,'部署上限仍为 4');
 A.equal(s.gold,0,'3 名兵各 3 猫粮');
 A.equal(s.party.filter(u=>u.kind==='advisor').length,0,'无仕时普通总数不受影响');
 A.equal(new Set(s.party.map(u=>u.id)).size,7,'持有 ID 互异');
});

test('P02 招募：空位默认上阵，满员进入后备且不替换原上阵名单',()=>{
 let s=camp(30);
 s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='rook'));
 const beforeActive=R.activeOrdinary(s).slice();
 const recruit=R.buy(s,'pawn');
 A.equal(R.activeOrdinary(recruit).length,4,'有空余名额时新招募默认上阵');
 A.ok(recruit.activeIds.includes('recruit-pawn-0'),'新招募进入上阵名单');
 A.deepEqual(R.activeOrdinary(recruit).slice(0,beforeActive.length),beforeActive,'不替换原有上阵队友及其顺序');
 const activeBeforeBench=recruit.activeIds.slice();
 const benched=R.buy(recruit,'pawn');
 A.deepEqual(benched.activeIds,activeBeforeBench,'满员招募不替换任何已上阵队友');
 A.ok(benched.bench.includes('recruit-pawn-1'),'满员招募进入后备');
 A.equal(R.activeOrdinary(benched).length,4,'上阵仍为 4');
 A.equal(benched.party.length,6,'持有数量不受部署上限阻断');
});

test('P03 部署上限 8 时仍可持有 9 名以上普通队友',()=>{
 let s=camp(200);
 for(let i=0;i<4;i++)s=R.expandPopulation(s);
 A.equal(R.populationLimit(s),8,'部署上限到 8');
 for(let i=0;i<9;i++)s=R.buy(s,'pawn');
 A.equal(s.party.filter(u=>u.kind!=='advisor').length,13,'持有 13 名普通队友（初始 4＋招募 9）');
 A.equal(R.activeOrdinary(s).length,8,'上阵 8');
 A.equal(s.party.length-R.activeOrdinary(s).length,5,'后备 5');
 A.equal(s.bench.length,5,'后备名单与实际一致');
 const more=R.buy(s,'pawn');
 A.equal(more.party.length,14,'满部署与上限 8 都不阻止继续招募');
 A.equal(R.activeOrdinary(more).length,8,'继续招募只进后备');
 A.strictEqual(R.setActiveRoster(more,more.activeIds.concat('recruit-pawn-8')),more,'超过部署上限 8 拒绝编队');
});

test('P04 部署上限 +1 只提高上限：5 猫粮固定，不增加数量、不赠送棋子',()=>{
 let s=camp(5);
 const before={party:s.party.map(u=>u.id),active:s.activeIds.slice(),bench:s.bench.slice(),limit:R.populationLimit(s)};
 const n=R.expandPopulation(s);
 A.equal(n.gold,0,'固定 5 猫粮');
 A.equal(R.populationLimit(n),5,'部署上限 4→5');
 A.deepEqual(n.party.map(u=>u.id),before.party,'不增加持有队友');
 A.deepEqual(n.activeIds,before.active,'不赠送上阵棋子');
 A.deepEqual(n.bench,before.bench,'不改后备名单');
 A.strictEqual(R.expandPopulation(n),n,'余额不足拒绝且不扣款');
 const poor=camp(4);A.strictEqual(R.expandPopulation(poor),poor,'余额 4 拒绝（不显示差额）');
 const exact=camp(5);A.equal(R.expandPopulation(exact).population,5,'余额 5 恰好成功');
 let maxed=camp(50);for(let i=0;i<4;i++)maxed=R.expandPopulation(maxed);
 A.strictEqual(R.expandPopulation(maxed),maxed,'达到上限 8 后拒绝，不赠送第 9 人口');
 A.equal(R.populationLimit({population:12}),8,'越界存档按上限 8 收敛');
});

test('P05 至少 1 名普通队友：0 人与超限不能开战，1 人与部署上限人数合法',()=>{
 const board=()=>R.startLevel(camp(30),R.defaultMap());
 const zero=board();zero.units=zero.units.filter(u=>u.side==='enemy'||u.kind==='king');
 A.strictEqual(R.confirmDeployment(zero),zero,'0 名普通队友拒绝（主帅不能代替）');
 const one=board();one.units=one.units.filter(u=>u.side==='enemy'||u.kind==='king'||u.id==='starting-pawn');
 A.equal(R.confirmDeployment(one).phase,'player','1 名普通队友允许出战');
 const over=board();over.units.push(R.unit('extra-x','player','pawn',2,1));
 A.strictEqual(R.confirmDeployment(over),over,'超过部署上限 4 拒绝');
 over.population=5;A.equal(R.confirmDeployment(over).phase,'player','提升上限后同样 5 人合法');
 let full=camp(200);for(let i=0;i<4;i++)full=R.expandPopulation(full);
 for(let i=0;i<8;i++)full=R.buy(full,'pawn');
 const atLimit=R.startLevel(full,R.defaultMap());
 A.equal(atLimit.units.filter(u=>u.side==='player'&&u.kind!=='king').length,8,'8 名普通队友上阵');
 A.equal(R.confirmDeployment(atLimit).phase,'player','等于部署上限 8 合法');
});

test('P06 主帅与两座仕单独计数，均不计入普通总数、后备数或部署人口',()=>{
 let s=camp(20);
 s=R.buy(s,'advisor');s=R.buy(s,'advisor');
 A.equal(s.party.filter(u=>u.kind==='advisor').length,2,'仕最多两座');
 A.equal(s.party.some(u=>u.kind==='king'),false,'主帅不在普通持有名单（单独显示）');
 A.equal(s.party.filter(u=>u.kind!=='advisor'&&u.kind!=='king').length,4,'普通队友总数仍为 4');
 A.equal(R.activeOrdinary(s).length,4,'仕不计入部署人口');
 A.ok(s.activeIds.includes('recruit-advisor-0')&&s.activeIds.includes('recruit-advisor-1'),'两座仕固定上阵');
 A.strictEqual(R.buy(s,'advisor'),s,'第三座仕拒绝');
 const bench=R.buy(s,'pawn');
 A.ok(bench.bench.includes('recruit-pawn-0'),'普通队友满员时进入后备，仕不占其部署名额');
 A.equal(R.activeOrdinary(bench).length,4,'招募普通队友不改变仕与部署人口计数');
 const level=R.startLevel(bench,R.defaultMap());
 A.equal(level.units.filter(u=>u.side==='player'&&u.kind==='advisor').length,2,'入关仕单独上阵');
 A.equal(level.units.filter(u=>u.side==='player'&&u.kind!=='king'&&u.kind!=='advisor').length,4,'主帅与仕不计入普通部署人口');
});

test('P07 存档与失败重试恢复名单、后备与部署上限',()=>{
 let s=camp(30);
 s=R.expandPopulation(s);s=R.expandPopulation(s);                 // 部署上限 6
 s=R.setActiveRoster(s,s.activeIds.filter(id=>id!=='starting-horse'));
 for(let i=0;i<4;i++)s=R.buy(s,'pawn');                            // 上阵 6、后备 2、持有 8
 const record=R.journeyRecord(s);
 const storage=memory();J.write(storage,{player:{tutorialCompleted:true,campGuideSeen:true},journey:record});
 const restored=R.stateFromJourney(J.read(storage).journey);
 A.equal(R.populationLimit(restored),6,'刷新后恢复部署上限 6');
 A.equal(R.activeOrdinary(restored).length,6,'刷新后恢复上阵 6');
 A.equal(restored.party.length-R.activeOrdinary(restored).length,2,'刷新后恢复后备 2');
 A.deepEqual(restored.activeIds.slice().sort(),s.activeIds.slice().sort(),'上阵名单一致');
 A.deepEqual(restored.party.map(u=>u.id),s.party.map(u=>u.id),'持有名单一致');
 const board=R.startLevel(s,R.defaultMap());
 const dead=R.copy(board);dead.phase='result';dead.result='dead';
 const retried=R.retryLevel(dead);
 A.equal(retried.phase,'deploy','失败重试回到布阵');
 A.equal(R.populationLimit(retried),6,'失败重试恢复部署上限 6');
 A.equal(R.activeOrdinary(retried).length,6,'失败重试恢复上阵名单');
 A.equal(retried.party.length-R.activeOrdinary(retried).length,2,'失败重试恢复后备名单');
 A.deepEqual(retried.activeIds.slice().sort(),s.activeIds.slice().sort(),'失败重试名单与入关时一致');
});
