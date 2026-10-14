import { _decorator, Color, Component, Node, Prefab, Sprite, SpriteFrame, UITransform, Vec3, error, instantiate, tween } from 'cc';
import { BattleState, gridToIso, terrainAt } from '../Core/BattleState';
import { CONFIG } from '../Core/Config';
import { ISO_SQUASH_K, IsoLayout, makeIsoLayout, squareTileSide } from './IsoLayout';
import { SideWallSprite } from './SideWallSprite';
import { Tile } from './Tile';

const { ccclass, property } = _decorator;

/** 地块从格点上方多少世界单位落下（+y 向上，起点高于终点） */
const TILE_DROP_Y = 140;

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

    @property({ tooltip: '装饰图的世界高度（整图，分辨率无关；树底在图中心，可见树高约为它的一半）' })
    public forestDecorWorldHeight = 144;

    @property({ tooltip: '装饰相对格心的横向偏移（世界单位，正值向右；一格宽 128）' })
    public forestDecorOffsetX = 0;

    @property({ tooltip: '装饰相对格心的纵向偏移（世界单位，正值向上；一格高 64）' })
    public forestDecorOffsetY = 0;

    @property({ type: SpriteFrame, tooltip: '地图底座贴图（中性灰噪点，运行时乘深色）；空则不生成底座' })
    public mapBaseSprite: SpriteFrame | null = null;

    @property({ tooltip: '逐格侧壁厚度（世界单位）。侧面贴图是正方形原始素材（Tile 的 sideFrame），运行时由 SideWallSprite 渲染成侧壁' })
    public tileThickness = 80;

    /** 推导等距布局（棋子层必须使用同一布局，才能落在正确格点上） */
    public makeLayout(state: BattleState): IsoLayout {
        void state;
        return makeIsoLayout(this.halfTileW, CONFIG.width, CONFIG.height);
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
        const maxDepth = CONFIG.width + CONFIG.height - 2;

        // 浮岛底座先建（排在所有地块之前 → 渲染在最底层），取景包围盒也会把它算进去（整岛可见）
        this.createMapBase(layout);

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

            // 森林装饰（树）：作为 MapRoot 直接子节点插到所属地块之后一个兄弟位，保持深度序
            // （前排地块盖树、树盖后排）。不能挂进 TileNode 子树——TileNode 带纵向压缩会把树压扁。
            const decor = this.createForestDecor(cell.terrainId);
            if (decor) {
                decor.setPosition(isoX + this.forestDecorOffsetX, isoY + this.forestDecorOffsetY, 0); // 图中心=树干基点 + 可调偏移
                this.node.addChild(decor);
                decor.setSiblingIndex(node.getSiblingIndex() + 1);
                // 树不随地块下落：所属地块落位后淡入
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
     * 创建森林装饰（树）节点：高度按 forestDecorWorldHeight 归一化（整图世界高度，分辨率无关）。
     * 未配置贴图或地形不是 forest 时返回 null。
     */
    private createForestDecor(terrainId: string): Node | null {
        if (terrainId !== 'forest' || !this.forestDecorSprite) {
            return null;
        }
        const decor = new Node('Decor');
        const sprite = decor.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.forestDecorSprite;
        const rect = this.forestDecorSprite.rect;
        decor.getComponent(UITransform)!.setContentSize(rect.width, rect.height);
        const scale = rect.height > 0 ? this.forestDecorWorldHeight / rect.height : 1;
        decor.setScale(scale, scale, 1);
        return decor;
    }
}
