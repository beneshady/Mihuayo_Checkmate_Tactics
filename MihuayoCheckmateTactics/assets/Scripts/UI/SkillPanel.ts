import { _decorator, Button, Color, Component, Graphics, Label, Node, UITransform, warn } from 'cc';
import { SkillOffering } from '../Core/Growth';

const { ccclass } = _decorator;

/**
 * 技能成长面板（哑视图，P3 占位 UI）：选中我方棋子时列出该单位的技能项
 * （强健/转职/连动/方向射程/车技能/炮扩散），点击购买（升级不消耗行动）。
 * 只做展示与回调转发（不碰 Core）：选项数据来自 Core.skillOfferings，
 * 购买由 GameManager 调 Core（purchaseUpgrade）后调 show() 刷新。
 * 子节点按名称约定自发现（与 IntermissionPanel 同款）：TitleLabel（Label）、
 * ListRoot（空容器，选项行动态生成）；面板节点缺 Label 项时仅警告不阻断。
 * 布局注意：行节点带可交互 Button 时会吞触摸，因此仅可用行挂 Button、
 * 禁用行只渲染文字——避免面板覆盖操作按钮时挡住点击（用户实测反馈）。
 */
@ccclass('SkillPanel')
export class SkillPanel extends Component {
    /** 购买回调（GameManager 注入；index 仅 direction/cannon-splash 需要） */
    public onBuy: ((skill: string, index?: number) => void) | null = null;

    /** 选项行尺寸（本地单位；两行文本：主行技能名 + 副行效果/价格） */
    private static readonly ROW_HEIGHT = 56;
    private static readonly ROW_GAP = 4;
    private static readonly ROW_WIDTH = 320;

    private wired = false;

    start(): void {
        this.wire();
    }

    /** 场景序列化挂载时由 start() 触发；动态挂载时由 GameManager 显式调用（防重入） */
    public wire(): void {
        if (this.wired) {
            return;
        }
        this.wired = true;
        if (!this.node.getChildByName('TitleLabel')) {
            warn('[SkillPanel] 缺少子节点 TitleLabel：不显示单位名与 SP');
        }
        if (!this.node.getChildByName('ListRoot')) {
            warn('[SkillPanel] 缺少子节点 ListRoot：技能项无法显示');
        }
    }

    public hide(): void {
        this.node.active = false;
    }

    /** 渲染面板：单位名 + SP + 选项行（SP 不足或已达上限的项置灰禁用） */
    public show(unitName: string, sp: number, items: SkillOffering[]): void {
        this.node.active = true;
        this.wire();
        const title = this.node.getChildByName('TitleLabel')?.getComponent(Label) ?? null;
        if (title) {
            title.string = `${unitName} · SP ${sp}`;
        }
        const root = this.node.getChildByName('ListRoot');
        if (!root) {
            return;
        }
        root.removeAllChildren();
        items.forEach((item, i) => {
            root.addChild(this.buildRow(item, sp, i));
        });
    }

    /** 生成一行选项：底板/文字/按钮分层（Cocos 一个节点仅允许一个 UIRenderer，Graphics 与 Label 必须分节点） */
    private buildRow(item: SkillOffering, sp: number, row: number): Node {
        const node = new Node(`skill_${item.skill}${item.index ?? ''}`);
        node.addComponent(UITransform).setContentSize(SkillPanel.ROW_WIDTH, SkillPanel.ROW_HEIGHT);
        // 底板子节点：半透明深色圆角矩形
        const bg = new Node('bg');
        bg.addComponent(UITransform).setContentSize(SkillPanel.ROW_WIDTH, SkillPanel.ROW_HEIGHT);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(24, 28, 36, 205);
        g.roundRect(-SkillPanel.ROW_WIDTH / 2, -SkillPanel.ROW_HEIGHT / 2, SkillPanel.ROW_WIDTH, SkillPanel.ROW_HEIGHT, 8);
        g.fill();
        node.addChild(bg);
        // 文字子节点：主行技能名 + 副行效果/价格/原因（先于 Button 挂载，事件监听在父节点）
        const disabled = item.maxed || sp < item.cost;
        const textNode = new Node('label');
        textNode.addComponent(UITransform).setContentSize(SkillPanel.ROW_WIDTH, SkillPanel.ROW_HEIGHT);
        const label = textNode.addComponent(Label);
        const tail = item.maxed ? '｜已满' : sp < item.cost ? `｜缺 ${item.cost - sp} SP` : '';
        label.string = `${item.name}\n${item.detail}｜${item.cost} SP${tail}`;
        label.fontSize = 15;
        label.lineHeight = 24;
        label.color = disabled ? new Color(150, 150, 150, 255) : new Color(235, 238, 245, 255);
        node.addChild(textNode);
        node.setPosition(0, -row * (SkillPanel.ROW_HEIGHT + SkillPanel.ROW_GAP), 0);
        // 仅可用行挂 Button（禁用行不吞触摸）；触摸命中子节点后冒泡到行节点的监听
        if (!disabled) {
            const button = node.addComponent(Button);
            button.node.on(Button.EventType.CLICK, () => this.onBuy?.(item.skill, item.index), this);
        }
        return node;
    }
}
