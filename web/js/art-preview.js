/* 独立美术占位页，不写入正式战斗状态。 */
(async function(){
 'use strict';
 const selector=document.getElementById('view');
 function show(id){document.querySelectorAll('.screen').forEach(node=>node.hidden=node.id!==id);selector.value=id;document.getElementById('notice').hidden=true;}
 selector.addEventListener('change',()=>show(selector.value));
 document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.go)));
 document.getElementById('labels').addEventListener('change',event=>document.body.classList.toggle('hide-labels',!event.target.checked));
 document.querySelectorAll('[data-note]').forEach(button=>button.addEventListener('click',()=>{const notice=document.getElementById('notice');notice.textContent=button.dataset.note;notice.hidden=false;}));
 const regions=[['第一关','关中','隘','山隘与城塞。预留西部关卡的地图区域和主题插画。'],['第二关','中原','城','平原与城邑。预留中央关卡的地图区域和主题插画。'],['第三关','江淮','泽','水网与林地。预留东南关卡的地图区域和主题插画。']];
 document.querySelectorAll('[data-region]').forEach(node=>node.addEventListener('click',()=>{const index=Number(node.dataset.region),region=regions[index];document.getElementById('level-number').textContent=region[0];document.getElementById('level-name').textContent=region[1];document.getElementById('level-symbol').textContent=region[2];document.getElementById('level-copy').textContent=region[3];document.querySelectorAll('[data-region]').forEach(other=>{other.classList.toggle('selected',other.dataset.region===String(index));if(other.tagName==='BUTTON')other.setAttribute('aria-pressed',String(other.dataset.region===String(index)));});}));
 try{const response=await fetch('assets/placeholders/ui-reservations.json');if(!response.ok)throw new Error('资源目录加载失败');const rows=await response.json();const root=document.getElementById('resource-list');rows.forEach((r,i)=>{const id=`A-${String(87+i).padStart(3,'0')}`;document.querySelectorAll(`[data-slot="${r[7]}"]`).forEach(node=>{if(node.namespaceURI.includes('svg'))return;const label=document.createElement('span');label.className='resource-label';label.textContent=id+' · '+r[7];node.appendChild(label);});const card=document.createElement('article');card.className='resource-card';for(const [tag,text] of [['strong',id+' / '+r[0]],['h2',r[1]],['p',r[3]+' · '+r[2]],['p',r[4]],['p',r[5]],['p',r[6]],['p',r[8]],['code',r[7]]]){const line=document.createElement(tag);line.textContent=text;card.appendChild(line)}root.appendChild(card);});}catch(error){document.getElementById('resource-list').textContent='资源目录未加载，请通过本地 HTTP 服务打开。';}
})();
