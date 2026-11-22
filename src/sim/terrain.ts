// Seeded course generator. A course is a run of hand-shaped desk "chunks"
// (ruler kickers, drawer gaps, book stairs, blotter drops...) stitched end to end.
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
}

export interface Letter {
  id: number;
  x: number;
  y: number;
}

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
  islands: Vec[][];
  spans: Span[];
  windows: WindowSpot[];
  letters: Letter[];
  props: Prop[];
  /** Chunk names and start x, for debugging and tests. */
  chunks: { name: string; x: number }[];
  startX: number;
  startY: number;
  /** x at which the final office is reached. */
  endX: number;
  killY: number;
  minY: number;
  maxY: number;
}

export interface CourseOpts {
  seed: number;
  shift: number; // 1-based
  /** Fewer windows (Supervisor rule). */
  sparseWindows?: boolean;
}

class Builder {
  islands: Vec[][] = [[]];
  spans: Span[] = [];
  windows: WindowSpot[] = [];
  letters: Letter[] = [];
  props: Prop[] = [];
  x = 0;
  y = 0;
  private wid = 0;
  private lid = 0;
  constructor(readonly rng: Rng) {
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
  window(x: number, y: number, high = false, final = false): void {
    this.windows.push({ id: this.wid++, x, y, high, final });
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
}

type ChunkFn = (b: Builder, d: number) => void;

// d is difficulty in 0..1.
const CHUNKS: Record<string, ChunkFn> = {
  rollers(b, d) {
    const n = b.rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const a = b.rng.range(0.7, 1.1 + d * 0.5);
      const w = b.rng.range(5, 7);
      b.ease(w, a);
      if (i === 0 && b.rng.chance(0.5)) b.letterRow(b.x - 0.6, b.y + 1.4, 3, 1.1);
      b.ease(w, -a);
    }
    b.flat(2);
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
    b.flat(5);
    const h = b.rng.range(1.1, 1.5 + d * 0.5);
    const rx = b.x;
    b.ramp(h, b.rng.range(30, 38));
    const lipX = b.x;
    const lipY = b.y;
    b.flat(1.4);
    b.prop('inkpot', lipX + 0.7, lipY, 1.6, lipY - (lipY - h), 'INK');
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
    const w = b.rng.range(3.5, 5 + d * 2);
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
    b.flat(3);
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
    // kick off the top book
    b.ramp(0.8, 30, 'ruler');
    const lipX = b.x;
    const lipY = b.y;
    b.flat(0.6);
    b.letterArc(lipX, lipY + 0.6, 8, 2.8, 4);
    b.ease(10, -(steps * 0.55 + 0.8));
    b.flat(2.5);
  },
  bigair(b, d) {
    b.flat(4);
    b.ease(9, -2.6);
    b.flat(2);
    const h = b.rng.range(1.6, 2.1);
    b.ramp(h, b.rng.range(36, 42), 'ruler', 2.3);
    const lipX = b.x;
    const lipY = b.y;
    const w = b.rng.range(5, 6.5 + d * 1.5);
    b.gap(w, b.rng.range(-1.6, -0.8));
    b.letterArc(lipX + 0.5, lipY + 1, w + 4, 4 + d, 6);
    b.ease(13, -b.rng.range(2.5, 3.5));
    b.flat(3);
  },
};

function station(b: Builder, sparse: boolean, rng: Rng): void {
  void sparse;
  b.flat(4);
  const wx = b.x + 1.5;
  b.flat(8);
  b.window(wx, b.y);
  if (rng.chance(0.4)) b.prop('sign', wx - 6.5, b.y, 0.8, 1.4);
}

export function generateCourse(opts: CourseOpts): Course {
  const rng = new Rng(opts.seed * 7919 + opts.shift * 104729);
  const b = new Builder(rng);
  const s = opts.shift;
  const d = Math.min(1, (s - 1) / 5);

  // Start platform and a quick run-in so the first ramp arrives within seconds.
  b.flat(7);
  const startX = 3;
  const startY = 0;
  b.ease(7, -1.4);
  b.flat(1.5);
  CHUNKS.table(b, 0);

  const pool: [string, number][] = [
    ['rollers', 3],
    ['whoops', 1.5],
    ['table', 3],
    ['gap', 2 + d * 2],
    ['drop', 2],
    ['hill', 2],
    ['stairs', 1.5],
    ['bigair', d * 3 + (s >= 2 ? 1 : 0)],
  ];

  const chunks: { name: string; x: number }[] = [];
  const nChunks = 8 + Math.min(6, s);
  const every = opts.sparseWindows ? 4 : rng.int(2, 3);
  let last = 'table';
  let sinceWindow = 1;
  for (let i = 0; i < nChunks; i++) {
    // keep the desk in a sensible height band
    if (b.y > 6) b.ease(8, -3);
    if (b.y < -6) b.ease(8, 3);
    let name = rng.weighted(pool);
    if (name === last) name = rng.weighted(pool);
    last = name;
    const before = b.windows.length;
    chunks.push({ name, x: b.x });
    CHUNKS[name](b, d);
    // occasionally hang a high window over a jump
    if ((name === 'gap' || name === 'bigair' || name === 'table') && rng.chance(0.3) && b.windows.length === before) {
      const arcLetters = b.letters.slice(-4);
      const mid = arcLetters[Math.floor(arcLetters.length / 2)];
      if (mid) {
        b.letters.splice(b.letters.indexOf(mid), 1);
        b.window(mid.x, mid.y + 0.6, true);
      }
    }
    sinceWindow++;
    if (sinceWindow >= every && i < nChunks - 1) {
      station(b, !!opts.sparseWindows, rng);
      sinceWindow = 0;
    }
    if (rng.chance(0.25)) b.prop(rng.pick(['mug', 'stampbox', 'clip'] as const), b.x - 2, b.y, 1.5, 1.5);
  }

  // The sorting office: a long flat finish with the final window.
  b.flat(6);
  const fx = b.x + 6;
  b.flat(24, 'office');
  b.window(fx, b.y, false, true);
  const endX = fx;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const isl of b.islands) for (const p of isl) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    seed: opts.seed,
    islands: b.islands.filter((i) => i.length > 1),
    spans: b.spans,
    windows: b.windows,
    letters: b.letters,
    props: b.props,
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
