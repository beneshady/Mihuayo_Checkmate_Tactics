// US-020: tutorial result overlay wiring in campaign.js
const fs=require('fs');
const p='web/js/campaign.js';
let s=fs.readFileSync(p,'utf8');
function sub(a,b,label){ if(s.indexOf(a)<0)throw Error('anchor missing: '+label); s=s.replace(a,b); console.log('patched '+label); }

sub(
"$('tutorial-retry').onclick=()=>{$('tutorial-fail').hidden=true;tutorialOn=true;bridge().startTutorial();window.M0Tutorial.start();show('battle');};\n$('tutorial-fail-menu').onclick=()=>{$('tutorial-fail').hidden=true;tutorialOn=false;window.M0Tutorial.stop();menu();};\n$('tutorial-done-ok').onclick=()=>{$('tutorial-done').hidden=true;const state=bridge().state();finishTutorial('completed',rules().tutorialReward(state));};",
[
 "// 教学结果复用战斗内 overlay：完成与失败都停留在教学，不进入主营地。",
 "function showTutorialOverlay(kind,state){",
 " const box=$('ov-tutorial'),title=$('tutorial-overlay-title'),body=$('tutorial-overlay-body'),actions=$('tutorial-overlay-actions');",
 " if(!box)return;",
 " if(kind==='done'){",
 "  title.textContent='教学完成';",
 "  body.innerHTML=`<p>你已完成全部教学目标（不必击杀敌方将）。本次教学击杀结算 <b>${rules().tutorialReward(state)} 猫粮</b>，会带入旅程。</p><p>进入主营地还会获得新旅程首次入营的 8 猫粮与免费坚守。</p>`;",
 "  actions.innerHTML='<button id=\"tutorial-done-ok\" class=\"primary\">前往主营地</button>';",
 "  actions.querySelector('#tutorial-done-ok').onclick=()=>{box.classList.remove('show');finishTutorial('completed',rules().tutorialReward(_tutorialState||state));};",
 " }else{",
 "  title.textContent='教学失败';",
 "  body.innerHTML='<p>主帅阵亡。首次教学不能跳过，也不会进入主营地；请重试直到完成教学目标。</p>';",
 "  actions.innerHTML='<button id=\"tutorial-retry\" class=\"primary\">重新开始教学</button><button id=\"tutorial-fail-menu\">返回菜单</button>';",
 "  actions.querySelector('#tutorial-retry').onclick=()=>{box.classList.remove('show');bridge().startTutorial();window.M0Tutorial.start();show('battle');};",
 "  actions.querySelector('#tutorial-fail-menu').onclick=()=>{box.classList.remove('show');tutorialOn=false;window.M0Tutorial.stop();menu();};",
 " }",
 " box.classList.add('show');",
 "}"
].join('\n'),
'tutorial overlay');
s=s.replace("let view='loading',journey=null,player=null,selected=1,tutorialOn=false,current=null,campNotice='';","let view='loading',journey=null,player=null,selected=1,tutorialOn=false,current=null,campNotice='',_tutorialState=null;");
sub(
" tutorialGoals:state=>{\n  const reward=rules().tutorialReward(state);\n  $('tutorial-done').hidden=false;\n  $('tutorial-done-copy').textContent=`实际完成教学目标，本次教学击杀结算 ${reward} 猫粮（会带入旅程）。进入主营地另有新旅程首次入营的 8 猫粮与免费坚守。`;\n },",
" tutorialGoals:state=>{_tutorialState=state;showTutorialOverlay('done',state);},",
'tutorialGoals');
sub(
" tutorialFinished:()=>{const state=bridge().state();$('tutorial-done').hidden=true;finishTutorial('completed',rules().tutorialReward(state));},",
" tutorialFinished:()=>{const state=bridge().state();finishTutorial('completed',rules().tutorialReward(state));},",
'tutorialFinished');
sub(
"  if(tutorialOn){window.M0Tutorial.stop();$('tutorial-fail').hidden=false;}",
"  if(tutorialOn)showTutorialOverlay('fail',state);",
'tutorial fail');
fs.writeFileSync(p,s);
console.log('campaign tutorial overlay patched');
