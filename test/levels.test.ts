// Every level must be solvable by at least two structurally different builds,
// and from level 3 on the plain cart (lamp, two keys, drive) must not be enough.
import { describe, expect, it } from 'vitest';
import { LEVELS, levelById } from '../src/sim/levels';
import { build, play, playBy, nearObstacle, type Script } from './play';
import { emptyBlueprint, launchProblem, partProblem, stickProblem, type Blueprint } from '../src/sim/blueprint';
import type { LevelDef } from '../src/sim/level';
import type { Run, RunInput } from '../src/sim/run';
import { starsFor } from '../src/sim/stars';

const D: Script = [[0, 40, ['drive']]];
const base = ['0,0 3,0 6,0', '3,0 3,1'];
const plain = build(base, ['lamp@3,1', 'key@0,0', 'key@6,0']);
/** Builds a newcomer might try first that should NOT work, per level. */
const NAIVE: Record<string, Blueprint> = {
  // a tall mast is the obvious way to reach the letter; it can't climb the ruler
  'ruler-rise': build(['0,0 3,0 6,0', '3,0 3,3'], ['lamp@3,3', 'key@0,0', 'key@6,0']),
  inkwell: plain,
  'top-shelf': plain,
  dominoes: plain,
};


// Each solution runs with its controls nudged earlier and later, as a person would
// play it: a solution that only works on one exact frame doesn't count.
type Runner = (lvl: LevelDef, bp: Blueprint, jitter: number) => Run;
type Sol = { name: string; bp: Blueprint; run: Runner };
const JITTER = [-0.1, 0, 0.1];

/** A timed script; every non-drive window shifts by the jitter. */
const scripted =
  (sc: Script): Runner =>
  (lvl, bp, j) =>
    play(lvl, bp, sc.map(([a, b, k]) => (k.includes('drive') ? [a, b, k] : [Math.max(0, a + j), b + j, k]) as Script[number]));
/** Fire when the front wheel nears each obstacle; jitter moves the trigger point (metres). */
const near =
  (xs: number[], dist: number, key: keyof RunInput, sec: number): Runner =>
  (lvl, bp, j) =>
    playBy(lvl, bp, nearObstacle(xs, dist + j * 3, key, sec));

const st = levelById('first-light')!.starter!;
const SOLUTIONS: Record<string, Sol[]> = {
  'first-light': [
    { name: 'starter + buttons', bp: { sticks: st.sticks, parts: [...st.parts, { kind: 'wheel', at: [1, 0], dir: 0 }, { kind: 'wheel', at: [5, 0], dir: 0 }] }, run: scripted([]) },
    { name: 'tall A-frame', bp: build(['1,0 3,0 5,0', '3,0 3,2', '1,0 3,2 5,0'], ['lamp@3,2', 'wheel@1,0', 'wheel@5,0']), run: scripted([]) },
  ],
  'ruler-rise': [
    { name: 'low two-stick V', bp: build(['0,0 2,1 4,0'], ['lamp@2,1', 'key@0,0', 'key@4,0']), run: scripted(D) },
    { name: 'tall two-stick V', bp: build(['0,0 2,2 4,0'], ['lamp@2,2', 'key@0,0', 'key@4,0']), run: scripted(D) },
    { name: 'long cart, lamp over the back axle', bp: build(['0,0 3,0 6,0', '0,0 0,1'], ['lamp@0,1', 'key@0,0', 'key@6,0']), run: scripted(D) },
  ],
  inkwell: [
    { name: 'one rocket aimed up-forward (lift)', bp: build(base, ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>1']), run: scripted([...D, [1.1, 1.6, ['rockets']]]) },
    { name: 'one rocket aimed flat (speed off the kicker)', bp: build(base, ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>0']), run: scripted([...D, [1.05, 1.7, ['rockets']]]) },
    { name: 'A-frame with two rockets', bp: build([...base, '0,0 3,1 6,0', '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,2>1', 'rocket@3,0>1']), run: scripted([...D, [1.1, 1.6, ['rockets']]]) },
  ],
  'top-shelf': [
    { name: 'three lanterns on a goalpost frame', bp: build(['0,0 3,0 6,0', '0,0 0,3', '6,0 6,3', '3,0 3,1', '0,3 3,3 6,3', '3,1 3,3'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'lantern@0,3', 'lantern@6,3', 'lantern@3,3']), run: scripted([[0, 3.6, ['lanterns']], ...D]) },
    { name: 'two lanterns and a rocket kick', bp: build(['0,0 3,0 6,0', '3,0 3,1', '0,0 0,3', '6,0 6,3'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'lantern@0,3', 'lantern@6,3', 'rocket@3,0>2']), run: scripted([[0, 3.8, ['lanterns']], [0, 0.4, ['rockets']], ...D]) },
  ],
  dominoes: [
    { name: 'compact cart on two springs', bp: build(['0,0 1,0 3,0 4,0', '1,0 2,1 3,0'], ['lamp@2,1', 'key@0,0', 'key@4,0', 'spring@1,0>6', 'spring@3,0>6']), run: near([9, 16], 1.9, 'springs', 0) },
    { name: 'rocket hops (short bursts)', bp: build(['0,0 1,0 2,0 3,0 4,0', '2,0 2,1'], ['lamp@2,1', 'key@0,0', 'key@4,0', 'rocket@1,0>2', 'rocket@3,0>2']), run: near([9, 16], 2.4, 'rockets', 0.4) },
  ],
};

/** Re-lay a build one piece at a time with the bench's own rules; the first complaint, or null. */
function benchProblem(L: LevelDef, bp: Blueprint): string | null {
  const b = emptyBlueprint();
  for (const st of bp.sticks) {
    const why = stickProblem(b, L.kit, L.area, st);
    if (why) return `stick ${st.a}-${st.b}: ${why}`;
    b.sticks.push(st);
  }
  for (const p of bp.parts) {
    const why = partProblem(b, L.kit, p.kind, p.at);
    if (why) return `${p.kind}@${p.at}: ${why}`;
    b.parts.push(p);
  }
  return launchProblem(b);
}

describe('levels', () => {
  for (const lvl of LEVELS) {
    describe(`${lvl.num}. ${lvl.name}`, () => {
      const sols = SOLUTIONS[lvl.id];
      it('has two solutions on file', () => expect(sols?.length ?? 0).toBeGreaterThanOrEqual(2));
      for (const s of sols ?? []) {
        it(`legal on the bench: ${s.name}`, () => expect(benchProblem(lvl, s.bp)).toBeNull());
        it(`solved by: ${s.name} (with timing slop)`, () => {
          for (const j of JITTER) {
            const r = s.run(lvl, s.bp, j);
            expect(r.outcome, `${s.name}, jitter ${j}: ${r.outCause ?? ''}`).toBe('delivered');
          }
        });
      }
      it('every star is earned by some solution on file', () => {
        const got = [false, false, false];
        for (const s of sols ?? []) starsFor(lvl, s.run(lvl, s.bp, 0), s.bp).forEach((v, i) => (got[i] ||= v));
        expect(got).toEqual([true, true, true]);
      });
      const naive = NAIVE[lvl.id];
      if (naive) it('is not solved by the naive build', () => expect(play(lvl, naive, D, 25).outcome).not.toBe('delivered'));
    });
  }

  it('runs are deterministic', () => {
    const lvl = LEVELS[3];
    const s = SOLUTIONS[lvl.id][0];
    const a = s.run(lvl, s.bp, 0);
    const b = s.run(lvl, s.bp, 0);
    expect(a.tick).toBe(b.tick);
    expect(a.flame).toBe(b.flame);
    expect(a.lampPos()).toEqual(b.lampPos());
  });
});
