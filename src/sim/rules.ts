// The flame, the stamps and the cart parts. Pure data and arithmetic, no DOM.
import { BASE_CART, type CartSpec } from './sim';

// ---------- Stamps: passive rules that bend how the flame grows and posts ----------

export type StampId =
  | 'backhand'
  | 'postageDue'
  | 'airmail'
  | 'bellows'
  | 'tempered'
  | 'hotPotato'
  | 'longFuse'
  | 'nightOwl'
  | 'lantern'
  | 'doubleWick'
  | 'sorter'
  | 'purse'
  | 'featherweight'
  | 'firstClass'
  | 'rubberStamp';

export interface StampDef {
  id: StampId;
  name: string;
  text: string;
  price: number;
  /** Ink colour index for the printed stamp. */
  ink: number;
  /** Drawing motif. */
  motif: 'loop' | 'envelope' | 'plane' | 'bellows' | 'glass' | 'potato' | 'fuse' | 'owl' | 'lantern' | 'wick' | 'eye' | 'purse' | 'feather' | 'crown' | 'stamp';
}

export const STAMPS: Record<StampId, StampDef> = {
  backhand: { id: 'backhand', name: 'Backhand', text: 'Backflips earn ×3 heat. A frontflip snuffs all your sparks.', price: 5, ink: 0, motif: 'loop' },
  postageDue: { id: 'postageDue', name: 'Postage Due', text: 'Each window you drive past without posting adds +2 sparks.', price: 6, ink: 1, motif: 'envelope' },
  airmail: { id: 'airmail', name: 'Air Mail', text: 'Posting while airborne is worth ×2.', price: 5, ink: 2, motif: 'plane' },
  bellows: { id: 'bellows', name: 'Bellows', text: 'Every 3 letters you grab adds +1 spark.', price: 4, ink: 3, motif: 'bellows' },
  tempered: { id: 'tempered', name: 'Tempered Glass', text: 'A big flame no longer makes your lamp fragile. Sparks cap at 6.', price: 5, ink: 4, motif: 'glass' },
  hotPotato: { id: 'hotPotato', name: 'Hot Potato', text: 'Unposted heat grows 6% every second. Your lamp gets fragile twice as fast.', price: 6, ink: 0, motif: 'potato' },
  longFuse: { id: 'longFuse', name: 'Long Fuse', text: 'Wheelies earn ×3 heat and add a spark every time.', price: 5, ink: 1, motif: 'fuse' },
  nightOwl: { id: 'nightOwl', name: 'Night Owl', text: 'Each window lit this shift: new flames start with +1 spark.', price: 6, ink: 2, motif: 'owl' },
  lantern: { id: 'lantern', name: 'Paper Lantern', text: 'Crashing keeps half your heat.', price: 4, ink: 3, motif: 'lantern' },
  doubleWick: { id: 'doubleWick', name: 'Double Wick', text: 'Posting with 8 or more sparks doubles the postage.', price: 7, ink: 4, motif: 'wick' },
  sorter: { id: 'sorter', name: "Sorter's Eye", text: 'Repeating a trick never loses value.', price: 5, ink: 0, motif: 'eye' },
  purse: { id: 'purse', name: 'Ember Purse', text: '+1 penny for every window you post at.', price: 4, ink: 1, motif: 'purse' },
  featherweight: { id: 'featherweight', name: 'Featherweight', text: 'Airtime earns ×3 heat. Clean landings earn nothing.', price: 5, ink: 2, motif: 'feather' },
  firstClass: { id: 'firstClass', name: 'First Class', text: 'High windows post at ×4 instead of ×2.', price: 5, ink: 3, motif: 'crown' },
  rubberStamp: { id: 'rubberStamp', name: 'Rubber Stamp', text: 'Every clean landing adds a spark, even after a tiny hop.', price: 5, ink: 4, motif: 'stamp' },
};
export const STAMP_IDS = Object.keys(STAMPS) as StampId[];
export const MAX_STAMPS = 5;

// ---------- Cart parts: physical upgrades you can see on the cart ----------

export type PartSlot = 'wheels' | 'spring' | 'key' | 'vane' | 'glass';
export type PartId = 'reels' | 'buttons' | 'caps' | 'bedspring' | 'hairpin' | 'twinKey' | 'feather' | 'hurricane';

export interface PartDef {
  id: PartId;
  slot: PartSlot;
  name: string;
  text: string;
  price: number;
}

export const PARTS: Record<PartId, PartDef> = {
  reels: { id: 'reels', slot: 'wheels', name: 'Cotton Reels', text: 'Big wheels. Roll over bumps, land softer, spin slower.', price: 6 },
  buttons: { id: 'buttons', slot: 'wheels', name: 'Shirt Buttons', text: 'Tiny light wheels. Faster flips in the air.', price: 6 },
  caps: { id: 'caps', slot: 'wheels', name: 'Bottle Caps', text: 'Grippy crimped wheels. Climb anything, wheelie easily.', price: 5 },
  bedspring: { id: 'bedspring', slot: 'spring', name: 'Bedspring', text: 'Soft suspension. Your lamp takes much harder landings.', price: 7 },
  hairpin: { id: 'hairpin', slot: 'spring', name: 'Hairpin Spring', text: 'Stiff, poppy suspension. More speed off every bump.', price: 5 },
  twinKey: { id: 'twinKey', slot: 'key', name: 'Twin Key', text: 'A second winding key. More power and top speed.', price: 7 },
  feather: { id: 'feather', slot: 'vane', name: 'Tail Feather', text: 'A moth-wing vane. Spin faster in the air.', price: 6 },
  hurricane: { id: 'hurricane', slot: 'glass', name: 'Hurricane Glass', text: 'A spare chimney. +1 lamp glass for the rest of the night.', price: 6 },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];

export interface Loadout {
  parts: PartId[];
}

export function cartSpecFor(parts: readonly PartId[]): { spec: CartSpec; tolerance: number } {
  const s: CartSpec = { ...BASE_CART };
  let tolerance = 1;
  for (const p of parts) {
    switch (p) {
      case 'reels':
        s.wheelR = 0.54;
        s.frontR = 0.54;
        s.spin *= 0.86;
        s.torque *= 1.15;
        tolerance *= 1.12;
        break;
      case 'buttons':
        s.wheelR = 0.33;
        s.frontR = 0.33;
        s.spin *= 1.2;
        s.airRot *= 1.18;
        s.airAccel *= 1.2;
        break;
      case 'caps':
        s.wheelFriction = 2.6;
        s.torque *= 1.1;
        break;
      case 'bedspring':
        s.suspHz = 2.8;
        s.suspDamp = 0.45;
        tolerance *= 1.35;
        break;
      case 'hairpin':
        s.suspHz = 7;
        s.suspDamp = 0.35;
        s.restitution = 0.25;
        break;
      case 'twinKey':
        s.torque *= 1.4;
        s.spin *= 1.2;
        break;
      case 'feather':
        s.airRot *= 1.3;
        s.airAccel *= 1.5;
        break;
      case 'hurricane':
        break;
    }
  }
  return { spec: s, tolerance };
}

// ---------- The flame: your live combo ----------

export interface TrickPop {
  label: string;
  heat: number;
  /** Sparks added by this trick (may be negative). */
  sparks: number;
  repeat: number;
}

/** Base landing speed (m/s into the ground) a small flame survives. */
export const BASE_TOLERANCE = 15;
/** How much a roaring flame lowers that, at full size. */
export const FLAME_FRAGILITY = 5;
/** Heat at which the flame is "full size". */
export const FULL_FLAME = 2500;

export class Flame {
  heat = 0;
  sparks = 1;
  labels = new Map<string, number>();
  letters = 0;
  pops: TrickPop[] = [];
  constructor(readonly stamps: ReadonlySet<StampId>) {}

  has(id: StampId): boolean {
    return this.stamps.has(id);
  }

  get alive(): boolean {
    return this.heat > 0;
  }

  /** 0..1 visual size of the flame. */
  get size(): number {
    return Math.min(1, this.heat / FULL_FLAME);
  }

  sparkCap(): number {
    return this.has('tempered') ? 6 : 99;
  }

  addSparks(n: number): number {
    const before = this.sparks;
    this.sparks = Math.max(1, Math.min(this.sparkCap(), this.sparks + n));
    return this.sparks - before;
  }

  /** Landing speed this lamp survives right now. */
  tolerance(partTol: number): number {
    if (this.has('tempered')) return BASE_TOLERANCE * partTol;
    const rate = this.has('hotPotato') ? 2 : 1;
    const f = Math.min(1, (this.heat / FULL_FLAME) * rate);
    return (BASE_TOLERANCE - FLAME_FRAGILITY * f) * partTol;
  }

  /** Award a trick. `kindles` says whether a first-time label adds a spark. */
  award(label: string, heat: number, kindles = true, family = label): TrickPop {
    const n = this.labels.get(family) ?? 0;
    this.labels.set(family, n + 1);
    let h = heat;
    if (n > 0 && !this.has('sorter')) h *= Math.max(0.25, Math.pow(0.6, n));
    if (this.has('backhand') && family.includes('Backflip')) h *= 3;
    if (this.has('featherweight') && family === 'Air') h *= 3;
    if (this.has('longFuse') && family.includes('Wheelie')) h *= 3;
    h = Math.round(h);
    let sparks = 0;
    if (this.has('backhand') && family.includes('Frontflip')) {
      sparks = -(this.sparks - 1);
      this.sparks = 1;
    } else if (kindles && (n === 0 || (this.has('longFuse') && family.includes('Wheelie')) || (this.has('sorter') && n < 3))) {
      sparks = this.addSparks(1);
    }
    this.heat += h;
    const pop = { label, heat: h, sparks, repeat: n };
    this.pops.push(pop);
    return pop;
  }

  letter(): TrickPop {
    this.letters++;
    let sparks = 0;
    if (this.has('bellows') && this.letters % 3 === 0) sparks = this.addSparks(1);
    this.heat += 30;
    const pop = { label: 'Letter', heat: 30, sparks, repeat: 0 };
    this.pops.push(pop);
    return pop;
  }

  /** Called every sim tick while the flame burns. */
  tick(dt: number): void {
    if (this.has('hotPotato') && this.heat > 0) this.heat *= 1 + 0.06 * dt;
  }

  /** Value of posting now, before resetting. */
  postValue(opts: { high: boolean; airborne: boolean }): { value: number; mult: number; parts: string[] } {
    let mult = 1;
    const parts: string[] = [];
    if (opts.high) {
      const m = this.has('firstClass') ? 4 : 2;
      mult *= m;
      parts.push(`High window ×${m}`);
    }
    if (opts.airborne && this.has('airmail')) {
      mult *= 2;
      parts.push('Air Mail ×2');
    }
    if (this.sparks >= 8 && this.has('doubleWick')) {
      mult *= 2;
      parts.push('Double Wick ×2');
    }
    return { value: Math.round(this.heat * this.sparks * mult), mult, parts };
  }

  reset(startSparks: number): void {
    this.heat = 0;
    this.sparks = Math.max(1, Math.min(this.sparkCap(), startSparks));
    this.labels.clear();
    this.letters = 0;
  }
}
