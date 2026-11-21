// Refresh-rate independence: the same tick-indexed inputs give the same run
// whether frames arrive at 30, 60, 120 or 144 Hz, or stutter.
import { describe, expect, test } from 'vitest';
import { FixedStepper, MAX_STEPS, TICK } from '../src/core/clock';
import { BLOTTER_DROP, NIGHT_COUNTER, RULER_RISE } from '../src/data/routes';
import type { RouteDef } from '../src/data/routeTypes';
import { inputAt, runScript, type InputScript } from '../src/sim/replay';
import { Sim } from '../src/sim/sim';
import type { Blueprint } from '../src/workshop/blueprint';
import { COAST_OVER_LIP, LONG_RIG } from './fixtures';

/** Drive a Sim the way the game loop does: rAF timestamps through the stepper. */
function runAtRate(route: RouteDef, bp: Blueprint, script: InputScript, frameMs: (i: number) => number, maxTicks = 60 * 30) {
  const sim = new Sim(route, bp);
  const clock = new FixedStepper();
  let t = 1000;
  clock.advance(t);
  for (let i = 0; sim.outcome === 'running' && sim.tick < maxTicks; i++) {
    t += frameMs(i);
    const { steps } = clock.advance(t);
    for (let s = 0; s < steps && sim.outcome === 'running'; s++) sim.step(inputAt(script, sim.tick));
  }
  const p = sim.chassisPose();
  return { outcome: sim.outcome, tick: sim.tick, x: p.x, y: p.y, a: p.a, cracks: sim.cracks, roller: sim.rollerPart, wind: sim.wind };
}

const keyReel = (k: number): Blueprint => ({
  placements: [
    { id: 'reel-1', kind: 'reel', parent: 'chassis', socket: 4, rot: 0 },
    { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: k, rot: 0 },
  ],
});
const cases: [string, RouteDef, Blueprint, InputScript][] = [
  // The climb pair: same build, same throttle, only the lamp differs.
  ['Ruler Rise, lamp back (stalls)', RULER_RISE, keyReel(1), [[0, 1, 0]]],
  ['Ruler Rise, lamp forward (crests)', RULER_RISE, keyReel(1), [[0, 1, 1]]],
  ['Night Counter long rig', NIGHT_COUNTER, LONG_RIG, [[0, 1, 0]]],
  ['Blotter Drop coast over the lip', BLOTTER_DROP, { placements: [{ id: 'reel-1', kind: 'reel', parent: 'chassis', socket: 4, rot: 0 }, { id: 'keyWheel-1', kind: 'keyWheel', parent: 'chassis', socket: 0, rot: 0 }] }, COAST_OVER_LIP],
];

describe('refresh rate', () => {
  for (const [name, route, bp, script] of cases) {
    test(`${name}: identical at 30, 60, 120 and 144 Hz and under stutter`, () => {
      const base = runAtRate(route, bp, script, () => 1000 / 60);
      const headless = runScript(route, bp, script);
      expect(base.outcome).toBe(headless.outcome);
      // A stalled run never finishes; the headless replay stops once it rests.
      if (headless.outcome !== 'running') expect(base.tick).toBe(headless.ticks);
      else expect(base.x).toBeCloseTo(headless.finalX, 1);
      for (const hz of [30, 120, 144]) expect(runAtRate(route, bp, script, () => 1000 / hz)).toEqual(base);
      // Uneven frames: a long frame every so often (under the backlog cap).
      expect(runAtRate(route, bp, script, (i) => (i % 7 === 0 ? 61 : 9.3))).toEqual(base);
    });
  }

  test('a long stall runs at most MAX_STEPS ticks and drops the backlog', () => {
    const c = new FixedStepper();
    c.advance(0);
    expect(c.advance(2000).steps).toBe(MAX_STEPS);
    const next = c.advance(2000 + TICK * 1000);
    expect(next.steps).toBe(1);
  });
});
