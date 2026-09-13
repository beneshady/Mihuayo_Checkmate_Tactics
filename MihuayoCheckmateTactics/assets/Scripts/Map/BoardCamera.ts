import { _decorator, Button, Camera, Canvas, Component, EventMouse, EventTouch, log, Node, UITransform, Vec2, Vec3, view, warn } from 'cc';

const { ccclass, property } = _decorator;

/** 拖动判定阈值（屏幕像素）：位移超过它判定为拖拽，本触摸不再触发点选 */
const DRAG_THRESHOLD_PX = 16;
/** 滚轮单档缩放系数 */
const WHEEL_STEP = 1.1;
/** 惯性速度上限 / 停止阈值（世界单位/秒） */
const INERTIA_V_MAX = 2600;
const INERTIA_V_MIN = 30;
/** 速度采样窗口（毫秒）：取该窗口内首末采样求平均速度 */
const VELOCITY_WINDOW_MS = 100;

interface TouchTrack {
    startScreen: Vec3;
    lastScreen: Vec3;
}

/**
 * 棋盘视角（伪摄像机）：平移/缩放 GameRoot 容器实现"镜头"，不动渲染相机。
 *
 * 为什么变换容器而不是 Camera：本场景单 Canvas 单相机，UI（按钮/面板）与棋盘同相机渲染，
 * 动相机会连 UI 一起缩放；双相机 + Layer 分层方案要动渲染结构，M0 不引入。
 * 拾取天然兼容：touchToWorld 走渲染相机 screenToWorld，worldToMapLocal 用 MapRoot
 * 世界矩阵的逆，容器的平移/缩放自动被吸收（GameManager 已按此预留，零改动）。
 *
 * 交互：单指拖动=平移（超阈值即拖拽态，抑制点选）；双指=捏合缩放（锚点=捏合中点）+
 * 中点平移；鼠标滚轮=以光标为锚缩放；单指松手带轻惯性（inertiaTau=0 可关）。
 * 缩放范围 [fit, fit×zoomMax]：fit 为内容（地图+棋子）含边距恰好铺满视口；
 * 进战斗时 GameManager 在建图建子完成后调用 fitToContent()。
 * 平移钳制：地图外沿不允许拉进视口（留 contentMargin 边距），fit 档位自动锁死平移。
 * 本组件只做视图变换：状态不进 BattleState、不落存档（ADR-0001 分层）。
 */
@ccclass('BoardCamera')
export class BoardCamera extends Component {
    @property({ type: Node, tooltip: '输入接收节点（Canvas）：触摸/滚轮都会派发到它' })
    public canvas: Node | null = null;

    @property({ tooltip: '缩放上限（相对 fit 全景的倍数）' })
    public zoomMax = 3;

    @property({ tooltip: 'fit 全景的内容外边距（世界单位）' })
    public contentMargin = 24;

    @property({ tooltip: '惯性衰减时间常数（秒），0 = 关闭惯性' })
    public inertiaTau = 0.15;

    // ---- 视图状态（纯视图，不进战斗状态）----
    private renderCamera: Camera | null = null;
    private fitScale = 1;
    private boundsMin = new Vec3();
    private boundsMax = new Vec3();
    private hasContent = false;

    // ---- 手势状态 ----
    private touchTracks = new Map<number, TouchTrack>();
    /** 判定为拖拽的触摸 id：保留到该 id 的下一次 TOUCH_START 才清除，
     *  使 GameManager 的 TOUCH_END 守卫不依赖监听器注册顺序 */
    private draggedIds = new Set<number>();
    private pinch: { dist0: number; scale0: number; contentP: Vec3 } | null = null;
    private velocity = new Vec3();
    private samples: Array<{ t: number; p: Vec3 }> = [];

    protected onLoad(): void {
        if (!this.canvas) {
            warn('[BoardCamera] 未配置 canvas：视角控制不可用');
            return;
        }
        this.renderCamera = this.canvas.getComponent(Canvas)?.cameraComponent ?? null;
        if (!this.renderCamera) {
            warn('[BoardCamera] Canvas 未配置渲染相机：锚点/视口计算退化为 UI 坐标');
        }
        this.canvas.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.canvas.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.canvas.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.canvas.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.canvas.on(Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    protected onDestroy(): void {
        if (!this.canvas) return;
        this.canvas.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.canvas.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.canvas.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.canvas.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.canvas.off(Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    // ---------- 公开 API ----------

    /** 建图/建子完成后调用：按当前内容包围盒自适应取景（fit 全景居中） */
    public fitToContent(): void {
        if (!this.collectContentBounds()) {
            warn('[BoardCamera] 内容包围盒为空：跳过 fit');
            return;
        }
        const viewMin = this.viewMin();
        const viewMax = this.viewMax();
        const bw = Math.max(this.boundsMax.x - this.boundsMin.x, 1);
        const bh = Math.max(this.boundsMax.y - this.boundsMin.y, 1);
        const fit = Math.min(
            (viewMax.x - viewMin.x - 2 * this.contentMargin) / bw,
            (viewMax.y - viewMin.y - 2 * this.contentMargin) / bh,
            1,
        );
        this.fitScale = Math.max(fit, 0.0001);
        if (!Number.isFinite(this.fitScale)) {
            warn(`[BoardCamera] fit 计算出非有限值，跳过取景（bounds=${this.boundsMin}..${this.boundsMax}）`);
            return;
        }
        this.hasContent = true;
        this.setScale(this.fitScale);
        this.clampAndApply();
        log(`[BoardCamera] fit: scale=${this.fitScale.toFixed(3)} bounds=(${this.boundsMin.x.toFixed(0)},${this.boundsMin.y.toFixed(0)})..(${this.boundsMax.x.toFixed(0)},${this.boundsMax.y.toFixed(0)}) pos(local)=(${this.node.position.x.toFixed(0)},${this.node.position.y.toFixed(0)})`);
    }

    /** GameManager 点选守卫：拖拽/捏合/惯性期间的抬起不算点选 */
    public suppressTap(touchId: number): boolean {
        return this.touchTracks.size > 0 || this.draggedIds.has(touchId) || this.isInertia();
    }

    // ---------- 帧更新：惯性 ----------

    protected update(dt: number): void {
        if (!this.isInertia()) return;
        const pos = this.node.position;
        this.node.setPosition(pos.x + this.velocity.x * dt, pos.y + this.velocity.y * dt, 0);
        const decay = this.inertiaTau > 0 ? Math.exp(-dt / this.inertiaTau) : 0;
        this.velocity.multiplyScalar(decay);
        if (this.velocity.length() < INERTIA_V_MIN) this.velocity.set(0, 0, 0);
        this.clampAndApply();
    }

    // ---------- 触摸手势 ----------

    private onTouchStart(event: EventTouch): void {
        const touch = event.touch;
        if (!touch) return;
        if (event.target?.getComponent(Button)) return; // UI 按钮起手不参与视角手势
        this.stopInertia();
        const id = touch.getID();
        this.draggedIds.delete(id); // 新触摸开始：清除它上一次的拖拽标记
        const screen = this.screenVec(event);
        this.touchTracks.set(id, { startScreen: screen.clone(), lastScreen: screen.clone() });
        if (this.touchTracks.size === 2) this.beginPinch();
    }

    private onTouchMove(event: EventTouch): void {
        const touch = event.touch;
        if (!touch) return;
        const id = touch.getID();
        const track = this.touchTracks.get(id);
        if (!track) return;
        const screen = this.screenVec(event);
        if (this.touchTracks.size >= 2 && this.pinch) {
            track.lastScreen = screen;
            this.updatePinch();
            this.draggedIds.add(id);
            return;
        }
        if (this.touchTracks.size === 1) {
            const lastWorld = this.worldFromScreen(track.lastScreen);
            const curWorld = this.worldFromScreen(screen);
            this.node.setPosition(
                this.node.position.x + (curWorld.x - lastWorld.x),
                this.node.position.y + (curWorld.y - lastWorld.y),
                0,
            );
            this.pushSample(curWorld);
            const dx = screen.x - track.startScreen.x;
            const dy = screen.y - track.startScreen.y;
            if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) this.draggedIds.add(id);
            track.lastScreen = screen;
            this.clampAndApply();
        }
    }

    private onTouchEnd(event: EventTouch): void {
        const touch = event.touch;
        if (!touch) return;
        const id = touch.getID();
        if (!this.touchTracks.delete(id)) return;
        if (this.touchTracks.size === 1) this.startInertiaFromSamples(); // 单指拖拽松手：轻惯性
        if (this.touchTracks.size < 2) this.pinch = null;
        this.samples.length = 0;
    }

    private onMouseWheel(event: EventMouse): void {
        if (!this.hasContent) return;
        const scroll = event.getScrollY();
        if (!scroll) return;
        const factor = scroll > 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
        this.zoomAt(this.screenVec(event), factor);
    }

    // ---------- 捏合 / 缩放 ----------

    private beginPinch(): void {
        const tracks = [...this.touchTracks.values()];
        if (tracks.length < 2) return;
        const [a, b] = tracks;
        const dist0 = Math.max(Vec3.distance(a.lastScreen, b.lastScreen), 1);
        const mid = this.midScreen(a, b);
        const midWorld = this.worldFromScreen(mid);
        const scale0 = this.node.scale.x;
        const origin = this.node.worldPosition; // 世界空间下的 GameRoot 原点（≠ position：那是 Canvas 局部坐标）
        // 捏合起点中点下的内容点（GameRoot 本地）：后续保持它钉在当前中点下
        const contentP = new Vec3(
            (midWorld.x - origin.x) / scale0,
            (midWorld.y - origin.y) / scale0,
            0,
        );
        this.pinch = { dist0, scale0, contentP };
        for (const id of this.touchTracks.keys()) this.draggedIds.add(id);
        this.stopInertia();
    }

    private updatePinch(): void {
        if (!this.pinch) return;
        const tracks = [...this.touchTracks.values()];
        if (tracks.length < 2) return;
        const [a, b] = tracks;
        const dist = Math.max(Vec3.distance(a.lastScreen, b.lastScreen), 1);
        const midWorld = this.worldFromScreen(this.midScreen(a, b));
        const scale = this.clampScale(this.pinch.scale0 * (dist / this.pinch.dist0));
        this.setScale(scale);
        // 中点下的内容点保持不动：同时实现捏合缩放与双指平移（世界坐标 → 局部落位）
        const target = this.worldToLocalPos(new Vec3(
            midWorld.x - scale * this.pinch.contentP.x,
            midWorld.y - scale * this.pinch.contentP.y,
            0,
        ));
        this.node.setPosition(target.x, target.y, 0);
        this.clampAndApply();
    }

    private zoomAt(screenPos: Vec3, factor: number): void {
        if (!this.hasContent) return;
        const anchorWorld = this.worldFromScreen(screenPos);
        const scale0 = this.node.scale.x;
        const scale = this.clampScale(scale0 * factor);
        if (scale === scale0) return;
        this.setScale(scale);
        // 锚点下的内容点保持不动（世界坐标 → 局部落位）
        const target = this.worldToLocalPos(new Vec3(
            anchorWorld.x - (anchorWorld.x - this.node.worldPosition.x) * (scale / scale0),
            anchorWorld.y - (anchorWorld.y - this.node.worldPosition.y) * (scale / scale0),
            0,
        ));
        this.node.setPosition(target.x, target.y, 0);
        this.clampAndApply();
    }

    // ---------- 几何工具 ----------

    /** 内容（GameRoot 子树）在 GameRoot 本地空间的包围盒；成功返回 true */
    private collectContentBounds(): boolean {
        const inv = this.node.worldMatrix.clone().invert();
        const min = this.boundsMin.set(Infinity, Infinity, 0);
        const max = this.boundsMax.set(-Infinity, -Infinity, 0);
        let found = false;
        const walk = (node: Node): void => {
            const ut = node.getComponent(UITransform);
            // 不看 active：地块在显形前是 inactive，但位置已定——fit 必须在落块动画开始前可用
            if (ut && ut.width > 0 && ut.height > 0) {
                const corners = [
                    new Vec3(-ut.anchorX * ut.width, -ut.anchorY * ut.height, 0),
                    new Vec3((1 - ut.anchorX) * ut.width, -ut.anchorY * ut.height, 0),
                    new Vec3(-ut.anchorX * ut.width, (1 - ut.anchorY) * ut.height, 0),
                    new Vec3((1 - ut.anchorX) * ut.width, (1 - ut.anchorY) * ut.height, 0),
                ];
                for (const c of corners) {
                    const world = Vec3.transformMat4(new Vec3(), c, node.worldMatrix);
                    const local = Vec3.transformMat4(new Vec3(), world, inv);
                    min.x = Math.min(min.x, local.x);
                    min.y = Math.min(min.y, local.y);
                    max.x = Math.max(max.x, local.x);
                    max.y = Math.max(max.y, local.y);
                    found = true;
                }
            }
            for (const child of node.children) walk(child);
        };
        for (const child of this.node.children) walk(child);
        return found;
    }

    /** 平移钳制：地图外沿不拉进视口（留边距）；内容小于视口时居中。发生钳制则终止惯性 */
    private clampAndApply(): boolean {
        if (!this.hasContent) return false;
        const scale = this.node.scale.x;
        const viewMin = this.viewMin();
        const viewMax = this.viewMax();
        const m = this.contentMargin;
        // 钳制数学全部在世界空间进行（视口/内容包围盒换算出的 T 是世界坐标），
        // 最后经 worldToLocalPos 落位 —— GameRoot 的 position 是 Canvas 局部坐标，原点差 (640,360)
        const world = this.node.worldPosition;
        const clampAxis = (p: number, contentMin: number, contentMax: number, viewLo: number, viewHi: number): { v: number; hit: boolean } => {
            const lo = viewHi - m - scale * contentMax;
            const hi = viewLo + m - scale * contentMin;
            if (lo <= hi) {
                const v = Math.min(Math.max(p, lo), hi);
                return { v, hit: v !== p };
            }
            return { v: (viewLo + viewHi) / 2 - scale * (contentMin + contentMax) / 2, hit: true };
        };
        const cx = clampAxis(world.x, this.boundsMin.x, this.boundsMax.x, viewMin.x, viewMax.x);
        const cy = clampAxis(world.y, this.boundsMin.y, this.boundsMax.y, viewMin.y, viewMax.y);
        if (cx.hit || cy.hit) this.velocity.set(0, 0, 0);
        const target = this.worldToLocalPos(new Vec3(cx.v, cy.v, 0));
        this.node.setPosition(target.x, target.y, 0);
        return cx.hit || cy.hit;
    }

    /** 世界坐标 → 本节点局部坐标：父级 Canvas 缩放为 1，仅差父级原点平移（Canvas 世界位置 (640,360)） */
    private worldToLocalPos(world: Vec3): Vec3 {
        const parent = this.node.parent;
        const origin = parent ? parent.worldPosition : Vec3.ZERO;
        return new Vec3(world.x - origin.x, world.y - origin.y, 0);
    }

    private clampScale(scale: number): number {
        const min = this.fitScale;
        const max = this.fitScale * Math.max(this.zoomMax, 1);
        return Math.min(Math.max(scale, min), max);
    }

    private setScale(scale: number): void {
        this.node.setScale(scale, scale, 1);
    }

    private midScreen(a: TouchTrack, b: TouchTrack): Vec3 {
        return new Vec3((a.lastScreen.x + b.lastScreen.x) / 2, (a.lastScreen.y + b.lastScreen.y) / 2, 0);
    }

    private screenVec(event: { getLocation(): Vec2 }): Vec3 {
        const p = event.getLocation();
        return new Vec3(p.x, p.y, 0);
    }

    /** 屏幕 → 世界：与 GameManager.touchToWorld 同一接缝（渲染相机 screenToWorld） */
    private worldFromScreen(screen: Vec3): Vec3 {
        if (this.renderCamera) return this.renderCamera.screenToWorld(screen.clone());
        return screen.clone(); // 无相机退化：与 getUILocation 兜底口径一致
    }

    private viewMin(): Vec3 {
        const half = this.viewHalf();
        return new Vec3(this.cameraCenter().x - half.x, this.cameraCenter().y - half.y, 0);
    }

    private viewMax(): Vec3 {
        const half = this.viewHalf();
        return new Vec3(this.cameraCenter().x + half.x, this.cameraCenter().y + half.y, 0);
    }

    private cameraCenter(): Vec3 {
        return this.renderCamera ? this.renderCamera.node.worldPosition : new Vec3(0, 0, 0);
    }

    /**
     * 视口半宽/半高（世界单位）：可视区尺寸就是 Canvas 适配后给相机设置的 ortho 范围
     * （fitWidth/fitHeight 的定义本身），设计单位与世界单位 1:1，与渲染必然一致。
     * 不读 orthoHeight/aspect 属性——Canvas 相机的 aspect 属性实测停留在 0。
     */
    private viewHalf(): Vec3 {
        const size = view.getVisibleSize();
        if (!(size.width > 0 && size.height > 0)) return new Vec3(640, 360, 0);
        return new Vec3(size.width / 2, size.height / 2, 0);
    }

    // ---------- 惯性速度 ----------

    private pushSample(world: Vec3): void {
        const now = Date.now();
        this.samples.push({ t: now, p: world.clone() });
        while (this.samples.length > 2 && now - this.samples[0].t > VELOCITY_WINDOW_MS) this.samples.shift();
    }

    private startInertiaFromSamples(): void {
        this.velocity.set(0, 0, 0);
        if (this.inertiaTau <= 0 || this.samples.length < 2) return;
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt <= 0.005) return;
        const v = new Vec3((last.p.x - first.p.x) / dt, (last.p.y - first.p.y) / dt, 0);
        if (v.length() > INERTIA_V_MAX) v.multiplyScalar(INERTIA_V_MAX / v.length());
        if (v.length() >= INERTIA_V_MIN) this.velocity = v;
    }

    private stopInertia(): void {
        this.velocity.set(0, 0, 0);
    }

    private isInertia(): boolean {
        return this.velocity.length() > 0;
    }
}
