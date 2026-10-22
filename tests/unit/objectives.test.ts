import { describe, expect, it } from 'vitest';
import layoutJson from '../../content/layout.json';
import objectivesJson from '../../content/objectives.json';
import { type Layout } from '../../src/world/layout';
import { type Objectives, checkObjectives, solve } from '../../src/world/objectives';

const layout = layoutJson as unknown as Layout;
const obj = objectivesJson as Objectives;
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('content/objectives.json (MASTER_PLAN §3.6, §3.7)', () => {
  it('can be finished from the start and from every checkpoint, with every item reachable', () => {
    expect(checkObjectives(layout, obj)).toEqual([]);
  });

  it('opens up in story order: the records key before the archive code, power before the escape', () => {
    const { order, escaped } = solve(layout, obj, layout.start);
    expect(escaped).toBe(true);
    expect(order.indexOf('key_records')).toBeLessThan(order.indexOf('code_archives'));
    expect(order.indexOf('code_archives')).toBeLessThan(order.indexOf('reels'));
    expect(order.indexOf('key_transmitter')).toBeLessThan(order.indexOf('transmitter'));
  });
});

describe('checkObjectives finds soft-locks', () => {
  it('a key placed behind the door it opens', () => {
    const o = copy(obj); o.items.find((i) => i.id === 'key_records')!.room = 'L1_records_office';
    const p = checkObjectives(layout, o);
    expect(p.some((s) => s.startsWith('start: soft-lock'))).toBe(true);
    expect(p.some((s) => s.includes('key_records in L1_records_office can never be reached'))).toBe(true);
  });

  it('no way to power the lift', () => {
    const o = copy(obj); o.actions = o.actions.filter((a) => a.gives !== 'power_lift');
    const p = checkObjectives(layout, o);
    expect(p.some((s) => s.includes('lift_l2_l3: needs power_lift, which no action gives'))).toBe(true);
    expect(p.some((s) => s.includes('soft-lock'))).toBe(true);
  });

  it('a checkpoint stranded by a layout change', () => {
    const o = copy(obj);
    // sealing both doors of the L3 lift lobby leaves a save in the transmitter room with no way to the exit
    const l = copy(layout); l.openings.find((x) => x.id === 'd_stair3_liftlobby3')!.state = 'sealed';
    l.openings.find((x) => x.id === 'd_liftlobby3_corridor')!.state = 'sealed';
    const p = checkObjectives(l, o);
    expect(p.some((s) => s.startsWith('cp_l3_transmitter: soft-lock'))).toBe(true);
  });
});
