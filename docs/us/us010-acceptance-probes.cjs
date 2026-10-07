// 主策划独立规则夹具；不是正式新局回放，不改变产品代码。
const R = require('../../web/js/rules.js');
const assert = require('node:assert/strict');
const p = (id, kind, x, y) => R.unit(id, 'player', kind, x, y);
const e = (id, kind, x, y) => R.unit(id, 'enemy', kind, x, y);
const state = (...units) => R.emptyState([p('king','king',4,0),e('w1-7','king',4,8),...units]);
const get = (s,id) => s.units.find(u=>u.id===id);
let failed=0, passed=0;
function check(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(err){failed++;console.log('FAIL '+name+' :: '+err.message);}}

check('基础车击杀应占目标格',()=>{
 const s=state(p('car','rook',0,1),e('target','pawn',0,4));
 const n=R.submit(s,'car',{x:0,y:4}).state;
 assert.deepEqual([get(n,'car').x,get(n,'car').y],[0,4]);
});
check('基础车未击杀应接近至目标前格',()=>{
 const s=state(p('car','rook',0,1),e('target','rook',0,4));
 const n=R.submit(s,'car',{x:0,y:4}).state;
 assert.deepEqual([get(n,'car').x,get(n,'car').y],[0,3]);
});
check('枪弓既有回归：盲区敌人必须挡住后方敌人',()=>{
 const s=state(p('bow','archer',2,2),e('near','pawn',2,3),e('far','pawn',2,4));
 assert.equal(R.directionalAction(s,'bow',0),undefined);
});
check('普通兵AP耗尽后不得继续提交攻击',()=>{
 const s=state(p('pawn','pawn',0,2),e('target','rook',0,3));
 const n=R.submit(s,'pawn',{x:0,y:3}).state;
 assert.equal(get(n,'pawn').ap,0);
 assert.equal(R.submit(n,'pawn',{x:0,y:3}).effect,undefined);
});
check('牵引车普通移动模式不应保留远程直接攻击',()=>{
 const car=p('car','rook',0,1);car.rookRole='pull';R.resetTurn(car);
 const s=state(car,e('target','pawn',0,4));
 assert.equal(R.actionAt(s,car,{x:0,y:4},'rook-move'),undefined);
});
check('推尸后车必须来到尸体原格前一格',()=>{
 const car=p('car','rook',0,0);car.rookRole='charge';car.rookPush=true;car.rookChargeRange=3;R.resetTurn(car);
 const s=state(car);s.corpses.push({id:'body',x:0,y:3,unit:p('dead','pawn',0,3)});
 const n=R.submit(s,'car',{x:0,y:3},'charge').state;
 assert.deepEqual([get(n,'car').x,get(n,'car').y],[0,2]);
});
check('敌将不得被震退出九宫',()=>{
 const car=p('car','rook',3,7);car.rookRole='charge';car.rookPush=true;R.resetTurn(car);
 const s=state(car);get(s,'w1-7').x=3;get(s,'w1-7').y=6;
 const n=R.submit(s,'car',{x:3,y:6},'charge').state;
 assert.equal(R.inPalace('enemy',get(n,'w1-7')),true);
});
check('救援完成应回到player阶段',()=>{
 let s=R.chooseCommanderBuff(R.newGame(),'rescue');
 for(let i=0;i<5;i++)s=R.endTurn(s).state;
 assert.equal(s.phase,'rescue');
 assert.equal(R.rescue(s,'rook').phase,'player');
});
check('复活位置使用被移动尸体外层坐标',()=>{
 const s=state();s.phase='rescue';s.turn=6;s.commanderBuff='rescue';
 const dead=p('dead','pawn',0,1);dead.hp=0;
 s.corpses.push({id:'body',x:0,y:2,unit:dead});
 const n=R.rescue(s,'dead');
 assert.deepEqual([get(n,'dead').x,get(n,'dead').y],[0,2]);
});
check('无合法救援目标不能卡住第6回合',()=>{
 const s=state();s.commanderBuff='rescue';s.turn=5;
 const n=R.endTurn(s).state;
 assert.equal(n.phase,'player');
 assert.equal(n.wave,2);
});
check('牵引车过关存活应获得1SP',()=>{
 const car=p('car','rook',0,0);car.rookRole='pull';const s=state(car);s.turn=11;
 const n=R.endTurn(s).state;
 assert.equal(get(n,'car').sp,1);
});
check('发动者同死不发成长但杀敌金币应记账',()=>{
 const car=p('car','rook',0,1);car.rookRole='pull';car.hp=1;R.resetTurn(car);
 const s=state(car,e('victim','pawn',0,2));
 const n=R.submit(s,'car',{x:0,y:2},'pull').state;
 assert.equal(get(n,'car'),undefined);
 assert.equal(n.killLedger.victim,true);
});
check('跨关坚守换疾行必须移除旧加血',()=>{
 let s=R.chooseCommanderBuff(R.newGame(),'health');s.phase='intermission';
 s=R.chooseCommanderBuff(R.confirmDeployment(R.nextLevel(s)),'move');
 assert.equal(get(s,'rook').maxHp,2);
 assert.equal(get(s,'rook').commanderHealth,0);
});
check('死者下关回归应保留本关已获成长',()=>{
 let s=R.chooseCommanderBuff(R.newGame(),'rescue');const car=get(s,'rook');car.sp=4;car.level=5;
 const body=R.copy(car);body.hp=0;s.corpses.push({id:'corpse-rook',x:car.x,y:car.y,unit:body});
 s.units=s.units.filter(u=>u.id!=='rook');s.phase='intermission';
 const n=R.nextLevel(s);assert.equal(get(n,'rook').sp,4);assert.equal(get(n,'rook').level,5);
});
check('八个同类队友进入布阵默认位置不能重叠',()=>{
 let s=R.newGame();s.phase='intermission';s.gold=40;
 for(let i=0;i<8;i++)s=R.buy(s,'rook');
 s=R.setActiveRoster(s,s.party.filter(u=>u.id.startsWith('recruit-')).map(u=>u.id));
 const n=R.nextLevel(s),coords=n.units.filter(u=>u.side==='player').map(u=>u.x+','+u.y);
 assert.equal(new Set(coords).size,coords.length);
});
check('名单不能重复同一单位ID形成复制棋子',()=>{
 const s=R.newGame();s.phase='intermission';
 assert.equal(R.setActiveRoster(s,['rook','rook']),s);
});
console.log(JSON.stringify({passed,failed,total:passed+failed}));
process.exitCode=failed?1:0;
