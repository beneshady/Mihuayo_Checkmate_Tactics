import { _decorator, Component, JsonAsset, error } from 'cc';
import { BattleState, parseBattleState } from './Core/BattleState';
import { MapBuilder } from './Map/MapBuilder';
import { UnitBuilder } from './Unit/UnitBuilder';

const { ccclass, property } = _decorator;

/**
 * 战局协调者（M0 骨架）：持有内存中的战局实时状态（唯一事实源），
 * 按流程驱动各视图系统（当前：地图生成；后续：棋子、回合、胜负、存档）。
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

    /** 内存中的战局实时状态；存档 = 序列化它，读档 = 解析成它 */
    private state: BattleState | null = null;

    /** 只读访问当前战局状态（未初始化时为 null） */
    public get battleState(): BattleState | null {
        return this.state;
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

        try {
            this.state = parseBattleState(this.levelAsset.json);
        } catch (err) {
            error(`[GameManager] 战局数据非法，启动中止 —— ${(err as Error).message}`);
            return;
        }

        this.mapBuilder.buildMap(this.state);
        this.unitBuilder.buildUnits(this.state, this.mapBuilder.makeLayout(this.state));
    }
}
