import { _decorator, Color, Component, Prefab, Sprite, Vec3, error, instantiate, tween } from 'cc';
import { BattleState, findTileGridLayer, gridToIso } from '../Core/BattleState';
import { IsoLayout, makeIsoLayout } from './IsoLayout';
import { Tile } from './Tile';

const { ccclass, property } = _decorator;

/** 地块从格点上方多少世界单位落下（+y 向上，起点高于终点） */
const TILE_DROP_Y = 140;

/**
 * 按战局状态的地形层生成等距地图（M0：只消费 map 部分，不生成棋子）。
 * 本组件只负责布局，不负责解析：战局状态由 GameManager 持有并传入；
 * 等距几何常量收敛在 IsoLayout（与 UnitBuilder 共用同一套）；
 * 地块自身的表现（贴图 / 后续外观）由 Tile.prefab 上的 Tile 组件负责。
 */
@ccclass('MapBuilder')
export class MapBuilder extends Component {
    @property({ type: Prefab, tooltip: '地块预制体（节点上需挂 Sprite 与 Tile 组件）' })
    public tilePrefab: Prefab | null = null;

    @property({ tooltip: '顶面菱形半宽（世界单位），决定整张地图的显示大小' })
    public halfTileW = 64;

    @property({ tooltip: '行与行之间的错峰间隔（秒）；同一行的地块同时出现，0 表示所有行同时出现' })
    public tileRevealInterval = 0.175;

    @property({ tooltip: '单块地块的落下动画时长（秒）' })
    public tileRevealDuration = 0.2;

    @property({ tooltip: '先快后慢的曲线指数：1=匀速；越大前段越快、后段越慢（拖尾越明显）' })
    public tileRevealExponent = 2;

    /** 推导等距布局（棋子层必须使用同一布局，才能落在正确格点上） */
    public makeLayout(state: BattleState): IsoLayout {
        return makeIsoLayout(this.halfTileW, state.map);
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

        const layer = findTileGridLayer(state.map);
        if (!layer) {
            error('[MapBuilder] map.layers 中未找到 tileGrid 地形层');
            return;
        }

        // 先收集全部格子，再按 depth（x+y）升序创建：前景后创建，自然覆盖背景墙体
        const cells: Array<{ x: number; y: number; terrainId: string }> = [];
        for (let y = 0; y < layer.cells.length; y++) {
            for (let x = 0; x < layer.cells[y].length; x++) {
                cells.push({ x, y, terrainId: layer.cells[y][x] });
            }
        }
        cells.sort((a, b) => (a.x + a.y) - (b.x + b.y));

        const layout = this.makeLayout(state);
        const maxDepth = state.map.width + state.map.height - 2;

        for (const cell of cells) {
            const node = instantiate(this.tilePrefab);
            this.node.addChild(node);
            node.name = `tile_${cell.x}_${cell.y}_${cell.terrainId}`;
            const { isoX, isoY } = gridToIso(cell.x, cell.y, layout);
            // 先落到最终位置（未显形不参与视觉，显形时再改到下落起点）：
            // BoardCamera.fitToContent 的内容包围盒在 buildMap 返回后立即可用
            node.setPosition(isoX, isoY, 0);
            node.getComponent(Tile)!.setTerrain(cell.terrainId);

            // 未轮到不显形：先隐藏（保持全尺寸）；同一 depth 行一起出现并下落，行与行从后往前错峰。
            // 延迟按 (depth/maxDepth)^exponent 递增：指数>1 时前几行间隔小（快）、越往后间隔越大（慢）——先快后慢。
            node.active = false;
            node.setScale(layout.scale, layout.scale, 1);
            const sprite = node.getComponent(Sprite);
            if (sprite) sprite.color = new Color(255, 255, 255, 0); // 从透明开始，下落时淡入
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
                if (sprite) {
                    tween(sprite)
                        .to(this.tileRevealDuration, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }
            }, startDelay);
        }

        // 完成回调：最后一行（最大 depth）落位后触发（供 GameManager 起棋子动画）
        const totalReveal = maxDepth * this.tileRevealInterval + this.tileRevealDuration;
        this.scheduleOnce(() => { onComplete?.(); }, Math.max(totalReveal, 0));
    }
}
