import { CONFIG, Kind, Position } from './config';
export type { Kind, Position } from './config';
export interface Unit extends Position {
  id: string; side: 'player' | 'enemy'; kind: Kind; hp: number; xp: number; level: number; acted: boolean;
}
export interface Action { actor: string; from: Position; to: Position; type: 'move' | 'attack'; path: Position[] }
export interface Intent extends Action { order: number }
export interface State {
  units: Unit[]; intents: Intent[]; phase: 'player' | 'shop' | 'result'; wave: number; turn: number;
  gold: number; bought: boolean; kills: number; highestLevel: number; result?: 'victory' | 'dead' | 'mate';
}
export interface Effect { actor: string; to: Position; victims: string[]; damage: string[]; status: 'success' | 'miss' | 'cancelled' | 'removed' }
export const copy = (s: State): State => JSON.parse(JSON.stringify(s));
export const same = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
export const at = (s: State, p: Position): Unit | undefined => s.units.find(u => same(u, p));
export const king = (s: State, side: Unit['side']): Unit | undefined => s.units.find(u => u.side === side && u.kind === 'king');
const inside = (p: Position) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < CONFIG.width && p.y >= 0 && p.y < CONFIG.height;
export function unit(id: string, side: Unit['side'], kind: Kind, x: number, y: number): Unit {
  return { id, side, kind, x, y, hp: kind === 'king' ? (side === 'player' ? CONFIG.kingHP : CONFIG.enemyKingHP) : 1, xp: 0, level: 1, acted: false };
}
function addWave(s: State): void {
  s.units.push(...CONFIG.waves[s.wave - 1].map(([k, x, y], i) => unit(`w${s.wave}-${i}`, 'enemy', k, x, y)));
  s.intents = generateIntents(s);
}
export function newGame(): State {
  const s: State = { units: [unit('king', 'player', 'king', 4, 0), unit('rook', 'player', 'rook', 0, 0)], intents: [], phase: 'player', wave: 1, turn: 1, gold: 0, bought: false, kills: 0, highestLevel: 1 };
  addWave(s); return s;
}
function line(a: Position, b: Position): Position[] {
  if (a.x !== b.x && a.y !== b.y) return [];
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y), result: Position[] = [];
  for (let x = a.x + dx, y = a.y + dy; x !== b.x || y !== b.y; x += dx, y += dy) result.push({ x, y });
  result.push({ x: b.x, y: b.y }); return result;
}
// 几何规则不检查行动次数，供玩家、意图执行和搜索共同调用。
export function actionAt(s: State, u: Unit, to: Position): Action | undefined {
  if (!inside(to) || same(u, to)) return;
  const target = at(s, to); if (target?.side === u.side) return;
  const dx = to.x - u.x, dy = to.y - u.y, ax = Math.abs(dx), ay = Math.abs(dy);
  let path: Position[] = [{ ...to }], valid = false;
  if (u.kind === 'king') {
    const centerY = u.side === 'player' ? 1 : 8;
    const inPalace = (p: Position) => p.x >= 3 && p.x <= 5 && Math.abs(p.y - centerY) <= 1;
    // 自定义九宫：横竖一步，斜步只能沿角点与中心之间的米字连线。
    const diagonal = ax === 1 && ay === 1 && ((u.x === 4 && u.y === centerY) || (to.x === 4 && to.y === centerY));
    valid = inPalace(u) && inPalace(to) && (ax + ay === 1 || diagonal);
  }
  if (u.kind === 'pawn') valid = (dx === 0 && dy === -1) || (u.y <= 4 && ax === 1 && dy === 0);
  if (u.kind === 'horse') valid = ax * ay === 2 && !at(s, { x: u.x + (ax === 2 ? Math.sign(dx) : 0), y: u.y + (ay === 2 ? Math.sign(dy) : 0) });
  if ((u.kind === 'rook' || u.kind === 'cannon') && (dx === 0 || dy === 0)) {
    path = line(u, to);
    const blockers = path.slice(0, -1).map(p => at(s, p)).filter((v): v is Unit => !!v);
    if (u.kind === 'cannon') valid = target ? blockers.length === 1 : blockers.length === 0;
    else if (target && u.side === 'player') valid = blockers.every(v => v.side !== u.side) && blockers.length + 1 <= u.level;
    else valid = blockers.length === 0;
  }
  if (valid) return { actor: u.id, from: { x: u.x, y: u.y }, to: { ...to }, type: target ? 'attack' : 'move', path };
}
export function legalActions(s: State, id: string): Action[] {
  const u = s.units.find(v => v.id === id); if (!u) return [];
  const actions: Action[] = [];
  for (let y = 0; y < CONFIG.height; y++) for (let x = 0; x < CONFIG.width; x++) {
    const a = actionAt(s, u, { x, y }); if (a) actions.push(a);
  }
  return actions;
}
export function generateIntents(s: State): Intent[] {
  const commander = king(s, 'player'); if (!commander) return [];
  return s.units.filter(u => u.side === 'enemy').flatMap((u, i) => {
    const priority = (a: Action) => { const target = at(s, a.to); return target ? (target.kind === 'king' ? 0 : target.kind === 'rook' ? 1 : 2) : 3; };
    const distance = (a: Action) => Math.abs(a.to.x - commander.x) + Math.abs(a.to.y - commander.y);
    const moves = legalActions(s, u.id).sort((a, b) => priority(a) - priority(b) || (a.type === 'move' && b.type === 'move' ? distance(a) - distance(b) : 0) || a.to.y - b.to.y || a.to.x - b.to.x);
    return moves.length ? [{ ...moves[0], order: i + 1 }] : [];
  });
}
function terminal(s: State): void {
  if (!king(s, 'player')) { s.phase = 'result'; s.result = 'dead'; }
  else if (!king(s, 'enemy')) {
    if (s.wave === 1) { s.phase = 'shop'; s.gold += CONFIG.reward; s.units = s.units.filter(u => u.side === 'player'); }
    else { s.phase = 'result'; s.result = 'victory'; }
  }
  if (s.phase !== 'player') s.intents = [];
}
function apply(s: State, a: Action): Effect {
  const u = s.units.find(v => v.id === a.actor)!;
  const effect: Effect = { actor: u.id, to: { ...a.to }, victims: [], damage: [], status: 'success' };
  const targets = a.type === 'attack' ? (u.kind === 'rook' && u.side === 'player' ? a.path.map(p => at(s, p)).filter((v): v is Unit => !!v) : [at(s, a.to)!]) : [];
  let stopped = false;
  for (const target of targets) {
    target.hp--; effect.damage.push(target.id);
    if (target.hp <= 0) { s.units = s.units.filter(v => v.id !== target.id); effect.victims.push(target.id); if (u.side === 'player') s.kills++; }
    if (target.kind === 'king') { stopped = true; break; }
  }
  if (!stopped) { u.x = a.to.x; u.y = a.to.y; }
  effect.to = { x: u.x, y: u.y };
  if (u.side === 'player' && u.kind === 'rook') {
    u.xp += effect.victims.length; u.level = 1 + CONFIG.upgradeXP.slice(1).filter(xp => u.xp >= xp).length;
    s.highestLevel = Math.max(s.highestLevel, u.level);
  }
  u.acted = true;
  s.intents = s.intents.filter(i => s.units.some(v => v.id === i.actor));
  terminal(s); return effect;
}
export function submit(s: State, id: string, to: Position): { state: State; effect?: Effect } {
  const u = s.units.find(v => v.id === id);
  if (s.phase !== 'player' || !u || u.side !== 'player' || u.acted) return { state: s };
  const a = actionAt(s, u, to); if (!a) return { state: s };
  const next = copy(s); return { state: next, effect: apply(next, a) };
}
// 预览、将死叶节点、真实结束回合均复用此函数。
export function enemyPhase(s: State): { state: State; effects: Effect[] } {
  const next = copy(s), effects: Effect[] = [];
  if (s.phase !== 'player') return { state: next, effects };
  for (const intent of s.intents) {
    if (next.phase !== 'player') break;
    const u = next.units.find(v => v.id === intent.actor);
    const failure: Effect = { actor: intent.actor, to: { ...intent.from }, victims: [], damage: [], status: u ? 'cancelled' : 'removed' };
    if (!u || !same(u, intent.from)) { effects.push(failure); continue; }
    const occupant = at(next, intent.to);
    if (intent.type === 'move' && occupant) { effects.push(failure); continue; }
    if (intent.type === 'attack' && u.kind === 'cannon' && !occupant) {
      const blockers = line(u, intent.to).slice(0, -1).filter(p => at(next, p));
      effects.push({ ...failure, status: blockers.length === 1 ? 'miss' : 'cancelled' }); continue;
    }
    const a = actionAt(next, u, intent.to);
    if (!a) { effects.push(failure); continue; }
    const effect = apply(next, a);
    if (intent.type === 'attack' && !occupant) effect.status = 'miss';
    effects.push(effect);
  }
  return { state: next, effects };
}
export function endTurn(s: State): State {
  if (s.phase !== 'player') return s;
  const next = enemyPhase(s).state;
  if (next.phase === 'player') { next.turn++; next.units.forEach(u => u.acted = false); next.intents = generateIntents(next); }
  return next;
}
export function buy(s: State, kind: 'horse' | 'cannon'): State {
  if (s.phase !== 'shop' || s.bought || s.gold < CONFIG.price || (kind !== 'horse' && kind !== 'cannon')) return s;
  const next = copy(s), spawn = CONFIG.spawns[kind]; next.gold -= CONFIG.price; next.bought = true;
  next.units.push(unit('ally', 'player', kind, spawn.x, spawn.y)); return next;
}
export function nextWave(s: State): State {
  if (s.phase !== 'shop') return s;
  const next = copy(s); next.wave = 2; next.phase = 'player';
  next.units.forEach(u => { const p = CONFIG.spawns[u.kind as keyof typeof CONFIG.spawns]; u.x = p.x; u.y = p.y; u.acted = false; });
  addWave(next); return next;
}
export interface Analysis { safe: boolean; plan: Action[]; nodes: number }
// 每步 yield，场景可按时间片运行；超时从不返回将死。调用方丢弃旧 generator 即可取消。
export function* escapeAnalysis(s: State): Generator<void, Analysis, void> {
  const visited = new Set<string>(); let nodes = 0;
  function* search(current: State, plan: Action[]): Generator<void, Action[] | undefined, void> {
    nodes++; yield;
    if (current.phase === 'shop' || current.result === 'victory') return plan;
    if (current.phase === 'result') return undefined;
    const resolved = enemyPhase(current).state;
    if (king(resolved, 'player') && resolved.result !== 'dead') return plan;
    const key = JSON.stringify(current.units);
    if (visited.has(key)) return undefined; visited.add(key);
    for (const u of current.units.filter(v => v.side === 'player' && !v.acted)) {
      for (const a of legalActions(current, u.id)) {
        const found = yield* search(submit(current, u.id, a.to).state, [...plan, a]);
        if (found) return found;
      }
    }
    return undefined;
  }
  const plan = yield* search(s, []); return { safe: plan !== undefined, plan: plan ?? [], nodes };
}
export function analyze(s: State): Analysis {
  const iterator = escapeAnalysis(s); let step = iterator.next(); while (!step.done) step = iterator.next(); return step.value;
}
export function checkmate(s: State): State {
  if (s.phase !== 'player' || analyze(s).safe) return s;
  const next = copy(s); next.phase = 'result'; next.result = 'mate'; next.intents = []; return next;
}
