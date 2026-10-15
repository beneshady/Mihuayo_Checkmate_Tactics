import { _decorator, Color, Component, Graphics, Label, Node, Prefab, Sprite, Tween, UITransform, Vec3, error, instantiate, log, tween, warn } from 'cc';
import { BattleState, BattleUnit, gridToIso } from '../Core/BattleState';
import { IsoLayout, surfaceDropAt } from '../Map/IsoLayout';
import { Unit, UnitFacing } from './Unit';

const { ccclass, property } = _decorator;

/**
 * 棋子视图生成（M0/M1：按棋子类型 defId 设置贴图、按裁剪后高度归一世界高度）。
 * 位置 = 地块顶面中心；锚点为底边中心（底座底边顶在顶面中心）。
 * 阵营区分：在棋子底部画一个带色圆环（我方=金色、敌方=红色），贴图本身不区分阵营。
 * 渲染层次：UnitRoot 节点 MUST 排在 MapRoot 之后（树序后渲染，棋子盖在地块上）。
 */

/** 棋子从格点上方多少世界单位落下（+y 向上，起点高于终点） */
const UNIT_DROP_Y = 140;

/** 朝向/偏移诊断日志：每个棋种只打一次（验证 prefab 条目数据是否进运行时） */
const loggedFacingDiag = new Set<string>();

/**
 * 按战局状态的 units 生成棋子视图（M1：按棋子类型选择贴图，含阵营标记）。
 * 位置 = 所属格点 + 顶面中心对齐修正；缩放按裁剪高度归一（各棋子等高）。
 * 渲染层次：UnitRoot 节点 MUST 排在 MapRoot 之后（树序后渲染，棋子盖在地块上）。
 */
@ccclass('UnitBuilder')
export class UnitBuilder extends Component {
    @property({ type: Prefab, tooltip: '棋子预制体（节点上需挂 Sprite 与 Unit 组件）' })
    public unitPrefab: Prefab | null = null;

    @property({ tooltip: '逐枚落下的间隔（秒）；0 表示所有棋子同时出现' })
    public unitRevealInterval = 0.085;

    @property({ tooltip: '单枚棋子的落下动画时长（秒）' })
    public unitRevealDuration = 0.25;

    @property({ tooltip: '棋子移动动画时长（秒）' })
    public unitMoveDuration = 0.2;

    @property({ tooltip: '受击抖动振幅（世界单位）' })
    public shakeAmplitude = 6;

    @property({ tooltip: '棋子归一化后的世界高度（单位与世界坐标一致，与 halfTileW=64 可比）' })
    public unitWorldHeight = 100;

    @property({ type: Color, tooltip: '我方棋子脚下阵营标记色（controller="human" 方）' })
    public sideMarkerSelfColor: Color = new Color(255, 200, 60);

    @property({ type: Color, tooltip: '敌方棋子脚下阵营标记色' })
    public sideMarkerEnemyColor: Color = new Color(232, 64, 64);

    /** unitId → 棋子节点注册表（运行期定位视图；重开局时随 buildUnits 重建） */
    private unitNodes = new Map<string, Node>();

    /** corpseId → 尸体节点注册表（syncCorpseViews 增量对齐 state.corpses） */
    private corpseNodes = new Map<string, Node>();

    /** 按 unitId 取棋子节点（不存在时返回 undefined） */
    public getUnitNode(unitId: string): Node | undefined {
        return this.unitNodes.get(unitId);
    }

    /**
     * 尸体视图对齐（P5，对齐原型 renderPieces 的 corpses 重画，改为增量同步）：
     * state.corpses 新增 → 建灰底「尸」标记节点；位置变化（推尸/牵引）→ 平滑移动；
     * 消失（推入水销毁 / 救援复活）→ 移除节点。不动其余棋子视图。
     */
    public syncCorpseViews(state: BattleState, layout: IsoLayout): void {
        const corpses = state.corpses ?? [];
        const alive = new Set(corpses.map((c) => c.id));
        for (const corpse of corpses) {
            const existing = this.corpseNodes.get(corpse.id);
            const { isoX, isoY } = gridToIso(corpse.x, corpse.y, layout);
            const surfaceY = isoY - surfaceDropAt(state, corpse.x, corpse.y, layout); // 尸体可在水格（推尸入水）
            if (existing) {
                if (Math.abs(existing.position.x - isoX) > 0.5 || Math.abs(existing.position.y - surfaceY) > 0.5) {
                    Tween.stopAllByTarget(existing);
                    tween(existing)
                        .to(this.unitMoveDuration, { position: new Vec3(isoX, surfaceY, 0) }, { easing: 'quadOut' })
                        .start();
                }
                continue;
            }
            // 一个节点只允许一个 UIRenderer：底座（Graphics）与「尸」字（Label）分父子节点
            const node = new Node(`corpse_${corpse.id}`);
            node.addComponent(UITransform).setContentSize(layout.halfTileW, layout.halfTileH);
            const bg = new Node('bg');
            bg.addComponent(UITransform).setContentSize(layout.halfTileW, layout.halfTileH);
            const g = bg.addComponent(Graphics);
            g.fillColor = new Color(119, 123, 131, 235); // 灰底座（对齐原型 corpseMesh 0x777b83）
            g.circle(0, 0, layout.halfTileW * 0.3);
            g.fill();
            node.addChild(bg);
            const labelNode = new Node('label');
            labelNode.addComponent(UITransform).setContentSize(layout.halfTileW, layout.halfTileH);
            const label = labelNode.addComponent(Label);
            label.string = '尸';
            label.fontSize = Math.round(layout.halfTileW * 0.3);
            label.color = new Color(216, 216, 216, 255);
            node.addChild(labelNode);
            node.setPosition(isoX, surfaceY, 0);
            this.node.addChild(node);
            this.corpseNodes.set(corpse.id, node);
        }
        for (const [id, node] of [...this.corpseNodes]) {
            if (alive.has(id)) continue;
            this.corpseNodes.delete(id);
            Tween.stopAllByTarget(node);
            node.destroy();
        }
    }

    /** 清空全部尸体节点（重开局 / 换关时随 buildUnits 一起重置） */
    public clearCorpseViews(): void {
        for (const node of this.corpseNodes.values()) {
            node.destroy();
        }
        this.corpseNodes.clear();
    }

    /**
     * 命中检测：返回被点中的棋子 unitId，未命中返回 undefined。
     * localX/localY 为地图容器本地坐标（调用方先把触点转到本地，缩放/平移不影响结果）。
     * 命中矩形 = 该棋子实际渲染的裁剪尺寸 × 节点缩放（锚点底边中心），与视图精确重合；
     * 按 depth（x+y）从深到浅遍历——棋子重叠时前景优先。
     */
    public hitUnitAt(localX: number, localY: number, units: BattleUnit[]): string | undefined {
        const sorted = [...units].sort((a, b) => (b.x + b.y) - (a.x + a.y));
        for (const unit of sorted) {
            const node = this.unitNodes.get(unit.id);
            if (!node) continue;
            const sprite = node.getComponent(Sprite);
            if (!sprite || !sprite.spriteFrame) continue;
            const size = node.getComponent(UITransform)!.contentSize; // 裁剪后像素尺寸
            const s = node.scale.x;
            const w = size.width * s;
            const h = size.height * s;
            const cx = node.position.x;
            const cy = node.position.y + h / 2; // 锚点底边中心
            if (localX >= cx - w / 2 && localX <= cx + w / 2 && localY >= cy - h / 2 && localY <= cy + h / 2) {
                return unit.id;
            }
        }
        return undefined;
    }

    /**
     * 把棋子视图移动到目标格（逻辑状态已由协调者改好，这里只做表现投影）。
     * 目标格是水面时落在下沉后的水面高度（震退入水演出会跟着沉下去）。
     * 复用落下的 quadOut 节奏；找不到该棋子视图时警告并忽略。
     */
    public moveUnitView(unitId: string, x: number, y: number, layout: IsoLayout, state?: BattleState | null): void {
        const node = this.unitNodes.get(unitId);
        if (!node) {
            warn(`[UnitBuilder] 找不到棋子视图：${unitId}，跳过移动表现`);
            return;
        }
        const { isoX, isoY } = gridToIso(x, y, layout);
        const drop = state ? surfaceDropAt(state, x, y, layout) : 0;
        const unitComp = node.getComponent(Unit);
        const target = new Vec3(
            isoX + (unitComp?.spriteOffsetX ?? 0),
            isoY - drop + (unitComp?.spriteOffsetY ?? 0),
            0,
        );
        Tween.stopAllByTarget(node); // 打断进行中的抖动/移动，防 tween 叠加冲突
        tween(node)
            .to(this.unitMoveDuration, { position: target }, { easing: 'quadOut' })
            .start();
    }

    /** 受击抖动：水平 x 方向衰减抖动（先停现有 tween，防与移动动画冲突） */
    public shakeUnitView(unitId: string): void {
        const node = this.unitNodes.get(unitId);
        if (!node) {
            return;
        }
        Tween.stopAllByTarget(node);
        const base = node.position.clone();
        const a = this.shakeAmplitude;
        tween(node)
            .to(0.045, { position: new Vec3(base.x + a, base.y, 0) })
            .to(0.045, { position: new Vec3(base.x - a, base.y, 0) })
            .to(0.04, { position: new Vec3(base.x + a * 0.5, base.y, 0) })
            .to(0.04, { position: new Vec3(base.x - a * 0.25, base.y, 0) })
            .to(0.03, { position: new Vec3(base.x, base.y, 0) })
            .start();
    }

    /** 阵亡销毁：停 tween 并销毁节点（state 移除由规则层完成） */
    public removeUnitView(unitId: string): void {
        const node = this.unitNodes.get(unitId);
        if (!node) {
            return;
        }
        this.unitNodes.delete(unitId);
        Tween.stopAllByTarget(node);
        node.destroy();
    }

    /**
     * 转职刷新（P3）：按新 kind 重设棋子外观（贴图映射走 Unit.setUnit 同款）。
     * 逻辑状态已由协调者改好；找不到视图时忽略（不重建）。
     */
    public refreshUnitKind(unit: BattleUnit): void {
        const node = this.unitNodes.get(unit.id);
        if (!node) {
            return;
        }
        node.getComponent(Unit)?.setUnit(unit.id, unit.side, unit.kind);
    }

    /** 单节点创建（buildUnits 与 syncNewUnits 共用）：贴图/锚点/等高缩放/阵营标记/注册 */
    private createUnitNode(unit: BattleUnit, layout: IsoLayout, state?: BattleState | null): Node {
        const node = instantiate(this.unitPrefab!);
        this.node.addChild(node);
        node.name = `unit_${unit.id}_${unit.side}`;
        const { isoX, isoY } = gridToIso(unit.x, unit.y, layout);
        const surfaceY = isoY - (state ? surfaceDropAt(state, unit.x, unit.y, layout) : 0);
        const unitComp = node.getComponent(Unit)!;
        unitComp.facing = unit.side === 'player' ? UnitFacing.Up : UnitFacing.Down; // 敌我相向（视图默认朝向）
        unitComp.setUnit(unit.id, unit.side, unit.kind);
        // 底边中心锚点：棋子底座底边顶在顶面中心
        node.getComponent(UITransform)?.setAnchorPoint(0.5, 0);
        // 尺寸归一：按裁剪后高度统一世界高度（各棋子等高；缺帧回退布局缩放），
        // 再乘棋种的高度倍率（素材留白多、主体偏小的棋种在 prefab 条目上单独放大）。
        // 经 Unit.applyScale 设置（镜像以 x 负值叠加，统一由 Unit 管理避免覆盖）
        const sprite = node.getComponent(Sprite);
        const frame = sprite?.spriteFrame ?? null;
        const contentH = frame ? frame.rect.height : 0;
        const unitScale = (contentH > 0 ? this.unitWorldHeight / contentH : 1) * unitComp.spriteHeightScale;
        unitComp.applyScale(unitScale);
        if (!loggedFacingDiag.has(unit.kind)) {
            loggedFacingDiag.add(unit.kind);
            log(`[UnitBuilder] ${unit.id}（${unit.kind}）facing=${unitComp.facing} scale=${unitScale.toFixed(3)} offset=(${unitComp.spriteOffsetX}, ${unitComp.spriteOffsetY})`);
        }
        // 阵营标记：我方金、敌方红
        this.addSideMarker(node, unit.side);
        this.unitNodes.set(unit.id, node);
        // 摆位 = 格心 + 素材内容偏移（素材主体不在画布正中时由条目 offsetX/offsetY 修正）
        node.setPosition(isoX + unitComp.spriteOffsetX, surfaceY + unitComp.spriteOffsetY, 0);
        return node;
    }

    /** 增量补建棋子视图（P6：第二波入场 / 救援复活的新单位）；已有视图的忽略 */
    public syncNewUnits(state: BattleState, layout: IsoLayout): void {
        if (!this.unitPrefab) {
            return;
        }
        for (const unit of state.units) {
            if (this.unitNodes.has(unit.id)) {
                continue;
            }
            const node = this.createUnitNode(unit, layout, state);
            const { isoX, isoY } = gridToIso(unit.x, unit.y, layout);
            const surfaceY = isoY - surfaceDropAt(state, unit.x, unit.y, layout);
            const sprite = node.getComponent(Sprite);
            node.active = false;
            if (sprite) sprite.color = new Color(255, 255, 255, 0);
            const unitComp = node.getComponent(Unit);
            const posX = isoX + (unitComp?.spriteOffsetX ?? 0);
            const posY = surfaceY + (unitComp?.spriteOffsetY ?? 0);
            const finalPos = new Vec3(posX, posY, 0);
            const beginY = posY + UNIT_DROP_Y;
            this.scheduleOnce(() => {
                node.active = true;
                node.setPosition(posX, beginY, 0);
                tween(node)
                    .to(this.unitRevealDuration, { position: finalPos }, { easing: 'quadOut' })
                    .start();
                if (sprite) {
                    tween(sprite)
                        .to(this.unitRevealDuration, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }
            }, 0);
        }
    }

    /**
     * 按战局状态生成棋子：逐枚从上方落下（depth 顺序）。
     * 全部落位后调用 onComplete（供后续启用交互等流程）。
     */
    public buildUnits(state: BattleState, layout: IsoLayout, onComplete?: () => void): void {
        if (!this.unitPrefab) {
            error('[UnitBuilder] 未配置 unitPrefab：请把 Prefabs 下的 Unit.prefab 拖到该属性');
            return;
        }
        if (!this.unitPrefab.data.getComponent(Unit)) {
            error('[UnitBuilder] unitPrefab 上缺少 Unit 组件，无法设置棋子归属');
            return;
        }

        // 按 depth（x+y）升序创建：棋子相互重叠时前景后创建、盖在上面
        const units = [...state.units].sort(
            (a, b) => (a.x + a.y) - (b.x + b.y),
        );

        // 重建注册表：buildUnits 可能在重开局时再次调用
        this.unitNodes.clear();
        this.clearCorpseViews(); // 新开局无尸体；顺带清掉上一局的尸体节点

        let index = 0;
        for (const unit of units) {
            const node = this.createUnitNode(unit, layout, state);
            const { isoX, isoY } = gridToIso(unit.x, unit.y, layout);
            const surfaceY = isoY - surfaceDropAt(state, unit.x, unit.y, layout);
            const sprite = node.getComponent(Sprite);

            // 未轮到不显形：先隐藏（保持全尺寸）；到点时由 scheduleOnce 激活，再从上方落下并淡入。
            node.active = false;
            if (sprite) sprite.color = new Color(255, 255, 255, 0); // 从透明开始，下落时淡入
            const unitComp = node.getComponent(Unit);
            const posX = isoX + (unitComp?.spriteOffsetX ?? 0);
            const posY = surfaceY + (unitComp?.spriteOffsetY ?? 0);
            const finalPos = new Vec3(posX, posY, 0);
            const beginY = posY + UNIT_DROP_Y;
            this.scheduleOnce(() => {
                node.active = true;
                node.setPosition(posX, beginY, 0);
                tween(node)
                    .to(this.unitRevealDuration, { position: finalPos }, { easing: 'quadOut' })
                    .start();
                if (sprite) {
                    tween(sprite)
                        .to(this.unitRevealDuration, { color: new Color(255, 255, 255, 255) }, { easing: 'quadOut' })
                        .start();
                }
            }, index * this.unitRevealInterval);

            index++;
        }

        const totalReveal = (units.length - 1) * this.unitRevealInterval + this.unitRevealDuration;
        this.scheduleOnce(() => { onComplete?.(); }, Math.max(totalReveal, 0));
    }

    /**
     * 在棋子底部画一个带色圆环作为阵营标记（底边中心上方，紧贴底座/踩点边缘）。
     * 用描边圆环（透明中心），避免盖住棋子本体；绘制在棋子本地坐标系，随节点缩放。
     */
    private addSideMarker(node: Node, side: string): void {
        const sprite = node.getComponent(Sprite);
        if (!sprite || !sprite.spriteFrame) {
            return;
        }
        const color = side === 'player' ? this.sideMarkerSelfColor : this.sideMarkerEnemyColor;

        const marker = new Node('sideMarker');
        marker.layer = node.layer;
        node.addChild(marker);
        const g = marker.addComponent(Graphics);
        const size = node.getComponent(UITransform)!.contentSize;
        // 半径按棋子裁剪宽度比例取（本地单位：随节点缩放映射到世界）
        const rx = size.width * 0.34;
        const ry = rx * 0.4;
        g.lineWidth = Math.max(2, size.height * 0.02);
        g.strokeColor = color;
        marker.setPosition(0, ry, 0);
        g.ellipse(0, 0, rx, ry);
        g.stroke();
    }
}
