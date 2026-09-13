import { _decorator, Button, Component, director, Label } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 结算面板（占位级 Result UI）：战局结束的覆盖层，胜/败/平局文案 + 返回选关。
 * 奖励发放与存档由 GameManager 在弹面板前完成，本组件只做展示与导航（不碰 Core）。
 * 替代旧"结束后 2 秒自动刷新场景"占位（docs/design/main-menu-plan.md §2/§4）。
 * 子节点按名称约定自发现（TitleLabel / DetailLabel / BackButton），无需拖拽引用。
 */
@ccclass('ResultPanel')
export class ResultPanel extends Component {
    start(): void {
        // 本节点在场景里默认隐藏（active=false），start() 会推迟到首次 show() 激活时才执行；
        // 绝不能在这里再把自己 active=false，否则首次弹出会被自己立刻藏回去。
        // 返回按钮的接线也在此刻才发生（首次激活后紧接的一帧内完成）。
        const backButton = this.node.getChildByName('BackButton')?.getComponent(Button) ?? null;
        if (backButton) {
            backButton.node.on(Button.EventType.CLICK, this.onBackClicked, this);
        }
    }

    /** 显示结算：result 由 GameManager 按胜者与人类阵营判定 */
    public show(result: 'win' | 'lose' | 'draw', rewardGold: number, reason: string): void {
        this.node.active = true;
        const titleLabel = this.node.getChildByName('TitleLabel')?.getComponent(Label) ?? null;
        const detailLabel = this.node.getChildByName('DetailLabel')?.getComponent(Label) ?? null;
        if (titleLabel) {
            titleLabel.string = result === 'win' ? '胜利' : result === 'draw' ? '平局' : '战败';
        }
        if (detailLabel) {
            detailLabel.string = result === 'win' ? `获得 ${rewardGold} 金币` : reason;
        }
    }

    private onBackClicked(): void {
        director.loadScene('Home');
    }
}
