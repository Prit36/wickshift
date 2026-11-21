// The plumb mark on the bench is the centre of mass the run will have.
import { expect, test } from 'vitest';
import { NIGHT_COUNTER, ROUTES } from '../src/data/routes';
import { massInfo } from '../src/sim/cart';
import { Sim } from '../src/sim/sim';
import { LONG_RIG } from './fixtures';
import { SPRUNG_SHOE } from './fixtures';

test('the bench centre of mass matches the dispatched cart, for every starter and lamp position', () => {
  const builds = [...ROUTES.map((r) => r.starter), LONG_RIG, SPRUNG_SHOE];
  for (const bp of builds)
    for (const lamp of [-0.72, 0, 0.72]) {
      const bench = massInfo(bp, lamp);
      const sim = new Sim({ ...NIGHT_COUNTER, lampStart: lamp }, bp);
      expect((sim as unknown as { comX: number }).comX).toBeCloseTo(bench.cx, 6);
    }
});

test('sliding the lamp forward moves the centre of mass forward by the lamp share of the rail', () => {
  const back = massInfo(LONG_RIG, -0.72);
  const fwd = massInfo(LONG_RIG, 0.72);
  expect(fwd.mass).toBeCloseTo(back.mass, 9);
  expect(fwd.cx - back.cx).toBeGreaterThan(0.25);
  expect(fwd.cx - back.cx).toBeLessThan(1.44);
});
