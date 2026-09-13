import { sys } from 'cc';
import { newProfile, parsePlayerProfile, PlayerProfile } from '../Core/PlayerProfile';

/**
 * 玩家存档的持久化薄封装（Shell 层）。
 * cc.sys.localStorage 在微信小游戏上自动映射平台存储，Web 预览映射浏览器 localStorage——
 * 不直接依赖微信 API（护栏：Game Logic MUST NOT 依赖平台 API）。
 * 保存时机只有两个：选关进战斗时（写 currentLevelId）、战斗结算时（发奖励/记通关）。
 */

/** 存档槽位 key（单玩家单档；多存档槽明确不做） */
const STORAGE_KEY = 'playerProfile';

/** 读档：无档 / 坏档兜底为新档（宽容解析规则见 Core/PlayerProfile.ts） */
export function loadProfile(): PlayerProfile {
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return newProfile();
    }
    try {
        return parsePlayerProfile(JSON.parse(raw));
    } catch (err) {
        console.warn(`[存档] 读档失败，回退新档 —— ${(err as Error).message}`);
        return newProfile();
    }
}

/** 写档（整档覆盖写） */
export function saveProfile(profile: PlayerProfile): void {
    sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** 调试用清档：验证新档流程（暂无 UI 入口，Preview 控制台手动调用） */
export function clearProfile(): void {
    sys.localStorage.removeItem(STORAGE_KEY);
}
