// Station layout data and its checks (MASTER_PLAN §3.3, §4.7, M2.1). content/layout.json holds rooms (axis-aligned
// boxes per level) and openings; content/rooms.json holds each room's acoustics. validateLayout() reports every
// problem as a sentence; an empty list means the data is sound. The greybox generator (M2.2), navmesh (M2.4) and
// sound propagation (M3.1) all read this data.
export interface Room { id: string; level: string; name: string; x: [number, number]; z: [number, number]; height: number }
export type OpeningType = 'door' | 'blast_door' | 'archway' | 'window' | 'vent' | 'stairs' | 'lift';
export interface Opening {
  id: string; type: OpeningType; a: string; b: string; width: number; height: number;
  state: 'open' | 'closed' | 'locked' | 'sealed'; at: { x: number; z: number };
  creatureOnly?: boolean; lockedBy?: string; powered?: string;
}
export interface Layout {
  version: number; levels: { id: string; name: string; floorY: number }[]; start: string;
  exit: { room: string; via: string; needs: string }; rooms: Room[]; openings: Opening[];
}
export interface RoomAcoustics { acousticTags: string[]; rooms: Record<string, { acoustic: string; surface: string; noiseDb: number }> }

// plausible sizes in metres: [min width, max width, min height, max height]
const SIZES: Record<OpeningType, [number, number, number, number]> = {
  door: [0.8, 1.6, 1.9, 2.6], blast_door: [1.2, 2.6, 2.0, 3.0], archway: [1.0, 4.0, 2.0, 3.5], window: [0.4, 3.0, 0.4, 2.0],
  vent: [0.3, 0.9, 0.3, 0.9], stairs: [1.0, 3.0, 2.0, 3.0], lift: [1.2, 3.0, 2.0, 3.0],
};
const SURFACES = ['concrete', 'concrete_wet', 'metal', 'wood', 'tile', 'linoleum', 'water', 'gravel'];
const EPS = 1e-6;

/** The wall segment two same-level rooms share, or null if they only touch at a corner or not at all. */
export function sharedWall(a: Room, b: Room): { axis: 'x' | 'z'; at: number; from: number; to: number } | null {
  for (const axis of ['x', 'z'] as const) {
    const other = axis === 'x' ? 'z' : 'x';
    const at = Math.abs(a[axis][1] - b[axis][0]) < EPS ? a[axis][1] : Math.abs(b[axis][1] - a[axis][0]) < EPS ? a[axis][0] : null;
    if (at === null) continue;
    const from = Math.max(a[other][0], b[other][0]), to = Math.min(a[other][1], b[other][1]);
    if (to - from > EPS) return { axis, at, from, to };
  }
  return null;
}

/** Rooms reachable from `start` through openings the filter lets through. */
export function reachable(layout: Layout, start: string, pass: (o: Opening) => boolean): Set<string> {
  const seen = new Set([start]), queue = [start];
  while (queue.length) {
    const r = queue.shift()!;
    for (const o of layout.openings) {
      if (!pass(o)) continue;
      const next = o.a === r ? o.b : o.b === r ? o.a : null;
      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

export function validateLayout(layout: Layout, acoustics?: RoomAcoustics): string[] {
  const problems: string[] = [];
  const rooms = new Map(layout.rooms.map((r) => [r.id, r]));
  const levels = new Set(layout.levels.map((l) => l.id));
  if (rooms.size !== layout.rooms.length) problems.push('room ids are not unique');
  if (new Set(layout.openings.map((o) => o.id)).size !== layout.openings.length) problems.push('opening ids are not unique');

  for (const r of layout.rooms) {
    if (!levels.has(r.level)) problems.push(`${r.id}: unknown level ${r.level}`);
    if (!(r.x[1] - r.x[0] >= 1.5 && r.z[1] - r.z[0] >= 1.5)) problems.push(`${r.id}: narrower than 1.5 m`);
    if (!(r.height >= 2.2 && r.height <= 40)) problems.push(`${r.id}: height ${r.height} m is outside 2.2–40 m`);
  }
  for (let i = 0; i < layout.rooms.length; i++) for (let j = i + 1; j < layout.rooms.length; j++) {
    const a = layout.rooms[i], b = layout.rooms[j];
    if (a.level !== b.level) continue;
    const ox = Math.min(a.x[1], b.x[1]) - Math.max(a.x[0], b.x[0]), oz = Math.min(a.z[1], b.z[1]) - Math.max(a.z[0], b.z[0]);
    if (ox > EPS && oz > EPS) problems.push(`${a.id} and ${b.id} overlap (${ox.toFixed(2)} × ${oz.toFixed(2)} m)`);
  }

  for (const o of layout.openings) {
    const a = rooms.get(o.a), b = rooms.get(o.b);
    if (!a || !b) { problems.push(`${o.id}: joins unknown room ${!a ? o.a : o.b}`); continue; }
    if (o.a === o.b) problems.push(`${o.id}: joins ${o.a} to itself`);
    const [w0, w1, h0, h1] = SIZES[o.type];
    if (o.width < w0 || o.width > w1) problems.push(`${o.id}: ${o.type} width ${o.width} m is outside ${w0}–${w1} m`);
    if (o.height < h0 || o.height > h1) problems.push(`${o.id}: ${o.type} height ${o.height} m is outside ${h0}–${h1} m`);
    if (o.type === 'vent' && !o.creatureOnly) problems.push(`${o.id}: vents are creature-only`);
    if (o.type !== 'vent' && o.creatureOnly) problems.push(`${o.id}: only vents may be creature-only`);
    if (o.state === 'locked' && !o.lockedBy) problems.push(`${o.id}: locked but no key or code (lockedBy)`);
    if (o.type === 'stairs' || o.type === 'lift') {
      if (a.level === b.level) problems.push(`${o.id}: ${o.type} must join different levels`);
      else if (Math.min(a.x[1], b.x[1]) - Math.max(a.x[0], b.x[0]) < o.width || Math.min(a.z[1], b.z[1]) - Math.max(a.z[0], b.z[0]) < o.width)
        problems.push(`${o.id}: ${o.a} and ${o.b} do not stack over each other wide enough for the ${o.type}`);
    } else if (o.type !== 'vent') {
      if (a.level !== b.level) { problems.push(`${o.id}: a ${o.type} must join rooms on one level`); continue; }
      const wall = sharedWall(a, b);
      if (!wall) { problems.push(`${o.id}: ${o.a} and ${o.b} share no wall`); continue; }
      const along = wall.axis === 'x' ? o.at.z : o.at.x, across = wall.axis === 'x' ? o.at.x : o.at.z;
      if (Math.abs(across - wall.at) > 0.05) problems.push(`${o.id}: not on the wall between ${o.a} and ${o.b}`);
      if (along - o.width / 2 < wall.from - EPS || along + o.width / 2 > wall.to + EPS) problems.push(`${o.id}: does not fit within the shared wall`);
      if (o.height > Math.min(a.height, b.height)) problems.push(`${o.id}: taller than the rooms it joins`);
    }
  }

  // the player can get everywhere from the start, through anything but vents and sealed openings (locked
  // doors count: their keys are placed by the objective graph, M2.5), and the creature can reach every room
  if (!rooms.has(layout.start)) problems.push(`start room ${layout.start} does not exist`);
  else {
    const player = reachable(layout, layout.start, (o) => !o.creatureOnly && o.state !== 'sealed');
    for (const r of layout.rooms) if (!player.has(r.id)) problems.push(`${r.id}: the player cannot reach it from ${layout.start}`);
    if (!player.has(layout.exit.room)) problems.push(`exit room ${layout.exit.room} is unreachable`);
    const creature = reachable(layout, layout.start, (o) => o.state !== 'sealed');
    for (const r of layout.rooms) if (!creature.has(r.id)) problems.push(`${r.id}: the creature cannot reach it`);
  }

  if (acoustics) {
    for (const r of layout.rooms) {
      const ac = acoustics.rooms[r.id];
      if (!ac) { problems.push(`${r.id}: no entry in rooms.json`); continue; }
      if (!acoustics.acousticTags.includes(ac.acoustic)) problems.push(`${r.id}: unknown acoustic tag ${ac.acoustic}`);
      if (!SURFACES.includes(ac.surface)) problems.push(`${r.id}: unknown surface ${ac.surface}`);
      if (!(ac.noiseDb >= 15 && ac.noiseDb <= 90)) problems.push(`${r.id}: ambient ${ac.noiseDb} dB is outside 15–90 dB`);
    }
    for (const id of Object.keys(acoustics.rooms)) if (!rooms.has(id)) problems.push(`rooms.json: ${id} is not in layout.json`);
  }
  return problems;
}
