import { _decorator, Component, Sprite, SpriteFrame, error, warn } from 'cc';

const { ccclass, property } = _decorator;

/** 同一棋子类型只警告一次，避免多棋子刷屏 */
const warnedDefIds = new Set<string>();

/** 棋子类型 defId → 贴图 的可序列化映射条目 */
@ccclass('UnitTypeSpriteEntry')
export class UnitTypeSpriteEntry {
    @property
    public defId = '';

    @property({ type: SpriteFrame })
    public spriteFrame: SpriteFrame | null = null;
}

/**
 * v2 棋种 kind → 旧贴图映射条目 id 别名：让既有 defId 贴图配置继续生效（占位策略）。
 * 弓/枪无旧贴图，自动回退第一条映射。
 */
const KIND_DEFID_ALIAS: Record<string, string> = {
    king: 'shuai',
    rook: 'che',
    horse: 'ma',
    cannon: 'pao',
    pawn: 'soldier',
    advisor: 'shi',
    archer: 'soldier',
    spearman: 'soldier',
};

/**
 * 棋子视图：持有 unitId / side（逻辑事实源始终在 GameManager 的 state.units，
 * 本组件不回写状态），按自带映射（棋种 kind → 棋子贴图）设置外观。
 * 位置、缩放与命中几何由 UnitBuilder 按 IsoLayout 设置。
 * 阵营区分（我方/敌方）由 UnitBuilder 在棋子下加带色标记，不在贴图里区分。
 */
@ccclass('Unit')
export class Unit extends Component {
    @property({ type: [UnitTypeSpriteEntry], tooltip: '棋子类型 defId → 贴图映射（在 Unit.prefab 上维护）' })
    public typeSprites: UnitTypeSpriteEntry[] = [];

    /** 关联战局状态里的 unitId（由 UnitBuilder 设置，用于后续交互定位棋子） */
    @property
    public unitId = '';

    /** 归属玩家 id（由 UnitBuilder 设置） */
    @property
    public ownerId = '';

    /**
     * 设置棋子归属与棋种并刷新贴图。
     * 映射中不存在的 kind 先经别名表换算（v2 kind → 旧 defId），仍无则回退第一条映射并警告。
     */
    public setUnit(unitId: string, ownerId: string, kind: string): void {
        this.unitId = unitId;
        this.ownerId = ownerId;

        const sprite = this.getComponent(Sprite);
        if (!sprite) {
            error('[Unit] 棋子节点上缺少 Sprite 组件');
            return;
        }

        const defId = KIND_DEFID_ALIAS[kind] ?? kind;
        const entry = this.typeSprites.find((candidate) => candidate.defId === defId);
        if (entry && entry.spriteFrame) {
            sprite.spriteFrame = entry.spriteFrame;
            return;
        }

        if (!warnedDefIds.has(defId)) {
            warn(`[Unit] 棋子类型 "${defId}"（kind="${kind}"）无贴图，使用第一条映射占位`);
            warnedDefIds.add(defId);
        }
        const fallback = this.typeSprites.find((candidate) => candidate.spriteFrame);
        sprite.spriteFrame = fallback ? fallback.spriteFrame : null;
    }
}
