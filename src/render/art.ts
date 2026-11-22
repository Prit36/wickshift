// Character and prop drawings. World drawings use metres with y pointing up
// (the caller flips the canvas); every shape gets a bold ink keyline.
import { C, BOOK_TONES } from './palette';
import type { PartId } from '../sim/rules';

type Ctx = CanvasRenderingContext2D;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
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

export function inked(ctx: Ctx, fill: string, lw: number): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

// ---------------------------------------------------------------- flame

/** Teardrop flame standing on (x,y). size 0..1. */
export function drawFlame(ctx: Ctx, x: number, y: number, size: number, t: number, lean = 0, dead = false): void {
  if (dead) {
    circle(ctx, x, y + 0.05, 0.05);
    ctx.fillStyle = C.fireOrange;
    ctx.fill();
    return;
  }
  const h = 0.26 + size * 0.95;
  const w = 0.13 + size * 0.2;
  const fl = Math.sin(t * 17) * 0.04 + Math.sin(t * 29 + 1) * 0.03;
  const layers: [string, number][] = [
    [C.fireRed, 1],
    [C.fireOrange, 0.78],
    [C.fire, 0.56],
    [C.fireHot, 0.32],
  ];
  for (const [col, k] of layers) {
    const hh = h * k * (1 + fl);
    const ww = w * k;
    const tipX = x + (lean * 0.25 + fl * 1.5) * hh;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - ww * 1.3, y + hh * 0.05, x - ww * 0.9, y + hh * 0.6, tipX, y + hh);
    ctx.bezierCurveTo(x + ww * 0.9, y + hh * 0.6, x + ww * 1.3, y + hh * 0.05, x, y);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

// ---------------------------------------------------------------- cart

export interface CartLook {
  t: number;
  flame: number;
  dead: boolean;
  lean: number;
  sparks: number;
  wheels: PartId | null;
  parts: ReadonlySet<PartId>;
  airborne: boolean;
  /** -1..1: moth expression, negative = scared. */
  mood: number;
  blink: boolean;
  cracked: number;
}

/** Chassis, lamp and moth in chassis-local metres (origin = chassis centre). */
export function drawCartBody(ctx: Ctx, L: CartLook): void {
  const lw = 0.055;
  // tail feather vane
  if (L.parts.has('feather')) {
    ctx.save();
    ctx.translate(-0.98, 0.1);
    ctx.rotate(0.5 + Math.sin(L.t * 6) * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-0.15, 0.25, -0.1, 0.6, 0.05, 0.75);
    ctx.bezierCurveTo(0.2, 0.55, 0.15, 0.2, 0, 0);
    inked(ctx, C.pink, lw * 0.8);
    ctx.beginPath();
    ctx.moveTo(0.02, 0.05);
    ctx.lineTo(0.05, 0.7);
    ctx.stroke();
    ctx.restore();
  }
  // second winding key
  const drawKey = (kx: number, ky: number, a: number) => {
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(a);
    ctx.fillStyle = C.mustard;
    ctx.beginPath();
    ctx.rect(-0.03, 0, 0.06, 0.16);
    inked(ctx, C.mustard, lw * 0.7);
    ctx.beginPath();
    ctx.ellipse(-0.11, 0.22, 0.1, 0.07, 0, 0, Math.PI * 2);
    inked(ctx, C.red, lw * 0.7);
    ctx.beginPath();
    ctx.ellipse(0.11, 0.22, 0.1, 0.07, 0, 0, Math.PI * 2);
    inked(ctx, C.red, lw * 0.7);
    ctx.restore();
  };
  const keyA = Math.sin(L.t * 9) * 0.6;
  drawKey(-0.78, 0.16, -0.25 + keyA * 0.1);
  if (L.parts.has('twinKey')) drawKey(0.82, 0.16, 0.25 - keyA * 0.1);

  // matchbox sleeve
  rr(ctx, -1.0, -0.21, 2.0, 0.44, 0.06);
  inked(ctx, C.red, lw);
  // drawer tray sticking out the back
  rr(ctx, -1.08, -0.16, 0.14, 0.34, 0.03);
  inked(ctx, C.paperShade, lw * 0.8);
  // label
  rr(ctx, -0.52, -0.13, 1.04, 0.28, 0.04);
  inked(ctx, C.cream, lw * 0.7);
  ctx.fillStyle = C.blue;
  ctx.fillRect(-0.48, -0.03, 0.96, 0.07);
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(0, 0.005, 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.mustard;
  ctx.beginPath();
  ctx.arc(0, 0.005, 0.04, 0, Math.PI * 2);
  ctx.fill();
  // striker strip
  ctx.fillStyle = C.redDark;
  ctx.fillRect(-0.95, -0.2, 1.9, 0.05);

  // lamp rail
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.25, 0.27);
  ctx.lineTo(0.55, 0.27);
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = C.mustard;
  ctx.stroke();

  drawMoth(ctx, L);
  drawLamp(ctx, 0.12 + L.lean * 0.16, 0.3, L);
}

function drawLamp(ctx: Ctx, x: number, y: number, L: CartLook): void {
  const lw = 0.05;
  // glow
  if (!L.dead) {
    const r = 0.9 + L.flame * 1.6;
    const g = ctx.createRadialGradient(x, y + 0.4, 0.05, x, y + 0.4, r);
    g.addColorStop(0, 'rgba(255,214,90,0.55)');
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y + 0.4 - r, r * 2, r * 2);
  }
  // base
  rr(ctx, x - 0.2, y - 0.02, 0.4, 0.12, 0.03);
  inked(ctx, C.mustard, lw);
  // chimney glass
  const gx = x;
  const gy = y + 0.1;
  ctx.beginPath();
  ctx.moveTo(gx - 0.15, gy);
  ctx.bezierCurveTo(gx - 0.3, gy + 0.18, gx - 0.24, gy + 0.42, gx - 0.11, gy + 0.6);
  ctx.lineTo(gx + 0.11, gy + 0.6);
  ctx.bezierCurveTo(gx + 0.24, gy + 0.42, gx + 0.3, gy + 0.18, gx + 0.15, gy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(190,235,255,0.25)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawFlame(ctx, gx, gy + 0.04, L.flame, L.t, -L.lean, L.dead);
  ctx.restore();
  // flame pokes out of a roaring lamp
  if (L.flame > 0.55 && !L.dead) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx - 0.6, gy + 0.6, 1.2, 1.5);
    ctx.clip();
    drawFlame(ctx, gx, gy + 0.04, L.flame, L.t, -L.lean);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(gx - 0.15, gy);
  ctx.bezierCurveTo(gx - 0.3, gy + 0.18, gx - 0.24, gy + 0.42, gx - 0.11, gy + 0.6);
  ctx.lineTo(gx + 0.11, gy + 0.6);
  ctx.bezierCurveTo(gx + 0.24, gy + 0.42, gx + 0.3, gy + 0.18, gx + 0.15, gy);
  ctx.closePath();
  ctx.lineWidth = lw;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // glint
  ctx.beginPath();
  ctx.moveTo(gx - 0.13, gy + 0.12);
  ctx.quadraticCurveTo(gx - 0.19, gy + 0.3, gx - 0.11, gy + 0.46);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  // stress cracks on a big flame
  if (L.cracked > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(gx + 0.14, gy + 0.08);
    ctx.lineTo(gx + 0.07, gy + 0.2);
    ctx.lineTo(gx + 0.13, gy + 0.27);
    if (L.cracked > 1) {
      ctx.moveTo(gx - 0.18, gy + 0.3);
      ctx.lineTo(gx - 0.1, gy + 0.38);
      ctx.lineTo(gx - 0.15, gy + 0.46);
    }
    ctx.stroke();
  }
  // cap
  rr(ctx, gx - 0.15, gy + 0.58, 0.3, 0.09, 0.03);
  inked(ctx, C.mustard, lw);
  ctx.beginPath();
  ctx.moveTo(gx - 0.08, gy + 0.67);
  ctx.quadraticCurveTo(gx, gy + 0.82, gx + 0.08, gy + 0.67);
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

export function drawMoth(ctx: Ctx, L: CartLook): void {
  ctx.save();
  ctx.translate(-0.5, 0.22);
  ctx.scale(1.25, 1.25);
  ctx.translate(0.5, -0.22);
  drawMothInner(ctx, L);
  ctx.restore();
}

function drawMothInner(ctx: Ctx, L: CartLook): void {
  const lw = 0.05;
  const x = -0.5;
  const y = 0.22;
  const bob = Math.sin(L.t * 8) * 0.015;
  // wings: flutter when airborne
  const flap = L.airborne ? Math.sin(L.t * 40) * 0.5 : 0.1;
  ctx.save();
  ctx.translate(x - 0.12, y + 0.36 + bob);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * 0.15 - 0.4 + flap * side * 0.3);
    ctx.scale(1, side === 1 ? 1 : 0.8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-0.5, 0.25, -0.55, -0.15, -0.3, -0.25);
    ctx.bezierCurveTo(-0.15, -0.28, -0.05, -0.12, 0, 0);
    inked(ctx, side === 1 ? C.paperShade : '#e6c487', lw * 0.8);
    circle(ctx, -0.28, -0.02, 0.06);
    inked(ctx, C.teal, lw * 0.5);
    ctx.restore();
  }
  ctx.restore();
  // body
  ctx.beginPath();
  ctx.ellipse(x, y + 0.2 + bob, 0.17, 0.22, 0.1, 0, Math.PI * 2);
  inked(ctx, C.cream, lw);
  // fuzzy collar
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.05 + (i / 8) * 0.9);
    const r = i % 2 ? 0.2 : 0.16;
    const px = x + Math.cos(a) * r * 1.1;
    const py = y + 0.36 + bob + Math.sin(a) * r * 0.45 - 0.05;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  inked(ctx, C.paper, lw * 0.7);
  // head
  const hx = x + 0.04;
  const hy = y + 0.5 + bob;
  circle(ctx, hx, hy, 0.2);
  inked(ctx, C.cream, lw);
  // eyes
  const eyeR = L.mood < -0.3 ? 0.085 : 0.07;
  for (const ex of [hx - 0.02, hx + 0.12]) {
    if (L.blink) {
      ctx.beginPath();
      ctx.moveTo(ex - 0.05, hy + 0.02);
      ctx.lineTo(ex + 0.05, hy + 0.02);
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    } else {
      circle(ctx, ex, hy + 0.02, eyeR);
      ctx.fillStyle = C.ink;
      ctx.fill();
      circle(ctx, ex + 0.025, hy + 0.05, eyeR * 0.35);
      ctx.fillStyle = C.white;
      ctx.fill();
    }
  }
  // mouth
  ctx.beginPath();
  if (L.mood > 0.3) ctx.arc(hx + 0.06, hy - 0.08, 0.05, Math.PI * 1.1, Math.PI * 1.9, true);
  else if (L.mood < -0.3) ctx.ellipse(hx + 0.06, hy - 0.09, 0.03, 0.04, 0, 0, Math.PI * 2);
  else {
    ctx.moveTo(hx + 0.02, hy - 0.09);
    ctx.lineTo(hx + 0.1, hy - 0.09);
  }
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // antennae (one bent)
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(hx - 0.04, hy + 0.17);
  ctx.quadraticCurveTo(hx - 0.2, hy + 0.45, hx - 0.32, hy + 0.42);
  ctx.moveTo(hx + 0.08, hy + 0.17);
  ctx.quadraticCurveTo(hx + 0.12, hy + 0.42, hx + 0.24, hy + 0.36);
  ctx.lineTo(hx + 0.3, hy + 0.26);
  ctx.stroke();
  for (const [ax, ay] of [
    [hx - 0.32, hy + 0.42],
    [hx + 0.3, hy + 0.26],
  ]) {
    ctx.beginPath();
    ctx.ellipse(ax, ay, 0.06, 0.035, 0.3, 0, Math.PI * 2);
    inked(ctx, C.mustard, 0.025);
  }
  // postman cap
  ctx.beginPath();
  ctx.moveTo(hx - 0.17, hy + 0.1);
  ctx.quadraticCurveTo(hx - 0.15, hy + 0.3, hx + 0.02, hy + 0.3);
  ctx.quadraticCurveTo(hx + 0.18, hy + 0.3, hx + 0.17, hy + 0.12);
  ctx.closePath();
  inked(ctx, C.blueDark, lw * 0.8);
  ctx.fillStyle = C.red;
  ctx.fillRect(hx - 0.165, hy + 0.11, 0.335, 0.05);
  ctx.beginPath();
  ctx.moveTo(hx + 0.12, hy + 0.12);
  ctx.quadraticCurveTo(hx + 0.3, hy + 0.1, hx + 0.32, hy + 0.06);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

/** A wheel in its own local frame (origin = hub, already rotated). */
export function drawWheel(ctx: Ctx, r: number, kind: PartId | null): void {
  const lw = 0.05;
  if (kind === 'reels') {
    // cotton reel: wide flanges, thread
    circle(ctx, 0, 0, r);
    inked(ctx, '#d8a35c', lw);
    circle(ctx, 0, 0, r * 0.78);
    inked(ctx, C.pink, lw * 0.7);
    ctx.strokeStyle = 'rgba(26,18,51,0.35)';
    ctx.lineWidth = 0.02;
    for (let i = 0; i < 5; i++) {
      circle(ctx, 0, 0, r * (0.42 + i * 0.075));
      ctx.stroke();
    }
    circle(ctx, 0, 0, r * 0.25);
    inked(ctx, '#d8a35c', lw * 0.7);
    ctx.beginPath();
    ctx.moveTo(r * 0.78, 0);
    ctx.lineTo(r * 1.05, -0.08);
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = C.pink;
    ctx.stroke();
    circle(ctx, 0, 0, r * 0.09);
    ctx.fillStyle = C.ink;
    ctx.fill();
    return;
  }
  if (kind === 'buttons') {
    circle(ctx, 0, 0, r);
    inked(ctx, C.teal, lw);
    circle(ctx, 0, 0, r * 0.72);
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = C.tealDark;
    ctx.stroke();
    for (const [hx, hy] of [
      [0.25, 0.25],
      [-0.25, 0.25],
      [0.25, -0.25],
      [-0.25, -0.25],
    ]) {
      circle(ctx, hx * r, hy * r, r * 0.12);
      ctx.fillStyle = C.ink;
      ctx.fill();
    }
    return;
  }
  if (kind === 'caps') {
    ctx.beginPath();
    const n = 21;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr2 = i % 2 ? r : r * 0.9;
      ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
    }
    ctx.closePath();
    inked(ctx, '#c9cfd8', lw);
    circle(ctx, 0, 0, r * 0.72);
    inked(ctx, C.red, lw * 0.6);
    ctx.fillStyle = C.cream;
    ctx.fillRect(-r * 0.5, -r * 0.12, r, r * 0.24);
    circle(ctx, 0, 0, r * 0.1);
    ctx.fillStyle = C.ink;
    ctx.fill();
    return;
  }
  // standard: rubber tyre, mustard hub, spokes
  circle(ctx, 0, 0, r);
  inked(ctx, C.ink, lw);
  circle(ctx, 0, 0, r * 0.62);
  inked(ctx, C.mustard, lw * 0.6);
  ctx.lineWidth = 0.045;
  ctx.strokeStyle = C.mustardDark;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58);
  }
  ctx.stroke();
  circle(ctx, 0, 0, r * 0.16);
  inked(ctx, C.red, lw * 0.5);
  // tread notches
  ctx.fillStyle = C.inkSoft;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circle(ctx, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, 0.03);
    ctx.fill();
  }
}

/** Suspension strut from a chassis point to the wheel hub (world coords). */
export function drawStrut(ctx: Ctx, ax: number, ay: number, bx: number, by: number, soft: boolean): void {
  const n = soft ? 7 : 4;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const s = (i % 2 ? 1 : -1) * 0.07;
    ctx.lineTo(ax + dx * t + px * s, ay + dy * t + py * s);
  }
  ctx.lineTo(bx, by);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = soft ? C.pink : '#c9cfd8';
  ctx.stroke();
}

// ---------------------------------------------------------------- letters & windows

export function drawLetter(ctx: Ctx, x: number, y: number, t: number, id: number): void {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 3 + id) * 0.08);
  ctx.rotate(Math.sin(t * 2 + id * 1.7) * 0.25);
  rr(ctx, -0.3, -0.2, 0.6, 0.4, 0.04);
  inked(ctx, C.white, 0.05);
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.18);
  ctx.lineTo(0, -0.04);
  ctx.lineTo(0.3, 0.18);
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  circle(ctx, 0, -0.04, 0.07);
  ctx.fillStyle = C.red;
  ctx.fill();
  ctx.restore();
}

/** A pigeonhole house. Origin at the bottom centre of the house. */
export function drawHouse(ctx: Ctx, w: number, h: number, lit: number, t: number, inRange: boolean, tone: string): void {
  const lw = 0.06;
  // roof + walls
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2, h * 0.62);
  ctx.lineTo(0, h);
  ctx.lineTo(-w / 2, h * 0.62);
  ctx.closePath();
  inked(ctx, tone, lw);
  // roof trim
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 0.12, h * 0.6);
  ctx.lineTo(0, h + 0.1);
  ctx.lineTo(w / 2 + 0.12, h * 0.6);
  ctx.lineWidth = 0.14;
  ctx.strokeStyle = C.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = C.cream;
  ctx.stroke();
  // window opening
  const ox = 0;
  const oy = h * 0.42;
  const orad = w * 0.28;
  if (lit > 0) {
    const g = ctx.createRadialGradient(ox, oy, 0.05, ox, oy, 2.6 * lit);
    g.addColorStop(0, 'rgba(255,214,90,0.6)');
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox - 2.6, oy - 2.6, 5.2, 5.2);
  }
  ctx.beginPath();
  ctx.moveTo(ox - orad, oy - orad * 0.9);
  ctx.lineTo(ox - orad, oy + orad * 0.2);
  ctx.arc(ox, oy + orad * 0.2, orad, Math.PI, 0, true);
  ctx.lineTo(ox + orad, oy - orad * 0.9);
  ctx.closePath();
  inked(ctx, lit > 0 ? C.fire : C.ink, lw);
  if (lit > 0) {
    // clerk moth silhouette waving
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.mustardDark;
    const wave = Math.sin(t * 10) * 0.25;
    circle(ctx, ox, oy - orad * 0.3, orad * 0.45);
    ctx.fill();
    circle(ctx, ox, oy + orad * 0.35, orad * 0.32);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + orad * 0.3, oy);
    ctx.lineTo(ox + orad * 0.75, oy + orad * (0.5 + wave));
    ctx.lineWidth = orad * 0.18;
    ctx.strokeStyle = C.mustardDark;
    ctx.stroke();
    ctx.restore();
  } else {
    // sleeping zzz dots / call-out when in range
    const pulse = inRange ? 0.5 + 0.5 * Math.sin(t * 12) : 0;
    if (inRange) {
      circle(ctx, ox, oy, orad * (0.6 + pulse * 0.25));
      ctx.fillStyle = `rgba(255,210,63,${0.35 + pulse * 0.4})`;
      ctx.fill();
    }
  }
  // sill
  rr(ctx, ox - orad - 0.1, oy - orad * 0.9 - 0.08, orad * 2 + 0.2, 0.12, 0.03);
  inked(ctx, C.cream, lw * 0.7);
  // letter slot
  rr(ctx, -w * 0.25, h * 0.08, w * 0.5, 0.1, 0.03);
  inked(ctx, C.ink, 0.03);
}

export function drawBookFace(ctx: Ctx, x0: number, x1: number, yTop: number, h: number, tone: number): void {
  const col = BOOK_TONES[tone % BOOK_TONES.length];
  rr(ctx, x0, yTop - h, x1 - x0, h, 0.06);
  inked(ctx, col, 0.05);
  ctx.fillStyle = C.paper;
  ctx.fillRect(x0 + 0.1, yTop - h + 0.08, x1 - x0 - 0.2, 0.08);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x0 + 0.15, yTop - h * 0.55, (x1 - x0) * 0.3, 0.05);
}
