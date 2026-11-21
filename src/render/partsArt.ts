// One drawing per part, used in the drawer recess, under the pointer and on the
// running cart. Local frame: metres, x right, y up; origin = attachment point.
import { CHASSIS, FORK_CARRIER, FORK_TRAVEL, LAMP, PARTS, SPAR_LENGTH, type PartKind } from '../data/parts';
import { C } from './palette';
import { FX, circlePath, grainOver, makeCanvas, printed, polyPath } from './paint';

export interface PartLook {
  /** Pixels per metre. */
  k: number;
  /** Wheel spin angle (radians, y-up convention). */
  spin?: number;
  /** Fork compression 0..1. */
  compress?: number;
  ghost?: boolean;
  /** Wet blue roller stripe. */
  stripe?: boolean;
  selected?: boolean;
  /** Device-pixel ratio of the current backing store (for cached sprites). */
  res?: number;
}

const sprites = new Map<string, { c: HTMLCanvasElement; half: number; res: number }>();

/** Cached rotating face of a wheel (flanges, spokes, key, thread notch). */
function wheelFace(kind: 'keyWheel' | 'reel', k: number, res: number): { c: HTMLCanvasElement; half: number; res: number } {
  const key = `${kind}:${k.toFixed(2)}:${res.toFixed(2)}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const r = PARTS[kind].radius! * k;
  const half = Math.ceil(r * 1.35 + 6);
  const c = makeCanvas(half * 2 * res, half * 2 * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  g.translate(half, half);
  if (kind === 'keyWheel') drawKeyWheelFace(g, r);
  else drawReelFace(g, r);
  const s = { c, half, res };
  if (sprites.size > 40) sprites.clear();
  sprites.set(key, s);
  return s;
}

function drawKeyWheelFace(g: CanvasRenderingContext2D, r: number): void {
  // Rubber tyre with a soft dark edge.
  const tyre = circlePath(0, 0, r);
  g.fillStyle = C.rubber;
  g.fill(tyre);
  const soft = g.createRadialGradient(0, 0, r * 0.7, 0, 0, r);
  soft.addColorStop(0, 'rgba(60,72,92,0.0)');
  soft.addColorStop(0.82, 'rgba(70,84,104,0.55)');
  soft.addColorStop(1, 'rgba(8,12,20,0.9)');
  g.fillStyle = soft;
  g.fill(tyre);
  // Tread notches so the spin reads.
  g.strokeStyle = 'rgba(243,222,174,0.28)';
  g.lineWidth = Math.max(1, r * 0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    g.lineTo(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99);
    g.stroke();
  }
  // Brass rim and spokes.
  const rim = circlePath(0, 0, r * 0.72);
  printed(g, rim, C.brass, { lw: Math.max(1.2, r * 0.05), mx: 0.8, my: 0.5 });
  const inner = circlePath(0, 0, r * 0.6);
  g.fillStyle = C.ink;
  g.fill(inner);
  g.strokeStyle = C.brass;
  g.lineWidth = Math.max(1.6, r * 0.1);
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    g.stroke();
  }
  // Butterfly winding key: two vermilion lobes on a stem, projecting past the tyre.
  const L = r * 1.22;
  const w = r * 0.46;
  const key = new Path2D();
  key.moveTo(0, -r * 0.08);
  key.bezierCurveTo(L * 0.35, -w * 1.25, L * 0.98, -w * 1.1, L, -w * 0.12);
  key.lineTo(L, w * 0.12);
  key.bezierCurveTo(L * 0.98, w * 1.1, L * 0.35, w * 1.25, 0, r * 0.08);
  key.closePath();
  const key2 = new Path2D();
  key2.moveTo(0, -r * 0.08);
  key2.bezierCurveTo(-L * 0.35, -w * 1.25, -L * 0.98, -w * 1.1, -L, -w * 0.12);
  key2.lineTo(-L, w * 0.12);
  key2.bezierCurveTo(-L * 0.98, w * 1.1, -L * 0.35, w * 1.25, 0, r * 0.08);
  key2.closePath();
  g.save();
  g.rotate(-Math.PI / 5);
  // Only one lobe pair: a flat butterfly, offset so it reads as a key, not a propeller.
  g.translate(r * 0.05, 0);
  const both = new Path2D();
  both.addPath(key);
  both.addPath(key2);
  printed(g, both, C.vermilion, { lw: Math.max(1.4, r * 0.07), mx: 1, my: 0.8 });
  // Pierced finger holes.
  g.fillStyle = C.ink;
  g.beginPath();
  g.ellipse(L * 0.62, 0, r * 0.13, r * 0.18, 0, 0, Math.PI * 2);
  g.ellipse(-L * 0.62, 0, r * 0.13, r * 0.18, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Hub bolt with a hard glint.
  const hub = circlePath(0, 0, r * 0.17);
  printed(g, hub, C.brass, { lw: Math.max(1, r * 0.05), mx: 0, my: 0 });
  g.fillStyle = C.brassGlint;
  g.beginPath();
  g.arc(-r * 0.05, -r * 0.05, r * 0.05, 0, Math.PI * 2);
  g.fill();
}

function drawReelFace(g: CanvasRenderingContext2D, r: number): void {
  // Back flange peeks out as a crescent: the reel has two flanges.
  const back = circlePath(r * 0.1, -r * 0.08, r * 0.97);
  printed(g, back, C.paperDeep, { lw: Math.max(1.2, r * 0.035), mx: 0, my: 0 });
  // Thread groove between the flanges (teal thread).
  const thread = circlePath(r * 0.05, -r * 0.04, r * 0.93);
  g.fillStyle = C.teal;
  g.fill(thread);
  g.strokeStyle = C.tealDeep;
  g.lineWidth = Math.max(0.8, r * 0.018);
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(r * 0.05, -r * 0.04, r * (0.88 + i * 0.008), 0.2 + i * 0.3, 1.4 + i * 0.3);
    g.stroke();
  }
  // Front flange: turned wood with inked rings.
  const face = circlePath(0, 0, r * 0.9);
  printed(g, face, C.paper, { lw: Math.max(1.4, r * 0.04), mx: 1, my: 0.6 });
  grainOver(g, face, 0, 0, 0.5, 'fiber');
  g.strokeStyle = C.paperDeep;
  g.lineWidth = Math.max(1, r * 0.022);
  for (const rr of [0.72, 0.55]) {
    g.beginPath();
    g.arc(0, 0, r * rr, 0, Math.PI * 2);
    g.stroke();
  }
  // Off-centre thread notch cut into the flange rim, with the thread tucked in.
  g.save();
  g.rotate(-0.9);
  const notch = new Path2D();
  notch.moveTo(r * 0.9, -r * 0.07);
  notch.lineTo(r * 0.68, 0);
  notch.lineTo(r * 0.9, r * 0.07);
  notch.closePath();
  g.fillStyle = C.ink;
  g.fill(notch);
  g.strokeStyle = C.teal;
  g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath();
  g.moveTo(r * 0.7, 0);
  g.quadraticCurveTo(r * 0.5, r * 0.2, r * 0.35, r * 0.12);
  g.stroke();
  g.restore();
  // Bore: the axle hole.
  const bore = circlePath(0, 0, r * 0.16);
  printed(g, bore, C.ink, { lw: Math.max(1, r * 0.03), mx: 0, my: 0 });
  g.fillStyle = C.brass;
  g.beginPath();
  g.arc(0, 0, r * 0.08, 0, Math.PI * 2);
  g.fill();
}

export function drawWheel(ctx: CanvasRenderingContext2D, kind: 'keyWheel' | 'reel', look: PartLook): void {
  const res = look.res ?? 1;
  const s = wheelFace(kind, look.k, res);
  ctx.save();
  ctx.rotate(-(look.spin ?? 0));
  if (look.ghost) ctx.globalAlpha *= 0.55;
  ctx.drawImage(s.c, -s.half, -s.half, s.half * 2, s.half * 2);
  ctx.restore();
  if (look.stripe) drawStripe(ctx, PARTS[kind].radius! * look.k, look.spin ?? 0);
}

/** Wet blue stripe from the ink roller, laid across the part that brushed it. */
function drawStripe(ctx: CanvasRenderingContext2D, r: number, spin: number): void {
  ctx.save();
  ctx.rotate(-spin);
  ctx.strokeStyle = C.blue;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(3, r * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, -0.5, 0.7);
  ctx.stroke();
  ctx.restore();
}

export function drawSpar(ctx: CanvasRenderingContext2D, look: PartLook): void {
  const k = look.k;
  const L = SPAR_LENGTH * k;
  const h = 0.09 * k;
  const body = new Path2D();
  body.moveTo(-0.05 * k, -h / 2);
  body.lineTo(L + 0.02 * k, -h / 2);
  body.quadraticCurveTo(L + 0.09 * k, 0, L + 0.02 * k, h / 2);
  body.lineTo(-0.05 * k, h / 2);
  body.quadraticCurveTo(-0.1 * k, 0, -0.05 * k, -h / 2);
  body.closePath();
  if (look.ghost) ctx.globalAlpha *= 0.6;
  printed(ctx, body, C.brass, { lw: Math.max(1.3, k * 0.018), mx: 0.9, my: 0.6 });
  // Hard glint along the upper contact face.
  ctx.strokeStyle = C.brassGlint;
  ctx.lineWidth = Math.max(1, k * 0.012);
  ctx.beginPath();
  ctx.moveTo(0.02 * k, -h / 2 + 1.5);
  ctx.lineTo(L - 0.05 * k, -h / 2 + 1.5);
  ctx.stroke();
  // Graduations.
  ctx.strokeStyle = C.brassDeep;
  ctx.lineWidth = Math.max(0.8, k * 0.008);
  for (let i = 1; i < 14; i++) {
    const x = (i / 14) * (L - 0.12 * k) + 0.04 * k;
    ctx.beginPath();
    ctx.moveTo(x, h / 2);
    ctx.lineTo(x, h / 2 - (i % 5 === 0 ? h * 0.6 : h * 0.32));
    ctx.stroke();
  }
  // Mount bolt and the pierced tip socket.
  printed(ctx, circlePath(0, 0, 0.035 * k), C.ink, { lw: 1, mx: 0, my: 0 });
  const tip = circlePath(L, 0, 0.034 * k);
  ctx.fillStyle = C.inkDeep;
  ctx.fill(tip);
  ctx.strokeStyle = C.brassGlint;
  ctx.lineWidth = 1;
  ctx.stroke(tip);
  if (look.stripe) {
    ctx.fillStyle = C.blue;
    ctx.fillRect(L * 0.45, -h / 2, 0.08 * k, h);
  }
}

/** Fork in the frame of its mount; `compress` bends the nib tine as the carrier rises. */
export function drawFork(ctx: CanvasRenderingContext2D, look: PartLook): void {
  const k = look.k;
  const c = look.compress ?? 0;
  const cx = FORK_CARRIER[0] * k;
  const cy = -(FORK_CARRIER[1] + c * FORK_TRAVEL) * k;
  if (look.ghost) ctx.globalAlpha *= 0.6;
  // Nib-steel blade: tapered, curved, with a slit and a breather hole.
  const bow = (0.09 + c * 0.1) * k;
  const nib = new Path2D();
  nib.moveTo(-0.055 * k, -0.02 * k);
  nib.bezierCurveTo(-0.06 * k + bow, cy * 0.35, cx - 0.06 * k + bow * 0.6, cy * 0.7, cx - 0.04 * k, cy);
  nib.lineTo(cx + 0.04 * k, cy);
  nib.bezierCurveTo(cx + 0.02 * k + bow * 0.6, cy * 0.7, 0.05 * k + bow, cy * 0.3, 0.055 * k, -0.02 * k);
  nib.closePath();
  printed(ctx, nib, '#9fb3b8', { lw: Math.max(1.3, k * 0.016), mx: 0.8, my: 0.6 });
  // Steel sheen and the bent tine (a second, thinner leaf that flexes more).
  ctx.strokeStyle = C.inkSoft;
  ctx.lineWidth = Math.max(1, k * 0.01);
  ctx.beginPath();
  ctx.moveTo(0, -0.06 * k);
  ctx.bezierCurveTo(bow * 0.9, cy * 0.4, cx + bow * 0.4, cy * 0.75, cx, cy - 0.02 * k);
  ctx.stroke();
  ctx.strokeStyle = C.brassGlint;
  ctx.globalAlpha *= 0.8;
  ctx.beginPath();
  ctx.moveTo(-0.03 * k, -0.04 * k);
  ctx.bezierCurveTo(-0.04 * k + bow, cy * 0.35, cx - 0.04 * k + bow * 0.6, cy * 0.7, cx - 0.025 * k, cy + 0.03 * k);
  ctx.stroke();
  ctx.globalAlpha /= 0.8;
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(bow * 0.5, cy * 0.3, 0.022 * k, 0, Math.PI * 2);
  ctx.fill();
  // Bent tine kink near the carrier: the fork's signature.
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.4, k * 0.018);
  ctx.beginPath();
  ctx.moveTo(cx + 0.035 * k, cy - 0.02 * k);
  ctx.lineTo(cx + 0.09 * k, cy - 0.06 * k);
  ctx.lineTo(cx + 0.11 * k, cy - 0.02 * k);
  ctx.stroke();
  // Mount clamp.
  printed(ctx, polyPath([[-0.07 * k, -0.035 * k], [0.07 * k, -0.035 * k], [0.06 * k, 0.04 * k], [-0.06 * k, 0.04 * k]]), C.brass, { lw: 1.2, mx: 0.5, my: 0.4 });
  printed(ctx, circlePath(0, 0, 0.024 * k), C.ink, { lw: 1, mx: 0, my: 0 });
  // Sprung carrier block.
  const car = polyPath([
    [cx - 0.07 * k, cy - 0.07 * k],
    [cx + 0.07 * k, cy - 0.07 * k],
    [cx + 0.07 * k, cy + 0.05 * k],
    [cx - 0.07 * k, cy + 0.05 * k],
  ]);
  printed(ctx, car, C.brass, { lw: Math.max(1.2, k * 0.014), mx: 0.6, my: 0.4 });
  printed(ctx, circlePath(cx, cy, 0.024 * k), C.inkDeep, { lw: 1, mx: 0, my: 0 });
  if (look.stripe) {
    ctx.fillStyle = C.blue;
    ctx.fillRect(cx - 0.07 * k, cy - 0.01 * k, 0.14 * k, 0.035 * k);
  }
}

export function drawRunner(ctx: CanvasRenderingContext2D, look: PartLook): void {
  const k = look.k;
  if (look.ghost) ctx.globalAlpha *= 0.6;
  // Strut.
  printed(ctx, polyPath([[-0.03 * k, 0.03 * k], [0.03 * k, 0.03 * k], [0.03 * k, 0.23 * k], [-0.03 * k, 0.23 * k]]), C.brass, { lw: 1.2, mx: 0.5, my: 0.3 });
  // Envelope board with a curled toe.
  const b = new Path2D();
  b.moveTo(-0.46 * k, 0.22 * k);
  b.lineTo(0.27 * k, 0.22 * k);
  b.bezierCurveTo(0.4 * k, 0.22 * k, 0.47 * k, 0.17 * k, 0.45 * k, 0.11 * k);
  b.bezierCurveTo(0.43 * k, 0.05 * k, 0.35 * k, 0.07 * k, 0.37 * k, 0.12 * k);
  b.bezierCurveTo(0.38 * k, 0.16 * k, 0.34 * k, 0.18 * k, 0.3 * k, 0.17 * k);
  // the board top turns back along the curl
  b.lineTo(0.25 * k, 0.3 * k);
  b.lineTo(-0.46 * k, 0.3 * k);
  b.closePath();
  // y down in screen: flip by drawing with negative y
  ctx.save();
  ctx.scale(1, -1);
  ctx.translate(0, 0);
  ctx.restore();
  const board = new Path2D();
  board.moveTo(-0.46 * k, 0.3 * k);
  board.lineTo(0.3 * k, 0.3 * k);
  board.bezierCurveTo(0.42 * k, 0.3 * k, 0.48 * k, 0.24 * k, 0.47 * k, 0.17 * k);
  board.bezierCurveTo(0.46 * k, 0.11 * k, 0.38 * k, 0.1 * k, 0.37 * k, 0.15 * k);
  board.bezierCurveTo(0.36 * k, 0.19 * k, 0.33 * k, 0.22 * k, 0.29 * k, 0.22 * k);
  board.lineTo(-0.46 * k, 0.22 * k);
  board.closePath();
  printed(ctx, board, C.paper, { lw: Math.max(1.3, k * 0.016), mx: 0.9, my: -0.6 });
  grainOver(ctx, board, 0, 0, 0.6, 'fiber');
  // Waxed underside: a darker sheen on the rubbing face.
  ctx.strokeStyle = C.paperDeep;
  ctx.lineWidth = Math.max(1.5, k * 0.02);
  ctx.beginPath();
  ctx.moveTo(-0.44 * k, 0.285 * k);
  ctx.lineTo(0.28 * k, 0.285 * k);
  ctx.stroke();
  // Envelope stamp-corner perforation detail.
  ctx.fillStyle = C.paperDeep;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-0.38 * k + i * 0.07 * k, 0.245 * k, Math.max(0.8, 0.008 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  printed(ctx, circlePath(0, 0, 0.024 * k), C.ink, { lw: 1, mx: 0, my: 0 });
  if (look.stripe) {
    ctx.fillStyle = C.blue;
    ctx.fillRect(-0.05 * k, 0.22 * k, 0.09 * k, 0.08 * k);
  }
}

export function drawPart(ctx: CanvasRenderingContext2D, kind: PartKind, look: PartLook): void {
  ctx.save();
  if (kind === 'keyWheel' || kind === 'reel') drawWheel(ctx, kind, look);
  else if (kind === 'spar') drawSpar(ctx, look);
  else if (kind === 'fork') drawFork(ctx, look);
  else drawRunner(ctx, look);
  ctx.restore();
}

/** Chassis plate with five socket holes and the lamp rail. Local frame, y up. */
export function drawChassis(ctx: CanvasRenderingContext2D, k: number, opts: { holes?: boolean; lampRange?: boolean } = {}): void {
  const L = CHASSIS.halfLength * k;
  const top = -CHASSIS.top * k;
  const bot = -CHASSIS.bottom * k;
  // Plate: petrol-blue enamel over a brass edge.
  const plate = new Path2D();
  plate.moveTo(-L, top + 4);
  plate.quadraticCurveTo(-L, top, -L + 6, top);
  plate.lineTo(L - 10, top);
  plate.quadraticCurveTo(L, top, L, top + 8);
  plate.lineTo(L - 4, bot);
  plate.lineTo(-L + 4, bot);
  plate.closePath();
  printed(ctx, plate, C.petrol, { lw: Math.max(1.6, k * 0.022), mx: 1.2, my: 0.8 });
  grainOver(ctx, plate, 0, 0, 0.8);
  // Brass edge strip along the top.
  ctx.fillStyle = C.brass;
  ctx.fillRect(-L + 5, top + 2, L * 2 - 14, Math.max(2, k * 0.025));
  // Worn paint where hands grab the frame (rear end).
  ctx.fillStyle = 'rgba(243,222,174,0.25)';
  ctx.beginPath();
  ctx.ellipse(-L + 0.12 * k, (top + bot) / 2, 0.08 * k, 0.05 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rail: brass rod on two posts, with end stops.
  const ry = -CHASSIS.railY * k;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(2.5, k * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo((CHASSIS.railMin - 0.2) * k, ry);
  ctx.lineTo((CHASSIS.railMax + 0.2) * k, ry);
  ctx.stroke();
  ctx.strokeStyle = C.brass;
  ctx.lineWidth = Math.max(1.2, k * 0.016);
  ctx.beginPath();
  ctx.moveTo((CHASSIS.railMin - 0.2) * k, ry - 0.5);
  ctx.lineTo((CHASSIS.railMax + 0.2) * k, ry - 0.5);
  ctx.stroke();
  for (const sx of [CHASSIS.railMin - 0.22, CHASSIS.railMax + 0.22]) {
    printed(ctx, polyPath([[sx * k - 3, ry - 6], [sx * k + 3, ry - 6], [sx * k + 3, top + 2], [sx * k - 3, top + 2]]), C.brass, { lw: 1.2, mx: 0.4, my: 0.3 });
  }
  if (opts.holes !== false) {
    // Socket holes: crisp ink rings punched through the plate.
    for (const s of CHASSIS.sockets) {
      const x = s[0] * k;
      const y = -s[1] * k;
      ctx.fillStyle = C.brass;
      ctx.beginPath();
      ctx.arc(x, y, 0.05 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.inkDeep;
      ctx.beginPath();
      ctx.arc(x, y, 0.032 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 0.05 * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Rivets.
  ctx.fillStyle = C.ink;
  for (let i = -5; i <= 5; i++) {
    if (i % 2 === 0) continue;
    ctx.beginPath();
    ctx.arc(i * 0.2 * k, top + 0.045 * k, Math.max(1, 0.012 * k), 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface LampLook {
  k: number;
  cracks: number;
  lit: boolean;
  /** Flame lean from acceleration (radians). */
  lean: number;
  /** 0..1 flicker phase (cosmetic). */
  flicker: number;
  /** Snuffed: 0 = just out (orange dot), 1 = cold. */
  ember: number;
  /** Glint at an end stop (0..1). */
  stopGlint: number;
  stopSide: number;
}

/** Glass lamp on its carriage; origin on the rail. */
export function drawLamp(ctx: CanvasRenderingContext2D, l: LampLook): void {
  const k = l.k;
  const w = LAMP.width * k;
  const h = LAMP.height * k;
  // Carriage: brass shoe gripping the rail.
  printed(ctx, polyPath([[-w * 0.5, 2], [w * 0.5, 2], [w * 0.44, -0.08 * k], [-w * 0.44, -0.08 * k]]), C.brass, { lw: Math.max(1.4, k * 0.016), mx: 0.8, my: 0.5 });
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(-w * 0.3, -0.02 * k, 2, 0, Math.PI * 2);
  ctx.arc(w * 0.3, -0.02 * k, 2, 0, Math.PI * 2);
  ctx.fill();
  // Glass chimney (silhouette first: it must read at thumbnail size).
  const g = new Path2D();
  g.moveTo(-w * 0.36, -0.09 * k);
  g.bezierCurveTo(-w * 0.52, -h * 0.4, -w * 0.48, -h * 0.72, -w * 0.2, -h * 0.94);
  g.lineTo(w * 0.2, -h * 0.94);
  g.bezierCurveTo(w * 0.48, -h * 0.72, w * 0.52, -h * 0.4, w * 0.36, -0.09 * k);
  g.closePath();
  // Light inside the glass.
  const fy = -h * 0.4;
  if (l.lit) {
    if (FX.glow) {
      const r = h * (1.25 + l.flicker * 0.08);
      const halo = ctx.createRadialGradient(0, fy, 0, 0, fy, r);
      halo.addColorStop(0, 'rgba(255,209,108,0.55)');
      halo.addColorStop(0.35, 'rgba(255,209,108,0.18)');
      halo.addColorStop(1, 'rgba(255,209,108,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-r, fy - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(255,224,150,0.9)';
  } else {
    ctx.fillStyle = 'rgba(121,166,157,0.55)';
  }
  ctx.fill(g);
  // Flame.
  if (l.lit) {
    ctx.save();
    ctx.translate(0, -h * 0.22);
    ctx.rotate(l.lean);
    const fh = h * (0.34 + l.flicker * 0.04);
    const f = new Path2D();
    f.moveTo(0, 0);
    f.bezierCurveTo(-w * 0.2, -fh * 0.3, -w * 0.08, -fh * 0.75, 0, -fh);
    f.bezierCurveTo(w * 0.08, -fh * 0.75, w * 0.2, -fh * 0.3, 0, 0);
    ctx.fillStyle = C.honey;
    ctx.fill(f);
    ctx.fillStyle = C.honeyHot;
    ctx.beginPath();
    ctx.ellipse(0, -fh * 0.32, w * 0.06, fh * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // Wick contracted to an orange dot that cools.
    const a = Math.max(0, 1 - l.ember);
    ctx.fillStyle = `rgba(216,93,68,${0.35 + a * 0.65})`;
    ctx.beginPath();
    ctx.arc(0, -h * 0.24, Math.max(1.5, k * 0.018), 0, Math.PI * 2);
    ctx.fill();
  }
  // Wick holder.
  ctx.fillStyle = C.brassDeep;
  ctx.fillRect(-w * 0.12, -h * 0.22, w * 0.24, 0.05 * k);
  // Glass edge and highlight.
  ctx.lineWidth = Math.max(1.8, k * 0.022);
  ctx.strokeStyle = C.ink;
  ctx.stroke(g);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = Math.max(1.2, k * 0.012);
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, -h * 0.25);
  ctx.bezierCurveTo(-w * 0.38, -h * 0.45, -w * 0.33, -h * 0.66, -w * 0.18, -h * 0.82);
  ctx.stroke();
  // Cracks layered on the moving glass.
  if (l.cracks > 0) {
    ctx.save();
    ctx.clip(g);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1.1, k * 0.011);
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(w * 0.42, -h * 0.55);
    ctx.lineTo(w * 0.1, -h * 0.5);
    ctx.lineTo(w * 0.02, -h * 0.62);
    ctx.lineTo(-w * 0.18, -h * 0.58);
    ctx.moveTo(w * 0.1, -h * 0.5);
    ctx.lineTo(w * 0.14, -h * 0.36);
    ctx.lineTo(w * 0.02, -h * 0.28);
    ctx.moveTo(w * 0.02, -h * 0.62);
    ctx.lineTo(w * 0.08, -h * 0.78);
    if (l.cracks > 1) {
      ctx.moveTo(-w * 0.42, -h * 0.3);
      ctx.lineTo(-w * 0.12, -h * 0.4);
      ctx.lineTo(-w * 0.05, -h * 0.22);
      ctx.moveTo(-w * 0.12, -h * 0.4);
      ctx.lineTo(-w * 0.2, -h * 0.7);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  // Cap: brass chimney cap with vent.
  printed(ctx, polyPath([[-w * 0.24, -h * 0.92], [w * 0.24, -h * 0.92], [w * 0.16, -h * 1.02], [-w * 0.16, -h * 1.02]]), C.brass, { lw: Math.max(1.3, k * 0.014), mx: 0.6, my: 0.4 });
  ctx.fillStyle = C.ink;
  ctx.fillRect(-w * 0.05, -h * 1.06, w * 0.1, h * 0.05);
  // Ring handle.
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.5, k * 0.016);
  ctx.beginPath();
  ctx.arc(0, -h * 1.1, w * 0.1, Math.PI, 0);
  ctx.stroke();
  // End-stop glint at the brass stop.
  if (l.stopGlint > 0) {
    ctx.save();
    ctx.globalAlpha = l.stopGlint;
    ctx.fillStyle = C.brassGlint;
    const sx = l.stopSide * w * 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, -0.04 * k - 6);
    ctx.lineTo(sx + 2, -0.04 * k - 1);
    ctx.lineTo(sx + 7 * l.stopSide, -0.04 * k);
    ctx.lineTo(sx + 2, -0.04 * k + 1);
    ctx.lineTo(sx, -0.04 * k + 6);
    ctx.lineTo(sx - 2, -0.04 * k + 1);
    ctx.lineTo(sx - 7 * l.stopSide, -0.04 * k);
    ctx.lineTo(sx - 2, -0.04 * k - 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
