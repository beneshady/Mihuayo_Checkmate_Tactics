/**
 * 等距投影常量（正方形贴图管线）。
 * 顶面贴图是正方形（内容顶到四边），渲染时旋转 45° 并纵向压缩 ISO_SQUASH_K 得到菱形：
 * 菱形宽 = S·√2（S 为正方形边长），菱形高 = 菱形宽 × ISO_SQUASH_K。
 * 拼接由仿射变换构造保证（正方形铺满平面 → 变换后仍无缝），
 * 不再依赖对素材菱形的像素测量（旧 DIAMOND_W_PX / TOP_CENTER_Y_PX 画布偏移机制已废除）。
 * 投影公式本体在 Core/gridToIso，这里只负责几何常量的换算。
 */
import { BattleState, terrainAt } from '../Core/BattleState';

export const ISO_SQUASH_K = 0.5; // 经典 2:1 等距：菱形高 = 宽的一半

/**
 * 等距布局参数：由顶面菱形半宽与地图尺寸推导。
 * 地图（地块）与棋子 MUST 使用同一份布局，保证棋子落在正确的格点上。
 * 地表高度修正（waterDrop）同属布局：地块/棋子/尸体/浮字共用，避免各处魔法数。
 */
export interface IsoLayout {
    /** 顶面菱形半宽（世界单位） */
    halfTileW: number;
    /** 顶面菱形半高（世界单位）= halfTileW × ISO_SQUASH_K */
    halfTileH: number;
    /** 深度居中修正（世界单位）：格 (0,0)（地图顶角）在地图中心上方的高度 */
    anchorOffsetY: number;
    /** 水面相对标准格面的下移量（世界单位，0 = 齐平）；陆地格的侧壁因此露出岸沿 */
    waterDrop: number;
}

/**
 * 推导等距布局：菱形半高 + 深度居中。
 * 地块节点位置 = 顶面菱形中心（正方形贴图中心旋转后即菱形中心），
 * 因此不存在画布中心与顶面中心的偏移，anchorOffsetY 只做地图深度居中。
 * v2：地图尺寸来自 CONFIG（9×9 固定），不再随关卡 JSON 变化。
 */
export function makeIsoLayout(halfTileW: number, width: number, height: number, waterDrop = 0): IsoLayout {
    const halfTileH = halfTileW * ISO_SQUASH_K;
    const depthCenter = (width + height - 2) / 2;
    const anchorOffsetY = depthCenter * halfTileH;
    return { halfTileW, halfTileH, anchorOffsetY, waterDrop };
}

/** 正方形顶面贴图的世界边长：旋转 45° 后对角线恰为 2×halfTileW */
export function squareTileSide(halfTileW: number): number {
    return Math.SQRT2 * halfTileW;
}

/**
 * 地表 y 修正（视图层共用）：(x,y) 为水格时返回 layout.waterDrop，其余 0。
 * 棋子/尸体/浮字摆放与地块下沉 MUST 走同一份修正，保证站在水面上而非悬空。
 */
export function surfaceDropAt(state: BattleState, x: number, y: number, layout: IsoLayout): number {
    if (layout.waterDrop <= 0) {
        return 0;
    }
    return terrainAt(state.map, x, y) === 'water' ? layout.waterDrop : 0;
}
