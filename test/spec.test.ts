// Spec lines checked one by one against the production simulation.
import { describe, expect, test } from 'vitest';
import type { RouteDef } from '../src/data/routeTypes';
import { BLOTTER_DROP, ENVELOPE_LIP, NIGHT_COUNTER, RULER_RISE } from '../src/data/routes';
import { Sim } from '../src/sim/sim';
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
const LOG = !!process.env.WHY;

/** A long flat floor and nothing else. */
const FLAT: RouteDef = {
  ...ENVELOPE_LIP,
  id: 'flat',
  pieces: [{ id: 'floor', name: 'blotter', material: 'blotter', pts: [[-20, -3], [60, -3], [60, 0], [-20, 0]] }],
  start: { x: 0, groundY: 0 },
  arch: { x: 55, y: 1, w: 1.4, h: 1.6 },
  killY: -10,
};

describe('lamp rail', () => {
  test('end to end takes roughly half a second', () => {
    const sim = new Sim(FLAT, keyReel(0, 4));
    const lo = sim.rig.lampJoint.getLowerLimit();
    const hi = sim.rig.lampJoint.getUpperLimit();
    for (let i = 0; i < 90; i++) sim.step({ drive: false, lamp: -1 });
    for (let i = 0; i < 30; i++) sim.step({ drive: false, lamp: 0 });
    expect(sim.rig.lampJoint.getJointTranslation()).toBeCloseTo(lo, 2);
    let ticks = 0;
    while (sim.rig.lampJoint.getJointTranslation() < hi - 0.01 && ticks < 120) {
      sim.step({ drive: false, lamp: 1 });
      ticks++;
    }
    if (LOG) console.log(`lamp travel ${ticks} ticks (${((ticks / 60) * 1000).toFixed(0)} ms)`);
    expect(ticks).toBeGreaterThanOrEqual(24);
    expect(ticks).toBeLessThanOrEqual(42);
  });

  test('released lamp does not creep along the rail on any replay', () => {
    const runs: [RouteDef, Blueprint, InputScript][] = [
      [ENVELOPE_LIP, keyReel(0, 4), FULL],
      [RULER_RISE, keyReel(1, 4), [[0, 0, 1], [40, 1, 0]]],
      [BLOTTER_DROP, keyReel(0, 4), COAST_OVER_LIP],
      [BLOTTER_DROP, SPRUNG_SHOE, SHOE_RUN],
      [NIGHT_COUNTER, LONG_RIG, FULL],
      [NIGHT_COUNTER, COMPACT_RUNNER, FULL],
    ];
    for (const [route, bp, script] of runs) {
      const sim = new Sim(route, bp);
      // A hard landing can push the lamp past the 60 N brake for a moment (slip);
      // the brake then returns it. Creep is how far from the release point it sits when a hold ends.
      let held: number | null = null;
      let heldFor = 0;
      let slip = 0;
      let creep = 0;
      let lastErr = 0;
      for (let t = 0; t < 60 * 40 && sim.outcome === 'running'; t++) {
        let lamp: -1 | 0 | 1 = 0;
        let drive = false;
        for (const [from, d, l] of script) if (t >= from) { drive = d === 1; lamp = l; }
        sim.step({ drive, lamp });
        const tr = sim.rig.lampJoint.getJointTranslation();
        if (lamp !== 0) {
          if (held !== null && heldFor > 30) creep = Math.max(creep, lastErr);
          held = null;
          heldFor = 0;
          continue;
        }
        held ??= (sim as unknown as { lampHold: number }).lampHold;
        heldFor++;
        lastErr = Math.abs(tr - held);
        slip = Math.max(slip, lastErr);
      }
      if (held !== null && heldFor > 30) creep = Math.max(creep, lastErr);
      if (LOG) console.log(`${route.id} max slip ${(slip * 1000).toFixed(1)} mm, settled error ${(creep * 1000).toFixed(1)} mm`);
      expect(slip).toBeLessThan(0.05);
      expect(creep).toBeLessThan(0.003);
    }
  });
});

describe('bench release', () => {
  test('a two-wheel build on a flat settles over 120 ticks without jumping or cracking', () => {
    for (const bp of [keyReel(0, 4), keyReel(1, 4), keyReel(0, 3)]) {
      const sim = new Sim(FLAT, bp);
      const y0 = sim.chassisPose().y;
      let rise = 0;
      let moved = 0;
      const knocks: string[] = [];
      for (let i = 0; i < 120; i++) {
        for (const e of sim.step({ drive: false, lamp: 0 })) if (e.type === 'knock' || e.type === 'crack') knocks.push(e.type);
        const p = sim.chassisPose();
        rise = Math.max(rise, p.y - y0);
        moved = Math.max(moved, Math.abs(p.x - FLAT.start.x));
      }
      if (LOG) console.log(`settle rise ${(rise * 1000).toFixed(2)} mm, drift ${(moved * 1000).toFixed(2)} mm`);
      expect(rise).toBeLessThan(0.005);
      expect(moved).toBeLessThan(0.01);
      expect(knocks).toEqual([]);
      expect(sim.cracks).toBe(0);
    }
  });
});

describe('Ruler Rise: same throttle, only the lamp changes', () => {
  // Drive is identical in both scripts: full throttle from tick 0.
  const back: InputScript = [[0, 1, 0]];
  const fwd: InputScript = [[0, 1, 1]];
  test('lamp back lifts the nose and stalls; lamp forward crests the ruler', () => {
    const a = runScript(RULER_RISE, keyReel(1, 4), back);
    const b = runScript(RULER_RISE, keyReel(1, 4), fwd);
    if (LOG) console.log(`back: ${a.outcome} lifted=${a.everLifted} maxX ${a.maxX.toFixed(2)}; fwd: ${b.outcome} ${b.ticks} ticks`);
    expect(a.everLifted).toBe(true);
    expect(a.outcome).not.toBe('delivered');
    expect(b.outcome).toBe('delivered');
  });
});

describe('Envelope Lip seam', () => {
  test('the folded seam is felt (a wheel strike) but never cracks the glass', () => {
    const sim = new Sim(ENVELOPE_LIP, keyReel(0, 4));
    let peak = 0;
    const strikes: string[] = [];
    while (sim.outcome === 'running' && sim.tick < 60 * 30) {
      for (const e of sim.step({ drive: true, lamp: 0 })) if (e.type === 'knock' && e.x > 23.5 && e.x < 25) strikes.push(`${e.part} ${e.power.toFixed(2)}`);
      const x = sim.chassisPose().x;
      if (x > 22 && x < 27) {
        const w = (sim as unknown as { dvWindow: { x: number; y: number }[] }).dvWindow;
        const sum = w.reduce((acc, d) => [acc[0]! + d.x, acc[1]! + d.y], [0, 0]);
        peak = Math.max(peak, Math.hypot(sum[0]!, sum[1]!));
      }
    }
    if (LOG) console.log(`seam: lamp peak ${peak.toFixed(2)} m/s; strikes ${strikes.join(', ')}`);
    expect(sim.outcome).toBe('delivered');
    expect(strikes.length).toBeGreaterThanOrEqual(1);
    expect(peak).toBeLessThan(3.0);
    expect(sim.cracks).toBe(0);
  });
});

describe('Blotter Drop coast window', () => {
  test('coasting from a range of ticks with the lamp centred lands clean', () => {
    const clean: number[] = [];
    for (let c = 190; c <= 250; c += 10) {
      const r = runScript(BLOTTER_DROP, keyReel(0, 4), [[0, 1, 0], [c, 0, 1], [c + 15, 0, 0], [c + 180, 1, 0]]);
      if (r.outcome === 'delivered' && r.cracks === 0) clean.push(c);
    }
    if (LOG) console.log(`clean coast starts: ${clean.join(',')}`);
    expect(clean).toContain(220);
    expect(clean.length).toBeGreaterThanOrEqual(3);
  });
});

describe('The Night Counter: late starts keep each build on its path', () => {
  const COUNTER_TOP = NIGHT_COUNTER.roller!.y + 0.1;
  for (const start of [20, 40, 60]) {
    test(`drive from tick ${start}`, () => {
      const script: InputScript = [[0, 0, 0], [start, 1, 0]];
      const hi = runScript(NIGHT_COUNTER, LONG_RIG, script);
      const lo = runScript(NIGHT_COUNTER, COMPACT_RUNNER, script);
      if (LOG) console.log(`start ${start}: long ${hi.outcome} ${hi.roller} maxY ${hi.maxY.toFixed(2)}; compact ${lo.outcome} ${lo.roller} maxY ${lo.maxY.toFixed(2)}`);
      expect(hi.outcome).toBe('delivered');
      expect(hi.cracks).toBe(0);
      expect(hi.roller).toBe('reel-1');
      expect(hi.maxY).toBeGreaterThan(COUNTER_TOP + 0.4);
      expect(lo.outcome).toBe('delivered');
      expect(lo.cracks).toBe(0);
      expect(lo.roller).toBeNull();
      expect(lo.maxY).toBeLessThan(COUNTER_TOP + 0.1);
    });
  }
});

describe('driving time per winning replay', () => {
  test('each winning script drives 15–40 s', () => {
    const wins: [string, RouteDef, Blueprint, InputScript][] = [
      ['Envelope full', ENVELOPE_LIP, keyReel(0, 4), FULL],
      ['Envelope wind', ENVELOPE_LIP, keyReel(0, 4), [[0, 1, 0], [240, 0, 0], [480, 1, 0]]],
      ['Ruler fwd', RULER_RISE, keyReel(1, 4), [[0, 1, 1]]],
      ['Ruler short', RULER_RISE, keyReel(0, 4), FULL],
      ['Blotter starter', BLOTTER_DROP, keyReel(0, 4), FULL],
      ['Blotter shoe', BLOTTER_DROP, SPRUNG_SHOE, SHOE_RUN],
      ['Blotter coast', BLOTTER_DROP, keyReel(0, 4), COAST_OVER_LIP],
      ['Counter long', NIGHT_COUNTER, LONG_RIG, FULL],
      ['Counter compact', NIGHT_COUNTER, COMPACT_RUNNER, FULL],
    ];
    const out: string[] = [];
    for (const [name, route, bp, s] of wins) {
      const r = runScript(route, bp, s);
      expect(r.outcome).toBe('delivered');
      out.push(`${name} ${(r.ticks / 60).toFixed(1)} s`);
    }
    console.log(out.join(' | '));
  });
});
