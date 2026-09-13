import { _decorator, Button, Camera, Canvas, Color, Component, EventTouch, JsonAsset, Node, resources, Vec3, error, log, warn } from 'cc';
import { BattlePlayer, BattleState, isoToGrid, parseBattleState } from './Core/BattleState';
import { advanceTurn, attackUnit, checkOutcome, getCurrentPlayer, isHumanTurn, moveUnitTo, resetTurn } from './Core/Rules';
import { decideAiAction } from './Core/EnemyAI';
import { getLevelEntry, LevelEntry, LevelList, parseLevelList } from './Core/LevelConfig';
import { grantBattleReward } from './Core/PlayerProfile';
import { computeReachableCells, ReachableCell } from './Core/movement';
import { UnitDef, getUnitDef, parseUnitDefs } from './Core/UnitDefs';
import { getUnitInfo } from './Core/UnitInfo';
import { BoardCamera } from './Map/BoardCamera';
import { IsoLayout, topFaceOffsetY } from './Map/IsoLayout';
import { MapBuilder } from './Map/MapBuilder';
import { MoveHighlighter } from './Map/MoveHighlighter';
import { UnitBuilder } from './Unit/UnitBuilder';
import { ResultPanel } from './UI/ResultPanel';
import { UnitInfoPanel } from './UI/UnitInfoPanel';
import { loadProfile, saveProfile } from './UI/ProfileStore';

const { ccclass, property } = _decorator;

/** 战局流程阶段（编排层；与数据层的 turn.phase 区分开） */
export type FlowStage = 'generating' | 'playerTurn' | 'enemyTurn' | 'ended';

/** 棋子交互子状态：无选中 → 已选中（显示「行动」）→ 目标选择（显示「取消」+ 高亮可走格） */
export type InteractStage = 'idle' | 'selected' | 'targeting';

/** 敌方单回合最大步数保险（正常 ≈ 全员体力总和，远达不到） */
const MAX_ENEMY_STEPS = 40;

/**
 * 战局协调者（M0）：持有内存中的战局状态（唯一事实源），
 * 按流程驱动：关卡生成 → （我方回合 ←→ 敌方回合 循环）→ 胜负结束。
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

    @property({ tooltip: '敌方 AI 行动前的思考延迟（秒）' })
    public aiDelay = 0.5;

    @property({ tooltip: '敌方行动后的停留时长（秒）；应不小于 UnitBuilder.unitMoveDuration，保证移动动画播完再交回回合' })
    public enemySettleDelay = 0.6;

    @property({ type: UnitInfoPanel, tooltip: '棋子信息面板（点击任意棋子显示信息；M0 占位 UI）' })
    public unitInfoPanel: UnitInfoPanel | null = null;

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

    /** 敌方回合步进计数（防死循环保险；进入敌方回合时清零） */
    private enemyStepCount = 0;

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
        // turnEndButton 为可选：未配置时我方回合自动快过（调试兜底），不阻止地图生成
        if (!this.turnEndButton) {
            warn('[GameManager] 未配置 turnEndButton：我方回合将自动快过（调试模式）。请把结束回合按钮拖到该属性后点按才生效');
        } else {
            this.turnEndButton.node.on(Button.EventType.CLICK, this.endCurrentTurn, this);
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

    /** 进入当前行动方的回合：先胜负判定，再进入对应阶段 */
    private enterTurn(): void {
        if (!this.state || this.flowStage === 'ended') return;

        const outcome = checkOutcome(this.state);
        if (outcome) {
            this.enterEnded(outcome);
            return;
        }

        resetTurn(this.state, this.defs);
        const human = isHumanTurn(this.state);
        this.flowStage = human ? 'playerTurn' : 'enemyTurn';
        this.updateButton();
        const active = getCurrentPlayer(this.state);
        log(`[流程] 第 ${this.state.turn.round} 轮 — ${human ? '我方' : '敌方'}回合（${active?.id}）`);

        if (!human) {
            // 敌方回合：AI 思考延迟后随机行动一步，再交回回合
            this.scheduleOnce(() => this.runEnemyTurn(), this.aiDelay);
        } else if (!this.turnEndButton) {
            // 我方回合未配置按钮：调试兜底，自动快过
            this.scheduleOnce(() => this.endCurrentTurn(), this.aiDelay);
        }
        // 我方回合（已配置按钮）：等待玩家点击「结束回合」按钮
    }

    /** 敌方回合：进入步进循环（每步一动作，直到无可为 / 步数上限），停留后交回回合 */
    private runEnemyTurn(): void {
        if (!this.state || !this.layout || this.flowStage !== 'enemyTurn') return;
        this.enemyStepCount = 0;
        this.performEnemyStep();
    }

    /** 敌方一步：决策 → 执行（先改状态唯一事实源，再投影视图）→ 胜负判定 → 排下一步 */
    private performEnemyStep(): void {
        if (!this.state || !this.layout || this.flowStage !== 'enemyTurn') return;
        if (this.enemyStepCount >= MAX_ENEMY_STEPS) {
            warn(`[AI] 敌方步数达到上限 ${MAX_ENEMY_STEPS}，强制结束回合`);
            this.scheduleOnce(() => this.endCurrentTurn(), this.enemySettleDelay);
            return;
        }
        const action = decideAiAction(this.state, this.defs);
        if (!action) {
            log('[AI] 敌方无可为动作，结束回合');
            this.scheduleOnce(() => this.endCurrentTurn(), this.enemySettleDelay);
            return;
        }
        this.enemyStepCount++;
        if (action.type === 'attack') {
            if (!this.applyAttack(action.unitId, action.to.x, action.to.y)) {
                warn(`[AI] 攻击被规则拒绝：${action.unitId} → (${action.to.x}, ${action.to.y})`);
                this.scheduleOnce(() => this.endCurrentTurn(), this.enemySettleDelay);
                return;
            }
            log(`[AI] ${action.unitId} 攻击 → (${action.to.x}, ${action.to.y}）：${action.reason}`);
        } else {
            if (!moveUnitTo(this.state, action.unitId, action.to.x, action.to.y, this.defs)) {
                warn(`[AI] 移动被规则拒绝：${action.unitId} → (${action.to.x}, ${action.to.y})`);
                this.scheduleOnce(() => this.endCurrentTurn(), this.enemySettleDelay);
                return;
            }
            this.unitBuilder?.moveUnitView(action.unitId, action.to.x, action.to.y, this.layout);
            log(`[AI] ${action.unitId} 移动 → (${action.to.x}, ${action.to.y}）：${action.reason}`);
        }

        // AI 中途打完收工：全灭判定即时生效，不再排下一步
        if (this.checkBattleEnd()) {
            return;
        }

        // 步间隔 ≥ 移动动画时长，保证动画播完再走下一步
        const moveDuration = this.unitBuilder ? this.unitBuilder.unitMoveDuration : 0.2;
        this.scheduleOnce(() => this.performEnemyStep(), Math.max(this.aiDelay, moveDuration + 0.05));
    }

    /** 结束当前行动方回合，推进到下一方（结束按钮 / 敌方快过调用） */
    public endCurrentTurn(): void {
        if (!this.state || this.flowStage === 'ended') return;
        this.cancelSelection(); // 回合切换不残留选中 / 高亮 / 交互按钮
        advanceTurn(this.state);
        this.enterTurn();
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
        // 查看（点棋子看信息）不分回合；操作（选中/移动）仅我方回合
        const canOperate = this.flowStage === 'playerTurn';
        const canInspect = canOperate || this.flowStage === 'enemyTurn';
        if (!canOperate && !canInspect) return; // generating/ended：不响应
        if (this.isUiTap(event.target)) return;

        const screen = event.getLocation();
        const world = this.touchToWorld(event);
        const local = this.worldToMapLocal(world);
        // 触点在「顶面中心空间」（可见菱形），isoToGrid 锚在「画布中心空间」：
        // 先减去顶面偏移换算回画布空间再逆映射，否则 ~72% 菱形面积会解析到后方邻格（实测踩坑）。
        const grid = isoToGrid(local.x, local.y - topFaceOffsetY(this.layout), this.layout, this.state.map.width, this.state.map.height);
        if (this.debugPick) {
            const where = grid ? `格(${grid.x},${grid.y})` : '界外';
            log(`[拾取] 屏幕(${screen.x.toFixed(0)},${screen.y.toFixed(0)}) → 世界(${world.x.toFixed(0)},${world.y.toFixed(0)}) → 本地(${local.x.toFixed(0)},${local.y.toFixed(0)}) → ${where}`);
        }

        if (this.interactStage !== 'targeting') {
            // 棋子命中（旗子内容矩形，地图本地空间）：查看信息（任意棋子）/ 选中（仅我方回合）
            const unitId = this.unitBuilder?.hitUnitAt(local.x, local.y, this.state.units);
            if (unitId) {
                if (this.debugPick) log(`[拾取] 命中棋子 ${unitId}`);
                if (canOperate) this.onUnitClicked(unitId); // 内部 cancelSelection 会先收起面板
                if (canInspect) this.showUnitInfo(unitId); // 放最后：保证面板显示最新点中的棋子
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
        const uiNodes = [this.turnEndButton?.node, this.actionButton?.node, this.attackButton?.node, this.cancelButton?.node];
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

    /** 显示指定棋子的信息（数据组装在 Core，面板只负责格式化显示） */
    private showUnitInfo(unitId: string): void {
        if (!this.state || !this.unitInfoPanel) return;
        const info = getUnitInfo(this.state, unitId, this.defs);
        if (info) {
            this.unitInfoPanel.show(info);
        } else {
            this.unitInfoPanel.hide();
        }
    }

    /** 收起信息面板 */
    private hideUnitInfo(): void {
        this.unitInfoPanel?.hide();
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
        const outcome = checkOutcome(this.state);
        if (outcome) {
            this.enterEnded(outcome);
            return true;
        }
        return false;
    }

    private enterEnded(outcome: { winner: string; reason: string }): void {
        this.flowStage = 'ended';
        this.updateButton();
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
