import { _decorator, Component, Sprite, SpriteFrame, error, warn } from 'cc';

const { ccclass, property } = _decorator;

/** 贴图缺失时的兜底地形 id（占位策略，素材齐全后可移除） */
const FALLBACK_TERRAIN_ID = 'plain';

/** 同一地形只警告一次，避免整张地图刷屏 */
const warnedTerrains = new Set<string>();

/** 地形 id → 顶面贴图 的可序列化映射条目 */
@ccclass('TerrainSpriteEntry')
export class TerrainSpriteEntry {
    @property
    public terrainId = '';

    @property({ type: SpriteFrame })
    public spriteFrame: SpriteFrame | null = null;
}

/**
 * 地块视图：持有地形类型，并按自带映射设置顶面贴图。
 * 地块的外观调整（映射表、子节点、动画等）都在 Tile.prefab 上维护；
 * 布局（位置 / 排序 / 缩放）由 MapBuilder 负责，本组件只管自己的表现。
 */
@ccclass('Tile')
export class Tile extends Component {
    @property({ type: [TerrainSpriteEntry], tooltip: '地形 id → 顶面贴图映射（在 Tile.prefab 上维护）' })
    public terrainSprites: TerrainSpriteEntry[] = [];

    /** 当前地形 id，由 MapBuilder 实例化后通过 setTerrain 设置 */
    @property
    public terrainId = '';

    /**
     * 设置地形并刷新顶面贴图。
     * 映射中不存在的地形回退 FALLBACK_TERRAIN_ID 并警告（不中断地图生成）。
     */
    public setTerrain(terrainId: string): void {
        this.terrainId = terrainId;

        const sprite = this.getComponent(Sprite);
        if (!sprite) {
            error('[Tile] 地块节点上缺少 Sprite 组件');
            return;
        }

        const entry = this.terrainSprites.find((candidate) => candidate.terrainId === terrainId);
        if (entry && entry.spriteFrame) {
            sprite.spriteFrame = entry.spriteFrame;
            return;
        }

        if (!warnedTerrains.has(terrainId)) {
            warn(`[Tile] 地形 "${terrainId}" 无贴图，使用 "${FALLBACK_TERRAIN_ID}" 占位`);
            warnedTerrains.add(terrainId);
        }
        const fallback = this.terrainSprites.find((candidate) => candidate.terrainId === FALLBACK_TERRAIN_ID);
        sprite.spriteFrame = fallback ? fallback.spriteFrame : null;
    }
}
