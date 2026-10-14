import { BattleState, BattleUnit, UnitKind } from './BattleState';
import { isPawnish } from './Actions';
import { checkTerminal, deepCopy, resetUnitTurn, syncParty } from './Rules';
import { isCommanderTarget } from './Terrain';
import { confirmDeployment } from './Campaign';
import { enterWaveTwo } from './Waves';

/**
 * P3 成长与帅增益（对齐原型 rules.js 的 chooseCommanderBuff / commanderApply /
 * purchaseUpgrade / upgradeChoices / rescue；纯 TS，零引擎依赖）。
 *
 * Contract：纯函数——拒绝（阶段/参数/资源不足/目标不合法）时返回原 state 引用，
 * 视图层以 next === state 判定；成功迁移一律 deepCopy + revision+1（rescue/升级）。
 *
 * 与原型的分层差异：demo 的 chooseCommanderBuff 尾部同步调 prepareEnemy（敌方准备），
 * TS 侧该职责由视图回合循环承担（GameManager.enterTurn → startEnemyPrep），
 * Core 只做状态迁移，保证「预览=实际」与动画步进不冲突。
 */

export type CommanderBuffKind = 'health' | 'move' | 'rescue';

export const COMMANDER_BUFF_KINDS: readonly CommanderBuffKind[] = ['health', 'move', 'rescue'];

export { isCommanderTarget }; // 实现下沉在 Terrain（基础层）；此处保持 Growth 的公开面不变

/** 把已选增益施加到单个单位（原地；对齐原型 commanderApply） */
function applyCommanderBuff(buff: CommanderBuffKind, unit: BattleUnit): void {
    if (!isCommanderTarget(unit)) {
        return;
    }
    if (buff === 'health' && !unit.commanderHealth) {
        unit.commanderHealth = 1;
        unit.maxHp += 1;
        unit.hp = Math.min(unit.maxHp, unit.hp + 1);
    }
    if (buff === 'move' && (unit.kind === 'rook' || unit.kind === 'cannon' || isPawnish(unit.kind))) {
        unit.commanderMove = 1;
    }
}

/**
 * 选择帅增益（对齐原型 chooseCommanderBuff，pure）：
 * deploy 阶段自动先确认布阵；commander 阶段才接受三选一；
 * 应用后进 player 交给回合循环（敌方准备由视图驱动）。非法增益或阶段不符返回原引用。
 */
export function chooseCommanderBuff(state: BattleState, buff: string): BattleState {
    if ((COMMANDER_BUFF_KINDS as readonly string[]).indexOf(buff) < 0) {
        return state;
    }
    let base = state;
    if (base.turn.phase === 'deploy') {
        base = confirmDeployment(base);
    }
    if (base.turn.phase !== 'commander') {
        return state;
    }
    const next = deepCopy(base);
    next.commanderBuff = buff as CommanderBuffKind;
    next.units.forEach((u) => applyCommanderBuff(next.commanderBuff!, u));
    next.turn.phase = 'player';
    return next;
}

/** 技能价格（对齐原型 purchaseUpgrade：转职/连击/换职 2 SP，其余 1 SP） */
export function skillCost(skill: string): number {
    return skill === 'promote-archer'
        || skill === 'promote-spearman'
        || skill === 'combo'
        || skill === 'rook-charge-role'
        || skill === 'rook-pull-role'
        ? 2
        : 1;
}

/** 本技能是否可施加（不含 SP 校验；对齐原型 purchaseUpgrade 各分支的 ok 判定） */
function applySkill(unit: BattleUnit, skill: string, index: number | undefined): boolean {
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
            if (!isPawnish(unit.kind)) {
                return false;
            }
            unit.combo += 1;
            return true;
        case 'direction':
            if ((unit.kind !== 'archer' && unit.kind !== 'spearman')
                || !Number.isInteger(index)
                || (index as number) < 0
                || (index as number) > 3
                || unit.directionPaid[index as number] >= 6) {
                return false;
            }
            unit.directionPaid[index as number] += 1;
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
                || (index as number) < 0
                || (index as number) > 7
                || (unit.cannonMask & (1 << (index as number))) !== 0) {
                return false;
            }
            unit.cannonMask |= 1 << (index as number);
            return true;
        default:
            return false;
    }
}

/**
 * 购买技能升级（对齐原型 purchaseUpgrade，pure）：player / intermission 阶段可用；
 * 升级不消耗行动。SP 不足或技能/目标不合法返回原 state；成功后扣 SP、revision+1 并回写底册。
 */
export function purchaseUpgrade(state: BattleState, unitId: string, skill: string, index?: number): BattleState {
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
    const next = deepCopy(state);
    const target = next.units.find((u) => u.id === unitId)!;
    if (!applySkill(target, skill, index)) {
        return state;
    }
    target.sp -= cost;
    next.revision = (state.revision ?? 0) + 1;
    syncParty(next);
    return next;
}

/** 一条可选升级（视图消费：按钮文案 + 执行入口） */
export interface UpgradeChoice {
    unitId: string;
    skill: string;
    index?: number;
    state: BattleState;
}

/**
 * 列出当前所有可选升级（对齐原型 upgradeChoices）：遍历 SP>0 的我方单位，
 * 逐技能尝试 purchaseUpgrade，能产生变化才算可选。用于技能成长面板渲染。
 */
export function upgradeChoices(state: BattleState): UpgradeChoice[] {
    const out: UpgradeChoice[] = [];
    state.units.filter((u) => u.side === 'player' && u.sp > 0).forEach((unit) => {
        const add = (skill: string, index?: number): void => {
            const next = purchaseUpgrade(state, unit.id, skill, index);
            if (next !== state) {
                out.push({ unitId: unit.id, skill, index, state: next });
            }
        };
        add('fortify');
        if (isPawnish(unit.kind)) {
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

/** 技能面板选项（对齐原型 skillDefs：文案 + 价格 + 已达上限标记；视图只渲染） */
export interface SkillOffering {
    skill: string;
    index?: number;
    cost: number;
    name: string;
    detail: string;
    /** 已达上限 / 已解锁（按钮禁用原因） */
    maxed: boolean;
}

/** 方向与溅射方位的展示名（对齐原型 C.directions / C.splash 的 name） */
const DIRECTION_NAMES = ['前', '右', '后', '左'];
const SPLASH_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * 列出某我方单位的全部技能项（含禁用项与原因，对齐原型 skillDefs；纯函数只读）。
 * 与 upgradeChoices 的区别：本函数面向面板渲染（列出全部 + maxed 标记），
 * upgradeChoices 面向批量求值（只列当前可买的合法项）。
 */
export function skillOfferings(state: BattleState, unitId: string): SkillOffering[] {
    const unit = state.units.find((u) => u.id === unitId && u.side === 'player');
    if (!unit) {
        return [];
    }
    const out: SkillOffering[] = [];
    out.push({ skill: 'fortify', cost: 1, name: '强健', detail: '当前/最大 HP +1', maxed: false });
    if (unit.kind === 'pawn') {
        out.push({ skill: 'promote-archer', cost: 2, name: '转职弓兵', detail: '攻击变 2', maxed: false });
        out.push({ skill: 'promote-spearman', cost: 2, name: '转职枪兵', detail: '当前/最大 HP +1', maxed: false });
    }
    if (isPawnish(unit.kind)) {
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
export function rescue(state: BattleState, unitId: string): BattleState {
    if (state.turn.phase !== 'rescue' || state.rescueUsed) {
        return state;
    }
    const next = deepCopy(state);
    const live = next.units.find((u) => u.id === unitId && isCommanderTarget(u));
    const bodyIndex = (next.corpses ?? []).findIndex((c) => c.unit?.id === unitId);
    if (live) {
        live.hp = live.maxHp;
    } else if (bodyIndex >= 0) {
        const body = next.corpses![bodyIndex];
        const revived: BattleUnit = deepCopy(body.unit!);
        revived.hp = 1;
        revived.x = body.x;
        revived.y = body.y;
        next.units.push(revived);
        next.corpses = next.corpses!.filter((c) => c !== body);
    } else {
        return state;
    }
    next.rescueUsed = true;
    next.revision = (state.revision ?? 0) + 1;
    next.units.filter((u) => u.side === 'player' && u.id === unitId).forEach((u) => resetUnitTurn(u));
    next.turn.phase = 'player';
    enterWaveTwo(next);
    checkTerminal(next);
    return next;
}
