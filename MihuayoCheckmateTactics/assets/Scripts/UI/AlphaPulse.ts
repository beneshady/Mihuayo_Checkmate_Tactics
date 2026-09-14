import { _decorator, Component, Tween, UIOpacity, tween } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 呼吸淡入淡出（可复用）：节点激活期间，透明度在 [minAlpha, maxAlpha] 间以正弦缓动循环呼吸。
 * 通过 UIOpacity 驱动，对 Sprite / Label 等任意 UI 渲染组件都生效（没有 UIOpacity 会自动补一个）。
 * 用法：挂到任意需要呼吸感的 UI 节点上（如"点击任意键开始"提示文字），active 切换自动起停。
 */
@ccclass('AlphaPulse')
export class AlphaPulse extends Component {
    @property({ range: [0, 255], slide: true, tooltip: '最暗时透明度' })
    public minAlpha = 30;

    @property({ range: [0, 255], slide: true, tooltip: '最亮时透明度' })
    public maxAlpha = 255;

    @property({ tooltip: '一个呼吸周期（秒）：暗→亮各占一半' })
    public period = 1.6;

    private pulseTween: Tween<UIOpacity> | null = null;

    protected onEnable(): void {
        let op = this.getComponent(UIOpacity);
        if (!op) {
            op = this.addComponent(UIOpacity);
        }
        op.opacity = this.maxAlpha;
        const half = Math.max(this.period, 0.1) / 2;
        this.pulseTween = tween(op)
            .to(half, { opacity: this.minAlpha }, { easing: 'sineInOut' })
            .to(half, { opacity: this.maxAlpha }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    protected onDisable(): void {
        if (this.pulseTween) {
            this.pulseTween.stop();
            this.pulseTween = null;
        }
    }
}
