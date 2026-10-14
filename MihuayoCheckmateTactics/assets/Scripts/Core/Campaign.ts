import { BattleState, BattleUnit, GridPos, TerrainType, UnitKind, validateMap } from './BattleState';
import { CONFIG, inPalace, inside } from './Config';
import { makeUnit } from './UnitDefs';
import { isMountainAt, isOccupied, isWaterAt, samePos } from './Terrain';
import { deepCopy, resetUnitTurn } from './Rules';

/**
 * 战役框架与经济（P1，对齐原型 rules.js 的 constructLevel / confirmDeployment /
 * playerTemplate / defaultPosition；纯 TS，零引擎依赖）。
 *
 * 职责：
 * - 队伍底册（party/activeIds/bench）跨关延续：战斗内成长经 Rules.syncParty 回写 party；
 * - constructLevel：由上一关战局 + 关卡 JSON 构造下一关战局（phase 直进 deploy，双快照）；
 * - confirmDeployment：布阵确认（P1 由视图自动调用默认布阵，交互布阵归 P2）；
 * - 存档序列化：金币/队伍/职业/SP/后备 + 线性解锁进度（持久化由视图层执行）。
 */

/** 出战底册（对齐原型 playerTemplate：P0 初始五人组） */
export function playerTemplate(): BattleUnit[] {
    return [
        makeUnit('rook', 'player', 'rook', 0, 0),
        makeUnit('starting-cannon', 'player', 'cannon', 1, 2),
        makeUnit('starting-pawn', 'player', 'pawn', 1, 3),
        makeUnit('starting-archer', 'player', 'archer', 4, 3),
        makeUnit('starting-spearman', 'player', 'spearman', 7, 3),
    ];
}

/** 已知成员的默认落位（对齐原型 defaultPosition）；未知成员按 index 轮转备用位 */
const KNOWN_SLOTS: Record<string, GridPos> = {
    rook: { x: 0, y: 0 },
    'starting-cannon': { x: 1, y: 2 },
    'starting-pawn': { x: 1, y: 3 },
    'starting-archer': { x: 4, y: 3 },
    'starting-spearman': { x: 7, y: 3 },
};

const FALLBACK_SLOTS: GridPos[] = [
    { x: 2, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 2 }, { x: 8, y: 2 },
    { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 1, y: 1 }, { x: 7, y: 1 },
];

export function defaultPosition(id: string, index: number): GridPos {
    const known = KNOWN_SLOTS[id];
    return { ...(known ?? FALLBACK_SLOTS[index % FALLBACK_SLOTS.length]) };
}

/** constructLevel 的关卡来源（v2 关卡 JSON 的相关子集） */
export interface LevelSource {
    map: { name?: string; tiles: Record<string, string> };
    units: Array<{ id: string; side: string; kind: string; x: number; y: number; rookRole?: string }>;
}

export interface ConstructOptions {
    /** true = 从上一关战局推进到下一关（level+1、activeIds 继承）；false = 新开战役 */
    next?: boolean;
    /** 存档续打时显式指定关卡序号（优先于 next 推导） */
    levelNo?: number;
}

/**
 * 构造一关战局（对齐原型 constructLevel）：
 * - 敌人按关卡 JSON 顺序重编号 w1-0..n（关卡内 id 不参与结算语义）；
 * - party 成员重置进战斗：清主帅 buff 修正（commanderHealth/Move，P3）、满血、重置回合额度；
 * - 默认落位非法（士出宫/占用/水）时从我方半场逐行找合法空格；
 * - phase 直进 deploy；entrySnapshot / levelSnapshot 双快照。
 */
export function constructLevel(source: BattleState | null, level: LevelSource, options?: ConstructOptions): BattleState {
    const next = options?.next ?? false;
    const levelNo = options?.levelNo ?? (next ? (source?.level ?? 1) + 1 : 1);
    const party: BattleUnit[] = deepCopy(source?.party?.length ? source.party : playerTemplate());
    // 跨关重置：清主帅 buff 修正、满血（对齐原型 party.forEach）
    party.forEach((u) => {
        u.maxHp -= u.commanderHealth || 0;
        u.commanderHealth = 0;
        u.commanderMove = 0;
        u.hp = u.maxHp;
    });
    const activeIds: string[] = next ? deepCopy(source?.activeIds ?? party.map((u) => u.id)) : party.map((u) => u.id);
    const bench: string[] = deepCopy(source?.bench ?? []);

    const tiles: Record<string, TerrainType> = { ...level.map.tiles } as Record<string, TerrainType>;
    const units: BattleUnit[] = [makeUnit('king', 'player', 'king', 4, 0)];
    level.units
        .filter((u) => u.side === 'enemy')
        .forEach((u, i) => {
            const enemy = makeUnit(`w1-${i}`, 'enemy', u.kind as UnitKind, u.x, u.y);
            if (u.rookRole) {
                enemy.rookRole = u.rookRole as BattleUnit['rookRole'];
            }
            units.push(enemy);
        });

    activeIds.forEach((id, index) => {
        const base = party.find((u) => u.id === id);
        if (!base) {
            return;
        }
        const u = deepCopy(base);
        let p = defaultPosition(id, index);
        const illegal = (q: GridPos): boolean =>
            (u.kind === 'advisor' && !inPalace('player', q)) || isOccupied({ map: { tiles }, units } as BattleState, q.x, q.y)
            || isWaterAt({ map: { tiles }, units } as BattleState, q.x, q.y);
        if (illegal(p)) {
            scan: for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 9; x++) {
                    const q = { x, y };
                    if (!illegal(q)) {
                        p = q;
                        break scan;
                    }
                }
            }
        }
        u.x = p.x;
        u.y = p.y;
        u.hp = u.maxHp;
        u.side = 'player';
        resetUnitTurn(u);
        units.push(u);
    });

    const ordered = units.filter((u) => u.side === 'player').concat(units.filter((u) => u.side === 'enemy'));
    const state: BattleState = {
        formatVersion: 2,
        meta: { kind: 'battleInit', battleId: `level-${String(levelNo).padStart(2, '0')}` },
        map: { name: level.map.name, tiles },
        units: ordered,
        turn: { round: 1, phase: 'deploy' },
        intents: [],
        corpses: [],
        pendingSpawns: [],
        rng: source?.rng ?? 305419896,
        revision: 0,
        gold: source?.gold ?? 0,
        kills: 0,
        highestLevel: 1,
        killLedger: {},
        killValues: {},
        level: levelNo,
        party,
        activeIds,
        bench,
        settled: false,
        result: null,
    };
    const errors = validateMap(state.map, state.units);
    if (errors.length) {
        throw new Error(`关卡校验失败：${errors.join('；')}`);
    }
    state.entrySnapshot = deepCopy(state);
    state.levelSnapshot = deepCopy(state);
    return state;
}

/**
 * 布阵确认（对齐原型 confirmDeployment）：
 * 我方全员必须界内、不在山/水、y<4（我方半场）、帅在出生位、士在宫内、无重叠；
 * 通过后 phase 进 commander（P3 帅增益三选一阶段）并重设双快照。不合法时原样返回。
 */
export function confirmDeployment(state: BattleState): BattleState {
    if (state.turn.phase !== 'deploy') {
        return state;
    }
    const bad = state.units.some((u) => {
        if (u.side !== 'player') {
            return false;
        }
        return !inside(u)
            || isMountainAt(state, u.x, u.y)
            || isWaterAt(state, u.x, u.y)
            || u.y >= CONFIG.river
            || (u.kind === 'king' && !samePos(u, CONFIG.spawns.king))
            || (u.kind === 'advisor' && !inPalace(u.side, u))
            || state.units.some((v) => v.id !== u.id && samePos(u, v));
    });
    if (bad) {
        return state;
    }
    const next = deepCopy(state);
    next.turn.phase = 'commander';
    next.entrySnapshot = deepCopy(next);
    next.levelSnapshot = deepCopy(next);
    return next;
}

/** 存档结构（视图层负责持久化，如 sys.localStorage；Core 不触平台 API） */
export interface CampaignSave {
    version: 1;
    /** 已解锁到的关卡（线性解锁：1 起，过关 +1） */
    unlockedLevel: number;
    /** 存档时的关卡进度 */
    level: number;
    gold: number;
    party: BattleUnit[];
    activeIds: string[];
    bench: string[];
}

export function serializeCampaign(state: BattleState, unlockedLevel: number): CampaignSave {
    return {
        version: 1,
        unlockedLevel,
        level: state.level ?? 1,
        gold: state.gold ?? 0,
        party: deepCopy(state.party ?? []),
        activeIds: [...(state.activeIds ?? [])],
        bench: [...(state.bench ?? [])],
    };
}

/** 由存档还原战役源（金币/队伍/进度），供「继续战役」走 constructLevel 续打 */
export function campaignSourceFrom(save: CampaignSave): BattleState {
    return {
        formatVersion: 2,
        meta: { kind: 'battleSave', battleId: 'campaign-save' },
        map: { tiles: {} },
        units: [],
        turn: { round: 1, phase: 'intermission' },
        result: null,
        gold: save.gold,
        level: save.level,
        party: deepCopy(save.party),
        activeIds: [...save.activeIds],
        bench: [...save.bench],
        rng: 305419896,
    } as BattleState;
}

// ---------- P2 关间商店与布阵（对齐原型 buy / setActiveRoster / deploy） ----------

/** 商店在售棋种与价格（对齐原型 buy：兵 3、其余 5；只卖基础版） */
export const SHOP_KINDS = ['pawn', 'rook', 'horse', 'cannon'] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export function shopPrice(kind: ShopKind): number {
    // 价格单一事实源在 CONFIG.price（UnitDefs.KIND_DEFS 同源引用）；对齐原型 buy：兵 3、其余 5
    return CONFIG.price[kind];
}

function partyUnitOf(state: BattleState, id: string): BattleUnit | undefined {
    return (state.party ?? []).find((u) => u.id === id);
}

/**
 * 购买新兵（对齐原型 buy，pure）：仅 intermission 阶段；金币不足返回原 state。
 * 新成员 id = recruit-{kind}-{serial}（serial 从 0 找第一个未被 party 占用的号）；
 * 上阵非帅成员 <8 → 自动入 activeIds，否则入 bench。不获本关收益、保留成长（底册天然如此）。
 */
export function buyRecruit(state: BattleState, kind: string): BattleState {
    if (state.turn.phase !== 'intermission' || (SHOP_KINDS as readonly string[]).indexOf(kind) < 0) {
        return state;
    }
    const price = shopPrice(kind as ShopKind);
    if ((state.gold ?? 0) < price) {
        return state;
    }
    const next = deepCopy(state);
    let serial = 0;
    let id: string;
    do {
        id = `recruit-${kind}-${serial++}`;
    } while (next.party!.some((u) => u.id === id));
    const recruit = makeUnit(id, 'player', kind as UnitKind, 0, 0);
    next.party!.push(recruit);
    if (next.activeIds!.filter((activeId) => partyUnitOf(next, activeId)?.kind !== 'advisor').length < 8) {
        next.activeIds!.push(id);
    } else {
        next.bench!.push(id);
    }
    next.gold = (next.gold ?? 0) - price;
    return next;
}

/**
 * 调整上阵名单（对齐原型 setActiveRoster，pure）：仅 intermission 阶段；
 * 未知 id / 重复 id / 过滤 advisor 后 >8 任一违反则返回原 state。
 * bench = party 全员 − activeIds。
 */
export function setActiveRoster(state: BattleState, ids: string[]): BattleState {
    if (state.turn.phase !== 'intermission' || !Array.isArray(ids)) {
        return state;
    }
    const known = ids.filter((id) => {
        const u = partyUnitOf(state, id);
        return !!u && u.kind !== 'advisor';
    });
    if (known.length > 8 || new Set(ids).size !== ids.length || ids.some((id) => !partyUnitOf(state, id))) {
        return state;
    }
    const next = deepCopy(state);
    next.activeIds = ids.slice();
    next.bench = next.party!.map((u) => u.id).filter((id) => ids.indexOf(id) < 0);
    return next;
}

/**
 * 布阵落位（对齐原型 deploy，pure）：仅 deploy 阶段；目标须界内、我方半场（y ≤ river-1）、
 * 非占用、非水；帅为固定位不可移，士须落在宫内。山格不在此校验（对齐原型）——
 * confirmDeployment 会整体把关，落错可再移走。
 */
export function deployUnit(state: BattleState, unitId: string, to: GridPos): BattleState {
    if (state.turn.phase !== 'deploy' || !inside(to) || to.y > CONFIG.river - 1
        || isOccupied(state, to.x, to.y) || isWaterAt(state, to.x, to.y)) {
        return state;
    }
    const unit = state.units.find((v) => v.id === unitId && v.side === 'player' && v.kind !== 'king');
    if (!unit || (unit.kind === 'advisor' && !inPalace(unit.side, to))) {
        return state;
    }
    const next = deepCopy(state);
    const moved = next.units.find((v) => v.id === unitId)!;
    moved.x = to.x;
    moved.y = to.y;
    return next;
}
