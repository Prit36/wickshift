// Screen-space interface pieces: paper panels, buttons, logo.
import { C, FONT, BODY } from './palette';
import { rr } from './art';

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

/** A five-point paper star. */
export function star(ctx: Ctx, x: number, y: number, r: number, filled: boolean, s: number, color: string = C.mustard): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * k;
    const py = y + Math.sin(a) * k;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? color : 'rgba(26,18,51,0.35)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

/** A small keycap label, e.g. "Space". */
export function keycap(ctx: Ctx, label: string, x: number, y: number, s: number, align: 'left' | 'center' = 'center'): number {
  ctx.font = `700 ${Math.round(14 * s)}px ${BODY}`;
  const w = Math.max(22 * s, ctx.measureText(label).width + 12 * s);
  const x0 = align === 'center' ? x - w / 2 : x;
  rr(ctx, x0, y - 11 * s, w, 22 * s, 5 * s);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  text(ctx, label, x0 + w / 2, y + 1, 14 * s, C.ink, 'center', 0, BODY, 700);
  return w;
}
