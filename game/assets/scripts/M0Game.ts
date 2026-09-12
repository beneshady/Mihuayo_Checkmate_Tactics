import { _decorator, Component, Node, Camera, UITransform, Label, Graphics, Color, Widget, SafeArea, Button, Prefab, instantiate, view, ResolutionPolicy, Vec3, Rect, input, Input, EventTouch, game, Game, Mesh, MeshRenderer, Material, utils, primitives, Layers } from 'cc';
import { State, Position, Analysis, newGame, legalActions, submit, enemyPhase, endTurn, buy, nextWave, escapeAnalysis, king, at, same, copy } from './rules/game';
import { PieceView } from './PieceView';
const { ccclass, property } = _decorator;
const names = { king: '帅', rook: '车', horse: '马', cannon: '炮', pawn: '卒' };
const ink = new Color(234, 224, 199), gold = new Color(236, 189, 103), red = new Color(231, 112, 96), teal = new Color(110, 185, 167);
@ccclass('M0Game')
export class M0Game extends Component {
  @property(Node) boardRoot: Node = null!;
  @property(Node) unitsRoot: Node = null!;
  @property(Node) cameraNode: Node = null!;
  @property(Node) uiRoot: Node = null!;
  @property(Prefab) piecePrefab: Prefab = null!;
  @property(Material) chessMaterial: Material = null!;
  private state: State = newGame();
  private camera: Camera = null!;
  private safe: Node = null!;
  private labels: Node = null!;
  private overlay: Node = null!;
  private paths: Graphics = null!;
  private header: Label = null!;
  private detail: Label = null!;
  private notice: Label = null!;
  private selected = '';
  private target: Position | undefined;
  private boot = true;
  private paused = false;
  private busy = false;
  private confirmEnd = false;
  private analysis: Generator<void, Analysis, void> | undefined;
  private revision = 0;
  private pieces = new Map<string, PieceView>();
  private boardMaterial: Material[] = [];
  private boardMeshes: Mesh[] = [];
  private hint = '先看敌方意图，再选择己方棋子';
  start(): void {
    if (!this.boardRoot || !this.unitsRoot || !this.cameraNode || !this.uiRoot || !this.piecePrefab || !this.chessMaterial) throw new Error('M0Game 缺少 Scene 引用（含 chessMaterial）；请执行 tools/assemble-m0.mjs');
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
    this.camera = this.cameraNode.getComponent(Camera)!;
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.cameraNode.setPosition(12, 14, 12); this.cameraNode.lookAt(new Vec3(0, 0, 0));
    this.camera.clearColor = new Color(35, 44, 55); this.camera.visibility = Layers.Enum.DEFAULT;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.node.scene.getChildByName('Main Light')?.setRotationFromEuler(-55,-35,0);
    this.makeBoard(); this.makeUI(); this.layout(); this.render();
    view.on('canvas-resize', this.layout, this);
    this.scheduleOnce(()=>this.layout(), .05);
    input.on(Input.EventType.TOUCH_END, this.touch, this);
    game.on(Game.EVENT_HIDE, this.hide, this);
  }
  private hide(): void { if (!this.boot && this.state.phase === 'player') { this.paused = true; this.render(); } }
  private world(p: Position, height = 0): Vec3 { return new Vec3(p.x - 4, height, 4.5 - p.y); }
  private makeBoard(): void {
    const material = (hex: string) => { const m = new Material(); m.copy(this.chessMaterial); m.setProperty('mainColor', new Color().fromHEX(hex)); m.setProperty('roughness',.9); m.setProperty('metallic',0); this.boardMaterial.push(m); return m; };
    const wood=material('#63513f'), trim=material('#b48a56'), light=material('#c8b69a');
    const line=material('#6b5643'), friendlyPalace=material('#d1b17d'), enemyPalace=material('#9eafb5'), river=material('#718b93');
    const box = (name: string, p: Vec3, scale: Vec3, m: Material) => { const n = new Node(name); this.boardRoot.addChild(n); n.setPosition(p); n.setScale(scale); const r = n.addComponent(MeshRenderer); r.mesh = utils.createMesh(primitives.box()); this.boardMeshes.push(r.mesh); r.setMaterial(m, 0); return n; };
    box('厚木棋盘',new Vec3(0,-.40,0),new Vec3(9.65,.65,10.65),wood);
    box('棋盘镶边',new Vec3(0,-.10,0),new Vec3(9.45,.10,10.45),trim);
    for(let y=0;y<10;y++)for(let x=0;x<9;x++){
      const palace=x>=3&&x<=5&&(y<=2||y>=7);
      box(palace?'九宫棋位':'棋位',this.world({x,y},-.03),new Vec3(1,.06,1),palace?(y<=2?friendlyPalace:enemyPalace):light);
    }
    const stroke=(name:string,from:Position,to:Position,width=.022)=>{
      const a=this.world(from,.02),b=this.world(to,.02),n=box(name,new Vec3((a.x+b.x)/2,.02,(a.z+b.z)/2),new Vec3(Vec3.distance(a,b),.025,width),line);
      n.setRotationFromEuler(0,-Math.atan2(b.z-a.z,b.x-a.x)*180/Math.PI,0);
    };
    for(let x=0;x<9;x++){stroke('纵线',{x,y:0},{x,y:4});stroke('纵线',{x,y:5},{x,y:9});}
    for(let y=0;y<10;y++)stroke('横线',{x:0,y},{x:8,y});
    box('楚河汉界',new Vec3(0,.005,0),new Vec3(8.95,.015,.25),river);
    for(const y of [0,7]){
      stroke('九宫米字斜线',{x:3,y},{x:5,y:y+2},.04);
      stroke('九宫米字斜线',{x:5,y},{x:3,y:y+2},.04);
    }
  }
  private uiNode(name: string, parent: Node, w: number, h: number): Node {
    const n=new Node(name); n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.addComponent(UITransform).setContentSize(w,h);return n;
  }
  private text(parent: Node, name: string, text: string, size=24, width=640, height=60): Label {
    const n=this.uiNode(name,parent,width,height), l=n.addComponent(Label);l.string=text;l.fontSize=size;l.lineHeight=size+7;l.color=ink;l.overflow=Label.Overflow.SHRINK;l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;return l;
  }
  private anchor(n: Node, edge: 'top'|'bottom'|'center', offset: number): void {
    const w=n.addComponent(Widget);w.isAlignHorizontalCenter=true;w.horizontalCenter=0;
    if(edge==='top'){w.isAlignTop=true;w.top=offset;}else if(edge==='bottom'){w.isAlignBottom=true;w.bottom=offset;}else{w.isAlignVerticalCenter=true;w.verticalCenter=offset;}w.updateAlignment();
  }
  private button(parent: Node, text: string, x: number, y: number, fn: ()=>void, width=196): Node {
    const n=this.uiNode(text,parent,width,58);n.setPosition(x,y);const g=n.addComponent(Graphics);g.fillColor=new Color(51,73,67);g.roundRect(-width/2,-29,width,58,8);g.fill();g.strokeColor=gold;g.lineWidth=1.5;g.stroke();this.text(n,'文字',text,23,width-12,50);
    n.addComponent(Button);n.on(Button.EventType.CLICK,fn,this);return n;
  }
  private makeUI(): void {
    this.safe=this.uiNode('SafeArea',this.uiRoot,720,1280);const w=this.safe.addComponent(Widget);w.isAlignTop=w.isAlignBottom=w.isAlignLeft=w.isAlignRight=true;w.top=w.bottom=w.left=w.right=0;this.safe.addComponent(SafeArea);
    this.header=this.text(this.safe,'HUD','',28,680,62);this.anchor(this.header.node,'top',12);
    this.notice=this.text(this.safe,'威胁','',21,680,48);this.anchor(this.notice.node,'top',76);
    this.labels=this.uiNode('棋子文字',this.uiRoot,720,1280);this.anchor(this.labels,'center',0);
    const paths=this.uiNode('预告路径',this.uiRoot,720,1280);this.anchor(paths,'center',0);this.paths=paths.addComponent(Graphics);paths.setSiblingIndex(0);
    const bottom=this.uiNode('操作栏',this.safe,700,222);this.anchor(bottom,'bottom',24);
    this.detail=this.text(bottom,'动作预览','',21,680,104);this.detail.node.setPosition(0,54);
    this.button(bottom,'执行',-224,-31,()=>this.execute());this.button(bottom,'取消选择',0,-31,()=>{if(this.locked())return;this.selected='';this.target=undefined;this.render();});this.button(bottom,'结束回合',224,-31,()=>this.end());
    this.button(bottom,'暂停',0,-98,()=>{if(this.boot||this.state.phase!=='player')return;this.paused=true;this.render();},160);
    this.overlay=this.uiNode('面板',this.safe,700,670);this.anchor(this.overlay,'center',0);
    this.safe.setSiblingIndex(this.uiRoot.children.length-1);
  }
  private layout(): void {
    if(!this.camera||!this.safe)return;
    const size=view.getVisibleSize();
    this.uiRoot.getComponent(UITransform)!.setContentSize(size.width,size.height);
    this.uiRoot.setPosition(size.width/2,size.height/2,0);
    this.safe.getComponent(Widget)?.updateAlignment();this.safe.getComponent(SafeArea)?.updateArea();
    const safeSize=this.safe.getComponent(UITransform)!.contentSize;
    const h=Math.max(180,safeSize.height-370), bottom=(size.height-safeSize.height)/2+240;
    this.camera.rect=new Rect(0,bottom/size.height,1,h/size.height);
    // 将厚棋盘和棋子高度投影到相机轴，旋转后仍完整落在手机玩法区。
    const right=Vec3.transformQuat(new Vec3(),new Vec3(1,0,0),this.cameraNode.worldRotation);
    const up=Vec3.transformQuat(new Vec3(),new Vec3(0,1,0),this.cameraNode.worldRotation);
    let halfWidth=0,halfHeight=0;
    for(const x of [-4.9,4.9])for(const z of [-5.4,5.4])for(const y of [-.8,1]){
      const corner=new Vec3(x,y,z);halfWidth=Math.max(halfWidth,Math.abs(Vec3.dot(corner,right)));halfHeight=Math.max(halfHeight,Math.abs(Vec3.dot(corner,up)));
    }
    this.camera.orthoHeight=Math.max(halfHeight+.2,(halfWidth+.25)*h/size.width);
    this.camera.camera?.update(true);
    this.render();
  }
  private locked(): boolean { return this.boot||this.paused||this.busy||!!this.analysis||this.state.phase!=='player'; }
  private touch(e: EventTouch): void {
    if(this.locked())return;
    const p=e.getLocation(), ray=this.camera.screenPointToRay(p.x,p.y);
    const ui=e.getUILocation(),size=view.getVisibleSize(),rect=this.camera.rect;
    if(ui.x<rect.x*size.width||ui.x>(rect.x+rect.width)*size.width||ui.y<rect.y*size.height||ui.y>(rect.y+rect.height)*size.height)return;
    if(Math.abs(ray.d.y)<.001)return;const t=-ray.o.y/ray.d.y;if(t<0)return;
    const pos={x:Math.round(ray.o.x+ray.d.x*t+4),y:Math.round(4.5-ray.o.z-ray.d.z*t)};
    if(pos.x<0||pos.x>8||pos.y<0||pos.y>9)return;
    const u=at(this.state,pos);
    if(u?.side==='player'){this.selected=u.id;this.target=undefined;}else if(this.selected){this.target=pos;}
    this.confirmEnd=false;this.render();
  }
  private execute(): void {
    if(this.locked()||!this.target)return;
    const result=submit(this.state,this.selected,this.target);if(!result.effect){this.hint='非法动作，未消耗行动';this.render();return;}
    const oldLevel=this.state.highestLevel;this.state=result.state;
    this.hint=this.state.highestLevel>oldLevel?`车升级至 Lv.${this.state.highestLevel}！`:result.effect.damage.length?`命中 ${result.effect.damage.length} · 击杀 ${result.effect.victims.length}`:'移动完成';
    this.selected='';this.target=undefined;this.confirmEnd=false;this.animateThenAnalyze();
  }
  private end(): void {
    if(this.locked())return;
    if(this.state.units.some(u=>u.side==='player'&&!u.acted)&&!this.confirmEnd){this.confirmEnd=true;this.hint='还有棋子未行动，再点「结束回合」确认';this.render();return;}
    this.state=endTurn(this.state);this.confirmEnd=false;this.selected='';this.target=undefined;this.hint='敌方已按公开顺序执行，新意图已生成';this.animateThenAnalyze();
  }
  private animateThenAnalyze(): void {
    this.busy=true;this.render(true);const revision=this.revision;
    this.scheduleOnce(()=>{if(revision!==this.revision)return;this.busy=false;this.beginAnalysis();},.18);
  }
  private beginAnalysis(): void {
    if(this.state.phase==='player')this.analysis=escapeAnalysis(this.state);this.render();
  }
  update(): void {
    if(!this.analysis||this.paused)return;
    const start=Date.now();do{const step=this.analysis.next();if(step.done){this.analysis=undefined;if(!step.value.safe){this.state=copy(this.state);this.state.phase='result';this.state.result='mate';this.state.intents=[];}this.render();break;}}while(Date.now()-start<5);
  }
  private restart(): void {
    this.revision++;this.unscheduleAllCallbacks();this.analysis=undefined;this.busy=false;this.paused=false;this.boot=false;
    this.state=newGame();this.selected='';this.target=undefined;this.confirmEnd=false;this.hint='先看意图，再选择棋子';this.pieces.forEach(p=>p.node.destroy());this.pieces.clear();this.beginAnalysis();
  }
  private screen(p: Position, height=0): Vec3 { return this.camera.convertToUINode(this.world(p,height),this.uiRoot); }
  private arrow(from: Position,to: Position,color: Color,cancelled: boolean): void {
    const a=this.screen(from,.04),b=this.screen(to,.04),g=this.paths;g.strokeColor=color;g.fillColor=color;g.lineWidth=cancelled?1:3;
    g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();const angle=Math.atan2(b.y-a.y,b.x-a.x);
    g.moveTo(b.x,b.y);g.lineTo(b.x-12*Math.cos(angle-.5),b.y-12*Math.sin(angle-.5));g.lineTo(b.x-12*Math.cos(angle+.5),b.y-12*Math.sin(angle+.5));g.close();g.fill();
    if(cancelled){g.moveTo(b.x-7,b.y-7);g.lineTo(b.x+7,b.y+7);g.moveTo(b.x-7,b.y+7);g.lineTo(b.x+7,b.y-7);g.stroke();}
  }
  private render(animated=false): void {
    if(!this.header)return;
    const s=this.state;
    for(const [id,p] of this.pieces)if(!s.units.some(u=>u.id===id)){p.node.destroy();this.pieces.delete(id);}
    for(const u of s.units){let p=this.pieces.get(u.id);if(!p){const n=instantiate(this.piecePrefab);this.unitsRoot.addChild(n);p=n.getComponent(PieceView)!;p.initialize(u,this.chessMaterial);this.pieces.set(u.id,p);}p.moveTo(this.world(u),animated);}
    this.labels.children.slice().forEach(n=>{n.removeFromParent();n.destroy();});this.paths.clear();
    for(const u of s.units){
      const face=this.text(this.labels,u.id,u.kind==='king'&&u.side==='enemy'?'将':names[u.kind],28,40,38);
      face.node.setPosition(this.screen(u,u.kind==='king'?.56:.42));face.isBold=true;face.color=u.side==='enemy'?new Color(30,51,71):new Color(136,42,31);
      const status=`${u.kind==='king'?`♥${u.hp}`:u.kind==='rook'&&u.side==='player'?`Lv.${u.level}`:''}${u.side==='player'&&u.acted?' ✓':''}`;
      if(status){const badge=this.text(this.labels,`${u.id}-状态`,status,18,78,28);badge.node.setPosition(this.screen(u,1));badge.color=u.acted?new Color(160,169,177):ink;}
    }
    const prediction=enemyPhase(s), hp=king(s,'player')?.hp??0, afterHP=king(prediction.state,'player')?.hp??0;
    this.header.string=`弈阵  /  ${s.wave}—2 波  ·  回合 ${s.turn}  ·  帅 ♥${hp}`;
    this.notice.string=this.analysis?'分析局势…':this.busy?'结算中…':hp>afterHP?`将军：直接结束将受 ${hp-afterHP} 点伤害`:'公开意图已锁定位置 · 编号为执行顺序';this.notice.color=hp>afterHP?red:teal;
    for(const i of s.intents){const effect=prediction.effects.find(e=>e.actor===i.actor), cancelled=!effect||effect.status==='cancelled'||effect.status==='removed';this.arrow(i.from,i.to,cancelled?new Color(100,111,103):i.type==='attack'?red:teal,cancelled);const l=this.text(this.labels,`意图${i.order}`,`${i.order}${cancelled?'×':effect?.status==='miss'?'空':''}`,18,50,28);const p=this.screen(i.from,.1);p.x+=24;l.node.setPosition(p);l.color=gold;}
    const chosen=s.units.find(u=>u.id===this.selected);let description=this.hint;
    if(chosen){description=`${names[chosen.kind]}${chosen.acted?' · 已行动':' · 可行动'}${chosen.kind==='rook'?`  Lv.${chosen.level} / XP ${chosen.xp}`:''}`;
      if(!chosen.acted)for(const a of legalActions(s,chosen.id)){const p=this.screen(a.to,.03);this.paths.fillColor=a.type==='attack'?red:gold;this.paths.circle(p.x,p.y,5);this.paths.fill();}
      if(this.target){const preview=submit(s,chosen.id,this.target);if(preview.effect){const a=legalActions(s,chosen.id).find(a=>same(a.to,this.target!))!;let actualPath=a.path;
        const bossIndex=actualPath.findIndex(p=>at(s,p)?.kind==='king');if(bossIndex>=0)actualPath=actualPath.slice(0,bossIndex+1);
        let from=a.from;for(const p of actualPath){this.arrow(from,p,gold,false);from=p;}
        const e=preview.effect,pred=enemyPhase(preview.state).state;description+=`\n命中 ${e.damage.length} / 击杀 ${e.victims.length} · 落点 (${e.to.x},${e.to.y})\n执行后直接结束：帅 ♥${king(pred,'player')?.hp??0}${preview.state.phase==='shop'?' · 本波斩将':''}`;
      }else description+='\n此处不可执行，未消耗行动';}
    }
    this.detail.string=description;
    this.panel();
  }
  private panel(): void {
    this.overlay.children.slice().forEach(n=>{n.removeFromParent();n.destroy();});this.overlay.active=this.boot||this.paused||this.state.phase!=='player';if(!this.overlay.active)return;
    const bg=this.uiNode('面板背景',this.overlay,690,640),g=bg.addComponent(Graphics);g.fillColor=new Color(18,31,32,250);g.roundRect(-345,-320,690,640,18);g.fill();g.strokeColor=gold;g.lineWidth=2;g.stroke();
    const title=(text:string,sub:string)=>{this.text(bg,'标题',text,38,640,80).node.setPosition(0,220);this.text(bg,'说明',sub,24,630,180).node.setPosition(0,75);};
    if(this.boot){title('弈阵 · 立体象棋','2.5D 战术原型\n先看预告 → 点棋子 → 点目标 → 执行\n主帅在九宫内沿横竖与米字线走一步');this.button(bg,'进入游戏',0,-100,()=>this.restart(),270);}
    else if(this.paused){title('已暂停','继续后保留当前局面与行动次数');this.button(bg,'继续',0,-70,()=>{this.paused=false;this.render();},270);this.button(bg,'重新开始',0,-150,()=>this.restart(),270);}
    else if(this.state.phase==='shop'){const r=this.state.units.find(u=>u.kind==='rook');title('第一波斩将 · 补充守军',`金币 ${this.state.gold} · 帅 ♥${king(this.state,'player')?.hp}\n${r?`车 Lv.${r.level} / XP ${r.xp}`:'车已阵亡'}\n最多购买一枚，血量与成长继承`);const purchase=(kind:'horse'|'cannon')=>{this.state=buy(this.state,kind);this.render();};const h=this.button(bg,'马 · 2 金币',-155,-70,()=>purchase('horse'),270),c=this.button(bg,'炮 · 2 金币',155,-70,()=>purchase('cannon'),270);h.getComponent(Button)!.interactable=c.getComponent(Button)!.interactable=!this.state.bought&&this.state.gold>=2;this.button(bg,'进入第二波',0,-160,()=>{this.state=nextWave(this.state);this.selected='';this.target=undefined;this.beginAnalysis();},300);}
    else {title(this.state.result==='victory'?'胜利':this.state.result==='mate'?'将死，无可用解围方案':'主帅阵亡',`到达第 ${this.state.wave} 波 · ${this.state.turn} 回合\n总击杀 ${this.state.kills} · 车最高 Lv.${this.state.highestLevel}`);this.button(bg,'重新开始',0,-120,()=>this.restart(),300);}
  }
  onDestroy(): void {
    this.revision++;this.analysis=undefined;this.unscheduleAllCallbacks();view.off('canvas-resize',this.layout,this);input.off(Input.EventType.TOUCH_END,this.touch,this);game.off(Game.EVENT_HIDE,this.hide,this);
    this.boardMeshes.forEach(m=>m.destroy());this.boardMaterial.forEach(m=>m.destroy());
  }
}
