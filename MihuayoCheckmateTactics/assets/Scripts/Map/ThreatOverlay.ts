import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
import { gridToIso, GridPos } from '../Core/BattleState';
import { IntentForecast } from '../Core/EnemyTelegraph';
import { IsoLayout } from './IsoLayout';

const { ccclass, property } = _decorator;

/**
 * 敌方威胁覆盖层（哑视图，US-006 §3）：按意图预测结果画整格威胁与行动顺序号。
 * 节点 MUST 放在 MapRoot 之后、UnitRoot 之前（树序渲染：威胁盖地块、棋子盖威胁、
 * 我方红/灰攻击高亮在选中时盖在威胁之上，两套样式天然可区分）。
 * 与地图/棋子共用同一份 IsoLayout；显隐与内容完全由 GameManager 驱动，本组件零逻辑。
 * 样式：命中=实心紫、落空=淡紫、待机=灰；失效/阵亡/未执行不上格（不残留旧威胁）。
 */
@ccclass('ThreatOverlay')
export class ThreatOverlay extends Component {
    @property({ tooltip: '威胁菱形在 Iso X 方向偏移（像素）' })
    public offsetX = 0;

    @property({ tooltip: '威胁菱形在 Iso Y 方向偏移（像素）' })
    public offsetY = 0;

    private forecasts: IntentForecast[] = [];
    private layout: IsoLayout | null = null;
    private focusActorId: string | null = null;

    /** 显示威胁（重复调用整体重建） */
    public show(forecasts: IntentForecast[], layout: IsoLayout): void {
        this.forecasts = forecasts;
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
        this.forecasts = [];
        this.layout = null;
        this.focusActorId = null;
    }

    private render(): void {
        this.node.destroyAllChildren();
        this.node.removeAllChildren();
        if (!this.layout) return;
        for (const forecast of this.forecasts) {
            // 失效 / 攻击者已阵亡 / 帅亡截断：不上格（可点攻击者看原因，见 GameManager 详情）
            if (forecast.status === 'invalid' || forecast.status === 'removed' || forecast.status === 'skipped') {
                continue;
            }
            const focused = this.focusActorId === forecast.intent.actorId;
            if (forecast.status === 'standby') {
                if (forecast.fromPos) {
                    this.drawCell(forecast.fromPos, new Color(120, 120, 120, focused ? 130 : 70), forecast.intent.order);
                }
                continue;
            }
            if (!forecast.toPos) continue;
            if (focused && forecast.fromPos) {
                // 突出：意图路径淡紫（炮为整条直线路径；其余按起终点）
                for (const cell of focusPath(forecast)) {
                    this.drawCell(cell, new Color(200, 140, 255, 60), null);
                }
            }
            const hit = forecast.status === 'hit';
            this.drawCell(
                forecast.toPos,
                hit
                    ? new Color(160, 70, 220, focused ? 200 : 150)
                    : new Color(160, 70, 220, focused ? 110 : 55),
                forecast.intent.order,
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

/** 突出显示用的路径格：炮/直线取完整路径，其余取起终点两格 */
function focusPath(forecast: IntentForecast): GridPos[] {
    if (forecast.path.length > 1) {
        return forecast.path;
    }
    const from = forecast.fromPos;
    const to = forecast.toPos;
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
