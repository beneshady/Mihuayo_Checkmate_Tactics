import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseUnitDefs, UnitDef } from '../../assets/Scripts/Core/UnitDefs';

/**
 * 从编译输出向上搜索项目根（以 assets/Defs/unit-defs.json 为锚），
 * 不依赖 outDir 嵌套层数。运行在 Node（CJS 编译产物）下。
 */
export function findProjectRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, 'assets', 'Defs', 'unit-defs.json'))) {
            return dir;
        }
        dir = join(dir, '..');
    }
    throw new Error('找不到项目根（未发现 assets/Defs/unit-defs.json）');
}

/** 从 assets/Defs/unit-defs.json 读取真实棋种定义（单一事实源，避免测试内联数值漂移） */
export function buildDefs(): UnitDef[] {
    const raw = readFileSync(join(findProjectRoot(), 'assets', 'Defs', 'unit-defs.json'), 'utf8');
    return parseUnitDefs(JSON.parse(raw));
}
