import { BattleMap } from '../Core/BattleState';

/**
 * New Tile tileset 实测几何（2048x2048 画布，图像像素；y 自图像顶部起算）。
 * 顶面菱形外沿约 1945x1388（宽高比约 1.40:1，比旧 256 画布的 1.72:1 更陡）。
 * 四张图共用同一套块体几何：顶顶点 y≈210、左右顶点行≈904（1388 = 2x(904-210)）。
 * forest 顶顶点被树冠遮挡、整体左移约 6px（0.3 世界单位，可忽略），按同一几何处理。
 * 注意：菱形高取大 1% 就会在相邻地块间露出约 2px 的缝，实测值不可随意四舍五入。
 * 更换 tileset 时 MUST 重新实测并同步这三个值。
 */
export const DIAMOND_W_PX = 1945;
export const DIAMOND_H_PX = 1388;
export const TOP_CENTER_Y_PX = 904;

/**
 * 等距布局参数：由顶面菱形半宽与地图尺寸推导。
 * 地图（地块）与棋子 MUST 使用同一份布局，保证棋子落在正确的格点上。
 */
export interface IsoLayout {
    /** 2048 画布贴图 → 世界的缩放 */
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
    const anchorOffsetY = depthCenter * halfTileH - (1024 - TOP_CENTER_Y_PX) * scale;
    return { scale, halfTileW, halfTileH, anchorOffsetY };
}

/**
 * 顶面中心相对地块节点位置（画布中心）的世界偏移（halfTileW=50 时约 6.2）。
 * gridToIso / isoToGrid 这对互逆函数锚在「画布中心空间」（y=1024），
 * 而可见顶面菱形中心在 y=TOP_CENTER_Y_PX——两者差 120px × scale。
 * 棋子底座站位、触摸拾取修正等一切"视觉语义"统一用本函数换算（单一事实源）。
 */
export function topFaceOffsetY(layout: IsoLayout): number {
    return (1024 - TOP_CENTER_Y_PX) * layout.scale;
}
