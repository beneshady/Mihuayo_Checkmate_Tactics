import { _decorator, RenderData, Sprite, UITransform, UIRenderer } from 'cc';

const { ccclass, property } = _decorator;

/** 与引擎 simple 组装器一致的矩形索引（顶点顺序 lb, rb, lt, rt） */
const QUAD_INDICES = Uint16Array.from([0, 1, 2, 1, 3, 2]);

/**
 * 按节点本地空间把平行四边形顶点写入渲染数据（形状参数见 SideWallSprite）。
 * 顶点顺序 lb, rb, lt, rt（与 QUAD_INDICES、spriteFrame.uv 的 [lb, rb, lt, rt] 约定对应）。
 */
function updateVertexData(sprite: SideWallSprite): void {
    const renderData = sprite.renderData;
    if (!renderData) return;
    const uiTrans = sprite.node.getComponent(UITransform);
    if (!uiTrans) return;

    const hw = uiTrans.width / 2;
    const top = uiTrans.height / 2;
    const rise = sprite.sideTopRise;
    const thick = sprite.sideThickness;
    const drop = sprite.sideTopDrop; // 顶边随水面下沉（水格）：底边保持块体底不变
    const s = sprite.flipX ? -1 : 1; // 左壁整体水平镜像（纹理随之翻转，土层纹理无方向性，视觉等价）

    const dataList = renderData.data;
    dataList[0].x = -hw * s;
    dataList[0].y = top - rise - thick;
    dataList[1].x = hw * s;
    dataList[1].y = top - thick;
    dataList[2].x = -hw * s;
    dataList[2].y = top - rise - drop;
    dataList[3].x = hw * s;
    dataList[3].y = top - drop;
    renderData.vertDirty = true;
}

/** 世界空间顶点写入 VB（与引擎 simple 组装器一致的 worldMatrix + rhw 流程） */
function updateWorldVerts(sprite: SideWallSprite): void {
    const renderData = sprite.renderData;
    if (!renderData) return;
    const vData = renderData.chunk.vb;
    const dataList = renderData.data;
    const node = sprite.node;
    const m = node.worldMatrix;

    const m00 = m.m00; const m01 = m.m01; const m02 = m.m02; const m03 = m.m03;
    const m04 = m.m04; const m05 = m.m05; const m06 = m.m06; const m07 = m.m07;
    const m12 = m.m12; const m13 = m.m13; const m14 = m.m14; const m15 = m.m15;

    const stride = renderData.floatStride;
    let offset = 0;
    const length = dataList.length;
    for (let i = 0; i < length; ++i) {
        const curData = dataList[i];
        const x = curData.x;
        const y = curData.y;
        let rhw = m03 * x + m07 * y + m15;
        rhw = rhw ? 1 / rhw : 1;

        offset = i * stride;
        vData[offset + 0] = (m00 * x + m04 * y + m12) * rhw;
        vData[offset + 1] = (m01 * x + m05 * y + m13) * rhw;
        vData[offset + 2] = (m02 * x + m06 * y + m14) * rhw;
    }
}

/**
 * 平行四边形组装器：把正方形侧面素材的 UV 直接铺到「顶边为 1:2 等距斜边 + 两条竖直边」的四边形上。
 * 顶点 buffer 布局与 Sprite 默认管线一致（stride 9：pos3 + uv2 + color4），
 * 材质、合批、颜色通道全部复用 Sprite 既有机制。
 *
 * 为什么不用节点变换：旋转 + 缩放的组合两轴恒正交，只能产出菱形；
 * 侧面的「斜边 + 竖直边」两轴不正交，必须顶点级实现。
 */
const sideQuadAssembler = {
    createData(comp: UIRenderer): RenderData {
        const renderData = (comp as Sprite).requestRenderData();
        renderData.dataLength = 4;
        renderData.resize(4, 6);
        renderData.chunk.setIndexBuffer(QUAD_INDICES);
        return renderData;
    },

    updateRenderData(comp: UIRenderer): void {
        const sprite = comp as SideWallSprite;
        const frame = sprite.spriteFrame;
        const renderData = sprite.renderData;
        if (!renderData || !frame) return;
        sideQuadAssembler.updateUVs!(comp);
        if (renderData.vertDirty) {
            updateVertexData(sprite);
        }
        renderData.updateRenderData(sprite, frame);
    },

    updateUVs(comp: UIRenderer): void {
        const sprite = comp as SideWallSprite;
        const renderData = sprite.renderData;
        if (!renderData || !sprite.spriteFrame) return;
        const uv = sprite.spriteFrame.uv; // [lb, rb, lt, rt] × (u, v)，兼容图集与动态合批
        const vData = renderData.chunk.vb;
        const stride = renderData.floatStride;
        let uvOffset = 3;
        for (let i = 0; i < 4; ++i) {
            vData[uvOffset] = uv[i * 2];
            vData[uvOffset + 1] = uv[i * 2 + 1];
            uvOffset += stride;
        }
    },

    updateColor(comp: UIRenderer): void {
        const sprite = comp as SideWallSprite;
        const renderData = sprite.renderData;
        if (!renderData) return;
        const vData = renderData.chunk.vb;
        const color = sprite.color;
        let colorOffset = 5;
        for (let i = 0; i < 4; ++i, colorOffset += renderData.floatStride) {
            vData[colorOffset] = color.r / 255;
            vData[colorOffset + 1] = color.g / 255;
            vData[colorOffset + 2] = color.b / 255;
            vData[colorOffset + 3] = color.a / 255;
        }
    },

    fillBuffers(comp: UIRenderer, _renderer: unknown): void {
        const sprite = comp as SideWallSprite;
        const renderData = sprite.renderData;
        if (!renderData) return;
        // 无条件重算世界顶点：下落 tween 改的是节点位置，引擎的 _flagChangedVersion 未在公开声明中
        // 暴露，无法只靠 vertDirty 感知；全图 81 格 × 2 壁 × 4 顶点的矩阵乘代价可忽略。
        updateWorldVerts(sprite);

        const chunk = renderData.chunk;
        const vid = chunk.vertexOffset;
        const meshBuffer = chunk.meshBuffer;
        const ib = meshBuffer.iData;
        let indexOffset = meshBuffer.indexOffset;
        ib[indexOffset++] = vid;
        ib[indexOffset++] = vid + 1;
        ib[indexOffset++] = vid + 2;
        ib[indexOffset++] = vid + 1;
        ib[indexOffset++] = vid + 3;
        ib[indexOffset++] = vid + 2;
        meshBuffer.indexOffset += 6;
    },
};

/**
 * 等距侧壁渲染组件：继承 Sprite 复用其贴图/颜色/合批管线，仅把几何换成运行时计算的平行四边形。
 * 挂在地块（scale(1, 0.5)）子节点下，contentSize = (halfTileW, halfTileH + 厚度)，
 * 节点 y 缩放取 1/0.5 抵消父压缩（由 MapBuilder 统一设置）。
 */
@ccclass('SideWallSprite')
export class SideWallSprite extends Sprite {
    @property({ tooltip: '顶边竖直落差（= halfTileH，等距 1:2 斜边）' })
    public sideTopRise = 100;

    @property({ tooltip: '顶边整体下沉量（世界单位）。水格用：顶边随下沉的水面移动，底边保持块体底，形成「块体内凹的水面」' })
    public sideTopDrop = 0;

    @property({ tooltip: '侧壁厚度（竖直边长，世界单位）' })
    public sideThickness = 80;

    @property({ tooltip: '水平镜像（左壁用）' })
    public flipX = false;

    protected _flushAssembler(): void {
        if (this._assembler !== sideQuadAssembler) {
            this.destroyRenderData();
            this._assembler = sideQuadAssembler;
        }

        if (!this._renderData) {
            const rd = this._assembler!.createData!(this) as RenderData;
            rd.material = this.getRenderMaterial(0);
            this.markForUpdateRenderData();
            if (this.spriteFrame) {
                sideQuadAssembler.updateUVs!(this);
            }
            this._updateColor();
        }
    }
}
