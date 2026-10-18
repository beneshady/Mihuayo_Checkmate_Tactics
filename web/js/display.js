/* 同一游戏实例的显示视口；不读取或修改旅程。 */
(function(){'use strict';
const frame=document.getElementById('display-frame'),shell=document.getElementById('game-shell'),viewport=document.getElementById('game-viewport');
let manual=false,mode=window.innerWidth<=900?'mobile':'desktop',width=1,height=1,scale=1;
function layout(){
 if(!manual)mode=window.innerWidth<=900?'mobile':'desktop';
 const w=Math.max(1,window.innerWidth),h=Math.max(1,window.innerHeight);
 if(mode==='mobile'){width=Math.min(448,w);height=w<=900?h:924;}
 else{width=Math.max(1024,w);height=Math.max(768,h);}
 scale=Math.min(1,w/width,h/height);
 // 外框按实际显示尺寸占位，未缩放的容器绝对定位在框内。
 frame.style.width=width*scale+'px';frame.style.height=height*scale+'px';
 shell.style.width=width+'px';shell.style.height=height+'px';shell.style.transform='scale('+scale+')';
 viewport.dataset.layoutMode=mode;
 document.querySelectorAll('[data-display-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.displayMode===mode)));
 document.getElementById('display-current').textContent=mode==='mobile'?'当前：手机版':'当前：网页版';
}
function select(next){if(!['mobile','desktop'].includes(next))return;manual=true;mode=next;layout();window.dispatchEvent(new Event('resize'));}
window.M0Display={isMobile:()=>mode==='mobile',size:()=>({width,height,scale}),local:p=>{const r=viewport.getBoundingClientRect();return{x:(p.x-r.left)/scale,y:(p.y-r.top)/scale};},select};
document.querySelectorAll('[data-display-mode]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.displayMode)));
window.addEventListener('resize',layout);layout();
})();
