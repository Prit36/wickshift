// Painted interface pieces: the parts drawer, the dispatch lever, the route
// slip, the wind dial and the driving controls. Everything reads from state.
import { PARTS, type PartKind } from '../data/parts';
import type { RouteDef } from '../data/routeTypes';
import { mulberry32 } from '../core/geom';
import { C, FONT_STAMP, FONT_TEXT, TYPE } from '../render/palette';
import { FX, circlePath, grainOver, makeCanvas, printed, polyPath, roughRect } from '../render/paint';
import { drawPart } from '../render/partsArt';
import type { Rect } from './layout';

// ------------------------------------------------------------ helpers

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function focusRing(ctx: CanvasRenderingContext2D, r: Rect, round = 6): void {
  ctx.save();
  ctx.setLineDash([7, 4]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.paper;
  ctx.beginPath();
  ctx.roundRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, round);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(r.x - 7.5, r.y - 7.5, r.w + 15, r.h + 15, round + 2);
  ctx.stroke();
  ctx.restore();
}

/** A cut paper tag with a punched hole: hints, observations, labels. */
export function paperNote(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { maxW?: number; size?: number; leader?: [number, number] | null; seed?: number; align?: 'left' | 'center'; tone?: 'paper' | 'ink'; glyph?: string } = {},
): Rect {
  const size = opts.size ?? TYPE.hint;
  ctx.save();
  ctx.font = `600 ${size}px ${FONT_TEXT}`;
  const lines = wrapText(ctx, text, opts.maxW ?? 260);
  const glyphW = opts.glyph ? measureGlyph(ctx, opts.glyph, size) + 10 : 0;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + glyphW;
  const w = tw + 28;
  const h = lines.length * (size * 1.25) + 18;
  const rx = opts.align === 'center' ? x - w / 2 : x;
  const ry = y - h / 2;
  if (opts.leader) {
    // The tag is tied to its subject with a length of string: a slight sag,
    // buff over an ink keyline so it reads on any ground, and a loop at the end.
    const [lx, ly] = opts.leader;
    const sx = lx < rx + 9 ? rx + 9 : lx > rx + w - 9 ? rx + w - 9 : lx;
    const sy = ly < ry ? ry + 2 : ry + h - 2;
    const mx = (sx + lx) / 2;
    const my = (sy + ly) / 2 + Math.min(18, Math.hypot(lx - sx, ly - sy) * 0.12);
    const string = new Path2D();
    string.moveTo(sx, sy);
    string.quadraticCurveTo(mx, my, lx, ly);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4;
    ctx.stroke(string);
    ctx.strokeStyle = opts.tone === 'ink' ? C.paperShade : C.paper;
    ctx.lineWidth = 1.8;
    ctx.stroke(string);
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.ink;
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.paper;
    ctx.stroke();
  }
  const shape = roughRect(rx, ry, w, h, opts.seed ?? 5, 1.6);
  // Contact shadow so the note sits on the scene.
  ctx.save();
  ctx.translate(3, 4);
  ctx.fillStyle = 'rgba(8,14,22,0.45)';
  ctx.fill(shape);
  ctx.restore();
  printed(ctx, shape, opts.tone === 'ink' ? C.ink : C.paper, { lw: 1.8, ink: opts.tone === 'ink' ? C.paper : C.ink, mx: 1, my: 0.6 });
  if (opts.tone !== 'ink') grainOver(ctx, shape, rx, ry, 0.35, 'fiber');
  // Punched hole.
  ctx.fillStyle = opts.tone === 'ink' ? C.paper : C.ink;
  ctx.beginPath();
  ctx.arc(rx + 9, ry + 9, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = opts.tone === 'ink' ? C.paper : C.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let gx = rx + 16;
  if (opts.glyph) {
    drawGlyph(ctx, opts.glyph, gx, ry + 9 + size * 0.62, size, opts.tone === 'ink');
    gx += glyphW;
  }
  lines.forEach((l, i) => ctx.fillText(l, gx, ry + 9 + size * 0.62 + i * size * 1.25));
  ctx.restore();
  return { x: rx, y: ry, w, h };
}

function measureGlyph(ctx: CanvasRenderingContext2D, g: string, size: number): number {
  ctx.save();
  ctx.font = `700 ${size * 0.85}px ${FONT_STAMP}`;
  const w = Math.max(size * 1.3, ctx.measureText(g).width + 12);
  ctx.restore();
  return w;
}

/** A key-cap glyph for the active input (Space, D, →, a touch arrow). */
export function drawGlyph(ctx: CanvasRenderingContext2D, g: string, x: number, cy: number, size: number, inverse = false): void {
  ctx.save();
  ctx.font = `700 ${size * 0.85}px ${FONT_STAMP}`;
  const w = measureGlyph(ctx, g, size);
  const h = size * 1.3;
  ctx.fillStyle = inverse ? C.paper : C.ink;
  ctx.beginPath();
  ctx.roundRect(x, cy - h / 2 + 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = inverse ? C.paperShade : C.inkSoft;
  ctx.beginPath();
  ctx.roundRect(x, cy - h / 2, w, h - 2, 4);
  ctx.fill();
  ctx.fillStyle = inverse ? C.ink : C.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g, x + w / 2, cy);
  ctx.restore();
}

// ---------------------------------------------------- drawer + recesses

const silhouettes = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number; res: number }>();

/** The part's own outline as a solid shape (for the recess cut into the drawer). */
function silhouette(kind: PartKind, k: number, res: number, color = '#000'): { c: HTMLCanvasElement; ox: number; oy: number; res: number } {
  const key = `${kind}:${k}:${res}:${color}`;
  const hit = silhouettes.get(key);
  if (hit) return hit;
  const S = Math.ceil(k * 2.2);
  const c = makeCanvas(S * res, S * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  const ox = S / 2 - PARTS[kind].pick.x * k;
  const oy = S / 2 + PARTS[kind].pick.y * k;
  g.translate(ox, oy);
  drawPart(g, kind, { k, spin: kind === 'keyWheel' ? 0.4 : 0, res });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  const out = { c, ox, oy, res };
  silhouettes.set(key, out);
  return out;
}

export function trayOrigin(kind: PartKind, r: Rect, k: number): [number, number] {
  const p = PARTS[kind].pick;
  return [r.x + r.w / 2 - p.x * k, r.y + r.h / 2 + p.y * k];
}

export interface DrawerState {
  stock: Record<PartKind, number>;
  kit: Record<PartKind, number>;
  /** Retract offset 0 (open) → 1 (hidden). */
  retract: number;
  held: PartKind | null;
  selectedKind: PartKind | null;
  focus: string | null;
  hoverKind: PartKind | null;
  res: number;
  time: number;
  /** pickup lift animation per kind (0..1) */
  lift: Partial<Record<PartKind, number>>;
}

export function drawDrawer(ctx: CanvasRenderingContext2D, d: Rect, recesses: { kind: PartKind; r: Rect }[], trayK: number, st: DrawerState): void {
  const off = st.retract * (d.h + 30);
  ctx.save();
  ctx.translate(0, off);
  // Drawer box: one shallow wooden drawer with a lip and brass corners.
  const body = new Path2D();
  body.rect(d.x - 4, d.y, d.w + 8, d.h + 10);
  printed(ctx, body, C.wood, { lw: 3, mx: 0, my: 0 });
  grainOver(ctx, body, 0, d.y, 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  const rnd = mulberry32(4);
  for (let y = d.y + 12; y < d.y + d.h; y += 9 + rnd() * 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < d.w; x += 80) ctx.lineTo(x + 80, y + (rnd() - 0.5) * 3);
    ctx.stroke();
  }
  // Front lip (worn paler where hands pull it).
  ctx.fillStyle = C.woodDeep;
  ctx.fillRect(d.x, d.y, d.w, 7);
  ctx.fillStyle = C.ink;
  ctx.fillRect(d.x, d.y + 7, d.w, 2);
  ctx.fillStyle = 'rgba(243,222,174,0.12)';
  ctx.fillRect(d.w * 0.45, d.y + 1, d.w * 0.1, 4);
  for (const { kind, r } of recesses) {
    // Recess: the part's own outline cut into the wood, lined with baize.
    const cut = silhouette(kind, trayK, st.res, '#140f12');
    const felt = silhouette(kind, trayK, st.res, '#22384a');
    const S = cut.c.width / cut.res;
    const [ox, oy] = trayOrigin(kind, r, trayK);
    const left = ox - cut.ox;
    const top = oy - cut.oy;
    for (const [dx, dy] of [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5],
    ]) {
      ctx.drawImage(cut.c, left + dx, top + dy, S, S);
    }
    ctx.drawImage(felt.c, left, top + 2.5, S, S);
    // Pale lower lip where the cut meets the drawer top.
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.drawImage(silhouette(kind, trayK, st.res, '#f3deae').c, left, top + 4.5, S, S);
    ctx.globalAlpha = 1;
    ctx.drawImage(felt.c, left, top + 2.5, S, S);
    ctx.restore();
    const n = st.stock[kind];
    const visible = n > 0 && st.held !== kind ? 1 : n > 1 ? 1 : 0;
    if (visible) {
      const lift = st.lift[kind] ?? 0;
      ctx.save();
      // Contact shadow under the piece.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2 + 2, r.y + r.h - 8, r.w * 0.36, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(ox, oy - lift * 3);
      drawPart(ctx, kind, { k: trayK, spin: kind === 'keyWheel' ? 0.4 : 0, res: st.res });
      ctx.restore();
    }
    // Count, stamped beside the recess.
    ctx.save();
    ctx.font = `700 ${TYPE.count + 4}px ${FONT_STAMP}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = n > 0 ? C.paper : 'rgba(243,222,174,0.4)';
    ctx.fillText(`×${n}`, r.x + r.w + 2, r.y + r.h - 4);
    if (FX.labels) {
      ctx.font = `700 ${TYPE.count - 2}px ${FONT_STAMP}`;
      ctx.fillStyle = 'rgba(243,222,174,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(PARTS[kind].tag, r.x + r.w / 2, r.y + r.h + 13);
    }
    ctx.restore();
    if (st.focus === `tray:${kind}` || st.selectedKind === kind) focusRing(ctx, r, 10);
  }
  ctx.restore();
}

// -------------------------------------------------------- small tabs

export function drawTab(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  kind: 'undo' | 'redo' | 'scout' | 'pause' | 'back' | 'again' | 'next' | 'routes',
  label: string,
  st: { enabled: boolean; focus: boolean; pressed: boolean; hover: boolean; glyph?: string; primary?: boolean },
): void {
  ctx.save();
  const dy = st.pressed ? 2 : st.hover && st.enabled ? -1 : 0;
  ctx.translate(0, dy);
  ctx.globalAlpha = st.enabled ? 1 : 0.4;
  const big = kind === 'back' || kind === 'again' || kind === 'next' || kind === 'routes';
  if (big) {
    // Edge tab: a paper tag pinned at the screen edge, with a key-cap glyph.
    const shape = roughRect(r.x, r.y, r.w, r.h, r.y | 0, 1.3);
    ctx.save();
    ctx.translate(3, 4);
    ctx.fillStyle = 'rgba(8,14,22,0.45)';
    ctx.fill(shape);
    ctx.restore();
    printed(ctx, shape, st.primary ? C.vermilion : C.paper, { lw: 2 });
    if (!st.primary) grainOver(ctx, shape, r.x, r.y, 0.4, 'fiber');
    ctx.fillStyle = st.primary ? C.paper : C.ink;
    ctx.font = `700 ${TYPE.stamp}px ${FONT_STAMP}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), r.x + 18, r.y + r.h / 2 + 1);
    if (st.glyph) drawGlyph(ctx, st.glyph, r.x + r.w - 46, r.y + r.h / 2, 18, st.primary);
    // Pin.
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.arc(r.x + r.w - 8, r.y + 8, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'pause') {
    // Paper tab hanging from a pin, with two stamped bars.
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w / 2, r.y);
    ctx.lineTo(r.x + r.w / 2, r.y + 12);
    ctx.stroke();
    const tag = new Path2D();
    tag.moveTo(r.x + 8, r.y + 14);
    tag.lineTo(r.x + r.w - 8, r.y + 14);
    tag.lineTo(r.x + r.w - 4, r.y + r.h - 12);
    tag.lineTo(r.x + r.w / 2, r.y + r.h);
    tag.lineTo(r.x + 4, r.y + r.h - 12);
    tag.closePath();
    printed(ctx, tag, C.paper, { lw: 2 });
    ctx.fillStyle = C.ink;
    ctx.fillRect(r.x + r.w / 2 - 10, r.y + 26, 7, 22);
    ctx.fillRect(r.x + r.w / 2 + 3, r.y + 26, 7, 22);
    ctx.fillStyle = C.brass;
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Brass thumb-tabs set into the drawer front.
    const plate = new Path2D();
    plate.roundRect(r.x, r.y, r.w, r.h - 16, 8);
    printed(ctx, plate, C.brass, { lw: 2 });
    ctx.fillStyle = 'rgba(255,243,207,0.6)';
    ctx.fillRect(r.x + 6, r.y + 3, r.w - 12, 2);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cx = r.x + r.w / 2;
    const cy = r.y + (r.h - 16) / 2;
    ctx.beginPath();
    if (kind === 'undo' || kind === 'redo') {
      const d = kind === 'undo' ? -1 : 1;
      ctx.arc(cx, cy + 3, 11, d < 0 ? -Math.PI * 0.95 : -Math.PI * 0.05, d < 0 ? Math.PI * 0.15 : Math.PI * 1.15, d > 0);
      ctx.stroke();
      ctx.beginPath();
      const ax = cx + d * -11;
      const ay = cy + 1;
      ctx.moveTo(ax - 5 * d, ay - 7);
      ctx.lineTo(ax, ay + 1);
      ctx.lineTo(ax + 7 * d, ay - 4);
      ctx.stroke();
    } else {
      // Spyglass.
      ctx.moveTo(cx - 14, cy + 7);
      ctx.lineTo(cx + 8, cy - 5);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 3);
      ctx.lineTo(cx + 14, cy - 9);
      ctx.stroke();
      ctx.fillStyle = C.teal;
      ctx.beginPath();
      ctx.arc(cx + 15, cy - 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.paper;
    ctx.font = `700 ${TYPE.count - 1}px ${FONT_STAMP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label.toUpperCase(), cx, r.y + r.h - 1);
  }
  ctx.restore();
  if (st.focus) focusRing(ctx, r, 8);
}

// ------------------------------------------------------ dispatch lever

export interface LeverState {
  locked: boolean;
  missing: string | null;
  /** 0 rest → 1 pulled */
  pull: number;
  focus: boolean;
  hover: boolean;
  retract: number;
  /** brief rattle when pressed while locked */
  rattle: number;
  /** small glint when it comes free */
  free: number;
}

export function drawLever(ctx: CanvasRenderingContext2D, r: Rect, st: LeverState): void {
  ctx.save();
  ctx.translate(0, st.retract * 200);
  const px = r.x + r.w * 0.55;
  const py = r.y + r.h - 58;
  // Quadrant slot plate.
  const plate = new Path2D();
  plate.moveTo(px - 46, py + 22);
  plate.lineTo(px - 50, py - 6);
  plate.arc(px, py, 50, Math.PI, Math.PI * 1.75);
  plate.lineTo(px + 40, py + 22);
  plate.closePath();
  printed(ctx, plate, C.brass, { lw: 2.2 });
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(px, py, 38, Math.PI * 1.1, Math.PI * 1.65);
  ctx.stroke();
  // Lever arm rotates about its visible pivot.
  const rest = -0.42;
  const pulled = 0.62;
  const rattle = st.rattle > 0 ? Math.sin(st.rattle * 40) * 0.05 * st.rattle : 0;
  const ang = rest + (pulled - rest) * st.pull + rattle;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  const arm = new Path2D();
  arm.moveTo(-6, 0);
  arm.lineTo(-4.5, -112);
  arm.lineTo(4.5, -112);
  arm.lineTo(6, 0);
  arm.closePath();
  printed(ctx, arm, C.vermilion, { lw: 2.2 });
  ctx.fillStyle = 'rgba(243,222,174,0.35)';
  ctx.fillRect(-2.5, -104, 2, 90);
  // Knob ball, worn where it is gripped.
  const knob = circlePath(0, -122, 15);
  printed(ctx, knob, C.vermilion, { lw: 2.4 });
  ctx.fillStyle = 'rgba(243,222,174,0.45)';
  ctx.beginPath();
  ctx.ellipse(-5, -127, 5, 3.5, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Pivot boss.
  printed(ctx, circlePath(px, py, 12), C.brass, { lw: 2.2 });
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  if (st.locked) {
    // Locking pin through the quadrant, with a tag naming the missing part.
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rest + 0.18);
    ctx.fillStyle = C.ink;
    ctx.fillRect(-20, -66, 40, 6);
    ctx.fillStyle = C.brassGlint;
    ctx.fillRect(-20, -66, 40, 2);
    ctx.restore();
  } else if (st.free > 0) {
    ctx.save();
    ctx.globalAlpha = st.free;
    ctx.fillStyle = C.brassGlint;
    ctx.translate(px - 32, py - 92);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(2, -2);
    ctx.lineTo(9, 0);
    ctx.lineTo(2, 2);
    ctx.lineTo(0, 9);
    ctx.lineTo(-2, 2);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-2, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Stamped plate.
  const lab = new Path2D();
  lab.rect(px - 44, py + 22, 86, 22);
  printed(ctx, lab, C.ink, { lw: 1.5, ink: C.brass });
  ctx.fillStyle = st.locked ? 'rgba(243,222,174,0.55)' : C.paper;
  ctx.font = `700 ${TYPE.tag + 2}px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DISPATCH', px - 1, py + 34);
  ctx.restore();
  if (st.focus) focusRing(ctx, { x: r.x, y: r.y + st.retract * 200, w: r.w, h: r.h }, 12);
}

// ------------------------------------------------------------- slip

export interface SlipState {
  delivered: boolean;
  mark: boolean;
  /** stamp animation 0..1 (1 = settled) */
  stamp: number;
  markStamp: number;
  /** wet blue stripe stamped (Night Counter) */
  blue: boolean;
  outstanding: boolean;
}

/** Route slip, top left: job, side profile traced from the course, optional mark. */
export function drawSlip(ctx: CanvasRenderingContext2D, r: Rect, route: RouteDef, st: SlipState, focus: boolean): void {
  ctx.save();
  const shape = roughRect(r.x, r.y, r.w, r.h, 77, 1.2);
  ctx.save();
  ctx.translate(3, 5);
  ctx.fillStyle = 'rgba(6,10,16,0.5)';
  ctx.fill(shape);
  ctx.restore();
  printed(ctx, shape, C.paper, { lw: 2 });
  grainOver(ctx, shape, r.x, r.y, 0.5, 'fiber');
  // Header band.
  ctx.fillStyle = C.ink;
  ctx.fillRect(r.x + 10, r.y + 10, r.w - 20, 26);
  ctx.fillStyle = C.paper;
  ctx.font = `700 ${TYPE.stamp - 2}px ${FONT_STAMP}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`JOB ${route.index + 1}  ·  ${route.name.toUpperCase()}`, r.x + 18, r.y + 24);
  // Tiny side profile traced from the actual course.
  // A shorter slip (compact screens) keeps the text whole by trimming the profile.
  const tight = r.h < 134;
  const prof = { x: r.x + 14, y: r.y + 44, w: r.w - 28, h: tight ? 28 : 40 };
  drawProfile(ctx, route, prof);
  // Optional mark condition with its cancellation box.
  const nameY = prof.y + prof.h + 14;
  ctx.fillStyle = C.ink;
  ctx.font = `700 ${TYPE.count}px ${FONT_STAMP}`;
  ctx.fillText(route.mark.name.toUpperCase(), r.x + 14, nameY);
  ctx.font = `400 ${TYPE.count - 1}px ${FONT_TEXT}`;
  ctx.fillStyle = C.inkSoft;
  const cond = wrapText(ctx, route.mark.condition, r.w - 92);
  const room = Math.max(1, Math.floor((r.y + r.h - 8 - (nameY + 16)) / 14) + 1);
  const shown = cond.slice(0, room);
  if (cond.length > room) shown[room - 1] = `${shown[room - 1]!.replace(/[ ,.]+$/, '')}…`;
  shown.forEach((l, i) => ctx.fillText(l, r.x + 14, nameY + 16 + i * 14));
  const bx = r.x + r.w - 64;
  const by = nameY - 10;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = C.inkSoft;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(bx, by, 50, 40);
  ctx.setLineDash([]);
  if (st.mark || st.markStamp > 0) drawMarkStamp(ctx, bx + 25, by + 20, route.mark.id, st.mark ? Math.max(st.markStamp, st.mark ? 1 : 0) : st.markStamp);
  if (st.blue) {
    ctx.fillStyle = C.blue;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(r.x + 14, nameY - 10, 40, 5);
    ctx.globalAlpha = 1;
  }
  if (st.delivered || st.stamp > 0) drawDeliveredStamp(ctx, r.x + r.w * 0.52, r.y + 66, st.delivered && st.stamp === 0 ? 1 : st.stamp);
  ctx.restore();
  if (focus) focusRing(ctx, r);
}

export function drawProfile(ctx: CanvasRenderingContext2D, route: RouteDef, box: Rect, color: string = C.ink): void {
  const b = route.bounds;
  // Trace the top silhouette: for each column, the highest surface below the sky.
  const cols = 80;
  const top: number[] = [];
  const under: (number | null)[] = [];
  for (let i = 0; i <= cols; i++) {
    const x = b.x0 + ((b.x1 - b.x0) * i) / cols;
    let best = -Infinity;
    for (const p of route.pieces) {
      if (p.noProfile || p.material === 'desk') continue;
      const pts = p.pts;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j]!;
        const c = pts[(j + 1) % pts.length]!;
        const lo = Math.min(a[0], c[0]);
        const hi = Math.max(a[0], c[0]);
        if (x < lo || x > hi || hi - lo < 1e-6) continue;
        const y = a[1] + ((c[1] - a[1]) * (x - a[0])) / (c[0] - a[0]);
        if (y > best) best = y;
      }
    }
    if (route.seesaw) {
      const ss = route.seesaw;
      const half = ss.length / 2;
      const cx = ss.pivot[0] + Math.cos(ss.angle0) * ss.offset;
      if (Math.abs(x - cx) < half * Math.cos(ss.angle0)) best = Math.max(best, ss.pivot[1] + Math.tan(ss.angle0) * (x - ss.pivot[0]));
    }
    if (route.flap) {
      const fl = route.flap;
      for (let j = 0; j + 1 < fl.line.length; j++) {
        const a = fl.line[j]!;
        const c = fl.line[j + 1]!;
        const ax = fl.hinge[0] + a[0];
        const cx = fl.hinge[0] + c[0];
        if (x >= ax && x <= cx) best = Math.max(best, fl.hinge[1] + a[1] + ((c[1] - a[1]) * (x - ax)) / (cx - ax));
      }
    }
    top.push(best === -Infinity ? b.y0 : best);
    // The way underneath: the highest walkable surface a cart's height below the top.
    let below = -Infinity;
    for (const p of route.pieces) {
      if (p.noProfile || p.material === 'desk') continue;
      const pts = p.pts;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j]!;
        const c = pts[(j + 1) % pts.length]!;
        if (c[0] >= a[0]) continue; // top-facing edges run right to left
        if (x < c[0] || x > a[0]) continue;
        const y = a[1] + ((c[1] - a[1]) * (x - a[0])) / (c[0] - a[0]);
        if (y < best - 1.2 && y > below) below = y;
      }
    }
    under.push(below === -Infinity ? null : below);
  }
  const ys = top;
  const lo = Math.min(...ys) - 0.4;
  const hi = Math.max(...ys) + 0.6;
  const sx = (i: number) => box.x + (box.w * i) / cols;
  const sy = (y: number) => box.y + box.h - ((y - lo) / (hi - lo)) * box.h;
  ctx.save();
  ctx.beginPath();
  ys.forEach((y, i) => (i ? ctx.lineTo(sx(i), sy(y)) : ctx.moveTo(sx(i), sy(y))));
  ctx.lineTo(sx(cols), box.y + box.h);
  ctx.lineTo(sx(0), box.y + box.h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(53,85,104,0.22)';
  ctx.fill();
  ctx.beginPath();
  ys.forEach((y, i) => (i ? ctx.lineTo(sx(i), sy(y)) : ctx.moveTo(sx(i), sy(y))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Second way: dashed under the first, with the ruler drawn dipped.
  if (under.some((u) => u !== null)) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let pen = false;
    under.forEach((u, i) => {
      if (u === null) {
        pen = false;
        return;
      }
      if (pen) ctx.lineTo(sx(i), sy(u));
      else ctx.moveTo(sx(i), sy(u));
      pen = true;
    });
    ctx.stroke();
    if (route.seesaw) {
      const ss = route.seesaw;
      const far = ss.length / 2 + ss.offset;
      const toI = (x: number) => ((x - b.x0) / (b.x1 - b.x0)) * cols;
      ctx.beginPath();
      ctx.moveTo(sx(toI(ss.pivot[0])), sy(ss.pivot[1]));
      ctx.lineTo(sx(toI(ss.pivot[0] + Math.cos(ss.lowerAngle) * far)), sy(ss.pivot[1] + Math.sin(ss.lowerAngle) * far));
      ctx.stroke();
    }
    ctx.restore();
  }
  if (route.roller) {
    ctx.fillStyle = C.blue;
    const i = ((route.roller.x - b.x0) / (b.x1 - b.x0)) * cols;
    ctx.beginPath();
    ctx.arc(sx(i), sy(route.roller.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Start tick and the window arch.
  const si = ((route.start.x - b.x0) / (b.x1 - b.x0)) * cols;
  ctx.fillStyle = C.vermilion;
  ctx.fillRect(sx(si) - 1.5, sy(route.start.groundY) - 9, 3, 9);
  const wi = ((route.arch.x - b.x0) / (b.x1 - b.x0)) * cols;
  const wy = sy(route.arch.y - route.arch.h / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sx(wi) - 5, wy);
  ctx.lineTo(sx(wi) - 5, wy - 9);
  ctx.arc(sx(wi), wy - 9, 5, Math.PI, 0);
  ctx.lineTo(sx(wi) + 5, wy);
  ctx.stroke();
  ctx.restore();
}

/** Postal cancellation: a ring stamp with wavy bars, in vermilion ink. */
export function drawDeliveredStamp(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t <= 0) return;
  ctx.save();
  // Thump: comes down from a little larger, lands, and ink settles.
  const land = Math.min(1, t * 1.6);
  const scale = 1 + (1 - land) * 0.6;
  ctx.translate(x, y);
  ctx.rotate(-0.18);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, land * 1.2) * 0.86;
  ctx.strokeStyle = C.vermilion;
  ctx.fillStyle = C.vermilion;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `700 12px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DELIVERED', 0, -5);
  ctx.font = `700 10px ${FONT_STAMP}`;
  ctx.fillText('NIGHT SHIFT', 0, 8);
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    for (let j = 0; j <= 10; j++) {
      const xx = 30 + j * 5;
      const yy = -10 + i * 9 + Math.sin(j * 1.2) * 2;
      j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Each optional mark has its own small cancellation. */
export function drawMarkStamp(ctx: CanvasRenderingContext2D, x: number, y: number, id: string, t: number): void {
  if (t <= 0) return;
  ctx.save();
  const land = Math.min(1, t * 1.6);
  ctx.translate(x, y);
  ctx.rotate(0.12);
  ctx.scale(1 + (1 - land) * 0.5, 1 + (1 - land) * 0.5);
  ctx.globalAlpha = land * 0.9;
  const col = id === 'blue' ? C.blue : C.ink;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (id === 'wind') {
    // A winding key in a circle.
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-6, -2, 5, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -2, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1.5, 2, 3, 10);
  } else if (id === 'short') {
    // A short ruler in a square.
    ctx.strokeRect(-16, -14, 32, 28);
    ctx.fillRect(-11, -3, 22, 6);
    for (let i = -9; i <= 9; i += 4.5) ctx.fillRect(i, 3, 1, 4);
  } else if (id === 'clear') {
    // An uncracked chimney in a diamond.
    ctx.moveTo(0, -18);
    ctx.lineTo(18, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(-18, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 8);
    ctx.quadraticCurveTo(-9, -2, -4, -9);
    ctx.lineTo(4, -9);
    ctx.quadraticCurveTo(9, -2, 5, 8);
    ctx.closePath();
    ctx.stroke();
  } else {
    // Blue post: the roller stripe through a ring.
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-14, 4);
    ctx.lineTo(14, -4);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------ run HUD

export function drawDial(ctx: CanvasRenderingContext2D, r: Rect, wind: number, show: number, time: number, running: boolean): void {
  if (show <= 0) return;
  ctx.save();
  ctx.translate(0, (1 - show) * 160);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = r.w / 2;
  printed(ctx, circlePath(cx, cy, R), C.brass, { lw: 2.5 });
  const face = circlePath(cx, cy, R - 9);
  printed(ctx, face, C.paper, { lw: 1.6 });
  grainOver(ctx, face, cx, cy, 0.5, 'fiber');
  // Spring spiral printed on the face, wound as tight as the wind left.
  ctx.strokeStyle = 'rgba(53,85,104,0.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const turns = 2 + wind * 3;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = t * turns * Math.PI * 2;
    const rr = 6 + t * (R - 26);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  // Ticks from 0 to full over 270 degrees.
  const a0 = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  ctx.strokeStyle = C.ink;
  for (let i = 0; i <= 8; i++) {
    const a = a0 + (span * i) / 8;
    ctx.lineWidth = i % 2 === 0 ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
    ctx.lineTo(cx + Math.cos(a) * (R - (i % 2 === 0 ? 22 : 18)), cy + Math.sin(a) * (R - (i % 2 === 0 ? 22 : 18)));
    ctx.stroke();
  }
  // Quarter mark (Wind in hand threshold) as a small vermilion notch.
  const aq = a0 + span * 0.25;
  ctx.strokeStyle = C.vermilion;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(aq) * (R - 10), cy + Math.sin(aq) * (R - 10));
  ctx.lineTo(cx + Math.cos(aq) * (R - 20), cy + Math.sin(aq) * (R - 20));
  ctx.stroke();
  // Needle.
  const jitter = running && !FX.reducedMotion ? Math.sin(time * 60) * 0.004 : 0;
  const an = a0 + span * wind + jitter;
  ctx.strokeStyle = C.vermilion;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(an) * 8, cy - Math.sin(an) * 8);
  ctx.lineTo(cx + Math.cos(an) * (R - 20), cy + Math.sin(an) * (R - 20));
  ctx.stroke();
  printed(ctx, circlePath(cx, cy, 5), C.ink, { lw: 1, mx: 0, my: 0 });
  // Steady-width readout.
  ctx.fillStyle = C.ink;
  ctx.font = `700 ${TYPE.stamp}px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${String(Math.round(wind * 100)).padStart(3, ' ')}%`, cx, cy + R * 0.48);
  ctx.font = `700 ${TYPE.count - 2}px ${FONT_STAMP}`;
  ctx.fillStyle = C.inkSoft;
  ctx.fillText('WIND', cx, cy - R * 0.42);
  ctx.restore();
}

export interface DriveState {
  on: boolean;
  focus: boolean;
  hover: boolean;
  touch: boolean;
  show: number;
  hint: boolean;
  wind: number;
}

/** Drive lever: latches for the mouse, holds for touch; its position shows the state. */
export function drawDrive(ctx: CanvasRenderingContext2D, r: Rect, st: DriveState): void {
  if (st.show <= 0) return;
  ctx.save();
  ctx.translate((1 - st.show) * 200, 0);
  // Gate plate: a slot with ON at the top and OFF at the bottom, the handle shows which.
  const px = r.x + r.w * 0.12;
  const pw = r.w * 0.76;
  const plate = new Path2D();
  plate.roundRect(px, r.y + 6, pw, r.h - 34, 10);
  printed(ctx, plate, C.ink, { lw: 2, ink: C.brass });
  grainOver(ctx, plate, r.x, r.y, 0.6);
  const slotX = px + pw * 0.34;
  const topY = r.y + 34;
  const botY = r.y + r.h - 62;
  ctx.fillStyle = C.inkDeep;
  ctx.beginPath();
  ctx.roundRect(slotX - 5, topY - 8, 10, botY - topY + 16, 5);
  ctx.fill();
  ctx.font = `700 ${TYPE.stamp - 2}px ${FONT_STAMP}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = st.on ? C.paper : 'rgba(243,222,174,0.35)';
  ctx.fillText('ON', slotX + 24, topY + 1);
  ctx.fillStyle = !st.on ? C.paper : 'rgba(243,222,174,0.35)';
  ctx.fillText('OFF', slotX + 24, botY + 1);
  // Handle rides in the slot.
  const hy = st.on ? topY : botY;
  const handle = new Path2D();
  handle.roundRect(slotX - 20, hy - 13, 40, 26, 8);
  printed(ctx, handle, C.vermilion, { lw: 2.2 });
  ctx.fillStyle = 'rgba(243,222,174,0.4)';
  ctx.fillRect(slotX - 12, hy - 9, 24, 3);
  ctx.fillStyle = C.paper;
  ctx.font = `700 ${TYPE.tag}px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.fillText(st.touch ? 'HOLD · DRIVE' : 'DRIVE', r.x + r.w / 2, r.y + r.h - 12);
  ctx.restore();
  if (st.focus) focusRing(ctx, r, 12);
}

export function drawLampControls(ctx: CanvasRenderingContext2D, back: Rect, fwd: Rect, st: { back: boolean; fwd: boolean; show: number; focusBack: boolean; focusFwd: boolean }): void {
  if (st.show <= 0) return;
  ctx.save();
  ctx.translate(0, (1 - st.show) * 160);
  // A thumbwheel split in two halves: roll back or roll forward.
  const one = (r: Rect, dir: -1 | 1, held: boolean) => {
    const shape = new Path2D();
    shape.roundRect(r.x, r.y + (held ? 2 : 0), r.w, r.h - 22, 12);
    printed(ctx, shape, held ? C.brassDeep : C.brass, { lw: 2.2 });
    // Ribs of the thumbwheel.
    ctx.strokeStyle = 'rgba(24,38,56,0.55)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const x = r.x + (r.w * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, r.y + 8 + (held ? 2 : 0));
      ctx.lineTo(x, r.y + r.h - 30 + (held ? 2 : 0));
      ctx.stroke();
    }
    // Lamp arrow.
    const cx = r.x + r.w / 2;
    const cy = r.y + (r.h - 22) / 2 + (held ? 2 : 0);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(cx + dir * 16, cy);
    ctx.lineTo(cx - dir * 8, cy - 14);
    ctx.lineTo(cx - dir * 8, cy + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.font = `700 ${TYPE.count - 1}px ${FONT_STAMP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(dir < 0 ? 'LAMP BACK' : 'LAMP FWD', cx, r.y + r.h - 4);
  };
  one(back, -1, st.back);
  one(fwd, 1, st.fwd);
  ctx.restore();
  if (st.focusBack) focusRing(ctx, back, 12);
  if (st.focusFwd) focusRing(ctx, fwd, 12);
}

/** Chalk tick at a real impact location. */
export function drawChalkTick(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = C.chalk;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 4);
  ctx.lineTo(x - 2, y + 3);
  ctx.lineTo(x + 9, y - 10);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 2);
  ctx.lineTo(x - 1, y + 5);
  ctx.lineTo(x + 10, y - 8);
  ctx.stroke();
  ctx.restore();
}

/** Plumb mark below the rail: solid for the rig, hollow for a proposed rig. */
export function drawPlumb(ctx: CanvasRenderingContext2D, x: number, y: number, hollow: boolean): void {
  ctx.save();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);
  const bob = new Path2D();
  bob.moveTo(x, y + 12);
  bob.lineTo(x - 6, y + 2);
  bob.quadraticCurveTo(x, y - 3, x + 6, y + 2);
  bob.closePath();
  if (hollow) {
    ctx.fillStyle = C.ink;
    ctx.fill(bob);
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 2;
    ctx.stroke(bob);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(x, y + 4, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = C.paper;
    ctx.fill(bob);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.stroke(bob);
  }
  ctx.restore();
}

export { polyPath };
