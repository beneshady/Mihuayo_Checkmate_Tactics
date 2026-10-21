const R=require('../../web/js/rules.js');
const p=(id,kind,x,y)=>R.unit(id,'player',kind,x,y);
function f(...units){const s=R.emptyState(units);s.phase='player';return s;}
const g=(s,id)=>s.units.find(u=>u.id===id);
let old=f(p('a','pawn',0,1));delete old.teamSp;g(old,'a').sp=2;
old.party=[Object.assign(p('a','pawn',0,1),{sp:99}),Object.assign(p('dead','pawn',1,1),{sp:90}),Object.assign(p('bench','horse',2,1),{sp:4})];
old.bench=['bench'];
old.corpses=[{id:'body',x:1,y:1,unit:Object.assign(p('dead','pawn',1,1),{sp:3})}];
old.entrySnapshot=R.copy(old);old.levelSnapshot=R.copy(old);g(old.levelSnapshot,'a').sp=1;
const n=R.migrateState(old);
console.log('n.teamSp',n.teamSp,'snap',n.levelSnapshot.teamSp);
old.result='dead';
let retry=R.retryLevel(old);
console.log('retry1 teamSp',retry.teamSp,'phase',retry.phase,'hasSnap',!!retry.levelSnapshot,'snapSp',retry.levelSnapshot&&retry.levelSnapshot.teamSp);
retry=R.chooseCommanderBuff(retry,'health');
console.log('after buff phase',retry.phase,'teamSp',retry.teamSp,'hasSnap',!!retry.levelSnapshot,'snapSp',retry.levelSnapshot&&retry.levelSnapshot.teamSp,'same',retry===old);
retry.teamSp=0;retry.phase='result';retry.result='dead';
const r2=R.retryLevel(retry);
console.log('retry2 teamSp',r2.teamSp, 'same',r2===retry);

