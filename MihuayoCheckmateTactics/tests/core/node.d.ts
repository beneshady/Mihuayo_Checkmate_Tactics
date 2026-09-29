// 测试运行的 Node 环境最小声明（避免引入 @types/node 依赖）。
declare const __dirname: string;
declare function require(id: string): any;
declare const process: { exit(code?: number): never };

declare module 'fs' {
    export function readFileSync(path: string, encoding: string): string;
    export function existsSync(path: string): boolean;
}

declare module 'path' {
    export function join(...segments: string[]): string;
}
