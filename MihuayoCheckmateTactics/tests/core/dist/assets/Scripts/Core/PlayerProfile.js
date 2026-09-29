"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newProfile = newProfile;
exports.parsePlayerProfile = parsePlayerProfile;
exports.isLevelUnlocked = isLevelUnlocked;
exports.grantBattleReward = grantBattleReward;
const BattleState_1 = require("./BattleState");
/** 新档 */
function newProfile() {
    return { formatVersion: 1, gold: 0, clearedLevels: [], extra: {} };
}
/**
 * 宽容解析玩家存档（与 assets 配置的"报错拒载"刻意相反，存档能救就救）：
 * - 根不是对象 / formatVersion 未知 → 抛 BattleParseError，由存储层回退新档
 *   （未知更高版本多为"降级打开新档"，拒用防止写坏新格式）
 * - 字段非法 → 逐字段兜底（只丢坏字段，不丢整档）
 */
function parsePlayerProfile(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new BattleState_1.BattleParseError('$', '存档根应为对象（object）');
    }
    const obj = raw;
    if (obj.formatVersion !== 1) {
        throw new BattleState_1.BattleParseError('$.formatVersion', `不支持的存档版本 ${JSON.stringify(obj.formatVersion)}（当前仅支持 1）`);
    }
    const profile = newProfile();
    if (typeof obj.gold === 'number' && Number.isFinite(obj.gold) && obj.gold >= 0) {
        profile.gold = Math.floor(obj.gold);
    }
    else if (obj.gold !== undefined) {
        console.warn('[存档] gold 字段非法，已重置为 0');
    }
    if (Array.isArray(obj.clearedLevels)) {
        profile.clearedLevels = obj.clearedLevels.filter((id) => typeof id === 'string');
    }
    else if (obj.clearedLevels !== undefined) {
        console.warn('[存档] clearedLevels 字段非法，已重置为空');
    }
    if (typeof obj.currentLevelId === 'string' && obj.currentLevelId.length > 0) {
        profile.currentLevelId = obj.currentLevelId;
    }
    if (typeof obj.extra === 'object' && obj.extra !== null && !Array.isArray(obj.extra)) {
        profile.extra = obj.extra;
    }
    return profile;
}
/**
 * 关卡是否已解锁（推导值）：第 1 关恒解锁；第 N 关 ⇔ 第 N−1 关 ∈ clearedLevels。
 * id 不在关卡列表中返回 false；clearedLevels 里的失效 id 自动被忽略（数据可先于配置消失）。
 */
function isLevelUnlocked(profile, levels, id) {
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
 * 战胜结算：发放金币并登记通关（复通同样发奖，暂不防刷——用户决策 2026-02）。
 * 沿用 Rules.ts 风格：先校验、原地修改、返回是否成功。失败（奖励非法）不动档案。
 */
function grantBattleReward(profile, levelId, rewardGold) {
    if (!Number.isFinite(rewardGold) || rewardGold <= 0) {
        return false;
    }
    profile.gold += Math.floor(rewardGold);
    if (profile.clearedLevels.indexOf(levelId) === -1) {
        profile.clearedLevels.push(levelId);
    }
    return true;
}
