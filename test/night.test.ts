// Whole nights played by the bot through the real run rules: wages, the counter, supervisors.
import { expect, it } from 'vitest';
import { runBot } from '../src/sim/bot';
import { newRun, wages, rollOffers, buyOffer } from '../src/sim/night';
import { targetFor, ruleFor, SHIFTS } from '../src/sim/shift';

export function playNight(seed: number): { reached: number; posted: number[] } {
  const run = newRun(seed);
  const posted: number[] = [];
  for (let shift = 1; shift <= SHIFTS; shift++) {
    run.shift = shift;
    const r = runBot({ seed, shift, target: targetFor(shift), stamps: run.stamps, parts: run.parts, glasses: run.glassesMax, rule: ruleFor(shift, seed) }, { flips: true });
    posted.push(r.sh.posted);
    if (!r.sh.passed) return { reached: shift - 1, posted };
    for (const [, n] of wages(r.sh)) run.pennies += n;
    const offers = rollOffers(run, 0);
    for (const o of [...offers].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'stamp' ? -1 : 1))) buyOffer(run, o);
  }
  return { reached: SHIFTS, posted };
}

it('the bot clears early shifts on most nights and some nights reach dawn', () => {
  const N = Number(process.env.NIGHTS ?? 12);
  const reached = new Array(SHIFTS + 1).fill(0);
  const sums = new Array(SHIFTS).fill(0);
  const counts = new Array(SHIFTS).fill(0);
  for (let seed = 1; seed <= N; seed++) {
    const r = playNight(seed * 101);
    reached[r.reached]++;
    r.posted.forEach((p, i) => {
      sums[i] += p;
      counts[i]++;
    });
  }
  if (process.env.NIGHTS) {
    console.log('reached', reached.join(' '));
    console.log('avg posted', sums.map((s, i) => Math.round(s / Math.max(1, counts[i]))).join(' '), 'targets', [1, 2, 3, 4, 5, 6].map(targetFor).join(' '));
  }
  const clearedTwo = reached.slice(2).reduce((a, b) => a + b, 0);
  expect(clearedTwo / N).toBeGreaterThanOrEqual(0.75);
  expect(reached[SHIFTS]).toBeGreaterThanOrEqual(1);
});
