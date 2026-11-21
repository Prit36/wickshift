// The paper theatre: cached night backdrop, live terrain drawn from the same
// authored profile as its collider, the receiving window and the bench clamp.
import type { Pt } from '../data/parts';
import type { Material, RouteDef, TerrainPiece } from '../data/routeTypes';
import { mulberry32 } from '../core/geom';
import type { Camera } from './camera';
export { buildBackdrop, drawBackdrop, drawVignette, type Backdrop } from './backdrop';
import { C, FONT_STAMP } from './palette';
import { FX, circlePath, grainOver, printed, polyPath } from './paint';
import { drawMoth } from './moth';

// ---------------------------------------------------------------- terrain

const MAT: Record<Material, { fill: string; edge: string; grain: number; fiber: boolean }> = {
  desk: { fill: '#2b2730', edge: '#7a6a5c', grain: 0.9, fiber: false },
  book: { fill: C.petrol, edge: C.paper, grain: 0.9, fiber: false },
  paper: { fill: C.paper, edge: C.paper, grain: 0.5, fiber: true },
  envelope: { fill: '#ead3a0', edge: C.paper, grain: 0.5, fiber: true },
  brass: { fill: C.brass, edge: C.brassGlint, grain: 0.4, fiber: false },
  tin: { fill: C.inkSoft, edge: C.teal, grain: 0.8, fiber: false },
  blotter: { fill: C.teal, edge: C.paper, grain: 0.7, fiber: true },
  card: { fill: C.paperDeep, edge: C.paper, grain: 0.5, fiber: true },
  shelf: { fill: '#3a3036', edge: '#8a7564', grain: 0.9, fiber: false },
};

function piecePath(cam: Camera, pts: readonly Pt[]): Path2D {
  return polyPath(pts.map((p) => [cam.sx(p[0]), cam.sy(p[1])] as [number, number]));
}

/** Upward-facing (walkable) edges of a CCW outline, in world coords. */
function topEdges(pts: readonly Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ny = -dx / len;
    if (ny > 0.25) out.push([a, b]);
  }
  return out;
}

function detailPiece(ctx: CanvasRenderingContext2D, cam: Camera, piece: TerrainPiece, path: Path2D): void {
  const k = cam.ppm;
  const xs = piece.pts.map((p) => p[0]);
  const ys = piece.pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);
  ctx.save();
  ctx.clip(path);
  if (piece.material === 'book') {
    // Page edges: fine buff lines along the book's side.
    ctx.strokeStyle = 'rgba(243,222,174,0.75)';
    ctx.lineWidth = 1;
    const top = cam.sy(y1);
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cam.sx(x0), top + 6 + i * 3.2);
      ctx.lineTo(cam.sx(x1), top + 6 + i * 3.2);
      ctx.stroke();
    }
    ctx.fillStyle = C.petrolDeep;
    ctx.fillRect(cam.sx(x0), top + 26, (x1 - x0) * k, 9999);
    // Spine band.
    ctx.fillStyle = C.vermilionDeep;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(cam.sx(x0), top + 44, (x1 - x0) * k, 8);
    ctx.globalAlpha = 1;
  } else if (piece.material === 'envelope') {
    // A drift of envelopes: stacked edges, flaps, addresses, stamps, postmarks.
    const top = cam.sy(y1);
    const rnd = mulberry32(Math.floor(x0 * 7));
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const y = top + 12 + i * 9;
      ctx.strokeStyle = i % 2 ? 'rgba(184,154,99,0.75)' : 'rgba(243,222,174,0.6)';
      ctx.beginPath();
      ctx.moveTo(cam.sx(x0), y);
      ctx.lineTo(cam.sx(x1), y + (rnd() - 0.5) * 2);
      ctx.stroke();
    }
    // One envelope face every ~5.5 m, drawn only where the camera can see it.
    const vis0 = Math.max(x0, cam.wx(-300));
    const vis1 = Math.min(x1, cam.wx(cam.W + 300));
    for (let ex = x0 + 0.6 + Math.ceil((vis0 - x0 - 0.6) / 5.5) * 5.5; ex < vis1 - 1; ex += 5.5) {
      const r2 = mulberry32(Math.floor(ex * 13));
      const sx0 = cam.sx(ex);
      const w = 4.6 * k;
      const fy = top + 10;
      ctx.strokeStyle = 'rgba(138,109,51,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx0, fy);
      ctx.lineTo(sx0 + w * 0.5, fy + 0.5 * k);
      ctx.lineTo(sx0 + w, fy);
      ctx.stroke();
      // Address lines in ink.
      ctx.strokeStyle = 'rgba(24,38,56,0.45)';
      ctx.lineWidth = 2;
      for (let j = 0; j < 3; j++) {
        const ly = fy + 0.56 * k + j * 9;
        ctx.beginPath();
        ctx.moveTo(sx0 + w * 0.32, ly);
        ctx.lineTo(sx0 + w * (0.62 - j * 0.06 + r2() * 0.06), ly);
        ctx.stroke();
      }
      // Stamp with a perforated edge and a wavy postmark.
      const stx = sx0 + w * 0.82;
      const sty = fy + 4;
      ctx.fillStyle = [C.vermilion, C.teal, C.petrol][Math.floor(r2() * 3)]!;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(stx, sty, 22, 26);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.paper;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(stx + 3, sty + 3, 16, 20);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(24,38,56,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(stx - 6, sty + 14, 11, 0, Math.PI * 2);
      ctx.stroke();
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        for (let q = 0; q <= 8; q++) {
          const xx = stx - 40 + q * 4;
          const yy = sty + 6 + j * 7 + Math.sin(q * 1.3) * 1.6;
          q ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
    }
  } else if (piece.material === 'card' && piece.id === 'wall') {
    // Parcel stack: brown card boxes tied with string.
    const top = cam.sy(y1);
    const bot = cam.sy(Math.min(...piece.pts.map((p) => p[1])));
    const rnd = mulberry32(Math.floor(x0 * 3));
    let y = top;
    ctx.lineWidth = 2;
    while (y < bot - 4) {
      const h = (0.5 + rnd() * 0.35) * k;
      ctx.strokeStyle = C.ink;
      ctx.beginPath();
      ctx.moveTo(cam.sx(x0), y + h);
      ctx.lineTo(cam.sx(x1), y + h);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(216,93,68,0.7)';
      ctx.beginPath();
      const cx = cam.sx(x0) + (x1 - x0) * k * (0.35 + rnd() * 0.3);
      ctx.moveTo(cx, y + 2);
      ctx.lineTo(cx, y + h - 2);
      ctx.moveTo(cam.sx(x0) + 2, y + h * 0.5);
      ctx.lineTo(cam.sx(x1) - 2, y + h * 0.5);
      ctx.stroke();
      // Address label.
      ctx.fillStyle = 'rgba(243,222,174,0.85)';
      ctx.fillRect(cx + 8, y + h * 0.18, 0.5 * k, h * 0.24);
      y += h;
    }
  } else if (piece.material === 'paper') {
    // Stacked letters: staggered sheet edges.
    ctx.strokeStyle = 'rgba(184,154,99,0.7)';
    ctx.lineWidth = 1;
    const rnd = mulberry32(x0 * 100);
    for (let y = cam.sy(y1) + 10; y < cam.sy(y1) + 260; y += 7 + rnd() * 5) {
      ctx.beginPath();
      ctx.moveTo(cam.sx(x0) - 10, y);
      ctx.lineTo(cam.sx(x1) + 10, y + (rnd() - 0.5) * 4);
      ctx.stroke();
    }
  } else if (piece.material === 'brass') {
    ctx.strokeStyle = C.brassDeep;
    ctx.lineWidth = 1;
    const a = piece.pts[0]!;
    const b = piece.pts[1]!;
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      const len = i % 10 === 0 ? 0.06 : i % 5 === 0 ? 0.045 : 0.025;
      ctx.beginPath();
      ctx.moveTo(cam.sx(x), cam.sy(y));
      ctx.lineTo(cam.sx(x - 0.3 * len), cam.sy(y + len));
      ctx.stroke();
    }
  } else if (piece.material === 'tin') {
    // Paper label band on the ink tin.
    const top = cam.sy(y1);
    ctx.fillStyle = C.paper;
    ctx.fillRect(cam.sx(x0), top + 30, (x1 - x0) * k, 46);
    ctx.fillStyle = C.ink;
    ctx.font = `700 26px ${FONT_STAMP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NIGHT INK  No.4', cam.sx((x0 + x1) / 2), top + 54);
    ctx.fillStyle = C.blue;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(cam.sx(x0 + 0.4), top + 10, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (piece.material === 'blotter') {
    ctx.fillStyle = 'rgba(24,38,56,0.18)';
    const rnd = mulberry32(x0 * 31);
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.ellipse(cam.sx(x0 + rnd() * (x1 - x0)), cam.sy(y1) + 20 + rnd() * 120, 4 + rnd() * 16, 2 + rnd() * 6, rnd(), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (piece.material === 'desk' || piece.material === 'shelf') {
    // Wood grain lines.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    const rnd = mulberry32(x0 * 17 + 3);
    for (let y = cam.sy(y1) + 14; y < cam.sy(y1) + 400; y += 16 + rnd() * 12) {
      ctx.beginPath();
      ctx.moveTo(cam.sx(x0), y);
      for (let x = cam.sx(x0); x < cam.sx(x1); x += 60) ctx.lineTo(x + 60, y + (rnd() - 0.5) * 5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawTerrain(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef, front: boolean): void {
  const ax = cam.sx(0);
  const ay = cam.sy(0);
  for (const piece of route.pieces) {
    if (!!piece.front !== front) continue;
    const xs = piece.pts.map((p) => p[0]);
    if (cam.sx(Math.max(...xs)) < -20 || cam.sx(Math.min(...xs)) > cam.W + 20) continue;
    const m = MAT[piece.material];
    const path = piecePath(cam, piece.pts);
    printed(ctx, path, m.fill, { lw: 2.2, mx: 1.6, my: 1.1 });
    detailPiece(ctx, cam, piece, path);
    grainOver(ctx, path, ax, ay, m.grain, m.fiber ? 'fiber' : 'grain');
    if (m.fiber) grainOver(ctx, path, ax, ay, 0.35, 'grain');
    // Playable edges: buff cut edge and the strongest ink outline.
    const edges = topEdges(piece.pts);
    ctx.lineCap = 'round';
    for (const [a, b] of edges) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(cam.sx(a[0]), cam.sy(a[1]));
      ctx.lineTo(cam.sx(b[0]), cam.sy(b[1]));
      ctx.stroke();
    }
    for (const [a, b] of edges) {
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cam.sx(a[0]), cam.sy(a[1]) + 2.4);
      ctx.lineTo(cam.sx(b[0]), cam.sy(b[1]) + 2.4);
      ctx.stroke();
    }
  }
  if (!front) {
    for (const d of route.drawers) {
      const x0 = cam.sx(d.x0);
      const x1 = cam.sx(d.x1);
      const y = cam.sy(d.y);
      ctx.fillStyle = C.inkDeep;
      ctx.fillRect(x0, y, x1 - x0, cam.H - y + 10);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x0, y, x1 - x0, 14);
    }
  }
}

// ------------------------------------------------------------- props

export function drawSeesaw(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef, pose: { x: number; y: number; a: number } | null): void {
  const ss = route.seesaw;
  if (!ss || !pose) return;
  const k = cam.ppm;
  // Pencil pivot: hexagonal pencil seen end-on.
  const px = cam.sx(ss.pivot[0]);
  const py = cam.sy(ss.pivot[1]);
  const pr = 0.22 * k;
  const hex: [number, number][] = [];
  for (let i = 0; i < 6; i++) hex.push([px + Math.cos((i / 6) * Math.PI * 2 + 0.5) * pr, py + pr + Math.sin((i / 6) * Math.PI * 2 + 0.5) * pr]);
  printed(ctx, polyPath(hex), C.vermilion, { lw: 2 });
  ctx.fillStyle = C.paperShade;
  ctx.beginPath();
  ctx.arc(px, py + pr, pr * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(px, py + pr, pr * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Ruler plank.
  ctx.save();
  ctx.translate(cam.sx(pose.x), cam.sy(pose.y));
  ctx.rotate(-pose.a);
  const L = ss.length * k;
  const T = ss.thickness * k;
  const plank = polyPath([
    [-L / 2, -T / 2],
    [L / 2, -T / 2],
    [L / 2, T / 2],
    [-L / 2, T / 2],
  ]);
  printed(ctx, plank, C.brass, { lw: 2.4 });
  ctx.strokeStyle = C.brassDeep;
  ctx.lineWidth = 1;
  for (let i = 0; i < ss.length * 10; i++) {
    const x = -L / 2 + i * 0.1 * k;
    const len = i % 10 === 0 ? T * 0.7 : i % 5 === 0 ? T * 0.5 : T * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, T / 2);
    ctx.lineTo(x, T / 2 - len);
    ctx.stroke();
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(-L / 2, -T / 2);
  ctx.lineTo(L / 2, -T / 2);
  ctx.stroke();
  ctx.strokeStyle = C.brassGlint;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-L / 2 + 2, -T / 2 + 2.4);
  ctx.lineTo(L / 2 - 2, -T / 2 + 2.4);
  ctx.stroke();
  ctx.restore();
}

export function drawRoller(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef, wet: boolean, spin = 0): void {
  const r = route.roller;
  if (!r) return;
  const x = cam.sx(r.x);
  const y = cam.sy(r.y);
  const R = r.r * cam.ppm;
  // Bracket: a brass fork holding the axle off the counter's lip.
  printed(ctx, polyPath([[x - 5, y], [x + 5, y], [x + 12, y + R * 2.6], [x - 12, y + R * 2.6]]), C.brassDeep, { lw: 2 });
  const body = new Path2D();
  body.arc(x, y, R, 0, Math.PI * 2);
  printed(ctx, body, C.blue, { lw: 3 });
  // Inked bands wrap the drum: they sweep round as it turns.
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = 'rgba(13,23,36,0.45)';
  ctx.lineWidth = 2;
  for (let n = 0; n < 3; n++) {
    const a = -spin + (n * Math.PI * 2) / 3;
    const c = Math.cos(a);
    if (c < -0.1) continue;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * R, y - R);
    ctx.lineTo(x + Math.sin(a) * R, y + R);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = wet ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.35, y - R * 0.35, R * 0.35, R * 0.18, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.brass;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Furniture behind the night counter: cast wall brackets that carry the board
 * (they sit on the back plane, so a cart on the shelf passes in front of them)
 * and an enamel plate on the board's front edge.
 */
export function drawCounterBack(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef): void {
  const board = route.pieces.find((p) => p.id === 'counter');
  if (!board) return;
  const xs = board.pts.map((p) => p[0]);
  const ys = board.pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yb = Math.min(...ys);
  const k = cam.ppm;
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (const bx of [x0 + 0.9, x1 - 0.9]) {
    const sx = cam.sx(bx);
    const top = cam.sy(yb);
    const drop = 0.9 * k;
    const reach = 0.7 * k;
    const g = new Path2D();
    g.moveTo(sx - 6, top);
    g.lineTo(sx + reach, top);
    g.quadraticCurveTo(sx + 8, top + drop * 0.25, sx + 4, top + drop);
    g.lineTo(sx - 6, top + drop);
    g.closePath();
    printed(ctx, g, C.inkSoft, { lw: 2, ink: C.inkDeep });
    // Pierced scroll in the bracket web.
    ctx.strokeStyle = C.petrol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx + reach * 0.3, top + drop * 0.3, drop * 0.13, 0, Math.PI * 1.6);
    ctx.stroke();
    ctx.fillStyle = C.inkDeep;
    ctx.beginPath();
    ctx.arc(sx, top + drop * 0.82, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Enamel plate on the night counter's front edge (drawn over the board). */
export function drawCounterFront(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef): void {
  const board = route.pieces.find((p) => p.id === 'counter');
  if (!board) return;
  const xs = board.pts.map((p) => p[0]);
  const ys = board.pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const yb = Math.min(...ys);
  const yt = Math.max(...ys);
  const k = cam.ppm;
  // Enamel plate on the board edge.
  const pw = 1.6 * k;
  const ph = Math.max(12, (yt - yb) * k * 0.62);
  const px = cam.sx(x0 + 1.6);
  const py = (cam.sy(yb) + cam.sy(yt)) / 2 - ph / 2 + 1;
  printed(ctx, polyPath([[px, py], [px + pw, py], [px + pw, py + ph], [px, py + ph]]), C.blue, { lw: 1.5 });
  ctx.fillStyle = C.paper;
  ctx.font = `700 ${Math.max(10, Math.round(ph * 0.8))}px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NIGHT  COUNTER', px + pw / 2, py + ph / 2 + 1);
}

/** The curled flap: a sheet hinged under the counter's end, draped to the shelf. */
export function drawFlap(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef, pose: { x: number; y: number; a: number } | null): void {
  const fl = route.flap;
  if (!fl) return;
  const p = pose ?? { x: fl.hinge[0], y: fl.hinge[1], a: 0 };
  const c = Math.cos(p.a);
  const s = Math.sin(p.a);
  const w = (q: Pt): [number, number] => [cam.sx(p.x + q[0] * c - q[1] * s), cam.sy(p.y + q[0] * s + q[1] * c)];
  // Drawn a little fuller than its collider so the sheet reads at a glance.
  const t = Math.max(fl.thickness / 2, 0.045);
  const upper: Pt[] = [];
  const lower: Pt[] = [];
  for (let i = 0; i < fl.line.length; i++) {
    const a = fl.line[Math.max(0, i - 1)]!;
    const b = fl.line[Math.min(fl.line.length - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const q = fl.line[i]!;
    upper.push([q[0] + nx * t, q[1] + ny * t]);
    lower.push([q[0] - nx * t, q[1] - ny * t]);
  }
  const outline = [...upper, ...[...lower].reverse()].map(w);
  const path = polyPath(outline);
  // A second sheet tucked under the first: the flap is a folded pair.
  ctx.save();
  ctx.translate(-3, 4);
  printed(ctx, path, C.paperShade, { lw: 1.6 });
  ctx.restore();
  printed(ctx, path, C.paper, { lw: 2 });
  // Fold creases across the sheet.
  ctx.strokeStyle = 'rgba(184,154,99,0.8)';
  ctx.lineWidth = 1;
  for (const i of [3, 6, 9]) {
    const [ux, uy] = w(upper[i]!);
    const [lx, ly] = w(lower[i]!);
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(lx, ly);
    ctx.stroke();
  }
  // Playable top edge: the strong ink line.
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  upper.map(w).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  // The curl at the free edge.
  const tip = fl.line[fl.line.length - 1]!;
  const [tx, ty] = w([tip[0] + 0.02, tip[1] + 0.07]);
  const curl = new Path2D();
  curl.arc(tx, ty, 0.07 * cam.ppm, Math.PI * 0.6, Math.PI * 2.3);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.stroke(curl);
  // Hinge tape where it hangs from the board.
  const [hx, hy] = w([0, 0]);
  ctx.fillStyle = C.paperShade;
  ctx.fillRect(hx - 10, hy - 3, 20, 9);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(hx - 10, hy - 3, 20, 9);
}

// --------------------------------------------------- receiving window

export interface WindowState {
  /** 0 dark → 1 fully lit. */
  lit: number;
  /** wick caught (0..1) */
  wick: number;
  clerk: number;
  time: number;
}

/** The receiving window: a pigeonhole house front with a wick sconce and clerk. */
export function drawWindowBack(ctx: CanvasRenderingContext2D, cam: Camera, route: RouteDef, ws: WindowState): void {
  const a = route.arch;
  const k = cam.ppm;
  const x0 = cam.sx(a.x - a.w / 2);
  const x1 = cam.sx(a.x + a.w / 2);
  const yb = cam.sy(a.y - a.h / 2);
  const yt = cam.sy(a.y + a.h / 2);
  if (x1 < -400 || x0 > cam.W + 400) return;
  const w = x1 - x0;
  // House front: post, gable roof, number plate.
  const fx0 = x0 - 0.35 * k;
  const fx1 = x1 + 0.35 * k;
  const ft = yt - 0.55 * k;
  const house = new Path2D();
  house.moveTo(fx0, yb);
  house.lineTo(fx0, yt);
  house.lineTo((fx0 + fx1) / 2, ft - 0.35 * k);
  house.lineTo(fx1, yt);
  house.lineTo(fx1, yb);
  house.closePath();
  printed(ctx, house, C.petrol, { lw: 3, mx: 1.6, my: 1 });
  grainOver(ctx, house, cam.sx(0), cam.sy(0), 0.9);
  // Interior.
  const arch = new Path2D();
  arch.moveTo(x0, yb);
  arch.lineTo(x0, yt + w / 2);
  arch.arc((x0 + x1) / 2, yt + w / 2, w / 2, Math.PI, 0);
  arch.lineTo(x1, yb);
  arch.closePath();
  ctx.fillStyle = '#0a121c';
  ctx.fill(arch);
  if (ws.lit > 0) {
    ctx.save();
    ctx.clip(arch);
    ctx.globalAlpha = ws.lit;
    const glow = ctx.createRadialGradient(x1 - w * 0.25, yb - 0.9 * k, 4, x1 - w * 0.25, yb - 0.9 * k, w * 1.1);
    glow.addColorStop(0, C.honeyHot);
    glow.addColorStop(0.35, C.honey);
    glow.addColorStop(1, '#c98b3a');
    ctx.fillStyle = glow;
    ctx.fill(arch);
    ctx.restore();
  }
  // Clerk silhouette behind the counter.
  if (ws.clerk > 0) {
    ctx.save();
    ctx.clip(arch);
    ctx.globalAlpha = Math.min(1, ws.clerk);
    ctx.translate(x0 + w * 0.32, yb - 0.38 * k + (1 - ws.clerk) * 18);
    drawMoth(ctx, { k: k * 0.9, pose: 'clerk', time: ws.time, silhouette: true });
    ctx.restore();
  }
  // Counter ledge.
  ctx.fillStyle = C.inkSoft;
  ctx.fillRect(x0, yb - 0.38 * k, w, 0.1 * k);
  // Receiving wick sconce on the far post.
  const sx = x1 - w * 0.22;
  const sy = yb - 1.0 * k;
  printed(ctx, polyPath([[sx - 7, sy + 10], [sx + 7, sy + 10], [sx + 4, sy + 2], [sx - 4, sy + 2]]), C.brass, { lw: 1.6 });
  if (ws.wick > 0) {
    const fh = 16 * ws.wick;
    ctx.fillStyle = C.honey;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 2);
    ctx.quadraticCurveTo(sx - 5, sy - fh * 0.4, sx, sy - fh);
    ctx.quadraticCurveTo(sx + 5, sy - fh * 0.4, sx, sy + 2);
    ctx.fill();
  } else {
    ctx.fillStyle = C.ink;
    ctx.fillRect(sx - 1, sy - 3, 2, 5);
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 3;
  ctx.stroke(arch);
  // Brass number plate with the job's window number.
  const plateX = (fx0 + fx1) / 2;
  const plateY = yt - 0.18 * k;
  printed(ctx, polyPath([[plateX - 18, plateY - 10], [plateX + 18, plateY - 10], [plateX + 18, plateY + 10], [plateX - 18, plateY + 10]]), C.brass, { lw: 1.6 });
  ctx.fillStyle = C.ink;
  ctx.font = `700 16px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(route.index + 1).padStart(2, '0'), plateX, plateY + 1);
  // Light spilling onto the desk in front of a lit window.
  if (ws.lit > 0 && FX.glow) {
    ctx.save();
    ctx.globalAlpha = ws.lit * 0.5;
    const pool = ctx.createRadialGradient((x0 + x1) / 2, yb, 2, (x0 + x1) / 2, yb, w * 1.6);
    pool.addColorStop(0, 'rgba(255,209,108,0.55)');
    pool.addColorStop(1, 'rgba(255,209,108,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(x0 - w * 1.6, yb - w * 1.6, w * 4.2, w * 1.9);
    ctx.restore();
  }
}

// ---------------------------------------------------------- bench clamp

export interface ClampState {
  /** 0 closed → 1 open */
  open: number;
  /** Where the foot presses on the chassis top (screen). */
  padX: number;
  padY: number;
  /** The post's foot (screen). */
  postX: number;
  groundY: number;
}

/**
 * Hold-down clamp bolted to the bench: a brass post, a sprung vermilion arm on a
 * visible hinge pin, and a rubber foot pressing on the chassis. Opening swings
 * the arm up about the pin.
 */
export function drawClamp(ctx: CanvasRenderingContext2D, k: number, s: ClampState): void {
  const u = k / 100;
  const hx = s.postX;
  const hy = s.groundY - 1.28 * k;
  // Base plate with two bolts.
  const base = polyPath([[hx - 24 * u, s.groundY], [hx + 24 * u, s.groundY], [hx + 20 * u, s.groundY - 8 * u], [hx - 20 * u, s.groundY - 8 * u]]);
  printed(ctx, base, C.brassDeep, { lw: 2 });
  ctx.fillStyle = C.ink;
  for (const dx of [-14, 14]) {
    ctx.beginPath();
    ctx.arc(hx + dx * u, s.groundY - 4 * u, 2.4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  // Post with two turned collars.
  const post = polyPath([[hx - 7 * u, s.groundY - 7 * u], [hx + 7 * u, s.groundY - 7 * u], [hx + 6 * u, hy], [hx - 6 * u, hy]]);
  printed(ctx, post, C.brass, { lw: 2 });
  ctx.fillStyle = 'rgba(255,243,207,0.45)';
  ctx.fillRect(hx - 4 * u, hy + 10 * u, 2.5 * u, s.groundY - hy - 22 * u);
  for (const t of [0.3, 0.72]) {
    const y = s.groundY - (s.groundY - hy) * t;
    printed(ctx, polyPath([[hx - 10 * u, y - 4 * u], [hx + 10 * u, y - 4 * u], [hx + 10 * u, y + 4 * u], [hx - 10 * u, y + 4 * u]]), C.brassDeep, { lw: 1.6 });
  }
  // Arm: aimed so the foot lands on the pad; opening swings it up about the pin.
  const foot = 16 * u;
  const tx = s.padX;
  const ty = s.padY - foot;
  const closedAng = Math.atan2(ty - hy, tx - hx);
  const ang = closedAng - s.open * 1.15;
  const len = Math.hypot(tx - hx, ty - hy);
  // Tension spring from the post to the arm (drawn before the arm).
  const sp0x = hx + 4 * u;
  const sp0y = hy + 0.42 * k;
  const sp1x = hx + Math.cos(ang) * len * 0.32;
  const sp1y = hy + Math.sin(ang) * len * 0.32;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.8 * u;
  ctx.beginPath();
  const coils = 9;
  for (let i = 0; i <= coils * 2; i++) {
    const t = i / (coils * 2);
    const x = sp0x + (sp1x - sp0x) * t;
    const y = sp0y + (sp1y - sp0y) * t;
    const nx = -(sp1y - sp0y);
    const ny = sp1x - sp0x;
    const nl = Math.hypot(nx, ny) || 1;
    const w = i === 0 || i === coils * 2 ? 0 : (i % 2 ? 4 : -4) * u;
    const px = x + (nx / nl) * w;
    const py = y + (ny / nl) * w;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  const arm = new Path2D();
  arm.moveTo(-10 * u, -7 * u);
  arm.lineTo(len - 6 * u, -5 * u);
  arm.quadraticCurveTo(len + 6 * u, -5 * u, len + 6 * u, 4 * u);
  arm.lineTo(len + 4 * u, 6 * u);
  arm.lineTo(-10 * u, 7 * u);
  arm.closePath();
  ctx.save();
  ctx.translate(2 * u, 4 * u);
  ctx.fillStyle = 'rgba(6,10,16,0.35)';
  ctx.fill(arm);
  ctx.restore();
  printed(ctx, arm, C.vermilion, { lw: 2.2 });
  // Worn grip and a printed highlight.
  ctx.fillStyle = 'rgba(243,222,174,0.35)';
  ctx.fillRect(len * 0.2, -3.5 * u, len * 0.5, 2 * u);
  // Foot: a short brass shank with a rubber pad, always dropping toward the frame.
  ctx.translate(len, 0);
  ctx.rotate(-ang);
  printed(ctx, polyPath([[-4 * u, -2 * u], [4 * u, -2 * u], [4 * u, foot - 5 * u], [-4 * u, foot - 5 * u]]), C.brass, { lw: 1.6 });
  printed(ctx, polyPath([[-11 * u, foot - 6 * u], [11 * u, foot - 6 * u], [10 * u, foot], [-10 * u, foot]]), C.rubber, { lw: 1.6 });
  ctx.restore();
  // Hinge pin with a thumb screw.
  printed(ctx, circlePath(hx, hy, 9 * u), C.brass, { lw: 2 });
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(hx, hy, 3 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.brassGlint;
  ctx.fillRect(hx - 5 * u, hy - 6 * u, 4 * u, 2 * u);
}

/** Hinged chock shelf in front of the front support; folds down on dispatch. */
export function drawChock(ctx: CanvasRenderingContext2D, k: number, x: number, groundY: number, fold: number): void {
  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(fold * 1.45);
  const p = polyPath([[0, 0], [0, -0.28 * k], [7, -0.28 * k], [9, 0]]);
  printed(ctx, p, C.paperShade, { lw: 2 });
  ctx.restore();
  ctx.fillStyle = C.brass;
  ctx.beginPath();
  ctx.arc(x + 2, groundY - 2, 3, 0, Math.PI * 2);
  ctx.fill();
}
