import type { Pt, Solid } from '../data/parts';

export interface Xf {
  x: number;
  y: number;
  a: number;
}

export const IDENT: Xf = { x: 0, y: 0, a: 0 };

export function apply(xf: Xf, p: Pt): [number, number] {
  const c = Math.cos(xf.a);
  const s = Math.sin(xf.a);
  return [xf.x + c * p[0] - s * p[1], xf.y + s * p[0] + c * p[1]];
}

export function compose(parent: Xf, child: Xf): Xf {
  const [x, y] = apply(parent, [child.x, child.y]);
  return { x, y, a: parent.a + child.a };
}

export function invApply(xf: Xf, p: Pt): [number, number] {
  const dx = p[0] - xf.x;
  const dy = p[1] - xf.y;
  const c = Math.cos(-xf.a);
  const s = Math.sin(-xf.a);
  return [c * dx - s * dy, s * dx + c * dy];
}

export function transformSolid(xf: Xf, s: Solid): Solid {
  if (s.type === 'circle') {
    const [x, y] = apply(xf, [s.x, s.y]);
    return { type: 'circle', x, y, r: s.r };
  }
  return { type: 'poly', pts: s.pts.map((p) => apply(xf, p)) };
}

function project(pts: readonly Pt[], ax: number, ay: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const d = p[0] * ax + p[1] * ay;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

function polyAxes(pts: readonly Pt[]): [number, number][] {
  const axes: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    axes.push([-ey / len, ex / len]);
  }
  return axes;
}

/** Penetration depth between two convex solids (<= 0 means separated by -depth). */
export function overlapDepth(a: Solid, b: Solid): number {
  if (a.type === 'circle' && b.type === 'circle') {
    return a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
  }
  if (a.type === 'circle' || b.type === 'circle') {
    const c = (a.type === 'circle' ? a : b) as Extract<Solid, { type: 'circle' }>;
    const p = (a.type === 'poly' ? a : b) as Extract<Solid, { type: 'poly' }>;
    // SAT with polygon axes plus closest-vertex axis.
    let best = Infinity;
    const axes = polyAxes(p.pts);
    let cv: Pt = p.pts[0]!;
    let cd = Infinity;
    for (const v of p.pts) {
      const d = Math.hypot(v[0] - c.x, v[1] - c.y);
      if (d < cd) {
        cd = d;
        cv = v;
      }
    }
    if (cd > 1e-9) axes.push([(cv[0] - c.x) / cd, (cv[1] - c.y) / cd]);
    for (const [ax, ay] of axes) {
      const [lo, hi] = project(p.pts, ax, ay);
      const cc = c.x * ax + c.y * ay;
      const o = Math.min(hi, cc + c.r) - Math.max(lo, cc - c.r);
      if (o < best) best = o;
    }
    return best;
  }
  let best = Infinity;
  for (const [ax, ay] of [...polyAxes(a.pts), ...polyAxes(b.pts)]) {
    const [alo, ahi] = project(a.pts, ax, ay);
    const [blo, bhi] = project(b.pts, ax, ay);
    const o = Math.min(ahi, bhi) - Math.max(alo, blo);
    if (o < best) best = o;
  }
  return best;
}

export function solidMinY(s: Solid): number {
  if (s.type === 'circle') return s.y - s.r;
  let m = Infinity;
  for (const p of s.pts) m = Math.min(m, p[1]);
  return m;
}

export function solidBounds(s: Solid): { x0: number; y0: number; x1: number; y1: number } {
  if (s.type === 'circle') return { x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of s.pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return { x0, y0, x1, y1 };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic small PRNG for cosmetic seeds (never used by the simulation). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
