
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
