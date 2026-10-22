// Objective graph and soft-lock checker (MASTER_PLAN §3.6, §3.7, M2.5). From a room and a set of things the
// player has, it repeats: rooms reachable through openings the player can pass (locked ones need their key,
// the lift needs power), then every item lying in those rooms and every action whose needs are met, until
// nothing new appears. Items and flags are never lost, so this fixpoint is the whole state space; one-way
// doors or consumable items would need a full search and are rejected until that exists.
import { type Layout, type Opening, reachable } from './layout';

export interface Objectives {
  items: { id: string; room: string; kind: string; beat?: number }[];
  actions: { id: string; room: string; needs: string[]; gives: string; noisy?: boolean; beat?: number }[];
  escape: { room: string; needs: string[] };
  checkpoints: { id: string; kind: string; room: string; have: string[] }[];
}

export interface Solution { escaped: boolean; have: Set<string>; rooms: Set<string>; order: string[] }

export function passable(o: Opening, have: Set<string>): boolean {
  if (o.creatureOnly || o.state === 'sealed') return false;
  if (o.state === 'locked' && !(o.lockedBy && have.has(o.lockedBy))) return false;
  if (o.powered && !have.has(o.powered)) return false;
  return true;
}

/** Everything the player can get from `start` holding `have`, in the order it becomes available. */
export function solve(layout: Layout, obj: Objectives, start: string, have: Iterable<string> = []): Solution {
  const got = new Set(have), order: string[] = [];
  for (;;) {
    const rooms = reachable(layout, start, (o) => passable(o, got));
    const fresh = [
      ...obj.items.filter((i) => !got.has(i.id) && rooms.has(i.room)).map((i) => i.id),
      ...obj.actions.filter((a) => !got.has(a.gives) && rooms.has(a.room) && a.needs.every((n) => got.has(n))).map((a) => a.gives),
    ];
    if (fresh.length === 0) {
      const escaped = rooms.has(obj.escape.room) && obj.escape.needs.every((n) => got.has(n));
      return { escaped, have: got, rooms, order };
    }
    for (const f of fresh) { got.add(f); order.push(f); }
  }
}

/** Every problem as a sentence; empty means the slice can be finished from the start and every checkpoint. */
export function checkObjectives(layout: Layout, obj: Objectives): string[] {
  const problems: string[] = [];
  const rooms = new Set(layout.rooms.map((r) => r.id));
  const things = new Set([...obj.items.map((i) => i.id), ...obj.actions.map((a) => a.gives)]);
  for (const i of obj.items) if (!rooms.has(i.room)) problems.push(`item ${i.id}: unknown room ${i.room}`);
  for (const a of obj.actions) {
    if (!rooms.has(a.room)) problems.push(`action ${a.id}: unknown room ${a.room}`);
    for (const n of a.needs) if (!things.has(n)) problems.push(`action ${a.id}: needs ${n}, which nothing provides`);
  }
  for (const o of layout.openings) {
    if (o.lockedBy && !things.has(o.lockedBy)) problems.push(`${o.id}: locked by ${o.lockedBy}, which is never placed`);
    if (o.powered && !things.has(o.powered)) problems.push(`${o.id}: needs ${o.powered}, which no action gives`);
    if ('oneWay' in o) problems.push(`${o.id}: one-way openings need a full state search (not supported yet)`);
  }
  for (const n of obj.escape.needs) if (!things.has(n)) problems.push(`escape needs ${n}, which nothing provides`);

  const starts = [{ id: 'start', room: layout.start, have: [] as string[] }, ...obj.checkpoints];
  for (const s of starts) {
    if (!rooms.has(s.room)) { problems.push(`${s.id}: unknown room ${s.room}`); continue; }
    const result = solve(layout, obj, s.room, s.have);
    if (!result.escaped) {
      const missing = obj.escape.needs.filter((n) => !result.have.has(n));
      problems.push(`${s.id}: soft-lock: cannot escape (${!result.rooms.has(obj.escape.room) ? `cannot reach ${obj.escape.room}` : `missing ${missing.join(', ')}`})`);
    }
    for (const i of obj.items) if (!result.have.has(i.id)) problems.push(`${s.id}: ${i.id} in ${i.room} can never be reached`);
  }
  return problems;
}
