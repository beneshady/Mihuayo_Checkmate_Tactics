import { parseBattleState, validateMap } from './BattleState.ts';
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const s = parseBattleState(raw);
console.log('parsed ok', s.meta.kind, s.meta.battleId, s.units.length);
console.log('map errors', validateMap(s.map, s.units));
