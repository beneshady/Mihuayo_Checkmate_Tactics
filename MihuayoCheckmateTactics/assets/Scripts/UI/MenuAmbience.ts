import { _decorator, Color, Component, Sprite, Vec3, warn } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 主菜单背景"呼吸感"（纯变换动效，零额外素材，天然无缝循环）。
 * 三组不同周期的正弦运动叠加，周期互质错开避免机械感：
 * - 缩放呼吸：基准略大于 1（裁切余量防黑边），在基准与基准+幅度间往复
 * - 位置漂移：双轴异相微幅漂移（幅度 MUST 小于缩放裁切余量）
 * - 亮度呼吸：Sprite.color 轻微明暗，模拟云影掠过
 * 使用：挂在背景 Sprite 节点上（Home.scene 主菜单背景图）。
 */
@ccclass('MenuAmbience')
export class MenuAmbience extends Component {
    @property({ tooltip: '缩放基准（建议 ≥1.01：留出裁切余量防黑边）' })
    public baseScale = 1.01;

    @property({ tooltip: '缩放呼吸幅度（在基准之上再放大的量；0.02 ≈ 肉眼可感的轻微呼吸）' })
    public scaleAmplitude = 0.02;

    @property({ tooltip: '缩放呼吸周期（秒）' })
    public scalePeriod = 8;

    @property({ tooltip: '水平漂移幅度（像素；须小于 (baseScale-1)×节点半宽，默认缩放下 ≤6）' })
    public driftAmplitude = 4;

    @property({ tooltip: '漂移周期（秒）' })
    public driftPeriod = 13;

    @property({ tooltip: '亮度呼吸幅度（0~255，向下减暗；0 关闭）' })
    public dimAmplitude = 12;

    @property({ tooltip: '亮度呼吸周期（秒）' })
    public dimPeriod = 11;

    private sprite: Sprite | null = null;
    private readonly baseColor: Color = new Color(255, 255, 255, 255);
    private readonly scratchColor: Color = new Color();
    private originPos: Vec3 = new Vec3();
    private originScale: Vec3 = new Vec3(1, 1, 1);
    private elapsed = 0;

    start(): void {
        this.sprite = this.node.getComponent(Sprite);
        if (!this.sprite) {
            warn('[MenuAmbience] 节点上没有 Sprite 组件：亮度呼吸不生效（缩放/漂移仍可用）');
        } else {
            this.baseColor.set(this.sprite.color);
        }
        this.originPos = this.node.position.clone();
        this.originScale = this.node.scale.clone();
    }

    update(dt: number): void {
        this.elapsed += dt;
        const t = this.elapsed;

        // 缩放呼吸：0.5-0.5*cos 从基准平滑起步并天然循环
        const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / this.scalePeriod);
        const s = this.baseScale + this.scaleAmplitude * wave;
        this.node.setScale(this.originScale.x * s, this.originScale.y * s, this.originScale.z);

        // 双轴异相漂移：不同周期/相位叠加，避免直线往返的机械感
        const dx = this.driftAmplitude * Math.sin((2 * Math.PI * t) / this.driftPeriod);
        const dy = this.driftAmplitude * 0.6 * Math.sin((2 * Math.PI * t) / (this.driftPeriod * 1.37) + 1.1);
        this.node.setPosition(this.originPos.x + dx, this.originPos.y + dy, this.originPos.z);

        // 亮度呼吸：轻微明暗（云影感）
        if (this.sprite) {
            const dim = this.dimAmplitude * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / this.dimPeriod));
            this.scratchColor.set(
                Math.max(0, this.baseColor.r - dim),
                Math.max(0, this.baseColor.g - dim),
                Math.max(0, this.baseColor.b - dim),
                this.baseColor.a,
            );
            this.sprite.color = this.scratchColor;
        }
    }
}
