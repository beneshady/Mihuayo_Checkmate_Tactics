// US-020: map back goes to camp; add menu entry on map and camp header.
const fs=require('fs');
let h=fs.readFileSync('web/index.html','utf8');
function sub(a,b,label){if(h.indexOf(a)<0)throw Error('anchor missing: '+label);h=h.split(a).join(b);console.log('patched '+label);}
sub(
 '<header><button id="flow-back">← 返回菜单</button><div><small>征战山河</small><h1>三地，三关</h1></div><span><a href="editor.html" target="_blank" rel="noopener">地图编辑器 ↗</a></span></header>',
 '<header><button id="flow-back">← 返回主营地</button><div><small>征战山河</small><h1>三地，三关</h1></div><span><button id="flow-menu-link">菜单</button><a href="editor.html" target="_blank" rel="noopener">地图编辑器 ↗</a></span></header>',
 'map header');
sub('<header><button id="camp-help">帮助</button>','<header><button id="camp-help">帮助</button><button id="camp-menu">菜单</button>','camp header');
fs.writeFileSync('web/index.html',h);
console.log('done');
