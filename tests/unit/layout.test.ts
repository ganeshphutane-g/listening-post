import { describe, expect, it } from 'vitest';
import layoutJson from '../../content/layout.json';
import roomsJson from '../../content/rooms.json';
import { type Layout, type RoomAcoustics, reachable, sharedWall, validateLayout } from '../../src/world/layout';

const layout = layoutJson as unknown as Layout;
const acoustics = roomsJson as unknown as RoomAcoustics;
const clone = (): Layout => JSON.parse(JSON.stringify(layout));

describe('content/layout.json (MASTER_PLAN §3.3)', () => {
  it('passes every check: no overlaps, doors on shared walls, plausible sizes, everything reachable', () => {
    expect(validateLayout(layout, acoustics)).toEqual([]);
  });

  it('has the three levels and the rooms the story needs (§3.3, §3.6)', () => {
    expect(layout.levels.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    for (const id of ['L1_dormitory', 'L1_records_office', 'L2_power_room', 'L2_archives', 'L2_generator_gallery', 'L3_pump_room_b', 'L3_transmitter_room', 'L3_antenna_shaft', 'L3_lift_lobby'])
      expect(layout.rooms.some((r) => r.id === id)).toBe(true);
    expect(layout.rooms.length).toBeGreaterThanOrEqual(25);
  });

  it('gives the creature routes the player cannot use (vents)', () => {
    const player = reachable(layout, 'L1_dormitory', (o) => !o.creatureOnly && o.type !== 'door' && o.type !== 'blast_door');
    const creature = reachable(layout, 'L1_dormitory', (o) => !!o.creatureOnly);
    expect(creature.size).toBeGreaterThan(player.size);
  });
});

describe('validateLayout catches broken data', () => {
  it('overlapping rooms', () => {
    const l = clone(); l.rooms.find((r) => r.id === 'L1_kitchen')!.x = [-14, -1];
    expect(validateLayout(l).some((p) => p.includes('overlap'))).toBe(true);
  });

  it('a door that is not on a shared wall, or too narrow', () => {
    const l = clone(); const d = l.openings.find((o) => o.id === 'd_corridor_dorm')!;
    d.at = { x: d.at.x + 1, z: d.at.z };
    d.width = 0.5;
    const p = validateLayout(l);
    expect(p.some((s) => s.includes('d_corridor_dorm: not on the wall'))).toBe(true);
    expect(p.some((s) => s.includes('d_corridor_dorm: door width 0.5'))).toBe(true);
  });

  it('a room the player cannot reach, and stairs on one level', () => {
    const l = clone();
    l.openings = l.openings.filter((o) => o.id !== 'd_mess_kitchen');
    l.openings.find((o) => o.id === 's_l1_l2')!.b = 'L1_storage';
    const p = validateLayout(l);
    expect(p.some((s) => s.includes('L1_kitchen: the player cannot reach it'))).toBe(true);
    expect(p.some((s) => s.includes('s_l1_l2: stairs must join different levels'))).toBe(true);
  });

  it('a locked door without a key, and a room missing from rooms.json', () => {
    const l = clone(); delete l.openings.find((o) => o.id === 'd_corridor_records')!.lockedBy;
    const ac: RoomAcoustics = JSON.parse(JSON.stringify(acoustics)); delete ac.rooms.L2_archives;
    const p = validateLayout(l, ac);
    expect(p.some((s) => s.includes('locked but no key'))).toBe(true);
    expect(p.some((s) => s.includes('L2_archives: no entry in rooms.json'))).toBe(true);
  });

  it('sharedWall ignores rooms that only touch at a corner', () => {
    const a = { id: 'a', level: 'L1', name: 'a', x: [0, 2] as [number, number], z: [0, 2] as [number, number], height: 3 };
    const b = { ...a, id: 'b', x: [2, 4] as [number, number], z: [2, 4] as [number, number] };
    expect(sharedWall(a, b)).toBeNull();
  });
});
