import { _decorator, Component, Tween, tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 面板弹出动画（可复用）：节点每次激活（onEnable）时，缩放从 fromScale 比例弹回
 * 节点自身的设计缩放，backOut 缓动自带轻微过冲，形成"Q 弹"的弹出感。
 * 用法：挂到任何会做 active 切换的面板根节点上即可（HomeUI.showPanel 的 active 切换自动触发）。
 * 目标缩放取节点当前设计缩放（支持非 1 缩放的面板，不破坏既有缩放链）；
 * onDisable 停掉未完成的弹出 tween，避免快速切换面板时残留动画。
 */
@ccclass('PanelPopIn')
export class PanelPopIn extends Component {
    @property({ tooltip: '起始缩放（相对面板设计缩放的比例，0=从无到有）' })
    public fromScale = 0;

    @property({ tooltip: '弹出时长（秒）' })
    public duration = 0.25;

    private popTween: Tween<Node> | null = null;
    private targetScale = new Vec3();

    protected onEnable(): void {
        this.targetScale.set(this.node.scale);
        this.node.setScale(
            this.targetScale.x * this.fromScale,
            this.targetScale.y * this.fromScale,
            this.targetScale.z * this.fromScale,
        );
        this.popTween = tween(this.node)
            .to(this.duration, { scale: this.targetScale.clone() }, { easing: 'backOut' })
            .start();
    }

    protected onDisable(): void {
        if (this.popTween) {
            this.popTween.stop();
            this.popTween = null;
        }
    }
}
