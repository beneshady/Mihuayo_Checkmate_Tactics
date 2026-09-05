import { BattleMap } from '../Core/BattleState';

/**
 * plain.png 实测几何（图像像素；y 自图像顶部起算）。
 * 顶面菱形外沿约 248x144（绿色区域 240x136 + 黑描边），宽高比约 1.72:1（非标准 2:1）。
 * 更换 tileset 时 MUST 重新实测并同步这三个值。
 */
export const DIAMOND_W_PX = 248;
export const DIAMOND_H_PX = 144;
export const TOP_CENTER_Y_PX = 76;

/**
 * 等距布局参数：由顶面菱形半宽与地图尺寸推导。
 * 地图（地块）与棋子 MUST 使用同一份布局，保证棋子落在正确的格点上。
 */
export interface IsoLayout {
    /** 256 画布贴图 → 世界的缩放 */
    scale: number;
    /** 顶面菱形半宽（世界单位） */
    halfTileW: number;
    /** 顶面菱形半高（世界单位） */
    halfTileH: number;
    /** 纵向修正（世界单位），传入 Core/gridToIso 使用；已含地图深度居中 */
    anchorOffsetY: number;
}

/**
 * 推导等距布局：缩放 + 菱形半高 + 纵向修正（顶面中心对齐格点 + 地图深度居中）。
 * 投影公式本身在 Core/gridToIso，这里只负责几何常量的换算。
 */
export function makeIsoLayout(halfTileW: number, map: BattleMap): IsoLayout {
    const scale = (2 * halfTileW) / DIAMOND_W_PX;
    const halfTileH = halfTileW * (DIAMOND_H_PX / DIAMOND_W_PX);
    const depthCenter = (map.width + map.height - 2) / 2;
    const anchorOffsetY = depthCenter * halfTileH - (128 - TOP_CENTER_Y_PX) * scale;
    return { scale, halfTileW, halfTileH, anchorOffsetY };
}
