import { _decorator, Button, Component, director, instantiate, JsonAsset, Label, Node, warn, error } from 'cc';
import { getLevelEntry, LevelEntry, parseLevelList } from '../Core/LevelConfig';
import { isLevelUnlocked, newProfile, PlayerProfile } from '../Core/PlayerProfile';
import { loadProfile, saveProfile } from './ProfileStore';

const { ccclass, property } = _decorator;

/**
 * 主城协调器（极薄）：主菜单 / 选关 / 兵营 三面板切换 + 金币条 + 进战斗。
 * 页面是纯 UI，切换用节点 active 互斥；本组件不持有任何战斗逻辑（ADR-0001 分层）。
 * 关卡条目由 level-list.json 驱动动态生成；解锁判定来自玩家存档（推导值）。
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

    @property({ type: Node, tooltip: '「开始战斗」按钮节点（挂 Button；主菜单页）' })
    public startBattleButton: Node | null = null;

    @property({ type: Node, tooltip: '「兵营」按钮节点（挂 Button；主菜单页）' })
    public barracksButton: Node | null = null;

    @property({ type: Node, tooltip: '「返回」按钮节点（挂 Button；选关页）' })
    public backToMenuButton: Node | null = null;

    @property({ type: Node, tooltip: '「返回」按钮节点（挂 Button；兵营页）' })
    public barracksBackButton: Node | null = null;

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
