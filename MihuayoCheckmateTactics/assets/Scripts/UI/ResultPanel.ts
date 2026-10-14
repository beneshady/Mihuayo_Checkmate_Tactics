import { _decorator, AudioClip, AudioSource, Button, Component, director, Label } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 结算面板（占位级 Result UI）：战局结束的覆盖层，胜/败/平局文案 + 导航。
 * 奖励发放与存档由 GameManager 在弹面板前完成，本组件只做展示与导航（不碰 Core）。
 * 替代旧"结束后 2 秒自动刷新场景"占位（docs/design/main-menu-plan.md §2/§4）。
 * 子节点按名称约定自发现（TitleLabel / DetailLabel / BackButton / NextButton / RetryButton），无需拖拽引用。
 * P1：胜利可显示「下一关」（回调 onNext，由 GameManager 注入场景内推进）；失败可显示「重试」
 * （回调 onRetry，levelSnapshot 回滚）。回调未注入时对应按钮自动隐藏（默认只保留返回选关）。
 * 返回按钮带点击音（backSfx），短暂停留让音效收尾再切场景。
 */
@ccclass('ResultPanel')
export class ResultPanel extends Component {
    @property({ type: AudioClip, tooltip: '返回按钮点击音；空则静默' })
    public backSfx: AudioClip | null = null;

    /** 「下一关」回调（GameManager 注入场景内推进；未注入 = 无下一关，按钮隐藏） */
    public onNext: (() => void) | null = null;

    /** 「重试」回调（GameManager 注入 levelSnapshot 回滚；未注入 = 按钮隐藏） */
    public onRetry: (() => void) | null = null;

    private sfxSource: AudioSource | null = null;

    start(): void {
        // 本节点在场景里默认隐藏（active=false），start() 会推迟到首次 show() 激活时才执行；
        // 绝不能在这里再把自己 active=false，否则首次弹出会被自己立刻藏回去。
        // 按钮接线也在此刻才发生（首次激活后紧接的一帧内完成）。
        const backButton = this.node.getChildByName('BackButton')?.getComponent(Button) ?? null;
        if (backButton) {
            backButton.node.on(Button.EventType.CLICK, this.onBackClicked, this);
        }
        const nextButton = this.node.getChildByName('NextButton')?.getComponent(Button) ?? null;
        if (nextButton) {
            nextButton.node.on(Button.EventType.CLICK, () => this.onNext?.(), this);
        }
        const retryButton = this.node.getChildByName('RetryButton')?.getComponent(Button) ?? null;
        if (retryButton) {
            retryButton.node.on(Button.EventType.CLICK, () => this.onRetry?.(), this);
        }
        if (this.backSfx) {
            this.sfxSource = this.addComponent(AudioSource)!;
            this.sfxSource.playOnAwake = false;
        }
    }

    /** 显示结算：result 由 GameManager 按胜者与人类阵营判定；opts 控制次级按钮显隐 */
    public show(result: 'win' | 'lose' | 'draw', rewardGold: number, reason: string, opts?: { showNext?: boolean; showRetry?: boolean }): void {
        this.node.active = true;
        const titleLabel = this.node.getChildByName('TitleLabel')?.getComponent(Label) ?? null;
        const detailLabel = this.node.getChildByName('DetailLabel')?.getComponent(Label) ?? null;
        if (titleLabel) {
            titleLabel.string = result === 'win' ? '胜利' : result === 'draw' ? '平局' : '战败';
        }
        if (detailLabel) {
            detailLabel.string = result === 'win' ? `获得 ${rewardGold} 金币` : reason;
        }
        this.setNavButtonVisible('NextButton', opts?.showNext ?? false);
        this.setNavButtonVisible('RetryButton', opts?.showRetry ?? false);
    }

    private setNavButtonVisible(name: string, visible: boolean): void {
        const child = this.node.getChildByName(name);
        if (child) {
            child.active = visible;
        }
    }

    private onBackClicked(): void {
        // 先播音效再短暂停留（音效约 0.2s），避免切场景立刻掐断声音
        if (this.backSfx && this.sfxSource) {
            this.sfxSource.playOneShot(this.backSfx, 1);
            this.scheduleOnce(() => director.loadScene('Home'), 0.2);
            return;
        }
        director.loadScene('Home');
    }
}
