import { _decorator, AudioClip, AudioSource, Component } from 'cc';

const { ccclass, property } = _decorator;

/**
 * UI 音效播放器（可复用）：挂在一个专用 SFX 节点上（同节点带 AudioSource，playOnAwake 必须为关）。
 * playOneShot 短音效：可重叠播放、不打断 BGM（BGM 是另一个 AudioSource）。
 * 音效缺失时静默跳过（对应功能降级为无声，不报错刷屏）。
 */
@ccclass('SfxPlayer')
export class SfxPlayer extends Component {
    @property({ type: AudioClip, tooltip: '点击进入按钮（打开面板）' })
    public clickIn: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '点击返回按钮' })
    public clickOut: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '场景过渡淡出（进战斗黑屏时）' })
    public fade: AudioClip | null = null;

    @property({ range: [0, 1], slide: true, tooltip: '音效音量' })
    public volume = 1;

    private source: AudioSource | null = null;

    protected onLoad(): void {
        this.source = this.getComponent(AudioSource);
        if (!this.source) {
            console.warn('[SfxPlayer] 所在节点没有 AudioSource 组件：音效不可用');
        }
    }

    public playClickIn(): void {
        this.play(this.clickIn);
    }

    public playClickOut(): void {
        this.play(this.clickOut);
    }

    public playFade(): void {
        this.play(this.fade);
    }

    private play(clip: AudioClip | null): void {
        if (clip && this.source) {
            this.source.playOneShot(clip, this.volume);
        }
    }
}
