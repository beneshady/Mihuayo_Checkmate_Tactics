import { _decorator, Component, Tween, UIOpacity, tween } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 场景过渡遮罩（可复用）：挂在 Canvas 最顶层的全屏黑色 Sprite 节点上（初始隐藏），
 * 同节点建议挂 BlockInputEvents 挡住过渡期间的点击。
 * fadeOut：激活遮罩 → 透明度 0→255 淡入到全黑 → 完成回调（在回调里 loadScene 切场景）。
 * 过渡中重复调用安全；不负责新场景的淡入（需要时再加 fadeIn）。
 */
@ccclass('SceneFadeOverlay')
export class SceneFadeOverlay extends Component {
    @property({ tooltip: '默认淡出时长（秒）' })
    public duration = 0.3;

    private opacity: UIOpacity | null = null;
    private fadeTween: Tween<UIOpacity> | null = null;
    private fading = false;

    /** 淡出到全黑；完成后回调 onFaded（duration 缺省用组件属性） */
    public fadeOut(onFaded?: () => void, duration?: number): void {
        if (this.fading) return;
        this.opacity = this.opacity ?? this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
        this.node.active = true;
        this.opacity.opacity = 0;
        this.fading = true;
        this.fadeTween = tween(this.opacity)
            .to(duration ?? this.duration, { opacity: 255 })
            .call(() => {
                this.fading = false;
                onFaded?.();
            })
            .start();
    }

    protected onDisable(): void {
        // 场景销毁或手动隐藏时清掉 tween，避免悬挂回调
        if (this.fadeTween) {
            this.fadeTween.stop();
            this.fadeTween = null;
        }
        this.fading = false;
    }
}
