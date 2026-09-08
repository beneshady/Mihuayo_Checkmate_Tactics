import { _decorator, Color, Component, Graphics, Node } from 'cc';
import { gridToIso } from '../Core/BattleState';
import { ReachableCell } from '../Core/movement';
import { IsoLayout } from './IsoLayout';

const { ccclass, property } = _decorator;

/**
 * 可走格高亮层（哑视图）：按传入的可走格画半透明菱形（M0 占位美术，纯代码生成，无新贴图）。
 * 节点 MUST 放在 MapRoot 之后、UnitRoot 之前（树序渲染：高亮盖住地块、棋子盖住高亮）。
 * 与地图/棋子共用同一份 IsoLayout：菱形中心对齐格点，随地图容器整体平移缩放。
 * 显隐与内容完全由 GameManager 驱动，本组件不持有任何逻辑状态。
 */
@ccclass('MoveHighlighter')
export class MoveHighlighter extends Component {
    @property({ type: Color, tooltip: '可走格填充色（含透明度）' })
    public fillColor: Color = new Color(96, 180, 255, 110);

    @property({ tooltip: '高亮菱形在 Iso X 方向偏移（像素）' })
    public offsetX: number = 0;

    @property({ tooltip: '高亮菱形在 Iso Y 方向偏移（像素）' })
    public offsetY: number = 0;

    /** 显示可走格高亮（重复调用先清空再画） */
    public show(cells: ReachableCell[], layout: IsoLayout): void {
        this.clear();
        for (const cell of cells) {
            const node = new Node(`highlight_${cell.x}_${cell.y}`);
            this.node.addChild(node);
            const { isoX, isoY } = gridToIso(cell.x, cell.y, layout);
            node.setPosition(isoX + this.offsetX, isoY + this.offsetY, 0);

            const g = node.addComponent(Graphics);
            g.fillColor = this.fillColor;
            // 顶面菱形（与地块实测菱形同尺寸）：半宽 halfTileW、半高 halfTileH
            g.moveTo(0, layout.halfTileH);
            g.lineTo(layout.halfTileW, 0);
            g.lineTo(0, -layout.halfTileH);
            g.lineTo(-layout.halfTileW, 0);
            g.close();
            g.fill();
        }
    }

    /** 清空全部高亮（代码生成的节点显式销毁，防止反复显隐积累内存） */
    public clear(): void {
        this.node.destroyAllChildren();
        this.node.removeAllChildren();
    }
}
