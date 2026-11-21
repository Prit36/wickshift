// Reproducible outcomes: each route has scripted runs that differ only by a
// player decision, and the decision must decide the result.
import { describe, expect, test } from 'vitest';
import { BLOTTER_DROP, ENVELOPE_LIP, NIGHT_COUNTER, RULER_RISE } from '../src/data/routes';
import { runScript, type InputScript } from '../src/sim/replay';
import type { Blueprint } from '../src/workshop/blueprint';
import { COAST_OVER_LIP, COMPACT_RUNNER, LONG_RIG, SHOE_RUN, SPRUNG_SHOE } from './fixtures';

const keyReel = (k: number, r: number): Blueprint => ({
  placements: [
    { id: 'reel-1', kind: 'reel', parent: 'chassis', socket: r, rot: 0 },
    { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: k, rot: 0 },
  ],
});
const FULL: InputScript = [[0, 1, 0]];

describe('Envelope Lip', () => {
  test('full throttle delivers but spends the mark', () => {
    for (const k of [0, 1]) {
      const r = runScript(ENVELOPE_LIP, keyReel(k, 4), FULL);
      expect(r.outcome).toBe('delivered');
      expect(r.cracks).toBe(0); // the seam at speed is felt, never a crack
      expect(r.wind).toBeLessThan(0.23);
    }
  });
  test('letting it roll down the slope keeps a quarter of the spring', () => {
    for (const k of [0, 1]) {
      const r = runScript(ENVELOPE_LIP, keyReel(k, 4), [[0, 1, 0], [240, 0, 0], [480, 1, 0]]);
      expect(r.outcome).toBe('delivered');
      expect(r.wind).toBeGreaterThanOrEqual(0.26);
    }
  });
  test('coasting the whole flat stalls short', () => {
    const r = runScript(ENVELOPE_LIP, keyReel(0, 4), [[0, 1, 0], [180, 0, 0]]);
    expect(r.outcome).not.toBe('delivered');
    expect(r.reason).toMatch(/short/);
  });
});

describe('Ruler Rise', () => {
  test('rear key wheel with the lamp kept back rears up and stalls', () => {
    const r = runScript(RULER_RISE, keyReel(1, 4), FULL);
    expect(r.outcome).not.toBe('delivered');
    expect(r.everLifted).toBe(true);
  });
  test('the same build delivers when the lamp shifts forward', () => {
    const r = runScript(RULER_RISE, keyReel(1, 4), [[0, 0, 1], [40, 1, 1]]);
    expect(r.outcome).toBe('delivered');
  });
  test('a longer wheelbase is the other solution: a spar out of the nose climbs without shifting', () => {
    const r = runScript(RULER_RISE, LONG_RIG, FULL);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(0);
  });
  test('moving the key wheel to the tail delivers without shifting (Short order)', () => {
    const r = runScript(RULER_RISE, keyReel(0, 4), FULL);
    expect(r.outcome).toBe('delivered');
  });
});


describe('Blotter Drop', () => {
  test('the starter cart at full throttle cracks its glass on the drop', () => {
    const r = runScript(BLOTTER_DROP, keyReel(0, 4), FULL);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(1);
  });
  test('a sprung shoe under the lamp lands clean at full throttle (Clear glass)', () => {
    const r = runScript(BLOTTER_DROP, SPRUNG_SHOE, SHOE_RUN);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(0);
    expect(r.wind).toBeGreaterThan(0.1);
  });
  test('ordinary wheels coast over the lip with the lamp centred (Clear glass)', () => {
    const r = runScript(BLOTTER_DROP, keyReel(0, 4), COAST_OVER_LIP);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(0);
  });
  test('coasting alone, with the lamp left over the rear wheel, still cracks', () => {
    const r = runScript(BLOTTER_DROP, keyReel(0, 4), [[0, 1, 0], [220, 0, 0], [400, 1, 0]]);
    expect(r.cracks).toBe(1);
  });
  test('the sprung shoe also delivers clean with the lamp left back the whole way', () => {
    const r = runScript(BLOTTER_DROP, SPRUNG_SHOE, FULL);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(0);
  });
  test('a long nose reaches the window with the lamp anywhere on the rail', () => {
    // The longest legal nose is 3.0 m ahead of the lamp; each window opens 3.3 m before its stack.
    for (const lamp of [-1, 0, 1] as const) expect(runScript(BLOTTER_DROP, LONG_RIG, [[0, 1, lamp]]).outcome).toBe('delivered');
  });
  test('the crack names the support that landed under the lamp', () => {
    const r = runScript(BLOTTER_DROP, keyReel(0, 4), FULL);
    const crack = r.events.find((e) => e.e.type === 'crack');
    expect(crack && 'part' in crack.e ? crack.e.part : '').toBe('keyWheel-1');
  });
});

const COUNTER_TOP = NIGHT_COUNTER.roller!.y + 0.1;

describe('The Night Counter', () => {
  test('a nose-driven cart drops off the ruler, lands twice hard and loses the flame', () => {
    const r = runScript(NIGHT_COUNTER, keyReel(4, 0), FULL);
    expect(r.outcome).toBe('failed');
    expect(r.cracks).toBe(2);
    expect(r.reason).toBe('Key wheel took a hard landing');
  });
  test('a long rig mounts the lip before the ruler dips and rides the high counter (Blue post)', () => {
    const r = runScript(NIGHT_COUNTER, LONG_RIG, FULL);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(0);
    expect(r.roller).toBe('reel-1');
    expect(r.maxY).toBeGreaterThan(COUNTER_TOP + 0.4);
  });
  test('the compact runner parks on the far arm, rides the dip and leaves under the flap', () => {
    const r = runScript(NIGHT_COUNTER, COMPACT_RUNNER, FULL);
    expect(r.outcome).toBe('delivered');
    expect(r.cracks).toBe(0);
    expect(r.roller).toBeNull();
    expect(r.maxY).toBeLessThan(COUNTER_TOP + 0.1);
    expect(r.events.some((x) => x.e.type === 'roller')).toBe(false);
  });
  test('the same two builds hold their paths with the lamp kept back, then sent forward', () => {
    const script: InputScript = [[0, 1, -1], [150, 1, 1]];
    const hi = runScript(NIGHT_COUNTER, LONG_RIG, script);
    const lo = runScript(NIGHT_COUNTER, COMPACT_RUNNER, script);
    expect(hi.outcome).toBe('delivered');
    expect(hi.roller).not.toBeNull();
    expect(lo.outcome).toBe('delivered');
    expect(lo.roller).toBeNull();
  });
});
