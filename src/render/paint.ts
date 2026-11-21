// Print-material helpers: ink keylines, slight misregistration, grain fixed to surfaces.
import { mulberry32 } from '../core/geom';
import { C } from './palette';

/** Visual switches (dev flags can turn the dressing off to test hierarchy). */
export const FX = {
  grain: true,
  glow: true,
  shake: true,
  decor: true,
  labels: true,
  overlay: false,
  reducedMotion: false,
};

export function readDevFlags(): void {
  const q = new URLSearchParams(location.search);
  if (q.has('plain')) {
    FX.grain = false;
    FX.glow = false;
    FX.shake = false;
    FX.decor = false;
  }
  if (q.has('nolabels')) FX.labels = false;
  if (q.has('overlay')) FX.overlay = true;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

let grainTile: HTMLCanvasElement | null = null;
let fiberTile: HTMLCanvasElement | null = null;

/** Ink grain: specks and tiny voids, as from an uneven letterpress impression. */
export function grainCanvas(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d')!;
  const rnd = mulberry32(7);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = rnd() < 0.92 ? 0.5 + rnd() * 0.7 : 1 + rnd() * 1.6;
    g.globalAlpha = 0.12 + rnd() * 0.22;
    g.fillStyle = rnd() < 0.7 ? C.inkDeep : '#fff7e0';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Soft blotches where the ink pooled.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 8 + rnd() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(13,23,36,0.10)');
    grd.addColorStop(1, 'rgba(13,23,36,0)');
    g.globalAlpha = 1;
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grainTile = c;
  return c;
}

/** Paper fibres: short pale strokes, for buff paper surfaces. */
export function fiberCanvas(): HTMLCanvasElement {
  if (fiberTile) return fiberTile;
  const S = 192;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d')!;
  const rnd = mulberry32(11);
  g.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const a = rnd() * Math.PI;
    const l = 2 + rnd() * 6;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(120,90,50,0.16)' : 'rgba(255,250,235,0.35)';
    g.lineWidth = 0.6 + rnd() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  fiberTile = c;
  return c;
}

const patterns = new WeakMap<CanvasRenderingContext2D, { grain: CanvasPattern; fiber: CanvasPattern }>();

function pats(ctx: CanvasRenderingContext2D): { grain: CanvasPattern; fiber: CanvasPattern } {
  let p = patterns.get(ctx);
  if (!p) {
    p = {
      grain: ctx.createPattern(grainCanvas(), 'repeat')!,
      fiber: ctx.createPattern(fiberCanvas(), 'repeat')!,
    };
    patterns.set(ctx, p);
  }
  return p;
}

/**
 * Overlay grain inside `path`, anchored at (ax, ay) in the current transform so
 * it travels with the surface it belongs to.
 */
export function grainOver(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  ax: number,
  ay: number,
  alpha = 1,
  kind: 'grain' | 'fiber' = 'grain',
  scale = 1,
): void {
  if (!FX.grain) return;
  const p = pats(ctx)[kind];
  p.setTransform(new DOMMatrix().translate(ax, ay).scale(scale));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = p;
  ctx.fill(path);
  ctx.restore();
}

/** Fill offset by a small registration error, then stroke the ink keyline true. */
export function printed(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  fill: string | CanvasGradient | CanvasPattern | null,
  opts: { lw?: number; ink?: string | null; mx?: number; my?: number; join?: CanvasLineJoin } = {},
): void {
  const mx = opts.mx ?? 1.1;
  const my = opts.my ?? 0.7;
  if (fill) {
    ctx.save();
    ctx.translate(mx, my);
    ctx.fillStyle = fill;
    ctx.fill(path);
    ctx.restore();
  }
  if (opts.ink !== null) {
    ctx.lineJoin = opts.join ?? 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = opts.lw ?? 2;
    ctx.strokeStyle = opts.ink ?? C.ink;
    ctx.stroke(path);
  }
}

export function polyPath(pts: readonly (readonly [number, number])[], close = true): Path2D {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  if (close) p.closePath();
  return p;
}

export function circlePath(x: number, y: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  return p;
}

/** Hatched cross: the shape-coded mark for an invalid fit. */
export function hatchedCross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24,38,56,0.82)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = C.vermilion;
  ctx.lineWidth = 1.6;
  for (let i = -r * 2; i < r * 2; i += 4.5) {
    ctx.beginPath();
    ctx.moveTo(i, -r);
    ctx.lineTo(i + r * 2, r);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 3.2;
  const k = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(-k, -k);
  ctx.lineTo(k, k);
  ctx.moveTo(k, -k);
  ctx.lineTo(-k, k);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = C.vermilion;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Rough-cut paper edge: a polyline with small deterministic jitter. */
export function roughRect(x: number, y: number, w: number, h: number, seed: number, amp = 1.4): Path2D {
  const rnd = mulberry32(seed);
  const p = new Path2D();
  const pts: [number, number][] = [];
  const step = 14;
  for (let i = 0; i <= w; i += step) pts.push([x + Math.min(i, w), y + (rnd() - 0.5) * amp]);
  for (let i = 0; i <= h; i += step) pts.push([x + w + (rnd() - 0.5) * amp, y + Math.min(i, h)]);
  for (let i = w; i >= 0; i -= step) pts.push([x + Math.max(i, 0), y + h + (rnd() - 0.5) * amp]);
  for (let i = h; i >= 0; i -= step) pts.push([x + (rnd() - 0.5) * amp, y + Math.max(i, 0)]);
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  p.closePath();
  return p;
}
