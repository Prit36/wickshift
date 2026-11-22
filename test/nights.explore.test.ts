// Exploratory: full nights driven by the bot with different shop policies.
// Prints where runs end, so targets and prices can be calibrated. Not a pass/fail test.
import { test } from 'vitest';
import { runBot } from '../src/sim/bot';
import { newRun, deliveryConfig, wages, advance, rollOffers, buyOffer, priceOf, rerollCost, ROUTES, targetFor, type Run, type Offer } from '../src/sim/night';
import { STAMPS } from '../src/sim/stamps';

type Policy = 'none' | 'greedy' | 'stampsOnly' | 'saver';

function shop(run: Run, policy: Policy): void {
  if (policy === 'none') return;
  let rerolls = 0;
  for (let round = 0; round < 3; round++) {
    const offers = rollOffers(run, rerolls);
    const want = (o: Offer) => {
      if (o.kind === 'stamp') return STAMPS[o.id].when === 'post' || STAMPS[o.id].when === 'trick' ? 3 : 2;
      if (o.kind === 'postcard') return policy === 'stampsOnly' ? 0 : 1.5;
      return policy === 'stampsOnly' ? 0 : 1;
    };
    const sorted = [...offers].sort((a, b) => want(b) - want(a));
    for (const o of sorted) {
      if (want(o) <= 0) continue;
      const keep = policy === 'saver' ? 10 : 0;
      if (run.pennies - priceOf(o) < keep) continue;
      buyOffer(run, o);
    }
    if (policy === 'greedy' && run.pennies >= rerollCost(rerolls) + 6 && run.stamps.length < 5) {
      run.pennies -= rerollCost(rerolls);
      rerolls++;
    } else break;
  }
}

// Run with: EXPLORE=1 npx vitest run nights.explore
test.skipIf(!process.env.EXPLORE)('nights', () => {
  const lines: string[] = [];
  const causes: Record<string, number> = {};
  for (const flips of [false, true]) {
    for (const policy of ['none', 'greedy', 'saver'] as Policy[]) {
      const reach: Record<string, number> = {};
      const ratio: Record<string, number[]> = {};
      let dawns = 0;
      const N = 12;
      for (let seed = 1; seed <= N; seed++) {
        const run = newRun(seed * 7 + 3);
        let ended = '';
        while (run.route <= ROUTES) {
          const cfg = deliveryConfig(run);
          const r = runBot(cfg, { flips, maxTicks: 60 * 150 });
          const key = `${run.route}.${run.step}`;
          (ratio[key] ??= []).push(r.sh.posted / cfg.target);
          if (!r.sh.passed) {
            ended = key;
            const why = r.sh.glasses <= 0 ? 'glass' : 'short';
            const k2 = `${why}:${cfg.rule ?? cfg.kind}`;
            causes[k2] = (causes[k2] ?? 0) + 1;
            break;
          }
          const w = wages(run, r.sh);
          run.pennies += w.reduce((a, l) => a + l[1], 0);
          advance(run);
          shop(run, policy);
        }
        if (!ended) dawns++;
        reach[ended || 'dawn'] = (reach[ended || 'dawn'] ?? 0) + 1;
      }
      const med = Object.entries(ratio)
        .sort()
        .map(([k, v]) => `${k}:${v.sort((a, b) => a - b)[Math.floor(v.length / 2)].toFixed(2)}(${v.length})`)
        .join(' ');
      lines.push(`flips=${flips} policy=${policy} dawns=${dawns}/${N} ends=${JSON.stringify(reach)}\n   median posted/target ${med}`);
    }
  }
  lines.push('causes: ' + JSON.stringify(causes));
  lines.push('targets: ' + [1, 2, 3, 4].map((r) => [0, 1, 2].map((s) => targetFor(r, s)).join('/')).join('  '));
  console.log(lines.join('\n'));
}, 1200000);
