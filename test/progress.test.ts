import { describe, expect, it } from 'vitest';
import { ALL, WORLDS, levelsIn, jobOpen, worldOpen } from '../src/sim/all-levels';

const doneOf = (ids: string[]) => (id: string) => ids.includes(id);

describe('progress', () => {
  it('jobs are numbered 1..n in play order, each in a known world', () => {
    ALL.forEach((l, i) => expect(l.num).toBe(i + 1));
    for (const l of ALL) expect(l.world).toBeLessThan(WORLDS.length);
    for (let w = 0; w < WORLDS.length; w++) expect(levelsIn(w).length).toBeGreaterThanOrEqual(3);
  });
  it('a fresh save opens only the first job', () => {
    const open = ALL.filter((l) => jobOpen(l, doneOf([])));
    expect(open.map((l) => l.id)).toEqual([ALL[0].id]);
  });
  it('a stuck job can be skipped', () => {
    const w0 = levelsIn(0);
    expect(jobOpen(w0[2], doneOf([w0[0].id]))).toBe(true);
    expect(jobOpen(w0[3], doneOf([w0[0].id]))).toBe(false);
  });
  it('the next world opens after three deliveries', () => {
    const w0 = levelsIn(0).map((l) => l.id);
    expect(worldOpen(1, doneOf(w0.slice(0, 2)))).toBe(false);
    expect(worldOpen(1, doneOf(w0.slice(0, 3)))).toBe(true);
    expect(jobOpen(levelsIn(1)[0], doneOf(w0.slice(0, 3)))).toBe(true);
  });
});
