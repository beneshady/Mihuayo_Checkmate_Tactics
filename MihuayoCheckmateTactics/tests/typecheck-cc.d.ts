// 类型检查用垫片：cc 模块的离线最小声明（成员一律 any），使 tsc 能检查我们自己的类型逻辑。
// 仅用于 `node tsc -p tsconfig.typecheck.json`；运行时/编辑器由 Cocos 自带声明接管，本文件不参与构建。
declare module 'cc' {
    export class Vec2 {
        x: number;
        y: number;
        constructor(x?: number, y?: number);
        static [k: string]: any;
        [k: string]: any;
    }
    export class Vec3 {
        x: number;
        y: number;
        z: number;
        constructor(x?: number, y?: number, z?: number);
        static [k: string]: any;
        [k: string]: any;
    }
    export class Vec4 {
        x: number;
        y: number;
        z: number;
        w: number;
        constructor(x?: number, y?: number, z?: number, w?: number);
        static [k: string]: any;
        [k: string]: any;
    }
    export class Color {
        r: number;
        g: number;
        b: number;
        a: number;
        constructor(r?: number, g?: number, b?: number, a?: number);
        static [k: string]: any;
        [k: string]: any;
    }
    export class Node {
        name: string;
        active: boolean;
        parent: Node | null;
        children: Node[];
        layer: number;
        position: Vec3;
        scale: Vec3;
        worldMatrix: any;
        constructor(name?: string);
        addChild(child: Node): void;
        removeChild(child: Node): void;
        removeAllChildren(): void;
        destroyAllChildren(): void;
        destroy(): void;
        setPosition(x: number, y: number, z?: number): void;
        setScale(x: number, y: number, z?: number): void;
        setSiblingIndex(index: number): void;
        getSiblingIndex(): number;
        getComponent<T>(type: new (...args: any[]) => T): T;
        addComponent<T>(type: new (...args: any[]) => T): T;
        on(type: string, callback: (...args: any[]) => void, target?: any): void;
        off(type: string, callback: (...args: any[]) => void, target?: any): void;
        static [k: string]: any;
        [k: string]: any;
    }
    export class Component {
        node: Node;
        getComponent<T>(type: new (...args: any[]) => T): T;
        addComponent<T>(type: new (...args: any[]) => T): T;
        scheduleOnce(callback: (...args: any[]) => void, delay?: number): void;
        unscheduleAllCallbacks(): void;
        static [k: string]: any;
        [k: string]: any;
    }
    export class UITransform { [k: string]: any; }
    export class Sprite { static [k: string]: any; [k: string]: any; }
    export class SpriteFrame { [k: string]: any; }
    export class Label { [k: string]: any; }
    export class Graphics { [k: string]: any; }
    export class Button { static [k: string]: any; [k: string]: any; }
    export class Canvas { [k: string]: any; }
    export class Camera { [k: string]: any; }
    export class Prefab { [k: string]: any; }
    export class JsonAsset { [k: string]: any; }
    export class AudioClip { [k: string]: any; }
    export class AudioSource { [k: string]: any; }
    export class UIOpacity { [k: string]: any; }
    export class BlockInputEvents { [k: string]: any; }
    export class EventTouch {
        getLocation(): Vec2;
        getUILocation(): Vec2;
        getID(): number;
        [k: string]: any;
    }
    export class EventMouse {
        getLocation(): Vec2;
        getUILocation(): Vec2;
        [k: string]: any;
    }
    export class Tween<T = any> {
        to(duration: number, props: any, opts?: any): Tween<T>;
        start(): Tween<T>;
        stop(): Tween<T>;
        static stopAllByTarget(target: any): void;
        static [k: string]: any;
        [k: string]: any;
    }
    export const _decorator: { ccclass: any; property: any };
    export const director: any;
    export const input: any;
    export const Input: any;
    export const sys: any;
    export const view: any;
    export const resources: {
        load(url: string, type: any, onComplete: (err: Error | null, asset: any) => void): void;
        load(url: string, onComplete: (err: Error | null, asset: any) => void): void;
    };
    export function instantiate(original: any): any;
    export function tween<T = any>(target?: T): Tween<T>;
    export function log(...args: any[]): void;
    export function warn(...args: any[]): void;
    export function error(...args: any[]): void;
}
