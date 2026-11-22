// The run: targets, wages and interest, the Night Counter, and whether buying things helps.
import { describe, expect, it } from 'vitest';
import { Shift } from '../src/sim/shift';
import { runBot } from '../src/sim/bot';
import { PARTS } from '../src/sim/rules';
import { STAMPS, MAX_STAMPS, stampPrice, sellPrice } from '../src/sim/stamps';
import {
  ROUTES,
  KINDS,
  newRun,
  targetFor,
  deliveryConfig,
  wages,
  advance,
  rollOffers,
  buyOffer,
  cantBuy,
  priceOf,
  sellStamp,
  moveStamp,
  rerollCost,
  inspectorFor,
  type Offer,
  type Run,
} from '../src/sim/night';

describe('targets', () => {
  it('climb every delivery and keep climbing into Overtime', () => {
    let last = 0;
    for (let route = 1; route <= ROUTES + 3; route++)
      for (let step = 0; step < KINDS.length; step++) {
        const t = targetFor(route, step);
        expect(t, `route ${route} step ${step}`).toBeGreaterThan(last);
        last = t;
      }
  });
});

describe('the run', () => {
  it('advances Local → Express → Inspection, then the next route', () => {
    const run = newRun(1);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      seen.push(`${run.route}${deliveryConfig(run).kind[0]}`);
      advance(run);
    }
    expect(seen).toEqual(['1l', '1e', '1i', '2l', '2e', '2i', '3l']);
  });

  it('only Inspections carry a rule, and the first one is never a harsh one', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const run = newRun(seed);
      expect(['cat', 'shortWick']).not.toContain(inspectorFor(run, 1));
      expect(deliveryConfig(run).rule).toBeNull();
      run.step = 2;
      expect(deliveryConfig(run).rule).toBe(inspectorFor(run));
    }
  });

  it('is the same run for the same seed', () => {
    expect(newRun(9)).toEqual(newRun(9));
    expect(rollOffers(newRun(9), 0)).toEqual(rollOffers(newRun(9), 0));
    expect(rollOffers(newRun(9), 0)).not.toEqual(rollOffers(newRun(9), 1));
  });
});

describe('wages', () => {
  const finished = (posted: number, broken = 0, tips = 0) => {
    const sh = new Shift(deliveryConfig(newRun(1)));
    sh.posted = posted;
    sh.glassesBroken = broken;
    sh.pennies = tips;
    return sh;
  };
  const sum = (lines: [string, number][]) => lines.reduce((a, l) => a + l[1], 0);

  it('pay for the delivery, going over, clean glass and tips', () => {
    const run = newRun(1);
    run.pennies = 0;
    const t = targetFor(1, 0);
    expect(sum(wages(run, finished(t, 1)))).toBe(3);
    expect(sum(wages(run, finished(t)))).toBe(4);
    expect(sum(wages(run, finished(t * 1.5, 0, 2)))).toBe(3 + 2 + 1 + 2);
    expect(sum(wages(run, finished(t * 10, 1)))).toBe(3 + 3);
  });

  it('interest is 1 per 5 held, at most 5', () => {
    const run = newRun(1);
    const t = targetFor(1, 0);
    const base = (p: number) => {
      run.pennies = p;
      return sum(wages(run, finished(t, 1))) - 3;
    };
    expect([base(4), base(5), base(14), base(25), base(80)]).toEqual([0, 1, 2, 5, 5]);
  });
});

describe('a delivery', () => {
  const lastGlass = (posted: number) => {
    const sh = new Shift({ ...deliveryConfig(newRun(1)), glasses: 1 });
    sh.posted = posted;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sh as any).crash('lamp', sh.sim.pos.x, sh.sim.pos.y);
    for (let t = 0; t < 200 && !sh.done; t++) sh.step({ gas: false, brake: false, post: false });
    return sh;
  };

  it('breaking the last glass ends it, but a met target is still delivered', () => {
    const t = targetFor(1, 0);
    expect(lastGlass(t - 1)).toMatchObject({ done: true, passed: false });
    expect(lastGlass(t)).toMatchObject({ done: true, passed: true });
  });
});

describe('the Night Counter', () => {
  const rich = (): Run => ({ ...newRun(3), pennies: 100 });

  it('offers two stamps you do not own, a postcard and a cart part', () => {
    const run = rich();
    run.stamps = ['wax', 'loop'];
    for (let r = 0; r < 20; r++) {
      const o = rollOffers(run, r);
      expect(o.map((x) => x.kind)).toEqual(['stamp', 'stamp', 'postcard', 'part']);
      const ids = o.filter((x) => x.kind === 'stamp').map((x) => x.id);
      expect(new Set(ids).size).toBe(2);
      for (const id of ids) expect(run.stamps).not.toContain(id);
    }
  });

  it('buying takes pennies and gives the thing', () => {
    const run = rich();
    const stamp: Offer = { kind: 'stamp', id: 'wax', sold: false };
    expect(buyOffer(run, stamp)).toBe(true);
    expect(run.stamps).toEqual(['wax']);
    expect(run.pennies).toBe(100 - stampPrice('wax'));
    expect(buyOffer(run, stamp)).toBe(false);

    const card: Offer = { kind: 'postcard', id: 'grind', sold: false };
    buyOffer(run, card);
    expect(run.levels.grind).toBe(2);

    const glass: Offer = { kind: 'part', id: 'hurricane', sold: false };
    buyOffer(run, glass);
    expect(run.glassesMax).toBe(4);
  });

  it('a new part replaces the one in the same slot', () => {
    const run = rich();
    const same = Object.values(PARTS).filter((p) => p.slot === 'wheels');
    expect(same.length).toBeGreaterThan(1);
    buyOffer(run, { kind: 'part', id: same[0].id, sold: false });
    buyOffer(run, { kind: 'part', id: same[1].id, sold: false });
    expect(run.parts).toEqual([same[1].id]);
  });

  it('a full album or an empty purse says why', () => {
    const run = rich();
    run.stamps = ['wax', 'loop', 'kite', 'grease', 'purse'];
    expect(run.stamps.length).toBe(MAX_STAMPS);
    expect(cantBuy(run, { kind: 'stamp', id: 'carbon', sold: false })).toMatch(/full/i);
    run.pennies = 0;
    expect(cantBuy(run, { kind: 'postcard', id: 'flip', sold: false })).toMatch(/pennies/i);
  });

  it('selling pays half, rounded down, and moving swaps neighbours', () => {
    const run = rich();
    run.stamps = ['wax', 'carbon', 'loop'];
    expect(sellStamp(run, 1)).toBe(sellPrice('carbon'));
    expect(sellPrice('carbon')).toBe(Math.floor(stampPrice('carbon') / 2));
    expect(run.stamps).toEqual(['wax', 'loop']);
    expect(moveStamp(run, 0, 1)).toBe(true);
    expect(run.stamps).toEqual(['loop', 'wax']);
    expect(moveStamp(run, 1, 1)).toBe(false);
  });

  it('prices follow rarity and rerolls get dearer', () => {
    for (const s of Object.values(STAMPS)) expect(priceOf({ kind: 'stamp', id: s.id, sold: false })).toBe(stampPrice(s.id));
    expect(rerollCost(0)).toBeLessThan(rerollCost(3));
  });
});

/** Drive whole nights with the bot; return how many deliveries each run cleared. */
function nights(buy: boolean, seeds: number[]): number[] {
  return seeds.map((seed) => {
    const run = newRun(seed);
    let cleared = 0;
    while (run.route <= ROUTES) {
      const r = runBot(deliveryConfig(run), { flips: true, maxTicks: 60 * 150 });
      if (!r.sh.passed) break;
      cleared++;
      run.pennies += wages(run, r.sh).reduce((a, l) => a + l[1], 0);
      advance(run);
      if (!buy) continue;
      const offers = rollOffers(run, 0);
      const order = [...offers].sort((a, b) => Number(b.kind === 'stamp') - Number(a.kind === 'stamp'));
      for (const o of order) if (!cantBuy(run, o)) buyOffer(run, o);
    }
    return cleared;
  });
}

describe('balance', () => {
  it('a bot that buys gets further than one that never shops, on most nights', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i * 7 + 3);
    const none = nights(false, seeds);
    const buy = nights(true, seeds);
    let wins = 0;
    let losses = 0;
    buy.forEach((b, i) => (b > none[i] ? wins++ : b < none[i] ? losses++ : 0));
    // per seed, not a sum, so one lucky night can't carry it
    expect(wins, `buy ${buy} vs none ${none}`).toBeGreaterThan(losses * 3);
    // never shopping should not reach dawn; shopping should, sometimes
    expect(none.filter((n) => n >= 12)).toHaveLength(0);
    expect(buy.filter((n) => n >= 12).length).toBeGreaterThanOrEqual(1);
  }, 600000);
});
