"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findProjectRoot = findProjectRoot;
exports.buildDefs = buildDefs;
const fs_1 = require("fs");
const path_1 = require("path");
const UnitDefs_1 = require("../../assets/Scripts/Core/UnitDefs");
/**
 * 从编译输出向上搜索项目根（以 assets/Defs/unit-defs.json 为锚），
 * 不依赖 outDir 嵌套层数。运行在 Node（CJS 编译产物）下。
 */
function findProjectRoot() {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        if ((0, fs_1.existsSync)((0, path_1.join)(dir, 'assets', 'Defs', 'unit-defs.json'))) {
            return dir;
        }
        dir = (0, path_1.join)(dir, '..');
    }
    throw new Error('找不到项目根（未发现 assets/Defs/unit-defs.json）');
}
/** 从 assets/Defs/unit-defs.json 读取真实棋种定义（单一事实源，避免测试内联数值漂移） */
function buildDefs() {
    const raw = (0, fs_1.readFileSync)((0, path_1.join)(findProjectRoot(), 'assets', 'Defs', 'unit-defs.json'), 'utf8');
    return (0, UnitDefs_1.parseUnitDefs)(JSON.parse(raw));
}
