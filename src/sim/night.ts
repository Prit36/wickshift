// Run-level rules shared by the game and the tests: the routes, targets, wages,
// interest, and what the Night Counter offers.
import { Rng } from './rng';
import { PARTS, PART_IDS, type PartId } from './rules';
import { STAMPS, STAMP_IDS, MAX_STAMPS, RARITY_WEIGHT, freshStampState, stampPrice, sellPrice, type StampId, type StampState, type Rarity } from './stamps';
import { FAMILIES, freshLevels, type Family, type Levels } from './tricks';
import { INSPECTOR_IDS, type InspectorId, type Shift, type ShiftConfig } from './shift';
import type { DeliveryKind } from './terrain';

export const ROUTES = 4;
export const KINDS: DeliveryKind[] = ['local', 'express', 'inspection'];
export const ROOMS = ['The Writing Desk', 'The Sorting Room', 'The Map Table', 'The Attic'];
export const KIND_NAME: Record<DeliveryKind, string> = { local: 'Local', express: 'Express', inspection: 'Inspection' };
export const PAY: Record<DeliveryKind, number> = { local: 3, express: 4, inspection: 6 };

export interface Run {
  seed: number;
  /** 1-based route; above ROUTES is Overtime. */
  route: number;
  /** 0 local, 1 express, 2 inspection. */
  step: number;
  pennies: number;
  stamps: StampId[];
  parts: PartId[];
  levels: Levels;
  glassesMax: number;
  state: StampState;
  /** One Inspector per route, rolled at the start so you can plan for it. */
  inspectors: InspectorId[];
  total: number;
  bestPost: number;
  windows: number;
  delivered: number;
}

const HARSH: InspectorId[] = ['cat', 'shortWick'];

export function newRun(seed: number): Run {
  const rng = new Rng(seed * 13 + 5);
  const pool = [...INSPECTOR_IDS];
  const inspectors: InspectorId[] = [];
  for (let i = 0; i < 12; i++) {
    if (!pool.length) pool.push(...INSPECTOR_IDS);
    // the first Inspection teaches: keep the two harshest for later routes
    const choices = i === 0 ? pool.filter((id) => !HARSH.includes(id)) : pool;
    const pick = rng.pick(choices);
    pool.splice(pool.indexOf(pick), 1);
    inspectors.push(pick);
  }
  return { seed, route: 1, step: 0, pennies: 4, stamps: [], parts: [], levels: freshLevels(), glassesMax: 3, state: freshStampState(), inspectors, total: 0, bestPost: 0, windows: 0, delivered: 0 };
}

export function kindOf(run: Run): DeliveryKind {
  return KINDS[run.step];
}

export function inspectorFor(run: Run, route = run.route): InspectorId {
  return run.inspectors[(route - 1) % run.inspectors.length];
}

const BASE_TARGET = [1500, 2400, 3600];
const ROUTE_MULT = [1, 2.8, 7, 17];

export function targetFor(route: number, step: number): number {
  const m = route <= ROUTES ? ROUTE_MULT[route - 1] : ROUTE_MULT[ROUTES - 1] * Math.pow(2.6, route - ROUTES);
  const t = BASE_TARGET[step] * m;
  const mag = Math.pow(10, Math.floor(Math.log10(t)) - 1);
  return Math.round(t / mag) * mag;
}

export function deliveryConfig(run: Run): ShiftConfig {
  const kind = kindOf(run);
  return {
    seed: run.seed + run.delivered * 101,
    route: run.route,
    kind,
    target: targetFor(run.route, run.step),
    stamps: [...run.stamps],
    parts: [...run.parts],
    levels: run.levels,
    glasses: run.glassesMax,
    rule: kind === 'inspection' ? inspectorFor(run) : null,
    state: run.state,
    pennies: run.pennies,
  };
}

/** Pennies earned for a cleared delivery, as labelled lines. Interest is on what you held before. */
export function wages(run: Run, sh: Shift): [string, number][] {
  const target = sh.cfg.target;
  const lines: [string, number][] = [[`${KIND_NAME[sh.cfg.kind]} delivery`, PAY[sh.cfg.kind]]];
  const over = Math.min(3, Math.floor(Math.max(0, sh.posted - target) / (target * 0.25)));
  if (over > 0) lines.push(['Over target', over]);
  if (sh.glassesBroken === 0) lines.push(['No broken glass', 1]);
  if (sh.pennies > 0) lines.push(['Tips on the way', sh.pennies]);
  const interest = Math.min(5, Math.floor(run.pennies / 5));
  if (interest > 0) lines.push([`Interest (1 per 5 held)`, interest]);
  return lines;
}

/** Move the run on after a cleared delivery. */
export function advance(run: Run): void {
  run.delivered++;
  run.step++;
  if (run.step >= KINDS.length) {
    run.step = 0;
    run.route++;
  }
}

// ---------------------------------------------------------------- the Night Counter

export type Offer =
  | { kind: 'stamp'; id: StampId; sold: boolean }
  | { kind: 'part'; id: PartId; sold: boolean }
  | { kind: 'postcard'; id: Family; sold: boolean };

export function rollOffers(run: Run, rerolls: number): Offer[] {
  const rng = new Rng(run.seed * 31 + run.delivered * 977 + rerolls * 13 + 7);
  const out: Offer[] = [];
  const taken = new Set<StampId>(run.stamps);
  for (let i = 0; i < 2; i++) {
    const rarity = rng.weighted(Object.entries(RARITY_WEIGHT) as [Rarity, number][]);
    let pool = STAMP_IDS.filter((id) => !taken.has(id) && STAMPS[id].rarity === rarity);
    if (!pool.length) pool = STAMP_IDS.filter((id) => !taken.has(id));
    if (!pool.length) break;
    const id = rng.pick(pool);
    taken.add(id);
    out.push({ kind: 'stamp', id, sold: false });
  }
  out.push({ kind: 'postcard', id: rng.pick(FAMILIES), sold: false });
  const parts = PART_IDS.filter((id) => !run.parts.includes(id) && !(id === 'hurricane' && run.glassesMax >= 5));
  if (parts.length) out.push({ kind: 'part', id: rng.pick(parts), sold: false });
  return out;
}

export const POSTCARD_PRICE = 3;

export function priceOf(o: Offer): number {
  if (o.kind === 'stamp') return stampPrice(o.id);
  if (o.kind === 'part') return PARTS[o.id].price;
  return POSTCARD_PRICE;
}

export function rerollCost(rerolls: number): number {
  return 3 + rerolls;
}

/** Why an offer can't be bought right now, or null if it can. */
export function cantBuy(run: Run, o: Offer): string | null {
  if (o.sold) return 'Sold';
  if (o.kind === 'stamp' && run.stamps.length >= MAX_STAMPS) return 'Album full: sell a stamp first';
  if (run.pennies < priceOf(o)) return 'Not enough pennies';
  return null;
}

/** Apply a purchase. Returns false if it can't be bought. */
export function buyOffer(run: Run, o: Offer): boolean {
  if (cantBuy(run, o)) return false;
  run.pennies -= priceOf(o);
  if (o.kind === 'stamp') run.stamps.push(o.id);
  else if (o.kind === 'postcard') run.levels[o.id]++;
  else {
    const def = PARTS[o.id];
    if (def.slot === 'glass') run.glassesMax++;
    else {
      run.parts = run.parts.filter((p) => PARTS[p].slot !== def.slot);
      run.parts.push(def.id);
    }
  }
  o.sold = true;
  return true;
}

export function sellStamp(run: Run, i: number): number {
  const id = run.stamps[i];
  if (!id) return 0;
  run.stamps.splice(i, 1);
  const p = sellPrice(id);
  run.pennies += p;
  return p;
}

export function moveStamp(run: Run, i: number, dir: -1 | 1): boolean {
  const j = i + dir;
  if (j < 0 || j >= run.stamps.length) return false;
  [run.stamps[i], run.stamps[j]] = [run.stamps[j], run.stamps[i]];
  return true;
}
