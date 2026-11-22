// The post tally: the moment a flame lands in a window. Heat × sparks appear,
// then every stamp that touches the post fires in album order (each one shaking
// its slot on the HUD and stepping the pitch up), then the total slams down and
// flies into the postage meter. It plays while you keep driving, so it is quick.
import type { PostResult, PostStep } from '../sim/rules';
import type { WindowSpot } from '../sim/terrain';
import { STAMPS } from '../sim/stamps';
import { C } from '../render/palette';
import { panel, text, fmt, fitSize, coin } from '../render/ui';
import { rr } from '../render/art';

type Ctx = CanvasRenderingContext2D;

/** Seconds for the flame to fly from the lamp into the window. */
export const FLY = 0.3;
const BASE_HOLD = 0.32;
const TOTAL_GAP = 0.28;
const FLY_UP = 0.34;

export interface TallyHooks {
  bell(t: Tally): void;
  step(t: Tally, s: PostStep, i: number): void;
  total(t: Tally): void;
  land(t: Tally): void;
}

export function fmtSparks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export class Tally {
  t = 0;
  heat: number;
  sparks: number;
  stepI = 0;
  belled = false;
  totalled = false;
  landed = false;
  /** 0..1 bump on the heat / sparks boxes when they change. */
  bumpHeat = 0;
  bumpSparks = 0;
  label: { text: string; t: number } | null = null;
  readonly scorcher: boolean;
  private stepAt: number[] = [];
  readonly totalAt: number;
  readonly flyAt: number;
  readonly landAt: number;

  constructor(
    readonly w: WindowSpot,
    readonly fromX: number,
    readonly fromY: number,
    readonly result: PostResult,
    readonly target: number,
  ) {
    this.heat = result.heat;
    this.sparks = result.sparks;
    this.scorcher = result.value >= target * 0.5;
    let at = FLY + BASE_HOLD;
    result.steps.forEach((_, i) => {
      this.stepAt.push(at);
      // speed up as the chain goes on
      at += Math.max(0.11, 0.26 - i * 0.035);
    });
    this.totalAt = at + (result.steps.length ? TOTAL_GAP - 0.1 : 0);
    this.flyAt = this.totalAt + (this.scorcher ? 0.95 : 0.5);
    this.landAt = this.flyAt + FLY_UP;
  }

  get value(): number {
    return this.result.value;
  }

  /** 0..1 progress of the total flying up to the meter. */
  get fly(): number {
    return Math.max(0, Math.min(1, (this.t - this.flyAt) / FLY_UP));
  }

  get done(): boolean {
    return this.t > this.landAt + 0.1;
  }

  update(dt: number, hooks: TallyHooks): void {
    this.t += dt;
    if (!this.belled && this.t >= FLY) {
      this.belled = true;
      hooks.bell(this);
    }
    const steps = this.result.steps;
    while (this.stepI < steps.length && this.t >= this.stepAt[this.stepI]) {
      const s = steps[this.stepI];
      if (s.heat !== this.heat) this.bumpHeat = 1;
      if (s.sparks !== this.sparks) this.bumpSparks = 1;
      this.heat = s.heat;
      this.sparks = s.sparks;
      const name = s.id === 'window' ? '' : `${STAMPS[s.id].name}: `;
      this.label = { text: `${name}${s.label}`, t: 0 };
      hooks.step(this, s, this.stepI);
      this.stepI++;
    }
    if (!this.totalled && this.t >= this.totalAt) {
      this.totalled = true;
      hooks.total(this);
    }
    if (!this.landed && this.t >= this.landAt) {
      this.landed = true;
      hooks.land(this);
    }
    this.bumpHeat = Math.max(0, this.bumpHeat - dt * 5);
    this.bumpSparks = Math.max(0, this.bumpSparks - dt * 5);
    if (this.label) this.label.t += dt;
  }
}

function windowName(w: WindowSpot): string {
  if (w.final) return 'SORTING OFFICE';
  if (w.gold) return 'GOLD POSTBOX';
  if (w.high) return 'HIGH WINDOW';
  return 'HOUSE';
}

/** Draw one tally card centred at (cx, cy); meterY is where the total flies to. */
export function drawTally(ctx: Ctx, p: Tally, cx: number, cy: number, meterY: number, s: number, now: number, reduced: boolean): void {
  if (p.t < FLY || p.landed) return;
  if (p.fly > 0) {
    const k = p.fly * p.fly;
    const y = cy + 40 * s + (meterY - cy - 40 * s) * k - Math.sin(p.fly * Math.PI) * 50 * s;
    text(ctx, `+${fmt(p.value)}`, cx, y, (44 - 18 * k) * s, p.scorcher ? C.fireHot : C.fire, 'center', 7 * s);
    return;
  }
  const intro = Math.min(1, (p.t - FLY) / 0.12);
  const wob = reduced ? 0 : Math.sin(now * 40) * 0.01 * (p.bumpHeat + p.bumpSparks);
  ctx.save();
  ctx.translate(cx, cy);
  const sc = reduced ? 1 : 0.7 + intro * 0.3;
  ctx.scale(sc, sc);
  ctx.rotate(-0.02 + wob);
  const w = 320 * s;
  const h = (p.totalled ? 150 : 108) * s;
  panel(ctx, { x: -w / 2, y: -50 * s, w, h }, C.cream, s);
  const title = windowName(p.w);
  text(ctx, title, 0, -32 * s, 16 * s, p.w.gold ? C.mustardDark : p.w.high ? C.redDark : C.inkSoft, 'center');
  // heat × sparks boxes
  const bw = 124 * s;
  const bh = 46 * s;
  const by = -18 * s;
  const box = (x: number, val: string, fill: string, bump: number, cap: string) => {
    const k = 1 + (reduced ? 0 : bump * 0.18);
    ctx.save();
    ctx.translate(x + bw / 2, by + bh / 2);
    ctx.scale(k, k);
    rr(ctx, -bw / 2, -bh / 2, bw, bh, 8 * s);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    text(ctx, val, 0, 1 * s, fitSize(ctx, val, bw - 14 * s, 32 * s), C.cream, 'center', 5 * s);
    ctx.restore();
    text(ctx, cap, x + bw / 2, by + bh + 12 * s, 12 * s, C.inkSoft, 'center');
  };
  box(-bw - 14 * s, fmt(p.heat), C.fireOrange, p.bumpHeat, 'HEAT');
  text(ctx, '×', 0, by + bh / 2, 30 * s, C.ink, 'center');
  box(14 * s, fmtSparks(p.sparks), C.red, p.bumpSparks, 'SPARKS');
  // the stamp that just fired
  if (p.label && p.label.t < 0.9 && !p.totalled) {
    const a = Math.min(1, (0.9 - p.label.t) * 4);
    ctx.globalAlpha = a;
    const y = by + bh + 34 * s - p.label.t * 10 * s;
    text(ctx, p.label.text, 0, y, fitSize(ctx, p.label.text, w + 60 * s, 20 * s), C.mustard, 'center', 5 * s);
    ctx.globalAlpha = 1;
  }
  if (p.totalled) {
    const tk = Math.min(1, (p.t - p.totalAt) / 0.12);
    const big = 1 + (1 - tk) * (reduced ? 0 : 0.8);
    ctx.save();
    ctx.translate(0, by + bh + 46 * s);
    ctx.scale(big, big);
    text(ctx, `= ${fmt(p.value)}`, 0, 0, 38 * s, p.scorcher ? C.fireRed : C.red, 'center', 6 * s);
    ctx.restore();
    if (p.scorcher) {
      ctx.save();
      ctx.translate(w * 0.36, -54 * s);
      ctx.rotate(0.22);
      const pulse = reduced ? 1 : 1 + Math.sin(now * 18) * 0.05;
      ctx.scale(pulse, pulse);
      text(ctx, 'SCORCHER!', 0, 0, 30 * s, C.fire, 'center', 6 * s);
      ctx.restore();
    }
    if (p.result.pennies > 0) {
      coin(ctx, -w * 0.42, by + bh + 46 * s, 11 * s);
      text(ctx, `+${p.result.pennies}`, -w * 0.42 + 16 * s, by + bh + 47 * s, 22 * s, C.mustard, 'left', 5 * s);
    }
  }
  ctx.restore();
}
