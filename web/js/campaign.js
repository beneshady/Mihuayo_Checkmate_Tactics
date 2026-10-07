/* US012: reuse art screens; battle remains the sole owner of combat and rewards. */
(async function(){'use strict';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const internal=params.has('fixture')||params.get('editor-test')==='1'||params.has('device-preview');
document.body.classList.toggle('campaign-player',!internal);
const names=['关中','中原','江淮'],symbols=['隘','城','泽'];
let journey=false,completed=0,selected=1,view='loading',returnView='map';
function show(next){view=next;const battle=next==='battle';$('campaign').hidden=battle;$('battle-root').hidden=!battle;['loading','menu','map'].forEach(v=>$('flow-'+v).hidden=v!==next);if(window.__M0_CAMPAIGN__){window.__M0_CAMPAIGN__[battle?'resume':'suspend']();}if(next==='map')map();if(next==='menu')$('flow-continue').hidden=!journey||completed===3;window.dispatchEvent(new Event('resize'));}
function map(){const s=window.__M0_CAMPAIGN__.state();selected=Math.min(3,Math.max(1,selected));$('flow-level-number').textContent='第'+selected+'关';$('flow-level-name').textContent=names[selected-1];$('flow-level-symbol').textContent=symbols[selected-1];$('flow-level-copy').textContent='当前默认地形相同，可通过编辑器替换。';const allowed=journey&&selected===completed+1&&completed<3;const running=s.level===selected&&s.phase!=='intermission';$('flow-enter').disabled=!allowed;$('flow-enter').textContent=allowed?(running&&s.phase!=='deploy'?'继续本关':'进入第'+selected+'关'):selected<=completed?'已完成':'尚未解锁';$('flow-lock').textContent=selected<=completed?'本关已完成，不能重复领奖。':selected>completed+1?'先完成第'+(completed+1)+'关。':'待挑战 · '+(running?'保留当前关进度':'进入时读取保存地图');document.querySelectorAll('#campaign [data-region]').forEach(b=>{const n=Number(b.dataset.region)+1;b.classList.toggle('selected',n===selected);if(b.tagName==='BUTTON'){b.setAttribute('aria-pressed',String(n===selected));b.textContent=n+' · '+names[n-1]+' · '+(n<=completed?'已完成':n===completed+1?'待挑战':'未解锁');}});}
function start(){window.__M0_CAMPAIGN__.newJourney();journey=true;completed=0;selected=1;returnView='map';show('map');}
function requestNew(){if(journey){$('flow-new-confirm').hidden=false;}else start();}
function menu(){if(view==='battle')returnView='battle';else if(view==='map')returnView='map';show('menu');}
$('flow-new').onclick=requestNew;$('flow-new-yes').onclick=()=>{$('flow-new-confirm').hidden=true;start();};$('flow-new-no').onclick=()=>$('flow-new-confirm').hidden=true;
$('flow-continue').onclick=()=>show(returnView);$('flow-back').onclick=menu;
document.querySelectorAll('#campaign [data-region]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.region)+1;map();});
function enter(n){if(!Number.isInteger(n)||!journey||completed>=3||n!==completed+1)return false;const s=window.__M0_CAMPAIGN__.state();if(n!==s.level&&!window.__M0_CAMPAIGN__.enterNext(n))return false;show('battle');return true;}
$('flow-enter').onclick=()=>enter(selected);
window.M0Campaign=internal?null:{menu,requestNew,toMap:()=>{selected=completed+1;returnView='map';show('map');},update:s=>{if(journey&&s.phase==='intermission')completed=Math.max(completed,s.level);},enter,info:()=>({journey,completed,selected,view})};
const scripts=['vendor/three.min.js','js/rules.js','js/maps.js','js/app.js','js/ui.js'];
let startupError=null;const failed=e=>{startupError=e.error||Error(e.message);};window.addEventListener('error',failed);
try{for(const src of scripts){$('flow-load-status').textContent='正在准备棋盘与旅程…';await new Promise((ok,no)=>{const el=document.createElement('script');el.src=src+'?v=v1-flow-20261006';el.onload=ok;el.onerror=()=>no(Error('资源加载失败：'+src));document.body.append(el);});if(startupError)throw startupError;}if(!window.__M0_CAMPAIGN__)throw Error('战斗入口未准备好');window.removeEventListener('error',failed);show(internal?'battle':'menu');}
catch(e){window.removeEventListener('error',failed);show('loading');$('flow-load-status').textContent='准备失败：'+e.message;$('flow-reload').hidden=false;$('flow-reload').onclick=()=>location.reload();}
})();
