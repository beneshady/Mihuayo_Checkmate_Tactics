import { _decorator, AudioSource, Button, Component, director, input, Input, instantiate, JsonAsset, Label, Node, warn, error } from 'cc';
import { getLevelEntry, LevelEntry, parseLevelList } from '../Core/LevelConfig';
import { isLevelUnlocked, newProfile, PlayerProfile } from '../Core/PlayerProfile';
import { loadProfile, saveProfile } from './ProfileStore';

const { ccclass, property } = _decorator;

/**
 * 主城协调器（极薄）：主菜单 / 选关 / 兵营 三面板切换 + 金币条 + 进战斗。
 * 页面是纯 UI，切换用节点 active 互斥；本组件不持有任何战斗逻辑（ADR-0001 分层）。
 * 关卡条目由 level-list.json 驱动动态生成；解锁判定来自玩家存档（推导值）。
 * 标题页：进入 Home 先只显示 LOGO（隐藏按钮容器），任意触摸/按键后进入主菜单（仅本次进场景生效）。
 * BGM：AudioSource（playOnAwake 必须关闭）；由本组件唯一触发起播，bgmStarted 防重入保证只 play 一次，
 * 加载时尝试一次（浏览器放行则标题页有声），被自动播放策略拦下则在标题页解除（有效交互）时起播。
 */
@ccclass('HomeUI')
export class HomeUI extends Component {
    @property({ type: Node, tooltip: '主菜单页根节点' })
    public menuPanel: Node | null = null;

    @property({ type: Node, tooltip: '选关页根节点' })
    public levelSelectPanel: Node | null = null;

    @property({ type: Node, tooltip: '兵营页根节点（本期占位空面板）' })
    public barracksPanel: Node | null = null;

    @property({ type: Node, tooltip: '金币余额文本节点（跨面板常显的状态条；节点上挂 Label）' })
    public goldLabel: Node | null = null;

    @property({ type: Node, tooltip: '主菜单按钮容器（标题页整体隐藏；以后新增主菜单按钮放进它下面即可）' })
    public menuButtonsRoot: Node | null = null;

    @property({ type: Node, tooltip: '「开始战斗」按钮节点（挂 Button；主菜单页）' })
    public startBattleButton: Node | null = null;

    @property({ type: Node, tooltip: '「兵营」按钮节点（挂 Button；主菜单页）' })
    public barracksButton: Node | null = null;

    @property({ type: Node, tooltip: '「返回」按钮节点（挂 Button；选关页）' })
    public backToMenuButton: Node | null = null;

    @property({ type: Node, tooltip: '「返回」按钮节点（挂 Button；兵营页）' })
    public barracksBackButton: Node | null = null;

    @property({ type: Node, tooltip: '游戏 LOGO 节点（标题页只显示它；任意点击/按键后隐藏）' })
    public logoNode: Node | null = null;

    @property({ type: Node, tooltip: '标题页全屏输入接收节点（Canvas；子节点触摸会冒泡到它）' })
    public fullScreenInputNode: Node | null = null;

    @property({ type: Node, tooltip: '背景音乐节点（挂 AudioSource，playOnAwake 必须为关；由本组件起播一次）' })
    public bgmNode: Node | null = null;

    @property({ type: JsonAsset, tooltip: '关卡列表配置（resources/Levels/level-list.json）' })
    public levelListAsset: JsonAsset | null = null;

    @property({ type: Node, tooltip: '关卡条目容器（列表父节点，运行时动态填充）' })
    public levelListContainer: Node | null = null;

    @property({ type: Node, tooltip: '关卡条目模板（带 Button+Label 的节点；不放在容器内，初始可隐藏）' })
    public levelItemTemplate: Node | null = null;

    /** 关卡列表（levelListAsset 解析结果） */
    private levels: LevelEntry[] = [];

    /** 玩家档案（Home 会话内的内存副本；写盘时机：进战斗、由战斗结算） */
    private profile: PlayerProfile = newProfile();

    /** 金币 Label 组件缓存（goldLabel 节点引用解析所得） */
    private goldLabelComp: Label | null = null;

    /** 标题页状态：true=只显示 LOGO；任意输入后进入主菜单并不再回到标题页 */
    private titlePhase = false;

    /** BGM 是否已触发过起播（防重入：与 isPlaying 无关，整个生命周期只 play 一次） */
    private bgmStarted = false;

    start(): void {
        if (!this.levelListAsset) {
            error('[HomeUI] 未配置 levelListAsset：请把 resources/Levels/level-list.json 拖到该属性');
            return;
        }
        try {
            this.levels = parseLevelList(this.levelListAsset.json).levels;
        } catch (err) {
            error(`[HomeUI] 关卡列表非法 —— ${(err as Error).message}`);
            return;
        }
        this.profile = loadProfile();
        this.goldLabelComp = this.goldLabel?.getComponent(Label) ?? null;

        this.wireButton(this.startBattleButton, () => this.showPanel(this.levelSelectPanel, () => this.renderLevelList()));
        this.wireButton(this.barracksButton, () => this.showPanel(this.barracksPanel));
        this.wireButton(this.backToMenuButton, () => this.showPanel(this.menuPanel));
        this.wireButton(this.barracksBackButton, () => this.showPanel(this.menuPanel));
        this.showPanel(this.menuPanel);
        this.enterTitlePhase();
        this.ensureBgmStarted();
    }

    protected onDestroy(): void {
        // input 是全局事件源，必须显式解除；节点监听随节点销毁，off 兜底无害
        this.fullScreenInputNode?.off(Node.EventType.TOUCH_END, this.onTitleDismissInput, this);
        input.off(Input.EventType.KEY_DOWN, this.onTitleDismissInput, this);
    }

    /** BGM 起播（防重入）：只触发一次；被浏览器自动播放拦下时由标题页解除时机补播 */
    private ensureBgmStarted(): void {
        if (this.bgmStarted) {
            return;
        }
        const player = this.bgmNode?.getComponent(AudioSource) ?? null;
        if (!player) {
            return;
        }
        this.bgmStarted = true;
        player.play();
    }

    /** 统一挂按钮点击：引用存节点，Button 组件的 click 事件发在其节点上；缺失只警告降级 */
    private wireButton(button: Node | null, onClick: () => void): void {
        if (!button) {
            warn('[HomeUI] 有按钮未配置引用，对应入口不可用');
            return;
        }
        button.on(Button.EventType.CLICK, onClick, this);
    }

    /** 面板切换：三面板互斥 active；金币条每次刷新；进入前可选渲染 */
    private showPanel(panel: Node | null, beforeShow?: () => void): void {
        if (this.menuPanel) this.menuPanel.active = panel === this.menuPanel;
        if (this.levelSelectPanel) this.levelSelectPanel.active = panel === this.levelSelectPanel;
        if (this.barracksPanel) this.barracksPanel.active = panel === this.barracksPanel;
        this.refreshGold();
        if (panel && beforeShow) {
            beforeShow();
        }
    }

    /** 标题页：只显示 LOGO，按钮容器整体隐藏；任意触摸/按键解除 */
    private enterTitlePhase(): void {
        this.titlePhase = true;
        if (this.logoNode) {
            this.logoNode.active = true;
        }
        if (this.menuButtonsRoot) {
            this.menuButtonsRoot.active = false;
        }
        this.fullScreenInputNode?.on(Node.EventType.TOUCH_END, this.onTitleDismissInput, this);
        input.on(Input.EventType.KEY_DOWN, this.onTitleDismissInput, this);
    }

    /** 解除标题页：LOGO 消失，按钮容器浮现；解绑监听，此后返回主菜单不再重播 */
    private onTitleDismissInput(): void {
        if (!this.titlePhase) {
            return;
        }
        this.titlePhase = false;
        this.fullScreenInputNode?.off(Node.EventType.TOUCH_END, this.onTitleDismissInput, this);
        input.off(Input.EventType.KEY_DOWN, this.onTitleDismissInput, this);
        if (this.logoNode) {
            this.logoNode.active = false;
        }
        if (this.menuButtonsRoot) {
            this.menuButtonsRoot.active = true;
        }
        // 起播时机兜底：这里必然是一次有效交互；bgmStarted 保证若加载时已播则不会重启
        this.ensureBgmStarted();
    }

    private refreshGold(): void {
        if (this.goldLabelComp) {
            this.goldLabelComp.string = `金币 ${this.profile.gold}`;
        }
    }

    /** 渲染选关列表：模板实例化；锁定项置灰，通关项打标 */
    private renderLevelList(): void {
        if (!this.levelListContainer || !this.levelItemTemplate) {
            warn('[HomeUI] 未配置 levelListContainer/levelItemTemplate：选关列表不可用');
            return;
        }
        this.levelListContainer.removeAllChildren();
        for (const entry of this.levels) {
            const item = instantiate(this.levelItemTemplate);
            item.active = true;
            const unlocked = isLevelUnlocked(this.profile, this.levels, entry.id);
            const cleared = this.profile.clearedLevels.indexOf(entry.id) !== -1;
            const label = item.getComponentInChildren(Label);
            if (label) {
                label.string = `${entry.name}${cleared ? ' · 已通关' : ''}${unlocked ? '' : '（未解锁）'}`;
            }
            const button = item.getComponent(Button);
            if (button) {
                button.interactable = unlocked;
            }
            item.on(Button.EventType.CLICK, () => this.onLevelClicked(entry), this);
            this.levelListContainer.addChild(item);
        }
    }

    /** 点已解锁关卡：写存档 currentLevelId → 进战斗场景（战局由 GameManager 按 id 动态加载） */
    private onLevelClicked(entry: LevelEntry): void {
        // 列表渲染时已置灰，这里防御再挡一次
        if (!isLevelUnlocked(this.profile, this.levels, entry.id)) {
            warn(`[HomeUI] 关卡未解锁：${entry.id}`);
            return;
        }
        this.profile.currentLevelId = entry.id;
        saveProfile(this.profile);
        director.loadScene('Main');
    }
}
