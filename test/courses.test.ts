// Every generated shift must be drivable start to finish by a plain driver,
// and a trick-pulling driver must be able to beat the early targets.
import { describe, expect, it } from 'vitest';
import { runBot } from '../src/sim/bot';
import { generateCourse } from '../src/sim/terrain';
import { targetFor, SHIFTS } from '../src/sim/shift';

describe('courses', () => {
  it('are deterministic for a seed', () => {
    const a = generateCourse({ seed: 42, shift: 3 });
    const b = generateCourse({ seed: 42, shift: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('every shift is passable without crashing for many seeds', () => {
    for (let shift = 1; shift <= SHIFTS; shift++) {
      for (let seed = 1; seed <= 8; seed++) {
        const r = runBot({ seed, shift, target: 1, stamps: [], parts: [], glasses: 99, rule: null });
        expect(r.sh.done, `shift ${shift} seed ${seed} stuck at x=${r.sh.sim.pos.x.toFixed(0)}`).toBe(true);
        expect(r.crashes, `shift ${shift} seed ${seed} crashed at ${r.crashX.join(',')}`).toBeLessThanOrEqual(1);
        expect(r.ticks / 60).toBeLessThan(75);
      }
    }
  });

  it('supervisor shifts stay passable', () => {
    for (const rule of ['draught', 'wetInk', 'shortWick'] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const r = runBot({ seed, shift: 3, target: 1, stamps: [], parts: [], glasses: 99, rule });
        expect(r.sh.done, `${rule} seed ${seed}`).toBe(true);
      }
    }
  });

  it('a flipping driver with no stamps beats the first shift', () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = runBot({ seed, shift: 1, target: targetFor(1), stamps: [], parts: [], glasses: 3, rule: null }, { flips: true });
      if (r.sh.passed) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  });
});
