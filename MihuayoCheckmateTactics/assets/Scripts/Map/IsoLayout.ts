import { BattleMap } from '../Core/BattleState';

/**
 * 等距投影常量（正方形贴图管线）。
 * 顶面贴图是正方形（内容顶到四边），渲染时旋转 45° 并纵向压缩 ISO_SQUASH_K 得到菱形：
 * 菱形宽 = S·√2（S 为正方形边长），菱形高 = 菱形宽 × ISO_SQUASH_K。
 * 拼接由仿射变换构造保证（正方形铺满平面 → 变换后仍无缝），
 * 不再依赖对素材菱形的像素测量（旧 DIAMOND_W_PX / TOP_CENTER_Y_PX 画布偏移机制已废除）。
 * 投影公式本体在 Core/gridToIso，这里只负责几何常量的换算。
 */
export const ISO_SQUASH_K = 0.5; // 经典 2:1 等距：菱形高 = 宽的一半

/**
 * 等距布局参数：由顶面菱形半宽与地图尺寸推导。
 * 地图（地块）与棋子 MUST 使用同一份布局，保证棋子落在正确的格点上。
 */
export interface IsoLayout {
    /** 顶面菱形半宽（世界单位） */
    halfTileW: number;
    /** 顶面菱形半高（世界单位）= halfTileW × ISO_SQUASH_K */
    halfTileH: number;
    /** 深度居中修正（世界单位）：格 (0,0)（地图顶角）在地图中心上方的高度 */
    anchorOffsetY: number;
}

/**
 * 推导等距布局：菱形半高 + 深度居中。
 * 地块节点位置 = 顶面菱形中心（正方形贴图中心旋转后即菱形中心），
 * 因此不存在画布中心与顶面中心的偏移，anchorOffsetY 只做地图深度居中。
 */
export function makeIsoLayout(halfTileW: number, map: BattleMap): IsoLayout {
    const halfTileH = halfTileW * ISO_SQUASH_K;
    const depthCenter = (map.width + map.height - 2) / 2;
    const anchorOffsetY = depthCenter * halfTileH;
    return { halfTileW, halfTileH, anchorOffsetY };
}

/** 正方形顶面贴图的世界边长：旋转 45° 后对角线恰为 2×halfTileW */
export function squareTileSide(halfTileW: number): number {
    return Math.SQRT2 * halfTileW;
}
