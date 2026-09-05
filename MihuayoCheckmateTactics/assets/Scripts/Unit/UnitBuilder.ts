import { _decorator, Component, Prefab, error, instantiate } from 'cc';
import { BattleState, gridToIso } from '../Core/BattleState';
import { IsoLayout, TOP_CENTER_Y_PX } from '../Map/IsoLayout';
import { Unit } from './Unit';

const { ccclass, property } = _decorator;

/**
 * 旗子图实测几何（图像像素；y 自图像顶部起算）。
 * 两张旗子均为 256x256 画布，不透明内容 x:[80..167] y:[16..191]（88x176），
 * 旗杆底在 y=191（内容底部）。更换棋子图时 MUST 重新实测并同步此值。
 */
const FLAG_BASE_Y_PX = 191;

/**
 * 按战局状态的 units 生成棋子视图（M0：只摆位置与外观，不含交互）。
 * 位置 = 所属格点 + 旗底对齐修正；缩放与地块同一套（IsoLayout.scale）。
 * 渲染层次：UnitRoot 节点 MUST 排在 MapRoot 之后（树序后渲染，棋子盖在地块上）。
 */
@ccclass('UnitBuilder')
export class UnitBuilder extends Component {
    @property({ type: Prefab, tooltip: '棋子预制体（节点上需挂 Sprite 与 Unit 组件）' })
    public unitPrefab: Prefab | null = null;

    /** 按 GameManager 提供的战局状态与布局生成棋子（解析与几何都不在此重复） */
    public buildUnits(state: BattleState, layout: IsoLayout): void {
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
        const baseOffsetY = (FLAG_BASE_Y_PX - TOP_CENTER_Y_PX) * layout.scale;

        for (const unit of units) {
            const node = instantiate(this.unitPrefab);
            this.node.addChild(node);
            node.name = `unit_${unit.id}_${unit.owner}`;
            const { isoX, isoY } = gridToIso(unit.pos.x, unit.pos.y, layout);
            node.setPosition(isoX, isoY + baseOffsetY, 0);
            node.setScale(layout.scale, layout.scale, 1);
            node.getComponent(Unit)!.setUnit(unit.id, unit.owner);
        }
    }
}
