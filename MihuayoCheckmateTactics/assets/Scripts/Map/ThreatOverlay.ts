import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
import { gridToIso, GridPos } from '../Core/BattleState';
import { IsoLayout } from './IsoLayout';

const { ccclass, property } = _decorator;

/**
 * 威胁标记（哑结构）：GameManager 组装（意图 + 预测结果 → 展示格），
 * 本组件只画不判。命中格 = 意图落点（受害者格），路径 = 结算效果路径。
 */
export interface ThreatMark {
    actorId: string;
    order: number;
    status: 'success' | 'miss' | 'standby' | 'invalid' | 'removed';
    /** 攻击者当前格（standby 画这里；success 画路径起点） */
    fromPos: GridPos | null;
    /** 威胁落点（受害者格；success/miss 画这里） */
    toPos: GridPos | null;
    /** 路径格（突出模式画整条） */
    path: GridPos[];
}

/**
 * 敌方威胁覆盖层（哑视图，US-006 §3）：按意图预测结果画整格威胁与行动顺序号。
 * 节点 MUST 放在 MapRoot 之后、UnitRoot 之前（树序渲染：威胁盖地块、棋子盖威胁、
 * 我方红/灰攻击高亮在选中时盖在威胁之上，两套样式天然可区分）。
 * 与地图/棋子共用同一份 IsoLayout；显隐与内容完全由 GameManager 驱动，本组件零逻辑。
 * 样式：命中=实心紫、落空=淡紫、待机=灰；失效/阵亡不上格（不残留旧威胁）。
 */
@ccclass('ThreatOverlay')
export class ThreatOverlay extends Component {
    @property({ tooltip: '威胁菱形在 Iso X 方向偏移（像素）' })
    public offsetX = 0;

    @property({ tooltip: '威胁菱形在 Iso Y 方向偏移（像素）' })
    public offsetY = 0;

    private marks: ThreatMark[] = [];
    private layout: IsoLayout | null = null;
    private focusActorId: string | null = null;

    /** 显示威胁（重复调用整体重建） */
    public show(marks: ThreatMark[], layout: IsoLayout): void {
        this.marks = marks;
        this.layout = layout;
        this.render();
    }

    /** 突出某个敌人的意图（null = 恢复总览；重复设置同值不重建） */
    public setFocus(actorId: string | null): void {
        if (this.focusActorId === actorId) return;
        this.focusActorId = actorId;
        if (this.layout) {
            this.render();
        }
    }

    public clear(): void {
        this.node.destroyAllChildren();
        this.node.removeAllChildren();
        this.marks = [];
        this.layout = null;
        this.focusActorId = null;
    }

    private render(): void {
        this.node.destroyAllChildren();
        this.node.removeAllChildren();
        if (!this.layout) return;
        for (const mark of this.marks) {
            // 失效 / 攻击者已阵亡：不上格（可点攻击者看原因，见 GameManager 详情）
            if (mark.status === 'invalid' || mark.status === 'removed') {
                continue;
            }
            const focused = this.focusActorId === mark.actorId;
            if (mark.status === 'standby') {
                if (mark.fromPos) {
                    this.drawCell(mark.fromPos, new Color(120, 120, 120, focused ? 130 : 70), mark.order);
                }
                continue;
            }
            if (!mark.toPos) continue;
            if (focused) {
                // 突出：意图路径淡紫（直线类为完整路径；其余按起终点）
                for (const cell of focusPath(mark)) {
                    this.drawCell(cell, new Color(200, 140, 255, 60), null);
                }
            }
            const hit = mark.status === 'success';
            this.drawCell(
                mark.toPos,
                hit
                    ? new Color(160, 70, 220, focused ? 200 : 150)
                    : new Color(160, 70, 220, focused ? 110 : 55),
                mark.order,
            );
        }
    }

    /** 画一枚整格菱形 + 可选顺序号（与 MoveHighlighter 同款顶面菱形） */
    private drawCell(cell: GridPos, color: Color, order: number | null): void {
        const layout = this.layout!;
        const node = new Node(`threat_${cell.x}_${cell.y}`);
        this.node.addChild(node);
        const { isoX, isoY } = gridToIso(cell.x, cell.y, layout);
        node.setPosition(isoX + this.offsetX, isoY + this.offsetY, 0);

        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.moveTo(0, layout.halfTileH);
        g.lineTo(layout.halfTileW, 0);
        g.lineTo(0, -layout.halfTileH);
        g.lineTo(-layout.halfTileW, 0);
        g.close();
        g.fill();

        if (order !== null) {
            const labelNode = new Node(`order_${order}`);
            node.addChild(labelNode);
            const label = labelNode.addComponent(Label);
            label.string = `${order}`;
            label.fontSize = 22;
            label.isBold = true;
            label.color = new Color(255, 255, 255, 255);
            labelNode.setPosition(layout.halfTileW * 0.45, -layout.halfTileH * 0.45, 0);
        }
    }
}

/** 突出显示用的路径格：有路径取完整路径，否则取起终点两格 */
function focusPath(mark: ThreatMark): GridPos[] {
    if (mark.path.length > 1) {
        return mark.path;
    }
    const from = mark.fromPos;
    const to = mark.toPos;
    if (!from || !to) {
        return [];
    }
    if (from.y === to.y || from.x === to.x) {
        const path: GridPos[] = [];
        const stepX = Math.sign(to.x - from.x);
        const stepY = Math.sign(to.y - from.y);
        let x = from.x;
        let y = from.y;
        path.push({ x, y });
        while (x !== to.x || y !== to.y) {
            x += stepX;
            y += stepY;
            path.push({ x, y });
        }
        return path;
    }
    return [{ ...from }, { ...to }];
}
