import { _decorator, Component, SpriteFrame, warn } from 'cc';

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
 * 地块视图：持有地形类型与地形→贴图映射。
 * 正方形贴图管线中，本节点只做承载与落下动画（纵向压缩在 MapBuilder 设置），
 * 顶面正方形 Sprite（旋转 45° 的 Face 子节点）由 MapBuilder 创建；
 * 本组件提供地形→SpriteFrame 的查找（含兜底），不直接操作渲染组件。
 */
@ccclass('Tile')
export class Tile extends Component {
    @property({ type: [TerrainSpriteEntry], tooltip: '地形 id → 顶面贴图映射（在 Tile.prefab 上维护）' })
    public terrainSprites: TerrainSpriteEntry[] = [];

    /** 当前地形 id，由 MapBuilder 实例化后通过 setTerrain 设置 */
    @property
    public terrainId = '';

    /** 记录地形；贴图由 MapBuilder 通过 getSpriteFrame 取用 */
    public setTerrain(terrainId: string): void {
        this.terrainId = terrainId;
    }

    /**
     * 查询地形贴图。映射中不存在的地形回退 FALLBACK_TERRAIN_ID 并警告（不中断地图生成）。
     */
    public getSpriteFrame(terrainId: string): SpriteFrame | null {
        const entry = this.terrainSprites.find((candidate) => candidate.terrainId === terrainId);
        if (entry && entry.spriteFrame) {
            return entry.spriteFrame;
        }

        if (!warnedTerrains.has(terrainId)) {
            warn(`[Tile] 地形 "${terrainId}" 无贴图，使用 "${FALLBACK_TERRAIN_ID}" 占位`);
            warnedTerrains.add(terrainId);
        }
        const fallback = this.terrainSprites.find((candidate) => candidate.terrainId === FALLBACK_TERRAIN_ID);
        return fallback ? fallback.spriteFrame : null;
    }
}
