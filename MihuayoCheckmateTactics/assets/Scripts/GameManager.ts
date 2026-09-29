import { _decorator, AudioClip, AudioSource, Button, Camera, Canvas, Color, Component, EventTouch, JsonAsset, Label, Node, resources, Vec3, error, log, tween, warn } from 'cc';
import { BattlePlayer, BattleState, GridPos, gridToIso, isoToGrid, parseBattleState } from './Core/BattleState';
import { attackUnit, checkOutcome, getCurrentPlayer, moveUnitTo, resetTurn } from './Core/Rules';
import {
    applyIntent,
    findHumanPlayerId,
    findKing,
    generateEnemyIntents,
    isHumanKingDead,
    planEnemyPrep,
    simulateIntents,
    IntentForecast,
} from './Core/EnemyTelegraph';
import { getLevelEntry, LevelEntry, LevelList, parseLevelList } from './Core/LevelConfig';
import { grantBattleReward } from './Core/PlayerProfile';
import { computeReachableCells, ReachableCell } from './Core/movement';
import { UnitDef, getUnitDef, parseUnitDefs } from './Core/UnitDefs';
import { getUnitInfo } from './Core/UnitInfo';
import { BoardCamera } from './Map/BoardCamera';
import { IsoLayout } from './Map/IsoLayout';
import { MapBuilder } from './Map/MapBuilder';
import { MoveHighlighter } from './Map/MoveHighlighter';
import { ThreatOverlay } from './Map/ThreatOverlay';
import { UnitBuilder } from './Unit/UnitBuilder';
import { ResultPanel } from './UI/ResultPanel';
import { UnitInfoPanel } from './UI/UnitInfoPanel';
import { loadProfile, saveProfile } from './UI/ProfileStore';

const { ccclass, property } = _decorator;

/**
 * 战局流程阶段（编排层；与数据层的 turn.phase 区分开）。
 * US-006 预告回合制：回合恒在我方——每轮先敌方准备（enemyPrep）并冻结攻击意图，
 * 再交给我方行动（playerTurn）；我方结束回合后敌方按序执行冻结攻击（enemyAttack），
 * 结算完毕进入下一轮准备。不再有独立的敌方行动回合。
 */
export type FlowStage = 'generating' | 'enemyPrep' | 'playerTurn' | 'enemyAttack' | 'ended';

/** 棋子交互子状态：无选中 → 已选中（显示「行动」）→ 目标选择（显示「取消」+ 高亮可走格） */
export type InteractStage = 'idle' | 'selected' | 'targeting';

/**
 * 战局协调者（M0）：持有内存中的战局状态（唯一事实源），
 * 按流程驱动：关卡生成 → （敌方准备+冻结意图 → 我方回合 → 敌方按序执行 → 下一轮）→ 胜负结束。
 * 我方回合内编排棋子交互：点选 → 行动 → 高亮可走格 → 点格移动 / 取消。
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

    @property({ type: JsonAsset, tooltip: '棋子定义表（unit-defs.json；走法/属性来源）' })
    public unitDefsAsset: JsonAsset | null = null;

    @property({ type: Button, tooltip: '行动按钮（选中我方棋子后显示；点击进入目标选择）' })
    public actionButton: Button | null = null;

    @property({ type: Button, tooltip: '取消按钮（目标选择中显示；点击放弃移动回选中态）' })
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

    @property({ type: Color, tooltip: '攻击目标高亮色（含透明度）：有敌棋的格，可点攻击' })
    public attackHighlightColor: Color = new Color(232, 64, 64, 130);

    @property({ type: Color, tooltip: '攻击范围高亮色（含透明度）：范围内的空格，仅示意不可点' })
    public attackRangeHighlightColor: Color = new Color(150, 150, 150, 80);

    /** 内存中的战局实时状态；存档 = 序列化它，读档 = 解析成它 */
    private state: BattleState | null = null;

    /** 当前流程阶段（编排层，与数据层 turn.phase 无关） */
    private flowStage: FlowStage = 'generating';

    /** 棋子类型定义表（unitDefsAsset 解析结果） */
    private defs: UnitDef[] = [];

    /** 等距布局缓存：地图 / 棋子 / 高亮 / 拾取共用同一份 */
    private layout: IsoLayout | null = null;

    /** MapRoot 节点缓存：触摸坐标换算的本地空间基准 */
    private mapNode: Node | null = null;

    /** 渲染相机缓存（Canvas.cameraComponent）：触摸"屏幕→世界"换算用 */
    private uiCamera: Camera | null = null;

    /** 交互子状态与选中棋子 */
    private interactStage: InteractStage = 'idle';
    private selectedUnitId: string | null = null;
    private targetingCells: ReachableCell[] = [];
    /** targeting 的目的模式：移动（蓝高亮）或攻击（红高亮） */
    private targetingMode: 'move' | 'attack' = 'move';

    /** 敌方威胁覆盖层（ThreatRoot 节点；场景按名称自发现，缺失时降级为不显示威胁预告） */
    private threatOverlay: ThreatOverlay | null = null;

    /** 开局时我方是否布了帅：决定「帅亡立即失败」是否参与判定（无帅关卡不参与） */
    private humanHasKing = false;

    /** 当前关卡条目（levelListAsset 解析所得；结算发奖用） */
    private levelEntry: LevelEntry | null = null;

    /** 只读访问当前战局状态（未初始化时为 null） */
    public get battleState(): BattleState | null {
        return this.state;
    }

    /** 当前流程阶段 */
    public get stage(): FlowStage {
        return this.flowStage;
    }

    /** 当前行动玩家 */
    public get activePlayer(): BattlePlayer | undefined {
        return this.state ? getCurrentPlayer(this.state) : undefined;
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

        // 棋子定义表：交互的前置数据，缺失则中止（走法无从计算）
        if (!this.unitDefsAsset) {
            error('[GameManager] 未配置 unitDefsAsset：请把 Defs 下的 unit-defs.json 拖到该属性');
            return;
        }
        try {
            this.defs = parseUnitDefs(this.unitDefsAsset.json);
        } catch (err) {
            error(`[GameManager] 棋子定义非法，启动中止 —— ${(err as Error).message}`);
            return;
        }

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

        // 关卡列表：配置表决定"有哪些关"，存档决定"这次进哪关"（currentLevelId 非法回落第 1 关）
        let levelList: LevelList;
        try {
            levelList = parseLevelList(this.levelListAsset.json);
        } catch (err) {
            error(`[GameManager] 关卡列表非法，启动中止 —— ${(err as Error).message}`);
            return;
        }
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
                state = parseBattleState(asset.json);
            } catch (parseErr) {
                error(`[GameManager] 战局数据非法，启动中止 —— ${(parseErr as Error).message}`);
                return;
            }
            this.state = state;
            this.initializeBattle(state);
        });
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
        const humanId = findHumanPlayerId(state);
        this.humanHasKing = !!humanId && !!findKing(state, humanId);

        // 初始隐藏按钮（生成阶段 / 敌方回合不显示）
        this.updateButton();
        this.updateActionButtons();

        // 地图逐块落下完成后，再生成棋子；然后进入回合循环
        this.mapBuilder!.buildMap(state, () => {
            this.unitBuilder!.buildUnits(state, this.layout!);
            this.beginFlow();
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

    /** 进入新一轮：先胜负判定，重置双方体力，然后进入敌方准备（US-006 回合合同 2.1.1） */
    private enterTurn(): void {
        if (!this.state || this.flowStage === 'ended') return;

        const outcome = checkOutcome(this.state) ?? this.kingDeathOutcome();
        if (outcome) {
            this.enterEnded(outcome);
            return;
        }

        resetTurn(this.state, this.defs);
        const humanId = findHumanPlayerId(this.state);
        if (humanId) {
            this.state.turn.active = humanId; // 预告回合制：回合恒在我方，敌方嵌入准备/攻击两阶段
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
        const moves = planEnemyPrep(this.state, this.defs);
        let index = 0;
        const step = (): void => {
            if (!this.state || !this.layout || this.flowStage !== 'enemyPrep') return;
            if (index >= moves.length) {
                try {
                    this.state.intents = generateEnemyIntents(this.state, this.defs);
                    this.refreshThreats();
                } catch (e) {
                    // 防御：冻结失败也必须把回合交回玩家，绝不卡死在敌方阶段
                    error(`[敌方阶段] 意图冻结异常：${e}`);
                    this.state.intents = [];
                    this.threatOverlay?.clear();
                }
                this.flowStage = 'playerTurn';
                this.updateButton();
                const attackCount = (this.state.intents ?? []).filter((i) => i.type === 'attack').length;
                log(`[流程] 敌方意图已冻结（${attackCount} 个攻击 / ${(this.state.intents ?? []).length - attackCount} 个待机），轮到我方`);
                if (!this.turnEndButton) {
                    // 调试兜底：未配置结束回合按钮时自动快过
                    this.scheduleOnce(() => this.endCurrentTurn(), this.aiDelay);
                }
                return;
            }
            const move = moves[index++];
            const unit = this.state.units.find((u) => u.id === move.unitId);
            const occupied = this.state.units.some((u) => u.pos.x === move.to.x && u.pos.y === move.to.y);
            try {
                if (unit && !occupied) {
                    unit.pos = { ...move.to }; // 准备移动不扣体力（规划性移动，与原型一致）
                    this.unitBuilder?.moveUnitView(move.unitId, move.to.x, move.to.y, this.layout);
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
                const forecast = applyIntent(this.state, this.defs, intent);
                this.presentIntentEffect(forecast);
            } catch (e) {
                // 防御：单意图结算异常不中断回合序列，红字日志供定位真因
                error(`[敌方阶段] 意图结算异常（${intent.actorId}）：${e}`);
            }
            if (this.checkBattleEnd()) return; // 帅阵亡 / 全灭：立即停止后续动作（合同 2.4）
            // 注意：必须用新闭包调度——重复调度同一函数引用会被调度器去重，链路会断
            this.scheduleOnce(() => step(), this.stepInterval());
        };
        this.scheduleOnce(step, this.aiDelay);
    }

    /** 敌方攻击全部结算完毕：清意图、进入下一轮准备（战斗继续时） */
    private finishEnemyAttack(): void {
        if (!this.state) return;
        if (this.checkBattleEnd()) return;
        this.state.intents = [];
        this.threatOverlay?.clear();
        this.state.turn.round += 1;
        this.enterTurn();
    }

    /** 按当前局面刷新威胁预告（预测与执行共用 applyIntent 语义；玩家每次行动后调用） */
    private refreshThreats(): void {
        if (!this.state || !this.layout) return;
        this.threatOverlay?.show(simulateIntents(this.state, this.defs), this.layout);
    }

    /** 敌方意图结算的表现投影：受击抖动 / 阵亡销毁 / 结算浮字与日志（视图层零逻辑） */
    private presentIntentEffect(forecast: IntentForecast): void {
        const label = `第 ${forecast.intent.order} 序 ${forecast.intent.actorId}`;
        if (forecast.status === 'hit' && forecast.victim) {
            const v = forecast.victim;
            if (v.dies) {
                this.unitBuilder?.removeUnitView(v.unitId);
                log(`[敌方] ${label} 击杀 ${v.unitId}（${forecast.reason ?? '命中'}）`);
            } else {
                this.unitBuilder?.shakeUnitView(v.unitId);
                log(`[敌方] ${label} 命中 ${v.unitId}，HP ${v.hpBefore}→${v.hpAfter}`);
            }
            return;
        }
        if (forecast.status === 'miss') {
            log(`[敌方] ${label} ${forecast.reason ?? '落空'}`);
            this.floatHint(forecast.toPos, '落空', new Color(205, 165, 255, 255));
        } else if (forecast.status === 'invalid') {
            log(`[敌方] ${label} 攻击失效：${forecast.reason}`);
            this.floatHint(forecast.toPos, `失效：${forecast.reason ?? ''}`, new Color(255, 176, 90, 255));
        } else if (forecast.status === 'standby') {
            log(`[敌方] ${label} 待机`);
            this.floatHint(forecast.fromPos, '待机', new Color(255, 255, 255, 255));
        } else if (forecast.status === 'removed') {
            log(`[敌方] ${label} 已阵亡，跳过`);
        }
    }

    /**
     * 敌方行动头顶浮字（M0 占位表现）：指定格上方生成临时 Label，上浮一小段后自毁。
     * 挂在 GameRoot 下（与 MapRoot/UnitRoot 同坐标系，gridToIso 直接可用）；
     * 纯 Label 无纹理依赖，创建/销毁零残留。
     */
    private floatHint(cell: GridPos | null, text: string, color: Color): void {
        if (!cell || !this.layout) return;
        const { isoX, isoY } = gridToIso(cell.x, cell.y, this.layout);
        const node = new Node(`enemy_hint_${cell.x}_${cell.y}`);
        this.node.addChild(node);
        node.setPosition(isoX, isoY + this.layout.halfTileH * 1.6, 0);
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

    /** 「我方帅实际阵亡」独立于关卡条件的即时败北判定（合同 2.4；无帅关卡不参与） */
    private kingDeathOutcome(): { winner: string; reason: string } | null {
        if (!this.state || !this.humanHasKing || !isHumanKingDead(this.state)) return null;
        const humanId = findHumanPlayerId(this.state);
        const enemy = this.state.players.find((p) => p.id !== humanId);
        return { winner: enemy?.id ?? '', reason: '我方帅阵亡' };
    }

    /** 结束当前行动方回合，推进到下一方（结束按钮 / 敌方快过调用） */
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

    /** 按交互子状态切换行动/取消按钮：selected → 行动+攻击，targeting → 取消；体力不足的按钮置灰 */
    private updateActionButtons(): void {
        const selected = this.interactStage === 'selected';
        if (this.actionButton) {
            this.actionButton.node.active = selected;
        }
        if (this.attackButton) {
            this.attackButton.node.active = selected;
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
        // 体力门控：当前选中棋子体力不足以支付对应消耗时置灰（点击由 Button 拦截，规则层仍兜底）
        const unit = this.state?.units.find((u) => u.id === this.selectedUnitId);
        const def = unit ? getUnitDef(this.defs, unit.defId) : undefined;
        const stamina = unit && def ? unit.stamina ?? def.maxStamina : 0;
        if (this.actionButton) {
            this.actionButton.interactable = !!def && stamina >= (def.moveCost ?? 1);
        }
        if (this.attackButton) {
            this.attackButton.interactable = !!def && stamina >= (def.attackCost ?? 1);
        }
    }

    /** 清除选中态：回 idle，清高亮与交互按钮（落子 / 点空白 / 回合切换共用） */
    private cancelSelection(): void {
        this.interactStage = 'idle';
        this.selectedUnitId = null;
        this.targetingCells = [];
        this.targetingMode = 'move';
        this.highlighter?.clear();
        this.updateActionButtons();
        this.hideUnitInfo();
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
        // US-006：仅我方回合响应棋盘（准备/攻击阶段输入屏蔽，威胁已整格预告在棋盘上）
        const canOperate = this.flowStage === 'playerTurn';
        if (!canOperate) return;
        if (this.isUiTap(event.target)) return;

        const screen = event.getLocation();
        const world = this.touchToWorld(event);
        const local = this.worldToMapLocal(world);
        // 触点在「顶面中心空间」（可见菱形），isoToGrid 锚在「画布中心空间」：
        // 先减去顶面偏移换算回画布空间再逆映射，否则 ~72% 菱形面积会解析到后方邻格（实测踩坑）。
        const grid = isoToGrid(local.x, local.y, this.layout, this.state.map.width, this.state.map.height);
        if (this.debugPick) {
            const where = grid ? `格(${grid.x},${grid.y})` : '界外';
            log(`[拾取] 屏幕(${screen.x.toFixed(0)},${screen.y.toFixed(0)}) → 世界(${world.x.toFixed(0)},${world.y.toFixed(0)}) → 本地(${local.x.toFixed(0)},${local.y.toFixed(0)}) → ${where}`);
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
        const uiNodes = [this.turnEndButton?.node, this.actionButton?.node, this.attackButton?.node, this.cancelButton?.node, this.unitInfoPanel?.node.parent ?? null];
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
        const info = getUnitInfo(this.state, unitId, this.defs);
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

    /** 敌方棋子的威胁预测行（simulateIntents 与执行共用结算语义）；非敌方/无意图返回 undefined */
    private enemyThreatLines(unitId: string): string[] | undefined {
        if (!this.state || !this.layout) return undefined;
        const intent = (this.state.intents ?? []).find((i) => i.actorId === unitId);
        if (!intent) return undefined;
        const forecast = simulateIntents(this.state, this.defs).find((f) => f.intent.actorId === unitId);
        if (!forecast) return undefined;
        const lines = [`威胁：第 ${intent.order} 序（共 ${this.state.intents?.length ?? 0} 序）`];
        for (const line of this.describeForecast(forecast)) {
            lines.push(`　${line}`);
        }
        return lines;
    }

    /** 结算预测 → 面板文案（命中含预计伤害与 HP 前后，与实际结算同源） */
    private describeForecast(forecast: IntentForecast): string[] {
        switch (forecast.status) {
            case 'hit': {
                const v = forecast.victim!;
                return [
                    `${forecast.reason ?? '预计命中'}：${v.defId} HP ${v.hpBefore}→${v.hpAfter}${v.dies ? '（阵亡）' : ''}`,
                ];
            }
            case 'miss':
                return [forecast.reason ?? '落空'];
            case 'invalid':
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
        panel.active = this.interactStage === 'selected'
            || this.interactStage === 'targeting'
            || this.unitInfoPanel!.node.active;
    }

    // ---------- 交互子状态转移 ----------

    /** 点中棋子：仅我方回合可选我方棋子（本期无限制：任意我方棋子、任意次数） */
    private onUnitClicked(unitId: string): void {
        if (!this.state || this.flowStage !== 'playerTurn') return;
        const active = this.activePlayer;
        const unit = this.state.units.find((u) => u.id === unitId);
        if (!unit || !active || unit.owner !== active.id) {
            return; // 敌方棋子 / 无效点击忽略
        }
        this.cancelSelection();
        this.selectedUnitId = unitId;
        this.interactStage = 'selected';
        this.updateActionButtons();
        log(`[交互] 选中 ${unitId}（${unit.defId}）`);
    }

    /** 点「行动」：按 defs 计算可走格 → 高亮，进入目标选择 */
    private onActionClicked(): void {
        this.playSfx(this.actionClickSfx);
        if (!this.state || !this.layout || this.interactStage !== 'selected' || !this.selectedUnitId) return;
        const unit = this.state.units.find((u) => u.id === this.selectedUnitId);
        const def = unit ? getUnitDef(this.defs, unit.defId) : undefined;
        if (!unit || !def) {
            warn(`[交互] 找不到棋子或其定义：${this.selectedUnitId}`);
            return;
        }
        // 本期只做移动：吃子格（capture）不显示不响应，攻击是下一功能
        this.targetingCells = computeReachableCells(this.state, unit, def).filter((cell) => !cell.capture);
        if (this.targetingCells.length === 0) {
            log('[交互] 该棋子当前无可走格（可点空白取消选中）');
            return; // 保持 selected，「行动」按钮仍在
        }
        this.targetingMode = 'move';
        this.interactStage = 'targeting';
        this.highlighter?.show([{ cells: this.targetingCells }], this.layout);
        this.updateActionButtons();
    }

    /**
     * 点「攻击」：复用移动校验链路的可达格 → 红色高亮有敌棋的格（可点攻击），
     * 灰色高亮范围内空格（仅示意攻击范围、不可点）——无目标时也有可见反馈，避免"像没反应"。
     * 完全没有可达格（被己方围死）才保持 selected 并提示。
     */
    private onAttackClicked(): void {
        this.playSfx(this.actionClickSfx);
        if (!this.state || !this.layout || this.interactStage !== 'selected' || !this.selectedUnitId) return;
        const unit = this.state.units.find((u) => u.id === this.selectedUnitId);
        const def = unit ? getUnitDef(this.defs, unit.defId) : undefined;
        if (!unit || !def) {
            warn(`[交互] 找不到棋子或其定义：${this.selectedUnitId}`);
            return;
        }
        const reach = computeReachableCells(this.state, unit, def, 'attack');
        const targets = reach.filter((cell) => cell.capture);
        const range = reach.filter((cell) => !cell.capture);
        if (targets.length === 0) {
            log('[交互] 攻击范围内没有敌方棋子');
        }
        if (targets.length === 0 && range.length === 0) {
            return; // 完全没有可达格：无从展示，保持 selected，「攻击」按钮仍在
        }
        this.targetingMode = 'attack';
        this.targetingCells = targets; // 仅红色格可点；灰格点击按「非目标格忽略」处理
        this.interactStage = 'targeting';
        this.highlighter?.show([
            { cells: range, color: this.attackRangeHighlightColor },
            { cells: targets, color: this.attackHighlightColor },
        ], this.layout);
        this.updateActionButtons();
    }

    /** 点「取消」：放弃移动，回到选中态（可再点行动 / 改选 / 点空白取消） */
    private onCancelClicked(): void {
        this.playSfx(this.cancelClickSfx);
        if (this.interactStage !== 'targeting') return;
        this.highlighter?.clear();
        this.targetingCells = [];
        this.interactStage = 'selected';
        this.updateActionButtons();
    }

    /** 点中一格：targeting → 判可走格并落子；selected → 取消选中；idle → 无操作 */
    private onTileClicked(x: number, y: number): void {
        if (this.interactStage === 'targeting' && this.selectedUnitId) {
            const reachable = this.targetingCells.some((cell) => cell.x === x && cell.y === y);
            if (!reachable) return; // 非可走/非攻击目标格忽略（已定决策）
            if (this.targetingMode === 'attack') {
                this.executeAttack(this.selectedUnitId, x, y);
            } else {
                this.executeMove(this.selectedUnitId, x, y);
            }
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

    /** 落子：先改逻辑状态（唯一事实源），再投影视图，最后清交互态 */
    private executeMove(unitId: string, x: number, y: number): void {
        if (!this.state || !this.layout) return;
        if (!moveUnitTo(this.state, unitId, x, y, this.defs)) {
            warn(`[交互] 移动被规则拒绝：${unitId} → (${x}, ${y})`);
            return;
        }
        this.unitBuilder?.moveUnitView(unitId, x, y, this.layout);
        log(`[交互] ${unitId} 移动到 (${x}, ${y})`);
        this.refreshThreats(); // 局面已变：立即刷新敌方意图预测（US-006 §3）
        this.cancelSelection();
        this.checkBattleEnd();
    }

    /** 攻击（玩家流程入口）：应用攻击并投影表现，最后清交互态 */
    private executeAttack(attackerId: string, x: number, y: number): void {
        if (!this.state) return;
        if (!this.applyAttack(attackerId, x, y)) {
            warn(`[交互] 攻击被规则拒绝：${attackerId} → (${x}, ${y})`);
            return;
        }
        this.refreshThreats(); // 击杀即时反映到敌方意图预测（US-006 §3）
        this.cancelSelection();
        this.checkBattleEnd();
    }

    /**
     * 应用一次攻击并投影表现（玩家 / AI 共用）：
     * 规则层扣血/阵亡移除，视图层受击抖动或阵亡销毁。返回是否成功。
     */
    private applyAttack(attackerId: string, x: number, y: number): boolean {
        if (!this.state) return false;
        const defender = this.state.units.find((u) => u.pos.x === x && u.pos.y === y);
        if (!attackUnit(this.state, attackerId, x, y, this.defs)) {
            return false;
        }
        if (defender) {
            if (this.state.units.indexOf(defender) !== -1) {
                this.unitBuilder?.shakeUnitView(defender.id);
                log(`[战斗] ${attackerId} 攻击 ${defender.id}，剩余 HP ${defender.hp}`);
            } else {
                this.unitBuilder?.removeUnitView(defender.id);
                log(`[战斗] ${attackerId} 击杀 ${defender.id}`);
            }
        }
        return true;
    }

    /** 行动后即时胜负判定：有结果则进入 ended 并返回 true（玩家/AI 行动路径共用；回合开始的判定仍在 enterTurn） */
    private checkBattleEnd(): boolean {
        if (!this.state) return false;
        const outcome = checkOutcome(this.state) ?? this.kingDeathOutcome();
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
        log(`[流程] 战局结束 — ${outcome.winner ? `胜者 ${outcome.winner}` : '平局'}（${outcome.reason}）`);

        // 结算面板：胜利发奖落档（复通同样发奖，暂不防刷），随后由玩家返回选关
        const panel = this.resultPanelNode?.getComponent(ResultPanel) ?? null;
        if (!panel) {
            warn('[GameManager] 未配置 resultPanelNode：战局已结束但无结算面板。请在 Canvas 下建结算面板（挂 ResultPanel）并拖到该属性');
            return;
        }
        const humanId = this.state?.players.find((p) => p.controller === 'human')?.id;
        const win = !!outcome.winner && !!humanId && outcome.winner === humanId;
        if (win && this.levelEntry) {
            const profile = loadProfile();
            grantBattleReward(profile, this.levelEntry.id, this.levelEntry.rewardGold);
            saveProfile(profile);
            panel.show('win', this.levelEntry.rewardGold, outcome.reason);
        } else if (!outcome.winner) {
            panel.show('draw', 0, outcome.reason);
        } else {
            panel.show('lose', 0, outcome.reason);
        }
    }
}
