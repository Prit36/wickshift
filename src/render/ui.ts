// Screen-space interface pieces: paper panels, stamps, tags, buttons, logo.
import { C, FONT, BODY, STAMP_INKS } from './palette';
import { rr } from './art';
import type { StampDef, PartDef } from '../sim/rules';

type Ctx = CanvasRenderingContext2D;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', outline = 0, font = FONT, weight = 700): void {
  ctx.font = `${weight} ${Math.round(size)}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = outline;
    ctx.strokeStyle = C.ink;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** Largest font size <= size at which s fits in maxW. */
export function fitSize(ctx: Ctx, s: string, maxW: number, size: number, font = FONT, weight = 700): number {
  ctx.font = `${weight} ${Math.round(size)}px ${font}`;
  const w = ctx.measureText(s).width;
  return w > maxW ? Math.max(8, size * (maxW / w)) : size;
}

export function wrapText(ctx: Ctx, s: string, x: number, y: number, maxW: number, size: number, color: string, align: CanvasTextAlign = 'left', lh = 1.25): number {
  ctx.font = `600 ${Math.round(size)}px ${BODY}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += size * lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + size * lh;
}

/** A cut-paper panel with an offset ink shadow. */
export function panel(ctx: Ctx, r: Rect, fill: string, s: number, tilt = 0): void {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(tilt);
  rr(ctx, -r.w / 2 + 6 * s, -r.h / 2 + 7 * s, r.w, r.h, 10 * s);
  ctx.fillStyle = 'rgba(10,6,30,0.55)';
  ctx.fill();
  rr(ctx, -r.w / 2, -r.h / 2, r.w, r.h, 10 * s);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.restore();
}

export function button(ctx: Ctx, r: Rect, label: string, s: number, hot: boolean, color: string = C.red, enabled = true, key = ''): void {
  const press = hot && enabled ? -2 * s : 0;
  ctx.save();
  ctx.globalAlpha = enabled ? 1 : 0.5;
  rr(ctx, r.x + 4 * s, r.y + 6 * s, r.w, r.h, 12 * s);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, r.x, r.y + press, r.w, r.h, 12 * s);
  ctx.fillStyle = hot && enabled ? lighten(color) : color;
  ctx.fill();
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  text(ctx, label, r.x + r.w / 2 - (key ? 14 * s : 0), r.y + r.h / 2 + press + 1, r.h * 0.5, C.cream, 'center', 5 * s);
  if (key) {
    const kx = r.x + r.w - 30 * s;
    rr(ctx, kx - 14 * s, r.y + r.h / 2 - 13 * s + press, 34 * s, 26 * s, 6 * s);
    ctx.fillStyle = 'rgba(26,18,51,0.35)';
    ctx.fill();
    text(ctx, key, kx + 3 * s, r.y + r.h / 2 + press + 1, 16 * s, C.cream, 'center', 0, BODY, 700);
  }
  ctx.restore();
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 30);
  const g = Math.min(255, ((n >> 8) & 255) + 30);
  const b = Math.min(255, (n & 255) + 30);
  return `rgb(${r},${g},${b})`;
}

export function coin(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.mustard;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = C.mustardDark;
  ctx.stroke();
}

/** Perforated postage stamp. */
export function stampShape(ctx: Ctx, r: Rect, s: number): void {
  const hole = 5 * s;
  const step = 14 * s;
  ctx.beginPath();
  const { x, y, w, h } = r;
  ctx.moveTo(x, y);
  const nx = Math.max(2, Math.round(w / step));
  const ny = Math.max(2, Math.round(h / step));
  for (let i = 0; i < nx; i++) {
    const cx = x + ((i + 0.5) * w) / nx;
    ctx.lineTo(cx - hole, y);
    ctx.arc(cx, y, hole, Math.PI, 0, true);
  }
  ctx.lineTo(x + w, y);
  for (let i = 0; i < ny; i++) {
    const cy = y + ((i + 0.5) * h) / ny;
    ctx.lineTo(x + w, cy - hole);
    ctx.arc(x + w, cy, hole, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.lineTo(x + w, y + h);
  for (let i = nx - 1; i >= 0; i--) {
    const cx = x + ((i + 0.5) * w) / nx;
    ctx.lineTo(cx + hole, y + h);
    ctx.arc(cx, y + h, hole, 0, Math.PI, true);
  }
  ctx.lineTo(x, y + h);
  for (let i = ny - 1; i >= 0; i--) {
    const cy = y + ((i + 0.5) * h) / ny;
    ctx.lineTo(x, cy + hole);
    ctx.arc(x, cy, hole, Math.PI / 2, -Math.PI / 2, true);
  }
  ctx.closePath();
}

export function drawStamp(ctx: Ctx, r: Rect, def: StampDef, s: number, hot: boolean, t: number, tilt = 0): void {
  const ink = STAMP_INKS[def.ink % STAMP_INKS.length];
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(tilt + (hot ? Math.sin(t * 8) * 0.03 : 0));
  const sc = hot ? 1.06 : 1;
  ctx.scale(sc, sc);
  const lr = { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h };
  ctx.save();
  ctx.translate(5 * s, 6 * s);
  stampShape(ctx, lr, s);
  ctx.fillStyle = 'rgba(10,6,30,0.5)';
  ctx.fill();
  ctx.restore();
  stampShape(ctx, lr, s);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = 'rgba(26,18,51,0.4)';
  ctx.stroke();
  const pad = 10 * s;
  rr(ctx, lr.x + pad, lr.y + pad, lr.w - pad * 2, lr.h - pad * 2, 4 * s);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // motif
  motif(ctx, def.motif, 0, -lr.h * 0.08, Math.min(lr.w, lr.h) * 0.24, s);
  // name band
  const bh = Math.max(20 * s, lr.h * 0.2);
  ctx.fillStyle = C.cream;
  ctx.fillRect(lr.x + pad + 3 * s, lr.y + lr.h - pad - bh - 3 * s, lr.w - pad * 2 - 6 * s, bh);
  const fs = fitSize(ctx, def.name.toUpperCase(), lr.w - pad * 2 - 12 * s, bh * 0.72);
  text(ctx, def.name.toUpperCase(), 0, lr.y + lr.h - pad - bh / 2 - 2 * s, fs, C.ink, 'center');
  ctx.restore();
}

export function motif(ctx: Ctx, kind: StampDef['motif'], x: number, y: number, r: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.cream;
  ctx.fillStyle = C.cream;
  const P = () => ctx.beginPath();
  switch (kind) {
    case 'loop':
      P();
      ctx.arc(0, 0, r * 0.7, Math.PI * 0.2, Math.PI * 1.9);
      ctx.stroke();
      P();
      ctx.moveTo(r * 0.62, -r * 0.55);
      ctx.lineTo(r * 0.75, -r * 0.05);
      ctx.lineTo(r * 0.25, -r * 0.3);
      ctx.fill();
      break;
    case 'envelope':
      ctx.strokeRect(-r * 0.8, -r * 0.5, r * 1.6, r);
      P();
      ctx.moveTo(-r * 0.8, -r * 0.5);
      ctx.lineTo(0, r * 0.1);
      ctx.lineTo(r * 0.8, -r * 0.5);
      ctx.stroke();
      text(ctx, '+2', r * 0.55, r * 0.55, r * 0.7, C.mustard, 'center', 3 * s);
      break;
    case 'plane':
      P();
      ctx.moveTo(-r * 0.9, r * 0.1);
      ctx.lineTo(r * 0.9, -r * 0.5);
      ctx.lineTo(-r * 0.2, r * 0.6);
      ctx.lineTo(-r * 0.2, r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bellows':
      P();
      ctx.moveTo(-r * 0.8, -r * 0.4);
      ctx.lineTo(r * 0.3, -r * 0.6);
      ctx.lineTo(r * 0.3, r * 0.6);
      ctx.lineTo(-r * 0.8, r * 0.4);
      ctx.closePath();
      ctx.stroke();
      P();
      ctx.moveTo(r * 0.3, 0);
      ctx.lineTo(r * 0.9, 0);
      ctx.stroke();
      break;
    case 'glass':
      P();
      ctx.moveTo(-r * 0.35, r * 0.7);
      ctx.bezierCurveTo(-r * 0.8, r * 0.2, -r * 0.6, -r * 0.4, -r * 0.3, -r * 0.7);
      ctx.lineTo(r * 0.3, -r * 0.7);
      ctx.bezierCurveTo(r * 0.6, -r * 0.4, r * 0.8, r * 0.2, r * 0.35, r * 0.7);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'potato':
      P();
      ctx.ellipse(0, r * 0.15, r * 0.75, r * 0.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.fireOrange;
      P();
      ctx.moveTo(-r * 0.2, -r * 0.3);
      ctx.quadraticCurveTo(0, -r * 1.0, r * 0.2, -r * 0.3);
      ctx.fill();
      break;
    case 'fuse':
      P();
      ctx.moveTo(-r * 0.8, r * 0.6);
      ctx.bezierCurveTo(-r * 0.2, r * 0.6, -r * 0.4, -r * 0.3, r * 0.5, -r * 0.4);
      ctx.stroke();
      ctx.fillStyle = C.fire;
      P();
      ctx.arc(r * 0.6, -r * 0.45, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'owl':
      P();
      ctx.arc(-r * 0.3, 0, r * 0.3, 0, Math.PI * 2);
      ctx.arc(r * 0.3, 0, r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      P();
      ctx.arc(-r * 0.3, 0, r * 0.1, 0, Math.PI * 2);
      ctx.arc(r * 0.3, 0, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      P();
      ctx.moveTo(-r * 0.6, -r * 0.4);
      ctx.lineTo(-r * 0.4, -r * 0.7);
      ctx.moveTo(r * 0.6, -r * 0.4);
      ctx.lineTo(r * 0.4, -r * 0.7);
      ctx.stroke();
      break;
    case 'lantern':
      ctx.strokeRect(-r * 0.4, -r * 0.6, r * 0.8, r * 1.2);
      P();
      ctx.moveTo(-r * 0.4, -r * 0.2);
      ctx.lineTo(r * 0.4, -r * 0.2);
      ctx.moveTo(-r * 0.4, r * 0.2);
      ctx.lineTo(r * 0.4, r * 0.2);
      ctx.stroke();
      break;
    case 'wick':
      ctx.fillStyle = C.fire;
      for (const dx of [-0.35, 0.35]) {
        P();
        ctx.moveTo(dx * r, r * 0.6);
        ctx.quadraticCurveTo(dx * r - r * 0.35, 0, dx * r, -r * 0.7);
        ctx.quadraticCurveTo(dx * r + r * 0.35, 0, dx * r, r * 0.6);
        ctx.fill();
      }
      break;
    case 'eye':
      P();
      ctx.moveTo(-r * 0.9, 0);
      ctx.quadraticCurveTo(0, -r * 0.8, r * 0.9, 0);
      ctx.quadraticCurveTo(0, r * 0.8, -r * 0.9, 0);
      ctx.stroke();
      P();
      ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'purse':
      P();
      ctx.moveTo(-r * 0.7, -r * 0.2);
      ctx.lineTo(r * 0.7, -r * 0.2);
      ctx.lineTo(r * 0.55, r * 0.7);
      ctx.lineTo(-r * 0.55, r * 0.7);
      ctx.closePath();
      ctx.fill();
      P();
      ctx.arc(0, -r * 0.25, r * 0.35, Math.PI, 0);
      ctx.stroke();
      break;
    case 'feather':
      P();
      ctx.moveTo(-r * 0.7, r * 0.7);
      ctx.bezierCurveTo(-r * 0.6, -r * 0.2, r * 0.2, -r * 0.8, r * 0.7, -r * 0.7);
      ctx.bezierCurveTo(r * 0.6, 0, -r * 0.1, r * 0.5, -r * 0.7, r * 0.7);
      ctx.fill();
      break;
    case 'crown':
      P();
      ctx.moveTo(-r * 0.8, r * 0.5);
      ctx.lineTo(-r * 0.8, -r * 0.4);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(0, -r * 0.6);
      ctx.lineTo(r * 0.4, 0);
      ctx.lineTo(r * 0.8, -r * 0.4);
      ctx.lineTo(r * 0.8, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'stamp':
      ctx.fillRect(-r * 0.15, -r * 0.7, r * 0.3, r * 0.6);
      P();
      ctx.ellipse(0, -r * 0.75, r * 0.3, r * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-r * 0.6, -r * 0.1, r * 1.2, r * 0.3);
      ctx.fillRect(-r * 0.8, r * 0.3, r * 1.6, r * 0.25);
      break;
  }
  ctx.restore();
}

export function drawTag(ctx: Ctx, r: Rect, def: PartDef, s: number, hot: boolean, t: number, tilt = 0): void {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(tilt + (hot ? Math.sin(t * 8) * 0.03 : 0));
  const sc = hot ? 1.05 : 1;
  ctx.scale(sc, sc);
  const w = r.w;
  const h = r.h;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 18 * s, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2 + 18 * s, h / 2);
    ctx.lineTo(-w / 2, h / 2 - 18 * s);
    ctx.lineTo(-w / 2, -h / 2 + 18 * s);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(5 * s, 6 * s);
  shape();
  ctx.fillStyle = 'rgba(10,6,30,0.5)';
  ctx.fill();
  ctx.restore();
  shape();
  ctx.fillStyle = '#f7d9a0';
  ctx.fill();
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // eyelet + string
  ctx.beginPath();
  ctx.arc(-w / 2 + 16 * s, 0, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = C.mustard;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 16 * s, 0);
  ctx.quadraticCurveTo(-w / 2 - 10 * s, -h * 0.3, -w / 2 - 6 * s, -h * 0.55);
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = C.red;
  ctx.stroke();
  text(ctx, 'CART PART', -w / 2 + 34 * s, -h / 2 + 16 * s, 13 * s, C.redDark, 'left');
  text(ctx, def.name.toUpperCase(), -w / 2 + 34 * s, -h / 2 + 38 * s, fitSize(ctx, def.name.toUpperCase(), w - 50 * s, 26 * s), C.ink, 'left');
  wrapText(ctx, def.text, -w / 2 + 34 * s, -h / 2 + 54 * s, w - 48 * s, 14 * s, C.inkSoft);
  ctx.restore();
}

/** Hand-cut WICKSHIFT wordmark: each letter on its own tilted paper scrap. */
export function logo(ctx: Ctx, cx: number, cy: number, size: number, t: number, reduced: boolean): void {
  const word = 'WICKSHIFT';
  const cols = [C.red, C.mustard, C.teal, C.pink, C.blue, C.red, C.mustard, C.teal, C.pink];
  ctx.font = `700 ${Math.round(size)}px ${FONT}`;
  const widths = [...word].map((ch) => ctx.measureText(ch).width + size * 0.22);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  for (let i = 0; i < word.length; i++) {
    const w = widths[i];
    const wob = reduced ? 0 : Math.sin(t * 2.2 + i * 0.9);
    const tilt = ((i * 37) % 9) / 9 - 0.5;
    ctx.save();
    ctx.translate(x + w / 2, cy + wob * size * 0.04);
    ctx.rotate(tilt * 0.22 + wob * 0.03);
    rr(ctx, -w / 2 + 5, -size * 0.55 + 7, w - 2, size * 1.1, 6);
    ctx.fillStyle = 'rgba(10,6,30,0.5)';
    ctx.fill();
    rr(ctx, -w / 2, -size * 0.55, w - 2, size * 1.1, 6);
    ctx.fillStyle = cols[i];
    ctx.fill();
    ctx.lineWidth = Math.max(3, size * 0.06);
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    text(ctx, word[i], -1, 2, size, C.cream, 'center', size * 0.14);
    ctx.restore();
    x += w;
  }
}
