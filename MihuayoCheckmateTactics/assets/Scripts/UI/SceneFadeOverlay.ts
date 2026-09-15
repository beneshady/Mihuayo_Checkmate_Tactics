import { _decorator, Component, Tween, UIOpacity, tween } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 场景过渡遮罩（可复用）：挂在 Canvas 最顶层的全屏黑色 Sprite 节点上，
 * 同节点建议挂 BlockInputEvents 挡住过渡期间的点击。
 * fadeOut：激活遮罩 → 透明度 0→255 淡入到全黑 → 完成回调（在回调里 loadScene 切场景）。
 * fadeIn：从全黑 255→0 淡入显示场景 → 完成后自动隐藏遮罩（进入游戏页的开场效果）。
 * fadeInOnStart：勾选后本场景加载即自动执行 fadeIn（配合遮罩节点初始 active=true、UIOpacity=255）。
 * 过渡中重复调用安全。
 */
@ccclass('SceneFadeOverlay')
export class SceneFadeOverlay extends Component {
    @property({ tooltip: '默认过渡时长（秒）' })
    public duration = 0.3;

    @property({ tooltip: '场景加载时自动从黑屏淡入（进入游戏页的开场效果；遮罩节点需初始可见）' })
    public fadeInOnStart = false;

    private opacity: UIOpacity | null = null;
    private fadeTween: Tween<UIOpacity> | null = null;
    private fading = false;

    start(): void {
        if (this.fadeInOnStart) {
            this.fadeIn();
        }
    }

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

    /** 从全黑淡入显示场景；完成后自动隐藏遮罩并回调 onFaded */
    public fadeIn(onFaded?: () => void, duration?: number): void {
        if (this.fading) return;
        this.opacity = this.opacity ?? this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
        this.node.active = true;
        this.opacity.opacity = 255;
        this.fading = true;
        this.fadeTween = tween(this.opacity)
            .to(duration ?? this.duration, { opacity: 0 })
            .call(() => {
                this.fading = false;
                this.node.active = false; // 淡入完成即撤掉遮罩，还交互给场景
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
