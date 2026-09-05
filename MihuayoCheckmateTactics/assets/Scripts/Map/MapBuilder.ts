import { _decorator, Component, Prefab, error, instantiate } from 'cc';
import { BattleState, findTileGridLayer, gridToIso } from '../Core/BattleState';
import { IsoLayout, makeIsoLayout } from './IsoLayout';
import { Tile } from './Tile';

const { ccclass, property } = _decorator;

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

    /** 推导等距布局（棋子层必须使用同一布局，才能落在正确格点上） */
    public makeLayout(state: BattleState): IsoLayout {
        return makeIsoLayout(this.halfTileW, state.map);
    }

    /** 按 GameManager 提供的战局状态生成地图（解析在 GameManager，不在此重复） */
    public buildMap(state: BattleState): void {
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

        for (const cell of cells) {
            const node = instantiate(this.tilePrefab);
            this.node.addChild(node);
            node.name = `tile_${cell.x}_${cell.y}_${cell.terrainId}`;
            const { isoX, isoY } = gridToIso(cell.x, cell.y, layout);
            node.setPosition(isoX, isoY, 0);
            node.setScale(layout.scale, layout.scale, 1);
            node.getComponent(Tile)!.setTerrain(cell.terrainId);
        }
    }
}
