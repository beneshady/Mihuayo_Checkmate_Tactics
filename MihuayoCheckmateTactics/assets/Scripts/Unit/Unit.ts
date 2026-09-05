import { _decorator, Component, Sprite, SpriteFrame, error, warn } from 'cc';

const { ccclass, property } = _decorator;

/** 同一归属只警告一次，避免多棋子刷屏 */
const warnedOwners = new Set<string>();

/** 归属玩家 id → 旗子贴图 的可序列化映射条目 */
@ccclass('UnitSpriteEntry')
export class UnitSpriteEntry {
    @property
    public ownerId = '';

    @property({ type: SpriteFrame })
    public spriteFrame: SpriteFrame | null = null;
}

/**
 * 棋子视图：持有 unitId / owner（逻辑事实源始终在 GameManager 的 state.units，
 * 本组件不回写状态），按自带映射（owner → 旗子贴图）设置外观。
 * 位置与缩放由 UnitBuilder 按 IsoLayout 设置。
 */
@ccclass('Unit')
export class Unit extends Component {
    @property({ type: [UnitSpriteEntry], tooltip: '归属玩家 id → 旗子贴图映射（在 Unit.prefab 上维护）' })
    public ownerSprites: UnitSpriteEntry[] = [];

    /** 关联战局状态里的 unitId（由 UnitBuilder 设置，用于后续交互定位棋子） */
    @property
    public unitId = '';

    /** 归属玩家 id（由 UnitBuilder 设置） */
    @property
    public ownerId = '';

    /**
     * 设置棋子归属并刷新旗子贴图。
     * 映射中不存在的归属回退第一条映射并警告（保持棋子可见，M0 占位策略）。
     */
    public setUnit(unitId: string, ownerId: string): void {
        this.unitId = unitId;
        this.ownerId = ownerId;

        const sprite = this.getComponent(Sprite);
        if (!sprite) {
            error('[Unit] 棋子节点上缺少 Sprite 组件');
            return;
        }

        const entry = this.ownerSprites.find((candidate) => candidate.ownerId === ownerId);
        if (entry && entry.spriteFrame) {
            sprite.spriteFrame = entry.spriteFrame;
            return;
        }

        if (!warnedOwners.has(ownerId)) {
            warn(`[Unit] 归属 "${ownerId}" 无旗子贴图，使用第一条映射占位`);
            warnedOwners.add(ownerId);
        }
        const fallback = this.ownerSprites.find((candidate) => candidate.spriteFrame);
        sprite.spriteFrame = fallback ? fallback.spriteFrame : null;
    }
}
