// US-024 定向规则测试：兵/弓/枪取消连动（额外行动）升级，每回合固定 1 AP。
// 以下均为显式构造夹具，用于规则层；正常入口的实际浏览器验收见 tests/us024-pawn-acceptance-browser.cjs。
const {test}=require('node:test'),A=require('node:assert/strict'),R=require('../web/js/rules.js');
const p=(id,k,x,y)=>R.unit(id,'player',k,x,y),e=(id,k,x,y)=>R.unit(id,'enemy',k,x,y),g=(s,id)=>s.units.find(u=>u.id===id);
const f=(...us)=>R.emptyState([p('king','king',4,0),e('boss','king',4,8),...us]);
function standby(s){s.intents=s.units.filter(u=>u.side==='enemy').map((u,i)=>({actor:u.id,from:{x:u.x,y:u.y},to:{x:u.x,y:u.y},type:'standby',path:[],order:i+1}));return s;}
function turn(s){standby(s);return R.endTurn(s).state;}
function purchasable(s,id,skills){return skills.filter(([skill,index])=>R.purchaseUpgrade(s,id,skill,index)!==s).map(([skill,index])=>skill+(index===undefined?'':'#'+index));}
const PAWNISH=['pawn','archer','spearman'];

test('US024-P01 新建兵/弓/枪开始与重置回合均为固定 1 AP，旧 combo 数值不再加成',()=>{
 for(const kind of PAWNISH){
  const s=f(p('u',kind,2,4)),u=g(s,'u');
  A.equal(u.ap,1,kind+' 新单位初始 AP');
  A.equal(u.apLimit,1,kind+' 新单位初始上限');
  A.ok(!Object.hasOwn(u,'combo'),kind+' 新单位不再带 combo 字段');
  u.combo=3;u.ap=0;R.resetTurn(u);
  A.deepEqual([u.ap,u.apLimit],[1,1],kind+' 旧存档 combo=3 被忽略，重置仍为 1');
 }
});

test('US024-P02 三类兵单次行动：首次合法移动/攻击消耗预算，第二次被拒绝，下一回合恢复 1',()=>{
 for(const kind of PAWNISH){
  // 合法移动 → 第二次移动被拒绝
  let s=f(p('u',kind,2,4));
  let out=R.submit(s,'u',{x:2,y:5});
  A.ok(out.effect,kind+' 首次向前移动合法');
  A.deepEqual([g(out.state,'u').x,g(out.state,'u').y,g(out.state,'u').ap,g(out.state,'u').apLimit],[2,5,0,1],kind+' 移动后 0/1');
  A.strictEqual(R.submit(out.state,'u',{x:3,y:5}).state,out.state,kind+' 第二次移动被拒绝');
  let next=turn(out.state);
  A.deepEqual([g(next,'u').ap,g(next,'u').apLimit],[1,1],kind+' 下一回合恢复 1/1');
 }
 // 三类兵各做一次实际攻击，攻击后同样不能再行动
 let s=f(p('p','pawn',2,4),e('ep','pawn',2,5));
 let out=R.submit(s,'p',{x:2,y:5});
 A.ok(out.effect&&!g(out.state,'ep'),'普通兵向前攻击相邻敌兵并击杀');
 A.deepEqual([g(out.state,'p').ap,g(out.state,'p').apLimit],[0,1]);
 A.strictEqual(R.submit(out.state,'p',{x:3,y:5}).state,out.state,'普通兵攻击后不能再移动');
 s=f(p('a','archer',2,4),e('ea','pawn',2,6));
 out=R.submitDirection(s,'a',0);
 A.ok(out.effect,'弓兵向前 2 格攻击合法');
 A.deepEqual([g(out.state,'a').ap,g(out.state,'a').apLimit],[0,1]);
 A.strictEqual(R.submitDirection(out.state,'a',1).state,out.state,'弓兵攻击后不能再攻击');
 s=f(p('s','spearman',2,4),e('es','pawn',2,5));
 out=R.submitDirection(s,'s',0);
 A.ok(out.effect,'枪兵向前 1 格攻击合法');
 A.deepEqual([g(out.state,'s').ap,g(out.state,'s').apLimit],[0,1]);
 A.strictEqual(R.submitDirection(out.state,'s',0).state,out.state,'枪兵攻击后不能再攻击');
});

test('US024-P03 旧 combo 购买一律拒绝：不扣 SP、不改单位；升级候选无行动次数项',()=>{
 for(const kind of PAWNISH){
  const s=f(p('u',kind,2,4));s.teamSp=10;
  const before=JSON.stringify(s);
  A.strictEqual(R.purchaseUpgrade(s,'u','combo'),s,kind+' combo 购买被拒绝');
  A.equal(JSON.stringify(s),before,kind+' 拒绝购买后 SP/单位/状态完全不变');
  const skills=[['fortify'],['combo'],['promote-archer'],['promote-spearman'],['direction',0],['direction',1],['direction',2],['direction',3]];
  const got=purchasable(s,'u',skills);
  A.ok(!got.includes('combo'),kind+' 升级候选无 combo');
  A.ok(got.includes('fortify'),kind+' 强健仍可选');
  if(kind==='pawn')A.deepEqual(got.filter(x=>/^promote-/.test(x)),['promote-archer','promote-spearman'],'普通兵转职候选保留');
  else A.deepEqual(got.filter(x=>/^direction/.test(x)),['direction#0','direction#1','direction#2','direction#3'],kind+' 四向强化候选保留');
 }
});

test('US024-P05 消耗行动后转职/升级不补回行动、不提高上限，仍正常扣公共 SP',()=>{
 // 普通兵先移动再转职弓兵
 let s=f(p('u','pawn',2,4));s.teamSp=5;
 let moved=R.submit(s,'u',{x:2,y:5}).state;
 A.deepEqual([g(moved,'u').ap,g(moved,'u').apLimit],[0,1]);
 let n=R.purchaseUpgrade(moved,'u','promote-archer');
 A.notStrictEqual(n,moved,'转职成功');
 A.equal(g(n,'u').kind,'archer');
 A.deepEqual([g(n,'u').ap,g(n,'u').apLimit,n.teamSp],[0,1,3],'转职不补行动、不加上限、扣 2 SP');
 // 移动后购买强健同样不补行动
 let fortified=R.purchaseUpgrade(moved,'u','fortify');
 A.notStrictEqual(fortified,moved);
 A.deepEqual([g(fortified,'u').ap,g(fortified,'u').apLimit,g(fortified,'u').maxHp],[0,1,2]);
 // 弓兵攻击后强化方向，仍保持 0/1
 s=f(p('a','archer',2,4),e('ea','pawn',2,6));s.teamSp=3;
 const attacked=R.submitDirection(s,'a',0).state;
 A.equal(g(attacked,'a').ap,0);
 const up=R.purchaseUpgrade(attacked,'a','direction',0);
 A.notStrictEqual(up,attacked,'方向强化成功');
 A.deepEqual([g(up,'a').directionPaid[0],g(up,'a').ap,g(up,'a').apLimit,up.teamSp],[1,0,1,3],'攻击击杀 +1 SP、方向强化 -1 SP，行动仍 0/1');
 // 枪兵转职前的行动同样不因升级回补
 s=f(p('q','spearman',2,4));s.teamSp=2;
 const qm=R.submit(s,'q',{x:2,y:5}).state;
 const qf=R.purchaseUpgrade(qm,'q','fortify');
 A.deepEqual([g(qf,'q').ap,g(qf,'q').apLimit,qf.teamSp],[0,1,1]);
});

test('US024-P07 其他棋子行动预算与 US023 兵移动规则保持；升级候选未误删其他技能',()=>{
 let s=f(p('r','rook',0,1),p('c','cannon',2,1),p('h','horse',6,1),p('el','elephant',8,1),p('adv','advisor',3,1));
 g(s,'r').rookRole='charge';
 R.resetTurn(g(s,'r'));R.resetTurn(g(s,'c'));R.resetTurn(g(s,'h'));R.resetTurn(g(s,'el'));R.resetTurn(g(s,'adv'));
 A.deepEqual([g(s,'r').ap,g(s,'r').apLimit],[1,1],'车 AP 仍为 1');
 A.deepEqual([g(s,'c').ap,g(s,'c').apLimit],[1,1],'炮 AP 仍为 1');
 A.deepEqual([g(s,'h').ap,g(s,'h').apLimit],[1,1],'马 AP 仍为 1');
 A.deepEqual([g(s,'el').ap,g(s,'el').apLimit],[1,1],'象 AP 仍为 1');
 A.deepEqual([g(s,'king').ap,g(s,'king').apLimit],[1,1],'帅 AP 仍为 1');
 A.deepEqual([g(s,'adv').ap,g(s,'adv').apLimit],[0,0],'仕固定装置不占 AP');
 g(s,'h').horseJumpUsed=true;g(s,'el').elephantSkillUsed=true;
 const next=turn(s);
 A.equal(g(next,'h').horseJumpUsed,false,'马跳跃额度照常重置');
 A.equal(g(next,'el').elephantSkillUsed,false,'象技能额度照常重置');
 A.deepEqual([g(next,'r').ap,g(next,'c').ap,g(next,'h').ap,g(next,'king').ap],[1,1,1,1],'其他棋子下一回合仍为 1');
 A.ok(g(next,'r').rookMoveAvailable&&g(next,'r').rookChargeAvailable,'车的移动/冲锋额度照常');
 // US023：未过河只能向前；进入敌方半区后可前后左右，仍不能斜走
 let s2=f(p('u','pawn',2,4));
 A.equal(R.actionAt(s2,g(s2,'u'),{x:2,y:3}),undefined,'未过河不能后退');
 A.equal(R.actionAt(s2,g(s2,'u'),{x:3,y:4}),undefined,'未过河不能横走');
 A.ok(R.actionAt(s2,g(s2,'u'),{x:2,y:5}),'未过河可向前');
 let s3=f(p('u','pawn',2,6),p('a','archer',4,6),p('s','spearman',6,6));
 for(const id of ['u','a','s']){
  A.ok(R.actionAt(s3,g(s3,id),{x:g(s3,id).x,y:5}),id+' 过河后可后退（US023）');
  A.ok(R.actionAt(s3,g(s3,id),{x:g(s3,id).x+1,y:6}),id+' 过河后可横走（US023）');
  A.equal(R.actionAt(s3,g(s3,id),{x:g(s3,id).x+1,y:7}),undefined,id+' 过河后仍不能斜走');
 }
 // 其他棋子的升级候选仍保留
 let s4=f(p('r','rook',0,1),p('h','horse',6,1),p('el','elephant',8,1),p('c','cannon',2,1));s4.teamSp=20;
 const kept=purchasable(s4,'r',[['rook-charge-role'],['rook-pull-role'],['rook-charge'],['rook-pull'],['rook-push']]);
 A.deepEqual(kept,['rook-charge-role','rook-pull-role'],'车的转职候选保留（延伸需先转对应职业）');
 const horse=purchasable(s4,'h',[['horse-push'],['horse-jump-distance'],['horse-jump-damage']]);
 A.deepEqual(horse,['horse-push','horse-jump-distance','horse-jump-damage'],'马的升级候选保留');
 const elephant=purchasable(s4,'el',[['elephant-pull-range'],['elephant-freeze-unlock'],['elephant-freeze-duration']]);
 A.deepEqual(elephant,['elephant-pull-range','elephant-freeze-unlock'],'象的升级候选保留（冻结时长需先解锁冰封）');
 A.ok(purchasable(s4,'c',[['cannon-splash',0],['cannon-splash',7]]).length===2,'炮扩散候选保留');
});
