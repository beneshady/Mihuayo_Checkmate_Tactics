const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('web/index.html','utf8'),app=fs.readFileSync('web/js/app.js','utf8'),campaign=fs.readFileSync('web/js/campaign.js','utf8');
// US-020 取代 V2.3 的关间商店与三选一：主营地承接招募/扩编/增益，救援改为第二波前的一次机会。
test('US-020 页面有主营地、选关预览、救援与布阵入口',()=>{
 for(const id of ['ov-rescue','ov-deploy','deploy-roster','btn-deploy-confirm','flow-camp','flow-tutorial','level-preview-grid','camp-guide','tutorial-hint','ov-tutorial'])assert.match(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(html,/id="ov-commander"/,'三选一已取消');
 assert.doesNotMatch(html,/id="ov-shop"/,'关间商店已由主营地取代');
 assert.doesNotMatch(html,/id="btn-next-wave"/);
 assert.doesNotMatch(html,/id="btn-buff-/);
 assert.match(html,/猫粮/);
});
test('后台切页取消帧循环，返回后自动重新启动且不触发暂停层',()=>{assert.match(app,/visibilitychange/);assert.match(app,/cancelAnimationFrame\(renderFrame\)/);assert.match(app,/startRenderLoop\(\)/);const at=app.indexOf("document.addEventListener('visibilitychange'");assert.ok(at>=0,'未找到 visibilitychange 处理器');const end=app.indexOf('});',at);assert.ok(end>at,'未找到 visibilitychange 处理器结束');assert.doesNotMatch(app.slice(at,end),/ov-pause/,'visibilitychange 处理器不得打开暂停层');});
test('界面接入规则 API：招募、救援、进关、布阵与旅程增益',()=>{
 for(const name of ['R.buy','R.rescue','R.rescueSkip','R.startLevel','R.deploy','R.confirmDeployment','R.expandPopulation','R.unlockBuff','R.enterCamp','R.populationLimit'])assert.ok(app.includes(name)||campaign.includes(name),'缺少 '+name);
 assert.match(campaign,/M0Journey/,'旅程存档接入');
});
