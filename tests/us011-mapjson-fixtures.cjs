// US011 标准地图 JSON 测试夹具：基于用户只读参考文件 level-01.json 派生；不写外部项目。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EXTERNAL = 'D:\\Projects\\mihuayou\\develop_suzukaze\\MihuayoCheckmateTactics\\assets\\resources\\Levels\\level-01.json';
const REPO_COPY = path.join(__dirname, '..', 'docs', 'us', 'us011-json-evidence', 'fixtures', 'level-01-reference.json');

function referencePath() {
  for (const p of [process.env.M0_REFERENCE_LEVEL, REPO_COPY, EXTERNAL].filter(Boolean)) {
    if (fs.existsSync(p)) return path.resolve(p);
  }
  throw Error('缺少用户参考文件 level-01.json（可用 M0_REFERENCE_LEVEL 指定只读路径）');
}
function referenceText() { return fs.readFileSync(referencePath(), 'utf8'); }
function reference() { return JSON.parse(referenceText()); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

// 所有夹具都从参考文件派生；名称与用途在单元测试与浏览器验收中一一对应。
function fixtures() {
  const base = reference();
  const make = (mut) => { const doc = clone(base); mut(doc); return doc; };
  const tile = (doc, key, value) => { doc.map.tiles[key] = value; };
  return {
    'reference': base,
    'version-3': make((d) => { d.formatVersion = 3; }),
    'version-string': make((d) => { d.formatVersion = '2'; }),
    'battle-save': make((d) => { d.meta.kind = 'battleSave'; }),
    'mid-turn': make((d) => { d.turn = { round: 2, phase: 'player' }; }),
    'enemy-phase': make((d) => { d.turn = { round: 1, phase: 'enemy' }; }),
    'result-not-null': make((d) => { d.result = { winner: 'player', reason: 'checkmate' }; }),
    'history-nonempty': make((d) => { d.history.commands = [{ type: 'move', actor: 'u1' }]; }),
    'unknown-terrain': make((d) => { tile(d, '0,1', 'lava'); }),
    'unknown-kind': make((d) => { d.units[1].kind = 'elephant'; }),
    'extra-root-field': make((d) => { d.intents = []; d.gold = 5; }),
    'extra-meta-field': make((d) => { d.meta.createdAt = '2026-10-23T00:00:00.000Z'; }),
    'unit-extra-field': make((d) => { d.units[0].hp = 3; d.units[0].sp = 2; }),
    'tile-key-out-of-range': make((d) => { tile(d, '9,0', 'water'); }),
    'tile-key-noncanonical': make((d) => { tile(d, '04,4', 'water'); }),
    'rng-string': make((d) => { d.rng = '123456'; }),
    'rng-negative': make((d) => { d.rng = -1; }),
    'rng-fraction': make((d) => { d.rng = 1.5; }),
    'missing-result': make((d) => { delete d.result; }),
    'missing-history': make((d) => { delete d.history; }),
    'duplicate-id': make((d) => { d.units[1].id = d.units[0].id; }),
    'overlap': make((d) => { d.units[1].x = d.units[0].x; d.units[1].y = d.units[0].y; }),
    'out-of-bounds': make((d) => { d.units[1].x = 9; }),
    'king-out-of-palace': make((d) => { d.units[0].x = 0; d.units[0].y = 3; }),
    'non-rook-role': make((d) => { d.units[3].rookRole = 'charge'; }),
    'nontrim-code': make((d) => { d.meta.battleId = ' level-02'; }),
    'bad-code-char': make((d) => { d.meta.battleId = 'level/02'; }),
    'cracked-rook-role': make((d) => {
      tile(d, '0,1', 'cracked');
      d.units[1].rookRole = 'charge';
      d.meta.battleId = 'level-cracked';
      d.meta.displayName = '开裂山测试关';
      d.map.name = '开裂山甲图';
    }),
    'explicit-land': make((d) => { tile(d, '0,1', 'land'); tile(d, '8,0', 'land'); }),
    'no-map-name': make((d) => { delete d.map.name; }),
    'no-display-name': make((d) => { delete d.meta.displayName; }),
    'bad-json': '{ "formatVersion": 2, "meta": { "kind": "battleInit"',
  };
}

function writeFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const all = fixtures();
  const written = {};
  for (const [name, value] of Object.entries(all)) {
    const file = path.join(dir, name + '.json');
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    written[name] = file;
  }
  const copy = path.join(dir, 'level-01-reference.json');
  if (!fs.existsSync(copy)) fs.writeFileSync(copy, referenceText());
  written.referenceCopy = copy;
  return written;
}

module.exports = { EXTERNAL, REPO_COPY, referencePath, referenceText, reference, sha256, clone, fixtures, writeFixtures };
