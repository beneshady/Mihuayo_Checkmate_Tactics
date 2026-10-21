const R=require("../web/js/rules.js");
const g=(s,id)=>s.units.find(u=>u.id===id);
// 1. 普通棋子击杀：即时金币/公共SP/击杀记账
let s=R.chooseCommanderBuff(R.newGame(),"health");
Object.assign(g(s,"starting-pawn"),{x:2,y:4});Object.assign(g(s,"w1-0"),{x:2,y:5,hp:1});
let before={gold:s.gold,teamSp:s.teamSp,kills:s.kills,ledger:Object.keys(s.killLedger).length};
const out=R.submit(s,"starting-pawn",{x:2,y:5});
s=out.state;
console.log("杀敌后:",JSON.stringify({gold:s.gold,teamSp:s.teamSp,kills:s.kills,ledger:Object.keys(s.killLedger),killValues:s.killValues}),"before:",JSON.stringify(before));
// 2. 关卡结算时的金币奖励
s.settled=false;s.phase="player";s.turn=11;
const end=R.endTurn(s).state;
console.log("第11回合结算:",JSON.stringify({phase:end.phase,gold:end.gold,kills:end.kills,teamSp:end.teamSp}));
// 3. 敌将价值
let t=R.emptyState([R.unit("king","player","king",4,0),R.unit("boss","enemy","king",4,1)]);
t.units.find(u=>u.id==="boss").hp=1;
const r=R.submit(t,"king",{x:4,y:1}); // 主帅不能攻击，应为空操作
console.log("主帅攻击敌将:",JSON.stringify({stateChanged:r.state!==t}));
