// Courses: deterministic, always drivable, paced, and varied in what they ask.
import { describe, expect, it } from 'vitest';
import { runBot } from '../src/sim/bot';
import { generateCourse, SETPIECE_NAMES, VERB } from '../src/sim/terrain';
import { KINDS } from '../src/sim/night';
import { INSPECTOR_IDS } from '../src/sim/shift';
import { PART_IDS } from '../src/sim/rules';
import { cfg } from './helpers';

describe('courses', () => {
  it('are deterministic for a seed', () => {
    const a = generateCourse({ seed: 42, route: 3, kind: 'express' });
    const b = generateCourse({ seed: 42, route: 3, kind: 'express' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('every delivery finishes for a careful driver', () => {
    const bad: string[] = [];
    for (let route = 1; route <= 4; route++)
      for (const kind of KINDS)
        for (let seed = 1; seed <= 6; seed++) {
          const r = runBot(cfg(seed, route, kind), { maxTicks: 60 * 120 });
          if (!r.sh.done || r.crashes > 1 || r.ticks / 60 > 75)
            bad.push(`r${route} ${kind} seed ${seed}: done=${r.sh.done} crashes=${r.crashes}@${r.crashX.join(',')} t=${(r.ticks / 60).toFixed(0)}s`);
        }
    expect(bad).toEqual([]);
  });

  it('every Inspector stays passable', () => {
    const bad: string[] = [];
    for (const rule of INSPECTOR_IDS)
      for (let seed = 1; seed <= 3; seed++) {
        const r = runBot(cfg(seed, 3, 'inspection', { rule }), { maxTicks: 60 * 150 });
        if (!r.sh.done) bad.push(`${rule} seed ${seed} stuck at x=${r.sh.sim.pos.x.toFixed(0)}`);
      }
    expect(bad).toEqual([]);
  });

  it('stays drivable with every cart part fitted', () => {
    const bad: string[] = [];
    for (const part of PART_IDS)
      for (let route = 1; route <= 4; route++)
        for (const kind of KINDS)
          for (const seed of [2, 7]) {
            const r = runBot(cfg(seed, route, kind, { parts: [part] }), { maxTicks: 60 * 120 });
            if (!r.sh.done || r.crashes > 1) bad.push(`${part} r${route} ${kind} seed ${seed}: done=${r.sh.done} crashes=${r.crashes}`);
          }
    expect(bad).toEqual([]);
  });

  it('ask several different questions and never repeat a setpiece back to back', () => {
    for (let route = 2; route <= 4; route++)
      for (const kind of KINDS)
        for (let seed = 1; seed <= 10; seed++) {
          const c = generateCourse({ seed, route, kind });
          const sets = c.chunks.filter((ch) => ch.set).map((ch) => ch.name);
          for (const s of sets) expect(SETPIECE_NAMES).toContain(s);
          expect(new Set(sets.map((s) => VERB[s])).size, `${route} ${kind} ${seed}: ${sets.join(',')}`).toBeGreaterThanOrEqual(3);
          for (let i = 1; i < sets.length; i++) expect(sets[i], `${route} ${kind} ${seed}`).not.toBe(sets[i - 1]);
        }
  });

  it('the first deliveries introduce one new setpiece at a time', () => {
    const local = generateCourse({ seed: 5, route: 1, kind: 'local' });
    const sets = local.chunks.filter((c) => c.set).map((c) => c.name);
    expect(new Set(sets).size).toBe(sets.length);
    expect(sets[0]).toBe('hoopgap');
  });

  it('get to the first window quickly', () => {
    // about ten seconds of driving, and well inside the first half of the course
    for (let route = 1; route <= 4; route++)
      for (let seed = 1; seed <= 10; seed++)
        for (const kind of KINDS) {
          const c = generateCourse({ seed, route, kind });
          const first = c.windows.find((w) => !w.final)!.x - c.startX;
          expect(first, `r${route} ${kind} seed ${seed}`).toBeLessThan(125);
          expect(first / (c.endX - c.startX), `r${route} ${kind} seed ${seed}`).toBeLessThan(0.45);
        }
  });

  it('a flipping driver with nothing bought clears the first delivery', () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) if (runBot(cfg(seed, 1, 'local', { glasses: 3 }), { flips: true }).sh.passed) wins++;
    expect(wins).toBeGreaterThanOrEqual(7);
  });
});
