import { _decorator, Color, Component, Node, Prefab, Sprite, SpriteFrame, UITransform, Vec3, error, instantiate, tween } from 'cc';
import { BattleState, gridToIso, terrainAt } from '../Core/BattleState';
import { CONFIG } from '../Core/Config';
import { ISO_SQUASH_K, IsoLayout, makeIsoLayout, squareTileSide } from './IsoLayout';
import { SideWallSprite } from './SideWallSprite';
import { Tile } from './Tile';

const { ccclass, property } = _decorator;

/** 地块从格点上方多少世界单位落下（+y 向上，起点高于终点） */
const TILE_DROP_Y = 140;

/** 山被完全击碎（→land）时碎渣残留的淡出时长（秒） */
const RUBBLE_FADE_DURATION = 0.45;

/** 地块面片放大系数：轻微覆盖相邻 quad 间的浮点发丝缝（1 = 无覆盖） */
const TILE_OVERLAP = 1.002;

/** 浮岛底座：外扩边距（世界单位）/ 下缘露出厚度 / 顶面与下缘着色（乘在灰噪点贴图上，干土沙色系） */
const BASE_MARGIN = 40;
const BASE_THICKNESS = 12;
const BASE_TOP_COLOR = new Color(96, 84, 60);
const BASE_RIM_COLOR = new Color(48, 44, 34);

/**
 * 按战局状态的地形层生成等距地图（M0：只消费 map 部分，不生成棋子）。
 * 本组件只负责布局，不负责解析：战局状态由 GameManager 持有并传入；
 * 等距几何常量收敛在 IsoLayout（与 UnitBuilder 共用同一套）；
 * 地块自身的表现（贴图 / 后续外观）由 Tile.prefab 上的 Tile 组件负责。
 */
@ccclass('MapBuilder')
export class MapBuilder extends Component {
    @property({ type: Prefab, tooltip: '地块预制体（节点上需挂 Tile 组件，提供地形→贴图映射）' })
    public tilePrefab: Prefab | null = null;

    @property({ tooltip: '顶面菱形半宽（世界单位），决定整张地图的显示大小' })
    public halfTileW = 64;

    @property({ tooltip: '行与行之间的错峰间隔（秒）；同一行的地块同时出现，0 表示所有行同时出现' })
    public tileRevealInterval = 0.175;

    @property({ tooltip: '单块地块的落下动画时长（秒）' })
    public tileRevealDuration = 0.2;

    @property({ tooltip: '先快后慢的曲线指数：1=匀速；越大前段越快、后段越慢（拖尾越明显）' })
    public tileRevealExponent = 2;

    @property({ type: SpriteFrame, tooltip: '森林地块装饰（树）贴图；空则不生成装饰。图片中心 = 树干基点' })
    public forestDecorSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '山体装饰（完整）：mountain 地形格上立体的山；空则山格无装饰。图片中心 = 山基点' })
    public mountainDecorSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '山体装饰（碎）：cracked 地形格（被轰过一次）上的碎山；空则碎态无装饰' })
    public mountainCrackedDecorSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '山体装饰（渣）：山被完全击碎（→land）瞬间的碎渣残留，淡出后移除；空则直接消失' })
    public mountainRubbleSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '桥体装饰：bridge 格下沉的水面上架桥；空则桥格无桥。图片中心 = 桥面中心' })
    public bridgeDecorSprite: SpriteFrame | null = null;

    @property({ tooltip: '桥体装饰宽度占格宽的比例（1 = 整格宽，桥横跨地块）' })
    public bridgeDecorWidthRatio = 1;

    @property({ tooltip: '装饰图的世界高度（整图，分辨率无关；树底/山基在图中心，可见高度约为它的一半）' })
    public forestDecorWorldHeight = 144;

    @property({ tooltip: '山体装饰宽度占格宽的比例（1 = 整格宽，山铺满地块顶面；越小越收敛）' })
    public mountainDecorWidthRatio = 1;

    @property({ tooltip: '装饰相对格心的横向偏移（世界单位，正值向右；一格宽 128）' })
    public forestDecorOffsetX = 0;

    @property({ tooltip: '装饰相对格心的纵向偏移（世界单位，正值向上；一格高 64）' })
    public forestDecorOffsetY = 0;

    @property({ type: SpriteFrame, tooltip: '地图底座贴图（中性灰噪点，运行时乘深色）；空则不生成底座' })
    public mapBaseSprite: SpriteFrame | null = null;

    @property({ tooltip: '逐格侧壁厚度（世界单位）。侧面贴图是正方形原始素材（Tile 的 sideFrame），运行时由 SideWallSprite 渲染成侧壁' })
    public tileThickness = 80;

    @property({ tooltip: '水面相对平地的下移量（世界单位）。陆/水交界处陆地侧壁会露出等高的岸沿；棋子/尸体经同一布局参数跟随下沉' })
    public waterSurfaceDrop = 10;

    /** 山体装饰节点注册表（key "x,y"）：三态随 rockHit 刷新；树不随状态变化，不入表 */
    private mountainDecorNodes = new Map<string, Node>();

    /** 最近一次 buildMap 的布局（供 rockHit 后按格刷新装饰时定位） */
    private lastLayout: IsoLayout | null = null;

    /** 推导等距布局（棋子层必须使用同一布局，才能落在正确格点上） */
    public makeLayout(state: BattleState): IsoLayout {
        void state;
        return makeIsoLayout(this.halfTileW, CONFIG.width, CONFIG.height, this.waterSurfaceDrop);
    }

    /**
     * 按战局状态生成地图：地块逐块从上方落下（按 depth 顺序，前景最后落）。
     * 全部落位后调用 onComplete（用于触发棋子生成等其他流程）。
     */
    public buildMap(state: BattleState, onComplete?: () => void): void {
        if (!this.tilePrefab) {
            error('[MapBuilder] 未配置 tilePrefab：请把 Prefabs 下的 Tile.prefab 拖到该属性');
            return;
        }
        if (!this.tilePrefab.data.getComponent(Tile)) {
            error('[MapBuilder] tilePrefab 上缺少 Tile 组件，无法设置地块类型');
            return;
        }

        // v2 地图：tiles 稀疏字典（缺省 land），全盘 9×9 枚举
        const cells: Array<{ x: number; y: number; terrainId: string }> = [];
        for (let y = 0; y < CONFIG.height; y++) {
            for (let x = 0; x < CONFIG.width; x++) {
                cells.push({ x, y, terrainId: terrainAt(state.map, x, y) });
            }
        }
        cells.sort((a, b) => (a.x + a.y) - (b.x + b.y));

        const layout = this.makeLayout(state);
        this.lastLayout = layout;
        this.mountainDecorNodes.clear(); // 全量重建（重开局/换关）：清掉上一局的注册引用
        const maxDepth = CONFIG.width + CONFIG.height - 2;

        // 浮岛底座先建（排在所有地块之前 → 渲染在最底层），取景包围盒也会把它算进去（整岛可见）
        this.createMapBase(layout);

        // 装饰定层延迟到全部地块创建后（创建序即深度序，插层需以前排格的存在为前提）
        const pendingDecors: { decor: Node; depth: number; rows: number }[] = [];

        for (const cell of cells) {
            const node = instantiate(this.tilePrefab);
            this.node.addChild(node);
            node.name = `tile_${cell.x}_${cell.y}_${cell.terrainId}`;
            const { isoX, isoY } = gridToIso(cell.x, cell.y, layout);
            // 节点位置 = 顶面菱形中心；本节点纵向压缩，Face 子节点旋转 45°，
            // 正方形贴图经"先旋转后压缩"恰为 2:1 菱形，拼接由仿射变换构造保证
            node.setPosition(isoX, isoY, 0);
            node.setScale(1, ISO_SQUASH_K, 1);
            const tile = node.getComponent(Tile)!;
            tile.setTerrain(cell.terrainId);

            // 左右侧壁：Tile 的 sideFrame 正方形素材，由 SideWallSprite 运行时渲染成
            // 「顶边 1:2 斜边 + 竖直边厚度」的平行四边形（先于 Face 添加，接缝被顶面盖住）。
            // y 缩放抵消父节点 0.5 压缩；左壁用 flipX 顶点镜像。bbox 顶边 = 菱形下边，向下延 tileThickness。
            // 水/桥格共用「凹面块体」：外轮廓与陆地一致，顶边随下沉的水面移动（sideTopDrop）——
            // 桥格的块体即水坑，桥板以装饰架在水面上（棋子站桥面=标准高度，见 surfaceDropAt 只认 water）。
            const isSunken = (cell.terrainId === 'water' || cell.terrainId === 'bridge') && layout.waterDrop > 0;
            const sideFrame = tile.getSideFrame(cell.terrainId);
            const wallSprites: SideWallSprite[] = [];
            if (sideFrame) {
                const wallH = layout.halfTileH + this.tileThickness;
                for (const dir of [-1, 1]) {
                    const wall = new Node(dir < 0 ? 'WallL' : 'WallR');
                    node.addChild(wall);
                    const wallSprite = wall.addComponent(SideWallSprite);
                    wallSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    wallSprite.spriteFrame = sideFrame;
                    wallSprite.sideTopRise = layout.halfTileH;
                    wallSprite.sideThickness = this.tileThickness;
                    wallSprite.sideTopDrop = isSunken ? layout.waterDrop : 0;
                    wallSprite.flipX = dir < 0;
                    wall.getComponent(UITransform)!.setContentSize(this.halfTileW, wallH);
                    wall.setPosition(dir * this.halfTileW / 2, -(wallH / 2) / ISO_SQUASH_K, 0);
                    wall.setScale(1, 1 / ISO_SQUASH_K, 1);
                    wallSprites.push(wallSprite);
                }
            }

            // 顶面子节点：正方形贴图旋转 45°（运行时创建；边长按世界尺寸归一化，贴图分辨率无关，
            // 不同尺寸素材统一到同一显示大小）。轻微放大覆盖相邻 quad 的浮点发丝缝。
            const face = new Node('Face');
            node.addChild(face);
            const faceSprite = face.addComponent(Sprite);
            faceSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            faceSprite.spriteFrame = tile.getSpriteFrame(cell.terrainId);
            // Sprite 依赖（requireComponent）已自动补挂 UITransform，这里只取不再加，否则重复添加报错
            const faceTransform = face.getComponent(UITransform)!;
            const side = squareTileSide(this.halfTileW) * TILE_OVERLAP;
            faceTransform.setContentSize(side, side);
            face.angle = 45;
            // 水面下沉（用户语义）：块体（侧壁/底边）与普通地块一致，仅顶面（水面）在块体内凹陷——
            // 侧壁顶边经 sideTopDrop 同步下沉保持与水面贴合；本地 y 除以 ISO_SQUASH_K 抵消父节点纵向压缩。
            // 桥格同款凹陷（桥下是水），桥板由装饰架在水面上。
            if (isSunken) {
                face.setPosition(0, -layout.waterDrop / ISO_SQUASH_K, 0);
            }
            // 预制体根上的整块 Sprite 已不再承担渲染（顶面由 Face 负责），停用防止误渲染
            const rootSprite = node.getComponent(Sprite);
            if (rootSprite) rootSprite.enabled = false;
            // 根节点 contentSize 设为菱形占地（取景包围盒等消费）
            node.getComponent(UITransform)?.setContentSize(this.halfTileW * 2, layout.halfTileH * 2);

            // 未轮到不显形：先隐藏（保持全尺寸）；同一 depth 行一起出现并下落，行与行从后往前错峰。
            // 延迟按 (depth/maxDepth)^exponent 递增：指数>1 时前几行间隔小（快）、越往后间隔越大（慢）——先快后慢。
            node.active = false;
            if (faceSprite) faceSprite.color = new Color(255, 255, 255, 0); // 从透明开始，下落时淡入
            for (const wallSprite of wallSprites) wallSprite.color = new Color(255, 255, 255, 0);
            const finalPos = new Vec3(isoX, isoY, 0);
            const beginY = isoY + TILE_DROP_Y;
            const depth = cell.x + cell.y;
            const startDelay = this.tileRevealInterval * Math.pow(depth / maxDepth, this.tileRevealExponent) * maxDepth;
            this.scheduleOnce(() => {
                node.active = true;
                node.setPosition(isoX, beginY, 0);
                tween(node)
                    .to(this.tileRevealDuration, { position: finalPos }, { easing: 'quadOut' })
                    .start();
                if (faceSprite) {
                    tween(faceSprite)
                        .to(this.tileRevealDuration, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }
                for (const wallSprite of wallSprites) {
                    tween(wallSprite)
                        .to(this.tileRevealDuration, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }
            }, startDelay);

            // 地形装饰（树 / 山体）：作为 MapRoot 直接子节点插到所属地块之后一个兄弟位，保持深度序
            // （前排地块盖装饰、装饰盖后排）。不能挂进 TileNode 子树——TileNode 带纵向压缩会压扁装饰。
            const decor = this.createTerrainDecor(cell.terrainId);
            if (decor) {
                decor.setPosition(isoX + this.forestDecorOffsetX, isoY + this.forestDecorOffsetY, 0); // 图中心=基点 + 可调偏移
                this.node.addChild(decor);
                // 深度序不能在此定：格子循环按序创建，此刻「自己格之后」的格子还不存在，
                // 相对插入无效——先挂到末尾（盖住已创建的 own 格），收集起来循环结束后统一定层。
                const decorHeight = decor.getComponent(UITransform)!.height * decor.scale.y;
                // 树/山竖立向上生长，插到自己格后一层即可；桥扁平横跨，屏幕下半部会伸进前排格区域，
                // 需按跨越的格数多插几层，否则被前排地块盖住。
                const straddledRows = cell.terrainId === 'bridge'
                    ? Math.max(0, Math.ceil((decorHeight / 2 - this.forestDecorOffsetY) / layout.halfTileH))
                    : 0;
                pendingDecors.push({ decor, depth: cell.x + cell.y, rows: straddledRows });
                if (cell.terrainId === 'mountain' || cell.terrainId === 'cracked') {
                    this.mountainDecorNodes.set(`${cell.x},${cell.y}`, decor); // rockHit 刷新用
                }
                // 装饰不随地块下落：所属地块落位后淡入
                decor.active = false;
                const decorSprite = decor.getComponent(Sprite)!;
                decorSprite.color = new Color(255, 255, 255, 0);
                this.scheduleOnce(() => {
                    decor.active = true;
                    tween(decorSprite)
                        .to(0.15, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }, startDelay + this.tileRevealDuration);
            }
        }

        // 统一装饰定层：插到「自己 depth + 跨越行数」的最后一块被覆盖地块之后
        // （= 第一个 depth 更大的格子之前）。children 顺序即创建序 = depth 升序。
        for (const p of pendingDecors) {
            const targetDepth = p.depth + p.rows + 1;
            const idx = this.node.children.findIndex((child) => {
                const m = /^tile_(\d+)_(\d+)_/.exec(child.name);
                return !!m && (Number(m[1]) + Number(m[2])) >= targetDepth;
            });
            p.decor.setSiblingIndex(idx >= 0 ? idx : this.node.children.length - 1);
        }

        // 完成回调：最后一行（最大 depth）落位后触发（供 GameManager 起棋子动画）
        const totalReveal = maxDepth * this.tileRevealInterval + this.tileRevealDuration;
        this.scheduleOnce(() => { onComplete?.(); }, Math.max(totalReveal, 0));
    }

    /**
     * 浮岛底座：在全部地块后方垫两片大菱形（顶面 + 下移的下缘），消除棋盘外沿的"悬空硬切边"。
     * 复用地块同款变换（scale (1,k) + Face 旋转 45°），中性灰贴图 × 深色 tint 得到土壤色。
     */
    private createMapBase(layout: IsoLayout): void {
        if (!this.mapBaseSprite) {
            return;
        }
        void layout;
        const span = (CONFIG.width + CONFIG.height) * this.halfTileW;          // 地图菱形全宽
        const centerX = ((CONFIG.width - CONFIG.height) / 2) * this.halfTileW; // 地图包围盒中心（x 向不对称）
        const side = (span + BASE_MARGIN * 2) / Math.SQRT2;              // 旋转 45° 后对角线 = 菱形宽
        const make = (name: string, y: number, tint: Color): Node => {
            const node = new Node(name);
            node.setPosition(centerX, y, 0);
            node.setScale(1, ISO_SQUASH_K, 1);
            const face = new Node('Face');
            node.addChild(face);
            const sprite = face.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.mapBaseSprite;
            face.getComponent(UITransform)!.setContentSize(side, side);
            face.angle = 45;
            sprite.color = tint;
            this.node.addChild(node);
            return node;
        };
        make('MapBaseRim', -BASE_THICKNESS, BASE_RIM_COLOR);
        make('MapBaseTop', 0, BASE_TOP_COLOR);
    }

    /**
     * 创建地形装饰节点（树 / 山体三态 / 桥）：树按世界高度归一，山/桥按格宽归一（铺满地块顶面）。
     * mountain→完整山、cracked→碎山、forest→树、bridge→桥；未配置贴图或地形无装饰时返回 null。
     */
    private createTerrainDecor(terrainId: string): Node | null {
        const spriteFrame = terrainId === 'forest'
            ? this.forestDecorSprite
            : terrainId === 'mountain'
                ? this.mountainDecorSprite
                : terrainId === 'cracked'
                    ? this.mountainCrackedDecorSprite
                    : terrainId === 'bridge'
                        ? this.bridgeDecorSprite
                        : null;
        if (!spriteFrame) {
            return null;
        }
        const decor = new Node('Decor');
        const sprite = decor.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = spriteFrame;
        const rect = spriteFrame.rect;
        decor.getComponent(UITransform)!.setContentSize(rect.width, rect.height);
        // 树按世界高度归一（树高与格大小无关）；山/桥按格宽归一——要铺满整格顶面
        const widthRatio = terrainId === 'bridge' ? this.bridgeDecorWidthRatio : this.mountainDecorWidthRatio;
        const scale = terrainId === 'forest'
            ? (rect.height > 0 ? this.forestDecorWorldHeight / rect.height : 1)
            : (rect.width > 0 ? (this.halfTileW * 2 * widthRatio) / rect.width : 1);
        decor.setScale(scale, scale, 1);
        return decor;
    }

    /**
     * 刷新某格山体装饰（rockHit 后调用，消费 effect.mountains）：
     * mountain → 完整山；cracked → 碎山；land（被完全击碎）→ 渣图淡出后移除。
     * 装饰不存在时按当前地形补建（覆盖刷新路径先于建图等边缘时序）。
     */
    public refreshMountainDecor(x: number, y: number, terrainId: string): void {
        const key = `${x},${y}`;
        const existing = this.mountainDecorNodes.get(key);
        if (terrainId === 'land') {
            if (!existing) {
                return;
            }
            this.mountainDecorNodes.delete(key);
            const sprite = existing.getComponent(Sprite);
            if (!sprite || !this.mountainRubbleSprite) {
                existing.destroy();
                return;
            }
            sprite.spriteFrame = this.mountainRubbleSprite; // 完全碎：换渣图短暂停留后淡出
            tween(sprite).to(RUBBLE_FADE_DURATION, { color: new Color(255, 255, 255, 0) }, { easing: 'quadIn' }).start();
            this.scheduleOnce(() => existing.destroy(), RUBBLE_FADE_DURATION + 0.05);
            return;
        }
        const want = terrainId === 'mountain'
            ? this.mountainDecorSprite
            : terrainId === 'cracked'
                ? this.mountainCrackedDecorSprite
                : null;
        if (existing) {
            const sprite = existing.getComponent(Sprite);
            if (sprite && want && sprite.spriteFrame !== want) {
                sprite.spriteFrame = want; // 同格换形态（完整↔碎）
            }
            return;
        }
        if (!want || !this.lastLayout) {
            return;
        }
        const decor = this.createTerrainDecor(terrainId);
        if (!decor) {
            return;
        }
        const { isoX, isoY } = gridToIso(x, y, this.lastLayout);
        decor.setPosition(isoX + this.forestDecorOffsetX, isoY + this.forestDecorOffsetY, 0);
        this.node.addChild(decor);
        const tileNode = this.node.children.find((child) => child.name.startsWith(`tile_${x}_${y}_`));
        if (tileNode) {
            decor.setSiblingIndex(tileNode.getSiblingIndex() + 1); // 保持深度序
        }
        this.mountainDecorNodes.set(key, decor);
    }
}
