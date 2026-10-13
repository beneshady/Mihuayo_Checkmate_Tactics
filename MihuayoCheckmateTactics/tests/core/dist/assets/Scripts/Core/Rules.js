"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBattleState = void 0;
exports.deepCopy = deepCopy;
exports.finishVictory = finishVictory;
exports.checkTerminal = checkTerminal;
exports.syncParty = syncParty;
exports.retryLevel = retryLevel;
exports.applyAction = applyAction;
exports.submitAction = submitAction;
exports.submitAt = submitAt;
exports.submitDirection = submitDirection;
exports.resetUnitTurn = resetUnitTurn;
exports.resetAllTurns = resetAllTurns;
exports.startBattle = startBattle;
const BattleState_1 = require("./BattleState");
Object.defineProperty(exports, "parseBattleState", { enumerable: true, get: function () { return BattleState_1.parseBattleState; } });
const Config_1 = require("./Config");
const Actions_1 = require("./Actions");
const UnitDefs_1 = require("./UnitDefs");
const Terrain_1 = require("./Terrain");
/** 深拷贝（对齐原型 cp；JSON 往返，微信环境禁 structuredClone） */
function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
}
/** 命中并记录（对齐原型 hit；source='direct'|'collision'） */
function hitRecord(effect, target, amount, source) {
    const before = target.hp;
    target.hp -= amount;
    if (!effect.damage.includes(target.id)) {
        effect.damage.push(target.id);
    }
    const existing = effect.hits.find((h) => h.id === target.id);
    if (existing) {
        existing.damage += amount;
        existing[source === 'direct' ? 'directDamage' : 'collisionDamage'] += amount;
    }
    else {
        const record = {
            id: target.id,
            kind: target.kind,
            side: target.side,
            before,
            damage: amount,
            x: target.x,
            y: target.y,
            directDamage: 0,
            collisionDamage: 0,
        };
        record[source === 'direct' ? 'directDamage' : 'collisionDamage'] = amount;
        effect.hits.push(record);
    }
}
/** 普通命中（含树林 30% 闪避；对齐原型 directHit） */
function directHit(state, attacker, target, effect) {
    if ((0, BattleState_1.terrainAt)(state.map, target.x, target.y) === 'forest') {
        effect.conditional = true;
        if (effect.preview) {
            effect.conditions = effect.conditions ?? [];
            effect.conditions.push(target.id);
        }
        else if ((0, Config_1.nextRandom)(state) < 0.3) {
            effect.misses = effect.misses ?? [];
            effect.misses.push(target.id);
            return false;
        }
    }
    hitRecord(effect, target, attacker.attack, 'direct');
    return true;
}
/** 击杀记账：金币幂等（killLedger），击杀者 +1 等级 +1 SP（对齐原型 recordKill） */
function recordKill(state, actor, dead) {
    if (!actor || actor.side !== 'player' || dead.side !== 'enemy') {
        return;
    }
    state.killLedger = state.killLedger ?? {};
    if (state.killLedger[dead.id]) {
        return;
    }
    state.killLedger[dead.id] = true;
    state.killValues = state.killValues ?? {};
    state.killValues[dead.id] = dead.kind === 'king' ? Config_1.CONFIG.killGold.king : Config_1.CONFIG.killGold.normal;
    actor.kills += 1;
    actor.level += 1;
    actor.sp += 1;
    state.kills = (state.kills ?? 0) + 1;
    state.highestLevel = Math.max(state.highestLevel ?? 1, actor.level);
}
/** 死亡统一处理：留尸、移除、击杀记账（对齐原型 removeDead）；返回本次死亡 id */
function removeDead(state, actor) {
    const dead = state.units.filter((u) => u.hp <= 0);
    dead.forEach((u) => (0, Terrain_1.leaveCorpse)(state, u));
    state.units = state.units.filter((u) => u.hp > 0);
    const actorAlive = !!actor && state.units.some((u) => u.id === actor.id);
    dead.forEach((d) => {
        if (actor && actor.side === 'player' && d.side === 'enemy' && !(state.killLedger ?? {})[d.id]) {
            if (actorAlive) {
                recordKill(state, actor, d);
            }
            else {
                state.killLedger = state.killLedger ?? {};
                state.killLedger[d.id] = true;
                state.killValues = state.killValues ?? {};
                state.killValues[d.id] = d.kind === 'king' ? Config_1.CONFIG.killGold.king : Config_1.CONFIG.killGold.normal;
                state.kills = (state.kills ?? 0) + 1;
            }
        }
    });
    return dead.map((u) => u.id);
}
/**
 * 过关一次性结算（对齐原型 finishVictory）：清意图/待入场 → 牵引车 SP+1 →
 * 按 killLedger/killValues 汇总赏金入 gold（敌将 5 金；killValues 缺项回退 w1-7=5 / 其他=1）→
 * settled 幂等防重 → phase 进入 intermission。
 */
function finishVictory(state) {
    if (state.settled) {
        return;
    }
    state.pendingSpawns = [];
    state.intents = [];
    state.units
        .filter((u) => u.side === 'player' && u.kind !== 'king' && u.kind !== 'advisor' && u.kind === 'rook' && u.rookRole === 'pull')
        .forEach((u) => {
        u.sp += 1;
    });
    const ledger = state.killLedger ?? {};
    const award = Object.keys(ledger).reduce((total, id) => {
        return total + (state.killValues?.[id] ?? (id === 'w1-7' ? Config_1.CONFIG.killGold.king : Config_1.CONFIG.killGold.normal));
    }, 0);
    state.gold = (state.gold ?? 0) + award;
    state.settled = true;
    state.turn.phase = 'intermission';
    state.result = { winner: 'player', reason: 'victory' };
}
/** 终局判定与落地（对齐原型 terminal）：我方帅死 → 失败（优先）；敌将死 → finishVictory 一次性结算 */
function checkTerminal(state) {
    const playerKing = state.units.find((u) => u.side === 'player' && u.kind === 'king');
    if (!playerKing) {
        state.turn.phase = 'result';
        state.result = { winner: 'enemy', reason: '我方帅阵亡' };
        state.intents = [];
        return state.result;
    }
    const enemyKing = state.units.find((u) => u.side === 'enemy' && u.kind === 'king');
    if (!enemyKing) {
        finishVictory(state);
        return state.result;
    }
    return null;
}
/**
 * 队伍底册同步（对齐原型 syncParty）：活单位或其尸体快照回写 party，
 * 保证跨关延续带出本关成长（等级/SP/转职等）。每次结算末尾调用。
 */
function syncParty(state) {
    (state.party ?? []).forEach((base) => {
        const live = state.units.find((u) => u.id === base.id && u.side === 'player');
        const body = (state.corpses ?? []).find((c) => c.unit?.id === base.id);
        const current = live ?? body?.unit;
        if (current) {
            Object.assign(base, deepCopy(current));
        }
    });
}
/**
 * 失败重试（对齐原型 retryLevel）：仅 result 为失败且存在 levelSnapshot 时生效，
 * 返回本关开局快照的完整回滚（阵亡/尸体/地形/花销/成长全部还原），
 * phase 回 deploy 供重新布阵（P3 起可重选帅 buff，不叠加）。
 */
function retryLevel(state) {
    if (state.result?.winner !== 'enemy' || !state.levelSnapshot) {
        return state;
    }
    const next = deepCopy(state.levelSnapshot);
    next.turn.phase = 'deploy';
    next.result = null;
    next.intents = [];
    next.revision = (state.revision ?? 0) + 1;
    return next;
}
/**
 * 冲锋结算（对齐原型 applyCharge）：水中中断 / 近身 / 打山 / 直伤击杀占位 / 震退与碰撞。
 */
function applyCharge(state, unit, action, effect) {
    const target = (0, Terrain_1.unitAt)(state, action.to.x, action.to.y);
    const rock = (0, Terrain_1.isMountainAt)(state, action.to.x, action.to.y);
    const dx = Math.sign(action.to.x - unit.x);
    const dy = Math.sign(action.to.y - unit.y);
    const approach = target || rock ? action.path.slice(0, -1) : action.path;
    const water = approach.find((p) => (0, Terrain_1.isWaterAt)(state, p.x, p.y));
    if (water) {
        unit.x = water.x;
        unit.y = water.y;
        effect.pushStatus = 'water-interrupted';
        (0, Terrain_1.drownCheck)(state, unit, effect);
        return;
    }
    if (!target && !rock) {
        unit.x = action.to.x;
        unit.y = action.to.y;
        return;
    }
    const near = { x: action.to.x - dx, y: action.to.y - dy };
    unit.x = near.x;
    unit.y = near.y;
    effect.approachCell = { ...near };
    if (rock) {
        (0, Terrain_1.rockHit)(state, action.to, effect);
        return;
    }
    if (!target || !directHit(state, unit, target, effect)) {
        return;
    }
    if (target.hp <= 0) {
        effect.victims = removeDead(state, unit);
        if (state.units.some((v) => v.id === unit.id)) {
            unit.x = action.to.x;
            unit.y = action.to.y;
        }
        return;
    }
    if (!unit.rookPush) {
        return;
    }
    const push = { x: target.x + dx, y: target.y + dy };
    if (!(0, Config_1.inside)(push)) {
        effect.pushStatus = 'outside';
        return;
    }
    if ((target.kind === 'king' || target.kind === 'advisor') && !(0, Config_1.inPalace)(target.side, push)) {
        effect.pushStatus = 'palace';
        return;
    }
    const blocker = (0, Terrain_1.unitAt)(state, push.x, push.y);
    const body = (0, Terrain_1.corpseAt)(state, push.x, push.y);
    const wall = (0, Terrain_1.isMountainAt)(state, push.x, push.y);
    if (!blocker && !body && !wall) {
        target.x = push.x;
        target.y = push.y;
        effect.pushed = { id: target.id, to: { ...push } };
        effect.pushStatus = 'pushed';
        (0, Terrain_1.drownCheck)(state, target, effect);
        effect.victims = removeDead(state, unit);
        return;
    }
    effect.pushStatus = wall ? 'collision-mountain' : body ? 'collision-corpse' : 'collision';
    const items = [
        { unit, damage: 1 },
        { unit: target, damage: 2 },
    ];
    if (blocker) {
        items.push({ unit: blocker, damage: 1 });
    }
    items.forEach((item) => hitRecord(effect, item.unit, item.damage, 'collision'));
    if (wall) {
        (0, Terrain_1.rockHit)(state, push, effect);
    }
    effect.victims = removeDead(state, unit);
    if (state.units.some((v) => v.id === unit.id) && !state.units.some((v) => v.id === target.id)) {
        unit.x = action.to.x;
        unit.y = action.to.y;
    }
}
/** 推尸结算（对齐原型 applyPushCorpse） */
function applyPushCorpse(state, unit, action, effect) {
    const body = (0, Terrain_1.corpseAt)(state, action.to.x, action.to.y);
    if (!body) {
        return;
    }
    const dx = Math.sign(action.to.x - unit.x);
    const dy = Math.sign(action.to.y - unit.y);
    const water = action.path.slice(0, -1).find((p) => (0, Terrain_1.isWaterAt)(state, p.x, p.y));
    if (water) {
        unit.x = water.x;
        unit.y = water.y;
        effect.pushStatus = 'water-interrupted';
        (0, Terrain_1.drownCheck)(state, unit, effect);
        return;
    }
    const behind = { x: body.x + dx, y: body.y + dy };
    effect.approachCell = { x: body.x - dx, y: body.y - dy };
    unit.x = effect.approachCell.x;
    unit.y = effect.approachCell.y;
    if (!(0, Config_1.inside)(behind)) {
        effect.pushStatus = 'outside';
        return;
    }
    const blocker = (0, Terrain_1.unitAt)(state, behind.x, behind.y);
    const wall = (0, Terrain_1.isMountainAt)(state, behind.x, behind.y);
    if (!blocker && !wall && !(0, Terrain_1.corpseAt)(state, behind.x, behind.y)) {
        if ((0, Terrain_1.isWaterAt)(state, behind.x, behind.y)) {
            state.corpses = (state.corpses ?? []).filter((c) => c !== body);
            effect.pushStatus = 'water';
        }
        else {
            body.x = behind.x;
            body.y = behind.y;
            effect.pushed = { id: body.id, to: { ...behind } };
            effect.pushStatus = 'pushed';
        }
        return;
    }
    if (blocker || wall) {
        hitRecord(effect, unit, 1, 'collision');
        if (blocker) {
            hitRecord(effect, blocker, 1, 'collision');
        }
        if (wall) {
            (0, Terrain_1.rockHit)(state, behind, effect);
        }
        effect.victims = removeDead(state, unit);
        effect.pushStatus = wall ? 'collision-mountain' : 'collision';
    }
    else {
        effect.pushStatus = 'corpse';
    }
}
/** 牵引结算（对齐原型 applyPull） */
function applyPull(state, unit, action, effect) {
    const target = (0, Terrain_1.unitAt)(state, action.to.x, action.to.y) ?? (0, Terrain_1.corpseAt)(state, action.to.x, action.to.y);
    if (!target || !action.targetTo) {
        return;
    }
    if (action.type === 'pull-collision') {
        // 贴身强拉例外：目标必为敌活子，双方各 -1 不换位
        hitRecord(effect, unit, 1, 'collision');
        hitRecord(effect, target, 1, 'collision');
        effect.victims = removeDead(state, unit);
        effect.pushStatus = 'collision';
        return;
    }
    if (!(0, Terrain_1.unitAt)(state, target.x, target.y)) {
        // 尸体：直接位移，入水销毁
        if ((0, Terrain_1.isWaterAt)(state, action.targetTo.x, action.targetTo.y)) {
            state.corpses = (state.corpses ?? []).filter((c) => c !== target);
            effect.pushStatus = 'water';
        }
        else {
            target.x = action.targetTo.x;
            target.y = action.targetTo.y;
            effect.pushed = { id: target.id, to: { ...action.targetTo } };
            effect.pushStatus = 'pulled';
        }
        return;
    }
    const live = target;
    live.x = action.targetTo.x;
    live.y = action.targetTo.y;
    effect.pushed = { id: live.id, to: { ...action.targetTo } };
    effect.pushStatus = 'pulled';
    (0, Terrain_1.drownCheck)(state, live, effect);
    effect.victims = removeDead(state, unit);
}
/**
 * 单一结算路径（对齐原型 apply）。
 * @param previewMode 预览模式：林闪避只标 conditional 不掷骰
 */
function applyAction(state, action, consumeAction, previewMode = false) {
    const unit = state.units.find((v) => v.id === action.actorId);
    const effect = {
        actor: action.actorId,
        to: { ...action.from },
        actorTo: { ...action.from },
        path: (action.path ?? []).map((p) => ({ ...p })),
        approachCell: null,
        victims: [],
        damage: [],
        hits: [],
        pushed: null,
        pushStatus: null,
        status: 'success',
        preview: previewMode,
    };
    if (!unit) {
        effect.status = 'removed';
        return effect;
    }
    if (action.type === 'move' || action.type === 'rook-move') {
        unit.x = action.to.x;
        unit.y = action.to.y;
        effect.to = { ...action.to };
    }
    else if (action.type === 'charge') {
        applyCharge(state, unit, action, effect);
    }
    else if (action.type === 'charge-corpse') {
        applyPushCorpse(state, unit, action, effect);
    }
    else if (action.type === 'pull' || action.type === 'pull-collision') {
        applyPull(state, unit, action, effect);
    }
    else {
        // attack / directional：目标收集 → 直伤 → 山 → 死亡处理 → 车占位
        let targets = [];
        let cells = [];
        if (action.type === 'directional') {
            targets = (action.targets ?? []).map((id) => state.units.find((v) => v.id === id)).filter((v) => !!v);
            cells = (action.mountains ?? []).map((p) => ({ ...p }));
        }
        else if (unit.kind === 'cannon') {
            cells = [{ ...action.to }];
            Config_1.CONFIG.splash.forEach((d, i) => {
                if (unit.cannonMask & (1 << i)) {
                    const p = { x: action.to.x + d.x, y: action.to.y + d.y };
                    if ((0, Config_1.inside)(p)) {
                        cells.push(p);
                    }
                }
            });
            targets = cells.map((p) => (0, Terrain_1.unitAt)(state, p.x, p.y)).filter((v) => !!v);
        }
        else {
            cells = [{ ...action.to }];
            const one = (0, Terrain_1.unitAt)(state, action.to.x, action.to.y);
            if (one) {
                targets = [one];
            }
        }
        const rocks = cells.filter((p) => (0, Terrain_1.isMountainAt)(state, p.x, p.y));
        targets.sort((a, b) => a.id.localeCompare(b.id));
        targets.forEach((t) => directHit(state, unit, t, effect));
        rocks.forEach((p) => (0, Terrain_1.rockHit)(state, p, effect));
        effect.victims = removeDead(state, unit);
        if (unit.kind === 'rook' && state.units.some((v) => v.id === unit.id)) {
            const dx = Math.sign(action.to.x - unit.x);
            const dy = Math.sign(action.to.y - unit.y);
            unit.x = action.to.x;
            unit.y = action.to.y;
            const stillBlocked = rocks.length > 0 || (targets.length > 0 && targets[0].hp > 0);
            if (stillBlocked) {
                unit.x = action.to.x - dx;
                unit.y = action.to.y - dy;
            }
        }
    }
    if (consumeAction && state.units.some((v) => v.id === unit.id)) {
        consumeUnitAction(unit, action);
    }
    effect.actorDead = !state.units.some((v) => v.id === unit.id);
    effect.to = { x: unit.x, y: unit.y };
    effect.actorTo = { x: unit.x, y: unit.y };
    effect.landings = effect.hits.map((h) => {
        const live = state.units.find((v) => v.id === h.id);
        return { id: h.id, to: live ? { x: live.x, y: live.y } : { x: h.x, y: h.y }, dead: !live };
    });
    delete effect.preview;
    syncParty(state);
    checkTerminal(state);
    return effect;
}
/** 消耗行动额度（对齐原型 consume + setActed） */
function consumeUnitAction(unit, action) {
    if (unit.side !== 'player') {
        return;
    }
    if (unit.kind === 'rook') {
        if (action.type === 'rook-move' || action.type === 'move' || action.type === 'attack') {
            unit.rookMoveAvailable = false;
        }
        else {
            unit.rookMoveAvailable = false;
            unit.rookChargeAvailable = false;
            unit.ap = 0;
        }
    }
    else if (unit.kind === 'cannon') {
        if (action.type === 'move') {
            unit.cannonMoveAvailable = false;
        }
        else {
            unit.cannonMoveAvailable = false;
            unit.cannonAttackAvailable = false;
            unit.ap = 0;
        }
    }
    else {
        unit.ap = Math.max(0, unit.ap - 1);
    }
    setActed(unit);
}
/** 行动结束判定（对齐原型 setActed） */
function setActed(unit) {
    if (unit.kind === 'rook') {
        unit.acted = !unit.rookMoveAvailable && !unit.rookChargeAvailable;
    }
    else if (unit.kind === 'cannon') {
        unit.acted = !unit.cannonMoveAvailable && !unit.cannonAttackAvailable;
    }
    else {
        unit.acted = unit.ap <= 0;
    }
}
/**
 * 玩家动作提交（对齐原型 submitAction：额度校验 + 合法性校验 + revision 防过期）。
 * 非法时原样返回 state（effect 为 null）。
 */
function submitAction(state, action, previewMode = false) {
    const unit = state.units.find((v) => v.id === action.actorId);
    if (!unit || unit.side !== 'player' || state.turn.phase !== 'player') {
        return { state, effect: null, action: null };
    }
    const hasAp = unit.kind === 'rook'
        ? unit.rookMoveAvailable || unit.rookChargeAvailable
        : unit.kind === 'cannon'
            ? unit.cannonMoveAvailable || unit.cannonAttackAvailable
            : unit.ap > 0;
    if (!hasAp) {
        return { state, effect: null, action: null };
    }
    if (action.revision !== undefined && action.revision !== (state.revision ?? 0)) {
        return { state, effect: null, action: null };
    }
    const mode = action.type === 'charge-corpse' ? 'charge' : action.type === 'pull-collision' ? 'pull' : action.type;
    const legal = action.type === 'directional'
        ? (0, Actions_1.directionalAction)(state, unit.id, action.direction ?? -1)
        : (0, Actions_1.actionAt)(state, unit, action.to, mode);
    if (!legal) {
        return { state, effect: null, action: null };
    }
    const next = deepCopy(state);
    const effect = applyAction(next, legal, true, previewMode);
    next.revision = (state.revision ?? 0) + 1;
    return { state: next, effect, action: legal };
}
/** 坐标提交入口（对齐原型 submit） */
function submitAt(state, unitId, to, mode) {
    const unit = state.units.find((v) => v.id === unitId);
    if (!unit || unit.side !== 'player' || state.turn.phase !== 'player') {
        return { state, effect: null };
    }
    const a = (0, Actions_1.actionAt)(state, unit, to, mode);
    return a ? submitAction(state, a) : { state, effect: null };
}
/** 方向提交入口（对齐原型 submitDirection；弓枪远程攻击） */
function submitDirection(state, unitId, d) {
    const a = (0, Actions_1.directionalAction)(state, unitId, d);
    return a ? submitAction(state, a) : { state, effect: null };
}
/** 单位回合重置（对齐原型 resetTurn：车炮双额度恢复、兵 ap=1+combo、敌方不动） */
function resetUnitTurn(unit) {
    if (unit.side !== 'player') {
        return;
    }
    if (unit.kind === 'rook') {
        unit.ap = 1;
        unit.apLimit = 1;
        unit.rookMoveAvailable = true;
        unit.rookChargeAvailable = unit.rookRole !== 'base';
    }
    else if (unit.kind === 'cannon') {
        unit.ap = 1;
        unit.apLimit = 1;
        unit.cannonMoveAvailable = true;
        unit.cannonAttackAvailable = true;
    }
    else {
        unit.apLimit = (0, Actions_1.isPawnish)(unit.kind) ? 1 + unit.combo : 1;
        unit.ap = unit.apLimit;
    }
    unit.acted = false;
}
/** 全员回合重置（我方；敌方无额度概念） */
function resetAllTurns(state) {
    state.units.forEach(resetUnitTurn);
}
/**
 * 从关卡 JSON 构建战局（P0 版 constructLevel：units 直接给双方全量原始输入，
 * 按 makeUnit 初始化运行时字段；P1 引入队伍/后备后改为只取敌方 + party）。
 * @throws BattleParseError 或 Error（地图校验失败）
 */
function startBattle(raw) {
    const parsed = (0, BattleState_1.parseBattleState)(raw);
    const rawUnits = raw.units;
    const units = rawUnits.map((u) => makeUnitSafe(u.id, u.side, u.kind, u.x, u.y, u.rookRole));
    const state = {
        formatVersion: 2,
        meta: parsed.meta,
        map: parsed.map,
        units,
        turn: { round: 1, phase: 'player' },
        corpses: [],
        pendingSpawns: [],
        revision: 0,
        gold: 0,
        kills: 0,
        highestLevel: 1,
        killLedger: {},
        killValues: {},
        result: null,
        history: { commands: [] },
    };
    const errors = (0, BattleState_1.validateMap)(state.map, state.units);
    if (errors.length) {
        throw new Error(`关卡校验失败：${errors.join('；')}`);
    }
    return state;
}
function makeUnitSafe(id, side, kind, x, y, rookRole) {
    return (0, UnitDefs_1.makeUnit)(id, side, kind, x, y, rookRole ?? 'base');
}
