const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('web/index.html','utf8'),app=fs.readFileSync('web/js/app.js','utf8');
test('V2.3 页面有主帅、关间整备、救援和布阵入口',()=>{for(const id of ['ov-commander','ov-shop','ov-deploy','deploy-roster','btn-deploy-confirm','btn-next-wave'])assert.match(html,new RegExp(`id="${id}"`));});
test('后台切页取消帧循环，返回后自动重新启动且不触发暂停层',()=>{assert.match(app,/visibilitychange/);assert.match(app,/cancelAnimationFrame\(renderFrame\)/);assert.match(app,/startRenderLoop\(\)/);assert.doesNotMatch(app,/visibilitychange[^]*ov-pause/);});
test('界面接入V2.3商店、救援、布阵规则API',()=>{for(const name of ['R.buy','R.rescue','R.nextLevel','R.deploy','R.confirmDeployment'])assert.ok(app.includes(name));});
