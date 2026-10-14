import { _decorator, Button, Component, Label, warn } from 'cc';
import { CommanderBuffKind } from '../Core/Growth';

const { ccclass } = _decorator;

/**
 * 帅增益选择面板（哑视图，P3 占位 UI）：布阵确认后三选一（生命 / 机动 / 救援）。
 * 只做展示与回调转发（不碰 Core）：选择由 GameManager 调 Core（chooseCommanderBuff）。
 * 子节点按名称约定自发现（与 IntermissionPanel 同款）：
 * TitleLabel（Label）；BuffHealthButton / BuffMoveButton / BuffRescueButton（挂 Button，
 * 子 Label 显示文案）；按钮子 Label 文案在场景中静态配置。
 */
@ccclass('CommanderPanel')
export class CommanderPanel extends Component {
    /** 选择回调（GameManager 注入；kind 由按钮决定） */
    public onPick: ((kind: CommanderBuffKind) => void) | null = null;

    /** 接线防重入 */
    private wired = false;

    private static readonly BUTTON_KINDS: Array<{ name: string; kind: CommanderBuffKind }> = [
        { name: 'BuffHealthButton', kind: 'health' },
        { name: 'BuffMoveButton', kind: 'move' },
        { name: 'BuffRescueButton', kind: 'rescue' },
    ];

    start(): void {
        this.wire();
    }

    /**
     * 接线按钮回调。场景序列化挂载时由 start() 触发；GameManager 运行时动态
     * addComponent 挂载（编辑器未挂组件的兜底）时由 GameManager 显式调用（防重入）。
     */
    public wire(): void {
        if (this.wired) {
            return;
        }
        this.wired = true;
        for (const entry of CommanderPanel.BUTTON_KINDS) {
            const button = this.node.getChildByName(entry.name)?.getComponent(Button) ?? null;
            if (!button) {
                warn(`[CommanderPanel] 缺少子节点 ${entry.name}：对应增益入口不可用`);
                continue;
            }
            button.node.on(Button.EventType.CLICK, () => this.onPick?.(entry.kind), this);
        }
    }

    public show(): void {
        this.node.active = true;
        this.wire();
    }

    public hide(): void {
        this.node.active = false;
    }

    /** 设置标题（GameManager 按当前关卡提示；缺省保留场景文案） */
    public setTitle(text: string): void {
        const title = this.node.getChildByName('TitleLabel')?.getComponent(Label) ?? null;
        if (title) {
            title.string = text;
        }
    }
}
