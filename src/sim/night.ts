// Run-level rules shared by the game and the tests: wages and what the counter offers.
import { Rng } from './rng';
import { PARTS, PART_IDS, STAMPS, STAMP_IDS, MAX_STAMPS, type PartId, type StampId } from './rules';
import type { Shift } from './shift';

export interface Run {
  seed: number;
  shift: number;
  pennies: number;
  stamps: StampId[];
  parts: PartId[];
  total: number;
  glassesMax: number;
  bestPost: number;
  windows: number;
}

export function newRun(seed: number): Run {
  return { seed, shift: 1, pennies: 4, stamps: [], parts: [], total: 0, glassesMax: 3, bestPost: 0, windows: 0 };
}

/** Pennies earned for a cleared shift, as labelled lines. */
export function wages(sh: Shift): [string, number][] {
  const target = sh.cfg.target;
  const lines: [string, number][] = [['Shift wages', 4]];
  const over = Math.min(5, Math.floor(Math.max(0, sh.posted - target) / (target * 0.25)));
  if (over > 0) lines.push(['Over target', over]);
  if (sh.glasses > 0) lines.push([`Unbroken glass ×${sh.glasses}`, sh.glasses]);
  if (sh.pennies > 0) lines.push(['Ember Purse', sh.pennies]);
  return lines;
}

export interface Offer {
  kind: 'stamp' | 'part';
  id: StampId | PartId;
  sold: boolean;
}

export function rollOffers(run: Run, rerolls: number): Offer[] {
  const rng = new Rng(run.seed * 31 + run.shift * 977 + rerolls * 13);
  const stamps = STAMP_IDS.filter((id) => !run.stamps.includes(id));
  const parts = PART_IDS.filter((id) => !run.parts.includes(id) && !(id === 'hurricane' && run.glassesMax >= 5));
  const pick = <T,>(arr: T[], n: number): T[] => {
    const a = [...arr];
    const out: T[] = [];
    while (out.length < n && a.length) out.push(a.splice(Math.floor(rng.next() * a.length), 1)[0]);
    return out;
  };
  return [...pick(stamps, 3).map((id) => ({ kind: 'stamp' as const, id, sold: false })), ...pick(parts, 2).map((id) => ({ kind: 'part' as const, id, sold: false }))];
}

export function priceOf(o: Offer): number {
  return o.kind === 'stamp' ? STAMPS[o.id as StampId].price : PARTS[o.id as PartId].price;
}

export function rerollCost(rerolls: number): number {
  return 2 + rerolls;
}

/** Apply a purchase. Returns false if it can't be bought. */
export function buyOffer(run: Run, o: Offer): boolean {
  if (o.sold) return false;
  const price = priceOf(o);
  if (run.pennies < price) return false;
  if (o.kind === 'stamp') {
    if (run.stamps.length >= MAX_STAMPS) return false;
    run.stamps.push(o.id as StampId);
  } else {
    const def = PARTS[o.id as PartId];
    if (def.slot === 'glass') run.glassesMax++;
    else {
      run.parts = run.parts.filter((p) => PARTS[p].slot !== def.slot);
      run.parts.push(def.id);
    }
  }
  run.pennies -= price;
  o.sold = true;
  return true;
}
