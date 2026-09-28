// 无浏览器的交互回归，不代替真实浏览器试玩。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const G = require('./rules.js');
class Element {
  constructor() { this.children=[];this.attributes={};this.style={};this.dataset={};this.disabled=false;this.hidden=false;this.textContent='';this.value='main'; }
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k];}
  scrollIntoView(){}
  addEventListener(k,fn){this['on'+k]=fn;}
}
function setup(){
  const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};let randomCalls=0;
  const math=Object.create(Math);math.random=()=>{randomCalls++;return 0;};
  // 规则在同一 VM 中载入，确保随机数调用也被监测。
  const stored=new Map();
  const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element(),addEventListener:()=>{}},Math:math,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)}});
  vm.runInContext(fs.readFileSync(__dirname+'/rules.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
  const click=id=>{assert.ok(!get(id).disabled,`${id} disabled`);get(id).onclick();};
  const cell=(x,y)=>get('board').children.find(e=>e.dataset.cell===`${x},${y}`);
  const scenario=name=>{get('scenario').value=name;get('scenario').onchange();};
  const brush=value=>{const b=get(value.includes(':')?'piece-tools':'quick-tools').children.find(e=>e.attributes['aria-label']===value || e.textContent===value);assert.ok(b,`tool ${value}`);b.onclick();};
  return {get,click,cell,scenario,brush,stored,randomCalls:()=>randomCalls};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('兵横移可撤销，恢复机会；取消攻击不锁定撤销',()=>{
  const t=setup();t.cell(2,4).onclick();t.cell(1,4).onclick();assert.match(t.get('selection').textContent,/第1列第4行/);t.click('undo');assert.match(t.get('selection').textContent,/共用行动 1/);
  t.cell(1,1).onclick();t.cell(1,2).onclick();t.click('attack');t.cell(1,3).onclick();assert.ok(!t.get('execute').disabled);t.click('cancel');assert.ok(!t.get('undo').disabled);
});
test('实际攻击锁定撤销、无成长界面',()=>{
  const t=setup();t.cell(1,1).onclick();t.cell(1,2).onclick();t.cell(2,4).onclick();t.click('attack');t.cell(2,5).onclick();t.click('execute');assert.ok(t.get('undo').disabled);assert.match(t.get('status').textContent,/击杀 1/);assert.ok(t.get('execute').disabled);
});
test('致死移动先预览，可取消；确认后死亡且不可撤销',()=>{
  const t=setup();t.scenario('water');t.cell(7,4).onclick();t.cell(7,5).onclick();assert.match(t.get('preview').textContent,/立即阵亡/);t.click('cancel');assert.match(t.cell(7,4).attributes['aria-label'],/我方兵/);
  t.cell(7,5).onclick();t.click('execute');assert.doesNotMatch(t.cell(7,5).attributes['aria-label'],/我方兵/);assert.ok(t.get('undo').disabled);
});
test('树林预览、选择、撤销不抽随机数，真实攻击才抽取',()=>{
  const t=setup();t.scenario('forest');t.cell(2,4).onclick();t.click('attack');t.cell(4,4).onclick();assert.match(t.get('preview').textContent,/有一定概率/);assert.doesNotMatch(t.get('preview').textContent,/30/);t.click('cancel');t.cell(4,4).onclick();assert.equal(t.randomCalls(),0);t.click('execute');assert.equal(t.randomCalls(),1);assert.match(t.cell(4,4).attributes['aria-label'],/生命2/);assert.ok(t.get('undo').disabled);
});
test('山坍塌保留可辨认状态而不是完整山或空引用',()=>{
  const t=setup();t.scenario('mountain');t.cell(1,3).onclick();t.click('attack');t.cell(3,3).onclick();t.click('execute');t.cell(3,2).onclick();t.cell(3,3).onclick();t.click('execute');assert.match(t.cell(3,3).attributes['aria-label'],/坍塌陆地 空格/);assert.match(t.cell(2,3).attributes['aria-label'],/我方车/);
});
test('页面内结束确认：取消不推进；确定只推进一次',()=>{
  const t=setup();t.click('end');assert.equal(t.get('confirmation').hidden,false);assert.ok(t.get('end').disabled);t.click('dismiss-action');assert.match(t.get('status').textContent,/第 1 回合/);t.click('end');t.click('confirm-action');assert.match(t.get('status').textContent,/第 2 回合/);t.get('confirm-action').onclick();assert.match(t.get('status').textContent,/第 2 回合/);
});
test('完整单波：3回合斩将，无商店；重开清零恢复地形与阵容',()=>{
  const t=setup();for(const [x,id] of [[2,'pawn'],[5,'archer'],[8,'spear']]){t.cell(x,4).onclick();t.click('attack');t.cell(x,5).onclick();t.click('execute');}
  t.cell(2,3).onclick();t.click('move');t.cell(5,3).onclick();t.click('attack');
  for(let n=0;n<3;n++){t.cell(5,8).onclick();t.click('execute');if(n<2){t.click('end');t.click('confirm-action');}}
  assert.match(t.get('status').textContent,/本波胜利/);assert.ok(t.get('end').disabled);t.click('restart');t.click('confirm-action');assert.match(t.get('status').textContent,/第 1 回合.*击杀 0/);assert.equal(t.get('roster').children.length,6);assert.match(t.cell(3,4).attributes['aria-label'],/剩余 2/);
});
test('编辑地形支持撤销重做，不改变旧战局，取消恢复',()=>{
  const t=setup();t.click('edit-map');assert.match(t.get('status').textContent,/地图编辑/);assert.equal(t.get('play-panel').hidden,true);
  t.brush('≈ 水');t.cell(1,4).onclick();assert.match(t.cell(1,4).attributes['aria-label'],/水/);t.click('edit-undo');assert.match(t.cell(1,4).attributes['aria-label'],/陆地/);t.click('edit-redo');assert.match(t.cell(1,4).attributes['aria-label'],/水/);t.click('cancel-edit');assert.match(t.cell(1,4).attributes['aria-label'],/陆地/);assert.match(t.get('status').textContent,/第 1 回合/);
});
test('点击移动棋子；拒绝占山或覆盖棋子；可恢复删除',()=>{
  const t=setup();t.click('edit-map');t.cell(1,1).onclick();t.cell(3,4).onclick();assert.match(t.cell(1,1).attributes['aria-label'],/我方车/);t.cell(1,3).onclick();assert.match(t.cell(1,3).attributes['aria-label'],/我方车/);
  t.brush('⌫ 删除棋子');t.cell(1,3).onclick();assert.doesNotMatch(t.cell(1,3).attributes['aria-label'],/我方车/);t.click('edit-undo');assert.match(t.cell(1,3).attributes['aria-label'],/我方车/);
});
test('添加棋子工具、阵营选择、非法开局清楚提示并禁用测试',()=>{
  const t=setup();t.click('edit-map');t.get('piece-tools').children.find(b=>b.attributes['aria-label']==='放置我方马').onclick();t.cell(2,2).onclick();assert.match(t.cell(2,2).attributes['aria-label'],/我方马/);
  t.brush('≈ 水');t.cell(2,4).onclick();assert.ok(t.get('test-map').disabled);assert.match(t.get('map-errors').textContent,/入水即死/);t.click('edit-undo');assert.ok(!t.get('test-map').disabled);
  t.click('team-enemy');assert.ok(t.get('piece-tools').children.some(b=>b.attributes['aria-label']==='放置敌方士'));
});
test('自定义地图测试、返回原稿、重开保持自定义布局',()=>{
  const t=setup();t.click('edit-map');t.brush('♠ 树林');t.cell(1,4).onclick();t.click('test-map');assert.match(t.get('status').textContent,/第 1 回合/);assert.equal(t.get('edit-map').textContent,'返回编辑');assert.match(t.cell(1,4).attributes['aria-label'],/树林/);
  t.click('end');t.click('confirm-action');t.click('edit-map');assert.match(t.cell(2,6).attributes['aria-label'],/敌方兵/);assert.match(t.cell(1,4).attributes['aria-label'],/树林/);t.click('cancel-edit');assert.match(t.get('status').textContent,/第 2 回合/);
  t.click('restart');t.click('confirm-action');assert.match(t.get('status').textContent,/第 1 回合/);assert.match(t.cell(1,4).attributes['aria-label'],/树林/);
});
test('保存读取仅使用实验键；读取可撤销；损坏草稿不改当前布局',()=>{
  const t=setup();t.click('edit-map');t.brush('♠ 树林');t.cell(1,4).onclick();t.click('save-map');assert.equal(t.stored.size,1);t.brush('▧ 陆地');t.cell(1,4).onclick();t.click('load-map');assert.match(t.cell(1,4).attributes['aria-label'],/树林/);t.click('edit-undo');assert.match(t.cell(1,4).attributes['aria-label'],/陆地/);
  t.stored.set('terrain-wave.map.v1','not-json');t.click('load-map');assert.match(t.get('save-status').textContent,/无法读取/);assert.match(t.cell(1,4).attributes['aria-label'],/陆地/);
});
test('缺将帅不能测试，放帅工具移动唯一主帅而不复制',()=>{
  const t=setup();t.click('edit-map');t.brush('⌫ 删除棋子');t.cell(5,1).onclick();assert.ok(t.get('test-map').disabled);assert.match(t.get('map-errors').textContent,/我方帅必须/);
  t.get('piece-tools').children.find(b=>b.attributes['aria-label']==='放置我方帅').onclick();t.cell(4,1).onclick();assert.ok(!t.get('test-map').disabled);t.cell(6,1).onclick();assert.doesNotMatch(t.cell(4,1).attributes['aria-label'],/我方帅/);assert.match(t.cell(6,1).attributes['aria-label'],/我方帅/);
});
console.log(`${count}/${count} UI interaction checks passed`);
