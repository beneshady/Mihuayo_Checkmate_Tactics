"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCommanderTarget = exports.COMMANDER_BUFF_KINDS = void 0;
exports.chooseCommanderBuff = chooseCommanderBuff;
exports.skillCost = skillCost;
exports.purchaseUpgrade = purchaseUpgrade;
exports.upgradeChoices = upgradeChoices;
exports.skillOfferings = skillOfferings;
exports.rescue = rescue;
const Actions_1 = require("./Actions");
const Rules_1 = require("./Rules");
const Terrain_1 = require("./Terrain");
Object.defineProperty(exports, "isCommanderTarget", { enumerable: true, get: function () { return Terrain_1.isCommanderTarget; } });
const Campaign_1 = require("./Campaign");
const Waves_1 = require("./Waves");
exports.COMMANDER_BUFF_KINDS = ['health', 'move', 'rescue'];
/** 把已选增益施加到单个单位（原地；对齐原型 commanderApply） */
function applyCommanderBuff(buff, unit) {
    if (!(0, Terrain_1.isCommanderTarget)(unit)) {
        return;
    }
    if (buff === 'health' && !unit.commanderHealth) {
        unit.commanderHealth = 1;
        unit.maxHp += 1;
        unit.hp = Math.min(unit.maxHp, unit.hp + 1);
    }
    if (buff === 'move' && (unit.kind === 'rook' || unit.kind === 'cannon' || (0, Actions_1.isPawnish)(unit.kind))) {
        unit.commanderMove = 1;
    }
}
/**
 * 选择帅增益（对齐原型 chooseCommanderBuff，pure）：
 * deploy 阶段自动先确认布阵；commander 阶段才接受三选一；
 * 应用后进 player 交给回合循环（敌方准备由视图驱动）。非法增益或阶段不符返回原引用。
 */
function chooseCommanderBuff(state, buff) {
    if (exports.COMMANDER_BUFF_KINDS.indexOf(buff) < 0) {
        return state;
    }
    let base = state;
    if (base.turn.phase === 'deploy') {
        base = (0, Campaign_1.confirmDeployment)(base);
    }
    if (base.turn.phase !== 'commander') {
        return state;
    }
    const next = (0, Rules_1.deepCopy)(base);
    next.commanderBuff = buff;
    next.units.forEach((u) => applyCommanderBuff(next.commanderBuff, u));
    next.turn.phase = 'player';
    return next;
}
/** 技能价格（对齐原型 purchaseUpgrade：转职/连击/换职 2 SP，其余 1 SP） */
function skillCost(skill) {
    return skill === 'promote-archer'
        || skill === 'promote-spearman'
        || skill === 'combo'
        || skill === 'rook-charge-role'
        || skill === 'rook-pull-role'
        ? 2
        : 1;
}
/** 本技能是否可施加（不含 SP 校验；对齐原型 purchaseUpgrade 各分支的 ok 判定） */
function applySkill(unit, skill, index) {
    switch (skill) {
        case 'fortify':
            unit.maxHp += 1;
            unit.hp += 1;
            unit.fortify += 1;
            return true;
        case 'promote-archer':
            if (unit.kind !== 'pawn') {
                return false;
            }
            unit.kind = 'archer';
            unit.attack = 2;
            return true;
        case 'promote-spearman':
            if (unit.kind !== 'pawn') {
                return false;
            }
            unit.kind = 'spearman';
            unit.maxHp += 1;
            unit.hp += 1;
            return true;
        case 'combo':
            if (!(0, Actions_1.isPawnish)(unit.kind)) {
                return false;
            }
            unit.combo += 1;
            return true;
        case 'direction':
            if ((unit.kind !== 'archer' && unit.kind !== 'spearman')
                || !Number.isInteger(index)
                || index < 0
                || index > 3
                || unit.directionPaid[index] >= 6) {
                return false;
            }
            unit.directionPaid[index] += 1;
            return true;
        case 'rook-charge-role':
            if (unit.kind !== 'rook' || unit.rookRole !== 'base') {
                return false;
            }
            unit.rookRole = 'charge';
            unit.rookChargeAvailable = true;
            return true;
        case 'rook-pull-role':
            if (unit.kind !== 'rook' || unit.rookRole !== 'base') {
                return false;
            }
            unit.rookRole = 'pull';
            unit.rookChargeAvailable = true;
            return true;
        case 'rook-charge':
            if (unit.kind !== 'rook' || unit.rookRole !== 'charge' || unit.rookChargeRange >= 8) {
                return false;
            }
            unit.rookChargeRange += 1;
            return true;
        case 'rook-pull':
            if (unit.kind !== 'rook' || unit.rookRole !== 'pull' || unit.rookPullRange >= 8) {
                return false;
            }
            unit.rookPullRange += 1;
            return true;
        case 'rook-push':
            if (unit.kind !== 'rook' || unit.rookRole !== 'charge' || unit.rookPush) {
                return false;
            }
            unit.rookPush = true;
            return true;
        case 'cannon-splash':
            if (unit.kind !== 'cannon'
                || !Number.isInteger(index)
                || index < 0
                || index > 7
                || (unit.cannonMask & (1 << index)) !== 0) {
                return false;
            }
            unit.cannonMask |= 1 << index;
            return true;
        default:
            return false;
    }
}
/**
 * 购买技能升级（对齐原型 purchaseUpgrade，pure）：player / intermission 阶段可用；
 * 升级不消耗行动。SP 不足或技能/目标不合法返回原 state；成功后扣 SP、revision+1 并回写底册。
 */
function purchaseUpgrade(state, unitId, skill, index) {
    if (state.turn.phase !== 'player' && state.turn.phase !== 'intermission') {
        return state;
    }
    const unit = state.units.find((u) => u.id === unitId && u.side === 'player');
    if (!unit) {
        return state;
    }
    const cost = skillCost(skill);
    if (unit.sp < cost) {
        return state;
    }
    const next = (0, Rules_1.deepCopy)(state);
    const target = next.units.find((u) => u.id === unitId);
    if (!applySkill(target, skill, index)) {
        return state;
    }
    target.sp -= cost;
    next.revision = (state.revision ?? 0) + 1;
    (0, Rules_1.syncParty)(next);
    return next;
}
/**
 * 列出当前所有可选升级（对齐原型 upgradeChoices）：遍历 SP>0 的我方单位，
 * 逐技能尝试 purchaseUpgrade，能产生变化才算可选。用于技能成长面板渲染。
 */
function upgradeChoices(state) {
    const out = [];
    state.units.filter((u) => u.side === 'player' && u.sp > 0).forEach((unit) => {
        const add = (skill, index) => {
            const next = purchaseUpgrade(state, unit.id, skill, index);
            if (next !== state) {
                out.push({ unitId: unit.id, skill, index, state: next });
            }
        };
        add('fortify');
        if ((0, Actions_1.isPawnish)(unit.kind)) {
            add('combo');
        }
        if (unit.kind === 'pawn') {
            add('promote-archer');
            add('promote-spearman');
        }
        if (unit.kind === 'archer' || unit.kind === 'spearman') {
            for (let d = 0; d < 4; d++) {
                add('direction', d);
            }
        }
        if (unit.kind === 'rook') {
            add('rook-charge-role');
            add('rook-pull-role');
            add('rook-charge');
            add('rook-pull');
            add('rook-push');
        }
        if (unit.kind === 'cannon') {
            for (let i = 0; i < 8; i++) {
                add('cannon-splash', i);
            }
        }
    });
    return out;
}
/** 方向与溅射方位的展示名（对齐原型 C.directions / C.splash 的 name） */
const DIRECTION_NAMES = ['前', '右', '后', '左'];
const SPLASH_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/**
 * 列出某我方单位的全部技能项（含禁用项与原因，对齐原型 skillDefs；纯函数只读）。
 * 与 upgradeChoices 的区别：本函数面向面板渲染（列出全部 + maxed 标记），
 * upgradeChoices 面向批量求值（只列当前可买的合法项）。
 */
function skillOfferings(state, unitId) {
    const unit = state.units.find((u) => u.id === unitId && u.side === 'player');
    if (!unit) {
        return [];
    }
    const out = [];
    out.push({ skill: 'fortify', cost: 1, name: '强健', detail: '当前/最大 HP +1', maxed: false });
    if (unit.kind === 'pawn') {
        out.push({ skill: 'promote-archer', cost: 2, name: '转职弓兵', detail: '攻击变 2', maxed: false });
        out.push({ skill: 'promote-spearman', cost: 2, name: '转职枪兵', detail: '当前/最大 HP +1', maxed: false });
    }
    if ((0, Actions_1.isPawnish)(unit.kind)) {
        out.push({ skill: 'combo', cost: 2, name: '连动', detail: '下回合 AP 上限 +1', maxed: false });
    }
    if (unit.kind === 'archer' || unit.kind === 'spearman') {
        for (let d = 0; d < 4; d++) {
            out.push({
                skill: 'direction',
                index: d,
                cost: 1,
                name: `${DIRECTION_NAMES[d]}向 Lv.${2 + unit.directionPaid[d]}/8`,
                detail: '该方向攻击射程 +1',
                maxed: unit.directionPaid[d] >= 6,
            });
        }
    }
    if (unit.kind === 'rook') {
        if (unit.rookRole === 'base') {
            out.push({ skill: 'rook-charge-role', cost: 2, name: '转冲锋车', detail: '解锁冲锋，不能转回', maxed: false });
            out.push({ skill: 'rook-pull-role', cost: 2, name: '转牵引车', detail: '解锁牵引，不能转回', maxed: false });
        }
        if (unit.rookRole === 'charge') {
            out.push({
                skill: 'rook-charge',
                cost: 1,
                name: '冲锋延伸',
                detail: `${unit.rookChargeRange}→${Math.min(8, unit.rookChargeRange + 1)} 格`,
                maxed: unit.rookChargeRange >= 8,
            });
            out.push({ skill: 'rook-push', cost: 1, name: '解锁震退', detail: '命中存活目标后推 1 格', maxed: unit.rookPush });
        }
        if (unit.rookRole === 'pull') {
            out.push({
                skill: 'rook-pull',
                cost: 1,
                name: '牵引延伸',
                detail: `${unit.rookPullRange}→${Math.min(8, unit.rookPullRange + 1)} 格`,
                maxed: unit.rookPullRange >= 8,
            });
        }
    }
    if (unit.kind === 'cannon') {
        for (let i = 0; i < 8; i++) {
            out.push({
                skill: 'cannon-splash',
                index: i,
                cost: 1,
                name: `扩散 ${SPLASH_NAMES[i]}`,
                detail: '固定目标邻格',
                maxed: (unit.cannonMask & (1 << i)) !== 0,
            });
        }
    }
    return out;
}
/**
 * 救援（对齐原型 rescue，pure）：仅 rescue 阶段、每关一次。
 * 救活一名受伤队友（回满血）或从尸体复活（HP 1、原格）；随后进 player 并立即放第二波。
 * 阶段不符 / 已用 / id 无对应目标时返回原 state。
 */
function rescue(state, unitId) {
    if (state.turn.phase !== 'rescue' || state.rescueUsed) {
        return state;
    }
    const next = (0, Rules_1.deepCopy)(state);
    const live = next.units.find((u) => u.id === unitId && (0, Terrain_1.isCommanderTarget)(u));
    const bodyIndex = (next.corpses ?? []).findIndex((c) => c.unit?.id === unitId);
    if (live) {
        live.hp = live.maxHp;
    }
    else if (bodyIndex >= 0) {
        const body = next.corpses[bodyIndex];
        const revived = (0, Rules_1.deepCopy)(body.unit);
        revived.hp = 1;
        revived.x = body.x;
        revived.y = body.y;
        next.units.push(revived);
        next.corpses = next.corpses.filter((c) => c !== body);
    }
    else {
        return state;
    }
    next.rescueUsed = true;
    next.revision = (state.revision ?? 0) + 1;
    next.units.filter((u) => u.side === 'player' && u.id === unitId).forEach((u) => (0, Rules_1.resetUnitTurn)(u));
    next.turn.phase = 'player';
    (0, Waves_1.enterWaveTwo)(next);
    (0, Rules_1.checkTerminal)(next);
    return next;
}
