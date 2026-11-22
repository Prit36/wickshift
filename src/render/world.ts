// Background layers, the desk terrain and the course features, themed per room.
import { C, BOOK_TONES } from './palette';
import { rr, inked, drawBookFace, drawFlame } from './art';
import { themeFor, type Theme } from './theme';
import { groundAt, type Course, type Vec, type Span, type Prop, type Feature } from '../sim/terrain';
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
  face: Path2D;
  paper: Path2D;
  stripes: Path2D;
  edge: Path2D;
}

/** What the renderer needs to know about live feature state. */
export interface FeatureState {
  used: ReadonlySet<number>;
  cubes: { x: number; y: number; a: number; hit: boolean }[];
  paw: { phase: string; t: number; x: number; ground: number; y: number } | null;
  /** 0..1 how far the hoop burst animation has run, by feature id. */
  t: number;
}

export class WorldArt {
  islands: IslandArt[] = [];
  readonly theme: Theme;
  private farTile: HTMLCanvasElement | null = null;
  private midTile: HTMLCanvasElement | null = null;
  private tileH = 0;
  private stars: { x: number; y: number; r: number; tw: number }[] = [];

  constructor(readonly course: Course) {
    this.theme = themeFor(course.theme);
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
      const pat = this.theme.facePattern;
      const offs = pat === 'planks' ? [-0.9, -1.8, -2.7, -3.6] : pat === 'baize' ? [-0.55] : [-1.15, -2.3, -3.6];
      for (const dy of offs) {
        const o = offsetPath(pts, dy);
        if (pat === 'contours') {
          // wobbly map contour lines
          stripes.moveTo(o[0].x, o[0].y);
          for (const q of o) stripes.lineTo(q.x, q.y + Math.sin(q.x * 0.9 + dy * 3) * 0.18);
        } else {
          stripes.moveTo(o[0].x, o[0].y);
          for (const q of o) stripes.lineTo(q.x, q.y);
        }
      }
      if (pat === 'planks') {
        // plank seams
        for (let x = Math.ceil(x0 / 2.4) * 2.4; x < x1; x += 2.4) {
          const g = groundAt(course, x);
          if (g === null) continue;
          stripes.moveTo(x, g - 0.35);
          stripes.lineTo(x, g - 3.6);
        }
      }
      this.islands.push({ pts, x0, x1, body, face: band(pts, 0, -3.4), paper: band(pts, 0.0, -0.32), stripes, edge });
    }
    const r = new Rng(course.seed + 17);
    for (let i = 0; i < 120; i++) this.stars.push({ x: r.next(), y: r.next() * 0.6, r: r.range(0.6, 2), tw: r.range(0, 6) });
  }

  // ---------------------------------------------------------------- background

  private buildTiles(H: number): void {
    this.tileH = H;
    const th = this.theme;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fw = Math.round(H * 2);
    const far = document.createElement('canvas');
    far.width = fw * dpr;
    far.height = H * dpr;
    const f = far.getContext('2d')!;
    f.scale(dpr, dpr);
    const rng = new Rng(this.course.seed + 3);
    const top = H * 0.16;
    f.fillStyle = th.wall;
    f.fillRect(0, top, fw, H - top);
    if (th.backdrop === 'pigeonholes') {
      const cell = H * 0.13;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < Math.ceil(fw / cell); col++) {
          const x = col * cell + cell * 0.12;
          const y = top + row * cell * 0.95 + cell * 0.1;
          const w = cell * 0.76;
          const h = cell * 0.72;
          f.fillStyle = th.wallLit;
          f.beginPath();
          f.moveTo(x, y + h);
          f.lineTo(x, y + h * 0.35);
          f.lineTo(x + w / 2, y);
          f.lineTo(x + w, y + h * 0.35);
          f.lineTo(x + w, y + h);
          f.closePath();
          f.fill();
          const lit = rng.chance(0.1);
          f.fillStyle = lit ? 'rgba(255,200,90,0.6)' : th.wallDark;
          f.beginPath();
          f.arc(x + w / 2, y + h * 0.58, w * 0.22, 0, Math.PI * 2);
          f.fill();
          if (!lit && rng.chance(0.4)) {
            f.fillStyle = 'rgba(255,241,207,0.25)';
            f.fillRect(x + w * 0.3, y + h * 0.78, w * 0.4, h * 0.12);
          }
        }
      }
      f.fillStyle = th.wallDark;
      for (let row = 0; row <= 7; row++) f.fillRect(0, top + row * cell * 0.95 + cell * 0.82, fw, cell * 0.08);
    } else if (th.backdrop === 'cabinets') {
      // brass-handled sorting cabinets with little labelled drawers
      const cw = H * 0.34;
      for (let col = 0; col < Math.ceil(fw / cw); col++) {
        const x = col * cw + cw * 0.06;
        f.fillStyle = th.wallLit;
        f.fillRect(x, top + H * 0.02, cw * 0.88, H);
        for (let row = 0; row < 9; row++) {
          for (let k = 0; k < 2; k++) {
            const dx = x + cw * 0.06 + k * cw * 0.4;
            const dy = top + H * 0.05 + row * H * 0.085;
            f.fillStyle = rng.chance(0.08) ? 'rgba(255,200,90,0.45)' : th.wallDark;
            f.fillRect(dx, dy, cw * 0.36, H * 0.07);
            f.fillStyle = '#c9a25a';
            f.fillRect(dx + cw * 0.14, dy + H * 0.045, cw * 0.08, H * 0.012);
            f.fillStyle = 'rgba(255,241,207,0.3)';
            f.fillRect(dx + cw * 0.12, dy + H * 0.012, cw * 0.12, H * 0.02);
          }
        }
      }
    } else if (th.backdrop === 'maps') {
      // pinned-up maps with routes drawn on them
      let x = 0;
      while (x < fw) {
        const w = H * rng.range(0.35, 0.55);
        const h = H * rng.range(0.25, 0.4);
        const y = top + H * rng.range(0.0, 0.25);
        f.save();
        f.translate(x + w / 2, y + h / 2);
        f.rotate(rng.range(-0.05, 0.05));
        f.fillStyle = th.wallLit;
        f.fillRect(-w / 2, -h / 2, w, h);
        f.strokeStyle = 'rgba(255,241,207,0.18)';
        f.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          f.beginPath();
          const cx = rng.range(-w / 3, w / 3);
          const cy = rng.range(-h / 3, h / 3);
          f.ellipse(cx, cy, w * rng.range(0.08, 0.2), h * rng.range(0.08, 0.2), rng.range(0, 3), 0, Math.PI * 2);
          f.stroke();
        }
        f.setLineDash([6, 6]);
        f.strokeStyle = 'rgba(232,80,58,0.5)';
        f.beginPath();
        f.moveTo(-w * 0.4, h * 0.3);
        f.bezierCurveTo(-w * 0.1, -h * 0.4, w * 0.1, h * 0.4, w * 0.4, -h * 0.3);
        f.stroke();
        f.setLineDash([]);
        f.fillStyle = '#e8503a';
        f.beginPath();
        f.arc(0, -h / 2 + 6, 5, 0, Math.PI * 2);
        f.fill();
        f.restore();
        x += w + H * rng.range(0.05, 0.15);
      }
    } else {
      // attic: sloping rafters and a round window
      f.fillStyle = th.wallDark;
      for (let x = -H; x < fw + H; x += H * 0.45) {
        f.beginPath();
        f.moveTo(x, H);
        f.lineTo(x + H * 0.6, top);
        f.lineTo(x + H * 0.66, top);
        f.lineTo(x + H * 0.06, H);
        f.closePath();
        f.fill();
      }
      f.fillStyle = th.wallLit;
      for (let x = 0; x < fw; x += H * 0.9) {
        f.fillRect(x, top + H * 0.1, fw, H * 0.03);
        // cobweb in a corner
        f.strokeStyle = 'rgba(255,241,207,0.12)';
        f.lineWidth = 1.5;
        for (let i = 1; i < 4; i++) {
          f.beginPath();
          f.arc(x, top + H * 0.13, i * H * 0.03, 0, Math.PI / 2);
          f.stroke();
        }
      }
    }
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
    m.fillStyle = th.far;
    while (x < mw) {
      const kind = r2.int(0, 5);
      const base = H;
      if (kind === 0) {
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
        const w = H * 0.12;
        m.fillRect(x, base - H * 0.2, w, H * 0.2);
        for (let i = 0; i < 4; i++) m.fillRect(x + 6 + i * (w / 4.5), base - H * r2.range(0.3, 0.42), 7, H * 0.2);
        x += H * 0.25;
      } else if (kind === 3) {
        m.beginPath();
        m.roundRect(x, base - H * 0.16, H * 0.14, H * 0.16, 10);
        m.fill();
        m.fillRect(x + H * 0.04, base - H * 0.21, H * 0.06, H * 0.06);
        x += H * 0.22;
      } else if (kind === 4) {
        // candle
        m.fillRect(x + H * 0.02, base - H * 0.24, H * 0.05, H * 0.24);
        m.fillRect(x, base - H * 0.02, H * 0.09, H * 0.02);
        m.save();
        m.fillStyle = 'rgba(255,210,90,0.35)';
        m.beginPath();
        m.arc(x + H * 0.045, base - H * 0.27, H * 0.04, 0, Math.PI * 2);
        m.fill();
        m.restore();
        x += H * 0.16;
      } else {
        // globe / scale
        m.beginPath();
        m.arc(x + H * 0.12, base - H * 0.2, H * 0.11, 0, Math.PI * 2);
        m.fill();
        m.fillRect(x + H * 0.1, base - H * 0.1, H * 0.04, H * 0.1);
        m.fillRect(x + H * 0.03, base - H * 0.03, H * 0.18, H * 0.03);
        x += H * 0.3;
      }
      x += H * r2.range(0.05, 0.25);
    }
    this.midTile = mid;
  }

  drawBackground(ctx: Ctx, cam: Cam, t: number, dpr: number): void {
    const { W, H } = cam;
    const th = this.theme;
    if (!this.farTile || Math.abs(this.tileH - H) > 2) this.buildTiles(H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.skyTop);
    g.addColorStop(0.55, th.skyMid);
    g.addColorStop(0.85, th.skyLow);
    g.addColorStop(1, th.skyGlow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      const x = (((s.x * W * 1.5 - cam.x * 2) % (W * 1.5)) + W * 1.5) % (W * 1.5);
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.tw));
      ctx.fillStyle = `rgba(255,241,207,${a * (th.moon ? 1 : 0.4)})`;
      ctx.fillRect(x, s.y * H, s.r, s.r);
    }
    const mx = W * 0.78 - ((cam.x * 1.2) % (W * 3)) * 0.02;
    const my = H * 0.17;
    const mr = H * 0.1;
    if (th.moon) {
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
    } else {
      // a hanging brass lampshade glow instead of a moon
      const lg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3);
      lg.addColorStop(0, 'rgba(255,214,120,0.35)');
      lg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(mx - mr * 3, 0, mr * 6, my + mr * 3);
      ctx.fillStyle = '#c9a25a';
      ctx.beginPath();
      ctx.moveTo(mx - mr * 0.9, my);
      ctx.lineTo(mx + mr * 0.9, my);
      ctx.lineTo(mx + mr * 0.4, my - mr * 0.7);
      ctx.lineTo(mx - mr * 0.4, my - mr * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(mx - 1.5, 0, 3, my - mr * 0.7);
    }
    const vy = cam.y * cam.ppm * 0.08;
    const tile = (img: HTMLCanvasElement, par: number, yOff: number) => {
      const w = img.width / (img.height / H);
      let ox = -((cam.x * cam.ppm * par) % w);
      if (ox > 0) ox -= w;
      for (let x = ox; x < W; x += w) ctx.drawImage(img, x, yOff, w, H);
    };
    tile(this.farTile!, 0.12, H * 0.1 + vy);
    const hz = ctx.createLinearGradient(0, H * 0.4, 0, H);
    hz.addColorStop(0, `rgba(${th.haze},0)`);
    hz.addColorStop(1, `rgba(${th.haze},0.55)`);
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.4, W, H * 0.6);
    tile(this.midTile!, 0.35, H * 0.25 + cam.y * cam.ppm * 0.2);
  }

  // ---------------------------------------------------------------- terrain

  drawTerrain(ctx: Ctx, cam: Cam, px: number): void {
    const th = this.theme;
    const half = cam.W / 2 / cam.ppm + 2;
    const xa = cam.x - half;
    const xb = cam.x + half;
    for (const p of this.course.props) if (p.kind === 'drawer' && p.x + p.w > xa && p.x < xb) this.drawDrawer(ctx, p);
    for (const isl of this.islands) {
      if (isl.x1 < xa || isl.x0 > xb) continue;
      ctx.fillStyle = th.body;
      ctx.fill(isl.body);
      ctx.fillStyle = th.face;
      ctx.fill(isl.face);
      ctx.lineWidth = px * (th.facePattern === 'contours' ? 2 : 3);
      ctx.strokeStyle = th.stripe;
      ctx.stroke(isl.stripes);
      if (th.facePattern === 'baize') {
        // brass studs along the baize edge
        ctx.fillStyle = '#c9a25a';
        for (let i = 0; i < isl.pts.length; i += 4) {
          const p = isl.pts[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y - 0.55, 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = th.top;
      ctx.fill(isl.paper);
    }
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
    const dy = p.y - 3.2;
    rr(ctx, x0 + 0.3, dy - 1.2, x1 - x0 - 0.6, 1.2, 0.08);
    inked(ctx, '#7a3f2e', 0.06);
    rr(ctx, (x0 + x1) / 2 - 0.4, dy - 0.75, 0.8, 0.22, 0.1);
    inked(ctx, C.mustard, 0.05);
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

  // ---------------------------------------------------------------- course features

  /** Features that sit behind the cart: rails (and their erasers), hoops' back half. */
  drawFeaturesBack(ctx: Ctx, cam: Cam, st: FeatureState): void {
    const half = cam.W / 2 / cam.ppm + 4;
    for (const f of this.course.features) {
      const fx = featureX(f);
      if (fx > cam.x + half + 16 || featureEnd(f) < cam.x - half) continue;
      if (f.kind === 'rail') drawRail(ctx, this.course, f);
      else if (f.kind === 'hoop') drawHoop(ctx, f, st.used.has(f.id), st.t, false);
    }
  }

  /** Features on and in front of the desk. */
  drawFeaturesFront(ctx: Ctx, cam: Cam, st: FeatureState): void {
    const half = cam.W / 2 / cam.ppm + 4;
    for (const f of this.course.features) {
      if (featureX(f) > cam.x + half + 16 || featureEnd(f) < cam.x - half) continue;
      switch (f.kind) {
        case 'striker':
          drawStriker(ctx, this.course, f.x0, f.x1, st.used.has(f.id), st.t);
          break;
        case 'tacks':
          drawTacks(ctx, this.course, f.x0, f.x1, st.used.has(f.id), f.id);
          break;
        case 'trap':
          drawTrap(ctx, f.x, f.y, st.used.has(f.id), st.t);
          break;
        default:
          break;
      }
    }
    for (const c of st.cubes) {
      if (Math.abs(c.x - cam.x) > half) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      rr(ctx, -0.25, -0.25, 0.5, 0.5, 0.05);
      inked(ctx, C.white, 0.04);
      ctx.fillStyle = 'rgba(200,190,230,0.5)';
      ctx.fillRect(-0.18, -0.18, 0.12, 0.12);
      ctx.fillRect(0.06, 0.04, 0.1, 0.1);
      ctx.fillRect(-0.05, 0.12, 0.07, 0.07);
      ctx.restore();
    }
  }

  /** The front half of each burning hoop, drawn over the cart. */
  drawHoopsFront(ctx: Ctx, cam: Cam, st: FeatureState): void {
    const half = cam.W / 2 / cam.ppm + 4;
    for (const f of this.course.features) {
      if (f.kind !== 'hoop' || Math.abs(f.x - cam.x) > half) continue;
      drawHoop(ctx, f, st.used.has(f.id), st.t, true);
    }
  }

  /** The cat's paw (in front of everything) and its warning shadow. */
  drawPaw(ctx: Ctx, st: FeatureState, t: number): void {
    const p = st.paw;
    if (!p || p.phase === 'idle') return;
    // shadow on the desk grows as it comes
    const warnK = p.phase === 'warn' ? 1 - Math.max(0, p.t) / 1.05 : 1;
    ctx.fillStyle = `rgba(14,8,30,${0.4 + 0.4 * warnK})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.ground + 0.05, 0.4 + 1.0 * warnK, 0.16 + 0.1 * warnK, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.phase === 'warn' && Math.sin(t * 22) > 0) {
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.ellipse(p.x, p.ground + 0.05, 1.5, 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // the paw itself: a tabby foreleg coming down from above (it looms into view while warning)
    const y = p.phase === 'warn' ? p.ground + 8 - 2.8 * warnK : p.y;
    ctx.save();
    ctx.translate(p.x, y);
    rr(ctx, -0.62, 0.2, 1.24, 14, 0.4);
    inked(ctx, '#e59a5a', 0.07);
    ctx.fillStyle = '#c46a3a';
    for (let i = 0; i < 8; i++) ctx.fillRect(-0.62, 1 + i * 1.5, 1.24, 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.95, 0.6, 0, 0, Math.PI * 2);
    inked(ctx, '#f0b07a', 0.07);
    ctx.fillStyle = '#ff9fb8';
    for (const dx of [-0.5, -0.17, 0.17, 0.5]) {
      ctx.beginPath();
      ctx.ellipse(dx, -0.38, 0.14, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function featureX(f: Feature): number {
  return f.kind === 'striker' || f.kind === 'tacks' || f.kind === 'rail' ? f.x0 : f.x;
}
function featureEnd(f: Feature): number {
  if (f.kind === 'striker' || f.kind === 'tacks' || f.kind === 'rail') return f.x1;
  if (f.kind === 'stack') return f.x + f.cols * 0.5;
  return f.x + 2;
}

function drawRail(ctx: Ctx, course: Course, f: Extract<Feature, { kind: 'rail' }>): void {
  // eraser supports
  for (const sx of [f.x0 + 1, (f.x0 + f.x1) / 2, f.x1 - 1]) {
    const ry = f.y0 + ((f.y1 - f.y0) * (sx - f.x0)) / (f.x1 - f.x0);
    const g = groundAt(course, sx);
    if (g === null) continue;
    rr(ctx, sx - 0.18, g - 0.1, 0.36, ry - g - 0.06, 0.06);
    inked(ctx, C.pink, 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(sx - 0.12, g, 0.06, ry - g - 0.25);
  }
  // the pencil: yellow body, ferrule, eraser at the start, sharpened tip at the end
  const a = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
  const L = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
  ctx.save();
  ctx.translate(f.x0, f.y0);
  ctx.rotate(a);
  const h = 0.32;
  rr(ctx, -0.6, -h, 0.45, h, 0.08);
  inked(ctx, C.pink, 0.05);
  ctx.fillStyle = '#c9cfd8';
  ctx.fillRect(-0.18, -h, 0.22, h);
  ctx.beginPath();
  ctx.rect(0, -h, L - 0.9, h);
  inked(ctx, C.mustard, 0.05);
  ctx.fillStyle = C.mustardDark;
  ctx.fillRect(0, -h * 0.66, L - 0.9, h * 0.12);
  ctx.fillRect(0, -h * 0.33, L - 0.9, h * 0.12);
  ctx.beginPath();
  ctx.moveTo(L - 0.9, 0);
  ctx.lineTo(L, -h / 2);
  ctx.lineTo(L - 0.9, -h);
  ctx.closePath();
  inked(ctx, '#f3d9a4', 0.05);
  ctx.beginPath();
  ctx.moveTo(L - 0.3, -h * 0.33);
  ctx.lineTo(L, -h / 2);
  ctx.lineTo(L - 0.3, -h * 0.67);
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
}

function drawStriker(ctx: Ctx, course: Course, x0: number, x1: number, used: boolean, t: number): void {
  const y = groundAt(course, (x0 + x1) / 2) ?? 0;
  rr(ctx, x0 - 0.2, y - 0.05, x1 - x0 + 0.4, 0.16, 0.04);
  inked(ctx, '#7a3f2e', 0.05);
  // sandpaper grit
  ctx.fillStyle = used ? 'rgba(40,20,20,0.6)' : '#a9503a';
  for (let x = x0; x < x1; x += 0.13) ctx.fillRect(x, y + 0.02 + ((x * 17) % 0.06), 0.05, 0.05);
  // chevrons pointing the way
  if (!used) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    ctx.strokeStyle = `rgba(255,210,63,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 0.1;
    for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.9) {
      ctx.beginPath();
      ctx.moveTo(x, y + 0.5);
      ctx.lineTo(x + 0.3, y + 0.32);
      ctx.lineTo(x, y + 0.14);
      ctx.stroke();
    }
  }
}

function drawTacks(ctx: Ctx, course: Course, x0: number, x1: number, used: boolean, seed: number): void {
  for (let x = x0 + 0.15, i = 0; x < x1; x += 0.42, i++) {
    const g = groundAt(course, x);
    if (g === null) continue;
    const wob = Math.sin(seed * 3.1 + i * 2.3) * 0.12;
    ctx.save();
    ctx.translate(x, g);
    ctx.rotate(wob);
    // head
    ctx.beginPath();
    ctx.ellipse(0, 0.08, 0.2, 0.07, 0, 0, Math.PI * 2);
    inked(ctx, [C.red, C.blue, C.mustard, C.teal][(i + seed) % 4], 0.035);
    // pin pointing up
    ctx.beginPath();
    ctx.moveTo(-0.035, 0.12);
    ctx.lineTo(0, used && i % 2 ? 0.28 : 0.5);
    ctx.lineTo(0.035, 0.12);
    ctx.closePath();
    inked(ctx, '#d9dee8', 0.025);
    ctx.restore();
  }
}

function drawTrap(ctx: Ctx, x: number, y: number, sprung: boolean, t: number): void {
  // wooden base
  rr(ctx, x - 0.9, y, 1.8, 0.16, 0.04);
  inked(ctx, '#d9a066', 0.05);
  ctx.fillStyle = '#b87a44';
  ctx.fillRect(x - 0.85, y + 0.06, 1.7, 0.03);
  // trigger plate with cheese
  rr(ctx, x - 0.2, y + 0.16, 0.4, 0.06, 0.02);
  inked(ctx, '#c9cfd8', 0.03);
  if (!sprung) {
    ctx.beginPath();
    ctx.moveTo(x - 0.15, y + 0.22);
    ctx.lineTo(x + 0.18, y + 0.22);
    ctx.lineTo(x + 0.02, y + 0.42);
    ctx.closePath();
    inked(ctx, C.mustard, 0.03);
  }
  // the snap bar: set (lying back) or snapped forward
  const a = sprung ? 0.15 : Math.PI - 0.15 + Math.sin(t * 6) * 0.03;
  ctx.save();
  ctx.translate(x, y + 0.18);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.rect(0, -0.04, 0.85, 0.08);
  inked(ctx, '#c9cfd8', 0.03);
  ctx.restore();
  // spring coils
  ctx.strokeStyle = '#c9cfd8';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(x, y + 0.2, 0.12, 0, Math.PI * 2);
  ctx.stroke();
  if (!sprung) {
    // warning arrow
    const bob = Math.abs(Math.sin(t * 5)) * 0.2;
    ctx.fillStyle = C.mustard;
    ctx.beginPath();
    ctx.moveTo(x - 0.25, y + 1.3 + bob);
    ctx.lineTo(x + 0.25, y + 1.3 + bob);
    ctx.lineTo(x, y + 0.9 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
}

function drawHoop(ctx: Ctx, f: Extract<Feature, { kind: 'hoop' }>, used: boolean, t: number, front: boolean): void {
  // the hoop is a tilted paper ring: back half behind the cart, front half over it
  const rx = f.r * 0.32;
  const ry = f.r;
  ctx.save();
  ctx.translate(f.x, f.y);
  // hanging string
  if (!front) {
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(0, ry + 30);
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = 'rgba(255,241,207,0.6)';
    ctx.stroke();
  }
  const a0 = front ? -Math.PI / 2 : Math.PI / 2;
  const a1 = front ? Math.PI / 2 : (Math.PI * 3) / 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, a0, a1);
  ctx.lineWidth = 0.26;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.lineWidth = 0.15;
  ctx.strokeStyle = used ? '#7a6a8a' : front ? C.red : C.redDark;
  ctx.stroke();
  if (!used) {
    // little flames dancing along the rim
    for (let i = 0; i < 6; i++) {
      const a = a0 + ((i + 0.5) / 6) * Math.PI;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      drawFlame(ctx, x, y, 0.05 + 0.04 * Math.sin(t * 9 + i * 1.7), t + i);
    }
  }
  ctx.restore();
}
