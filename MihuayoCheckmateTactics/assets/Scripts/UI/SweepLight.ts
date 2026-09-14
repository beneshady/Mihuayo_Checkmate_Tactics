import { _decorator, Component, Sprite, UITransform, Vec3, Vec4 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 扫光驱动（强化原色）：按帧计算光带中心并写入 SweepLight.effect 的 uniforms。
 * 光带沿指定角度方向、以世界空间包围盒为准，从 Sprite 一侧扫到另一侧，每 period 秒循环一次。
 * 材质（SweepLight.mtl）在编辑器指到目标 Sprite 的 customMaterial 上；本组件只负责驱动，
 * 不创建/共享材质实例（多个 Sprite 需要各自独立材质实例时再扩展）。
 * 移植参考：Cocos 论坛"扫光shader"帖（Creator 2.x 版）的"强化扫光"模式。
 */
@ccclass('SweepLight')
export class SweepLight extends Component {
    @property({ tooltip: '扫光方向（度）：0=向右，45=左下→右上' })
    public angleDeg = 45;

    @property({ tooltip: '光带全宽（世界单位≈px）' })
    public bandWidth = 160;

    @property({ range: [0, 1], slide: true, tooltip: '提亮强度：光带处 rgb *= 1+强度' })
    public intensity = 0.35;

    @property({ tooltip: '循环周期（秒）：光带完整扫过一次的时间' })
    public period = 3;

    @property({ tooltip: '首次扫光延时（秒）' })
    public startDelay = 0;

    private time = 0;
    private sprite: Sprite | null = null;
    private sweepA = new Vec4();
    private sweepB = new Vec4();
    private cornerLocal = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];
    private cornerWorld = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];

    protected onLoad(): void {
        this.sprite = this.getComponent(Sprite);
        if (!this.sprite) {
            console.warn('[SweepLight] 所在节点没有 Sprite 组件：扫光不可用');
            this.enabled = false;
        }
    }

    protected update(dt: number): void {
        const mat = this.sprite ? this.sprite.customMaterial : null;
        const ut = this.getComponent(UITransform);
        if (!mat || !ut) return;

        this.time += dt;
        const t = this.time - this.startDelay;
        const phase = t <= 0 ? 0 : (t % this.period) / this.period;

        const rad = (this.angleDeg * Math.PI) / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);

        // 内容矩形四角 → 世界空间 → 沿扫光方向的投影范围（光带中心在 [min-half, max+half] 间往返）
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        const ax = ut.anchorX;
        const ay = ut.anchorY;
        this.cornerLocal[0].set(-ax * w, -ay * h, 0);
        this.cornerLocal[1].set((1 - ax) * w, -ay * h, 0);
        this.cornerLocal[2].set(-ax * w, (1 - ay) * h, 0);
        this.cornerLocal[3].set((1 - ax) * w, (1 - ay) * h, 0);
        const m = this.node.worldMatrix;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < 4; i++) {
            Vec3.transformMat4(this.cornerWorld[i], this.cornerLocal[i], m);
            const p = this.cornerWorld[i].x * dx + this.cornerWorld[i].y * dy;
            if (p < min) min = p;
            if (p > max) max = p;
        }
        const half = this.bandWidth * 0.5;
        const center = min - half + phase * (max - min + 2 * half);

        this.sweepA.set(dx, dy, half, center);
        this.sweepB.set(this.intensity, 0, 0, 0);
        mat.setProperty('sweepA', this.sweepA);
        mat.setProperty('sweepB', this.sweepB);
    }
}
