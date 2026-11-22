// One scripted check per stamp: each must change a number it promises to change.
import { describe, expect, it } from 'vitest';
import { Flame, FULL_FLAME, STAMP_IDS, type StampId } from '../src/sim/rules';
import { Shift } from '../src/sim/shift';
import { groundAt } from '../src/sim/terrain';

const flame = (...s: StampId[]) => {
  const f = new Flame(new Set(s));
  f.reset(1);
  return f;
};
const shift = (...stamps: StampId[]) => new Shift({ seed: 11, shift: 1, target: 1, stamps, parts: [], glasses: 3, rule: null });
const priv = (sh: Shift) => sh as any;
const idle = { gas: false, brake: false, post: false };

function parkAt(sh: Shift, x: number): void {
  sh.sim.spawn(x, groundAt(sh.course, x)!);
  for (let i = 0; i < 20; i++) sh.sim.step({ gas: false, brake: true }, 1 / 60);
}

const tested = new Set<StampId>();
const check = (id: StampId, name: string, fn: () => void) => {
  tested.add(id);
  it(`${id}: ${name}`, fn);
};

describe('stamps', () => {
  check('backhand', 'triples backflips', () => expect(flame('backhand').award('Backflip', 100).heat).toBe(300));
  check('sorter', 'no repeat penalty', () => {
    const f = flame('sorter');
    f.award('Air', 100);
    expect(f.award('Air', 100).heat).toBe(100);
  });
  check('tempered', 'flame size never lowers tolerance', () => {
    const f = flame('tempered');
    const t0 = f.tolerance(1);
    f.heat = FULL_FLAME * 2;
    expect(f.tolerance(1)).toBe(t0);
  });
  check('firstClass', 'high windows ×4', () => {
    const f = flame('firstClass');
    f.heat = 100;
    expect(f.postValue({ high: true, airborne: false }).value).toBe(400);
  });
  check('airmail', 'airborne posts ×2', () => {
    const f = flame('airmail');
    f.heat = 100;
    expect(f.postValue({ high: false, airborne: true }).value).toBe(200);
  });
  check('doubleWick', '8+ sparks posts ×2', () => {
    const f = flame('doubleWick');
    f.heat = 100;
    f.sparks = 8;
    expect(f.postValue({ high: false, airborne: false }).value).toBe(1600);
  });
  check('featherweight', 'airtime ×3', () => expect(flame('featherweight').award('Air', 100, false, 'Air').heat).toBe(300));
  check('longFuse', 'wheelies ×3 and repeat sparks', () => {
    const f = flame('longFuse');
    expect(f.award('Wheelie', 100).heat).toBe(300);
    expect(f.award('Wheelie', 100).sparks).toBe(1);
  });
  check('bellows', 'every third letter adds a spark', () => {
    const f = flame('bellows');
    f.letter();
    f.letter();
    expect(f.letter().sparks).toBe(1);
    expect(flame().letter().sparks).toBe(0);
  });
  check('hotPotato', 'heat grows and the lamp gets fragile faster', () => {
    const f = flame('hotPotato');
    f.heat = 1000;
    for (let i = 0; i < 60; i++) f.tick(1 / 60);
    expect(f.heat).toBeGreaterThan(1055);
    const plain = flame();
    plain.heat = f.heat;
    expect(f.tolerance(1)).toBeLessThan(plain.tolerance(1));
  });
  check('rubberStamp', 'a clean tiny hop adds a spark', () => {
    const sh = shift('rubberStamp');
    priv(sh).resolveLanding({ airTicks: 6, rot: 0, impact: 1, clean: true });
    expect(sh.flame.sparks).toBe(2);
    const plain = shift();
    priv(plain).resolveLanding({ airTicks: 6, rot: 0, impact: 1, clean: true });
    expect(plain.flame.sparks).toBe(1);
  });
  check('lantern', 'a crash keeps half the heat through the respawn', () => {
    const cases: [StampId[], number][] = [
      [['lantern'], 500],
      [[], 0],
    ];
    for (const [stamps, expected] of cases) {
      const sh = shift(...stamps);
      sh.flame.heat = 1000;
      priv(sh).crash('fall', sh.sim.pos.x, sh.sim.pos.y);
      for (let i = 0; i < 100; i++) sh.step(idle);
      expect(Math.round(sh.flame.heat)).toBe(expected);
    }
  });
  const firstGround = (sh: Shift) => sh.course.windows.find((w) => !w.high && !w.final)!;
  check('purse', 'posting pays a penny', () => {
    const sh = shift('purse');
    const w = firstGround(sh);
    parkAt(sh, w.x);
    sh.flame.heat = 100;
    sh.step({ ...idle, post: true });
    expect(sh.lit.has(w.id)).toBe(true);
    expect(sh.pennies).toBe(1);
  });
  check('nightOwl', 'new flames start with a spark per lit window', () => {
    const sh = shift('nightOwl');
    const w = firstGround(sh);
    parkAt(sh, w.x);
    sh.flame.heat = 100;
    sh.step({ ...idle, post: true });
    expect(sh.flame.sparks).toBe(2);
  });
  check('postageDue', 'driving past a window adds 2 sparks', () => {
    const sh = shift('postageDue');
    const w = firstGround(sh);
    parkAt(sh, w.x + 3.6);
    sh.flame.heat = 100;
    sh.step(idle);
    expect(sh.skipped.has(w.id)).toBe(true);
    expect(sh.flame.sparks).toBe(3);
  });

  it('every stamp has a check', () => {
    expect(STAMP_IDS.filter((id) => !tested.has(id))).toEqual([]);
  });
});
