import { _decorator, Button, Component, Label, Node, warn } from 'cc';
import { ShopKind } from '../Core/Campaign';

const { ccclass } = _decorator;

/**
 * 关间商店面板（哑视图，P2 占位 UI）：金币 + 队伍概览 + 四个买兵按钮 + 开始布阵。
 * 只做展示与回调转发（不碰 Core）：购买/上阵由 GameManager 调 Core（buyRecruit）后
 * 调 refresh() 刷新显示。子节点按名称约定自发现（与 ResultPanel/ThreatRoot 同款）：
 * GoldLabel / RosterLabel（Label）；BuyPawnButton / BuyRookButton / BuyHorseButton /
 * BuyCannonButton / StartDeployButton（挂 Button，子 Label 显示文案与价格）。
 * 按钮子 Label 文案在场景中静态配置（含价格）；价格变化时需同步场景文案。
 */
@ccclass('IntermissionPanel')
export class IntermissionPanel extends Component {
    /** 购买回调（GameManager 注入；kind 由按钮决定） */
    public onBuy: ((kind: ShopKind) => void) | null = null;

    /** 开始布阵回调（GameManager 注入：加载下一关并进入布阵交互） */
    public onStartDeploy: (() => void) | null = null;

    /** 接线防重入 */
    private wired = false;

    private static readonly BUTTON_KINDS: Array<{ name: string; kind: ShopKind }> = [
        { name: 'BuyPawnButton', kind: 'pawn' },
        { name: 'BuyRookButton', kind: 'rook' },
        { name: 'BuyHorseButton', kind: 'horse' },
        { name: 'BuyCannonButton', kind: 'cannon' },
    ];

    start(): void {
        this.wire();
    }

    /**
     * 接线按钮回调。场景序列化挂载时由 start() 触发；GameManager 运行时动态
     * addComponent 挂载（编辑器未挂组件的兜底）时由 GameManager 显式调用（防重入）。
     */
    public wire(): void {
        if (this.wired) {
            return;
        }
        this.wired = true;
        for (const entry of IntermissionPanel.BUTTON_KINDS) {
            const button = this.findButton(entry.name);
            if (!button) {
                warn(`[IntermissionPanel] 缺少子节点 ${entry.name}：对应购买入口不可用`);
                continue;
            }
            button.node.on(Button.EventType.CLICK, () => this.onBuy?.(entry.kind), this);
        }
        const startButton = this.findButton('StartDeployButton');
        if (startButton) {
            startButton.node.on(Button.EventType.CLICK, () => this.onStartDeploy?.(), this);
        } else {
            warn('[IntermissionPanel] 缺少子节点 StartDeployButton：无法开始布阵');
        }
    }

    private findButton(name: string): Button | null {
        return this.node.getChildByName(name)?.getComponent(Button) ?? null;
    }

    /** 显示面板：gold / 上阵数 / 后备数；canStart=false 时隐藏开始布阵（已通全部关卡） */
    public show(gold: number, activeCount: number, benchCount: number, canStart: boolean): void {
        this.node.active = true;
        this.refresh(gold, activeCount, benchCount);
        const startButton = this.startDeployButton();
        if (startButton) {
            startButton.active = canStart;
        }
    }

    public hide(): void {
        this.node.active = false;
    }

    private startDeployButton(): Node | null {
        return this.node.getChildByName('StartDeployButton');
    }

    /** 刷新金币与队伍概览（购买/上阵变化后由 GameManager 调用） */
    public refresh(gold: number, activeCount: number, benchCount: number): void {
        const goldLabel = this.node.getChildByName('GoldLabel')?.getComponent(Label) ?? null;
        if (goldLabel) {
            goldLabel.string = `金币 ${gold}`;
        }
        const rosterLabel = this.node.getChildByName('RosterLabel')?.getComponent(Label) ?? null;
        if (rosterLabel) {
            rosterLabel.string = `上阵 ${activeCount}/8\n后备 ${benchCount}`;
        }
    }
}
