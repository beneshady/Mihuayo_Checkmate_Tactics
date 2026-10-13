import { BattleParseError, BattleUnit } from './BattleState';
import { LevelEntry } from './LevelConfig';

/**
 * 玩家进度存档（纯 TS，零引擎依赖）。
 * 持久化由 Shell 层（UI/ProfileStore）负责（cc.sys.localStorage），本文件只管结构与纯函数。
 * 设计要点（docs/design/main-menu-plan.md §6）：
 * - 配置表回答"世界有什么"，存档回答"玩家到哪了"，二者只通过关卡 id 关联
 * - 解锁是推导值（第 N 关 ⇔ 第 N−1 关已通关），不在存档落盘，杜绝两处状态不一致
 * - P1 升 formatVersion 2：+ 队伍底册（party/activeIds/bench，跨会话延续战役队伍）；
 *   v1 档自动迁移（队伍视为未开战役，进战斗时按模板重建）
 */

/** 玩家进度存档（formatVersion 2） */
export interface PlayerProfile {
    formatVersion: 2;
    /** 金币余额（单货币；战斗内结算经 finishVictory 入 state.gold，胜利时回写） */
    gold: number;
    /** 已通关的关卡 id（去重；解锁推导依据） */
    clearedLevels: string[];
    /** 最近进入的关卡 id（战斗启动参数兼"接着打"；缺省回落第 1 关） */
    currentLevelId?: string;
    /** 队伍底册（全员最新成长快照；P1，空=尚未开战役） */
    party?: BattleUnit[];
    /** 上阵成员 id（P1） */
    activeIds?: string[];
    /** 后备成员 id（P1） */
    bench?: string[];
    /** 透传保留：将来未知字段不丢 */
    extra?: Record<string, unknown>;
}

/** 新档 */
export function newProfile(): PlayerProfile {
    return { formatVersion: 2, gold: 0, clearedLevels: [], extra: {} };
}

/**
 * 宽容解析玩家存档（与 assets 配置的"报错拒载"刻意相反，存档能救就救）：
 * - 根不是对象 / formatVersion 未知 → 抛 BattleParseError，由存储层回退新档
 *   （未知更高版本多为"降级打开新档"，拒用防止写坏新格式）
 * - 字段非法 → 逐字段兜底（只丢坏字段，不丢整档）
 */
export function parsePlayerProfile(raw: unknown): PlayerProfile {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new BattleParseError('$', '存档根应为对象（object）');
    }
    const obj = raw as Record<string, unknown>;
    if (obj.formatVersion !== 1 && obj.formatVersion !== 2) {
        throw new BattleParseError(
            '$.formatVersion',
            `不支持的存档版本 ${JSON.stringify(obj.formatVersion)}（当前支持 1/2）`,
        );
    }
    const profile = newProfile();
    if (typeof obj.gold === 'number' && Number.isFinite(obj.gold) && obj.gold >= 0) {
        profile.gold = Math.floor(obj.gold);
    } else if (obj.gold !== undefined) {
        console.warn('[存档] gold 字段非法，已重置为 0');
    }
    if (Array.isArray(obj.clearedLevels)) {
        profile.clearedLevels = obj.clearedLevels.filter((id): id is string => typeof id === 'string');
    } else if (obj.clearedLevels !== undefined) {
        console.warn('[存档] clearedLevels 字段非法，已重置为空');
    }
    if (typeof obj.currentLevelId === 'string' && obj.currentLevelId.length > 0) {
        profile.currentLevelId = obj.currentLevelId;
    }
    // 队伍底册：宽容解析（数组即收；坏项由 constructLevel 防御性校验兜底）
    if (Array.isArray(obj.party)) {
        profile.party = obj.party.filter((u): u is BattleUnit => typeof u === 'object' && u !== null && typeof (u as BattleUnit).id === 'string');
    }
    if (Array.isArray(obj.activeIds)) {
        profile.activeIds = obj.activeIds.filter((id): id is string => typeof id === 'string');
    }
    if (Array.isArray(obj.bench)) {
        profile.bench = obj.bench.filter((id): id is string => typeof id === 'string');
    }
    if (typeof obj.extra === 'object' && obj.extra !== null && !Array.isArray(obj.extra)) {
        profile.extra = obj.extra as Record<string, unknown>;
    }
    return profile;
}

/**
 * 关卡是否已解锁（推导值）：第 1 关恒解锁；第 N 关 ⇔ 第 N−1 关 ∈ clearedLevels。
 * id 不在关卡列表中返回 false；clearedLevels 里的失效 id 自动被忽略（数据可先于配置消失）。
 */
export function isLevelUnlocked(profile: PlayerProfile, levels: LevelEntry[], id: string): boolean {
    const index = levels.findIndex((entry) => entry.id === id);
    if (index < 0) {
        return false;
    }
    if (index === 0) {
        return true;
    }
    return profile.clearedLevels.indexOf(levels[index - 1].id) !== -1;
}

/**
 * 战胜结算：登记通关并发放金币（复通同样发奖，暂不防刷——用户决策 2026-02）。
 * 沿用 Rules.ts 风格：先校验、原地修改、返回是否成功。失败（奖励非法）不动档案。
 * P1 修订：奖励金额改由战斗结算增量提供（killValues 汇总），0 视为合法（仍登记通关，
 * 只是没钱可发）；负数仍视为非法拒绝。
 */
export function grantBattleReward(profile: PlayerProfile, levelId: string, rewardGold: number): boolean {
    if (!Number.isFinite(rewardGold) || rewardGold < 0) {
        return false;
    }
    if (rewardGold > 0) {
        profile.gold += Math.floor(rewardGold);
    }
    if (profile.clearedLevels.indexOf(levelId) === -1) {
        profile.clearedLevels.push(levelId);
    }
    return true;
}
