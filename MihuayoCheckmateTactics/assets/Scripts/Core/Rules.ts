import {
    BattleState,
    BattleUnit,
    GridPos,
    UnitKind,
    parseBattleState,
    terrainAt,
    validateMap,
} from './BattleState';
import { CONFIG, inPalace, inside, nextRandom } from './Config';
import { UnitAction, actionAt, directionalAction, isPawnish } from './Actions';
import { makeUnit } from './UnitDefs';
import {
    corpseAt,
    drownCheck,
    isMountainAt,
    isWet,
    isWaterAt,
    leaveCorpse,
    rockHit,
    unitAt,
} from './Terrain';

/**
 * 战局规则与结算内核（v2，对齐原型 rules.js 的结算与提交链路：
 * hit / directHit / apply / consume / removeDead / recordKill / terminal / resetTurn / submit 系列；
 * 纯 TS，零引擎依赖）。
 *
 * 设计约束：
 * - applyAction 是唯一结算路径：预测（深拷贝上 previewMode=true）与真实执行共用，保证「预览=实际」；
 * - applyAction 原地修改传入 state；「不改原局」的纯度由调用方先深拷贝保证（submitAction / 预测均已拷贝）；
 * - 玩家动作带 revision 校验，防过期提交。
 */

export { parseBattleState };

/** 单次命中的伤害记录（对齐原型 effect.hits 元素） */
export interface HitRecord {
    id: string;
    kind: UnitKind;
    side: string;
    before: number;
    damage: number;
    x: number;
    y: number;
    directDamage: number;
    collisionDamage: number;
}

/** 一次动作的完整结算效果（对齐原型 effect；表现层只读此结构投影） */
export interface Effect {
    actor: string;
    to: GridPos;
    actorTo: GridPos;
    path: GridPos[];
    approachCell: GridPos | null;
    victims: string[];
    damage: string[];
    hits: HitRecord[];
    pushed: { id: string; to: GridPos } | null;
    pushStatus: string | null;
    status: 'success' | 'removed' | 'standby' | 'cancelled' | 'miss';
    reason?: string;
    /** 林闪避：本次结算含条件结果（30%） */
    conditional?: boolean;
    /** 林闪避：预览时标注的受条件影响目标 id */
    conditions?: string[];
    /** 结算中被树林闪避的目标 id（对齐原型 e.misses） */
    misses?: string[];
    waterDeaths?: string[];
    mountains?: GridPos[];
    actorDead?: boolean;
    landings?: Array<{ id: string; to: GridPos; dead: boolean }>;
    /** 预览模式标记（结算前存在，applyAction 末尾删除） */
    preview?: boolean;
}

/** 深拷贝（对齐原型 cp；JSON 往返，微信环境禁 structuredClone） */
export function deepCopy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/** 命中并记录（对齐原型 hit；source='direct'|'collision'） */
function hitRecord(effect: Effect, target: BattleUnit, amount: number, source: 'direct' | 'collision'): void {
    const before = target.hp;
    target.hp -= amount;
    if (!effect.damage.includes(target.id)) {
        effect.damage.push(target.id);
    }
    const existing = effect.hits.find((h) => h.id === target.id);
    if (existing) {
        existing.damage += amount;
        existing[source === 'direct' ? 'directDamage' : 'collisionDamage'] += amount;
    } else {
        const record: HitRecord = {
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
function directHit(state: BattleState, attacker: BattleUnit, target: BattleUnit, effect: Effect): boolean {
    if (terrainAt(state.map, target.x, target.y) === 'forest') {
        effect.conditional = true;
        if (effect.preview) {
            effect.conditions = effect.conditions ?? [];
            effect.conditions.push(target.id);
        } else if (nextRandom(state) < 0.3) {
            effect.misses = effect.misses ?? [];
            effect.misses.push(target.id);
            return false;
        }
    }
    hitRecord(effect, target, attacker.attack, 'direct');
    return true;
}

/** 击杀记账：金币幂等（killLedger），击杀者 +1 等级 +1 SP（对齐原型 recordKill） */
function recordKill(state: BattleState, actor: BattleUnit | undefined, dead: BattleUnit): void {
    if (!actor || actor.side !== 'player' || dead.side !== 'enemy') {
        return;
    }
    state.killLedger = state.killLedger ?? {};
    if (state.killLedger[dead.id]) {
        return;
    }
    state.killLedger[dead.id] = true;
    state.killValues = state.killValues ?? {};
    state.killValues[dead.id] = dead.kind === 'king' ? CONFIG.killGold.king : CONFIG.killGold.normal;
    actor.kills += 1;
    actor.level += 1;
    actor.sp += 1;
    state.kills = (state.kills ?? 0) + 1;
    state.highestLevel = Math.max(state.highestLevel ?? 1, actor.level);
}

/** 死亡统一处理：留尸、移除、击杀记账（对齐原型 removeDead）；返回本次死亡 id */
/** 结算并移除阵亡单位（生成尸体 / 水面销尸）；Waves.attemptSpawns 也使用 */
export function removeDead(state: BattleState, actor: BattleUnit | undefined): string[] {
    const dead = state.units.filter((u) => u.hp <= 0);
    dead.forEach((u) => leaveCorpse(state, u));
    state.units = state.units.filter((u) => u.hp > 0);
    const actorAlive = !!actor && state.units.some((u) => u.id === actor.id);
    dead.forEach((d) => {
        if (actor && actor.side === 'player' && d.side === 'enemy' && !(state.killLedger ?? {})[d.id]) {
            if (actorAlive) {
                recordKill(state, actor, d);
            } else {
                state.killLedger = state.killLedger ?? {};
                state.killLedger[d.id] = true;
                state.killValues = state.killValues ?? {};
                state.killValues[d.id] = d.kind === 'king' ? CONFIG.killGold.king : CONFIG.killGold.normal;
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
export function finishVictory(state: BattleState): void {
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
        return total + (state.killValues?.[id] ?? (id === 'w1-7' ? CONFIG.killGold.king : CONFIG.killGold.normal));
    }, 0);
    state.gold = (state.gold ?? 0) + award;
    state.settled = true;
    state.turn.phase = 'intermission';
    state.result = { winner: 'player', reason: 'victory' };
}

/** 终局判定与落地（对齐原型 terminal）：我方帅死 → 失败（优先）；敌将死 → finishVictory 一次性结算 */
export function checkTerminal(state: BattleState): { winner: string; reason: string } | null {
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
export function syncParty(state: BattleState): void {
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
export function retryLevel(state: BattleState): BattleState {
    if (state.result?.winner !== 'enemy' || !state.levelSnapshot) {
        return state;
    }
    const next = deepCopy(state.levelSnapshot);
    next.turn.phase = 'deploy';
    next.commanderBuff = null;
    next.result = null;
    next.intents = [];
    next.revision = (state.revision ?? 0) + 1;
    return next;
}

/**
 * 冲锋结算（对齐原型 applyCharge）：水中中断 / 近身 / 打山 / 直伤击杀占位 / 震退与碰撞。
 */
function applyCharge(state: BattleState, unit: BattleUnit, action: UnitAction, effect: Effect): void {
    const target = unitAt(state, action.to.x, action.to.y);
    const rock = isMountainAt(state, action.to.x, action.to.y);
    const dx = Math.sign(action.to.x - unit.x);
    const dy = Math.sign(action.to.y - unit.y);
    const approach = target || rock ? action.path.slice(0, -1) : action.path;
    const water = approach.find((p) => isWaterAt(state, p.x, p.y));
    if (water) {
        unit.x = water.x;
        unit.y = water.y;
        effect.pushStatus = 'water-interrupted';
        drownCheck(state, unit, effect);
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
        rockHit(state, action.to, effect);
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
    if (!inside(push)) {
        effect.pushStatus = 'outside';
        return;
    }
    if ((target.kind === 'king' || target.kind === 'advisor') && !inPalace(target.side, push)) {
        effect.pushStatus = 'palace';
        return;
    }
    const blocker = unitAt(state, push.x, push.y);
    const body = corpseAt(state, push.x, push.y);
    const wall = isMountainAt(state, push.x, push.y);
    if (!blocker && !body && !wall) {
        target.x = push.x;
        target.y = push.y;
        effect.pushed = { id: target.id, to: { ...push } };
        effect.pushStatus = 'pushed';
        drownCheck(state, target, effect);
        effect.victims = removeDead(state, unit);
        return;
    }
    effect.pushStatus = wall ? 'collision-mountain' : body ? 'collision-corpse' : 'collision';
    const items: Array<{ unit: BattleUnit; damage: number }> = [
        { unit, damage: 1 },
        { unit: target, damage: 2 },
    ];
    if (blocker) {
        items.push({ unit: blocker, damage: 1 });
    }
    items.forEach((item) => hitRecord(effect, item.unit, item.damage, 'collision'));
    if (wall) {
        rockHit(state, push, effect);
    }
    effect.victims = removeDead(state, unit);
    if (state.units.some((v) => v.id === unit.id) && !state.units.some((v) => v.id === target.id)) {
        unit.x = action.to.x;
        unit.y = action.to.y;
    }
}

/** 推尸结算（对齐原型 applyPushCorpse） */
function applyPushCorpse(state: BattleState, unit: BattleUnit, action: UnitAction, effect: Effect): void {
    const body = corpseAt(state, action.to.x, action.to.y);
    if (!body) {
        return;
    }
    const dx = Math.sign(action.to.x - unit.x);
    const dy = Math.sign(action.to.y - unit.y);
    const water = action.path.slice(0, -1).find((p) => isWaterAt(state, p.x, p.y));
    if (water) {
        unit.x = water.x;
        unit.y = water.y;
        effect.pushStatus = 'water-interrupted';
        drownCheck(state, unit, effect);
        return;
    }
    const behind = { x: body.x + dx, y: body.y + dy };
    effect.approachCell = { x: body.x - dx, y: body.y - dy };
    unit.x = effect.approachCell.x;
    unit.y = effect.approachCell.y;
    if (!inside(behind)) {
        effect.pushStatus = 'outside';
        return;
    }
    const blocker = unitAt(state, behind.x, behind.y);
    const wall = isMountainAt(state, behind.x, behind.y);
    if (!blocker && !wall && !corpseAt(state, behind.x, behind.y)) {
        if (isWaterAt(state, behind.x, behind.y)) {
            state.corpses = (state.corpses ?? []).filter((c) => c !== body);
            effect.pushStatus = 'water';
        } else {
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
            rockHit(state, behind, effect);
        }
        effect.victims = removeDead(state, unit);
        effect.pushStatus = wall ? 'collision-mountain' : 'collision';
    } else {
        effect.pushStatus = 'corpse';
    }
}

/** 牵引结算（对齐原型 applyPull） */
function applyPull(state: BattleState, unit: BattleUnit, action: UnitAction, effect: Effect): void {
    const target = unitAt(state, action.to.x, action.to.y) ?? corpseAt(state, action.to.x, action.to.y);
    if (!target) {
        return;
    }
    if (action.type === 'pull-collision') {
        // 贴身强拉例外：目标必为敌活子，双方各 -1 不换位（无需 targetTo，对齐原型）
        hitRecord(effect, unit, 1, 'collision');
        hitRecord(effect, target as BattleUnit, 1, 'collision');
        effect.victims = removeDead(state, unit);
        effect.pushStatus = 'collision';
        return;
    }
    if (!action.targetTo) {
        return;
    }
    if (!unitAt(state, target.x, target.y)) {
        // 尸体：直接位移，入水销毁
        if (isWaterAt(state, action.targetTo.x, action.targetTo.y)) {
            state.corpses = (state.corpses ?? []).filter((c) => c !== target);
            effect.pushStatus = 'water';
        } else {
            target.x = action.targetTo.x;
            target.y = action.targetTo.y;
            effect.pushed = { id: target.id, to: { ...action.targetTo } };
            effect.pushStatus = 'pulled';
        }
        return;
    }
    const live = target as BattleUnit;
    live.x = action.targetTo.x;
    live.y = action.targetTo.y;
    effect.pushed = { id: live.id, to: { ...action.targetTo } };
    effect.pushStatus = 'pulled';
    drownCheck(state, live, effect);
    effect.victims = removeDead(state, unit);
}

/**
 * 单一结算路径（对齐原型 apply）。
 * @param previewMode 预览模式：林闪避只标 conditional 不掷骰
 */
export function applyAction(state: BattleState, action: UnitAction, consumeAction: boolean, previewMode = false): Effect {
    const unit = state.units.find((v) => v.id === action.actorId);
    const effect: Effect = {
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
    } else if (action.type === 'charge') {
        applyCharge(state, unit, action, effect);
    } else if (action.type === 'charge-corpse') {
        applyPushCorpse(state, unit, action, effect);
    } else if (action.type === 'pull' || action.type === 'pull-collision') {
        applyPull(state, unit, action, effect);
    } else {
        // attack / directional：目标收集 → 直伤 → 山 → 死亡处理 → 车占位
        let targets: BattleUnit[] = [];
        let cells: GridPos[] = [];
        if (action.type === 'directional') {
            targets = (action.targets ?? []).map((id) => state.units.find((v) => v.id === id)).filter((v): v is BattleUnit => !!v);
            cells = (action.mountains ?? []).map((p) => ({ ...p }));
        } else if (unit.kind === 'cannon') {
            cells = [{ ...action.to }];
            CONFIG.splash.forEach((d, i) => {
                if (unit.cannonMask & (1 << i)) {
                    const p = { x: action.to.x + d.x, y: action.to.y + d.y };
                    if (inside(p)) {
                        cells.push(p);
                    }
                }
            });
            targets = cells.map((p) => unitAt(state, p.x, p.y)).filter((v): v is BattleUnit => !!v);
        } else {
            cells = [{ ...action.to }];
            const one = unitAt(state, action.to.x, action.to.y);
            if (one) {
                targets = [one];
            }
        }
        const rocks = cells.filter((p) => isMountainAt(state, p.x, p.y));
        targets.sort((a, b) => a.id.localeCompare(b.id));
        targets.forEach((t) => directHit(state, unit, t, effect));
        rocks.forEach((p) => rockHit(state, p, effect));
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
function consumeUnitAction(unit: BattleUnit, action: UnitAction): void {
    if (unit.side !== 'player') {
        return;
    }
    if (unit.kind === 'rook') {
        if (action.type === 'rook-move' || action.type === 'move' || action.type === 'attack') {
            unit.rookMoveAvailable = false;
        } else {
            unit.rookMoveAvailable = false;
            unit.rookChargeAvailable = false;
            unit.ap = 0;
        }
    } else if (unit.kind === 'cannon') {
        if (action.type === 'move') {
            unit.cannonMoveAvailable = false;
        } else {
            unit.cannonMoveAvailable = false;
            unit.cannonAttackAvailable = false;
            unit.ap = 0;
        }
    } else {
        unit.ap = Math.max(0, unit.ap - 1);
    }
    setActed(unit);
}

/** 行动结束判定（对齐原型 setActed） */
function setActed(unit: BattleUnit): void {
    if (unit.kind === 'rook') {
        unit.acted = !unit.rookMoveAvailable && !unit.rookChargeAvailable;
    } else if (unit.kind === 'cannon') {
        unit.acted = !unit.cannonMoveAvailable && !unit.cannonAttackAvailable;
    } else {
        unit.acted = unit.ap <= 0;
    }
}

/**
 * 玩家动作提交（对齐原型 submitAction：额度校验 + 合法性校验 + revision 防过期）。
 * 非法时原样返回 state（effect 为 null）。
 */
export function submitAction(
    state: BattleState,
    action: UnitAction & { revision?: number },
    previewMode = false,
): { state: BattleState; effect: Effect | null; action: UnitAction | null } {
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
        ? directionalAction(state, unit.id, action.direction ?? -1)
        : actionAt(state, unit, action.to, mode);
    if (!legal) {
        return { state, effect: null, action: null };
    }
    const next = deepCopy(state);
    const effect = applyAction(next, legal, true, previewMode);
    next.revision = (state.revision ?? 0) + 1;
    return { state: next, effect, action: legal };
}

/** 坐标提交入口（对齐原型 submit） */
export function submitAt(state: BattleState, unitId: string, to: GridPos, mode?: string): { state: BattleState; effect: Effect | null } {
    const unit = state.units.find((v) => v.id === unitId);
    if (!unit || unit.side !== 'player' || state.turn.phase !== 'player') {
        return { state, effect: null };
    }
    const a = actionAt(state, unit, to, mode);
    return a ? submitAction(state, a) : { state, effect: null };
}

/** 方向提交入口（对齐原型 submitDirection；弓枪远程攻击） */
export function submitDirection(state: BattleState, unitId: string, d: number): { state: BattleState; effect: Effect | null } {
    const a = directionalAction(state, unitId, d);
    return a ? submitAction(state, a) : { state, effect: null };
}

/** 单位回合重置（对齐原型 resetTurn：车炮双额度恢复、兵 ap=1+combo、敌方不动） */
export function resetUnitTurn(unit: BattleUnit): void {
    if (unit.side !== 'player') {
        return;
    }
    if (unit.kind === 'rook') {
        unit.ap = 1;
        unit.apLimit = 1;
        unit.rookMoveAvailable = true;
        unit.rookChargeAvailable = unit.rookRole !== 'base';
    } else if (unit.kind === 'cannon') {
        unit.ap = 1;
        unit.apLimit = 1;
        unit.cannonMoveAvailable = true;
        unit.cannonAttackAvailable = true;
    } else {
        unit.apLimit = isPawnish(unit.kind) ? 1 + unit.combo : 1;
        unit.ap = unit.apLimit;
    }
    unit.acted = false;
}

/** 全员回合重置（我方；敌方无额度概念） */
export function resetAllTurns(state: BattleState): void {
    state.units.forEach(resetUnitTurn);
}

/**
 * 从关卡 JSON 构建战局（P0 版 constructLevel：units 直接给双方全量原始输入，
 * 按 makeUnit 初始化运行时字段；P1 引入队伍/后备后改为只取敌方 + party）。
 * @throws BattleParseError 或 Error（地图校验失败）
 */
export function startBattle(raw: unknown): BattleState {
    const parsed = parseBattleState(raw);
    const rawUnits = (raw as { units: Array<{ id: string; side: string; kind: string; x: number; y: number; rookRole?: string }> }).units;
    const units = rawUnits.map((u) => makeUnitSafe(u.id, u.side as 'player' | 'enemy', u.kind, u.x, u.y, u.rookRole));
    const state: BattleState = {
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
    const errors = validateMap(state.map, state.units);
    if (errors.length) {
        throw new Error(`关卡校验失败：${errors.join('；')}`);
    }
    return state;
}

function makeUnitSafe(id: string, side: 'player' | 'enemy', kind: string, x: number, y: number, rookRole?: string): BattleUnit {
    return makeUnit(id, side, kind as BattleUnit['kind'], x, y, (rookRole as BattleUnit['rookRole']) ?? 'base');
}
