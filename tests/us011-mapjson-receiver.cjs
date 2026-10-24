// J03：把浏览器实际下载的地图 JSON 交给接收方（MihuayoCheckmateTactics）纯数据模块
// BattleState.ts 的 parseBattleState / validateMap 解析校验。只读复制到临时目录转译，
// 不写入外部仓库、不引入引擎依赖。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'us', 'us011-json-evidence');
const tempDir = path.join(root, 'tmp', 'us011-json-receiver');
const receiverRoot = process.env.M0_RECEIVER_ROOT || 'D:\\Projects\\mihuayou\\develop_suzukaze\\MihuayoCheckmateTactics';
const srcDir = path.join(receiverRoot, 'assets', 'Scripts', 'Core');
const runnerFile = path.join(tempDir, 'receiver-runner.mjs');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const report = {
  task: 'J03 接收方纯数据解析与地图校验（只读外部项目）', runId: process.env.DSH_RUN_ID || '20261023T141319051Z-819e8000',
  startedAt: new Date().toISOString(), receiver: { root: receiverRoot, node: process.version }, files: [], cases: [], result: 'FAIL',
};

function gitHead(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch (e) { return null; }
}
function copyAndTranspile() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  const configSrc = path.join(srcDir, 'Config.ts'), battleSrc = path.join(srcDir, 'BattleState.ts');
  for (const file of [configSrc, battleSrc]) if (!fs.existsSync(file)) throw Error('缺少接收方纯数据模块：' + file);
  fs.copyFileSync(configSrc, path.join(tempDir, 'Config.ts'));
  const original = fs.readFileSync(battleSrc, 'utf8');
  const transformed = original.replace("from './Config'", "from './Config.ts'");
  if (transformed === original) throw Error('未找到预期的 ./Config 导入说明符，拒绝静默改动源码');
  fs.writeFileSync(path.join(tempDir, 'BattleState.ts'), transformed);
  report.receiver.head = gitHead(receiverRoot);
  report.receiver.source = {
    'assets/Scripts/Core/BattleState.ts': sha256(battleSrc),
    'assets/Scripts/Core/Config.ts': sha256(configSrc),
  };
  report.receiver.transpile = {
    note: '只读复制到临时目录；仅将 ESM 导入说明符 ./Config 改为 ./Config.ts，语义未改；Node 24 原生类型剥离运行，无引擎依赖。',
    'Config.ts': sha256(path.join(tempDir, 'Config.ts')),
    'BattleState.ts': sha256(path.join(tempDir, 'BattleState.ts')),
  };
}
function writeRunner() {
  fs.writeFileSync(runnerFile, `
import fs from 'node:fs';
import { parseBattleState, validateMap, terrainAt } from './BattleState.ts';
const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = { file };
try {
  const s = parseBattleState(raw);
  out.parsed = {
    formatVersion: s.formatVersion,
    meta: { kind: s.meta.kind, battleId: s.meta.battleId, displayName: s.meta.displayName ?? null },
    mapName: s.map.name ?? null,
    unitCount: s.units.length,
    turn: s.turn,
  };
  out.tiles = {};
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) out.tiles[x + ',' + y] = terrainAt(s.map, x, y);
  out.units = s.units.map((u) => ({ id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y }));
  out.validateMap = validateMap(s.map, s.units);
} catch (e) {
  out.error = { name: e.name, message: e.message, path: e.path ?? null };
}
console.log(JSON.stringify(out));
`);
}
function runParser(file) {
  const stdout = execFileSync(process.execPath, ['--experimental-strip-types', runnerFile, file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(stdout.trim().split(/\r?\n/).pop());
}
function assert(cond, message) { if (!cond) throw Error(message); }

try {
  copyAndTranspile();
  writeRunner();
  const browser = JSON.parse(fs.readFileSync(path.join(evidence, 'browser-result.json'), 'utf8'));
  assert(browser.result === 'PASS', '浏览器验收结果不是 PASS，不能作为 J03 输入');
  assert(Array.isArray(browser.exports) && browser.exports.length > 0, 'browser-result 缺少实际下载的导出记录');
  for (const item of browser.exports) {
    const file = path.join(root, item.file);
    assert(fs.existsSync(file), '缺少实际下载文件：' + item.file);
    const parsed = runParser(file);
    assert(!parsed.error, item.name + ' 应可被接收方 parseBattleState 读取：' + JSON.stringify(parsed.error));
    assert(parsed.parsed.formatVersion === 2, item.name + ' formatVersion 应为 2');
    assert(parsed.parsed.meta.kind === 'battleInit', item.name + ' meta.kind 应为 battleInit');
    assert(parsed.parsed.meta.battleId === item.draft.levelCode, item.name + ' battleId 应与编辑器关卡编号一致');
    assert(parsed.parsed.meta.displayName === item.draft.levelName, item.name + ' displayName 应与编辑器关卡名称一致');
    assert(parsed.parsed.mapName === item.draft.name, item.name + ' map.name 应与编辑器地图名称一致');
    assert(parsed.parsed.unitCount === item.draft.units.length, item.name + ' 棋子数应一致');
    assert(Array.isArray(parsed.validateMap) && parsed.validateMap.length === 0, item.name + ' 接收方 validateMap 应无错误：' + JSON.stringify(parsed.validateMap));
    assert(JSON.stringify(parsed.tiles) === JSON.stringify(item.draft.tiles), item.name + ' 81 格地形应与编辑器草稿一致');
    const expectedUnits = item.draft.units.map((u) => ({ id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y }));
    assert(JSON.stringify(parsed.units) === JSON.stringify(expectedUnits), item.name + ' 棋子 id/阵营/棋种/坐标应与编辑器草稿一致');
    report.files.push({
      name: item.name, file: item.file, sha256: sha256(file), rng: item.doc.rng,
      receiver: { tiles: Object.keys(parsed.tiles).length, units: parsed.units.length, validateMap: parsed.validateMap },
    });
  }
  // 对照：同一解析器对未知棋种确实报错，证明不是空校验。
  const controlFile = path.join(evidence, 'fixtures', 'unknown-kind.json');
  const control = runParser(controlFile);
  assert(control.error && control.error.path === '$.units[1].kind', '对照夹具应由接收方解析器拒绝未知棋种，实际：' + JSON.stringify(control));
  report.control = { file: rel(controlFile), error: control.error };
  report.command = 'node --experimental-strip-types tmp/us011-json-receiver/receiver-runner.mjs <下载文件>';
  report.result = 'PASS';
} catch (e) {
  report.failure = { message: e.message, stack: e.stack };
  console.error(e);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidence, 'receiver-result.json'), JSON.stringify(report, null, 2));
  console.log(report.result + ' J03 receiver check · files=' + report.files.length);
}
