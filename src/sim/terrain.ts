// Seeded course generator. A delivery is a paced run of hand-shaped desk pieces:
// a warm-up, then sections of [connector(s) → setpiece → window to breathe], ending
// on a finale setpiece and the sorting office. Each setpiece asks a different
// question (aim for a hoop, ride a rail, smash a stack, dodge tacks, survive a launch).
// Everything here is plain data shared by the physics and the renderer.
import { Rng } from './rng';

export interface Vec {
  x: number;
  y: number;
}

export type Mat = 'paper' | 'ruler' | 'book' | 'envelope' | 'blotter' | 'office';

export interface Span {
  x0: number;
  x1: number;
  mat: Mat;
  /** Book spans get a colour index. */
  tone?: number;
}

export interface WindowSpot {
  id: number;
  x: number;
  /** Ground windows: ground height. High windows: centre of the opening. */
  y: number;
  high: boolean;
  final: boolean;
  /** Gold postbox: pays pennies when posted. */
  gold: boolean;
}

export interface Letter {
  id: number;
  x: number;
  y: number;
}

export type Feature =
  | { kind: 'striker'; id: number; x0: number; x1: number }
  | { kind: 'trap'; id: number; x: number; y: number }
  | { kind: 'rail'; id: number; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'tacks'; id: number; x0: number; x1: number }
  | { kind: 'stack'; id: number; x: number; y: number; cols: number; rows: number }
  | { kind: 'hoop'; id: number; x: number; y: number; r: number };

export type FeatureKind = Feature['kind'];

export type PropKind = 'inkpot' | 'drawer' | 'mug' | 'pencils' | 'stampbox' | 'clip' | 'sign';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  label?: string;
}

export interface Course {
  seed: number;
  theme: number;
  islands: Vec[][];
  spans: Span[];
  windows: WindowSpot[];
  letters: Letter[];
  props: Prop[];
  features: Feature[];
  /** Piece names and start x, for debugging and tests. */
  chunks: { name: string; x: number; set: boolean }[];
  startX: number;
  startY: number;
  /** x at which the final office is reached. */
  endX: number;
  killY: number;
  minY: number;
  maxY: number;
}

export type DeliveryKind = 'local' | 'express' | 'inspection';

export interface CourseOpts {
  seed: number;
  /** 1-based route (room of the house). */
  route: number;
  kind: DeliveryKind;
  /** Inspector rule: half the windows. */
  sparseWindows?: boolean;
  /** Inspector rule: thumbtacks everywhere. */
  tackStorm?: boolean;
}

/** Fixed launch velocity of a sprung mousetrap (so its hoop and landing hill line up). */
export const TRAP_VX = 10;
export const TRAP_VY = 12.5;
const G = 15;
/** Chassis centre above the ground when the cart stands on flat desk. */
const RIDE = 0.75;

class Builder {
  islands: Vec[][] = [[]];
  spans: Span[] = [];
  windows: WindowSpot[] = [];
  letters: Letter[] = [];
  props: Prop[] = [];
  features: Feature[] = [];
  x = 0;
  y = 0;
  private wid = 0;
  private lid = 0;
  private fid = 0;
  constructor(readonly rng: Rng, readonly opts: CourseOpts) {
    this.cur.push({ x: -30, y: 0 });
  }
  get cur(): Vec[] {
    return this.islands[this.islands.length - 1];
  }
  pt(x: number, y: number): void {
    const c = this.cur;
    const last = c[c.length - 1];
    if (last && x <= last.x + 0.04) return;
    c.push({ x, y });
    this.x = x;
    this.y = y;
  }
  span(x0: number, mat: Mat, tone?: number): void {
    if (mat === 'paper') return;
    this.spans.push({ x0, x1: this.x, mat, tone });
  }
  flat(len: number, mat: Mat = 'paper'): void {
    const x0 = this.x;
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 1; i <= n; i++) this.pt(x0 + (len * i) / n, this.y);
    this.span(x0, mat);
  }
  /** Smooth S-curve from here to (x+dx, y+dy). */
  ease(dx: number, dy: number, mat: Mat = 'paper', step = 0.4): void {
    const x0 = this.x;
    const y0 = this.y;
    const n = Math.max(2, Math.ceil(dx / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + dx * t, y0 + (dy * (1 - Math.cos(Math.PI * t))) / 2);
    }
    this.span(x0, mat);
  }
  /** Concave launch ramp rising h metres to a lip at `deg` degrees. */
  ramp(h: number, deg: number, mat: Mat = 'ruler', pow = 2): void {
    const dx = (pow * h) / Math.tan((deg * Math.PI) / 180);
    const x0 = this.x;
    const y0 = this.y;
    const n = Math.max(4, Math.ceil(dx / 0.25));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + dx * t, y0 + h * Math.pow(t, pow));
    }
    this.span(x0, mat);
  }
  /** Follow an arbitrary profile y = f(x - x0) for len metres. */
  profile(len: number, f: (u: number) => number, step = 0.3): void {
    const x0 = this.x;
    const n = Math.max(2, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) {
      const u = (len * i) / n;
      this.pt(x0 + u, f(u));
    }
  }
  /** Circular arc that starts descending at angle phi0 (radians) and levels out. */
  arcDown(phi0: number, R: number): void {
    const x0 = this.x;
    const y0 = this.y;
    const n = Math.max(6, Math.ceil((R * phi0) / 0.25));
    for (let i = 1; i <= n; i++) {
      const phi = phi0 * (1 - i / n);
      this.pt(x0 + R * (Math.sin(phi0) - Math.sin(phi)), y0 - R * (Math.cos(phi) - Math.cos(phi0)));
    }
  }
  /** End this island at the current point and start a new one after a gap. */
  gap(w: number, dy: number): void {
    const gx = this.x;
    const gy = this.y;
    this.islands.push([]);
    this.x = gx + w;
    this.y = gy + dy;
    this.cur.push({ x: this.x, y: this.y });
    this.props.push({ kind: 'drawer', x: gx, y: Math.min(gy, this.y), w, h: 3, seed: this.rng.int(0, 999) });
  }
  window(x: number, y: number, high = false, final = false, gold = false): void {
    this.windows.push({ id: this.wid++, x, y, high, final, gold });
  }
  letter(x: number, y: number): void {
    this.letters.push({ id: this.lid++, x, y });
  }
  letterRow(x: number, y: number, n: number, gap = 1.3): void {
    for (let i = 0; i < n; i++) this.letter(x + i * gap, y);
  }
  /** Letters on a ballistic-ish arc from (x0,y0) over a distance. */
  letterArc(x0: number, y0: number, dist: number, peak: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      this.letter(x0 + dist * t, y0 + peak * Math.sin(Math.PI * t));
    }
  }
  prop(kind: PropKind, x: number, y: number, w: number, h: number, label?: string): void {
    this.props.push({ kind, x, y, w, h, seed: this.rng.int(0, 9999), label });
  }
  striker(len: number): void {
    const x0 = this.x;
    this.flat(len);
    this.features.push({ kind: 'striker', id: this.fid++, x0: x0 + 0.2, x1: this.x - 0.2 });
  }
  tacks(x0: number, x1: number): void {
    if (x1 - x0 < 0.8) return;
    this.features.push({ kind: 'tacks', id: this.fid++, x0, x1 });
  }
  stack(x: number, cols: number, rows: number): void {
    this.features.push({ kind: 'stack', id: this.fid++, x, y: this.y, cols, rows });
  }
  hoop(x: number, y: number, r = 1.15): void {
    this.features.push({ kind: 'hoop', id: this.fid++, x, y, r });
  }
  trap(x: number): void {
    this.features.push({ kind: 'trap', id: this.fid++, x, y: this.y });
  }
  rail(x0: number, y0: number, x1: number, y1: number): void {
    this.features.push({ kind: 'rail', id: this.fid++, x0, y0, x1, y1 });
  }
  /** Tack Storm: scatter tacks on the flat that was just laid. */
  stormFlat(x0: number): void {
    if (!this.opts.tackStorm || this.x - x0 < 3) return;
    const a = x0 + this.rng.range(0.6, 1.2);
    this.tacks(a, Math.min(this.x - 0.6, a + this.rng.range(1.2, 2.2)));
  }
}

type ChunkFn = (b: Builder, d: number) => void;

// d is difficulty in 0..1.

// ---------------------------------------------------------------- connectors: low/mid intensity
const CONNECTORS: Record<string, ChunkFn> = {
  rollers(b, d) {
    const n = b.rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const a = b.rng.range(0.7, 1.1 + d * 0.5);
      const w = b.rng.range(5, 7);
      b.ease(w, a);
      if (i === 0 && b.rng.chance(0.5)) b.letterRow(b.x - 0.6, b.y + 1.4, 3, 1.1);
      b.ease(w, -a);
    }
    const x0 = b.x;
    b.flat(2);
    b.stormFlat(x0);
  },
  whoops(b) {
    const x0 = b.x;
    const n = b.rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      b.ease(1.3, 0.32, 'envelope', 0.25);
      b.ease(1.3, -0.32, 'envelope', 0.25);
    }
    b.spans.push({ x0, x1: b.x, mat: 'envelope' });
    b.flat(2.5);
  },
  table(b, d) {
    const f0 = b.x;
    b.flat(5);
    b.stormFlat(f0);
    const h = b.rng.range(1.1, 1.5 + d * 0.5);
    const rx = b.x;
    b.ramp(h, b.rng.range(30, 38));
    const lipX = b.x;
    const lipY = b.y;
    b.flat(1.4);
    b.prop('inkpot', lipX + 0.7, lipY, 1.6, h, 'INK');
    b.ease(7.5, -h - b.rng.range(0, 0.8));
    b.letterArc(lipX, lipY + 0.6, 8.5, 2.6 + d, 5);
    if (b.rng.chance(0.35)) b.prop('pencils', rx - 1.5, lipY - h, 1, 2.2);
    b.flat(3);
  },
  gap(b, d) {
    b.flat(4);
    b.ease(6, -0.8);
    b.flat(2);
    const h = b.rng.range(1.1, 1.5);
    b.ramp(h, b.rng.range(32, 38));
    const lipX = b.x;
    const lipY = b.y;
    const w = b.rng.range(3.5, 4.5 + d * 1.5);
    b.gap(w, b.rng.range(-1.2, -0.4));
    b.letterArc(lipX + 0.5, lipY + 0.6, w + 2, 2.4 + d, 5);
    b.ease(9, -b.rng.range(1.8, 2.8));
    b.flat(3);
  },
  drop(b, d) {
    b.flat(2.5);
    const dy = b.rng.range(3.5, 5 + d * 2);
    const x0 = b.x;
    b.ease(b.rng.range(10, 13), -dy, 'blotter', 0.35);
    b.letterRow(x0 + 2, b.y + dy * 0.75, 3, 1.4);
    const f0 = b.x;
    b.flat(3);
    b.stormFlat(f0);
  },
  hill(b, d) {
    const h = b.rng.range(2.5, 3.5 + d);
    b.ease(b.rng.range(8, 10), h);
    b.flat(1);
    b.letterRow(b.x - 1, b.y + 2.4, 2, 1.4);
    b.ease(b.rng.range(7, 9), -h);
    b.flat(2);
  },
  stairs(b) {
    const steps = b.rng.int(3, 4);
    const tone = b.rng.int(0, 9);
    for (let i = 0; i < steps; i++) {
      const x0 = b.x;
      b.ease(0.9, 0.55, 'book', 0.15);
      b.flat(b.rng.range(1.6, 2.1));
      b.spans.push({ x0, x1: b.x, mat: 'book', tone: tone + i });
    }
    b.ramp(0.8, 30, 'ruler');
    const lipX = b.x;
    const lipY = b.y;
    b.flat(0.6);
    b.letterArc(lipX, lipY + 0.6, 8, 2.8, 4);
    b.ease(10, -(steps * 0.55 + 0.8));
    b.flat(2.5);
  },
};

// ---------------------------------------------------------------- setpieces: one question each
const SETPIECES: Record<string, ChunkFn> = {
  /** Aim: thread the lamp through a burning hoop over a drawer gap. */
  hoopgap(b, d) {
    b.flat(3);
    b.ease(5, -0.6);
    b.flat(2.5);
    const h = b.rng.range(1.2, 1.4);
    b.ramp(h, 34);
    const lipX = b.x;
    const lipY = b.y;
    const w = b.rng.range(4, 5 + d);
    b.gap(w, b.rng.range(-1.2, -0.6));
    // the arc at 10–14 m/s off a 34° lip puts the lamp ~2.4–2.9 m up, 3 m out
    b.hoop(lipX + 3.1, lipY + 2.75, 1.15);
    b.letter(lipX + 1.2, lipY + 2.1);
    b.letterArc(lipX + 4.6, lipY + 2.4, 3.5, 0.3, 2);
    b.ease(9, -b.rng.range(2, 2.8));
    b.flat(3);
  },
  /** Survive: a mousetrap flings you up over a table-top onto a matched landing hill. */
  launch(b, d) {
    b.flat(3);
    const trapX = b.x + 1;
    b.trap(trapX);
    const y0 = b.y;
    b.flat(2.2);
    // absolute chassis height along the launch arc, u metres past the trap
    const traj = (u: number) => y0 + RIDE + (TRAP_VY / TRAP_VX) * u - (G * u * u) / (2 * TRAP_VX * TRAP_VX);
    const slopeAt = (u: number) => TRAP_VY / TRAP_VX - (G * u) / (TRAP_VX * TRAP_VX);
    const apexU = (TRAP_VY * TRAP_VX) / G;
    // a table top under the arc
    const top = y0 + 1.3 + d * 0.3;
    b.ease(3, top - y0);
    // the knuckle: where the arc (less a 1 m cushion) comes back down to the table
    const CUSH = 1.0;
    let uK = apexU;
    while (traj(uK) - RIDE - CUSH > top) uK += 0.05;
    b.flat(Math.max(0.5, trapX + uK - b.x));
    // matched landing hill: hugs the falling arc, the cushion shrinking to nothing,
    // so wherever you come down you meet the slope at a glancing angle
    const uL = uK + 3.2;
    const hill = (u: number) => traj(u) - RIDE - CUSH * Math.max(0, 1 - (u - uK) / (uL - uK));
    b.profile(trapX + uL - b.x, (q) => hill(uK + q), 0.2);
    // runout: a circular arc from the landing angle back to flat
    b.arcDown(Math.atan(-slopeAt(uL)), 13);
    b.flat(4);
    // a hoop (or an express window) at the top of the arc
    const lampY = traj(apexU) + 0.62;
    if (b.rng.chance(0.3)) b.window(trapX + apexU, lampY + 0.4, true);
    else b.hoop(trapX + apexU, lampY, 1.2);
    b.letter(trapX + 3, traj(3) + 0.6);
    b.letter(trapX + 5.5, traj(5.5) + 0.6);
  },
  /** Choose: speed up onto a pencil rail (grind, high window) or roll the tack-strewn floor below. */
  railroute(b, d) {
    if (b.rng.chance(0.6)) {
      b.flat(2);
      b.striker(4.5);
    }
    b.flat(3);
    b.ramp(1.0, 27, 'ruler', 1.6);
    const lipX = b.x;
    const lipY = b.y;
    b.flat(0.3);
    b.ease(4, -1.9);
    const floorY = b.y;
    const len = b.rng.range(11, 14 + d * 3);
    // at full speed the wheels clear the lip by ~0.5 m: the pencil sits just above it
    const r0x = lipX + 1.9;
    const r0y = lipY + 0.28;
    const r1x = r0x + len;
    const r1y = r0y - len * 0.05;
    b.rail(r0x, r0y, r1x, r1y);
    const under0 = b.x;
    b.flat(Math.max(4, r1x + 2 - b.x));
    b.tacks(under0 + 1.5, under0 + 1.5 + b.rng.range(2.2, 3.4));
    if (b.rng.chance(0.5)) b.stack(r1x - 3, 2, 2);
    b.letterRow(r0x + 1.5, r0y + 1.2, Math.floor(len / 2.2), 2);
    void floorY;
    // the reward for the high line: an express window just past the rail's end
    if (b.rng.chance(0.7)) b.window(r1x + 1.2, r1y + 1.9, true);
    b.ease(5, b.rng.range(-0.8, 0.4));
    b.flat(2.5);
  },
  /** Speed: strike the matchbox strip, then plough through sugar-cube stacks. */
  smashrun(b, d) {
    b.flat(2);
    b.striker(5);
    b.flat(2.5);
    b.stack(b.x, b.rng.int(2, 3), b.rng.int(2, 3) + (d > 0.5 ? 1 : 0));
    b.flat(5);
    b.stack(b.x, b.rng.int(2, 3), 2);
    b.flat(3.5);
    b.ramp(0.9, 30, 'ruler');
    const lipX = b.x;
    const lipY = b.y;
    b.flat(0.4);
    b.ease(7, -1.6);
    b.letterArc(lipX, lipY + 0.6, 7, 2.2, 4);
    b.flat(3);
  },
  /** Avoid: hop the thumbtacks off small kickers. */
  tackfield(b, d) {
    // long lead-in so a jump from the last section can't carry over the kicker
    b.flat(6.5);
    b.ramp(0.9, 30, 'ruler', 1.3);
    const lipX = b.x;
    // room to land and settle before the second kicker
    b.flat(11);
    b.tacks(lipX + 2.8, lipX + 4.8 + d * 0.6);
    b.ramp(0.8, 30, 'ruler', 1.3);
    const lip2 = b.x;
    b.flat(6);
    b.tacks(lip2 + 1.6, lip2 + 3.6 + d * 0.4);
    b.letterArc(lipX, b.y + 1.6, 9, 1.2, 4);
    b.ease(5, -0.6);
    b.flat(2);
  },
  /** Big air over a wide drawer: room for doubles. */
  bigair(b, d) {
    b.flat(4);
    b.ease(9, -2.6);
    b.flat(2);
    const h = b.rng.range(1.6, 2.1);
    b.ramp(h, b.rng.range(36, 42), 'ruler', 2.3);
    const lipX = b.x;
    const lipY = b.y;
    const w = b.rng.range(5, 6 + d * 1.5);
    b.gap(w, b.rng.range(-1.6, -0.8));
    if (b.rng.chance(0.35)) b.window(lipX + w * 0.55, lipY + 3.6 + d * 0.5, true);
    else b.letterArc(lipX + 0.5, lipY + 1, w + 4, 4 + d, 6);
    b.ease(13, -b.rng.range(2.5, 3.5));
    b.flat(3);
  },
};

export const SETPIECE_NAMES = Object.keys(SETPIECES);
export const CONNECTOR_NAMES = Object.keys(CONNECTORS);

/** What a setpiece asks of the player (used by tests and the route card). */
export const VERB: Record<string, string> = {
  hoopgap: 'aim',
  launch: 'survive',
  railroute: 'choose',
  smashrun: 'smash',
  tackfield: 'avoid',
  bigair: 'flip',
};

function station(b: Builder, gold: boolean): void {
  const f0 = b.x;
  b.flat(4);
  const wx = b.x + 1.5;
  b.flat(8);
  b.window(wx, b.y, false, false, gold);
  if (b.rng.chance(0.4)) b.prop('sign', wx - 6.5, b.y, 0.8, 1.4);
  void f0;
}

/** Hand-picked first deliveries: one new idea at a time (the low-calorie tutorial). */
const SCRIPTS: Record<string, string[][]> = {
  '1:local': [['gap', 'hoopgap'], ['rollers', 'smashrun'], ['stairs', 'launch']],
  '1:express': [['table', 'tackfield'], ['whoops', 'railroute'], ['drop', 'hoopgap'], ['rollers', 'launch']],
};

export function generateCourse(opts: CourseOpts): Course {
  const kindN = opts.kind === 'local' ? 0 : opts.kind === 'express' ? 1 : 2;
  const rng = new Rng(opts.seed * 7919 + opts.route * 104729 + kindN * 1299709);
  const b = new Builder(rng, opts);
  const d = Math.min(1, ((opts.route - 1) * 3 + kindN) / 10);

  // Start platform and a quick run-in so the first ramp arrives within seconds.
  b.flat(7);
  const startX = 3;
  const startY = 0;
  b.ease(7, -1.4);
  b.flat(1.5);
  CONNECTORS.table(b, 0);

  const chunks: { name: string; x: number; set: boolean }[] = [];
  const run = (name: string, set: boolean) => {
    // keep the desk in a sensible height band
    if (b.y > 6) b.ease(8, -3);
    if (b.y < -6) b.ease(8, 3);
    chunks.push({ name, x: b.x, set });
    (set ? SETPIECES : CONNECTORS)[name](b, d);
    if (!set && rng.chance(0.25)) b.prop(rng.pick(['mug', 'stampbox', 'clip'] as const), b.x - 2, b.y, 1.5, 1.5);
  };

  const script = SCRIPTS[`${opts.route}:${opts.kind}`];
  const sections = script ? script.length : opts.kind === 'local' ? 3 : 4;
  const windowEvery = opts.sparseWindows ? 2 : 1;
  let lastConn = 'table';
  const recentSets: string[] = [];
  let goldLeft = 1 + (rng.chance(0.4) ? 1 : 0);
  for (let s = 0; s < sections; s++) {
    let plan: string[];
    if (script) plan = script[s];
    else {
      plan = [];
      const nConn = s === 0 ? 1 : rng.chance(0.35 + d * 0.2) ? 2 : 1;
      for (let i = 0; i < nConn; i++) {
        let c = rng.pick(CONNECTOR_NAMES);
        if (c === lastConn) c = rng.pick(CONNECTOR_NAMES.filter((n) => n !== lastConn));
        lastConn = c;
        plan.push(c);
      }
      const finale = s === sections - 1;
      const pool: [string, number][] = SETPIECE_NAMES.filter((n) => !recentSets.includes(n)).map((n) => [
        n,
        finale ? (n === 'launch' || n === 'bigair' || n === 'railroute' ? 3 : 0.5) : n === 'bigair' ? 0.6 + d : 1,
      ]);
      const sp = rng.weighted(pool);
      recentSets.push(sp);
      if (recentSets.length > 2) recentSets.shift();
      plan.push(sp);
    }
    plan.forEach((name, i) => run(name, i === plan.length - 1));
    if (s < sections - 1 && (s + 1) % windowEvery === 0) {
      const gold = goldLeft > 0 && s > 0 && rng.chance(0.45);
      if (gold) goldLeft--;
      station(b, gold);
    }
  }

  // The sorting office: a long flat finish with the final window.
  b.flat(6);
  const fx = b.x + 6;
  b.flat(24, 'office');
  b.window(fx, b.y, false, true);
  const endX = fx;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const isl of b.islands)
    for (const p of isl) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  for (const f of b.features) if (f.kind === 'rail') maxY = Math.max(maxY, f.y0);
  return {
    seed: opts.seed,
    theme: (opts.route - 1) % 4,
    islands: b.islands.filter((i) => i.length > 1),
    spans: b.spans,
    windows: b.windows,
    letters: b.letters,
    props: b.props,
    features: b.features,
    chunks,
    startX,
    startY,
    endX,
    killY: minY - 7,
    minY,
    maxY,
  };
}

/** Ground height under x (top surface), or null over a gap. */
export function groundAt(c: Course, x: number): number | null {
  for (const isl of c.islands) {
    if (x < isl[0].x || x > isl[isl.length - 1].x) continue;
    let lo = 0;
    let hi = isl.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (isl[m].x <= x) lo = m;
      else hi = m;
    }
    const a = isl[lo];
    const bb = isl[hi];
    const t = (x - a.x) / Math.max(1e-6, bb.x - a.x);
    return a.y + (bb.y - a.y) * t;
  }
  return null;
}

/** Height of a rail at x, if x is over it. */
export function railAt(f: Extract<Feature, { kind: 'rail' }>, x: number): number | null {
  if (x < f.x0 || x > f.x1) return null;
  return f.y0 + ((f.y1 - f.y0) * (x - f.x0)) / (f.x1 - f.x0);
}
