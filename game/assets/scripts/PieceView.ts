import { _decorator, Component, Node, Mesh, MeshRenderer, Material, Color, utils, primitives, Tween, tween, Vec3 } from 'cc';
import { Unit } from './rules/game';
const { ccclass } = _decorator;
// 分层圆柱组成有厚度的象棋占位模型；规则仍使用二维棋位。
@ccclass('PieceView')
export class PieceView extends Component {
  private materials: Material[] = [];
  private built = false;
  private meshes: Mesh[] = [];
  private body: Node | null = null;
  private sourceMaterial: Material = null!;
  initialize(u: Unit, sourceMaterial: Material): void {
    if (!this.built) {
      this.built = true;
      this.sourceMaterial = sourceMaterial;
      const enemy = u.side === 'enemy';
      const base = this.material(enemy ? '#293d52' : '#963e31');
      const rim = this.material(enemy ? '#5b7890' : '#cb7851');
      const face = this.material('#f2e3c3');
      const shadow = this.material('#514a41');
      const height = u.kind === 'king' ? .46 : .32;
      const contact = this.cylinder('接触阴影', .46, .46, .012, .012, shadow);
      contact.setPosition(.08,.012,-.05);
      this.body = this.cylinder('棋子侧壁', .37, .42, height, height/2+.025, base);
      this.cylinder('下沿倒角', .40, .43, .07, .06, rim);
      this.cylinder('上沿', .40, .37, .07, height+.035, rim);
      this.cylinder('象棋字面', .33, .33, .026, height+.08, face);
    }
  }
  private material(hex: string): Material {
    const m = new Material(); m.copy(this.sourceMaterial); m.setProperty('mainColor', new Color().fromHEX(hex)); m.setProperty('roughness',.85); m.setProperty('metallic',0); this.materials.push(m); return m;
  }
  private cylinder(name: string, top: number, bottom: number, height: number, y: number, mat: Material): Node {
    const n = new Node(name); this.node.addChild(n); n.setPosition(0,y,0);
    const mesh = n.addComponent(MeshRenderer); mesh.mesh = utils.createMesh(primitives.cylinder(top,bottom,height,{radialSegments:24})); this.meshes.push(mesh.mesh); mesh.setMaterial(mat, 0); return n;
  }
  moveTo(position: Vec3, animated: boolean): void {
    Tween.stopAllByTarget(this.node);
    if (animated) tween(this.node).to(.16, { position }, { easing: 'quadOut' }).start(); else this.node.setPosition(position);
  }
  flash(): void {
    if (this.body) tween(this.body).to(.06, { scale: new Vec3(1.08,1.08,1.08) }).to(.09, { scale: new Vec3(1,1,1) }).start();
  }
  onDestroy(): void { Tween.stopAllByTarget(this.node); if(this.body) Tween.stopAllByTarget(this.body); this.meshes.forEach(m=>m.destroy()); this.materials.forEach(m => m.destroy()); }
}
