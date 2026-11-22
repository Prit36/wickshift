// The flame (your live combo), cart parts, and how a post is scored.
// Pure data and arithmetic, no DOM.
import { BASE_CART, type CartSpec } from './sim';
import { effectiveAlbum, type StampId, type StampState } from './stamps';
import { levelHeat, type Family, type Levels } from './tricks';

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
  reels: { id: 'reels', slot: 'wheels', name: 'Cotton Reels', text: 'Big wheels. Roll over tacks and bumps, land softer, spin slower.', price: 5 },
  buttons: { id: 'buttons', slot: 'wheels', name: 'Shirt Buttons', text: 'Tiny light wheels. Much faster flips in the air.', price: 5 },
  caps: { id: 'caps', slot: 'wheels', name: 'Bottle Caps', text: 'Grippy crimped wheels. Climb anything, wheelie easily.', price: 4 },
  bedspring: { id: 'bedspring', slot: 'spring', name: 'Bedspring', text: 'Soft suspension. Your lamp takes much harder landings.', price: 6 },
  hairpin: { id: 'hairpin', slot: 'spring', name: 'Hairpin Spring', text: 'Stiff, poppy suspension. Bigger air off every bump.', price: 4 },
  twinKey: { id: 'twinKey', slot: 'key', name: 'Twin Key', text: 'A second winding key. More power and top speed, but you land harder.', price: 6 },
  feather: { id: 'feather', slot: 'vane', name: 'Tail Feather', text: 'A moth-wing vane. Spin faster in the air.', price: 5 },
  hurricane: { id: 'hurricane', slot: 'glass', name: 'Hurricane Glass', text: 'A spare chimney. +1 lamp glass for every delivery.', price: 6 },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];

export function cartSpecFor(parts: readonly PartId[], heavy = false): { spec: CartSpec; tolerance: number } {
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
        s.airRot *= 1.22;
        s.airAccel *= 1.25;
        break;
      case 'caps':
        s.wheelFriction = 2.6;
        s.torque *= 1.1;
        break;
      case 'bedspring':
        s.suspHz = 3.8;
        s.suspDamp = 0.8;
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
  if (heavy) {
    s.heavy = 1.7;
    s.torque *= 1.45;
    s.airRot *= 0.75;
    s.airAccel *= 0.7;
  }
  return { spec: s, tolerance };
}

// ---------- The flame: your live combo ----------

export interface TrickPop {
  label: string;
  family: Family | 'letter';
  heat: number;
  /** Sparks added by this trick (may be negative). */
  sparks: number;
  repeat: number;
  /** Album slots of stamps that changed this trick. */
  fired: number[];
}

/** Base landing speed (m/s into the ground) a small flame survives. */
export const BASE_TOLERANCE = 15;
/** How much a roaring flame lowers that, at full fragility. */
export const FLAME_FRAGILITY = 5;
/** Carried value (heat × sparks), as a share of the delivery target, at which the flame is fully fragile. */
export const FRAGILE_SHARE = 0.6;

export interface PostCtx {
  high: boolean;
  airborne: boolean;
  final: boolean;
  gold: boolean;
  windowsLit: number;
  pennies: number;
}

export type PostStepKind = 'heat' | 'sparks' | 'xsparks';

export interface PostStep {
  /** Album slot of the stamp that fired, or -1 for the window. */
  slot: number;
  id: StampId | 'window';
  kind: PostStepKind;
  amount: number;
  label: string;
  /** Running totals after this step. */
  heat: number;
  sparks: number;
}

export interface PostResult {
  heat: number;
  sparks: number;
  steps: PostStep[];
  value: number;
  pennies: number;
  /** Album slots of money stamps that paid out. */
  paid: number[];
}

export class Flame {
  heat = 0;
  sparks = 1;
  labels = new Map<string, number>();
  families = new Set<Family>();
  letters = 0;
  tricks = 0;
  private eff: { id: StampId; slot: number }[];

  constructor(
    readonly album: readonly StampId[],
    readonly levels: Levels,
    readonly state: StampState,
  ) {
    this.eff = effectiveAlbum(album);
  }

  /** Copies of a stamp in effect (Carbon Copy counts). */
  count(id: StampId): number {
    let n = 0;
    for (const e of this.eff) if (e.id === id) n++;
    return n;
  }
  has(id: StampId): boolean {
    return this.count(id) > 0;
  }
  slots(id: StampId): number[] {
    return this.eff.filter((e) => e.id === id).map((e) => e.slot);
  }

  get alive(): boolean {
    return this.heat > 0;
  }

  sparkCap(): number {
    return this.has('tempered') ? 10 : 999;
  }

  addSparks(n: number): number {
    const before = this.sparks;
    this.sparks = Math.max(1, Math.min(this.sparkCap(), this.sparks + n));
    return this.sparks - before;
  }

  /** Carried value if posted at a plain window, ignoring stamps. */
  get carried(): number {
    return Math.round(this.heat * this.sparks);
  }

  /** 0..1 how fragile the lamp is right now. */
  fragility(target: number): number {
    if (this.has('tempered')) return 0;
    if (this.has('midnightOil')) return 1;
    const rate = this.has('hotPotato') ? 2 : 1;
    return Math.min(1, (this.carried / Math.max(1, target * FRAGILE_SHARE)) * rate);
  }

  /** Landing speed this lamp survives right now. */
  tolerance(partTol: number, target: number): number {
    return (BASE_TOLERANCE - FLAME_FRAGILITY * this.fragility(target)) * partTol;
  }

  /**
   * Award a trick. `grant` is the sparks it adds: 'first' means one spark the
   * first time this label appears in the flame (variety pays).
   */
  award(family: Family, label: string, baseHeat: number, grant: number | 'first', meta: { cubes?: number } = {}): TrickPop {
    const n = this.labels.get(label) ?? 0;
    this.labels.set(label, n + 1);
    const lv = this.levels[family];
    let h = baseHeat * levelHeat(lv);
    if (n > 0 && !this.has('sorter')) h *= Math.max(0.25, Math.pow(0.6, n));
    let sparks = grant === 'first' ? (n === 0 ? 1 : 0) : grant;
    if (sparks > 0) sparks += lv - 1;
    const fired: number[] = [];
    const fire = (id: StampId) => fired.push(...this.slots(id));
    let snuff = false;
    const c = (id: StampId) => this.count(id);

    if (family === 'flip' && c('loop')) {
      sparks += c('loop');
      fire('loop');
    }
    if (family === 'flip' && c('backhand')) {
      if (label.includes('Backflip')) {
        h *= 1 + c('backhand');
        sparks += c('backhand');
      } else snuff = true;
      fire('backhand');
    }
    if (family === 'grind' && c('grease')) {
      h *= 1 + c('grease');
      sparks += c('grease');
      fire('grease');
    }
    if (family === 'smash' && c('crumbs')) {
      h *= 1 + c('crumbs');
      sparks += Math.floor((meta.cubes ?? 0) / 5) * c('crumbs');
      fire('crumbs');
    }
    if (family === 'hoop' && c('hoopla')) {
      sparks += 2 * c('hoopla');
      fire('hoopla');
    }
    if (family === 'air' && c('kite')) {
      h *= 1 + c('kite');
      if (label === 'Huge Air') sparks += 2 * c('kite');
      fire('kite');
    }
    if (family === 'strike' && c('tailwind')) {
      sparks += 2 * c('tailwind');
      fire('tailwind');
    }
    if (family === 'landing' && label === 'Daredevil' && c('daredevil')) {
      h *= 1 + 2 * c('daredevil');
      sparks += 2 * c('daredevil');
      fire('daredevil');
    }
    h = Math.round(h);
    let added: number;
    if (snuff) {
      added = -(this.sparks - 1);
      this.sparks = 1;
    } else added = this.addSparks(sparks);
    this.heat += h;
    this.families.add(family);
    this.tricks++;
    return { label, family, heat: h, sparks: added, repeat: n, fired };
  }

  letter(): TrickPop {
    this.letters++;
    let h = 30;
    let sparks = 0;
    const fired: number[] = [];
    const rl = this.count('redLetter');
    if (rl) {
      h *= 1 + 3 * rl;
      if (this.letters % 4 === 0) sparks = this.addSparks(rl);
      fired.push(...this.slots('redLetter'));
    }
    this.heat += h;
    return { label: 'Letter', family: 'letter', heat: h, sparks, repeat: 0, fired };
  }

  /** Called every sim tick while the flame burns. */
  tick(dt: number, coldSnap: boolean): void {
    if (this.heat <= 0) return;
    if (this.has('hotPotato')) this.heat *= 1 + 0.05 * dt * this.count('hotPotato');
    if (coldSnap) {
      this.heat *= 1 - 0.07 * dt;
      if (this.heat < 1) this.heat = 0;
    }
  }

  /** Score a post: window, then every post stamp left to right. Does not reset. */
  post(ctx: PostCtx): PostResult {
    let heat = Math.round(this.heat);
    let sparks = this.sparks;
    const steps: PostStep[] = [];
    const push = (slot: number, id: StampId | 'window', kind: PostStepKind, amount: number, label: string) => {
      if (kind === 'heat') heat += amount;
      else if (kind === 'sparks') sparks += amount;
      else sparks *= amount;
      sparks = Math.round(sparks * 100) / 100;
      steps.push({ slot, id, kind, amount, label, heat, sparks });
    };
    if (ctx.high) push(-1, 'window', 'xsparks', 2, 'High window ×2');
    for (const { id, slot } of this.eff) {
      switch (id) {
        case 'wax':
          push(slot, id, 'sparks', 3, '+3 sparks');
          break;
        case 'bigEnvelope':
          push(slot, id, 'heat', 250, '+250 heat');
          break;
        case 'pigeonhole':
          if (ctx.windowsLit > 0) push(slot, id, 'heat', 60 * ctx.windowsLit, `+${60 * ctx.windowsLit} heat`);
          break;
        case 'collector':
          push(slot, id, 'sparks', this.state.collector, `+${this.state.collector} sparks`);
          break;
        case 'moonlighter': {
          const n = Math.floor(ctx.pennies / 4);
          if (n > 0) push(slot, id, 'sparks', n, `+${n} sparks`);
          break;
        }
        case 'airmail':
          if (ctx.airborne) push(slot, id, 'xsparks', 2, 'Airborne ×2');
          break;
        case 'expressSeal':
          if (ctx.high) push(slot, id, 'xsparks', 1.5, 'High ×1.5');
          break;
        case 'assorted':
          if (this.families.size >= 4) push(slot, id, 'xsparks', 2, `${this.families.size} kinds ×2`);
          break;
        case 'purist':
          if (this.families.size === 1 && this.tricks >= 2) push(slot, id, 'xsparks', 3, 'One kind ×3');
          break;
        case 'doubleWick':
          if (sparks >= 10) push(slot, id, 'xsparks', 2, '10+ sparks ×2');
          break;
        case 'bonfire': {
          const m = 1 + 0.25 * this.state.bonfire;
          if (m > 1) push(slot, id, 'xsparks', m, `×${m}`);
          break;
        }
        case 'midnightOil':
          push(slot, id, 'xsparks', 3, '×3');
          break;
        case 'lastPost':
          if (ctx.final) push(slot, id, 'xsparks', 3, 'Sorting office ×3');
          break;
        default:
          break;
      }
    }
    const value = Math.round(heat * sparks);
    // money
    let pennies = 0;
    const paid: number[] = [];
    if (ctx.gold) pennies += Math.min(4, Math.ceil(this.sparks / 3));
    if (this.has('pennyBlack') && this.sparks >= 6) {
      pennies += this.count('pennyBlack');
      paid.push(...this.slots('pennyBlack'));
    }
    if (this.has('purse')) {
      pennies += this.count('purse');
      paid.push(...this.slots('purse'));
    }
    return { heat: Math.round(this.heat), sparks: this.sparks, steps, value, pennies, paid };
  }

  reset(startSparks: number): void {
    this.heat = 0;
    this.sparks = Math.max(1, Math.min(this.sparkCap(), startSparks));
    this.labels.clear();
    this.families.clear();
    this.letters = 0;
    this.tricks = 0;
  }
}
