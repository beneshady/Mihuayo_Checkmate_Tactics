const test=require('node:test'),A=require('node:assert/strict');const {generate,R}=require('./normal-playthrough.cjs');
// 保留原US010收益/救援回放，使用明示的历史无山林地图；新首关由terrain-editor-browser正常实测。
function legacyStart(){const map=R.defaultMap();map.name='US010历史回归地图';for(const k of Object.keys(map.tiles))if(['mountain','forest'].includes(map.tiles[k]))map.tiles[k]='land';return R.newGame(map);}
test('历史地图合法回放：手动布阵、固定两波、真实杀敌结算、购买、换人、下关及失败重试',()=>{
 const {steps,state}=generate('move',legacyStart());let s=state;A.ok(steps.some(x=>x.expected.turn===5));A.ok(steps.some(x=>x.expected.wave===2));A.equal(s.gold,s.kills);A.equal(s.turn,11);
 const entryGold=s.gold;s=R.buy(s,'pawn');s=R.buy(s,'pawn');A.equal(s.gold,entryGold-6);const recruits=s.party.filter(u=>u.id.startsWith('recruit-pawn'));A.equal(recruits.length,2);A.notEqual(recruits[0].id,recruits[1].id);
 const benched=s.activeIds[0];s=R.setActiveRoster(s,s.activeIds.filter(id=>id!==benched));A.ok(s.bench.includes(benched));
 s=R.nextLevel(s);A.equal(s.level,2);A.equal(s.phase,'deploy');A.ok(!s.units.some(u=>u.id===benched));s=R.deploy(s,recruits[0].id,{x:2,y:3});s=R.confirmDeployment(s);const snapshot=R.copy(s);s=R.chooseCommanderBuff(s,'health');
 for(let n=0;n<12&&s.phase==='player';n++)s=R.endTurn(s).state;A.equal(s.result,'dead');s=R.retryLevel(s);A.equal(s.phase,'deploy');A.equal(s.gold,snapshot.gold);A.deepEqual(s.party,snapshot.party);A.deepEqual(s.bench,snapshot.bench);A.equal(s.turn,1);A.equal(s.wave,1);A.equal(s.commanderBuff,null);s=R.chooseCommanderBuff(s,'move');A.equal(s.phase,'player');A.equal(s.units.find(u=>u.id===recruits[0].id).commanderHealth,0);
});
test('历史地图救援合法回放也能完成两波与真实收益；救援只触发一次',()=>{const {steps,state}=generate('rescue',legacyStart());A.equal(steps.filter(s=>s.type==='rescue').length,1);A.equal(state.phase,'intermission');A.ok(state.gold>=6);});
