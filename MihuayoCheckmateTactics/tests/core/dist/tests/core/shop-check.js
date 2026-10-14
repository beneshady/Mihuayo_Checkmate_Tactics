"use strict";
/**
 * P2 商店与布阵测试（纯 TS）：对齐原型 rules.js 的 buy / setActiveRoster / deploy /
 * confirmDeployment 口径（pure：非法返回原 state 引用）。
 *
 * 运行：tsc -p tsconfig.json 后 node dist/tests/core/shop-check.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="./node.d.ts" />
const fs_1 = require("fs");
const path_1 = require("path");
const Rules_1 = require("../../assets/Scripts/Core/Rules");
const Campaign_1 = require("../../assets/Scripts/Core/Campaign");
let passed = 0;
const failures = [];
function assert(cond, name) {
    if (cond) {
        passed++;
    }
    else {
        failures.push(name);
    }
}
function eq(actual, expected, name) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    assert(a === b, `${name}（实际 ${a} ≠ 期望 ${b}）`);
}
function findProjectRoot() {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        try {
            (0, fs_1.readFileSync)((0, path_1.join)(dir, 'assets', 'resources', 'Levels', 'level-list.json'), 'utf8');
            return dir;
        }
        catch {
            dir = (0, path_1.join)(dir, '..');
        }
    }
    throw new Error('找不到项目根');
}
function loadLevelJson(id) {
    const raw = (0, fs_1.readFileSync)((0, path_1.join)(findProjectRoot(), 'assets', 'resources', 'Levels', `${id}.json`), 'utf8');
    return JSON.parse(raw);
}
/** 构造 intermission 态：打完一关的战局（底册五人组 + 金币） */
function intermissionState(gold) {
    const state = (0, Campaign_1.confirmDeployment)((0, Campaign_1.constructLevel)(null, loadLevelJson('level-01')));
    state.killLedger = { 'w1-0': true };
    state.killValues = { 'w1-0': 1 };
    (0, Rules_1.finishVictory)(state);
    state.gold = gold;
    return state;
}
// ---------- T1 价格表 ----------
{
    eq((0, Campaign_1.shopPrice)('pawn'), 3, 'T1 兵 3 金');
    eq((0, Campaign_1.shopPrice)('rook'), 5, 'T1 车 5 金');
    eq((0, Campaign_1.shopPrice)('horse'), 5, 'T1 马 5 金');
    eq((0, Campaign_1.shopPrice)('cannon'), 5, 'T1 炮 5 金');
}
// ---------- T2 buyRecruit：正常购买 / id 序号 / 自动上阵 ----------
{
    const state = intermissionState(20);
    const b1 = (0, Campaign_1.buyRecruit)(state, 'pawn');
    assert(b1 !== state, 'T2 购买返回新 state');
    eq(b1.gold, 17, 'T2 扣款 20-3=17');
    eq(b1.party.length, 6, 'T2 底册 +1');
    eq(b1.party[5].id, 'recruit-pawn-0', 'T2 id 序号从 0');
    eq(b1.activeIds.length, 6, 'T2 <8 自动上阵');
    eq(b1.bench, [], 'T2 后备为空');
    const b2 = (0, Campaign_1.buyRecruit)(b1, 'pawn');
    eq(b2.party[6].id, 'recruit-pawn-1', 'T2 同棋种序号递增');
    const b3 = (0, Campaign_1.buyRecruit)(b2, 'rook');
    eq([b3.gold, b3.party[7].id, b3.party[7].kind], [9, 'recruit-rook-0', 'rook'], 'T2/T3 车扣款 14-5=9');
}
// ---------- T3 buyRecruit 拒绝路径 ----------
{
    const state = intermissionState(2);
    assert((0, Campaign_1.buyRecruit)(state, 'rook') === state, 'T3 金币不足（车 5>2）拒');
    assert((0, Campaign_1.buyRecruit)(state, 'pawn') === state, 'T3 金币不足（兵 3>2）拒');
    const poor = intermissionState(3);
    assert((0, Campaign_1.buyRecruit)(poor, 'advisor') === poor, 'T3 仕不在售');
    const deploying = (0, Campaign_1.constructLevel)(null, loadLevelJson('level-01'));
    assert((0, Campaign_1.buyRecruit)(deploying, 'pawn') === deploying, 'T3 deploy 阶段不可购买');
}
// ---------- T4 第 9 名成员进后备 ----------
{
    let state = intermissionState(50);
    for (let i = 0; i < 3; i++) {
        state = (0, Campaign_1.buyRecruit)(state, 'pawn');
    }
    eq(state.activeIds.length, 8, 'T4 5 原始 + 3 新兵补满 8 席');
    eq(state.bench.length, 0, 'T4 暂无后备');
    state = (0, Campaign_1.buyRecruit)(state, 'pawn');
    eq(state.activeIds.length, 8, 'T4 第 9 名不进上阵');
    eq(state.bench.length, 1, 'T4 第 9 名入后备');
}
// ---------- T5 setActiveRoster ----------
{
    const state = intermissionState(10);
    const bought = (0, Campaign_1.buyRecruit)((0, Campaign_1.buyRecruit)(state, 'pawn'), 'rook'); // 7 人
    const swapped = (0, Campaign_1.setActiveRoster)(bought, bought.activeIds.slice(0, 6)); // 撤下 1 人
    eq(swapped.activeIds.length, 6, 'T5 上阵名单生效');
    eq(swapped.bench.length, 1, 'T5 后备 = 全员 - 上阵');
    assert((0, Campaign_1.setActiveRoster)(bought, ['ghost']) === bought, 'T5 未知 id 拒');
    assert((0, Campaign_1.setActiveRoster)(bought, [bought.activeIds[0], bought.activeIds[0]]) === bought, 'T5 重复 id 拒');
    const nineState = withNineUnits(); // 9 人底册
    const nine = nineState.party.map((u) => u.id);
    eq(nine.length, 9, 'T5 前置：9 人底册');
    assert((0, Campaign_1.setActiveRoster)(nineState, nine) === nineState, 'T5 >8 拒');
    assert((0, Campaign_1.setActiveRoster)(bought, []) !== bought, 'T5 空名单合法（全后备）');
    assert((0, Campaign_1.setActiveRoster)(bought, []).bench.length === bought.party.length, 'T5 空名单 → 全员后备');
}
// ---------- T6 deployUnit ----------
{
    const deploying = (0, Campaign_1.constructLevel)(null, loadLevelJson('level-01')); // phase deploy
    const rook = deploying.units.find((u) => u.id === 'rook');
    const moved = (0, Campaign_1.deployUnit)(deploying, 'rook', { x: 3, y: 1 });
    assert(moved !== deploying, 'T6 落位返回新 state');
    const movedRook = moved.units.find((u) => u.id === 'rook');
    eq([movedRook.x, movedRook.y], [3, 1], 'T6 车移到 (3,1)');
    assert((0, Campaign_1.deployUnit)(deploying, 'king', { x: 3, y: 1 }) === deploying, 'T6 帅固定位不可移');
    assert((0, Campaign_1.deployUnit)(deploying, 'rook', { x: 1, y: 5 }) === deploying, 'T6 过河（y≥4）拒');
    assert((0, Campaign_1.deployUnit)(deploying, 'rook', { x: 4, y: 4 }) === deploying, 'T6 河格 y=4 越界拒（我方半场 y≤3，桥都在河上）');
    assert((0, Campaign_1.deployUnit)(deploying, 'ghost', { x: 3, y: 1 }) === deploying, 'T6 未知单位拒');
    // 占用格：帅位 (4,0)
    assert((0, Campaign_1.deployUnit)(deploying, 'rook', { x: 4, y: 0 }) === deploying, 'T6 占用格（帅位）拒');
    // 山格经 isOccupied（含山）被拒（对齐原型 occupied 口径）
    assert((0, Campaign_1.deployUnit)(deploying, 'rook', { x: 2, y: 2 }) === deploying, 'T6 山格拒（occupied 含山）');
}
// ---------- T7 闭环：购买 → 布阵 → 确认 → 战斗 ----------
{
    let state = intermissionState(20);
    state = (0, Campaign_1.buyRecruit)(state, 'horse');
    state = (0, Campaign_1.buyRecruit)(state, 'cannon');
    eq([state.gold, state.activeIds.length], [10, 7], 'T7 买马+炮剩 10 金、7 人上阵');
    const next = (0, Campaign_1.constructLevel)(state, loadLevelJson('level-02'), { next: true });
    eq(next.turn.phase, 'deploy', 'T7 下一关 deploy 态');
    eq(next.units.filter((u) => u.side === 'player').length, 8, 'T7 帅 + 7 名队友上阵');
    const horse = next.units.find((u) => u.kind === 'horse');
    eq([horse.x, horse.y], [5, 3], 'T7 新兵默认落备用位（activeId 序 5 → (5,3)）');
    const step1 = (0, Campaign_1.deployUnit)(next, horse.id, { x: 6, y: 2 });
    const step2 = (0, Campaign_1.deployUnit)(step1, horse.id, { x: 6, y: 3 });
    eq([step2.units.find((u) => u.kind === 'horse').x, step2.units.find((u) => u.kind === 'horse').y], [6, 3], 'T7 布阵可连续调整');
    const confirmed = (0, Campaign_1.confirmDeployment)(step2);
    eq(confirmed.turn.phase, 'commander', 'T7 确认后进 commander（P3 帅增益阶段）');
    assert(!!confirmed.entrySnapshot && confirmed.entrySnapshot.turn.phase === 'commander', 'T7 快照重设为确认后状态');
    // 后备不获本关收益：后备成员不在战斗单位里（9 人底册 = 帅 + 8 上阵）
    const b2 = (0, Campaign_1.confirmDeployment)((0, Campaign_1.constructLevel)(withNineUnits(), loadLevelJson('level-02'), { next: true }));
    eq(b2.units.filter((u) => u.side === 'player').length, 9, 'T7 上阵 8 + 帅，后备第 9 人不上阵');
}
/** 造 9 人底册（8 上阵 + 1 后备）的 intermission 态 */
function withNineUnits() {
    let state = intermissionState(60);
    for (let i = 0; i < 4; i++) {
        state = (0, Campaign_1.buyRecruit)(state, 'pawn');
    }
    return state;
}
console.log(`\n商店与布阵验证：通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`  [FAIL] ${failure}`);
    }
    process.exit(1);
}
