// Cut-paper drawings of the parts. Everything is drawn in world metres with
// y pointing up (the caller sets the transform), with a bold ink keyline.
// The same function draws a part in the tray, in the hand and mounted, so a
// part always has the same silhouette.
import { C } from './palette';
import { LAMP_H, LAMP_W, STICK_THICK, WHEEL_R, type PartKind } from '../sim/parts';

type Ctx = CanvasRenderingContext2D;

export const LW = 0.035;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

export function inked(ctx: Ctx, fill: string, lw = LW): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = C.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Teardrop flame standing on (x,y). size 0..1. */
export function drawFlame(ctx: Ctx, x: number, y: number, size: number, t: number, lean = 0): void {
  if (size <= 0) {
    circle(ctx, x, y + 0.02, 0.025);
    ctx.fillStyle = C.fireRed;
    ctx.fill();
    return;
  }
  const h = 0.08 + size * 0.17;
  const w = 0.035 + size * 0.03;
  const fl = Math.sin(t * 17) * 0.05 + Math.sin(t * 29 + 1) * 0.04;
  const layers: [string, number][] = [
    [C.fireRed, 1],
    [C.fireOrange, 0.78],
    [C.fire, 0.56],
    [C.fireHot, 0.32],
  ];
  for (const [col, k] of layers) {
    const hh = h * k * (1 + fl);
    const ww = w * k;
    const tipX = x + (lean * 0.4 + fl * 1.2) * hh;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - ww * 1.3, y + hh * 0.05, x - ww * 0.9, y + hh * 0.6, tipX, y + hh);
    ctx.bezierCurveTo(x + ww * 0.9, y + hh * 0.6, x + ww * 1.3, y + hh * 0.05, x, y);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

// ---------------------------------------------------------------- matchstick & pins

export function drawStick(ctx: Ctx, ax: number, ay: number, bx: number, by: number, opts: { ghost?: boolean; bad?: boolean; hot?: boolean } = {}): void {
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1e-3) return;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(Math.atan2(by - ay, bx - ax));
  if (opts.ghost) ctx.globalAlpha = 0.7;
  const t = STICK_THICK;
  rr(ctx, -t / 2, -t / 2, len + t, t, t * 0.3);
  inked(ctx, opts.bad ? '#ff9b8a' : opts.hot ? '#fff6d8' : '#f2d7a0', LW * 0.8);
  // grain
  ctx.beginPath();
  ctx.moveTo(t * 0.4, -t * 0.12);
  ctx.lineTo(len * 0.7, -t * 0.12);
  ctx.lineWidth = 0.008;
  ctx.strokeStyle = 'rgba(160,100,40,0.5)';
  ctx.stroke();
  // red match head at the far end
  ctx.beginPath();
  ctx.ellipse(len - t * 0.1, 0, t * 1.05, t * 0.78, 0, 0, Math.PI * 2);
  inked(ctx, opts.bad ? C.redDark : C.red, LW * 0.8);
  ctx.restore();
}

export function drawPin(ctx: Ctx, x: number, y: number, r = 0.045, hot = false): void {
  circle(ctx, x, y, r * (hot ? 1.5 : 1));
  inked(ctx, hot ? C.fire : '#e2b04a', LW * 0.6);
  circle(ctx, x - r * 0.3, y + r * 0.3, r * 0.35);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
}

// ---------------------------------------------------------------- parts

/** The lamp: brass foot, glass chimney, flame inside. (x,y) is its pin. */
export function drawLamp(ctx: Ctx, flame: number, t: number, lean = 0): void {
  const w = LAMP_W;
  const h = LAMP_H;
  const y0 = -h / 2;
  // foot
  rr(ctx, -w / 2, y0, w, 0.09, 0.03);
  inked(ctx, '#e2b04a');
  // oil reservoir shows the flame left
  rr(ctx, -w * 0.38, y0 + 0.08, w * 0.76, 0.09, 0.03);
  inked(ctx, '#c97f2c');
  ctx.save();
  rr(ctx, -w * 0.38, y0 + 0.08, w * 0.76 * Math.max(0, Math.min(1, flame)), 0.09, 0.03);
  ctx.fillStyle = C.mustard;
  ctx.fill();
  ctx.restore();
  // chimney
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, y0 + 0.17);
  ctx.bezierCurveTo(-w * 0.62, y0 + 0.27, -w * 0.3, y0 + 0.38, -w * 0.18, h / 2 + 0.03);
  ctx.lineTo(w * 0.18, h / 2 + 0.03);
  ctx.bezierCurveTo(w * 0.3, y0 + 0.38, w * 0.62, y0 + 0.27, w * 0.3, y0 + 0.17);
  ctx.closePath();
  ctx.fillStyle = flame > 0 ? 'rgba(255,236,170,0.55)' : 'rgba(190,210,235,0.35)';
  ctx.fill();
  drawFlame(ctx, 0, y0 + 0.17, flame, t, lean);
  ctx.lineWidth = LW;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // glint
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, y0 + 0.24);
  ctx.quadraticCurveTo(-w * 0.36, y0 + 0.3, -w * 0.2, y0 + 0.38);
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  // handle
  ctx.beginPath();
  ctx.arc(0, h / 2 + 0.06, 0.05, 0, Math.PI);
  ctx.lineWidth = LW * 0.8;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

/** A shirt button wheel (or the clockwork key wheel). Drawn centred, rotated by `spin`. */
export function drawWheel(ctx: Ctx, key: boolean, spin: number, wind = 0): void {
  const r = WHEEL_R;
  ctx.save();
  ctx.rotate(spin);
  circle(ctx, 0, 0, r);
  inked(ctx, key ? C.teal : C.pink);
  circle(ctx, 0, 0, r * 0.72);
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = 'rgba(26,18,51,0.45)';
  ctx.stroke();
  for (const [hx, hy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    circle(ctx, hx * r * 0.25, hy * r * 0.25, r * 0.11), inked(ctx, C.ink, 0.001);
  ctx.restore();
  if (key) {
    // the wind-up key stands out of the hub; it turns while driving
    ctx.save();
    ctx.rotate(wind);
    rr(ctx, -0.025, 0, 0.05, r * 1.25, 0.02);
    inked(ctx, '#e2b04a', LW * 0.7);
    ctx.translate(0, r * 1.3);
    ctx.beginPath();
    ctx.ellipse(-0.08, 0, 0.08, 0.055, 0, 0, Math.PI * 2);
    inked(ctx, C.red, LW * 0.7);
    ctx.beginPath();
    ctx.ellipse(0.08, 0, 0.08, 0.055, 0, 0, Math.PI * 2);
    inked(ctx, C.red, LW * 0.7);
    ctx.restore();
  }
}

/** Foil match rocket pointing along +x. Thrust comes out of the back. */
export function drawRocket(ctx: Ctx, firing: boolean, t: number): void {
  if (firing) {
    const f = 0.7 + Math.sin(t * 50) * 0.15 + Math.sin(t * 31) * 0.1;
    ctx.beginPath();
    ctx.moveTo(-0.17, 0.06);
    ctx.quadraticCurveTo(-0.17 - 0.5 * f, 0, -0.17, -0.06);
    ctx.closePath();
    ctx.fillStyle = C.fireOrange;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.17, 0.035);
    ctx.quadraticCurveTo(-0.17 - 0.3 * f, 0, -0.17, -0.035);
    ctx.closePath();
    ctx.fillStyle = C.fireHot;
    ctx.fill();
  }
  // foil body
  ctx.beginPath();
  ctx.moveTo(-0.18, -0.06);
  ctx.lineTo(0.12, -0.065);
  ctx.quadraticCurveTo(0.24, 0, 0.12, 0.065);
  ctx.lineTo(-0.18, 0.06);
  ctx.closePath();
  inked(ctx, '#cfd6e6');
  // crinkles
  ctx.beginPath();
  for (const x of [-0.1, -0.02, 0.06]) {
    ctx.moveTo(x, -0.055);
    ctx.lineTo(x + 0.03, 0.055);
  }
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = 'rgba(26,18,51,0.4)';
  ctx.stroke();
  // red match head at the tail
  ctx.beginPath();
  ctx.ellipse(-0.18, 0, 0.05, 0.07, 0, 0, Math.PI * 2);
  inked(ctx, C.red);
  // fins
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.06);
  ctx.lineTo(-0.2, 0.13);
  ctx.lineTo(-0.04, 0.06);
  ctx.moveTo(-0.12, -0.06);
  ctx.lineTo(-0.2, -0.13);
  ctx.lineTo(-0.04, -0.06);
  inked(ctx, C.red, LW * 0.7);
}

/** Paper sky lantern, drawn centred. `heat` 0..1 lights it from inside. */
export function drawLantern(ctx: Ctx, heat: number, t: number): void {
  const w = 0.26;
  const h = 0.32;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h / 2);
  ctx.lineTo(-w / 2, h / 2 - 0.03);
  ctx.quadraticCurveTo(0, h / 2 + 0.05, w / 2, h / 2 - 0.03);
  ctx.lineTo(w * 0.42, -h / 2);
  ctx.closePath();
  inked(ctx, heat > 0 ? '#ffb36b' : '#f06a8a');
  if (heat > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5 + heat * 0.4;
    ctx.fillStyle = C.fireHot;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.1, w * 0.3, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // ribs
  ctx.beginPath();
  for (const k of [-0.5, 0, 0.5]) {
    ctx.moveTo(k * w * 0.42, -h / 2);
    ctx.lineTo(k * w * 0.5, h / 2 - 0.02);
  }
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = 'rgba(26,18,51,0.5)';
  ctx.stroke();
  // burner
  rr(ctx, -0.05, -h / 2 - 0.035, 0.1, 0.04, 0.01);
  inked(ctx, '#e2b04a', LW * 0.6);
  if (heat > 0) drawFlame(ctx, 0, -h / 2 + 0.005, 0.35 * heat, t);
}

/** Clothes-peg spring with its foot along +x (rotate to aim). */
export function drawSpring(ctx: Ctx, kick: number): void {
  const ext = 0.05 + kick * 0.18;
  // coil
  ctx.beginPath();
  const n = 5;
  for (let i = 0; i <= n * 2; i++) {
    const x = 0.02 + (i / (n * 2)) * (0.14 + ext);
    const y = i % 2 ? 0.05 : -0.05;
    if (i === 0) ctx.moveTo(x, 0);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = 0.022;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.lineWidth = 0.011;
  ctx.strokeStyle = '#cfd6e6';
  ctx.stroke();
  // wooden peg foot
  ctx.save();
  ctx.translate(0.16 + ext, 0);
  rr(ctx, 0, -0.08, 0.06, 0.16, 0.02);
  inked(ctx, '#e9c27f', LW * 0.7);
  ctx.restore();
  // clip at the pin
  rr(ctx, -0.04, -0.045, 0.07, 0.09, 0.02);
  inked(ctx, C.teal, LW * 0.6);
}

export interface PartState {
  t: number;
  flame?: number;
  spin?: number;
  wind?: number;
  firing?: boolean;
  heat?: number;
  kick?: number;
  /** Drawn faded (a placement preview). */
  ghost?: boolean;
  bad?: boolean;
}

/**
 * Any non-stick part at (x,y), aimed by `dir` (45° steps) and the body angle.
 * Lanterns are drawn where they float (the caller passes their own position).
 */
export function drawPart(ctx: Ctx, kind: Exclude<PartKind, 'stick'>, x: number, y: number, dir: number, angle: number, s: PartState): void {
  ctx.save();
  ctx.translate(x, y);
  if (s.ghost) ctx.globalAlpha = 0.75;
  if (s.bad) ctx.filter = 'saturate(0.3)';
  switch (kind) {
    case 'lamp':
      ctx.rotate(angle);
      ctx.translate(0, 0.05);
      drawLamp(ctx, s.flame ?? 1, s.t, -angle * 0.6);
      break;
    case 'wheel':
    case 'key':
      drawWheel(ctx, kind === 'key', s.spin ?? angle, s.wind ?? angle);
      break;
    case 'rocket':
      ctx.rotate(angle + (dir * Math.PI) / 4);
      drawRocket(ctx, !!s.firing, s.t);
      break;
    case 'lantern':
      ctx.rotate(angle);
      drawLantern(ctx, s.heat ?? 0, s.t);
      break;
    case 'spring':
      ctx.rotate(angle + (dir * Math.PI) / 4);
      drawSpring(ctx, s.kick ?? 0);
      break;
  }
  ctx.restore();
}

/** Aim arrow for parts that can be turned. */
export function drawAim(ctx: Ctx, x: number, y: number, dir: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 4);
  ctx.beginPath();
  ctx.moveTo(0.3, 0);
  ctx.lineTo(0.48, 0);
  ctx.moveTo(0.42, 0.06);
  ctx.lineTo(0.49, 0);
  ctx.lineTo(0.42, -0.06);
  ctx.lineWidth = 0.035;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}
