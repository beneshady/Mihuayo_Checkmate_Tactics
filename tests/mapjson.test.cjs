// US011 2026-10-23 增补：标准地图 JSON 导入/导出纯转换的定向规则测试。
const T = require('node:test'), A = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const MJ = require('../web/js/mapjson.js'), R = require('../web/js/rules.js'), M = require('../web/js/maps.js');
const F = require('./us011-mapjson-fixtures.cjs');
const fx = F.fixtures();
const draftOf = (name) => MJ.parseDocument(F.clone(fx[name])).draft;
function memory() { const values = new Map(); return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }; }

T('J01 参考文件解析：81 格补陆地、六地形、双方 14 枚棋子与元信息回填', () => {
  const { draft } = MJ.parseDocument(F.clone(fx.reference));
  A.equal(draft.version, 1);
  A.equal(draft.name, '三桥山口');
  A.equal(draft.levelCode, 'level-01');
  A.equal(draft.levelName, '第一关 · 三桥山口');
  A.equal(Object.keys(draft.tiles).length, 81);
  const counts = {};
  for (const t of Object.values(draft.tiles)) counts[t] = (counts[t] || 0) + 1;
  A.deepEqual(counts, { land: 58, water: 6, bridge: 3, mountain: 6, forest: 8 });
  A.equal(draft.units.length, 14);
  A.deepEqual(draft.units, fx.reference.units.map((u) => ({ id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y, rookRole: u.rookRole || 'base' })));
  A.deepEqual(M.validate(draft), []);
});

T('J02 导出合同：battleInit、稀疏地形、无运行状态、固定字段顺序', () => {
  const draft = draftOf('reference');
  const doc = MJ.buildDocument(draft, { levelCode: 'level-02', levelName: '第二关 · 测试' }, 123456789);
  A.deepEqual(Object.keys(doc), ['formatVersion', 'meta', 'map', 'units', 'turn', 'rng', 'result', 'history']);
  A.equal(doc.formatVersion, 2);
  A.deepEqual(doc.meta, { kind: 'battleInit', battleId: 'level-02', displayName: '第二关 · 测试' });
  A.equal(doc.map.name, '三桥山口');
  A.equal(Object.keys(doc.map.tiles).length, 23);
  A.ok(!Object.values(doc.map.tiles).includes('land'), '导出稀疏字典省略陆地');
  A.deepEqual(doc.turn, { round: 1, phase: 'player' });
  A.equal(doc.rng, 123456789);
  A.equal(doc.result, null);
  A.deepEqual(doc.history, { commands: [] });
  A.ok(doc.units.every((u) => !('hp' in u) && !('ap' in u) && !('sp' in u)), '不写运行状态');
  A.deepEqual(doc.units.filter((u) => u.kind !== 'rook').map((u) => Object.keys(u)), Array(12).fill(['id', 'side', 'kind', 'x', 'y']));
  A.ok(doc.units.filter((u) => u.kind === 'rook').every((u) => ['base', 'charge', 'pull'].includes(u.rookRole)));
});

T('J02/J09 同布局重复导出仅 rng 不同；导出不改动草稿；rng 为独立 32 位无符号整数', () => {
  const draft = draftOf('reference'), before = JSON.stringify(draft);
  const first = MJ.buildDocument(draft, { levelCode: 'level-01', levelName: '第一关 · 三桥山口' }, 1);
  const second = MJ.buildDocument(draft, { levelCode: 'level-01', levelName: '第一关 · 三桥山口' }, 4294967295);
  const third = MJ.buildDocument(draft, { levelCode: 'level-01', levelName: '第一关 · 三桥山口' }, 0);
  A.deepEqual(second, { ...first, rng: 4294967295 });
  A.deepEqual(third, { ...first, rng: 0 });
  A.equal(JSON.stringify(draft), before, '导出不得修改草稿');
  for (let i = 0; i < 300; i++) { const v = MJ.generateRng(); A.ok(Number.isInteger(v) && v >= 0 && v <= 4294967295, 'rng 必须为 32 位无符号整数'); }
  const source = fs.readFileSync(path.join(__dirname, '../web/js/mapjson.js'), 'utf8');
  A.ok(!/window\.M0|require\(|state\.rng|0x12345678/.test(source), '格式模块不得依赖战斗规则或正式随机源');
});

T('J04 往返无损：地形/双方棋子/元信息，map.name 与 displayName 不同仍各自保留', () => {
  const draft = draftOf('reference');
  A.notEqual(draft.name, draft.levelName);
  const doc = MJ.buildDocument(draft, { levelCode: draft.levelCode, levelName: draft.levelName }, 305419896);
  const back = MJ.parseDocument(JSON.parse(JSON.stringify(doc))).draft;
  A.deepEqual(back.tiles, draft.tiles);
  A.deepEqual(back.units, draft.units);
  A.equal(back.name, '三桥山口');
  A.equal(back.levelName, '第一关 · 三桥山口');
  A.equal(back.levelCode, 'level-01');
  const explicit = draftOf('explicit-land');
  const doc2 = MJ.buildDocument(explicit, { levelCode: 'level-land', levelName: '显式陆地' }, 7);
  A.ok(!Object.values(doc2.map.tiles).includes('land'));
  A.deepEqual(MJ.parseDocument(JSON.parse(JSON.stringify(doc2))).draft.tiles, explicit.tiles);
});

T('J02 地图库保存/读取保持关卡编号与名称，普通保存不改绑定', () => {
  const storage = memory(), lib = M.library(storage, 'test-us011-json-library');
  const draft = draftOf('reference');
  const saved = lib.save(draft, draft.name);
  const loaded = lib.load(saved.id);
  A.equal(loaded.map.levelCode, 'level-01');
  A.equal(loaded.map.levelName, '第一关 · 三桥山口');
  A.equal(lib.binding(2), null);
  const map = { ...loaded.map, levelName: '改名后的关卡' };
  lib.save(map, map.name, saved.id);
  A.equal(lib.load(saved.id).map.levelName, '改名后的关卡');
  A.equal(lib.binding(2), null, '普通保存不自动绑定');
});

T('J05/J06 导入拒绝：版本/类型/回合/结果/历史/未知地形棋种/额外字段/坐标/重复/重叠/rng', () => {
  const cases = {
    'version-3': '$.formatVersion', 'version-string': '$.formatVersion', 'battle-save': '$.meta.kind',
    'mid-turn': '$.turn.round', 'enemy-phase': '$.turn.phase', 'result-not-null': '$.result',
    'history-nonempty': '$.history.commands', 'unknown-terrain': '$.map.tiles["0,1"]',
    'unknown-kind': '$.units[1].kind', 'extra-root-field': '$.intents',
    'extra-meta-field': '$.meta.createdAt', 'unit-extra-field': '$.units[0].hp',
    'tile-key-out-of-range': '$.map.tiles["9,0"]', 'tile-key-noncanonical': '$.map.tiles["04,4"]',
    'rng-string': '$.rng', 'rng-negative': '$.rng', 'rng-fraction': '$.rng',
    'missing-result': '$.result', 'missing-history': '$.history', 'duplicate-id': '$.units[1].id',
    'overlap': '$.units[1].x/y', 'out-of-bounds': '$.units[1].x/y', 'non-rook-role': '$.units[3].rookRole',
    'nontrim-code': '$.meta.battleId', 'bad-code-char': '$.meta.battleId',
  };
  for (const [name, expected] of Object.entries(cases)) {
    A.throws(() => MJ.parseDocument(F.clone(fx[name])), (e) => e instanceof MJ.MapJsonError && e.message.includes(expected), name + ' 应以 ' + expected + ' 拒绝');
  }
  A.throws(() => MJ.parseDocument(null), /应为对象/);
  A.throws(() => MJ.parseDocument([]), /应为对象/);
});

T('J07 合法边界：显式陆地、缺 map.name/displayName 回退、开裂山与冲锋车可交换', () => {
  const explicit = draftOf('explicit-land');
  A.equal(explicit.tiles['0,1'], 'land');
  A.equal(draftOf('no-map-name').name, '第一关 · 三桥山口');
  A.equal(draftOf('no-display-name').levelName, '三桥山口');
  const cracked = draftOf('cracked-rook-role');
  A.equal(cracked.tiles['0,1'], 'cracked');
  A.equal(cracked.units.find((u) => u.id === 'u1').rookRole, 'charge');
  A.deepEqual(M.validate(cracked), []);
  const doc = MJ.buildDocument(cracked, { levelCode: 'level-cracked', levelName: '开裂山测试关' }, 11);
  A.equal(doc.map.tiles['0,1'], 'cracked');
  A.equal(doc.units.find((u) => u.id === 'u1').rookRole, 'charge');
});

T('J07 非法编号/名称在保存导出前拒绝；编号不得静默改写', () => {
  for (const code of ['level-01', '第一关', 'a b', 'L1', '第2关-甲']) A.equal(MJ.filenameError(code), '', code + ' 应合法');
  const invalid = { '': '不能为空', ' level-02': '首尾', 'a/b': '路径', 'a\\b': '路径', '..': '目录', 'CON': '保留', 'a:b': '非法字符', 'a*b': '非法字符', 'x.': '以点', '\u0001bad': '非法字符' };
  for (const [code, reason] of Object.entries(invalid)) A.ok(MJ.filenameError(code).includes(reason), code + ' 应拒绝：' + reason);
  A.deepEqual(MJ.validateMeta('level-01', '关卡名'), []);
  A.equal(MJ.validateMeta('', ' ').length, 2);
  const draft = draftOf('reference');
  A.throws(() => MJ.buildDocument(draft, { levelCode: 'a/b', levelName: '名称' }, 1), /\$\.meta\.battleId/);
  A.throws(() => MJ.buildDocument(draft, { levelCode: 'level-01', levelName: ' ' }, 1), /\$\.meta\.displayName/);
  A.throws(() => MJ.buildDocument(draft, { levelCode: 'level-01', levelName: '名称' }, -1), /\$\.rng/);
  A.throws(() => MJ.buildDocument(draft, { levelCode: 'level-01', levelName: '名称' }, 1.5), /\$\.rng/);
  A.throws(() => MJ.buildDocument(draft, { levelCode: 'level-01', levelName: '名称' }, 4294967296), /\$\.rng/);
});

T('J06/J07 导入后的布局校验沿用现有编辑器规则（九宫/缺帅/站山/致死水/出生点/敌阵上限）', () => {
  A.ok(M.validate(draftOf('king-out-of-palace')).some((e) => e.includes('九宫外')));
  const noKings = draftOf('reference'); noKings.units = noKings.units.filter((u) => u.kind !== 'king');
  A.ok(M.validate(noKings).some((e) => e.includes('我方帅')));
  const mountain = draftOf('reference'); mountain.tiles['0,1'] = 'mountain'; mountain.units.push({ id: 'bad', side: 'player', kind: 'pawn', x: 0, y: 1, rookRole: 'base' });
  A.ok(M.validate(mountain).some((e) => e.includes('棋子不能站山')));
  const water = draftOf('reference'); water.tiles['0,1'] = 'water'; water.units.push({ id: 'bad2', side: 'player', kind: 'pawn', x: 0, y: 1, rookRole: 'base' });
  A.ok(M.validate(water).some((e) => e.includes('致死')));
  const crowded = draftOf('reference'); crowded.units.push({ id: 'extra', side: 'enemy', kind: 'pawn', x: 0, y: 6, rookRole: 'base' });
  A.ok(M.validate(crowded).some((e) => e.includes('最多8')));
});

T('J02/J07 导出前结构自检：未知地形/越界棋子/非法职业拒绝产出半成品', () => {
  const draft = draftOf('reference');
  const badTile = F.clone(draft); badTile.tiles['0,1'] = 'lava';
  A.throws(() => MJ.buildDocument(badTile, { levelCode: 'level-01', levelName: '名' }, 1), /\$\.map\.tiles\["0,1"\]/);
  const badUnit = F.clone(draft); badUnit.units[0].x = 9;
  A.throws(() => MJ.buildDocument(badUnit, { levelCode: 'level-01', levelName: '名' }, 1), /\$\.units\[0\]\.x\/y/);
  const badRole = F.clone(draft); badRole.units.find((u) => u.kind === 'rook').rookRole = 'fly';
  A.throws(() => MJ.buildDocument(badRole, { levelCode: 'level-01', levelName: '名' }, 1), /\$\.units\[1\]\.rookRole/);
});
