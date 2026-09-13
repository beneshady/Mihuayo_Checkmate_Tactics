import { _decorator, Component, Sprite, SpriteFrame, warn } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 帧序列循环播放器（主菜单背景动画）。
 * 挂在有 Sprite 的节点上，frames 按播放顺序赋帧。
 */
@ccclass('FrameSequencePlayer')
export class FrameSequencePlayer extends Component {
    @property({ type: [SpriteFrame], tooltip: '按播放顺序排列的帧' })
    public frames: SpriteFrame[] = [];

    @property({ tooltip: '播放帧率（帧/秒）' })
    public fps = 8;

    @property({ tooltip: '是否循环' })
    public loop = true;

    @property({ tooltip: '启动时自动播放' })
    public playOnStart = true;

    private sprite: Sprite | null = null;
    private index = 0;
    private timer = 0;
    private playing = false;

    start(): void {
        this.sprite = this.node.getComponent(Sprite);
        if (!this.sprite) {
            warn('[FrameSequencePlayer] 节点上没有 Sprite 组件，无法播放帧序列');
            return;
        }
        if (this.frames.length > 0) {
            this.sprite.spriteFrame = this.frames[0];
        }
        if (this.playOnStart) {
            this.playing = true;
        }
    }

    update(dt: number): void {
        if (!this.playing || !this.sprite || this.frames.length === 0 || this.fps <= 0) {
            return;
        }
        this.timer += dt;
        const step = 1 / this.fps;
        while (this.timer >= step) {
            this.timer -= step;
            this.index += 1;
            if (this.index >= this.frames.length) {
                if (this.loop) {
                    this.index = 0;
                } else {
                    this.index = this.frames.length - 1;
                    this.playing = false;
                    break;
                }
            }
            this.sprite.spriteFrame = this.frames[this.index];
        }
    }
}
