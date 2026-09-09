import { _decorator, Component, Label } from 'cc';
import { UnitInfo } from '../Core/UnitInfo';

const { ccclass, property } = _decorator;

/**
 * 棋子信息面板（哑视图，M0 占位）：单个多行 Label，只做格式化显示，
 * 不取数据、不碰战局状态；显隐与内容由 GameManager 驱动。
 * 占位说明：正式 UI 需要背板/头像/血条（待补美术），届时替换本组件实现即可，调用方不动。
 * 参见 docs/design/unit-info-panel-plan.md。
 */
@ccclass('UnitInfoPanel')
export class UnitInfoPanel extends Component {
    @property({ type: Label, tooltip: '信息文本（多行 Label；必填）' })
    public infoLabel: Label | null = null;

    private warnedLabelMissing = false;

    start(): void {
        // 开局保证收起，不依赖场景里的初始显隐
        this.node.active = false;
    }

    /** 显示棋子信息 */
    public show(info: UnitInfo): void {
        if (!this.infoLabel) {
            if (!this.warnedLabelMissing) {
                this.warnedLabelMissing = true;
                console.error('[UnitInfoPanel] 未配置 infoLabel：请把子节点 Label 拖到该属性');
            }
            this.node.active = false;
            return;
        }
        this.node.active = true;
        this.infoLabel.string = this.format(info);
    }

    /** 收起面板 */
    public hide(): void {
        this.node.active = false;
    }

    /** 占位格式化：正式 UI 替换本实现即可 */
    private format(info: UnitInfo): string {
        return [
            `【${info.name}】（${info.side === 'self' ? '我方' : '敌方'}）`,
            `生命：${info.hp}/${info.maxHp}`,
            `体力：${info.stamina}/${info.maxStamina}`,
            `攻击：${info.attack}`,
            `位置：(${info.pos.x}, ${info.pos.y})`,
        ].join('\n');
    }
}
