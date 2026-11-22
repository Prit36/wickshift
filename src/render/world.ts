// Background layers and the desk terrain.
import { C, BOOK_TONES } from './palette';
import { rr, inked, drawBookFace } from './art';
import type { Course, Vec, Span, Prop } from '../sim/terrain';
import { Rng } from '../sim/rng';

type Ctx = CanvasRenderingContext2D;

export interface Cam {
  x: number;
  y: number;
  ppm: number;
  W: number;
  H: number;
  dpr: number;
}

export function worldTransform(ctx: Ctx, cam: Cam, shakeX = 0, shakeY = 0): void {
  const { ppm, dpr, W, H } = cam;
  ctx.setTransform(dpr * ppm, 0, 0, -dpr * ppm, dpr * (W / 2 - cam.x * ppm + shakeX), dpr * (H / 2 + cam.y * ppm + shakeY));
}

export function toScreen(cam: Cam, x: number, y: number): { x: number; y: number } {
  return { x: cam.W / 2 + (x - cam.x) * cam.ppm, y: cam.H / 2 - (y - cam.y) * cam.ppm };
}

function offsetPath(pts: Vec[], dy: number): Vec[] {
  return pts.map((p) => ({ x: p.x, y: p.y + dy }));
}

function band(top: Vec[], dyA: number, dyB: number): Path2D {
  const p = new Path2D();
  const a = offsetPath(top, dyA);
  const b = offsetPath(top, dyB);
  p.moveTo(a[0].x, a[0].y);
  for (const q of a) p.lineTo(q.x, q.y);
  for (let i = b.length - 1; i >= 0; i--) p.lineTo(b[i].x, b[i].y);
  p.closePath();
  return p;
}

function slice(isl: Vec[], x0: number, x1: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < isl.length; i++) {
    const p = isl[i];
    if (p.x >= x0 - 1e-6 && p.x <= x1 + 1e-6) out.push(p);
  }
  return out;
}

interface IslandArt {
  pts: Vec[];
  x0: number;
  x1: number;
  body: Path2D;
  kraft: Path2D;
  paper: Path2D;
  stripes: Path2D;
  edge: Path2D;
}

export class WorldArt {
  islands: IslandArt[] = [];
  private farTile: HTMLCanvasElement | null = null;
  private midTile: HTMLCanvasElement | null = null;
  private tileH = 0;
  private stars: { x: number; y: number; r: number; tw: number }[] = [];

  constructor(readonly course: Course) {
    const bottom = course.killY - 6;
    for (const pts of course.islands) {
      const x0 = pts[0].x;
      const x1 = pts[pts.length - 1].x;
      const body = new Path2D();
      body.moveTo(x0, bottom);
      for (const p of pts) body.lineTo(p.x, p.y);
      body.lineTo(x1, bottom);
      body.closePath();
      const edge = new Path2D();
      edge.moveTo(x0, bottom);
      for (const p of pts) edge.lineTo(p.x, p.y);
      edge.lineTo(x1, bottom);
      const stripes = new Path2D();
      for (const dy of [-1.15, -2.3, -3.6]) {
        const o = offsetPath(pts, dy);
        stripes.moveTo(o[0].x, o[0].y);
        for (const q of o) stripes.lineTo(q.x, q.y);
      }
      this.islands.push({ pts, x0, x1, body, kraft: band(pts, 0, -3.2), paper: band(pts, 0.0, -0.32), stripes, edge });
    }
    const r = new Rng(course.seed + 17);
    for (let i = 0; i < 120; i++) this.stars.push({ x: r.next(), y: r.next() * 0.6, r: r.range(0.6, 2), tw: r.range(0, 6) });
  }

  // ---------------------------------------------------------------- background

  private buildTiles(H: number): void {
    this.tileH = H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Far: a wall of pigeonholes, some lit
    const fw = Math.round(H * 2);
    const far = document.createElement('canvas');
    far.width = fw * dpr;
    far.height = H * dpr;
    const f = far.getContext('2d')!;
    f.scale(dpr, dpr);
    const rng = new Rng(this.course.seed + 3);
    const cell = H * 0.13;
    const top = H * 0.16;
    f.fillStyle = C.wall;
    f.fillRect(0, top, fw, H - top);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < Math.ceil(fw / cell); col++) {
        const x = col * cell + cell * 0.12;
        const y = top + row * cell * 0.95 + cell * 0.1;
        const w = cell * 0.76;
        const h = cell * 0.72;
        f.fillStyle = C.wallLit;
        f.beginPath();
        f.moveTo(x, y + h);
        f.lineTo(x, y + h * 0.35);
        f.lineTo(x + w / 2, y);
        f.lineTo(x + w, y + h * 0.35);
        f.lineTo(x + w, y + h);
        f.closePath();
        f.fill();
        const lit = rng.chance(0.1);
        f.fillStyle = lit ? 'rgba(255,200,90,0.6)' : '#1d2156';
        f.beginPath();
        f.arc(x + w / 2, y + h * 0.58, w * 0.22, 0, Math.PI * 2);
        f.fill();
        if (!lit && rng.chance(0.4)) {
          // a letter poking out
          f.fillStyle = 'rgba(255,241,207,0.25)';
          f.fillRect(x + w * 0.3, y + h * 0.78, w * 0.4, h * 0.12);
        }
      }
    }
    // shelf boards
    f.fillStyle = '#232862';
    for (let row = 0; row <= 7; row++) f.fillRect(0, top + row * cell * 0.95 + cell * 0.82, fw, cell * 0.08);
    this.farTile = far;

    // Mid: big desk clutter silhouettes
    const mw = Math.round(H * 2.4);
    const mid = document.createElement('canvas');
    mid.width = mw * dpr;
    mid.height = H * dpr;
    const m = mid.getContext('2d')!;
    m.scale(dpr, dpr);
    const r2 = new Rng(this.course.seed + 9);
    let x = 0;
    while (x < mw) {
      const kind = r2.int(0, 4);
      const base = H;
      m.fillStyle = C.far;
      m.strokeStyle = 'rgba(255,255,255,0.08)';
      m.lineWidth = 3;
      if (kind === 0) {
        // stack of books
        let y = base;
        const n = r2.int(3, 6);
        for (let i = 0; i < n; i++) {
          const w = H * r2.range(0.25, 0.35);
          const h = H * r2.range(0.04, 0.07);
          m.fillRect(x + r2.range(-10, 10), y - h, w, h - 2);
          y -= h;
        }
        x += H * 0.4;
      } else if (kind === 1) {
        // desk lamp silhouette
        m.fillRect(x, base - H * 0.04, H * 0.2, H * 0.04);
        m.save();
        m.translate(x + H * 0.1, base - H * 0.04);
        m.rotate(-0.35);
        m.fillRect(-4, -H * 0.38, 8, H * 0.38);
        m.translate(0, -H * 0.38);
        m.rotate(1.1);
        m.fillRect(-4, -H * 0.25, 8, H * 0.25);
        m.translate(0, -H * 0.25);
        m.beginPath();
        m.moveTo(-H * 0.08, 0);
        m.lineTo(H * 0.08, 0);
        m.lineTo(H * 0.04, -H * 0.1);
        m.lineTo(-H * 0.04, -H * 0.1);
        m.closePath();
        m.fill();
        m.restore();
        x += H * 0.5;
      } else if (kind === 2) {
        // pencil cup
        const w = H * 0.12;
        m.fillRect(x, base - H * 0.2, w, H * 0.2);
        for (let i = 0; i < 4; i++) m.fillRect(x + 6 + i * (w / 4.5), base - H * r2.range(0.3, 0.42), 7, H * 0.2);
        x += H * 0.25;
      } else if (kind === 3) {
        // ink bottle
        m.beginPath();
        m.roundRect(x, base - H * 0.16, H * 0.14, H * 0.16, 10);
        m.fill();
        m.fillRect(x + H * 0.04, base - H * 0.21, H * 0.06, H * 0.06);
        x += H * 0.22;
      } else {
        // scale / stamp carousel
        m.beginPath();
        m.arc(x + H * 0.12, base - H * 0.14, H * 0.12, Math.PI, 0);
        m.fill();
        m.fillRect(x + H * 0.1, base - H * 0.14, H * 0.04, H * 0.14);
        m.fillRect(x, base - H * 0.03, H * 0.24, H * 0.03);
        x += H * 0.3;
      }
      x += H * r2.range(0.05, 0.25);
    }
    this.midTile = mid;
  }

  drawBackground(ctx: Ctx, cam: Cam, t: number, dpr: number): void {
    const { W, H } = cam;
    if (!this.farTile || Math.abs(this.tileH - H) > 2) this.buildTiles(H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.55, C.skyMid);
    g.addColorStop(0.85, C.skyLow);
    g.addColorStop(1, C.skyGlow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // stars
    for (const s of this.stars) {
      const x = (((s.x * W * 1.5 - cam.x * 2) % (W * 1.5)) + W * 1.5) % (W * 1.5);
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.tw));
      ctx.fillStyle = `rgba(255,241,207,${a})`;
      ctx.fillRect(x, s.y * H, s.r, s.r);
    }
    // moon
    const mx = W * 0.78 - ((cam.x * 1.2) % (W * 3)) * 0.02;
    const my = H * 0.17;
    const mr = H * 0.1;
    ctx.fillStyle = 'rgba(255,241,207,0.12)';
    ctx.beginPath();
    ctx.arc(mx, my, mr * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.paperShade;
    ctx.beginPath();
    ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // far wall: parallax 0.12
    const vy = (cam.y * cam.ppm) * 0.08;
    const tile = (img: HTMLCanvasElement, par: number, yOff: number) => {
      const w = img.width / (img.height / H);
      let ox = -((cam.x * cam.ppm * par) % w);
      if (ox > 0) ox -= w;
      for (let x = ox; x < W; x += w) ctx.drawImage(img, x, yOff, w, H);
    };
    tile(this.farTile!, 0.12, H * 0.1 + vy);
    // haze between layers
    const hz = ctx.createLinearGradient(0, H * 0.4, 0, H);
    hz.addColorStop(0, 'rgba(106,63,143,0)');
    hz.addColorStop(1, 'rgba(106,63,143,0.55)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.4, W, H * 0.6);
    tile(this.midTile!, 0.35, H * 0.25 + (cam.y * cam.ppm) * 0.2);
  }

  // ---------------------------------------------------------------- terrain

  drawTerrain(ctx: Ctx, cam: Cam, px: number): void {
    const half = cam.W / 2 / cam.ppm + 2;
    const xa = cam.x - half;
    const xb = cam.x + half;
    // drawers under gaps
    for (const p of this.course.props) if (p.kind === 'drawer' && p.x + p.w > xa && p.x < xb) this.drawDrawer(ctx, p);
    for (const isl of this.islands) {
      if (isl.x1 < xa || isl.x0 > xb) continue;
      ctx.fillStyle = C.kraftDeep;
      ctx.fill(isl.body);
      ctx.fillStyle = C.kraft;
      ctx.fill(isl.kraft);
      ctx.lineWidth = px * 3;
      ctx.strokeStyle = C.kraftDark;
      ctx.stroke(isl.stripes);
      ctx.fillStyle = C.paper;
      ctx.fill(isl.paper);
    }
    // props that sit in front of the desk face
    for (const p of this.course.props) {
      if (p.x + p.w < xa || p.x - p.w > xb) continue;
      if (p.kind === 'inkpot') this.drawInkpot(ctx, p);
    }
    for (const s of this.course.spans) {
      if (s.x1 < xa || s.x0 > xb) continue;
      this.drawSpan(ctx, s, px);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const isl of this.islands) {
      if (isl.x1 < xa || isl.x0 > xb) continue;
      ctx.lineWidth = px * 5;
      ctx.strokeStyle = C.ink;
      ctx.stroke(isl.edge);
    }
  }

  private islandFor(x: number): IslandArt | null {
    for (const i of this.islands) if (x >= i.x0 && x <= i.x1) return i;
    return null;
  }

  private drawSpan(ctx: Ctx, s: Span, px: number): void {
    const isl = this.islandFor((s.x0 + s.x1) / 2);
    if (!isl) return;
    const pts = slice(isl.pts, s.x0, s.x1);
    if (pts.length < 2) return;
    if (s.mat === 'ruler') {
      const p = band(pts, 0, -0.3);
      ctx.fillStyle = C.mustard;
      ctx.fill(p);
      ctx.lineWidth = px * 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke(p);
      // tick marks
      ctx.beginPath();
      let acc = 0;
      let k = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / seg;
        const ny = (b.x - a.x) / seg;
        while (acc <= seg) {
          const t = acc / seg;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const L = k % 4 === 0 ? 0.17 : 0.09;
          ctx.moveTo(x, y);
          ctx.lineTo(x - nx * L, y - ny * L);
          acc += 0.2;
          k++;
        }
        acc -= seg;
      }
      ctx.lineWidth = px * 2;
      ctx.stroke();
    } else if (s.mat === 'book') {
      const top = Math.max(...pts.map((p) => p.y));
      drawBookFace(ctx, s.x0, s.x1 + 0.05, top, 0.55, s.tone ?? 0);
    } else if (s.mat === 'envelope') {
      const p = band(pts, 0, -0.34);
      ctx.fillStyle = C.white;
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      ctx.lineWidth = 0.14;
      for (let x = Math.floor(s.x0); x < s.x1 + 1; x += 0.5) {
        ctx.strokeStyle = Math.round(x * 2) % 2 ? C.red : C.blue;
        ctx.beginPath();
        ctx.moveTo(x, -50);
        ctx.lineTo(x + 0.6, 50);
        ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = px * 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke(p);
    } else if (s.mat === 'blotter') {
      const p = band(pts, 0, -0.42);
      ctx.fillStyle = C.green;
      ctx.fill(p);
      ctx.lineWidth = px * 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke(p);
      const q = band(pts, -0.06, -0.12);
      ctx.fillStyle = C.greenDark;
      ctx.fill(q);
    } else if (s.mat === 'office') {
      const p = band(pts, 0, -0.5);
      ctx.save();
      ctx.clip(p);
      for (let x = Math.floor(s.x0); x < s.x1; x += 0.5) {
        ctx.fillStyle = Math.round(x * 2) % 2 ? C.cream : C.red;
        ctx.fillRect(x, pts[0].y - 0.5, 0.5, 0.25);
        ctx.fillStyle = Math.round(x * 2) % 2 ? C.red : C.cream;
        ctx.fillRect(x, pts[0].y - 0.25, 0.5, 0.25);
      }
      ctx.restore();
      ctx.lineWidth = px * 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke(p);
    }
  }

  private drawInkpot(ctx: Ctx, p: Prop): void {
    const isl = this.islandFor(p.x);
    if (!isl) return;
    const top = p.y - 0.05;
    const bot = top - p.h;
    const w = p.w;
    rr(ctx, p.x - w / 2, bot, w, top - bot - 0.15, 0.2);
    inked(ctx, C.blueDark, 0.05);
    rr(ctx, p.x - w * 0.3, top - 0.3, w * 0.6, 0.3, 0.05);
    inked(ctx, C.ink, 0.05);
    rr(ctx, p.x - w * 0.38, bot + 0.3, w * 0.76, 0.45, 0.05);
    inked(ctx, C.cream, 0.04);
    ctx.fillStyle = C.blue;
    ctx.fillRect(p.x - w * 0.3, bot + 0.45, w * 0.6, 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(p.x - w * 0.4, bot + 0.85, 0.08, 0.3);
  }

  private drawDrawer(ctx: Ctx, p: Prop): void {
    const x0 = p.x;
    const x1 = p.x + p.w;
    const top = p.y + 3;
    const bot = this.course.killY - 6;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x0 - 0.5, bot, x1 - x0 + 1, top - bot);
    // an open drawer far below, glowing faintly
    const dy = p.y - 3.2;
    rr(ctx, x0 + 0.3, dy - 1.2, x1 - x0 - 0.6, 1.2, 0.08);
    inked(ctx, '#7a3f2e', 0.06);
    rr(ctx, (x0 + x1) / 2 - 0.4, dy - 0.75, 0.8, 0.22, 0.1);
    inked(ctx, C.mustard, 0.05);
    // paper clips & pencil shavings in the drawer
    ctx.strokeStyle = '#c9cfd8';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.ellipse(x0 + 0.8, dy + 0.08, 0.25, 0.08, 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Decorative clutter standing on the desk (drawn behind the cart). */
  drawStanding(ctx: Ctx, cam: Cam, t: number): void {
    const half = cam.W / 2 / cam.ppm + 3;
    for (const p of this.course.props) {
      if (Math.abs(p.x - cam.x) > half) continue;
      if (p.kind === 'mug') {
        const y = p.y;
        rr(ctx, p.x - 0.7, y, 1.4, 1.6, 0.25);
        inked(ctx, BOOK_TONES[p.seed % BOOK_TONES.length], 0.06);
        ctx.beginPath();
        ctx.arc(p.x + 0.75, y + 0.85, 0.35, -Math.PI / 2, Math.PI / 2);
        ctx.lineWidth = 0.16;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
        ctx.fillStyle = C.cream;
        ctx.fillRect(p.x - 0.4, y + 0.6, 0.8, 0.12);
        // steam
        ctx.strokeStyle = 'rgba(255,241,207,0.5)';
        ctx.lineWidth = 0.06;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          const sx = p.x - 0.2 + i * 0.4;
          ctx.moveTo(sx, y + 1.7);
          ctx.bezierCurveTo(sx + 0.2, y + 2.0, sx - 0.2, y + 2.3, sx + Math.sin(t * 2 + i) * 0.15, y + 2.6);
          ctx.stroke();
        }
      } else if (p.kind === 'pencils') {
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.translate(p.x + i * 0.3, p.y);
          ctx.rotate(-0.1 + i * 0.1);
          rr(ctx, -0.1, 0, 0.2, 2.2 - i * 0.3, 0.03);
          inked(ctx, BOOK_TONES[(p.seed + i) % BOOK_TONES.length], 0.04);
          ctx.restore();
        }
      } else if (p.kind === 'stampbox') {
        rr(ctx, p.x - 0.6, p.y, 1.2, 0.6, 0.08);
        inked(ctx, C.teal, 0.06);
        rr(ctx, p.x - 0.35, p.y + 0.6, 0.7, 0.6, 0.06);
        inked(ctx, '#a0613f', 0.05);
        rr(ctx, p.x - 0.2, p.y + 1.2, 0.4, 0.3, 0.15);
        inked(ctx, C.red, 0.05);
      } else if (p.kind === 'clip') {
        ctx.beginPath();
        ctx.moveTo(p.x - 0.6, p.y + 0.05);
        ctx.lineTo(p.x + 0.5, p.y + 0.05);
        ctx.arc(p.x + 0.5, p.y + 0.3, 0.25, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(p.x - 0.45, p.y + 0.55);
        ctx.arc(p.x - 0.45, p.y + 0.35, 0.2, Math.PI / 2, (Math.PI * 3) / 2);
        ctx.lineTo(p.x + 0.35, p.y + 0.15);
        ctx.lineWidth = 0.09;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
        ctx.lineWidth = 0.04;
        ctx.strokeStyle = '#d9dee8';
        ctx.stroke();
      } else if (p.kind === 'sign') {
        ctx.fillStyle = C.ink;
        ctx.fillRect(p.x - 0.05, p.y, 0.1, 1.6);
        ctx.beginPath();
        ctx.moveTo(p.x - 0.5, p.y + 1.2);
        ctx.lineTo(p.x + 0.45, p.y + 1.2);
        ctx.lineTo(p.x + 0.7, p.y + 1.45);
        ctx.lineTo(p.x + 0.45, p.y + 1.7);
        ctx.lineTo(p.x - 0.5, p.y + 1.7);
        ctx.closePath();
        inked(ctx, C.mustard, 0.05);
      }
    }
  }
}
