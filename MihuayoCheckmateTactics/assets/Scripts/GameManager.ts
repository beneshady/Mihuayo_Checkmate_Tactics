import { _decorator, AudioClip, AudioSource, Button, Camera, Canvas, Color, Component, EventTouch, JsonAsset, Label, Node, director, resources, Vec3, error, log, tween, warn } from 'cc';
import { BattleState, GridPos, gridToIso, isoToGrid, terrainAt } from './Core/BattleState';
import { corpseAt, unitAt } from './Core/Terrain';
import { CONFIG } from './Core/Config';
import { UnitAction, legalActions, unitHasAp } from './Core/Actions';
import { checkTerminal, deepCopy, resetAllTurns, retryLevel, startBattle, submitAction } from './Core/Rules';
import { buyRecruit, campaignSourceFrom, confirmDeployment, constructLevel, deployUnit, LevelSource, ShopKind } from './Core/Campaign';
import { chooseCommanderBuff, CommanderBuffKind, purchaseUpgrade, rescue, skillOfferings } from './Core/Growth';
import { advanceTurn } from './Core/Waves';
import {
    EnemyIntentEffect,
    applyEnemyIntent,
    applyPrepMove,
    generateIntents,
    intentTarget,
    planEnemyPrep,
    simulateIntent,
} from './Core/EnemyTelegraph';
import { getLevelEntry, LevelEntry, LevelList, parseLevelList } from './Core/LevelConfig';
import { grantBattleReward } from './Core/PlayerProfile';
import { getUnitInfo } from './Core/UnitInfo';
import { BoardCamera } from './Map/BoardCamera';
import { IsoLayout, surfaceDropAt } from './Map/IsoLayout';
import { MapBuilder } from './Map/MapBuilder';
import { MoveHighlighter } from './Map/MoveHighlighter';
import { ThreatMark, ThreatOverlay } from './Map/ThreatOverlay';
import { UnitBuilder } from './Unit/UnitBuilder';
import { ResultPanel } from './UI/ResultPanel';
import { IntermissionPanel } from './UI/IntermissionPanel';
import { CommanderPanel } from './UI/CommanderPanel';
import { SkillPanel } from './UI/SkillPanel';
import { UnitInfoPanel } from './UI/UnitInfoPanel';
import { loadProfile, saveProfile } from './UI/ProfileStore';

const { ccclass, property } = _decorator;

/**
 * 战局流程阶段（编排层；与数据层的 turn.phase 区分开）。
 * US-006 预告回合制：回合恒在我方——每轮先敌方准备（enemyPrep）并冻结攻击意图，
 * 再交给我方行动（playerTurn）；我方结束回合后敌方按序执行冻结攻击（enemyAttack），
 * 结算完毕进入下一轮准备。不再有独立的敌方行动回合。
 */
export type FlowStage = 'generating' | 'intermission' | 'deploy' | 'commander' | 'enemyPrep' | 'playerTurn' | 'enemyAttack' | 'rescuePhase' | 'ended';

/** 棋子交互子状态：无选中 → 已选中（显示「行动」）→ 目标选择（显示「取消」+ 高亮可走格） */
export type InteractStage = 'idle' | 'selected' | 'targeting';

/**
 * 战局协调者（M0 / 规则 v2）：持有内存中的战局状态（唯一事实源），
 * 按流程驱动：关卡生成 → （敌方准备+冻结意图 → 我方回合 → 敌方按序执行 → 下一轮）→ 胜负结束。
 * 我方回合内编排棋子交互：点选 → 行动/攻击 → 高亮合法动作 → 点格执行 / 取消。
 * 执行走 Core.submitAction（额度+合法性+revision 三重校验，深拷贝返回新状态）。
 * 纯逻辑（解析 / 坐标 / 规则）留在 Core 纯 TS，本组件只做引擎粘合与流程编排。
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: JsonAsset, tooltip: '关卡列表配置（resources/Levels/level-list.json）' })
    public levelListAsset: JsonAsset | null = null;

    @property({ type: Node, tooltip: '结算面板根节点（挂 ResultPanel 组件：胜利发奖落档，返回选关）' })
    public resultPanelNode: Node | null = null;

    @property({ type: MapBuilder, tooltip: '地图生成器（MapRoot 上的 MapBuilder 组件）' })
    public mapBuilder: MapBuilder | null = null;

    @property({ type: UnitBuilder, tooltip: '棋子生成器（UnitRoot 上的 UnitBuilder 组件，须排在 MapRoot 之后）' })
    public unitBuilder: UnitBuilder | null = null;

    @property({ type: Button, tooltip: '结束回合按钮（仅我方回合显示；点击后进入敌方回合）' })
    public turnEndButton: Button | null = null;

    @property({ type: Button, tooltip: '行动按钮（选中我方棋子后显示；点击进入移动目标选择）' })
    public actionButton: Button | null = null;

    @property({ type: Button, tooltip: '取消按钮（目标选择中显示；点击放弃回选中态）' })
    public cancelButton: Button | null = null;

    @property({ type: MoveHighlighter, tooltip: '可走格高亮层（HighlightRoot 节点，须排在 MapRoot 之后、UnitRoot 之前）' })
    public highlighter: MoveHighlighter | null = null;

    @property({ tooltip: '点击拾取调试日志（验证触摸坐标→格子换算；接入视角系统前可开着核对）' })
    public debugPick = false;

    @property({ tooltip: '敌方节奏：阶段起手前的停顿（秒）' })
    public aiDelay = 0.5;

    @property({ tooltip: '敌方节奏：准备移动之间 / 攻击结算之间的间隔（秒）；应不小于 UnitBuilder.unitMoveDuration，保证移动动画播完再进行下一步' })
    public enemySettleDelay = 0.6;

    @property({ type: UnitInfoPanel, tooltip: '棋子信息面板（点击任意棋子显示信息；M0 占位 UI）' })
    public unitInfoPanel: UnitInfoPanel | null = null;

    @property({ type: AudioClip, tooltip: '操作按钮点击音（行动/攻击/结束回合）；空则静默' })
    public actionClickSfx: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '取消按钮点击音；空则静默' })
    public cancelClickSfx: AudioClip | null = null;

    /** UI 点击音播放源（挂在本节点；未配置任何点击音时不创建） */
    private sfxSource: AudioSource | null = null;

    @property({ type: Button, tooltip: '攻击按钮（选中我方棋子后显示；点击进入攻击目标选择）' })
    public attackButton: Button | null = null;

    @property({ type: Color, tooltip: '攻击目标高亮色（含透明度）：可点攻击的格' })
    public attackHighlightColor: Color = new Color(232, 64, 64, 130);

    @property({ type: Color, tooltip: '攻击范围高亮色（含透明度）：可移动格示意，不可点' })
    public attackRangeHighlightColor: Color = new Color(150, 150, 150, 80);

    /** 内存中的战局实时状态；存档 = 序列化它，读档 = 解析成它 */
    private state: BattleState | null = null;

    /** 当前流程阶段（编排层，与数据层 turn.phase 无关） */
    private flowStage: FlowStage = 'generating';

    /** 等距布局缓存：地图 / 棋子 / 高亮 / 拾取共用同一份 */
    private layout: IsoLayout | null = null;

    /** MapRoot 节点缓存：触摸坐标换算的本地空间基准 */
    private mapNode: Node | null = null;

    /** 渲染相机缓存（Canvas.cameraComponent）：触摸"屏幕→世界"换算用 */
    private uiCamera: Camera | null = null;

    /** 交互子状态与选中棋子 */
    private interactStage: InteractStage = 'idle';
    private selectedUnitId: string | null = null;
    /** targeting 阶段的候选动作（执行时原样提交，合法性由 Core 兜底） */
    private targetingActions: UnitAction[] = [];
    /** targeting 的目的模式：移动（蓝高亮）或攻击（红高亮） */
    private targetingMode: 'move' | 'attack' = 'move';

    /** 敌方威胁覆盖层（ThreatRoot 节点；场景按名称自发现，缺失时降级为不显示威胁预告） */
    private threatOverlay: ThreatOverlay | null = null;

    /** 当前关卡条目（levelListAsset 解析所得；结算发奖用） */
    private levelEntry: LevelEntry | null = null;
    /** 解析后的关卡列表（start 解析一次；下一关推进用） */
    private levelList: LevelList | null = null;
    /** 本关开局时的金币（胜利发奖 = 结算后总额 - 开局值，对齐原型杀敌结算） */
    private goldAtStart = 0;
    /** 关间商店面板节点（场景 UI/IntermissionPanel 自发现；缺失时降级为直接开下一关） */
    private intermissionNode: Node | null = null;
    /** 商店面板组件（节点上已挂则复用；否则首次打开时动态 addComponent） */
    private intermissionPanel: IntermissionPanel | null = null;
    /** 布阵确认按钮节点（场景 UI/DeployConfirmButton 自发现） */
    private deployConfirmNode: Node | null = null;
    /** 升级按钮节点（场景 UI/UnitOperationPanel/SkillButton 自发现；选中我方棋子后弹出技能面板） */
    private skillButtonNode: Node | null = null;
    /** 技能面板是否弹出：弹出期间整个操作面板隐藏，升级成功或点击其他位置后关闭 */
    private skillPanelOpen = false;
    /** 布阵阶段已选中的我方单位 id */
    private deploySelection: string | null = null;
    /** 帅增益面板节点（场景 UI/CommanderPanel 自发现；缺失时降级为自动选「生命」保流程可跑） */
    private commanderNode: Node | null = null;
    /** 帅增益面板组件（节点上已挂则复用；否则首次打开时动态 addComponent） */
    private commanderPanel: CommanderPanel | null = null;
    /** 技能成长面板节点（场景 UI/SkillPanel 自发现；缺失时选中棋子无成长入口，仅日志） */
    private skillPanelNode: Node | null = null;
    /** 技能成长面板组件（节点上已挂则复用；否则首次打开时动态 addComponent） */
    private skillPanel: SkillPanel | null = null;

    /** 只读访问当前战局状态（未初始化时为 null） */
    public get battleState(): BattleState | null {
        return this.state;
    }

    /** 当前流程阶段 */
    public get stage(): FlowStage {
        return this.flowStage;
    }

    start(): void {
        // 开局保证操作面板收起（不依赖场景初始显隐）；点击棋子时由 syncOperationPanel 弹出
        this.syncOperationPanel();
        if (!this.levelListAsset) {
            error('[GameManager] 未配置 levelListAsset：请把 resources/Levels 下的 level-list.json 拖到该属性');
            return;
        }
        if (!this.mapBuilder) {
            error('[GameManager] 未配置 mapBuilder：请把 MapRoot 拖到该属性');
            return;
        }
        if (!this.unitBuilder) {
            error('[GameManager] 未配置 unitBuilder：请把 UnitRoot 拖到该属性');
            return;
        }
        // UI 点击音播放源（短音效 playOneShot，不打断 BGM）
        if (this.actionClickSfx || this.cancelClickSfx) {
            this.sfxSource = this.node.addComponent(AudioSource);
            this.sfxSource.playOnAwake = false;
        }

        // turnEndButton 为可选：未配置时我方回合自动快过（调试兜底），不阻止地图生成
        if (!this.turnEndButton) {
            warn('[GameManager] 未配置 turnEndButton：我方回合将自动快过（调试模式）。请把结束回合按钮拖到该属性后点按才生效');
        } else {
            this.turnEndButton.node.on(Button.EventType.CLICK, this.onTurnEndClicked, this);
        }

        // 棋种定义内建于 Core（KIND_DEFS，v2 起不再加载 unit-defs.json）

        // 交互按钮 / 高亮层：缺失只降级并警告，不阻止地图生成
        if (!this.actionButton || !this.cancelButton) {
            warn('[GameManager] 未配置 actionButton/cancelButton：棋子交互不可用。请在 Canvas 下建「行动」「取消」按钮并拖到该属性');
        } else {
            this.actionButton.node.on(Button.EventType.CLICK, this.onActionClicked, this);
            this.cancelButton.node.on(Button.EventType.CLICK, this.onCancelClicked, this);
        }
        if (!this.attackButton) {
            warn('[GameManager] 未配置 attackButton：无法攻击。请在 Canvas 下建「攻击」按钮并拖到该属性');
        } else {
            this.attackButton.node.on(Button.EventType.CLICK, this.onAttackClicked, this);
        }
        if (!this.highlighter) {
            warn('[GameManager] 未配置 highlighter：看不到可走格高亮。请建 HighlightRoot（挂 MoveHighlighter，置于 MapRoot 与 UnitRoot 之间）并拖到该属性');
        }
        if (!this.unitInfoPanel) {
            warn('[GameManager] 未配置 unitInfoPanel：点击棋子不显示信息。请在 Canvas 下建 UnitInfoPanel（挂 UnitInfoPanel 组件）并拖到该属性');
        }

        // 触摸监听挂在 Canvas（GameRoot 的父级）：地块/棋子/空白点击都会派发到它；
        // UI 按钮点击在 onBoardTouchEnd 内按命中祖先链过滤，不会误触棋盘逻辑。
        const canvas = this.findCanvas();
        if (canvas) {
            canvas.on(Node.EventType.TOUCH_END, this.onBoardTouchEnd, this);
            this.uiCamera = canvas.getComponent(Canvas)?.cameraComponent ?? null;
            if (!this.uiCamera) {
                warn('[GameManager] Canvas 未配置渲染相机：触摸换算退回 UI 坐标，可能与视口错位');
            }
        } else {
            error('[GameManager] 未找到 Canvas 节点：棋子交互不可用');
        }

        // P2 关间商店 / 布阵确认：按名称在 Canvas/UI 下自发现（ThreatRoot 同款约定），缺失降级。
        // 商店组件不依赖场景序列化挂载：openIntermission 首次打开时动态 addComponent（编辑器无需手动挂）。
        const uiRoot = canvas ? canvas.getChildByName('UI') : this.node.parent?.getChildByName('UI') ?? null;
        this.intermissionNode = uiRoot?.getChildByName('IntermissionPanel') ?? null;
        this.intermissionPanel = this.intermissionNode?.getComponent(IntermissionPanel) ?? null;
        if (!this.intermissionNode) {
            warn('[GameManager] 未找到 IntermissionPanel：过关后无商店，直接开下一关。请在 Canvas/UI 下建 IntermissionPanel（子节点 GoldLabel/RosterLabel/四买按钮/StartDeployButton）');
        }
        this.deployConfirmNode = uiRoot?.getChildByName('DeployConfirmButton') ?? null;
        if (!this.deployConfirmNode) {
            warn('[GameManager] 未找到 DeployConfirmButton：布阵无法确认开战。请在 Canvas/UI 下建 DeployConfirmButton（挂 Button，子 Label「开始战斗」）');
        } else {
            this.deployConfirmNode.active = false;
            this.deployConfirmNode.on(Button.EventType.CLICK, this.onDeployConfirmClicked, this);
        }
        // 升级按钮：UnitOperationPanel 内第四按钮（缺失时选中棋子无技能入口，仅日志）
        const skillButton = uiRoot?.getChildByName('UnitOperationPanel')?.getChildByName('SkillButton') ?? null;
        if (!skillButton || !skillButton.getComponent(Button)) {
            warn('[GameManager] 未找到 UnitOperationPanel/SkillButton：选中棋子后无升级入口。请在操作面板下加 SkillButton（挂 Button，子 Label「升级」）');
        } else {
            this.skillButtonNode = skillButton;
            skillButton.active = false;
            skillButton.on(Button.EventType.CLICK, this.onSkillClicked, this);
        }
        // P3 帅增益面板：按名称自发现（缺失时布阵确认后自动选「生命」降级，不卡流程）
        this.commanderNode = uiRoot?.getChildByName('CommanderPanel') ?? null;
        this.commanderPanel = this.commanderNode?.getComponent(CommanderPanel) ?? null;
        if (!this.commanderNode) {
            warn('[GameManager] 未找到 CommanderPanel：布阵确认后将自动选「生命」增益。请在 Canvas/UI 下建 CommanderPanel（子节点 TitleLabel/BuffHealthButton/BuffMoveButton/BuffRescueButton）');
        } else {
            this.commanderNode.active = false;
        }
        // P3 技能成长面板：按名称自发现（缺失时选中棋子无成长入口，仅日志）
        this.skillPanelNode = uiRoot?.getChildByName('SkillPanel') ?? null;
        this.skillPanel = this.skillPanelNode?.getComponent(SkillPanel) ?? null;
        if (!this.skillPanelNode) {
            warn('[GameManager] 未找到 SkillPanel：选中棋子无技能成长入口。请在 Canvas/UI 下建 SkillPanel（子节点 TitleLabel/ListRoot）');
        } else {
            this.skillPanelNode.active = false;
        }

        // 关卡列表：配置表决定"有哪些关"，存档决定"这次进哪关"（currentLevelId 非法回落第 1 关）
        let levelList: LevelList;
        try {
            levelList = parseLevelList(this.levelListAsset.json);
        } catch (err) {
            error(`[GameManager] 关卡列表非法，启动中止 —— ${(err as Error).message}`);
            return;
        }
        this.levelList = levelList;
        const profile = loadProfile();
        const requested = profile.currentLevelId;
        const entry = (requested ? getLevelEntry(levelList.levels, requested) : undefined) ?? levelList.levels[0];
        if (!entry) {
            error(`[GameManager] 关卡 "${requested ?? '(空)'}" 不在列表中，启动中止`);
            return;
        }
        this.levelEntry = entry;
        log(`[GameManager] 载入关卡：${entry.name}（${entry.id}）`);

        // 战局 JSON 按约定动态加载：resources/Levels/<file ?? id>.json
        const fileName = entry.file ?? entry.id;
        resources.load(`Levels/${fileName}`, JsonAsset, (err, asset) => {
            if (err || !asset) {
                error(`[GameManager] 关卡战局加载失败：Levels/${fileName} —— ${err ? err.message : '资源为空'}`);
                return;
            }
            let state: BattleState;
            try {
                // P1：战役关走 constructLevel 链（队伍底册延续 + 双快照）；演练关保持 startBattle。
                // P2：constructLevel 产出 deploy 态，由 initializeBattle 进入布阵交互（不再自动确认）。
                state = entry.id.startsWith('fixture')
                    ? startBattle(asset.json)
                    : this.beginCampaignLevel(entry, levelList, profile, asset.json);
            } catch (parseErr) {
                error(`[GameManager] 战局数据非法，启动中止 —— ${(parseErr as Error).message}`);
                return;
            }
            this.goldAtStart = state.gold ?? 0;
            this.state = state;
            this.initializeBattle(state);
        });
    }

    /**
     * P1 战役关开局（对齐原型 constructLevel）：
     * - 存档带队伍底册 → campaignSourceFrom 还原战役源续打（金币/队伍/关卡号）；
     * - 否则按模板新开（playerTemplate 五人组）；
     * - constructLevel 产出 deploy 态（P2 起由布阵交互确认开战）。
     */
    private beginCampaignLevel(entry: LevelEntry, levelList: LevelList, profile: ReturnType<typeof loadProfile>, json: unknown): BattleState {
        const levelNo = levelList.levels.indexOf(entry) + 1;
        const hasParty = !!profile.party && profile.party.length > 0;
        const source = hasParty
            ? campaignSourceFrom({
                version: 1,
                unlockedLevel: levelNo,
                level: levelNo,
                gold: profile.gold,
                party: profile.party!,
                activeIds: profile.activeIds ?? [],
                bench: profile.bench ?? [],
            })
            : null;
        return constructLevel(source, json as never, { levelNo });
    }

    /** 战局数据就绪后的统一初始化：布局 → 隐藏按钮 → 建图 → 建棋子 → 进回合循环 */
    private initializeBattle(state: BattleState): void {
        this.mapNode = this.mapBuilder!.node;
        this.layout = this.mapBuilder!.makeLayout(state);

        // 威胁覆盖层按名称自发现（ResultPanel 同款约定）；须排在 MapRoot 之后、UnitRoot 之前
        const threatNode = this.node.getChildByName('ThreatRoot') ?? null;
        threatNode?.setSiblingIndex(1);
        this.threatOverlay = threatNode?.getComponent(ThreatOverlay) ?? null;
        if (!this.threatOverlay) {
            warn('[GameManager] 未找到 ThreatRoot：看不到敌方威胁预告。请在 GameRoot 下建 ThreatRoot（挂 ThreatOverlay，置于 MapRoot 与 UnitRoot 之间）');
        }

        // 初始隐藏按钮（生成阶段 / 敌方回合不显示）
        this.updateButton();
        this.updateActionButtons();

        // 地图逐块落下完成后，再生成棋子；deploy 态进布阵交互，否则进回合循环
        this.mapBuilder!.buildMap(state, () => {
            this.unitBuilder!.buildUnits(state, this.layout!);
            if (state.turn.phase === 'deploy') {
                this.enterDeployPhase();
            } else {
                this.beginFlow();
            }
        });
        // 落块动画开始前就取景（buildMap 同步建块，位置已定）：全战斗都在 fit 视角下进行，
        // 避免"原比例先大后缩"的生硬镜头变化
        this.getComponent(BoardCamera)?.fitToContent();
    }

    /** 关卡生成完毕后进入回合循环 */
    private beginFlow(): void {
        if (!this.state) return;
        this.enterTurn();
    }

    /** 进入新一轮：先胜负判定，重置我方行动额度，然后进入敌方准备（US-006 回合合同 2.1.1） */
    private enterTurn(): void {
        if (!this.state || this.flowStage === 'ended') return;

        const outcome = checkTerminal(this.state);
        if (outcome) {
            this.enterEnded(outcome);
            return;
        }

        resetAllTurns(this.state); // 敌方无额度概念（意图驱动），只重置我方
        if (this.layout) {
            this.unitBuilder?.syncCorpseViews(this.state, this.layout); // 回合开局对齐尸体（波次入场/救援后的变化）
            this.unitBuilder?.syncNewUnits(this.state, this.layout); // 第二波入场 / 复活的新单位补建视图（P6）
        }
        this.flowStage = 'enemyPrep';
        this.updateButton();
        log(`[流程] 第 ${this.state.turn.round} 轮 — 敌方准备`);
        this.scheduleOnce(() => this.startEnemyPrep(), this.aiDelay);
    }

    /** 步进间隔：不小于敌方停留时长与移动动画时长，保证动画播完再走下一步 */
    private stepInterval(): number {
        const moveDuration = this.unitBuilder ? this.unitBuilder.unitMoveDuration : 0.2;
        return Math.max(this.enemySettleDelay, moveDuration + 0.05);
    }

    /** 敌方准备：逐个播放准备移动，全部完成后冻结意图并交给玩家（合同 2.1.1-2.1.3） */
    private startEnemyPrep(): void {
        if (!this.state || !this.layout || this.flowStage !== 'enemyPrep') return;
        const moves = planEnemyPrep(this.state);
        let index = 0;
        const step = (): void => {
            if (!this.state || !this.layout || this.flowStage !== 'enemyPrep') return;
            if (index >= moves.length) {
                try {
                    this.state.intents = generateIntents(this.state);
                    this.refreshThreats();
                } catch (e) {
                    // 防御：冻结失败也必须把回合交回玩家，绝不卡死在敌方阶段
                    error(`[敌方阶段] 意图冻结异常：${e}`);
                    this.state.intents = [];
                    this.threatOverlay?.clear();
                }
                this.flowStage = 'playerTurn';
                this.updateButton();
                const intents = this.state.intents ?? [];
                const attackCount = intents.filter((i) => i.type !== 'standby').length;
                log(`[流程] 敌方意图已冻结（${attackCount} 个攻击 / ${intents.length - attackCount} 个待机），轮到我方`);
                if (!this.turnEndButton) {
                    // 调试兜底：未配置结束回合按钮时自动快过
                    this.scheduleOnce(() => this.endCurrentTurn(), this.aiDelay);
                }
                return;
            }
            const move = moves[index++];
            try {
                if (move.ready || applyPrepMove(this.state, move.unitId, move.to)) {
                    if (!move.ready) {
                        this.unitBuilder?.moveUnitView(move.unitId, move.to.x, move.to.y, this.layout, this.state);
                    }
                    log(`[敌方] ${move.unitId} 准备移动 (${move.from.x},${move.from.y})→(${move.to.x},${move.to.y})：${move.reason}`);
                } else {
                    warn(`[敌方] 准备移动被拒绝（跳过）：${move.unitId} → (${move.to.x},${move.to.y})`);
                }
            } catch (e) {
                error(`[敌方阶段] 准备移动异常（${move.unitId}）：${e}`);
            }
            // 注意：必须用新闭包调度——重复调度同一函数引用会被调度器去重，链路会断
            this.scheduleOnce(() => step(), this.stepInterval());
        };
        step();
    }

    /** 我方结束回合后：按冻结顺序逐个执行敌方攻击（合同 2.1.5 / 2.3） */
    private runEnemyAttackPhase(): void {
        if (!this.state || this.flowStage !== 'enemyAttack') return;
        const intents = this.state.intents ?? [];
        let index = 0;
        const step = (): void => {
            if (!this.state || this.flowStage !== 'enemyAttack') return;
            if (index >= intents.length) {
                this.finishEnemyAttack();
                return;
            }
            const intent = intents[index++];
            try {
                const effect = applyEnemyIntent(this.state, intent);
                this.presentIntentEffect(intent, effect);
            } catch (e) {
                // 防御：单意图结算异常不中断回合序列，红字日志供定位真因
                error(`[敌方阶段] 意图结算异常（${intent.actorId}）：${e}`);
            }
            if (this.checkBattleEnd()) return; // 帅阵亡 / 敌将死：立即停止后续动作（合同 2.4）
            // 注意：必须用新闭包调度——重复调度同一函数引用会被调度器去重，链路会断
            this.scheduleOnce(() => step(), this.stepInterval());
        };
        this.scheduleOnce(step, this.aiDelay);
    }

    /** 敌方攻击全部结算完毕：清意图、进下一轮；第 11 轮打完即坚守胜利 */
    private finishEnemyAttack(): void {
        if (!this.state) return;
        if (this.checkBattleEnd()) return;
        this.state.intents = [];
        this.threatOverlay?.clear();
        if (this.state.turn.round >= CONFIG.maxRounds) {
            this.enterEnded({ winner: 'player', reason: `第 ${CONFIG.maxRounds} 轮坚守终局` });
            return;
        }
        const advanced = advanceTurn(this.state);
        if (advanced === this.state) {
            // 防御：phase 异常导致推进被拒时按原节奏继续（不卡回合循环）
            this.enterTurn();
            return;
        }
        this.state = advanced;
        if (this.state.turn.phase === 'rescue') {
            this.enterRescuePhase();
            return;
        }
        this.enterTurn();
    }

    /** 救援阶段（P6）：提示点选我方棋子救活（或尸体格复活）；选完由 Core 进第二波并回到回合循环 */
    private enterRescuePhase(): void {
        if (!this.state) return;
        this.flowStage = 'rescuePhase';
        this.cancelSelection();
        this.updateButton();
        log('[流程] 救援阶段：点选一名队友救援（或其尸体格复活）');
        this.floatHint({ x: 4, y: 4 }, '选择队友救援', new Color(120, 220, 160, 255));
    }

    /** 救援阶段棋盘点击（P6）：Core.rescue 校验并迁移；成功后同步尸体/新单位视图并回回合循环 */
    private onRescueTap(grid: GridPos): void {
        if (!this.state || !this.layout) return;
        const live = unitAt(this.state, grid.x, grid.y);
        const targetId = (live && live.side === 'player' && live.kind !== 'king' && live.kind !== 'advisor')
            ? live.id
            : corpseAt(this.state, grid.x, grid.y)?.unit?.id;
        if (!targetId) {
            log('[流程] 救援阶段：请点选我方棋子（非帅）或其尸体格');
            return;
        }
        const next = rescue(this.state, targetId);
        if (next === this.state) {
            warn('[流程] 救援不可用（无 buff / 已用 / 目标不合法）');
            return;
        }
        this.state = next;
        this.floatHint(grid, '救援成功', new Color(120, 220, 160, 255));
        this.unitBuilder?.syncCorpseViews(this.state, this.layout); // 被复活者的尸体消失
        this.unitBuilder?.syncNewUnits(this.state, this.layout); // 尸体复活 → 补建棋子视图
        this.enterTurn();
    }

    /** 按当前局面刷新威胁预告（预测与执行共用 applyAction 语义；玩家每次行动后调用） */
    private refreshThreats(): void {
        if (!this.state || !this.layout) return;
        const marks: ThreatMark[] = (this.state.intents ?? []).map((intent) => {
            const forecast = simulateIntent(this.state!, intent);
            const attacker = this.state!.units.find((u) => u.id === intent.actorId);
            return {
                actorId: intent.actorId,
                order: intent.order,
                // 预测失效（cancelled）在威胁层按 invalid 处理：不画有效威胁
                status: forecast.status === 'cancelled' ? 'invalid' : forecast.status,
                fromPos: attacker ? { x: attacker.x, y: attacker.y } : null,
                toPos: intent.type === 'standby' ? null : intentTarget(this.state!, intent),
                path: forecast.effect?.path ?? intent.path ?? [],
            };
        });
        this.threatOverlay?.show(marks, this.layout);
    }

    /** 敌方意图结算的表现投影：受击抖动 / 阵亡销毁 / 结算浮字与日志（视图层零逻辑） */
    private presentIntentEffect(intent: { order: number; actorId: string }, result: EnemyIntentEffect): void {
        const label = `第 ${intent.order} 序 ${intent.actorId}`;
        if (result.status === 'success' && result.effect) {
            const effect = result.effect;
            if (!effect.actorDead) {
                // 敌方冲锋/攻击落点同样以结算后的实际位置为准
                const actorNow = this.state!.units.find((u) => u.id === effect.actor);
                if (actorNow) {
                    this.unitBuilder?.moveUnitView(effect.actor, actorNow.x, actorNow.y, this.layout!, this.state);
                }
            }
            if (effect.pushed) {
                this.unitBuilder?.moveUnitView(effect.pushed.id, effect.pushed.to.x, effect.pushed.to.y, this.layout!, this.state);
            }
            const shaken = new Set<string>();
            for (const h of effect.hits) {
                const dead = effect.landings?.find((l) => l.id === h.id)?.dead;
                if (dead) {
                    this.unitBuilder?.removeUnitView(h.id);
                    log(`[敌方] ${label} 击杀 ${h.id}`);
                } else {
                    this.unitBuilder?.shakeUnitView(h.id);
                    shaken.add(h.id);
                    log(`[敌方] ${label} 命中 ${h.id}，HP ${h.before}→${h.before - h.damage}`);
                }
            }
            for (const v of effect.victims) {
                if (!shaken.has(v)) {
                    this.unitBuilder?.removeUnitView(v);
                    log(`[敌方] ${label} 击杀 ${v}`);
                }
            }
            if (this.layout && this.state) {
                this.unitBuilder?.syncCorpseViews(this.state, this.layout); // 敌方击杀留尸 / 推尸（P5）
                for (const m of effect.mountains ?? []) {
                    this.mapBuilder?.refreshMountainDecor(m.x, m.y, terrainAt(this.state.map, m.x, m.y)); // 敌方炮碎山
                }
            }
            return;
        }
        if (result.status === 'miss') {
            log(`[敌方] ${label} ${result.reason ?? '落空'}`);
            this.floatHint(result.to, '落空', new Color(205, 165, 255, 255));
        } else if (result.status === 'cancelled') {
            log(`[敌方] ${label} 攻击失效：${result.reason}`);
            this.floatHint(result.to, `失效：${result.reason ?? ''}`, new Color(255, 176, 90, 255));
        } else if (result.status === 'standby') {
            log(`[敌方] ${label} 待机`);
        } else if (result.status === 'removed') {
            log(`[敌方] ${label} 已阵亡，跳过`);
        }
    }

    /**
     * 敌方行动头顶浮字（M0 占位表现）：指定格上方生成临时 Label，上浮一小段后自毁。
     * 挂在 GameRoot 下（与 MapRoot/UnitRoot 同坐标系，gridToIso 直接可用）；
     * 纯 Label 无纹理依赖，创建/销毁零残留。
     */
    private floatHint(cell: GridPos | null, text: string, color: Color): void {
        if (!cell || !this.layout || !this.state) return;
        const { isoX, isoY } = gridToIso(cell.x, cell.y, this.layout);
        const surfaceY = isoY - surfaceDropAt(this.state, cell.x, cell.y, this.layout); // 浮字跟水面走
        const node = new Node(`enemy_hint_${cell.x}_${cell.y}`);
        this.node.addChild(node);
        node.setPosition(isoX, surfaceY + this.layout.halfTileH * 1.6, 0);
        node.setSiblingIndex(this.node.children.length - 1); // 浮字置顶
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 24;
        label.isBold = true;
        label.color = color;
        tween(node)
            .by(0.9, { position: new Vec3(0, 34, 0) }, { easing: 'quadOut' })
            .delay(0.25)
            .call(() => node.destroy())
            .start();
    }

    /** 点「结束回合」按钮：点击音 + 推进回合（AI 自动快过走 scheduleOnce 直调，不播音） */
    private onTurnEndClicked(): void {
        this.playSfx(this.actionClickSfx);
        this.endCurrentTurn();
    }

    /** 播放 UI 点击音（playOneShot 短音效；未配置音效/播放源时静默降级） */
    private playSfx(clip: AudioClip | null): void {
        if (clip && this.sfxSource) {
            this.sfxSource.playOneShot(clip, 1);
        }
    }

    /** 我方结束回合：清除交互态后进入敌方按序攻击阶段（US-006：回合恒在我方，不再轮换） */
    public endCurrentTurn(): void {
        if (!this.state || this.flowStage !== 'playerTurn') return;
        this.cancelSelection(); // 回合切换不残留选中 / 高亮 / 交互按钮
        this.threatOverlay?.clear();
        this.flowStage = 'enemyAttack';
        this.updateButton();
        this.runEnemyAttackPhase();
    }

    /** 按当前阶段切换回合按钮显示：仅我方回合显示 */
    private updateButton(): void {
        if (this.turnEndButton) {
            this.turnEndButton.node.active = this.flowStage === 'playerTurn';
        }
    }

    /** 按交互子状态切换行动/取消按钮：selected → 行动+攻击+升级，targeting → 取消；无额度的按钮置灰 */
    private updateActionButtons(): void {
        const selected = this.interactStage === 'selected' && !this.skillPanelOpen; // 技能面板弹出期间隐藏操作按钮组
        if (this.actionButton) {
            this.actionButton.node.active = selected;
        }
        if (this.attackButton) {
            this.attackButton.node.active = selected;
        }
        if (this.skillButtonNode) {
            this.skillButtonNode.active = selected;
        }
        if (this.cancelButton) {
            this.cancelButton.node.active = this.interactStage === 'targeting';
        }
        this.syncOperationPanel();
        if (!selected) {
            // 非 selected 态按钮隐藏；恢复可点，避免下次显示时残留置灰
            if (this.actionButton) this.actionButton.interactable = true;
            if (this.attackButton) this.attackButton.interactable = true;
            return;
        }
        // 额度门控：选中棋子无任何可用额度（ap / 车炮双槽）时置灰。
        // 升级按钮不置灰：始终可点，面板内展示「缺 x SP / 已满」（用户交互定稿）
        const unit = this.state?.units.find((u) => u.id === this.selectedUnitId);
        const hasAp = !!unit && unitHasAp(unit);
        if (this.actionButton) {
            this.actionButton.interactable = hasAp;
        }
        if (this.attackButton) {
            this.attackButton.interactable = hasAp;
        }
    }

    /** 清除选中态：回 idle，清高亮与交互按钮（落子 / 点空白 / 回合切换共用） */
    private cancelSelection(): void {
        this.interactStage = 'idle';
        this.selectedUnitId = null;
        this.targetingActions = [];
        this.targetingMode = 'move';
        this.highlighter?.clear();
        this.updateActionButtons();
        this.hideUnitInfo();
        this.skillPanelOpen = false;
        this.skillPanel?.hide();
    }

    // ---------- 棋盘触摸拾取 ----------

    /**
     * 棋盘触摸：只取触点坐标做拾取，不依赖点中的节点——
     * 触点 → 世界点 → MapRoot 本地点（世界矩阵的逆，自动吸收容器平移/缩放）→ 逆等距 → 逻辑格。
     * targeting 阶段只认格子（旗子矩形不参与命中，避免旗身遮挡可走格）。
     */
    private onBoardTouchEnd(event: EventTouch): void {
        // 拖拽/捏合/惯性期间的抬起不算点选（手势消歧在 BoardCamera；同节点组件直接取用）
        if (this.getComponent(BoardCamera)?.suppressTap(event.touch ? event.touch.getID() : -1)) return;
        if (!this.state || !this.layout) return;
        if (this.isUiTap(event.target)) return;

        const screen = event.getLocation();
        const world = this.touchToWorld(event);
        const local = this.worldToMapLocal(world);
        // 触点在「顶面中心空间」（可见菱形），isoToGrid 锚在「画布中心空间」：
        // 先减去顶面偏移换算回画布空间再逆映射，否则 ~72% 菱形面积会解析到后方邻格（实测踩坑）。
        const grid = isoToGrid(local.x, local.y, this.layout, CONFIG.width, CONFIG.height);
        if (this.debugPick) {
            const where = grid ? `格(${grid.x},${grid.y})` : '界外';
            log(`[拾取] 屏幕(${screen.x.toFixed(0)},${screen.y.toFixed(0)}) → 世界(${world.x.toFixed(0)},${world.y.toFixed(0)}) → 本地(${local.x.toFixed(0)},${local.y.toFixed(0)}) → ${where}`);
        }

        // P2 布阵交互：点我方单位选中 → 点合法格落位（在 playerTurn 门控之前）
        if (this.flowStage === 'deploy') {
            this.onDeployTap(local.x, local.y, grid);
            return;
        }

        // P6 救援阶段：点我方棋子（非帅士）或其尸体格救援（在 playerTurn 门控之前）
        if (this.flowStage === 'rescuePhase') {
            if (grid) {
                this.onRescueTap(grid);
            }
            return;
        }

        // US-006：仅我方回合响应棋盘（准备/攻击阶段输入屏蔽，威胁已整格预告在棋盘上）
        const canOperate = this.flowStage === 'playerTurn';
        if (!canOperate) return;

        // 技能面板弹出期间点击棋盘：先关面板。点中棋子则继续走下方切换选中；点空白/地块只关面板、
        // 保持当前选中态（否则会落入取消选中路径，操作面板回不来——用户交互定稿）
        if (this.skillPanelOpen) {
            this.closeSkillPanel();
            const tappedId = this.unitBuilder?.hitUnitAt(local.x, local.y, this.state.units);
            if (!tappedId) return;
        }

        if (this.interactStage !== 'targeting') {
            // 棋子命中（旗子内容矩形，地图本地空间）：查看信息（任意棋子）/ 选中（仅我方回合）
            const unitId = this.unitBuilder?.hitUnitAt(local.x, local.y, this.state.units);
            if (unitId) {
                if (this.debugPick) log(`[拾取] 命中棋子 ${unitId}`);
                this.onUnitClicked(unitId); // 敌方棋子内部忽略；我方棋子进入选中态
                this.showUnitInfo(unitId); // 放最后：保证面板显示最新点中的棋子
                return;
            }
        }

        if (grid) {
            this.onTileClicked(grid.x, grid.y);
            // 非 targeting 态的非棋子点击一律收起信息面板（targeting 保留：点非可走格忽略的决策）
            if (this.interactStage !== 'targeting') this.hideUnitInfo();
            return;
        }
        this.onBlankClicked();
    }

    /**
     * 触点 → 世界点：经渲染相机的 screenToWorld 换算（"屏幕→世界"唯一接缝）。
     * getUILocation 基于设计分辨率左下角，实际视口宽高比与设计分辨率不一致时会整体偏移（实测踩坑）；
     * getLocation 基于实际运行时屏幕，经渲染相机换算与渲染结果严格一致。
     */
    private touchToWorld(event: EventTouch): Vec3 {
        const screen = event.getLocation();
        if (this.uiCamera) {
            return this.uiCamera.screenToWorld(new Vec3(screen.x, screen.y, 0));
        }
        const ui = event.getUILocation();
        return new Vec3(ui.x, ui.y, 0);
    }

    /** 世界点 → MapRoot 本地点：用 MapRoot 世界矩阵的逆，缩放/平移（未来视角系统）自动被吸收 */
    private worldToMapLocal(world: Vec3): Vec3 {
        const out = new Vec3();
        if (this.mapNode) {
            Vec3.transformMat4(out, world, this.mapNode.worldMatrix.clone().invert());
        }
        return out;
    }

    /** 命中节点或其祖先落在交互按钮上时不算棋盘点击（按钮自身逻辑照常触发） */
    private isUiTap(target: Node | null): boolean {
        // 操作面板容器（背板）也算 UI：点面板空白/信息区不透传到棋盘
        const uiNodes = [this.turnEndButton?.node, this.actionButton?.node, this.attackButton?.node, this.cancelButton?.node, this.deployConfirmNode, this.skillButtonNode, this.commanderNode, this.skillPanelNode, this.unitInfoPanel?.node.parent ?? null];
        let node: Node | null = target;
        while (node) {
            if (uiNodes.indexOf(node) !== -1) return true;
            node = node.parent;
        }
        return false;
    }

    /** 向上找到 Canvas 节点（触摸监听挂载点） */
    private findCanvas(): Node | null {
        let node: Node | null = this.node;
        while (node) {
            if (node.getComponent(Canvas)) {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    // ---------- 棋子信息面板（占位 UI；查看不分回合） ----------

    /** 显示指定棋子的信息；敌方棋子附带威胁预测行并突出其意图（数据组装在 Core，面板只做显示） */
    private showUnitInfo(unitId: string): void {
        if (!this.state || !this.unitInfoPanel) return;
        const info = getUnitInfo(this.state, unitId);
        if (!info) {
            this.unitInfoPanel.hide();
            this.syncOperationPanel();
            return;
        }
        const threatLines = this.enemyThreatLines(unitId);
        this.threatOverlay?.setFocus(threatLines ? unitId : null);
        this.unitInfoPanel.show(info, threatLines);
        this.syncOperationPanel();
    }

    /** 敌方棋子的威胁预测行（simulateIntent 与执行共用结算语义）；非敌方/无意图返回 undefined */
    private enemyThreatLines(unitId: string): string[] | undefined {
        if (!this.state) return undefined;
        const intent = (this.state.intents ?? []).find((i) => i.actorId === unitId);
        if (!intent) return undefined;
        const forecast = simulateIntent(this.state, intent);
        const lines = [`威胁：第 ${intent.order} 序（共 ${this.state.intents?.length ?? 0} 序）`];
        for (const line of this.describeForecast(forecast, intent.kind)) {
            lines.push(`　${line}`);
        }
        return lines;
    }

    /** 结算预测 → 面板文案（命中含预计伤害与 HP 前后，与实际结算同源） */
    private describeForecast(forecast: EnemyIntentEffect, kind: string): string[] {
        switch (forecast.status) {
            case 'success': {
                const hits = forecast.effect?.hits ?? [];
                const parts = hits.map((h) => {
                    const dead = forecast.effect?.landings?.find((l) => l.id === h.id)?.dead;
                    return `${h.id} HP ${h.before}→${h.before - h.damage}${dead ? '（阵亡）' : ''}`;
                });
                return [`预计命中：${parts.join('、') || kind}`];
            }
            case 'miss':
                return [forecast.reason ?? '落空'];
            case 'cancelled':
                return [`攻击失效：${forecast.reason}`];
            case 'standby':
                return ['待机（当前无合法攻击）'];
            case 'removed':
                return ['攻击者已阵亡'];
            default:
                return ['未执行'];
        }
    }

    /** 收起信息面板（同时撤掉威胁突出） */
    private hideUnitInfo(): void {
        this.unitInfoPanel?.hide();
        this.threatOverlay?.setFocus(null);
        this.syncOperationPanel();
    }

    /**
     * 操作面板容器显隐：选中 / 瞄准 / 查看信息任一状态弹出，idle 收起。
     * 容器 = 信息面板的父节点（场景结构约定：UnitInfoPanel 在 UnitOperationPanel 内），
     * 弹出动画由容器上挂的 PanelPopIn 负责，本方法只做 active 切换。
     */
    private syncOperationPanel(): void {
        const panel = this.unitInfoPanel?.node.parent;
        if (!panel) return;
        // 升级面板弹出期间整个操作面板（含信息面板）隐藏（用户交互定稿）
        panel.active = !this.skillPanelOpen
            && (this.interactStage === 'selected'
                || this.interactStage === 'targeting'
                || this.unitInfoPanel!.node.active);
    }

    // ---------- 交互子状态转移 ----------

    /** 点中棋子：仅我方回合可选我方棋子（本期无限制：任意我方棋子、任意次数） */
    private onUnitClicked(unitId: string): void {
        if (!this.state || this.flowStage !== 'playerTurn') return;
        const unit = this.state.units.find((u) => u.id === unitId);
        if (!unit || unit.side !== 'player') {
            return; // 敌方棋子 / 无效点击忽略
        }
        this.cancelSelection();
        this.selectedUnitId = unitId;
        this.interactStage = 'selected';
        this.updateActionButtons();
        log(`[交互] 选中 ${unitId}（${unit.kind}）`);
    }

    /** 点「升级」按钮（P3/用户交互定稿）：隐藏操作按钮组，弹出选中棋子的技能面板 */
    private onSkillClicked(): void {
        if (!this.state || this.flowStage !== 'playerTurn' || !this.selectedUnitId) return;
        this.skillPanelOpen = true;
        this.updateActionButtons(); // 操作按钮组隐藏
        this.showSkillPanel(this.selectedUnitId);
        log(`[交互] 打开技能面板：${this.selectedUnitId}`);
    }

    /** 关闭技能面板：回到操作按钮组（棋子保持选中态） */
    private closeSkillPanel(): void {
        if (!this.skillPanelOpen) {
            return;
        }
        this.skillPanelOpen = false;
        this.skillPanel?.hide();
        this.updateActionButtons();
    }

    /** 技能成长面板（P3）：列出选中单位的技能项；购买走 Core.purchaseUpgrade（不消耗行动） */
    private showSkillPanel(unitId: string): void {
        const panel = this.ensureSkillPanel();
        if (!panel || !this.state) {
            return;
        }
        const unit = this.state.units.find((u) => u.id === unitId);
        if (!unit || unit.side !== 'player') {
            return;
        }
        panel.onBuy = (skill, index) => this.buySkill(unitId, skill, index);
        const offerings = skillOfferings(this.state, unitId);
        if (!offerings.length) {
            panel.hide();
            return;
        }
        panel.show(`${unit.kind}（${unitId}）`, unit.sp, offerings);
    }

    /** 组件挂载兜底：场景未挂 SkillPanel 组件时动态挂（编辑器无需手动挂组件） */
    private ensureSkillPanel(): SkillPanel | null {
        if (!this.skillPanelNode) {
            return null;
        }
        let panel = this.skillPanelNode.getComponent(SkillPanel);
        if (!panel) {
            panel = this.skillPanelNode.addComponent(SkillPanel);
        }
        this.skillPanel = panel;
        return panel;
    }

    /** 购买技能：Core 迁移成功后刷新面板与棋子外观（转职换图），失败仅提示 */
    private buySkill(unitId: string, skill: string, index?: number): void {
        if (!this.state) {
            return;
        }
        const before = this.state.units.find((u) => u.id === unitId);
        const next = purchaseUpgrade(this.state, unitId, skill, index);
        if (next === this.state) {
            warn(`[成长] ${skill} 不可购买（阶段/SP/上限）`);
            return;
        }
        this.state = next;
        const unit = this.state.units.find((u) => u.id === unitId)!;
        if (before && before.kind !== unit.kind) {
            this.unitBuilder?.refreshUnitKind(unit);
            log(`[成长] ${unitId} 转职 → ${unit.kind}`);
        }
        log(`[成长] ${unitId} 学会 ${skill}${index !== undefined ? `#${index}` : ''}`);
        this.closeSkillPanel(); // 升级完成：面板关闭，回到操作按钮组（用户交互定稿）
    }

    /** 点「行动」：枚举移动类动作 → 高亮目标格，进入目标选择 */
    private onActionClicked(): void {
        this.playSfx(this.actionClickSfx);
        if (!this.state || !this.layout || this.interactStage !== 'selected' || !this.selectedUnitId) return;
        const unit = this.state.units.find((u) => u.id === this.selectedUnitId);
        if (!unit) {
            warn(`[交互] 找不到棋子：${this.selectedUnitId}`);
            return;
        }
        this.targetingActions = legalActions(this.state, unit.id)
            .filter((a) => a.type === 'move' || a.type === 'rook-move');
        if (this.targetingActions.length === 0) {
            log('[交互] 该棋子当前无可走格（可点空白取消选中）');
            return; // 保持 selected，「行动」按钮仍在
        }
        this.targetingMode = 'move';
        this.interactStage = 'targeting';
        this.highlighter?.show([{ cells: this.targetingActions.map((a) => a.to) }], this.layout);
        this.updateActionButtons();
    }

    /**
     * 点「攻击」：枚举攻击类动作（普通攻击 / 敌车冲锋同型 / 弓枪方向攻击 / 炮隔架）→
     * 红色高亮落点格（可点执行），灰色高亮移动格（仅示意范围、不可点）——
     * 无目标时也有可见反馈，避免"像没反应"。
     */
    private onAttackClicked(): void {
        this.playSfx(this.actionClickSfx);
        if (!this.state || !this.layout || this.interactStage !== 'selected' || !this.selectedUnitId) return;
        const unit = this.state.units.find((u) => u.id === this.selectedUnitId);
        if (!unit) {
            warn(`[交互] 找不到棋子：${this.selectedUnitId}`);
            return;
        }
        const all = legalActions(this.state, unit.id);
        const attacks = all.filter((a) => a.type === 'attack' || a.type === 'charge' || a.type === 'directional');
        const moves = all.filter((a) => a.type === 'move' || a.type === 'rook-move');
        if (attacks.length === 0) {
            log('[交互] 攻击范围内没有敌方棋子');
        }
        if (attacks.length === 0 && moves.length === 0) {
            return; // 完全没有合法动作：无从展示，保持 selected，「攻击」按钮仍在
        }
        this.targetingMode = 'attack';
        this.targetingActions = attacks; // 仅红格可点；蓝格点击按「非目标格忽略」处理
        this.interactStage = 'targeting';
        this.highlighter?.show([
            { cells: moves.map((a) => a.to), color: this.attackRangeHighlightColor },
            { cells: attacks.map((a) => a.to), color: this.attackHighlightColor },
        ], this.layout);
        this.updateActionButtons();
    }

    /** 点「取消」：放弃行动，回到选中态（可再点行动 / 改选 / 点空白取消） */
    private onCancelClicked(): void {
        this.playSfx(this.cancelClickSfx);
        if (this.interactStage !== 'targeting') return;
        this.highlighter?.clear();
        this.targetingActions = [];
        this.interactStage = 'selected';
        this.updateActionButtons();
    }

    /** 点中一格：targeting → 判候选动作并执行；selected → 取消选中；idle → 无操作 */
    private onTileClicked(x: number, y: number): void {
        if (this.interactStage === 'targeting' && this.selectedUnitId) {
            const action = this.targetingActions.find((a) => a.to.x === x && a.to.y === y);
            if (!action) return; // 非可走/非攻击目标格忽略（已定决策）
            this.executeAction(action);
            return;
        }
        if (this.interactStage === 'selected') {
            this.cancelSelection();
        }
    }

    /** 点中棋盘外空白：任何非 idle 交互态下取消选中回 idle；信息面板一律收起 */
    private onBlankClicked(): void {
        this.hideUnitInfo();
        if (this.interactStage !== 'idle') {
            this.cancelSelection();
        }
    }

    /**
     * 执行一次动作：Core.submitAction（额度 + 合法性 + revision 校验，深拷贝返回新状态）
     * → 替换状态 → 投影视图（移动/受击/阵亡）→ 刷新威胁预测 → 清交互态 → 即时胜负判定。
     * 山的三态表现（完整→碎→渣淡出）由 refreshMountainDecor 消费 effect.mountains 完成；
     * 山/cracked 顶面与平地同图（山体立体感全部来自装饰），地形切换无需刷新地块贴图。
     */
    private executeAction(action: UnitAction): void {
        if (!this.state || !this.layout) return;
        const result = submitAction(this.state, { ...action, revision: this.state.revision ?? 0 });
        if (!result.effect || !result.action) {
            warn(`[交互] 动作被规则拒绝：${action.actorId} ${action.type} → (${action.to.x}, ${action.to.y})`);
            return;
        }
        this.state = result.state;
        const effect = result.effect;
        if (!effect.actorDead) {
            // 落点以结算后的实际位置为准（冲锋近身/水中断/牵引车不动等，effect.to 仅 move 类可信）
            const actorNow = this.state.units.find((u) => u.id === effect.actor);
            if (actorNow) {
                this.unitBuilder?.moveUnitView(effect.actor, actorNow.x, actorNow.y, this.layout, this.state);
                log(`[交互] ${effect.actor} 行动 → (${actorNow.x}, ${actorNow.y})`);
            }
        }
        if (effect.pushed) {
            // 被震退/被拉的第三方位移（尸体无视图，moveUnitView 内部忽略）
            this.unitBuilder?.moveUnitView(effect.pushed.id, effect.pushed.to.x, effect.pushed.to.y, this.layout, this.state);
        }
        if (effect.pushStatus) {
            const hints: Record<string, string> = {
                pushed: '震退',
                pulled: '牵引',
                water: '落水',
                'water-interrupted': '受阻',
                outside: '出界',
                palace: '宫禁',
                collision: '相撞',
                'collision-mountain': '撞山',
                'collision-corpse': '撞尸',
                corpse: '尸阻',
            };
            this.floatHint(effect.to, hints[effect.pushStatus] ?? effect.pushStatus, new Color(255, 210, 120, 255));
        }
        const shaken = new Set<string>();
        for (const h of effect.hits) {
            const dead = effect.landings?.find((l) => l.id === h.id)?.dead;
            if (dead) {
                this.unitBuilder?.removeUnitView(h.id);
                log(`[战斗] ${effect.actor} 击杀 ${h.id}`);
            } else {
                this.unitBuilder?.shakeUnitView(h.id);
                shaken.add(h.id);
                log(`[战斗] ${effect.actor} 命中 ${h.id}，HP ${h.before}→${h.before - h.damage}`);
            }
        }
        for (const v of effect.victims) {
            if (!shaken.has(v)) {
                this.unitBuilder?.removeUnitView(v);
                log(`[战斗] ${effect.actor} 击杀 ${v}`);
            }
        }
        this.unitBuilder?.syncCorpseViews(this.state, this.layout); // 尸体出现/移动/销毁（P5）
        for (const m of effect.mountains ?? []) {
            this.mapBuilder?.refreshMountainDecor(m.x, m.y, terrainAt(this.state.map, m.x, m.y)); // 山受击三态（完整→碎→渣）
        }
        this.refreshThreats(); // 局面已变：立即刷新敌方意图预测（US-006 §3）
        this.cancelSelection();
        this.checkBattleEnd();
    }

    /** 行动后即时胜负判定：有结果则进入 ended 并返回 true（玩家/AI 行动路径共用；回合开始的判定仍在 enterTurn） */
    private checkBattleEnd(): boolean {
        if (!this.state) return false;
        const outcome = checkTerminal(this.state);
        if (outcome) {
            this.enterEnded(outcome);
            return true;
        }
        return false;
    }

    private enterEnded(outcome: { winner: string; reason: string }): void {
        this.flowStage = 'ended';
        this.updateButton();
        this.threatOverlay?.clear();
        if (this.state) {
            this.state.result = outcome;
        }
        log(`[流程] 战局结束 — 胜者 ${outcome.winner}（${outcome.reason}）`);

        // 结算面板：胜利发奖落档（奖励 = 杀敌结算增量，对齐原型 finishVictory），随后导航
        const panel = this.resultPanelNode?.getComponent(ResultPanel) ?? null;
        if (!panel) {
            warn('[GameManager] 未配置 resultPanelNode：战局已结束但无结算面板。请在 Canvas 下建结算面板（挂 ResultPanel）并拖到该属性');
            return;
        }
        const win = outcome.winner === 'player';
        if (win && this.levelEntry && this.state && !this.levelEntry.id.startsWith('fixture')) {
            const profile = loadProfile();
            const award = Math.max(0, (this.state.gold ?? 0) - this.goldAtStart);
            grantBattleReward(profile, this.levelEntry.id, award);
            profile.party = deepCopy(this.state.party ?? []);
            profile.activeIds = [...(this.state.activeIds ?? [])];
            profile.bench = [...(this.state.bench ?? [])];
            saveProfile(profile);
            const hasNext = !!this.nextCampaignEntry();
            // P2：胜利不再直接开下一关——先进关间商店（购买/调上阵），再开始布阵
            panel.onNext = hasNext ? () => this.openIntermission() : null;
            panel.onRetry = null;
            panel.show('win', award, outcome.reason, { showNext: hasNext });
        } else if (win && this.levelEntry) {
            // 演练关：胜利不发奖（无战役语义），只回选关
            panel.onNext = null;
            panel.onRetry = null;
            panel.show('win', 0, outcome.reason);
        } else if (!outcome.winner) {
            panel.onNext = null;
            panel.onRetry = null;
            panel.show('draw', 0, outcome.reason);
        } else {
            // P1：失败重试 = levelSnapshot 完整回滚（场景内重建，不重载页面）
            panel.onNext = null;
            panel.onRetry = () => this.retryBattle();
            panel.show('lose', 0, outcome.reason, { showRetry: true });
        }
    }

    /** 下一关条目（按列表顺序；无则 null） */
    private nextCampaignEntry(): LevelEntry | null {
        if (!this.levelList || !this.levelEntry) {
            return null;
        }
        const index = this.levelList.levels.findIndex((e) => e.id === this.levelEntry!.id);
        return this.levelList.levels[index + 1] ?? null;
    }

    /** 胜利后进关间商店（P2）：购买直接作用在上一关战局上（phase=intermission，对齐原型 buy 前置） */
    private openIntermission(): void {
        if (!this.state || !this.intermissionNode) {
            // 商店面板缺失：降级为 P1 行为（直接开下一关）
            warn('[GameManager] 无商店面板，跳过购买直接开下一关');
            this.startNextDeploy();
            return;
        }
        this.flowStage = 'intermission';
        this.cancelSelection();
        this.resultPanelNode!.active = false;
        this.threatOverlay?.clear();
        // 组件挂载兜底：场景未挂 IntermissionPanel 时运行时动态挂（编辑器脚本热重载不可用的绕行）
        let panel = this.intermissionNode.getComponent(IntermissionPanel);
        if (!panel) {
            panel = this.intermissionNode.addComponent(IntermissionPanel);
            panel.wire();
        }
        this.intermissionPanel = panel;
        panel.onBuy = (kind) => this.buyInShop(kind);
        panel.onStartDeploy = () => this.startNextDeploy();
        panel.show(this.state.gold ?? 0, this.state.activeIds?.length ?? 0, this.state.bench?.length ?? 0, !!this.nextCampaignEntry());
    }

    /** 商店购买：buyRecruit（pure）失败（金币不足/阶段不对）时原样返回，不刷新 */
    private buyInShop(kind: ShopKind): void {
        if (!this.state || !this.intermissionPanel) {
            return;
        }
        const next = buyRecruit(this.state, kind);
        if (next === this.state) {
            warn(`[商店] 购买 ${kind} 失败：金币不足或当前不可购买`);
            return;
        }
        this.state = next;
        log(`[商店] 购入 ${kind}，余 ${this.state.gold} 金`);
        this.intermissionPanel.refresh(this.state.gold ?? 0, this.state.activeIds?.length ?? 0, this.state.bench?.length ?? 0);
    }

    /** 商店确认 → 加载下一关 constructLevel（deploy 态）→ 重建视图进布阵交互 */
    private startNextDeploy(): void {
        const nextEntry = this.nextCampaignEntry();
        const source = this.state;
        if (!nextEntry || !source) {
            director.loadScene('Home');
            return;
        }
        this.intermissionPanel?.hide();
        const fileName = nextEntry.file ?? nextEntry.id;
        resources.load(`Levels/${fileName}`, JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) {
                error(`[GameManager] 下一关战局加载失败：Levels/${fileName} —— ${err ? err.message : '资源为空'}`);
                director.loadScene('Home');
                return;
            }
            let next: BattleState;
            try {
                next = constructLevel(source, asset.json as LevelSource, { next: true });
            } catch (buildErr) {
                error(`[GameManager] 下一关构造失败 —— ${(buildErr as Error).message}`);
                director.loadScene('Home');
                return;
            }
            this.levelEntry = nextEntry;
            this.goldAtStart = next.gold ?? 0;
            this.state = next;
            log(`[流程] 推进下一关：${nextEntry.name}（${nextEntry.id}）`);
            this.flowStage = 'generating';
            this.rebuildBattleView(this.state);
        });
    }

    /** 布阵阶段：显示确认按钮，等待点选落位（confirmDeployment 后进回合循环） */
    private enterDeployPhase(): void {
        this.flowStage = 'deploy';
        this.cancelSelection();
        this.deploySelection = null;
        this.updateButton();
        this.showDeployHighlights();
        if (this.deployConfirmNode) {
            this.deployConfirmNode.active = true;
        }
        log('[流程] 布阵阶段：点选我方棋子 → 点目标格落位；完成后点「开始战斗」');
    }

    /** 布阵合法格（我方半场 y<river、界内、非山非水非占用；与单位无关，全集展示） */
    private deployLegalCells(): GridPos[] {
        const state = this.state;
        const cells: GridPos[] = [];
        if (!state) {
            return cells;
        }
        for (let y = 0; y < CONFIG.river; y++) {
            for (let x = 0; x < CONFIG.width; x++) {
                const occupied = state.units.some((u) => u.x === x && u.y === y)
                    || (state.corpses ?? []).some((c) => c.x === x && c.y === y);
                if (occupied) {
                    continue;
                }
                const terrain = state.map.tiles[`${x},${y}`];
                if (terrain === 'mountain' || terrain === 'water') {
                    continue;
                }
                cells.push({ x, y });
            }
        }
        return cells;
    }

    private showDeployHighlights(): void {
        this.highlighter?.show([{ cells: this.deployLegalCells() }], this.layout!);
    }

    /** 布阵确认开战：confirmDeployment 校验通过才进回合循环 */
    private onDeployConfirmClicked(): void {
        if (!this.state || this.flowStage !== 'deploy') {
            return;
        }
        const confirmed = confirmDeployment(this.state);
        if (confirmed === this.state) {
            warn('[布阵] 当前布阵不合法（山/水/过河/重叠/帅位），请调整后再开始');
            return;
        }
        this.deployConfirmNode!.active = false;
        this.deploySelection = null;
        this.highlighter?.clear();
        this.state = confirmed;
        this.showCommanderPhase();
    }

    /** 帅增益阶段（P3）：弹三选一面板；缺面板时降级自动选「生命」，选完进回合循环 */
    private showCommanderPhase(): void {
        const state = this.state;
        if (!state || state.turn.phase !== 'commander') {
            this.beginFlow();
            return;
        }
        this.flowStage = 'commander';
        this.updateButton();
        const panel = this.ensureCommanderPanel();
        if (!panel) {
            warn('[GameManager] 无 CommanderPanel：自动选「生命」增益');
            this.pickCommanderBuff('health');
            return;
        }
        panel.setTitle(`第 ${state.level ?? 1} 关 — 选择帅增益`);
        panel.show();
        log('[流程] 帅增益阶段：三选一（生命/机动/救援）');
    }

    /** 组件挂载兜底：场景未挂 CommanderPanel 组件时动态挂（编辑器无需手动挂组件） */
    private ensureCommanderPanel(): CommanderPanel | null {
        if (!this.commanderNode) {
            return null;
        }
        let panel = this.commanderNode.getComponent(CommanderPanel);
        if (!panel) {
            panel = this.commanderNode.addComponent(CommanderPanel);
        }
        panel.onPick = (kind) => this.pickCommanderBuff(kind);
        this.commanderPanel = panel;
        return panel;
    }

    /** 选定帅增益：Core.chooseCommanderBuff 迁移状态（commander → player），随后进回合循环 */
    private pickCommanderBuff(kind: CommanderBuffKind): void {
        if (!this.state || this.state.turn.phase !== 'commander') {
            return;
        }
        const next = chooseCommanderBuff(this.state, kind);
        if (next === this.state) {
            warn(`[GameManager] 增益 ${kind} 未生效（阶段/参数校验拒绝）`);
            return;
        }
        this.state = next;
        this.commanderPanel?.hide();
        log(`[流程] 帅增益已选：${kind}，开战`);
        this.beginFlow();
    }

    /** 布阵阶段棋盘点击：点我方单位（帅除外）选中；再点合法格落位；点空白取消 */
    private onDeployTap(localX: number, localY: number, grid: GridPos | null): void {
        const state = this.state;
        if (!state || !this.layout) {
            return;
        }
        const hitId = this.unitBuilder?.hitUnitAt(localX, localY, state.units) ?? null;
        if (hitId) {
            const hit = state.units.find((u) => u.id === hitId);
            if (hit && hit.side === 'player' && hit.kind !== 'king') {
                this.deploySelection = hitId;
                this.showDeployHighlights();
                log(`[布阵] 已选中 ${hitId}，点目标格落位`);
                return;
            }
        }
        if (grid && this.deploySelection) {
            const next = deployUnit(state, this.deploySelection, grid);
            if (next !== state) {
                this.state = next;
                this.unitBuilder?.moveUnitView(this.deploySelection, grid.x, grid.y, this.layout, this.state);
                log(`[布阵] ${this.deploySelection} → (${grid.x},${grid.y})`);
            } else {
                warn(`[布阵] (${grid.x},${grid.y}) 不可落位（占用/水/越界）`);
            }
        }
        this.deploySelection = null;
        this.showDeployHighlights();
    }

    /** 失败重试：retryLevel 从 levelSnapshot 完整回滚（阵亡/尸体/地形/花销），回布阵交互重排 */
    private retryBattle(): void {
        if (!this.state) {
            return;
        }
        const retry = retryLevel(this.state);
        if (retry === this.state) {
            warn('[GameManager] 当前战局不可重试（无 levelSnapshot 或非失败态）');
            return;
        }
        this.state = retry;
        this.flowStage = 'generating';
        this.rebuildBattleView(this.state);
    }

    /** 场景内重建战局视图（重试 / 下一关共用）：清棋盘与棋子层 → 重新落图 → 落子 → 进回合循环 */
    private rebuildBattleView(state: BattleState): void {
        this.mapBuilder!.node.removeAllChildren();
        this.unitBuilder!.node.removeAllChildren();
        this.threatOverlay?.clear();
        this.cancelSelection();
        this.layout = this.mapBuilder!.makeLayout(state);
        this.updateButton();
        this.updateActionButtons();
        this.mapBuilder!.buildMap(state, () => {
            this.unitBuilder!.buildUnits(state, this.layout!);
            if (state.turn.phase === 'deploy') {
                this.enterDeployPhase();
            } else {
                this.beginFlow();
            }
        });
        this.getComponent(BoardCamera)?.fitToContent();
    }
}
