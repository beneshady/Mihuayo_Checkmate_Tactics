import { _decorator, Color, Component, Node, Prefab, Sprite, Tween, Vec3, error, instantiate, tween, warn } from 'cc';
import { BattleState, BattleUnit, gridToIso } from '../Core/BattleState';
import { IsoLayout, TOP_CENTER_Y_PX } from '../Map/IsoLayout';
import { Unit } from './Unit';

const { ccclass, property } = _decorator;

/**
 * 旗子图实测几何（图像像素；y 自图像顶部起算）。
 * 两张旗子均为 256x256 画布，不透明内容 x:[80..167] y:[16..191]（88x176），
 * 旗杆底在 y=191（内容底部）。更换棋子图时 MUST 重新实测并同步此值。
 */
const FLAG_BASE_Y_PX = 191;
const FLAG_CONTENT_LEFT_PX = 80;
const FLAG_CONTENT_RIGHT_PX = 167;
const FLAG_CONTENT_TOP_PX = 16;
/** 旗子画布的一半（256x256 画布 → 128），与上述实测值同源 */
const UNIT_CANVAS_HALF_PX = 128;

/** 棋子从格点上方多少世界单位落下（+y 向上，起点高于终点） */
const UNIT_DROP_Y = 140;

/**
 * 按战局状态的 units 生成棋子视图（M0：只摆位置与外观，不含交互）。
 * 位置 = 所属格点 + 旗底对齐修正；缩放与地块同一套（IsoLayout.scale）。
 * 渲染层次：UnitRoot 节点 MUST 排在 MapRoot 之后（树序后渲染，棋子盖在地块上）。
 */
@ccclass('UnitBuilder')
export class UnitBuilder extends Component {
    @property({ type: Prefab, tooltip: '棋子预制体（节点上需挂 Sprite 与 Unit 组件）' })
    public unitPrefab: Prefab | null = null;

    @property({ tooltip: '逐枚落下的间隔（秒）；0 表示所有棋子同时出现' })
    public unitRevealInterval = 0.085;

    @property({ tooltip: '单枚棋子的落下动画时长（秒）' })
    public unitRevealDuration = 0.25;

    @property({ tooltip: '棋子移动动画时长（秒）' })
    public unitMoveDuration = 0.2;

    @property({ tooltip: '受击抖动振幅（世界单位）' })
    public shakeAmplitude = 6;

    /** unitId → 棋子节点注册表（运行期定位视图；重开局时随 buildUnits 重建） */
    private unitNodes = new Map<string, Node>();

    /** 按 unitId 取棋子节点（不存在时返回 undefined） */
    public getUnitNode(unitId: string): Node | undefined {
        return this.unitNodes.get(unitId);
    }

    /** 旗底对齐修正：让旗子内容底落在格点（世界单位） */
    private baseOffsetY(layout: IsoLayout): number {
        return (FLAG_BASE_Y_PX - TOP_CENTER_Y_PX) * layout.scale;
    }

    /**
     * 命中检测：返回被点中的棋子 unitId，未命中返回 undefined。
     * localX/localY 为地图容器本地坐标（调用方先把触点转到本地，缩放/平移不影响结果）。
     * 命中矩形 = 旗子内容矩形（画布像素 × 布局缩放），与视图精确重合；
     * 按 depth（x+y）从深到浅遍历——棋子重叠时前景优先。
     */
    public hitUnitAt(localX: number, localY: number, units: BattleUnit[], layout: IsoLayout): string | undefined {
        const sorted = [...units].sort((a, b) => (b.pos.x + b.pos.y) - (a.pos.x + a.pos.y));
        for (const unit of sorted) {
            const { isoX, isoY } = gridToIso(unit.pos.x, unit.pos.y, layout);
            const nodeY = isoY + this.baseOffsetY(layout);
            const left = isoX + (FLAG_CONTENT_LEFT_PX - UNIT_CANVAS_HALF_PX) * layout.scale;
            const right = isoX + (FLAG_CONTENT_RIGHT_PX - UNIT_CANVAS_HALF_PX) * layout.scale;
            const bottom = nodeY - (FLAG_BASE_Y_PX - UNIT_CANVAS_HALF_PX) * layout.scale; // 旗底 = 格点
            const top = nodeY + (UNIT_CANVAS_HALF_PX - FLAG_CONTENT_TOP_PX) * layout.scale; // 旗顶
            if (localX >= left && localX <= right && localY >= bottom && localY <= top) {
                return unit.id;
            }
        }
        return undefined;
    }

    /**
     * 把棋子视图移动到目标格（逻辑状态已由协调者改好，这里只做表现投影）。
     * 复用落下的 quadOut 节奏；找不到该棋子视图时警告并忽略。
     */
    public moveUnitView(unitId: string, x: number, y: number, layout: IsoLayout): void {
        const node = this.unitNodes.get(unitId);
        if (!node) {
            warn(`[UnitBuilder] 找不到棋子视图：${unitId}，跳过移动表现`);
            return;
        }
        const { isoX, isoY } = gridToIso(x, y, layout);
        const target = new Vec3(isoX, isoY + this.baseOffsetY(layout), 0);
        Tween.stopAllByTarget(node); // 打断进行中的抖动/移动，防 tween 叠加冲突
        tween(node)
            .to(this.unitMoveDuration, { position: target }, { easing: 'quadOut' })
            .start();
    }

    /** 受击抖动：水平 x 方向衰减抖动（先停现有 tween，防与移动动画冲突） */
    public shakeUnitView(unitId: string): void {
        const node = this.unitNodes.get(unitId);
        if (!node) {
            return;
        }
        Tween.stopAllByTarget(node);
        const base = node.position.clone();
        const a = this.shakeAmplitude;
        tween(node)
            .to(0.045, { position: new Vec3(base.x + a, base.y, 0) })
            .to(0.045, { position: new Vec3(base.x - a, base.y, 0) })
            .to(0.04, { position: new Vec3(base.x + a * 0.5, base.y, 0) })
            .to(0.04, { position: new Vec3(base.x - a * 0.25, base.y, 0) })
            .to(0.03, { position: new Vec3(base.x, base.y, 0) })
            .start();
    }

    /** 阵亡销毁：停 tween 并销毁节点（state 移除由规则层完成） */
    public removeUnitView(unitId: string): void {
        const node = this.unitNodes.get(unitId);
        if (!node) {
            return;
        }
        this.unitNodes.delete(unitId);
        Tween.stopAllByTarget(node);
        node.destroy();
    }

    /**
     * 按战局状态生成棋子：逐枚从上方落下（depth 顺序）。
     * 全部落位后调用 onComplete（供后续启用交互等流程）。
     */
    public buildUnits(state: BattleState, layout: IsoLayout, onComplete?: () => void): void {
        if (!this.unitPrefab) {
            error('[UnitBuilder] 未配置 unitPrefab：请把 Prefabs 下的 Unit.prefab 拖到该属性');
            return;
        }
        if (!this.unitPrefab.data.getComponent(Unit)) {
            error('[UnitBuilder] unitPrefab 上缺少 Unit 组件，无法设置棋子归属');
            return;
        }

        // 按 depth（x+y）升序创建：棋子相互重叠时前景后创建、盖在上面
        const units = [...state.units].sort(
            (a, b) => (a.pos.x + a.pos.y) - (b.pos.x + b.pos.y),
        );

        // 旗底对齐：让旗子内容底(y=FLAG_BASE_Y_PX) 落在地块顶面中心(格点)。
        // gridToIso 返回的 isoY 已含地块顶面中心对齐格点的修正；棋子与其同点，
        // 故旗底相对格点再上移 (FLAG_BASE_Y_PX - TOP_CENTER_Y_PX)·scale 即可。
        const offsetY = this.baseOffsetY(layout);

        // 重建注册表：buildUnits 可能在重开局时再次调用
        this.unitNodes.clear();

        let index = 0;
        for (const unit of units) {
            const node = instantiate(this.unitPrefab);
            this.node.addChild(node);
            node.name = `unit_${unit.id}_${unit.owner}`;
            const { isoX, isoY } = gridToIso(unit.pos.x, unit.pos.y, layout);
            const finalY = isoY + offsetY;
            node.getComponent(Unit)!.setUnit(unit.id, unit.owner);
            this.unitNodes.set(unit.id, node);

            // 未轮到不显形：先隐藏（保持全尺寸）；到点时由 scheduleOnce 激活，再从上方落下并淡入。
            node.active = false;
            node.setScale(layout.scale, layout.scale, 1);
            const sprite = node.getComponent(Sprite);
            if (sprite) sprite.color = new Color(255, 255, 255, 0); // 从透明开始，下落时淡入
            const finalPos = new Vec3(isoX, finalY, 0);
            const beginY = finalY + UNIT_DROP_Y;
            this.scheduleOnce(() => {
                node.active = true;
                node.setPosition(isoX, beginY, 0);
                tween(node)
                    .to(this.unitRevealDuration, { position: finalPos }, { easing: 'quadOut' })
                    .start();
                if (sprite) {
                    tween(sprite)
                        .to(this.unitRevealDuration, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }
            }, index * this.unitRevealInterval);

            index++;
        }

        const totalReveal = (units.length - 1) * this.unitRevealInterval + this.unitRevealDuration;
        this.scheduleOnce(() => { onComplete?.(); }, Math.max(totalReveal, 0));
    }
}
