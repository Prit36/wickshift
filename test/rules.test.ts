import { describe, expect, it } from 'vitest';
import { Flame, BASE_TOLERANCE, FULL_FLAME, cartSpecFor, type StampId } from '../src/sim/rules';
import { Shift } from '../src/sim/shift';

const flame = (...s: StampId[]) => {
  const f = new Flame(new Set(s));
  f.reset(1);
  return f;
};

describe('flame', () => {
  it('new tricks add a spark, repeats lose value', () => {
    const f = flame();
    const a = f.award('Backflip', 200);
    const b = f.award('Backflip', 200);
    expect(a.sparks).toBe(1);
    expect(b.sparks).toBe(0);
    expect(b.heat).toBe(120);
    expect(f.sparks).toBe(2);
  });

  it("Sorter's Eye removes the repeat penalty", () => {
    const f = flame('sorter');
    f.award('Air', 100);
    expect(f.award('Air', 100).heat).toBe(100);
  });

  it('Backhand triples backflips and snuffs sparks on a frontflip', () => {
    const f = flame('backhand');
    expect(f.award('Backflip', 200).heat).toBe(600);
    f.award('Big Air', 50, true, 'Air');
    expect(f.sparks).toBe(3);
    f.award('Frontflip', 200);
    expect(f.sparks).toBe(1);
  });

  it('a bigger flame survives softer landings, Tempered Glass ignores size', () => {
    const f = flame();
    expect(f.tolerance(1)).toBe(BASE_TOLERANCE);
    f.heat = FULL_FLAME;
    expect(f.tolerance(1)).toBeLessThan(BASE_TOLERANCE);
    const g = flame('tempered');
    g.heat = FULL_FLAME;
    expect(g.tolerance(1)).toBe(BASE_TOLERANCE);
  });

  it('post value is heat × sparks with window and stamp multipliers', () => {
    const f = flame('firstClass', 'airmail');
    f.heat = 100;
    f.sparks = 3;
    expect(f.postValue({ high: false, airborne: false }).value).toBe(300);
    expect(f.postValue({ high: true, airborne: false }).value).toBe(1200);
    expect(f.postValue({ high: true, airborne: true }).value).toBe(2400);
  });

  it('parts change the cart', () => {
    expect(cartSpecFor(['reels']).spec.wheelR).toBeGreaterThan(cartSpecFor([]).spec.wheelR);
    expect(cartSpecFor(['bedspring']).tolerance).toBeGreaterThan(1);
  });
});

describe('shift', () => {
  it('replays identically from the same inputs', () => {
    const play = () => {
      const sh = new Shift({ seed: 7, shift: 2, target: 1000, stamps: [], parts: [], glasses: 3, rule: null });
      for (let t = 0; t < 60 * 20; t++) sh.step({ gas: t % 200 < 170, brake: t % 200 >= 190, post: t % 30 === 0 });
      return [sh.posted, sh.sim.pos.x.toFixed(6), sh.tricks, sh.glasses];
    };
    expect(play()).toEqual(play());
  });

  it('posting with no flame does not light the window', () => {
    const sh = new Shift({ seed: 3, shift: 1, target: 1000, stamps: [], parts: [], glasses: 3, rule: null });
    const w = sh.course.windows.find((x) => !x.final)!;
    sh.sim.spawn(w.x, w.y);
    sh.flame.reset(1);
    sh.step({ gas: false, brake: false, post: true });
    expect(sh.lit.has(w.id)).toBe(false);
    expect(sh.events.some((e) => e.type === 'emptyPost')).toBe(true);
  });
});
