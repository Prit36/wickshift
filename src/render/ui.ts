// Screen-space interface pieces: paper panels, stamps, tags, buttons, logo.
import { C, FONT, BODY, STAMP_INKS } from './palette';
import { rr } from './art';
import type { StampDef } from '../sim/stamps';
import type { PartDef } from '../sim/rules';
import { FAMILY_INFO, type Family } from '../sim/tricks';

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

const RARITY_COL: Record<StampDef['rarity'], string> = { common: '#9a8f7a', uncommon: '#2f6fd6', rare: '#c9338a' };
const WHEN_LABEL: Record<StampDef['when'], string> = { trick: 'AS YOU DRIVE', post: 'WHEN YOU POST', rule: 'ALWAYS', money: 'PAYS PENNIES' };

export function drawStamp(ctx: Ctx, r: Rect, def: StampDef, s: number, hot: boolean, t: number, tilt = 0, opts: { chips?: boolean; fire?: number } = {}): void {
  const ink = STAMP_INKS[def.ink % STAMP_INKS.length];
  const fire = opts.fire ?? 0;
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(tilt + (hot ? Math.sin(t * 8) * 0.03 : 0) + (fire > 0 ? Math.sin(t * 60) * 0.12 * fire : 0));
  const sc = (hot ? 1.06 : 1) * (1 + fire * 0.25);
  ctx.scale(sc, sc);
  const lr = { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h };
  ctx.save();
  ctx.translate(5 * s, 6 * s);
  stampShape(ctx, lr, s);
  ctx.fillStyle = 'rgba(10,6,30,0.5)';
  ctx.fill();
  ctx.restore();
  stampShape(ctx, lr, s);
  ctx.fillStyle = fire > 0 ? C.fireHot : C.cream;
  ctx.fill();
  ctx.lineWidth = def.rarity === 'common' ? 2 * s : 3 * s;
  ctx.strokeStyle = def.rarity === 'common' ? 'rgba(26,18,51,0.4)' : RARITY_COL[def.rarity];
  ctx.stroke();
  const pad = 10 * s;
  rr(ctx, lr.x + pad, lr.y + pad, lr.w - pad * 2, lr.h - pad * 2, 4 * s);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // rare stamps get a foil sheen
  if (def.rarity === 'rare') {
    ctx.save();
    rr(ctx, lr.x + pad, lr.y + pad, lr.w - pad * 2, lr.h - pad * 2, 4 * s);
    ctx.clip();
    const sx = ((t * 0.6) % 2) * lr.w * 1.6 - lr.w * 1.1;
    const g = ctx.createLinearGradient(sx, lr.y, sx + lr.w * 0.5, lr.y + lr.h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lr.x, lr.y, lr.w, lr.h);
    ctx.restore();
  }
  motif(ctx, def.motif, 0, -lr.h * 0.08, Math.min(lr.w, lr.h) * 0.24, s);
  const bh = Math.max(20 * s, lr.h * 0.2);
  ctx.fillStyle = C.cream;
  ctx.fillRect(lr.x + pad + 3 * s, lr.y + lr.h - pad - bh - 3 * s, lr.w - pad * 2 - 6 * s, bh);
  // fit the name to the band: shrink it, and on small stamps split a two-word name over two lines
  // so it never spills into the next stamp
  const label = def.name.toUpperCase();
  const maxW = lr.w - pad * 2 - 12 * s;
  const cyName = lr.y + lr.h - pad - bh / 2 - 2 * s;
  const fit = (str: string, size: number) => {
    ctx.font = `700 ${Math.round(size)}px ${FONT}`;
    const w = ctx.measureText(str).width;
    return w > maxW ? (size * maxW) / w : size;
  };
  const one = fit(label, bh * 0.72);
  const sp = label.indexOf(' ');
  if (one < bh * 0.5 && sp > 0) {
    const a = label.slice(0, sp);
    const b = label.slice(sp + 1);
    const fs2 = Math.min(fit(a, bh * 0.46), fit(b, bh * 0.46));
    text(ctx, a, 0, cyName - fs2 * 0.55, fs2, C.ink, 'center');
    text(ctx, b, 0, cyName + fs2 * 0.55, fs2, C.ink, 'center');
  } else text(ctx, label, 0, cyName, one, C.ink, 'center');
  if (opts.chips) {
    const cw = Math.min(lr.w - pad * 2, 110 * s);
    rr(ctx, -cw / 2, lr.y + pad - 8 * s, cw, 16 * s, 8 * s);
    ctx.fillStyle = C.ink;
    ctx.fill();
    text(ctx, WHEN_LABEL[def.when], 0, lr.y + pad, fitSize(ctx, WHEN_LABEL[def.when], cw - 10 * s, 11 * s), C.cream, 'center');
  }
  ctx.restore();
}

export function rarityColour(r: StampDef['rarity']): string {
  return RARITY_COL[r];
}

const TONE: Record<string, string> = { pink: C.pink, teal: C.teal, mustard: C.mustard, green: C.green, blue: C.blue, red: C.red, fireOrange: C.fireOrange, fire: C.fire };

export function familyColour(f: Family): string {
  return TONE[FAMILY_INFO[f].tone];
}

/** A holiday postcard that levels a trick family. */
export function drawPostcard(ctx: Ctx, r: Rect, fam: Family, level: number, s: number, hot: boolean, t: number, tilt = 0): void {
  const info = FAMILY_INFO[fam];
  const col = TONE[info.tone];
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(tilt + (hot ? Math.sin(t * 8) * 0.03 : 0));
  if (hot) ctx.scale(1.05, 1.05);
  const w = r.w;
  const h = r.h;
  rr(ctx, -w / 2 + 5 * s, -h / 2 + 6 * s, w, h, 6 * s);
  ctx.fillStyle = 'rgba(10,6,30,0.5)';
  ctx.fill();
  rr(ctx, -w / 2, -h / 2, w, h, 6 * s);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  const pw = w - 16 * s;
  const ph = h * 0.4;
  const px = -pw / 2;
  const py = -h / 2 + 8 * s;
  ctx.save();
  rr(ctx, px, py, pw, ph, 4 * s);
  ctx.clip();
  const g = ctx.createLinearGradient(0, py, 0, py + ph);
  g.addColorStop(0, '#2c2f7a');
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.fillRect(px, py, pw, ph);
  postcardScene(ctx, info.scene, 0, py + ph * 0.55, Math.min(pw, ph) * 0.42, s, t);
  ctx.restore();
  rr(ctx, px, py, pw, ph, 4 * s);
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fillRect(px + pw - 22 * s, py + 6 * s, 16 * s, 18 * s);
  ctx.strokeRect(px + pw - 22 * s, py + 6 * s, 16 * s, 18 * s);
  text(ctx, 'POSTCARD', 0, py + ph + 12 * s, 12 * s, C.redDark, 'center');
  const name = info.postcard.toUpperCase();
  text(ctx, name, 0, py + ph + 29 * s, fitSize(ctx, name, w - 16 * s, 18 * s), C.ink, 'center');
  const line = `${info.name.toUpperCase()} ${level} → ${level + 1}`;
  rr(ctx, -w / 2 + 14 * s, py + ph + 40 * s, w - 28 * s, 22 * s, 11 * s);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  text(ctx, line, 0, py + ph + 51.5 * s, fitSize(ctx, line, w - 40 * s, 16 * s), C.ink, 'center');
  const line2 = '+50% heat · +1 spark';
  text(ctx, line2, 0, py + ph + 74 * s, fitSize(ctx, line2, w - 16 * s, 13 * s, BODY, 600), C.inkSoft, 'center', 0, BODY, 600);
  ctx.restore();
}

function postcardScene(ctx: Ctx, scene: string, x: number, y: number, r: number, s: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.cream;
  ctx.fillStyle = C.cream;
  switch (scene) {
    case 'loop':
      ctx.beginPath();
      ctx.arc(0, -r * 0.3, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(-r * 1.6, r * 0.4, r * 3.2, r * 0.6);
      break;
    case 'cloud':
      for (const [dx, dy, rr2] of [[-0.5, 0, 0.4], [0, -0.25, 0.5], [0.5, 0, 0.4]]) {
        ctx.beginPath();
        ctx.arc(dx * r, dy * r, rr2 * r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'road':
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.6);
      ctx.lineTo(r * 0.2, -r * 0.6);
      ctx.lineTo(r * 1.4, r);
      ctx.lineTo(-r * 1.4, r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C.mustardDark;
      ctx.setLineDash([6 * s, 6 * s]);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.5);
      ctx.lineTo(0, r);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'spa':
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.4, -r * 0.1);
        ctx.bezierCurveTo(i * r * 0.4 + r * 0.2, -r * 0.4, i * r * 0.4 - r * 0.2, -r * 0.6, i * r * 0.4 + Math.sin(t * 2 + i) * r * 0.1, -r * 0.9);
        ctx.stroke();
      }
      break;
    case 'pier':
      ctx.fillRect(-r * 1.6, -r * 0.1, r * 3.2, r * 0.2);
      for (let i = -3; i <= 3; i++) ctx.fillRect(i * r * 0.45 - 2 * s, r * 0.1, 4 * s, r * 0.8);
      break;
    case 'city':
      for (let i = -3; i <= 3; i++) {
        const hh = r * (0.4 + ((i * 7 + 9) % 5) * 0.2);
        ctx.fillRect(i * r * 0.42 - r * 0.18, r * 0.8 - hh, r * 0.36, hh);
      }
      break;
    case 'ring':
      ctx.strokeStyle = C.fire;
      ctx.lineWidth = Math.max(3, 5 * s);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.1, r * 0.35, r * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.5, r);
      ctx.lineTo(0, r * 0.7);
      ctx.lineTo(r * 1.5, r);
      ctx.fill();
      break;
    case 'match':
      ctx.beginPath();
      ctx.moveTo(-r * 1.6, r);
      ctx.lineTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(0, r * 0.2);
      ctx.lineTo(r * 0.6, -r * 0.9);
      ctx.lineTo(r * 1.6, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.arc(r * 0.6, -r * 0.95, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

export function motif(ctx: Ctx, kind: string, x: number, y: number, r: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.cream;
  ctx.fillStyle = C.cream;
  const P = () => ctx.beginPath();
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    P();
    ctx.moveTo(ax * r, ay * r);
    ctx.lineTo(bx * r, by * r);
    ctx.lineTo(cx * r, cy * r);
    ctx.closePath();
    ctx.fill();
  };
  const envelope = (sc: number) => {
    ctx.strokeRect(-r * 0.8 * sc, -r * 0.5 * sc, r * 1.6 * sc, r * sc);
    P();
    ctx.moveTo(-r * 0.8 * sc, -r * 0.5 * sc);
    ctx.lineTo(0, r * 0.1 * sc);
    ctx.lineTo(r * 0.8 * sc, -r * 0.5 * sc);
    ctx.stroke();
  };
  switch (kind) {
    case 'loop':
      P();
      ctx.arc(0, 0, r * 0.7, Math.PI * 0.2, Math.PI * 1.9);
      ctx.stroke();
      tri(0.62, -0.55, 0.75, -0.05, 0.25, -0.3);
      break;
    case 'drop':
      P();
      ctx.moveTo(0, -r * 0.8);
      ctx.bezierCurveTo(r * 0.7, 0, r * 0.6, r * 0.7, 0, r * 0.7);
      ctx.bezierCurveTo(-r * 0.6, r * 0.7, -r * 0.7, 0, 0, -r * 0.8);
      ctx.fill();
      break;
    case 'cube':
      ctx.strokeRect(-r * 0.55, -r * 0.35, r * 0.8, r * 0.8);
      P();
      ctx.moveTo(-r * 0.55, -r * 0.35);
      ctx.lineTo(-r * 0.25, -r * 0.65);
      ctx.lineTo(r * 0.55, -r * 0.65);
      ctx.lineTo(r * 0.25, -r * 0.35);
      ctx.moveTo(r * 0.55, -r * 0.65);
      ctx.lineTo(r * 0.55, r * 0.15);
      ctx.lineTo(r * 0.25, r * 0.45);
      ctx.stroke();
      break;
    case 'ring':
      P();
      ctx.ellipse(0, 0, r * 0.35, r * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.fire;
      for (const a of [0.4, 1.6, 2.8, 4.2, 5.4]) {
        P();
        ctx.arc(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.8, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'kite':
      P();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(r * 0.5, -r * 0.1);
      ctx.lineTo(0, r * 0.4);
      ctx.lineTo(-r * 0.5, -r * 0.1);
      ctx.closePath();
      ctx.fill();
      P();
      ctx.moveTo(0, r * 0.4);
      ctx.bezierCurveTo(r * 0.3, r * 0.6, -r * 0.3, r * 0.7, 0, r * 0.95);
      ctx.stroke();
      break;
    case 'wind':
    case 'wind2':
      for (const [dy, L] of [[-0.4, 0.7], [0, 0.9], [0.4, 0.6]]) {
        P();
        ctx.moveTo(-r * 0.8, dy * r);
        ctx.lineTo(r * (L - 0.3), dy * r);
        ctx.arc(r * (L - 0.3), dy * r - r * 0.15, r * 0.15, Math.PI / 2, -Math.PI / 2, true);
        ctx.stroke();
      }
      if (kind === 'wind2') text(ctx, '2', r * 0.6, r * 0.65, r * 0.7, C.mustard, 'center', 3 * s);
      break;
    case 'envelope':
      envelope(1);
      ctx.fillStyle = C.red;
      P();
      ctx.arc(0, r * 0.15, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'envelopeBig':
      envelope(1.15);
      text(ctx, '+', r * 0.62, r * 0.6, r * 0.9, C.mustard, 'center', 3 * s);
      break;
    case 'skull':
      P();
      ctx.arc(0, -r * 0.15, r * 0.6, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(r * 0.35, r * 0.6);
      ctx.lineTo(-r * 0.35, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.ink;
      P();
      ctx.arc(-r * 0.22, -r * 0.1, r * 0.15, 0, Math.PI * 2);
      ctx.arc(r * 0.22, -r * 0.1, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'arrowBack':
      P();
      ctx.arc(0, 0, r * 0.6, -Math.PI * 0.1, Math.PI * 1.3, false);
      ctx.stroke();
      tri(0.25, -0.75, -0.05, -0.45, 0.35, -0.3);
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
    case 'seal':
      ctx.fillStyle = C.red;
      P();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rad = i % 2 ? r * 0.62 : r * 0.75;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      text(ctx, 'W', 0, r * 0.05, r * 0.8, C.cream, 'center');
      break;
    case 'house':
      tri(-0.8, -0.05, 0, -0.75, 0.8, -0.05);
      ctx.fillRect(-r * 0.6, -r * 0.05, r * 1.2, r * 0.75);
      ctx.fillStyle = C.fire;
      ctx.fillRect(-r * 0.15, r * 0.15, r * 0.3, r * 0.3);
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
    case 'box': {
      const cols = [C.red, C.mustard, C.teal, C.pink];
      for (let i = 0; i < 4; i++) {
        const bx = (i % 2 ? 0.05 : -0.75) * r;
        const by = (i < 2 ? -0.75 : 0.05) * r;
        ctx.fillStyle = cols[i];
        ctx.fillRect(bx, by, r * 0.7, r * 0.7);
        ctx.strokeRect(bx, by, r * 0.7, r * 0.7);
      }
      break;
    }
    case 'one':
      text(ctx, '1', 0, r * 0.05, r * 1.7, C.cream, 'center', 0);
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
    case 'flag':
      ctx.fillRect(-r * 0.6, -r * 0.8, r * 0.12, r * 1.6);
      ctx.fillStyle = C.red;
      P();
      ctx.moveTo(-r * 0.48, -r * 0.8);
      ctx.lineTo(r * 0.7, -r * 0.55);
      ctx.lineTo(-r * 0.48, -r * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    case 'moon':
      P();
      ctx.arc(0, 0, r * 0.7, Math.PI * 0.35, Math.PI * 1.65);
      ctx.arc(r * 0.3, 0, r * 0.55, Math.PI * 1.55, Math.PI * 0.45, true);
      ctx.closePath();
      ctx.fill();
      break;
    case 'album':
      ctx.strokeRect(-r * 0.75, -r * 0.6, r * 1.5, r * 1.2);
      P();
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(0, r * 0.6);
      ctx.stroke();
      for (const [dx, dy] of [[-0.55, -0.4], [0.15, -0.4], [-0.55, 0.1], [0.15, 0.1]]) ctx.fillRect(dx * r, dy * r, r * 0.35, r * 0.3);
      break;
    case 'fire':
      ctx.fillStyle = C.fireOrange;
      P();
      ctx.moveTo(-r * 0.6, r * 0.7);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.1, -r * 0.2, -r * 0.8);
      ctx.quadraticCurveTo(-r * 0.1, -r * 0.2, r * 0.15, -r * 0.4);
      ctx.quadraticCurveTo(r * 0.9, 0, r * 0.6, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.fire;
      P();
      ctx.ellipse(0, r * 0.35, r * 0.3, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'owl':
      P();
      ctx.arc(-r * 0.3, 0, r * 0.3, 0, Math.PI * 2);
      ctx.moveTo(r * 0.6, 0);
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
    case 'oil':
      P();
      ctx.ellipse(-r * 0.2, r * 0.25, r * 0.5, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      P();
      ctx.moveTo(r * 0.2, r * 0.05);
      ctx.lineTo(r * 0.85, -r * 0.6);
      ctx.stroke();
      ctx.fillStyle = C.ink;
      P();
      ctx.arc(r * 0.9, -r * 0.4, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'due':
      ctx.strokeRect(-r * 0.85, -r * 0.5, r * 1.7, r);
      text(ctx, 'DUE', 0, 0, r * 0.85, C.cream, 'center');
      break;
    case 'glass':
      P();
      ctx.moveTo(-r * 0.35, r * 0.7);
      ctx.bezierCurveTo(-r * 0.8, r * 0.2, -r * 0.6, -r * 0.4, -r * 0.3, -r * 0.7);
      ctx.lineTo(r * 0.3, -r * 0.7);
      ctx.bezierCurveTo(r * 0.6, -r * 0.4, r * 0.8, r * 0.2, r * 0.35, r * 0.7);
      ctx.closePath();
      ctx.stroke();
      P();
      ctx.moveTo(-r * 0.1, -r * 0.4);
      ctx.lineTo(-r * 0.25, r * 0.2);
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
      ctx.fillStyle = C.fire;
      P();
      ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'penny':
      ctx.fillStyle = C.ink;
      P();
      ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 2 * s);
      ctx.stroke();
      text(ctx, '1d', 0, r * 0.05, r * 0.8, C.cream, 'center');
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
    case 'copy':
      ctx.strokeRect(-r * 0.75, -r * 0.65, r * 0.9, r * 1.1);
      ctx.fillRect(-r * 0.2, -r * 0.4, r * 0.9, r * 1.1);
      break;
    default:
      P();
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
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
