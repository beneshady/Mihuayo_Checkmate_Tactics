const fs=require('fs');
const p='web/js/campaign.js';
let s=fs.readFileSync(p,'utf8');
const subs=[
 ["const R=()=>window.M0,rules=()=>window.M0,bridge=()=>window.__M0_CAMPAIGN__;","const rules=()=>window.M0,bridge=()=>window.__M0_CAMPAIGN__;"],
 ["function requestNew(){if(journey&&!window.confirmStart){$('flow-new-confirm').hidden=false;}else{$('flow-new-confirm').hidden=true;start();}}","function requestNew(){if(journey){$('flow-new-confirm').hidden=false;return;}start();}"],
 ["function start(){\n // 新旅程：先到第 0 关教学入口；曾完成教学的玩家可以选择跳过。\n journey=null;show('tutorial');renderTutorial();\n}","function start(){\n // 新旅程：先到第 0 关教学入口；曾完成教学的玩家可以选择跳过。\n window.M0Tutorial&&window.M0Tutorial.stop();\n tutorialOn=false;\n show('tutorial');renderTutorial();\n}"],
 [" const buffs=state.buffs||{},ordinary=state.units?0:0;\n"," const buffs=state.buffs||{};\n"],
 ["if(!campAction({type:'roster',ids}))toast(`上阵普通队友已达人口上限 ${limit}：请先换下一名，或到营地把支到 ${limit+1}`);","if(!campAction({type:'roster',ids}))toast(`上阵普通队友已达人口上限 ${limit}：请先换下一名，或在营地扩编人口`);"],
 [" const completed=Math.max(0,(state.completed||0));\n persist(state);"," persist(state);"],
 [" try{window.M0Journey.write(storage,record);}catch(e){return e.message||'保存失败，本次操作已撤销';}\n return null;"," try{window.M0Journey.write(storage,record);}catch(e){return e.message||'保存失败，本次操作已撤销';}\n journey=record.journey;\n return null;"]
];
for(const [a,b] of subs){ if(s.indexOf(a)<0){ console.log('MISS: '+a.slice(0,50)); continue; } s=s.replace(a,b); }
fs.writeFileSync(p,s);
console.log('campaign fixes applied');
