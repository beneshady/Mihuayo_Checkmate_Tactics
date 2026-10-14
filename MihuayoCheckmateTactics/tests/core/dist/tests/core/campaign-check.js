"use strict";
/**
 * P1 战役框架与经济测试（纯 TS）：对齐原型 rules.js 的 finishVictory/terminal/syncParty/retryLevel
 * 与 constructLevel/confirmDeployment 口径。
 *
 * 运行：tsc -p tsconfig.json 后 node dist/tests/core/campaign-check.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="./node.d.ts" />
const fs_1 = require("fs");
const path_1 = require("path");
const UnitDefs_1 = require("../../assets/Scripts/Core/UnitDefs");
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
    const parsed = JSON.parse(raw);
    return parsed;
}
// ---------- T1 出战底册与默认落位 ----------
{
    const template = (0, Campaign_1.playerTemplate)();
    eq(template.map((u) => `${u.id}:${u.kind}:${u.x},${u.y}`), [
        'rook:rook:0,0', 'starting-cannon:cannon:1,2', 'starting-pawn:pawn:1,3', 'starting-archer:archer:4,3', 'starting-spearman:spearman:7,3',
    ], 'T1 playerTemplate 五人组');
    eq((0, Campaign_1.defaultPosition)('starting-pawn', 2), { x: 1, y: 3 }, 'T1 已知成员默认位');
    eq((0, Campaign_1.defaultPosition)('recruit-rook-0', 0), { x: 2, y: 0 }, 'T1 未知成员轮转第 0 位');
    eq((0, Campaign_1.defaultPosition)('recruit-pawn-3', 9), { x: 6, y: 0 }, 'T1 index 9 → 轮转第 1 位（9%8）');
}
// ---------- T2 constructLevel：重编号/落位/快照/阶段 ----------
{
    const state = (0, Campaign_1.constructLevel)(null, loadLevelJson('level-01'));
    eq(state.level, 1, 'T2 首关 level=1');
    eq(state.gold, 0, 'T2 首关 gold=0');
    eq(state.turn.phase, 'deploy', 'T2 构造即进 deploy');
    eq(state.activeIds?.length, 5, 'T2 新战役全员上阵');
    eq(state.units.filter((u) => u.side === 'player').map((u) => `${u.id}:${u.x},${u.y}`), [
        'king:4,0', 'rook:0,0', 'starting-cannon:1,2', 'starting-pawn:1,3', 'starting-archer:4,3', 'starting-spearman:7,3',
    ], 'T2 我方：帅出生位 + 底册默认位（玩家在前）');
    eq(state.units.filter((u) => u.side === 'enemy').map((u) => `${u.id}:${u.kind}`), [
        'w1-0:pawn', 'w1-1:pawn', 'w1-2:pawn', 'w1-3:rook', 'w1-4:cannon', 'w1-5:advisor', 'w1-6:advisor', 'w1-7:king',
    ], 'T2 敌人按关卡顺序重编号 w1-i（waveOne）');
    assert(!!state.entrySnapshot && !!state.levelSnapshot, 'T2 双快照存在');
    assert(state.entrySnapshot.turn.phase === 'deploy', 'T2 快照也是 deploy 态');
}
{
    // 默认位被敌占 → 自动从我方半场找合法空格；gold/成员字段继承
    const source = {
        gold: 7,
        party: [...(0, Campaign_1.playerTemplate)(), (0, UnitDefs_1.makeUnit)('shi', 'player', 'advisor', 4, 1)],
    };
    const state = (0, Campaign_1.constructLevel)(source, {
        map: { name: 'x', tiles: {} },
        units: [
            { id: 'e', side: 'enemy', kind: 'pawn', x: 0, y: 0 },
            { id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 },
        ],
    });
    eq(state.gold, 7, 'T2 金币继承');
    const rook = state.units.find((u) => u.id === 'rook');
    eq([rook.x, rook.y], [1, 0], 'T2 rook 默认位 (0,0) 被敌占 → 扫描落 (1,0)');
    const advisor = state.units.find((u) => u.id === 'shi');
    eq([advisor.x, advisor.y], [3, 0], 'T2 士无默认位 → 轮转位出宫 → 扫描落宫内 (3,0)');
    eq(state.units.filter((u) => u.side === 'enemy').map((u) => `${u.id}:${u.kind}`), ['w1-0:pawn', 'w1-1:king'], 'T2 敌人重编号且保留');
}
// ---------- T3 confirmDeployment：合法确认 / 非法拒绝 ----------
{
    const state = (0, Campaign_1.confirmDeployment)((0, Campaign_1.constructLevel)(null, loadLevelJson('level-01')));
    eq(state.turn.phase, 'commander', 'T3 合法布阵确认 → commander（P3 帅增益阶段）');
    assert(!!state.entrySnapshot && state.entrySnapshot.turn.phase === 'commander', 'T3 确认后快照更新为 commander 态');
    const broken = (0, Campaign_1.constructLevel)(null, loadLevelJson('level-01'));
    const king = broken.units.find((u) => u.kind === 'king' && u.side === 'player');
    king.x = 0;
    king.y = 0;
    const rejected = (0, Campaign_1.confirmDeployment)(broken);
    eq(rejected.turn.phase, 'deploy', 'T3 帅不在出生位 → 拒绝确认（原样返回）');
}
// ---------- T4 finishVictory：一次性结算 / 幂等 / 牵引车 SP ----------
{
    const state = (0, Campaign_1.constructLevel)(null, { map: { tiles: {} }, units: [{ id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 }] });
    state.units.push({ ...(0, UnitDefs_1.makeUnit)('puller', 'player', 'rook', 2, 2), rookRole: 'pull' });
    state.killLedger = { 'w1-0': true, 'w1-1': true, 'w1-7': true };
    state.killValues = { 'w1-0': 1, 'w1-1': 1, 'w1-7': 5 };
    state.intents = [{ actorId: 'x' }];
    (0, Rules_1.finishVictory)(state);
    eq(state.gold, 7, 'T4 赏金 1+1+5=7 一次性入账');
    eq(state.settled, true, 'T4 settled 标记');
    eq(state.turn.phase, 'intermission', 'T4 进入 intermission');
    eq(state.result, { winner: 'player', reason: 'victory' }, 'T4 result=victory');
    eq(state.units.find((u) => u.id === 'puller').sp, 1, 'T4 牵引车过关 SP+1');
    eq(state.intents, [], 'T4 意图清空');
    (0, Rules_1.finishVictory)(state);
    eq(state.gold, 7, 'T4 重复结算幂等（金币不叠加）');
}
// ---------- T5 checkTerminal 全语义：胜利结算 / 失败落地 ----------
{
    const state = (0, Campaign_1.constructLevel)(null, { map: { tiles: {} }, units: [{ id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 }] });
    state.units = state.units.filter((u) => !(u.kind === 'king' && u.side === 'enemy'));
    state.killLedger = { 'w1-7': true };
    state.killValues = { 'w1-7': 5 };
    const outcome = (0, Rules_1.checkTerminal)(state);
    eq(outcome, { winner: 'player', reason: 'victory' }, 'T5 敌将死 → 胜利 outcome');
    eq(state.turn.phase, 'intermission', 'T5 胜利进入 intermission');
    eq(state.gold, 5, 'T5 敌将 5 金入账');
    const losing = (0, Campaign_1.constructLevel)(null, { map: { tiles: {} }, units: [{ id: 'kk', side: 'enemy', kind: 'king', x: 4, y: 8 }] });
    losing.units = losing.units.filter((u) => u.kind !== 'king' || u.side === 'enemy');
    losing.intents = [{ actorId: 'x' }];
    const outcome2 = (0, Rules_1.checkTerminal)(losing);
    eq(outcome2, { winner: 'enemy', reason: '我方帅阵亡' }, 'T5 帅亡 → 失败 outcome');
    eq(losing.turn.phase, 'result', 'T5 失败进入 result');
    eq(losing.intents, [], 'T5 失败清意图');
}
// ---------- T6 retryLevel：完整回滚 ----------
{
    const confirmed = (0, Campaign_1.confirmDeployment)((0, Campaign_1.constructLevel)(null, loadLevelJson('level-01')));
    // 模拟一整关的破坏：阵亡、留尸、地形破坏、花销、成长、终局
    const pawn = confirmed.units.find((u) => u.id === 'starting-pawn');
    confirmed.units = confirmed.units.filter((u) => u.id !== 'starting-pawn');
    confirmed.corpses = [{ id: 'corpse-starting-pawn', x: pawn.x, y: pawn.y, unit: { ...pawn, hp: 0 } }];
    confirmed.map.tiles['6,6'] = 'land'; // 原为 mountain
    confirmed.gold = 99;
    const rook = confirmed.units.find((u) => u.id === 'rook');
    rook.sp += 5;
    rook.level += 2;
    confirmed.result = { winner: 'enemy', reason: '我方帅阵亡' };
    confirmed.turn.phase = 'result';
    const retry = (0, Rules_1.retryLevel)(confirmed);
    assert(retry !== confirmed, 'T6 重试返回新战局');
    assert(!!retry.units.find((u) => u.id === 'starting-pawn'), 'T6 阵亡成员复活');
    eq(retry.corpses, [], 'T6 尸体清空');
    eq(retry.map.tiles['6,6'], 'mountain', 'T6 地形还原');
    eq(retry.gold, 0, 'T6 花销回滚');
    eq([retry.units.find((u) => u.id === 'rook').sp, retry.units.find((u) => u.id === 'rook').level], [0, 1], 'T6 成长回滚');
    eq(retry.turn.phase, 'deploy', 'T6 回到 deploy（可重选布阵/buff）');
    eq(retry.result, null, 'T6 result 清空');
    eq(retry.revision, (confirmed.revision ?? 0) + 1, 'T6 revision 递增');
    // 非失败态重试 = 原样返回
    const victory = (0, Campaign_1.confirmDeployment)((0, Campaign_1.constructLevel)(null, loadLevelJson('level-01')));
    victory.result = { winner: 'player', reason: 'victory' };
    assert((0, Rules_1.retryLevel)(victory) === victory, 'T6 胜利态重试无效');
}
// ---------- T7 两关连打：金币结算 + 队伍延续（含阵亡复活与后备） ----------
{
    const b1 = (0, Campaign_1.confirmDeployment)((0, Campaign_1.constructLevel)(null, loadLevelJson('level-01')));
    // 模拟第一关战果：兵升 1 级 1 SP、弓阵亡、击杀两敌
    const pawn = b1.units.find((u) => u.id === 'starting-pawn');
    pawn.level = 2;
    pawn.sp = 1;
    const archer = b1.units.find((u) => u.id === 'starting-archer');
    b1.units = b1.units.filter((u) => u.id !== 'starting-archer');
    b1.corpses = [{ id: 'corpse-starting-archer', x: archer.x, y: archer.y, unit: { ...archer, hp: 0 } }];
    b1.killLedger = { 'w1-0': true, 'w1-1': true };
    b1.killValues = { 'w1-0': 1, 'w1-1': 1 };
    (0, Rules_1.syncParty)(b1);
    (0, Rules_1.finishVictory)(b1);
    eq(b1.gold, 2, 'T7 首关赏金 2');
    const partyPawn = b1.party.find((u) => u.id === 'starting-pawn');
    eq([partyPawn.level, partyPawn.sp], [2, 1], 'T7 成长经 syncParty 回写底册');
    const partyArcher = b1.party.find((u) => u.id === 'starting-archer');
    eq(partyArcher.hp, 0, 'T7 阵亡成员底册记为尸体快照（hp0）');
    // 下一关：全员重新满血上阵（含阵亡者）
    const b2 = (0, Campaign_1.constructLevel)(b1, loadLevelJson('level-02'), { next: true });
    eq(b2.level, 2, 'T7 下一关 level=2');
    eq(b2.gold, 2, 'T7 金币跨关延续');
    const b2Pawn = b2.units.find((u) => u.id === 'starting-pawn');
    eq([b2Pawn.level, b2Pawn.sp, b2Pawn.hp], [2, 1, b2Pawn.maxHp], 'T7 兵带成长满血再战');
    const revivedArcher = b2.units.find((u) => u.id === 'starting-archer');
    eq(revivedArcher.hp, revivedArcher.maxHp, 'T7 阵亡者下一关复活满血');
    // 后备：不上阵、保留成长
    const b2Archer = b2.units.find((u) => u.id === 'starting-archer');
    b2Archer.level = 2;
    (0, Rules_1.syncParty)(b2);
    b2.activeIds = b2.activeIds.filter((id) => id !== 'starting-archer');
    b2.bench = ['starting-archer'];
    const benchPawn = b2.units.find((u) => u.id === 'starting-pawn');
    benchPawn.level = 3;
    (0, Rules_1.syncParty)(b2);
    const b3 = (0, Campaign_1.constructLevel)(b2, loadLevelJson('level-01'), { next: true });
    eq(b3.level, 3, 'T7 第三关 level=3');
    assert(!b3.units.some((u) => u.id === 'starting-archer'), 'T7 后备不上阵');
    eq(b3.party.find((u) => u.id === 'starting-archer').level, 2, 'T7 后备保留成长');
    eq(b3.units.find((u) => u.id === 'starting-pawn').level, 3, 'T7 上阵成员继续延续');
    // 存档闭环：序列化 → 还原 → 续打
    const save = (0, Campaign_1.serializeCampaign)(b3, 3);
    eq([save.level, save.gold, save.unlockedLevel], [3, 2, 3], 'T7 存档字段');
    const resumed = (0, Campaign_1.constructLevel)((0, Campaign_1.campaignSourceFrom)(save), loadLevelJson('level-02'), { levelNo: save.level });
    eq(resumed.level, 3, 'T7 存档续打关卡号');
    eq(resumed.gold, 2, 'T7 存档续打金币');
    eq(resumed.party.find((u) => u.id === 'starting-pawn').level, 3, 'T7 存档续打队伍');
}
console.log(`\n战役流验证：通过 ${passed} 项断言，失败 ${failures.length} 项`);
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`  [FAIL] ${failure}`);
    }
    process.exit(1);
}
