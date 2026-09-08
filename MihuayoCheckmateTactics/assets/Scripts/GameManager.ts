import { _decorator, Button, Camera, Canvas, Component, EventTouch, JsonAsset, Node, Vec3, error, log, warn } from 'cc';
import { BattlePlayer, BattleState, isoToGrid, parseBattleState } from './Core/BattleState';
import { advanceTurn, checkOutcome, getCurrentPlayer, isHumanTurn, moveUnitTo, resetTurn } from './Core/Rules';
import { computeReachableCells, ReachableCell } from './Core/movement';
import { UnitDef, getUnitDef, parseUnitDefs } from './Core/UnitDefs';
import { IsoLayout } from './Map/IsoLayout';
import { MapBuilder } from './Map/MapBuilder';
import { MoveHighlighter } from './Map/MoveHighlighter';
import { UnitBuilder } from './Unit/UnitBuilder';

const { ccclass, property } = _decorator;

/** 战局流程阶段（编排层；与数据层的 turn.phase 区分开） */
export type FlowStage = 'generating' | 'playerTurn' | 'enemyTurn' | 'ended';

/** 棋子交互子状态：无选中 → 已选中（显示「行动」）→ 目标选择（显示「取消」+ 高亮可走格） */
export type InteractStage = 'idle' | 'selected' | 'targeting';

/**
 * 战局协调者（M0）：持有内存中的战局状态（唯一事实源），
 * 按流程驱动：关卡生成 → （我方回合 ←→ 敌方回合 循环）→ 胜负结束。
 * 我方回合内编排棋子交互：点选 → 行动 → 高亮可走格 → 点格移动 / 取消。
 * 纯逻辑（解析 / 坐标 / 规则）留在 Core 纯 TS，本组件只做引擎粘合与流程编排。
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: JsonAsset, tooltip: '开局的战局初始化 JSON（battleInit）' })
    public levelAsset: JsonAsset | null = null;

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

    @property({ tooltip: '敌方回合自动快过的延迟（秒）；敌方 AI 未接入时的占位' })
    public aiDelay = 0.5;

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
        if (!this.levelAsset) {
            error('[GameManager] 未配置 levelAsset：请把 Levels 下的关卡 JSON 拖到该属性');
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
        if (!this.highlighter) {
            warn('[GameManager] 未配置 highlighter：看不到可走格高亮。请建 HighlightRoot（挂 MoveHighlighter，置于 MapRoot 与 UnitRoot 之间）并拖到该属性');
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

        try {
            this.state = parseBattleState(this.levelAsset.json);
        } catch (err) {
            error(`[GameManager] 战局数据非法，启动中止 —— ${(err as Error).message}`);
            return;
        }

        const state = this.state;
        this.mapNode = this.mapBuilder.node;
        this.layout = this.mapBuilder.makeLayout(state);

        // 初始隐藏按钮（生成阶段 / 敌方回合不显示）
        this.updateButton();
        this.updateActionButtons();

        // 地图逐块落下完成后，再生成棋子；然后进入回合循环
        this.mapBuilder.buildMap(state, () => {
            this.unitBuilder!.buildUnits(state, this.layout!);
            this.beginFlow();
        });
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

        resetTurn(this.state);
        const human = isHumanTurn(this.state);
        this.flowStage = human ? 'playerTurn' : 'enemyTurn';
        this.updateButton();
        const active = getCurrentPlayer(this.state);
        log(`[流程] 第 ${this.state.turn.round} 轮 — ${human ? '我方' : '敌方'}回合（${active?.id}）`);

        if (!human || !this.turnEndButton) {
            // 敌方回合（AI 未接入）自动快过占位；或我方回合未配置按钮时也自动快过（调试兜底）
            this.scheduleOnce(() => this.endCurrentTurn(), this.aiDelay);
        }
        // 我方回合（已配置按钮）：等待玩家点击「结束回合」按钮
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

    /** 按交互子状态切换行动/取消按钮：selected → 行动，targeting → 取消 */
    private updateActionButtons(): void {
        if (this.actionButton) {
            this.actionButton.node.active = this.interactStage === 'selected';
        }
        if (this.cancelButton) {
            this.cancelButton.node.active = this.interactStage === 'targeting';
        }
    }

    /** 清除选中态：回 idle，清高亮与交互按钮（落子 / 点空白 / 回合切换共用） */
    private cancelSelection(): void {
        this.interactStage = 'idle';
        this.selectedUnitId = null;
        this.targetingCells = [];
        this.highlighter?.clear();
        this.updateActionButtons();
    }

    // ---------- 棋盘触摸拾取 ----------

    /**
     * 棋盘触摸：只取触点坐标做拾取，不依赖点中的节点——
     * 触点 → 世界点 → MapRoot 本地点（世界矩阵的逆，自动吸收容器平移/缩放）→ 逆等距 → 逻辑格。
     * targeting 阶段只认格子（旗子矩形不参与命中，避免旗身遮挡可走格）。
     */
    private onBoardTouchEnd(event: EventTouch): void {
        if (!this.state || !this.layout || this.flowStage !== 'playerTurn') return;
        if (this.isUiTap(event.target)) return;

        const screen = event.getLocation();
        const world = this.touchToWorld(event);
        const local = this.worldToMapLocal(world);
        const grid = isoToGrid(local.x, local.y, this.layout, this.state.map.width, this.state.map.height);
        if (this.debugPick) {
            const where = grid ? `格(${grid.x},${grid.y})` : '界外';
            log(`[拾取] 屏幕(${screen.x.toFixed(0)},${screen.y.toFixed(0)}) → 世界(${world.x.toFixed(0)},${world.y.toFixed(0)}) → 本地(${local.x.toFixed(0)},${local.y.toFixed(0)}) → ${where}`);
        }

        if (this.interactStage !== 'targeting') {
            // 棋子命中（旗子内容矩形，地图本地空间）：选中 / 改选我方棋子
            const unitId = this.unitBuilder?.hitUnitAt(local.x, local.y, this.state.units, this.layout);
            if (unitId) {
                if (this.debugPick) log(`[拾取] 命中棋子 ${unitId}`);
                this.onUnitClicked(unitId);
                return;
            }
        }

        if (grid) {
            this.onTileClicked(grid.x, grid.y);
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
        const uiNodes = [this.turnEndButton?.node, this.actionButton?.node, this.cancelButton?.node];
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
        this.interactStage = 'targeting';
        this.highlighter?.show(this.targetingCells, this.layout);
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
            if (!reachable) return; // 非可走格忽略（已定决策）
            this.executeMove(this.selectedUnitId, x, y);
            return;
        }
        if (this.interactStage === 'selected') {
            this.cancelSelection();
        }
    }

    /** 点中棋盘外空白：任何非 idle 交互态下取消选中回 idle */
    private onBlankClicked(): void {
        if (this.interactStage !== 'idle') {
            this.cancelSelection();
        }
    }

    /** 落子：先改逻辑状态（唯一事实源），再投影视图，最后清交互态 */
    private executeMove(unitId: string, x: number, y: number): void {
        if (!this.state || !this.layout) return;
        if (!moveUnitTo(this.state, unitId, x, y)) {
            warn(`[交互] 移动被规则拒绝：${unitId} → (${x}, ${y})`);
            return;
        }
        this.unitBuilder?.moveUnitView(unitId, x, y, this.layout);
        log(`[交互] ${unitId} 移动到 (${x}, ${y})`);
        this.cancelSelection();
    }

    private enterEnded(outcome: { winner: string; reason: string }): void {
        this.flowStage = 'ended';
        this.updateButton();
        if (this.state) {
            this.state.result = outcome;
        }
        log(`[流程] 战局结束 — ${outcome.winner ? `胜者 ${outcome.winner}` : '平局'}（${outcome.reason}）`);
    }
}
