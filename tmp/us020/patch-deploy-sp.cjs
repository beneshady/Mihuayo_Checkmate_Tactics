const fs=require('fs');
let r=fs.readFileSync('web/js/rules.js','utf8');
const before="function purchaseUpgrade(s,id,skill,index){if(['player','intermission'].indexOf(s.phase)<0)return s;";
const after="function purchaseUpgrade(s,id,skill,index){if(['player','intermission','deploy'].indexOf(s.phase)<0)return s;";
if(r.indexOf(before)<0)throw Error('anchor missing purchaseUpgrade');
fs.writeFileSync('web/js/rules.js',r.replace(before,after));
let a=fs.readFileSync('web/js/app.js','utf8');
const b2="const badPhase=!['player','intermission'].includes(state.phase)";
const a2="const badPhase=!['player','intermission','deploy'].includes(state.phase)";
if(a.indexOf(b2)<0)throw Error('anchor missing badPhase');
fs.writeFileSync('web/js/app.js',a.replace(b2,a2));
let t=fs.readFileSync('tests/us020-camp.test.cjs','utf8');
t=t.split('R.cp(').join('R.copy(');
t=t.replace("   const before=camp(price+1),after=R.buy(before,kind);\n  A.equal(after.gold,1,`${kind} 售价 ${price}`);\n  A.equal(after.party.filter(u=>u.kind===kind).length,1,`${kind} 购入成功`);",
"  const before=camp(price+1),beforeCount=before.party.filter(u=>u.kind===kind).length,after=R.buy(before,kind);\n  A.equal(after.gold,1,`${kind} 售价 ${price}`);\n  A.equal(after.party.filter(u=>u.kind===kind).length,beforeCount+1,`${kind} 购入成功`);");
t=t.replace("test('C05 进入关卡资格：只能进入 completed+1，已通关不可重打',()=>{\n let s=camp(0);s.completed=2;\n const n=R.startLevel(s,R.defaultMap());\n A.equal(n.level,3,'下一关由通关进度推导');\n A.equal(n.completed,2);\n const done=Object.assign(R.copy(s),{completed:3});\n A.equal(done.completed,3);\n A.equal(R.startLevel(done,R.defaultMap()).level,4===4?4:4,'仅规则层推导，界面在 completed>=3 时禁止进入');\n});",
"test('C05 进入关卡资格：关卡号只由通关进度推导，已通关关卡回到同一进度',()=>{\n let s=camp(0);s.completed=2;\n const n=R.startLevel(s,R.defaultMap());\n A.equal(n.level,3,'下一关由通关进度推导');\n A.equal(n.completed,2);\n const first=R.startLevel(camp(0),R.defaultMap());\n A.equal(first.level,1,'新旅程从第 1 关开始');\n A.equal(R.startLevel(Object.assign(camp(0),{completed:1}),R.defaultMap()).level,2);\n});");
t=t.replace(" A.strictEqual(R.purchaseUpgrade(up2,'rook','fortify',undefined)===up2,false,'继续升级仍可进行');\n const poor=R.purchaseUpgrade(Object.assign(R.copy(s),{teamSp:0}),'rook','fortify');\n A.equal(poor.teamSp===0&&P(poor,'rook').maxHp===2||true,'SP 不足拒绝');",
" const more=R.purchaseUpgrade(up2,'rook','fortify');\n A.notStrictEqual(more,up2,'同一队友可继续升级，不受单次回营限制');\n const poor=Object.assign(R.copy(s),{teamSp:0});\n A.strictEqual(R.purchaseUpgrade(poor,'rook','fortify'),poor,'公共 SP 不足时拒绝且不扣款');");
fs.writeFileSync('tests/us020-camp.test.cjs',t);
console.log('patched rules/app/tests');
