// The midnight desk: backdrop, level pieces, the build (on the bench or in a run)
// and the lamp's light. World drawings assume worldTransform() has been set.
import { C, BOOK_TONES } from './palette';
import { rr, inked, drawStick, drawPart, drawPin, LW } from './art';
import type { Cam } from './view';
import type { LevelDef, Pt, Zone } from '../sim/level';
import type { Blueprint } from '../sim/blueprint';
import { pinPos } from '../sim/blueprint';
import type { Run } from '../sim/run';
import { GRID } from '../sim/parts';

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- backdrop (screen space)

function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Night sky behind the desk, with a far shelf of book spines that drifts with the camera. */
export function drawBackdrop(ctx: Ctx, cam: Cam, t: number): void {
  const { W, H } = cam;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(0.6, C.skyMid);
  g.addColorStop(1, C.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // paper stars
  for (let i = 0; i < 40; i++) {
    const x = ((hash(i) * W * 1.3 - cam.x * 2) % (W * 1.3) + W * 1.3) % (W * 1.3);
    const y = hash(i + 50) * H * 0.55;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + i);
    ctx.fillStyle = `rgba(255,241,207,${0.25 + tw * 0.35})`;
    const s = 1.5 + hash(i + 9) * 2.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  // moon, cut from paper
  const mx = W * 0.82 - cam.x * 0.6;
  const mxw = ((mx % (W * 1.6)) + W * 1.6) % (W * 1.6) - W * 0.3;
  ctx.beginPath();
  ctx.arc(mxw, H * 0.18, Math.min(W, H) * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mxw + Math.min(W, H) * 0.03, H * 0.18 - Math.min(W, H) * 0.015, Math.min(W, H) * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(243,217,164,0.6)';
  ctx.fill();
  // far shelf of spines (parallax 0.3)
  const base = H * 0.78 + cam.y * cam.scale * 0.15;
  const off = cam.x * cam.scale * 0.3;
  let x = -((off % 600) + 600) % 600 - 600;
  let i = Math.floor(off / 600) * 40;
  while (x < W + 60) {
    const w = 18 + hash(i) * 26;
    const h = 60 + hash(i + 3) * 110;
    ctx.fillStyle = hash(i + 7) > 0.5 ? C.far : C.wall;
    ctx.fillRect(x, base - h, w - 3, h + H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + 4, base - h + 10, w - 11, 4);
    x += w;
    i++;
  }
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, base, W, H);
}

// ---------------------------------------------------------------- level (world space)

function groundPath(ctx: Ctx, line: Pt[], bottom: number): void {
  ctx.beginPath();
  ctx.moveTo(line[0][0], bottom);
  for (const [x, y] of line) ctx.lineTo(x, y);
  ctx.lineTo(line[line.length - 1][0], bottom);
  ctx.closePath();
}

export function drawLevel(ctx: Ctx, L: LevelDef, t: number, s: { delivered: boolean; letterGot: boolean }): void {
  const bottom = L.killY - 30;
  // wind first: it lives behind everything
  for (const w of L.wind ?? []) drawWind(ctx, w, t);
  drawWindow(ctx, L.window, t, s.delivered);
  for (const line of L.ground) {
    groundPath(ctx, line, bottom);
    ctx.fillStyle = C.desk;
    ctx.fill();
    // a band of lighter desk along the top edge
    ctx.save();
    groundPath(ctx, line, bottom);
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < line.length; i++) {
      const [x, y] = line[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = C.deskTop;
    ctx.stroke();
    ctx.restore();
    groundPath(ctx, line, bottom);
    ctx.lineWidth = LW * 1.6;
    ctx.strokeStyle = C.ink;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  L.blocks.forEach((poly, i) => drawBook(ctx, poly, i));
  for (const z of L.ink ?? []) drawInk(ctx, z, t);
  if (!s.letterGot) drawLetter(ctx, L.letter.x, L.letter.y, t);
}

function drawBook(ctx: Ctx, poly: Pt[], i: number): void {
  ctx.beginPath();
  poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  inked(ctx, BOOK_TONES[(i * 3 + 1) % BOOK_TONES.length], LW * 1.4);
  // spine bands along the bounding box
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.min(Math.max(...ys), y0 + 6);
  ctx.save();
  ctx.beginPath();
  poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,241,207,0.55)';
  if (x1 - x0 > y1 - y0) {
    ctx.fillRect(x0, y0 + 0.12, x1 - x0, 0.06);
    ctx.fillRect(x0, y1 - 0.18, x1 - x0, 0.06);
  } else {
    ctx.fillRect(x0, y0 + (y1 - y0) * 0.2, x1 - x0, 0.05);
    ctx.fillRect(x0, y0 + (y1 - y0) * 0.75, x1 - x0, 0.05);
  }
  ctx.restore();
}

function drawInk(ctx: Ctx, z: Zone, t: number): void {
  const top = z.y + z.h;
  ctx.beginPath();
  ctx.moveTo(z.x, z.y);
  ctx.lineTo(z.x, top);
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const x = z.x + (z.w * i) / n;
    ctx.lineTo(x, top + Math.sin(t * 2 + i * 0.9) * 0.04);
  }
  ctx.lineTo(z.x + z.w, z.y);
  ctx.closePath();
  inked(ctx, C.inkPool, LW * 1.2);
  // gloss
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = z.x + z.w * (0.15 + i * 0.3) + Math.sin(t * 0.7 + i) * 0.2;
    ctx.moveTo(x, top - 0.18);
    ctx.lineTo(x + 0.5, top - 0.18);
  }
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,140,255,0.45)';
  ctx.stroke();
}

function drawWind(ctx: Ctx, w: Zone & { fx: number }, t: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(w.x, w.y, w.w, w.h);
  ctx.clip();
  const dir = Math.sign(w.fx) || 1;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.05;
  for (let i = 0; i < 26; i++) {
    const y = w.y + hash(i + 200) * w.h;
    const sp = 1.5 + hash(i + 300) * 1.5;
    const len = 0.8 + hash(i + 400) * 1.2;
    const x = w.x + ((((hash(i + 500) * w.w + t * sp * dir) % w.w) + w.w) % w.w);
    ctx.strokeStyle = `rgba(200,220,255,${0.12 + hash(i + 600) * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - (dir * len) / 2, y + 0.08, x - dir * len, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The window you deliver to: dark until the lamp arrives. */
function drawWindow(ctx: Ctx, z: Zone, t: number, lit: boolean): void {
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  // halo so it's findable from anywhere
  const g = ctx.createRadialGradient(z.x + z.w / 2, z.y + z.h / 2, 0.2, z.x + z.w / 2, z.y + z.h / 2, z.w * 1.2);
  g.addColorStop(0, lit ? 'rgba(255,210,90,0.55)' : `rgba(255,197,61,${0.12 + pulse * 0.1})`);
  g.addColorStop(1, 'rgba(255,197,61,0)');
  ctx.fillStyle = g;
  ctx.fillRect(z.x - z.w, z.y - z.h * 0.3, z.w * 3, z.h * 2);
  // frame
  const m = 0.12;
  rr(ctx, z.x, z.y, z.w, z.h, 0.06);
  inked(ctx, C.paper, LW * 1.4);
  rr(ctx, z.x + m, z.y + m, z.w - m * 2, z.h - m * 2, 0.04);
  inked(ctx, lit ? C.fire : '#2a2160', LW);
  if (!lit) {
    // a dashed glow outline invites you in
    ctx.save();
    ctx.setLineDash([0.12, 0.1]);
    ctx.lineDashOffset = -t * 0.3;
    rr(ctx, z.x + m * 1.6, z.y + m * 1.6, z.w - m * 3.2, z.h - m * 3.2, 0.04);
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = `rgba(255,197,61,${0.5 + pulse * 0.4})`;
    ctx.stroke();
    ctx.restore();
  }
  // mullions
  ctx.beginPath();
  ctx.moveTo(z.x + z.w / 2, z.y + m);
  ctx.lineTo(z.x + z.w / 2, z.y + z.h - m);
  ctx.moveTo(z.x + m, z.y + z.h * 0.58);
  ctx.lineTo(z.x + z.w - m, z.y + z.h * 0.58);
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = C.paper;
  ctx.stroke();
  // roof / lintel
  ctx.beginPath();
  ctx.moveTo(z.x - 0.15, z.y + z.h);
  ctx.lineTo(z.x + z.w / 2, z.y + z.h + 0.45);
  ctx.lineTo(z.x + z.w + 0.15, z.y + z.h);
  ctx.closePath();
  inked(ctx, C.red, LW * 1.2);
}

export function drawLetter(ctx: Ctx, x: number, y: number, t: number): void {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.4) * 0.08);
  ctx.rotate(Math.sin(t * 1.7) * 0.12);
  rr(ctx, -0.26, -0.17, 0.52, 0.34, 0.03);
  inked(ctx, C.cream);
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.17);
  ctx.lineTo(0, -0.02);
  ctx.lineTo(0.26, 0.17);
  ctx.lineWidth = LW * 0.8;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -0.02, 0.07, 0, Math.PI * 2);
  inked(ctx, C.red, LW * 0.7);
  ctx.restore();
}

// ---------------------------------------------------------------- the build

/** A blueprint standing on the bench, as it will spawn. */
export function drawBlueprint(ctx: Ctx, L: LevelDef, bp: Blueprint, t: number, opts: { hotStick?: number; hotPart?: number; hidePart?: number } = {}): void {
  const o = L.origin;
  ctx.save();
  ctx.translate(o.x, o.y);
  bp.sticks.forEach((s, i) => {
    const a = pinPos(s.a);
    const b = pinPos(s.b);
    drawStick(ctx, a.x, a.y, b.x, b.y, { hot: opts.hotStick === i });
  });
  // lanterns float above their pin on a thread
  bp.parts.forEach((p, i) => {
    if (i === opts.hidePart || p.kind !== 'lantern') return;
    const a = pinPos(p.at);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x, a.y + 0.55);
    ctx.lineWidth = 0.015;
    ctx.strokeStyle = C.paper;
    ctx.stroke();
    drawPart(ctx, 'lantern', a.x, a.y + 0.72, 2, 0, { t });
  });
  bp.parts.forEach((p, i) => {
    if (i === opts.hidePart || p.kind === 'lantern') return;
    const a = pinPos(p.at);
    drawPart(ctx, p.kind, a.x, a.y, p.dir, 0, { t, flame: 1 });
  });
  for (const s of bp.sticks) for (const pin of [s.a, s.b]) drawPin(ctx, pin[0] * GRID, pin[1] * GRID, 0.03);
  if (opts.hotPart !== undefined && bp.parts[opts.hotPart]) {
    const a = pinPos(bp.parts[opts.hotPart].at);
    ctx.beginPath();
    ctx.arc(a.x, a.y, 0.3, 0, Math.PI * 2);
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = C.fire;
    ctx.stroke();
  }
  ctx.restore();
}

/** The build mid-run, from the physics bodies. */
export function drawRun(ctx: Ctx, r: Run, t: number, kicks: Map<number, number>): void {
  const m = r.main;
  const p = m.getPosition();
  const a = m.getAngle();
  // lantern threads
  for (const l of r.lanterns) {
    const from = m.getWorldPoint(l.local);
    const to = l.body.getWorldPoint({ x: 0, y: -0.3 });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineWidth = 0.015;
    ctx.strokeStyle = C.paper;
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  for (const s of r.bp.sticks) {
    const pa = pinPos(s.a);
    const pb = pinPos(s.b);
    drawStick(ctx, pa.x, pa.y, pb.x, pb.y);
  }
  r.rockets.forEach((k) => drawPart(ctx, 'rocket', k.local.x, k.local.y, k.part.dir, 0, { t, firing: r.firing.rockets }));
  r.springs.forEach((k, i) => drawPart(ctx, 'spring', k.local.x, k.local.y, k.part.dir, 0, { t, kick: kicks.get(i) ?? 0 }));
  const lp = r.bp.parts.find((q) => q.kind === 'lamp');
  if (lp) {
    const lpos = pinPos(lp.at);
    drawPart(ctx, 'lamp', lpos.x, lpos.y, 0, 0, { t, flame: r.flame });
  }
  for (const s of r.bp.sticks) for (const pin of [s.a, s.b]) drawPin(ctx, pin[0] * GRID, pin[1] * GRID, 0.03);
  ctx.restore();
  for (const w of r.wheels) {
    const wp = w.body.getPosition();
    drawPart(ctx, w.part.kind, wp.x, wp.y, 0, a, { t, spin: w.body.getAngle(), wind: a + (w.key && r.firing.drive ? -t * 8 : 0) });
  }
  for (const l of r.lanterns) {
    const lp2 = l.body.getPosition();
    drawPart(ctx, 'lantern', lp2.x, lp2.y, 2, l.body.getAngle(), { t, heat: r.firing.lanterns ? 1 : 0 });
  }
}

/** Warm light around the lamp. Cosmetic only: it never darkens anything. */
export function drawLampLight(ctx: Ctx, x: number, y: number, flame: number, t: number): void {
  if (flame <= 0) return;
  const r = 1.2 + flame * 2.6 + Math.sin(t * 13) * 0.05;
  const g = ctx.createRadialGradient(x, y, 0.05, x, y, r);
  g.addColorStop(0, `rgba(255,214,110,${0.28 + flame * 0.2})`);
  g.addColorStop(0.4, `rgba(255,170,60,${0.08 + flame * 0.08})`);
  g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
