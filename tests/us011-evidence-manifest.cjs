// 生成本轮证据清单：文件哈希、外部参考/接收方来源、命令与未提交状态。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'us', 'us011-json-evidence');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out.sort();
}
function git(args) { try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); } catch (e) { return null; } }

const ourFiles = [
  'web/editor.html', 'web/editor.css', 'web/js/editor.js', 'web/js/mapjson.js',
  'tests/mapjson.test.cjs', 'tests/us011-mapjson-browser.cjs', 'tests/us011-mapjson-fixtures.cjs',
  'tests/us011-mapjson-receiver.cjs', 'tests/us011-static-server.cjs', 'tests/us011-evidence-check.cjs', 'tests/us011-evidence-manifest.cjs',
  'docs/us/US-011-map-piece-editor.md',
];
const referencePath = process.env.M0_REFERENCE_LEVEL || 'D:\\Projects\\mihuayou\\develop_suzukaze\\MihuayoCheckmateTactics\\assets\\resources\\Levels\\level-01.json';
const receiverRoot = process.env.M0_RECEIVER_ROOT || 'D:\\Projects\\mihuayou\\develop_suzukaze\\MihuayoCheckmateTactics';
const manifest = {
  task: 'US-011 2026-10-23 标准地图 JSON 导入与保存并导出',
  runId: process.env.DSH_RUN_ID || '20261023T141319051Z-819e8000',
  generatedAt: new Date().toISOString(),
  git: {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(['rev-parse', 'HEAD']),
    headTime: git(['log', '-1', '--format=%ci']),
    status: git(['status', '--porcelain=v1', '-uall']).split(/\r?\n/).filter(Boolean),
  },
  files: Object.fromEntries(ourFiles.map((f) => [f, sha256(path.join(root, f))])),
  evidence: Object.fromEntries(walk(evidence).filter((f) => rel(f) !== 'docs/us/us011-json-evidence/manifest.json').map((f) => [rel(f), sha256(f)])),
  reference: { path: referencePath, sha256: fs.existsSync(referencePath) ? sha256(referencePath) : null, mode: '只读，未写入' },
  receiver: {
    root: receiverRoot,
    head: git(['-C', receiverRoot, 'rev-parse', 'HEAD']),
    'assets/Scripts/Core/BattleState.ts': fs.existsSync(path.join(receiverRoot, 'assets/Scripts/Core/BattleState.ts')) ? sha256(path.join(receiverRoot, 'assets/Scripts/Core/BattleState.ts')) : null,
    'assets/Scripts/Core/Config.ts': fs.existsSync(path.join(receiverRoot, 'assets/Scripts/Core/Config.ts')) ? sha256(path.join(receiverRoot, 'assets/Scripts/Core/Config.ts')) : null,
    usage: '只读复制到 tmp/us011-json-receiver 并仅改 ESM 导入说明符；不写入外部仓库、不引入引擎。',
  },
  commands: [
    { command: 'node --test tests/mapjson.test.cjs tests/maps.test.cjs', result: '19 tests / 19 pass', log: 'docs/us/us011-json-evidence/unit-tests.log' },
    { command: 'node tests/us011-mapjson-browser.cjs', result: 'PASS 12 场景（J01～J11 及刷新/读回）', log: 'docs/us/us011-json-evidence/browser-run.log', resultFile: 'docs/us/us011-json-evidence/browser-result.json' },
    { command: 'node tests/us011-mapjson-receiver.cjs', result: 'PASS 8 个实际下载文件 + 1 个拒绝对照', log: 'docs/us/us011-json-evidence/receiver-run.log', resultFile: 'docs/us/us011-json-evidence/receiver-result.json' },
    { command: 'node tests/us011-evidence-check.cjs', result: 'PASS 8 张截图', log: 'docs/us/us011-json-evidence/screenshot-check.log', resultFile: 'docs/us/us011-json-evidence/screenshot-check.json' },
    { command: 'node --check web/js/mapjson.js && node --check web/js/editor.js', result: '语法检查通过' },
  ],
  unverified: [
    '本运行环境模型不接受图像输入，截图由像素/几何检查补充（screenshot-check.json），未做人工目视可读性确认；PNG 已保留给主策划目视。',
    '未提交、未推送、未合并、未部署；本轮改动均为未提交状态。',
  ],
};
fs.writeFileSync(path.join(evidence, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('manifest written · files=' + Object.keys(manifest.files).length + ' evidence=' + Object.keys(manifest.evidence).length + ' statusLines=' + manifest.git.status.length);
