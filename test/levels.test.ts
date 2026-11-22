// Every level must be solvable by at least two structurally different builds,
// and from level 3 on the plain cart (lamp, two keys, drive) must not be enough.
import { describe, expect, it } from 'vitest';
import { levelById } from '../src/sim/levels';
import { ALL as LEVELS } from '../src/sim/all-levels';
import { build, play, playBy, nearObstacle, hookSwing, hookSwings, atEdges, type Script } from './play';
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
  'long-way-down': plain,
  'swing-shift': plain,
  'balloon-ride': plain,
  'last-embers': plain,
  drawbridge: plain,
  'chimney-draught': plain,
  'grandfather-clock': plain,
  'mantel-run': plain,
};

/** Hold still for `wait` seconds (waiting for the pendulum), drive, hook it once the lamp passes `latch`, let go past `rel` while moving forward. */
const onTheBeat = (wait: number, latch: number, rel: number) => {
  let shot = false;
  let let_ = false;
  return (r: Run): Partial<RunInput> => {
    if (r.time < wait) return {};
    const p = r.lampPos();
    if (!shot && p.x > latch) {
      shot = true;
      return { drive: true, hooks: true };
    }
    if (shot && !let_ && r.hooks.some((h) => h.joint) && p.x > rel && r.main.getLinearVelocity().x > 0) {
      let_ = true;
      return { drive: true, hooks: true };
    }
    return { drive: true };
  };
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
/** Closed-loop policy factory; jitter is handed to the factory to shift its trigger. */
const policy =
  (make: (j: number) => (r: Run) => Partial<RunInput>): Runner =>
  (lvl, bp, j) =>
    playBy(lvl, bp, make(j));
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
  'long-way-down': [
    { name: 'umbrella tilted forward, opened off the edge', bp: build([...base, '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'umbrella@3,2>1']), run: scripted([...D, [1.0, 30, ['umbrellas']]]) },
    { name: 'two lanterns as parachutes (never lit)', bp: build([...base, '0,0 0,3', '6,0 6,3'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'lantern@0,3', 'lantern@6,3']), run: scripted(D) },
  ],
  'swing-shift': [
    { name: 'hook aimed forward, shot at the edge', bp: build([...base, '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'hook@3,2>1']), run: policy((j) => hookSwing(3.3 + j * 2.5, 0.5, 11.8)) },
    { name: 'rocket aimed up-forward', bp: build(base, ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>1']), run: scripted([...D, [0.3, 1.0, ['rockets']]]) },
  ],
  'balloon-ride': [
    { name: 'three balloons, just drive', bp: build([...base, '0,0 1,1', '6,0 5,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'balloon@3,0', 'balloon@1,1', 'balloon@5,1']), run: scripted(D) },
    { name: 'two sky lanterns, lit up the wall', bp: build([...base, '0,0 1,1', '6,0 5,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'lantern@1,1', 'lantern@5,1']), run: policy((j) => (r) => ({ drive: true, lanterns: r.lampPos().y < 9 + j * 5 && r.lampPos().x < 12 })) },
    { name: 'five balloons, two coins of ballast (letter)', bp: build([...base, '0,0 1,1', '6,0 5,1', '3,1 4,1', '3,1 2,1', '0,0 0,1', '6,0 6,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'balloon@3,0', 'balloon@1,1', 'balloon@5,1', 'balloon@4,1', 'balloon@2,1', 'coin@0,1', 'coin@6,1']), run: scripted(D) },
    { name: 'two balloons and a lantern boost', bp: build([...base, '0,0 1,1', '6,0 5,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'balloon@1,1', 'balloon@5,1', 'lantern@3,0']), run: policy((j) => (r) => ({ drive: true, lanterns: r.lampPos().y < 8.5 + j * 5 && r.lampPos().x < 12 })) },
  ],
  'last-embers': [
    { name: 'hook the first gap, rocket the second (star)', bp: build([...base, '3,1 3,2', '0,0 0,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'hook@3,2>1', 'rocket@3,0>0', 'rocket@0,1>0']), run: policy((j) => { const h = hookSwings([7.45 + j * 1.5], 0.45 + j, [15.8]); const rk = atEdges([21], 2 + j * 5, 'rockets', 0.5); return (r) => ({ ...h(r), rockets: !!rk(r).rockets }); }) },
    { name: 'two flat rockets, candles to refuel', bp: build([...base, '0,0 0,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>0', 'rocket@0,1>0']), run: policy((j) => atEdges([8, 21], 2 + j * 5, 'rockets', 0.5 + j)) },
    { name: 'one rocket lobbed high on eraser bumpers (letter)', bp: build([...base, '0,0 0,1', '6,0 6,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>1', 'eraser@0,1', 'eraser@6,1']), run: policy((j) => atEdges([8, 21], 1.5 + j * 3, 'rockets', 0.7 + j * 0.5)) },
  ],
  drawbridge: [
    { name: 'braced post with an eraser tip pushes high (letter)', bp: build([...base, '6,0 6,2 6,4', '3,1 6,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'eraser@6,4']), run: scripted(D) },
    { name: 'front post plus a coin of weight', bp: build([...base, '6,0 6,3', '0,0 0,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'coin@0,1']), run: scripted(D) },
    { name: 'flat rocket shove down low', bp: build(base, ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>0']), run: policy((j) => atEdges([10], 1 + j * 3, 'rockets', 1)) },
  ],
  'chimney-draught': [
    { name: 'one umbrella up, ride the draught', bp: build([...base, '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'umbrella@3,2>2']), run: policy((j) => (r) => ({ drive: true, umbrellas: r.lampPos().x > 6.5 + j * 5 && r.lampPos().x < 20 - j * 5 })) },
    { name: 'two umbrellas soar (letter)', bp: build([...base, '0,0 0,2', '6,0 6,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'umbrella@0,2>2', 'umbrella@6,2>2']), run: policy((j) => (r) => ({ drive: true, umbrellas: r.lampPos().x > 6.5 + j * 5 && r.lampPos().x < 20.5 - j * 5 })) },
    { name: 'one unlit lantern as a sail', bp: build([...base, '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'lantern@3,2']), run: scripted(D) },
  ],
  'grandfather-clock': [
    { name: 'wait for the beat, hook the pendulum', bp: build([...base, '6,0 6,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'hook@6,2>1']), run: policy((j) => onTheBeat(3 + j * 2, 4.3, 14 + j * 5)) },
    { name: 'two rockets, one short burst', bp: build([...base, '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>1', 'rocket@3,2>1']), run: scripted([...D, [0.75, 1.25, ['rockets']]]) },
    { name: 'one long burn on eraser bumpers', bp: build([...base, '0,0 0,1', '6,0 6,1'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>1', 'eraser@0,1', 'eraser@6,1']), run: scripted([...D, [0.8, 1.7, ['rockets']]]) },
  ],
  'mantel-run': [
    { name: 'front post topples the book, one umbrella rides up', bp: build([...base, '6,0 6,3', '3,1 3,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'umbrella@3,2>2']), run: policy((j) => (r) => ({ drive: true, umbrellas: r.lampPos().x > 20.5 + j * 5 && r.lampPos().x < 34.5 - j * 5 })) },
    { name: 'front post and two umbrellas soar (letter)', bp: build([...base, '6,0 6,3', '0,0 0,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'umbrella@0,2>2', 'umbrella@6,3>2']), run: policy((j) => (r) => ({ drive: true, umbrellas: r.lampPos().x > 20.5 + j * 5 && r.lampPos().x < 37.5 - j * 10 })) },
    { name: 'rocket shove, two umbrellas', bp: build([...base, '0,0 0,2', '6,0 6,2'], ['lamp@3,1', 'key@0,0', 'key@6,0', 'rocket@3,0>0', 'umbrella@0,2>2', 'umbrella@6,2>2']), run: policy((j) => (r) => ({ drive: true, rockets: r.lampPos().x > 5 && r.lampPos().x < 10, umbrellas: r.lampPos().x > 20.5 + j * 5 && r.lampPos().x < 37.5 - j * 10 })) },
  ],
  dominoes: [
    { name: 'compact cart on two springs', bp: build(['0,0 1,0 3,0 4,0', '1,0 2,1 3,0'], ['lamp@2,1', 'key@0,0', 'key@4,0', 'spring@1,0>6', 'spring@3,0>6']), run: near([9, 16], 1.9, 'springs', 0) },
    { name: 'rocket hops (short bursts)', bp: build(['0,0 1,0 2,0 3,0 4,0', '2,0 2,1'], ['lamp@2,1', 'key@0,0', 'key@4,0', 'rocket@1,0>2', 'rocket@3,0>2']), run: near([9, 16], 2.4, 'rockets', 0.4) },
  ],
};

/** Builds from the job before that may also solve the next one, and why that's fine. */
const CARRY_OK = new Set([
  // its rubber bumper on a front post is the Drawbridge's own eraser-tipped push, found early
  'drawbridge:one rocket lobbed high on eraser bumpers (letter)',
]);

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
      // variety: last job's answers, just driven, shouldn't already solve this one
      const prev = LEVELS[LEVELS.indexOf(lvl) - 1];
      if (lvl.world > 0 && prev)
        it(`not solved by driving the builds that solved ${prev.name}`, () => {
          for (const s of SOLUTIONS[prev.id] ?? []) {
            if (benchProblem(lvl, s.bp)) continue; // not buildable with this kit
            if (CARRY_OK.has(`${lvl.id}:${s.name}`)) continue;
            expect(play(lvl, s.bp, D).outcome, s.name).not.toBe('delivered');
          }
        });
      // from the Bookshelf on, a full set of stars should take more than holding one button
      if (lvl.world > 0)
        it('holding drive alone never earns all three stars', () => {
          for (const s of sols ?? []) {
            const r = play(lvl, s.bp, D);
            expect(starsFor(lvl, r, s.bp).every(Boolean), s.name).toBe(false);
          }
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
