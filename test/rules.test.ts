// The flame: variety, repeats, levels, fragility, and how a post is scored in order.
import { describe, expect, it } from 'vitest';
import { BASE_TOLERANCE, FRAGILE_SHARE } from '../src/sim/rules';
import { freshLevels } from '../src/sim/tricks';
import { ctx, flame } from './helpers';

describe('flame', () => {
  it('a new trick adds a spark; a repeat adds none and is worth less', () => {
    const f = flame();
    const a = f.award('flip', 'Backflip', 200, 'first');
    const b = f.award('flip', 'Backflip', 200, 'first');
    expect(a.sparks).toBe(1);
    expect(b.sparks).toBe(0);
    expect(b.heat).toBe(120);
    expect(f.sparks).toBe(2);
  });

  it('postcard levels add heat and a spark', () => {
    const lv = freshLevels();
    lv.flip = 3;
    const p = flame([], lv).award('flip', 'Backflip', 200, 'first');
    expect(p.heat).toBe(400);
    expect(p.sparks).toBe(3);
  });

  it('fragility is measured against the delivery target', () => {
    const f = flame();
    f.heat = 300;
    f.sparks = 2;
    expect(f.fragility(1000)).toBeCloseTo(600 / (1000 * FRAGILE_SHARE));
    expect(f.fragility(100000)).toBeLessThan(0.02);
    expect(f.tolerance(1, 1000)).toBeLessThan(BASE_TOLERANCE);
    expect(flame().tolerance(1, 1000)).toBe(BASE_TOLERANCE);
  });

  it('post is heat × sparks, a high window doubles sparks first', () => {
    const f = flame();
    f.heat = 100;
    f.sparks = 3;
    expect(f.post(ctx()).value).toBe(300);
    const r = f.post(ctx({ high: true }));
    expect(r.value).toBe(600);
    expect(r.steps[0]).toMatchObject({ id: 'window', kind: 'xsparks', sparks: 6 });
  });

  it('stamp order matters: add before you multiply', () => {
    const a = flame(['wax', 'airmail']);
    const b = flame(['airmail', 'wax']);
    for (const f of [a, b]) {
      f.heat = 100;
      f.sparks = 2;
    }
    expect(a.post(ctx({ airborne: true })).value).toBe(100 * (2 + 3) * 2);
    expect(b.post(ctx({ airborne: true })).value).toBe(100 * (2 * 2 + 3));
  });

  it('the post lists each step in album order with running totals', () => {
    const f = flame(['bigEnvelope', 'wax', 'midnightOil']);
    f.heat = 50;
    const r = f.post(ctx());
    expect(r.steps.map((s) => [s.slot, s.id, s.heat, s.sparks])).toEqual([
      [0, 'bigEnvelope', 300, 1],
      [1, 'wax', 300, 4],
      [2, 'midnightOil', 300, 12],
    ]);
    expect(r.value).toBe(3600);
  });

  it('Carbon Copy copies the stamp to its right and nothing at the end', () => {
    const f = flame(['carbon', 'wax']);
    f.heat = 10;
    const r = f.post(ctx());
    expect(r.steps.map((s) => s.slot)).toEqual([0, 1]);
    expect(r.value).toBe(10 * 7);
    const g = flame(['wax', 'carbon']);
    g.heat = 10;
    expect(g.post(ctx()).value).toBe(10 * 4);
  });

  it('a post never resets the flame by itself', () => {
    const f = flame(['wax']);
    f.heat = 10;
    f.post(ctx());
    expect(f.heat).toBe(10);
    expect(f.sparks).toBe(1);
  });
});
