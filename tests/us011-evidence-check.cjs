// US011 截图与证据完整性检查：PNG 可解码、尺寸符合视口、关键 UI 颜色实际渲染。
// 说明：本运行环境模型不接收图像输入，无法人工目视截图；这里用像素与几何证据补充，
// 截图同时保留给主策划直接查看。
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs'));

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'us', 'us011-json-evidence');
const shotsDir = path.join(evidence, 'screenshots');
const report = { task: 'US011 证据检查：截图解码、尺寸与关键 UI 像素', runId: process.env.DSH_RUN_ID || '20261023T141319051Z-819e8000', startedAt: new Date().toISOString(), screenshots: [], result: 'FAIL' };
const COLORS = { land: [218, 195, 145], water: [74, 146, 193], saveButton: [116, 80, 32], status: [37, 59, 87], errorText: [255, 198, 190], cracked: [182, 167, 143] };
function countColors(png) {
  const counts = {}, key = (i) => png.data[i] + ',' + png.data[i + 1] + ',' + png.data[i + 2];
  const wanted = new Map(Object.entries(COLORS).map(([k, v]) => [v.join(','), k]));
  for (const name of Object.keys(COLORS)) counts[name] = 0;
  const distinct = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    const k = key(i);
    distinct.add(k);
    const name = wanted.get(k);
    if (name) counts[name]++;
  }
  return { counts, distinct: distinct.size };
}
const expectations = {
  'j01-imported-desktop.png': { width: 1280, land: 50000, water: 1000, saveButton: 1000, status: 10000 },
  'j02-exported-desktop.png': { width: 1280, land: 50000, saveButton: 1000, status: 10000 },
  'j08-download-retry-desktop.png': { width: 1280, land: 50000, cracked: 1000, saveButton: 1000 },
  'j10-test-action-desktop.png': { width: 1280, minDistinct: 100 },
  'j11-desktop-controls.png': { width: 1280, land: 50000, water: 1000, saveButton: 1000, status: 10000 },
  'j11-narrow-initial.png': { width: 390, land: 30000, saveButton: 1000 },
  'j11-narrow-error.png': { width: 390, land: 30000, saveButton: 1000, errorText: 500 },
  'j11-narrow-exported.png': { width: 390, land: 30000, saveButton: 1000, status: 10000 },
};
try {
  for (const file of fs.readdirSync(shotsDir).sort()) {
    if (!file.endsWith('.png')) continue;
    const png = PNG.sync.read(fs.readFileSync(path.join(shotsDir, file)));
    const { counts, distinct } = countColors(png);
    const expect = expectations[file];
    if (!expect) throw Error('存在未声明的截图：' + file);
    if (expect.width && png.width !== expect.width) throw Error(file + ' 宽度应为 ' + expect.width + '，实际 ' + png.width);
    if (png.height <= 0) throw Error(file + ' 高度异常');
    for (const [key, min] of Object.entries(expect)) {
      if (['width', 'minDistinct'].includes(key)) continue;
      if (counts[key] < min) throw Error(file + ' 关键颜色 ' + key + ' 仅 ' + counts[key] + ' 像素（要求 ≥' + min + '）');
    }
    if (expect.minDistinct && distinct < expect.minDistinct) throw Error(file + ' 颜色种类过少：' + distinct);
    report.screenshots.push({ file: 'docs/us/us011-json-evidence/screenshots/' + file, width: png.width, height: png.height, bytes: fs.statSync(path.join(shotsDir, file)).size, distinctColors: distinct, keyColors: counts });
  }
  if (report.screenshots.length !== Object.keys(expectations).length) throw Error('截图数量与预期不符：' + report.screenshots.length);
  report.result = 'PASS';
  console.log('PASS evidence check · screenshots=' + report.screenshots.length);
} catch (e) {
  report.failure = { message: e.message, stack: e.stack };
  console.error(e);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidence, 'screenshot-check.json'), JSON.stringify(report, null, 2));
}
