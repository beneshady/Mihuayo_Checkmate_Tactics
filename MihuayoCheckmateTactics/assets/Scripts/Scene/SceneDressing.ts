import { _decorator, AudioClip, AudioSource, BlockInputEvents, Camera, Color, Component, Graphics, Node, Sprite, SpriteFrame, UITransform, Vec3, tween } from 'cc';
import { SceneFadeOverlay } from '../UI/SceneFadeOverlay';

const { ccclass, property } = _decorator;

/**
 * 场景环境层（挂 Canvas）：全屏渐变背景、暗角、云影与浮尘，负责"棋盘之外不空、画面有呼吸"。
 * 渲染顺序由本组件在 start 时 insertChild 保证：
 * Canvas 子节点 = Camera(0) < Background(1) < GameRoot(2) < CloudRoot(3) < Vignette(4) < UI(5)。
 * 云影/浮尘挂在 Canvas 层（屏幕空间，跟随窗口不跟随伪相机），且不进 GameRoot 子树，
 * 避免污染 BoardCamera.fitToContent 的取景包围盒。
 */
@ccclass('SceneDressing')
export class SceneDressing extends Component {
    @property({ type: SpriteFrame, tooltip: '全屏背景（垂直渐变）' })
    public backgroundSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '全屏暗角（中心透明、边缘渐暗）' })
    public vignetteSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '云影贴图（软边暗斑）；空则不生成云' })
    public cloudSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '浮尘光点贴图；空则不生成' })
    public dustSprite: SpriteFrame | null = null;

    @property({ tooltip: '云影数量' })
    public cloudCount = 3;

    @property({ tooltip: '云影不透明度（0-255）' })
    public cloudAlpha = 60;

    @property({ tooltip: '浮尘数量' })
    public dustCount = 5;

    @property({ type: AudioClip, tooltip: '战斗背景音乐；空则无 BGM' })
    public bgmClip: AudioClip | null = null;

    @property({ range: [0, 1], slide: true, tooltip: 'BGM 音量' })
    public bgmVolume = 0.55;

    @property({ tooltip: '进场从黑屏淡入的时长（秒）' })
    public fadeInDuration = 0.6;

    start() {
        // 清屏色与背景渐变的深色端一致（沙场基调）：画幅比例超出背景覆盖范围时不露异色
        const camera = this.node.getComponent(Camera)?.cameraComponent;
        if (camera) {
            camera.clearColor = new Color(110, 92, 59, 255);
        }
        // 进场黑屏淡入（参考主界面过场；遮罩在 UI 之上、过渡期挡输入）
        this.createFadeOverlay();
        if (this.backgroundSprite) {
            this.createFullscreen('Background', this.backgroundSprite, 1);
        }
        if (this.vignetteSprite) {
            this.createFullscreen('Vignette', this.vignetteSprite, 3);
        }
        this.createAmbience();
        this.startBgm();
    }

    /** 进场黑屏遮罩：Canvas 最后一个子节点（渲染在 UI 之上），全屏纯黑 + 自动淡入；过渡期挡输入 */
    private createFadeOverlay(): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        const width = size ? size.width : 1280;
        const height = size ? size.height : 720;
        const node = new Node('FadeOverlay');
        // 纯 Graphics 画黑块：不引入任何纹理（内置帧/内存纹理参与动态图集合包会 texSubImage2D 崩溃）
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = Color.BLACK;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        node.getComponent(UITransform)!.setContentSize(width, height);
        node.addComponent(BlockInputEvents);
        const fade = node.addComponent(SceneFadeOverlay);
        fade.duration = this.fadeInDuration;
        fade.fadeInOnStart = true;
        this.node.addChild(node);
    }

    /** 战斗 BGM：进本场景即循环起播（用户已在主界面点过"进入战斗"，音频上下文已解锁） */
    private startBgm(): void {
        if (!this.bgmClip) {
            return;
        }
        const node = new Node('BGM');
        const source = node.addComponent(AudioSource);
        source.clip = this.bgmClip;
        source.loop = true;
        source.volume = this.bgmVolume;
        source.playOnAwake = false;
        this.node.addChild(node);
        source.play();
    }

    /** 全屏 Sprite：尺寸取 Canvas 设计分辨率，插到指定渲染序位 */
    private createFullscreen(name: string, frame: SpriteFrame, siblingIndex: number): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        const node = new Node(name);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        node.getComponent(UITransform)!.setContentSize(size ? size.width : 1280, size ? size.height : 720);
        this.node.insertChild(node, siblingIndex);
    }

    /** 云影 + 浮尘容器：插在 GameRoot 之后、Vignette 之前（盖住棋盘与棋子，被暗角压住） */
    private createAmbience(): void {
        const root = new Node('CloudRoot');
        this.node.insertChild(root, 3);
        if (this.cloudSprite) {
            this.buildClouds(root);
        }
        if (this.dustSprite) {
            this.buildDust(root);
        }
    }

    /** 云影：大软暗斑从左向右缓慢漂移，飘出后随机换高度重置到左侧，循环 */
    private buildClouds(root: Node): void {
        for (let i = 0; i < this.cloudCount; i++) {
            const node = new Node(`Cloud_${i}`);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.cloudSprite!;
            const w = 520 + Math.random() * 500;
            node.getComponent(UITransform)!.setContentSize(w, w * 0.62);
            node.setPosition(-900 + Math.random() * 1800, 260 - Math.random() * 520, 0);
            sprite.color = new Color(0, 0, 0, Math.round(this.cloudAlpha));
            root.addChild(node);
            const dur = 38 + Math.random() * 20;
            tween(node)
                .delay(Math.random() * dur)
                .repeatForever(
                    tween()
                        .by(dur, { position: new Vec3(2000, 0, 0) }, { easing: 'linear' })
                        .call(() => node.setPosition(-1000, 260 - Math.random() * 520, 0))
                )
                .start();
        }
    }

    /** 浮尘：暖白小光点原地明灭 + 小幅漂浮，营造空气感 */
    private buildDust(root: Node): void {
        for (let i = 0; i < this.dustCount; i++) {
            const node = new Node(`Dust_${i}`);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.dustSprite!;
            node.getComponent(UITransform)!.setContentSize(10, 10);
            node.setPosition(-620 + Math.random() * 1240, -330 + Math.random() * 680, 0);
            root.addChild(node);
            const dim = Math.round(55 + Math.random() * 40);
            const bright = Math.round(150 + Math.random() * 80);
            const dur = 2.2 + Math.random() * 2.2;
            tween(sprite)
                .repeatForever(
                    tween()
                        .to(dur, { color: new Color(255, 240, 200, bright) }, { easing: 'sineInOut' })
                        .to(dur, { color: new Color(255, 240, 200, dim) }, { easing: 'sineInOut' })
                )
                .start();
            const drift = new Vec3((Math.random() * 2 - 1) * 26, 14 + Math.random() * 22, 0);
            const driftDur = 3 + Math.random() * 3;
            tween(node)
                .repeatForever(
                    tween()
                        .by(driftDur, { position: drift }, { easing: 'sineInOut' })
                        .by(driftDur, { position: new Vec3(-drift.x, -drift.y, 0) }, { easing: 'sineInOut' })
                )
                .start();
        }
    }
}
