import { _decorator, Component, Enum, Sprite, SpriteFrame, error, warn } from 'cc';

const { ccclass, property } = _decorator;

/** 同一棋子类型只警告一次，避免多棋子刷屏 */
const warnedDefIds = new Set<string>();

/**
 * 棋子朝向（视图层设定，不进 Core）：
 * Down=面向镜头（正面图）；Up=背对镜头（背面图）；
 * Left/Right=侧向，用正面图水平镜像区分（暂无侧面素材，Q 版惯例）。
 */
export enum UnitFacing {
    Down = 0,
    Up = 1,
    Left = 2,
    Right = 3,
}

/** 棋子类型 defId → 贴图 的可序列化映射条目 */
@ccclass('UnitTypeSpriteEntry')
export class UnitTypeSpriteEntry {
    @property
    public defId = '';

    @property({ type: SpriteFrame })
    public spriteFrame: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '背面图（朝上时用）；空则四向都用正面图' })
    public backSprite: SpriteFrame | null = null;

    @property({ tooltip: '显示高度倍率：素材留白多、主体偏小的棋种用它放大（1 = 跟随全局等高）' })
    public heightScale = 1;

    @property({ tooltip: '内容水平偏移（世界单位，格心为基准）：素材主体偏左填正数往右挪' })
    public offsetX = 0;

    @property({ tooltip: '内容垂直偏移（世界单位，格心为基准）：素材基座偏低填正数往上挪' })
    public offsetY = 0;
}

/**
 * v2 棋种 kind → 旧贴图映射条目 id 别名：让既有 defId 贴图配置继续生效（占位策略）。
 * 弓/枪无旧贴图，自动回退第一条映射。
 */
const KIND_DEFID_ALIAS: Record<string, string> = {
    king: 'shuai',
    rook: 'che',
    horse: 'ma',
    cannon: 'pao',
    pawn: 'soldier',
    advisor: 'shi',
    archer: 'soldier',
    spearman: 'soldier',
};

/**
 * 棋子视图：持有 unitId / side（逻辑事实源始终在 GameManager 的 state.units，
 * 本组件不回写状态），按自带映射（棋种 kind → 棋子贴图）与朝向设置外观。
 * 位置、缩放与命中几何由 UnitBuilder 按 IsoLayout 设置。
 * 阵营区分（我方/敌方）由 UnitBuilder 在棋子下加带色标记，不在贴图里区分。
 */
@ccclass('Unit')
export class Unit extends Component {
    @property({ type: [UnitTypeSpriteEntry], tooltip: '棋子类型 defId → 贴图映射（在 Unit.prefab 上维护）' })
    public typeSprites: UnitTypeSpriteEntry[] = [];

    /** 朝向（决定正面/背面图与水平镜像）；运行时由 UnitBuilder 按阵营设定初始值 */
    @property({ type: Enum(UnitFacing), tooltip: '朝向：Down 面向镜头 / Up 背对 / Left/Right 侧向（正面镜像）' })
    get facing(): UnitFacing {
        return this._facing;
    }
    set facing(value: UnitFacing) {
        this._facing = value;
        if (this.currentEntry) {
            this.applyFacing(this.currentEntry); // 编辑器里切朝向即时换图
        }
    }
    private _facing: UnitFacing = UnitFacing.Down;

    /** 当前命中的贴图条目（facing 变化时按它重选图） */
    private currentEntry: UnitTypeSpriteEntry | null = null;

    /** 等高缩放基准（UnitBuilder 归一化设置，恒正）；镜像以符号叠加在 x 轴上 */
    private baseScale = 1;

    /** 当前是否水平镜像（Left 朝向） */
    private flipped = false;

    /** 关联战局状态里的 unitId（由 UnitBuilder 设置，用于后续交互定位棋子） */
    @property
    public unitId = '';

    /** 归属玩家 id（由 UnitBuilder 设置） */
    @property
    public ownerId = '';

    /**
     * 设置棋子归属与棋种并刷新贴图。
     * 映射中不存在的 kind 先经别名表换算（v2 kind → 旧 defId），仍无则回退第一条映射并警告。
     */
    public setUnit(unitId: string, ownerId: string, kind: string): void {
        this.unitId = unitId;
        this.ownerId = ownerId;

        const sprite = this.getComponent(Sprite);
        if (!sprite) {
            error('[Unit] 棋子节点上缺少 Sprite 组件');
            return;
        }

        const defId = KIND_DEFID_ALIAS[kind] ?? kind;
        const entry = this.typeSprites.find((candidate) => candidate.defId === defId)
            ?? this.typeSprites.find((candidate) => candidate.spriteFrame || candidate.backSprite);
        if (entry && (entry.spriteFrame || entry.backSprite)) {
            this.currentEntry = entry;
            this.applyFacing(entry);
            return;
        }

        if (!warnedDefIds.has(defId)) {
            warn(`[Unit] 棋子类型 "${defId}"（kind="${kind}"）无贴图，使用第一条映射占位`);
            warnedDefIds.add(defId);
        }
        this.currentEntry = null;
        sprite.spriteFrame = null;
    }

    /**
     * 由 UnitBuilder 调用：设置等高归一缩放（镜像叠加在 x 符号上）。
     * 镜像与缩放统一由本组件管理，外部不要直接 setScale 棋子节点（会丢镜像）。
     */
    public applyScale(unitScale: number): void {
        this.baseScale = unitScale;
        this.node.setScale(unitScale * (this.flipped ? -1 : 1), unitScale, 1);
    }

    /** 当前棋种的显示高度倍率（素材主体偏小的棋种在 prefab 条目上调大） */
    public get spriteHeightScale(): number {
        return this.currentEntry?.heightScale ?? 1;
    }

    /** 素材内容水平偏移（世界单位）：素材主体不在画布正中时由 UnitBuilder 叠加到格心上；镜像时自动取反 */
    public get spriteOffsetX(): number {
        const base = this.currentEntry?.offsetX ?? 0;
        return this.flipped ? -base : base;
    }

    /** 素材内容垂直偏移（世界单位） */
    public get spriteOffsetY(): number {
        return this.currentEntry?.offsetY ?? 0;
    }

    /** 按朝向选图：Down/Right 用正面原图，Left 用正面镜像，Up 用背面图（无背面素材回退正面） */
    private applyFacing(entry: UnitTypeSpriteEntry): void {
        const sprite = this.getComponent(Sprite);
        if (!sprite) {
            return;
        }
        this.flipped = this.facing === UnitFacing.Left; // Cocos 3.x 无 Sprite.flipX，镜像用节点 x 负缩放
        sprite.spriteFrame = this.facing === UnitFacing.Up
            ? entry.backSprite ?? entry.spriteFrame ?? null
            : entry.spriteFrame ?? entry.backSprite ?? null;
        this.node.setScale(this.baseScale * (this.flipped ? -1 : 1), this.baseScale, 1);
    }
}
