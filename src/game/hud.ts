// Driving HUD: postage meter and course strip, lamp glasses, pennies, the stamp
// album (stamps shake when they fire), and labels pinned to things in the world.
import type { Game } from './game';
import { SIGNS } from './game';
import { INSPECTORS } from '../sim/shift';
import { KIND_NAME, ROUTES } from '../sim/night';
import { STAMPS, MAX_STAMPS } from '../sim/stamps';
import type { Pose } from '../sim/sim';
import { groundAt, type Feature } from '../sim/terrain';
import { toScreen } from '../render/world';
import { rr } from '../render/art';
import { C, BODY } from '../render/palette';
import { panel, text, fmt, coin, drawStamp } from '../render/ui';
import { fmtSparks } from './tally';

type Ctx = CanvasRenderingContext2D;

export function meterY(g: Game): number {
  return 14 * g.s;
}

export function routeLabel(route: number): string {
  return route > ROUTES ? `OVERTIME ${route - ROUTES}` : `ROUTE ${route}/${ROUTES}`;
}

export function drawHud(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const sh = g.shift;
  const target = sh.target;
  // ---- postage meter, top centre
  const mw = Math.min(W - 300 * s, 560 * s);
  const mx = W / 2 - mw / 2;
  const my = meterY(g);
  const bump = g.meterBump * 6 * s;
  panel(ctx, { x: mx, y: my - bump / 2, w: mw, h: 64 * s + bump }, C.cream, s);
  text(ctx, `${KIND_NAME[sh.cfg.kind].toUpperCase()} · ${routeLabel(sh.cfg.route)}`, mx + 14 * s, my + 18 * s, 17 * s, sh.cfg.rule ? C.redDark : C.inkSoft);
  const posted = g.shownPosted;
  const met = posted >= target;
  text(ctx, `${fmt(posted)} / ${fmt(target)}`, mx + mw - 14 * s, my + 18 * s, 22 * s, met ? C.greenDark : C.ink, 'right');
  const bx = mx + 14 * s;
  const by = my + 34 * s;
  const bw = mw - 28 * s;
  const bh = 18 * s;
  rr(ctx, bx, by, bw, bh, 6 * s);
  ctx.fillStyle = 'rgba(26,18,51,0.12)';
  ctx.fill();
  const k = Math.min(1, posted / target);
  if (k > 0) {
    rr(ctx, bx, by, Math.max(bh, bw * k), bh, 6 * s);
    ctx.fillStyle = met ? C.green : C.fire;
    ctx.fill();
  }
  // ghost: what the flame would add at a plain window
  const ghost = sh.flame.alive && !sh.done ? Math.min(1, (posted + sh.flame.carried) / target) : 0;
  if (ghost > k) {
    ctx.fillStyle = `rgba(255,138,31,${0.3 + 0.15 * Math.sin(g.t * 6)})`;
    ctx.fillRect(bx + bw * k, by + 3 * s, bw * (ghost - k), bh - 6 * s);
  }
  rr(ctx, bx, by, bw, bh, 6 * s);
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  // ---- course strip: where the windows are, and what kind
  const course = sh.course;
  const span = course.endX - course.startX;
  const cy = my + 64 * s + 16 * s;
  ctx.fillStyle = 'rgba(255,241,207,0.35)';
  ctx.fillRect(bx, cy - 1 * s, bw, 3 * s);
  for (const w of course.windows) {
    const x = bx + ((w.x - course.startX) / span) * bw;
    const lit = sh.lit.has(w.id);
    const skipped = sh.skipped.has(w.id);
    ctx.beginPath();
    if (w.final) ctx.rect(x - 7 * s, cy - 9 * s, 14 * s, 16 * s);
    else if (w.gold) ctx.arc(x, cy - 1 * s, 6 * s, 0, Math.PI * 2);
    else {
      const top = w.high ? 13 : 8;
      ctx.moveTo(x - 5 * s, cy + 5 * s);
      ctx.lineTo(x - 5 * s, cy - 2 * s);
      ctx.lineTo(x, cy - top * s);
      ctx.lineTo(x + 5 * s, cy - 2 * s);
      ctx.lineTo(x + 5 * s, cy + 5 * s);
      ctx.closePath();
    }
    ctx.fillStyle = lit ? C.fire : skipped ? 'rgba(26,18,51,0.6)' : w.final ? C.red : w.gold ? '#f2b91f' : w.high ? C.mustard : C.cream;
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
  const cxp = bx + Math.max(0, Math.min(1, (sh.sim.pos.x - course.startX) / span)) * bw;
  ctx.beginPath();
  ctx.arc(cxp, cy, 6 * s, 0, Math.PI * 2);
  ctx.fillStyle = C.red;
  ctx.fill();
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = C.ink;
  ctx.stroke();

  // ---- lamp glasses, top left
  for (let i = 0; i < g.run.glassesMax; i++) {
    const x = 26 * s + i * 34 * s;
    const y = 30 * s;
    const ok = i < sh.glasses;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = ok ? 1 : 0.35;
    ctx.beginPath();
    ctx.moveTo(-8 * s, 14 * s);
    ctx.bezierCurveTo(-16 * s, 4 * s, -12 * s, -8 * s, -6 * s, -16 * s);
    ctx.lineTo(6 * s, -16 * s);
    ctx.bezierCurveTo(12 * s, -8 * s, 16 * s, 4 * s, 8 * s, 14 * s);
    ctx.closePath();
    ctx.fillStyle = ok ? 'rgba(200,235,255,0.5)' : 'rgba(26,18,51,0.5)';
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    if (ok) {
      ctx.beginPath();
      ctx.moveTo(0, 10 * s);
      ctx.quadraticCurveTo(-6 * s, 2 * s, 0, -8 * s);
      ctx.quadraticCurveTo(6 * s, 2 * s, 0, 10 * s);
      ctx.fillStyle = C.fire;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-6 * s, -6 * s);
      ctx.lineTo(4 * s, 2 * s);
      ctx.lineTo(-2 * s, 8 * s);
      ctx.strokeStyle = C.cream;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (sh.cfg.rule) {
    const name = `INSPECTOR · ${INSPECTORS[sh.cfg.rule].name.toUpperCase()}`;
    ctx.font = `700 ${Math.round(15 * s)}px "Barlow Condensed", sans-serif`;
    const tw = ctx.measureText(name).width + 20 * s;
    rr(ctx, 12 * s, 56 * s, tw, 24 * s, 12 * s);
    ctx.fillStyle = C.pink;
    ctx.fill();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    text(ctx, name, 22 * s, 68 * s, 15 * s, C.ink);
  }

  // ---- pause and pennies, top right
  const pr = { x: W - 56 * s, y: 12 * s, w: 44 * s, h: 44 * s };
  panel(ctx, pr, C.cream, s * 0.8);
  ctx.fillStyle = C.ink;
  ctx.fillRect(pr.x + 14 * s, pr.y + 12 * s, 6 * s, 20 * s);
  ctx.fillRect(pr.x + 25 * s, pr.y + 12 * s, 6 * s, 20 * s);
  g.hits.push({ r: pr, id: 'pause' });
  const pennies = g.run.pennies + sh.pennies;
  coin(ctx, W - 130 * s, 34 * s, 13 * s);
  text(ctx, `${pennies}`, W - 110 * s, 35 * s, 26 * s, C.mustard, 'left', 5 * s);
  // ---- the album, under the pennies: shakes when a stamp fires
  const sw = 40 * s;
  const shh = 48 * s;
  // narrow screens: the album would cover the course strip, so it drops below it
  const albumX = W - 16 * s - MAX_STAMPS * (sw + 6 * s);
  const albumY = albumX < mx + mw + 8 * s ? cy + 14 * s : 66 * s;
  for (let i = 0; i < MAX_STAMPS; i++) {
    const r = { x: W - 16 * s - (MAX_STAMPS - i) * (sw + 6 * s), y: albumY, w: sw, h: shh };
    const id = g.run.stamps[i];
    if (!id) {
      rr(ctx, r.x + 3 * s, r.y + 3 * s, r.w - 6 * s, r.h - 6 * s, 4 * s);
      ctx.setLineDash([4 * s, 4 * s]);
      ctx.lineWidth = 1.5 * s;
      ctx.strokeStyle = 'rgba(255,241,207,0.3)';
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    const fire = g.fx.reduced ? 0 : g.slotFire[i];
    drawStamp(ctx, r, STAMPS[id], s * 0.36, false, g.t, i % 2 ? 0.05 : -0.05, { fire });
  }
}

/** Labels pinned to the world: the flame readout, the POST prompt, signposts. */
export function drawWorldLabels(g: Game, ctx: Ctx, chassis: Pose): void {
  const sh = g.shift;
  const s = g.s;
  if (g.mode !== 'drive' && g.mode !== 'results' && g.mode !== 'intro') return;
  const fin = sh.course.windows.find((w) => w.final);
  if (fin && Math.abs(fin.x - g.cam.x) < g.cam.W / g.cam.ppm) {
    const sp = toScreen(g.cam, fin.x, fin.y + 4.95);
    text(ctx, 'SORTING OFFICE', sp.x, sp.y, g.cam.ppm * 0.75, C.red, 'center');
  }
  const flame = sh.flame;
  if (!sh.sim.crashed && flame.alive && g.mode !== 'intro') {
    const sp = toScreen(g.cam, chassis.x, chassis.y + 2.1);
    const frag = sh.fragility();
    const cold = sh.cfg.rule === 'coldSnap';
    const col = frag > 0.75 ? C.fireRed : frag > 0.4 ? C.fireOrange : cold ? '#bfe3ff' : C.fire;
    const wob = frag > 0.75 && !g.fx.reduced ? Math.sin(g.t * 30) * 2 * s : 0;
    const label = `${fmt(flame.heat)} × ${fmtSparks(flame.sparks)}`;
    text(ctx, label, sp.x + wob, sp.y, 30 * s, col, 'center', 7 * s);
    if (frag > 0.75 && Math.sin(g.t * 10) > -0.3) text(ctx, 'FRAGILE!', sp.x, sp.y + 24 * s, 15 * s, C.fireRed, 'center', 4 * s);
    if (sh.live && sh.live.heat > 0) text(ctx, sh.live.label.toUpperCase(), sp.x, sp.y - 28 * s, 20 * s, C.cream, 'center', 5 * s);
  } else if (sh.live && !sh.sim.crashed) {
    const sp = toScreen(g.cam, chassis.x, chassis.y + 2.0);
    text(ctx, sh.live.label.toUpperCase(), sp.x, sp.y, 22 * s, C.cream, 'center', 5 * s);
  }
  // the POST prompt over the window in range
  const w = sh.windowInRange();
  if (w && g.mode === 'drive') {
    const wy = w.high ? w.y + 2.1 : w.gold ? w.y + 4.4 : w.y + 5.8;
    const sp = toScreen(g.cam, w.x, wy);
    const bounce = g.fx.reduced ? 0 : Math.abs(Math.sin(g.t * 8)) * 6 * s;
    if (flame.alive) {
      const key = g.input.touchUI ? 'TAP POST' : 'SPACE';
      const mult = w.high ? 2 : 1;
      const r = { x: sp.x - 100 * s, y: sp.y - 40 * s - bounce, w: 200 * s, h: 62 * s };
      panel(ctx, r, w.gold ? '#f2b91f' : C.mustard, s * 0.8);
      text(ctx, `POST! · ${key}`, sp.x, r.y + 19 * s, 21 * s, C.ink, 'center');
      text(ctx, `${fmt(flame.heat)} × ${fmtSparks(flame.sparks * mult)}${mult > 1 ? '  (×2)' : ''}`, sp.x, r.y + 43 * s, 19 * s, C.redDark, 'center');
    }
  }
  // signposts: name each new thing the first few times you meet it
  if (g.mode !== 'drive') return;
  const half = g.cam.W / g.cam.ppm / 2;
  const shown = new Set<string>();
  const sign = (key: string, x: number, y: number) => {
    if (shown.has(key) || g.learned('f:' + key)) return;
    if (x < g.cam.x - half + 1 || x > g.cam.x + half - 1) return;
    shown.add(key);
    const sp = toScreen(g.cam, x, y);
    const label = SIGNS[key as keyof typeof SIGNS];
    ctx.font = `700 ${Math.round(16 * s)}px "Barlow Condensed", sans-serif`;
    const tw = ctx.measureText(label).width + 22 * s;
    const bob = g.fx.reduced ? 0 : Math.sin(g.t * 3 + x) * 3 * s;
    ctx.save();
    ctx.translate(sp.x, sp.y + bob);
    ctx.rotate(-0.03);
    rr(ctx, -tw / 2, -14 * s, tw, 28 * s, 6 * s);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6 * s, 14 * s);
    ctx.lineTo(0, 24 * s);
    ctx.lineTo(6 * s, 14 * s);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.stroke();
    text(ctx, label, 0, 1 * s, 16 * s, C.ink, 'center');
    ctx.restore();
  };
  for (const f of sh.course.features) {
    if (sh.used.has(f.id)) continue;
    const [x, y] = signAt(g, f);
    if (y !== null) sign(f.kind, x, y);
  }
  for (const win of sh.course.windows) {
    if (win.final || sh.lit.has(win.id)) continue;
    if (win.gold) sign('gold', win.x, win.y + 6.2);
    else if (win.high) sign('high', win.x, win.y + 3.2);
  }
}

function signAt(g: Game, f: Feature): [number, number | null] {
  const c = g.shift.course;
  switch (f.kind) {
    case 'striker':
    case 'tacks': {
      const x = (f.x0 + f.x1) / 2;
      const gy = groundAt(c, x);
      return [x, gy === null ? null : gy + 2.6];
    }
    case 'rail':
      return [f.x0 + 2.5, f.y0 + 2.6];
    case 'trap':
      return [f.x, f.y + 2.8];
    case 'hoop':
      return [f.x, f.y + f.r + 1.6];
    case 'stack':
      return [f.x + 0.5, f.y + f.rows * 0.5 + 2.2];
  }
}

export function drawPads(g: Game, ctx: Ctx): void {
  const s = Math.max(0.8, g.s);
  const W = g.cam.W;
  const H = g.cam.H;
  const r = 52 * s;
  const pads = g.input.pads;
  pads.brake = { x: 30 * s + r, y: H - 30 * s - r, r };
  pads.gas = { x: W - 30 * s - r, y: H - 30 * s - r, r };
  pads.post = { x: W - 30 * s - r * 3.4, y: H - 30 * s - r * 0.9, r: r * 0.8 };
  const draw = (z: 'gas' | 'brake' | 'post', label: string, col: string) => {
    const p = pads[z];
    const held = g.input.isTouchHeld(z);
    ctx.globalAlpha = held ? 0.95 : 0.7;
    ctx.beginPath();
    ctx.arc(p.x + 4 * s, p.y + 5 * s, p.r, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y + (held ? 3 * s : 0), p.r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    text(ctx, label, p.x, p.y + (held ? 3 * s : 0), p.r * 0.5, C.cream, 'center', 4 * s);
    ctx.globalAlpha = 1;
  };
  draw('brake', '◀', C.blue);
  draw('gas', '▶', C.red);
  if (g.mode === 'drive') {
    const w = g.shift.windowInRange();
    const ready = !!w && g.shift.flame.alive;
    if (ready && !g.fx.reduced) {
      ctx.beginPath();
      ctx.arc(pads.post.x, pads.post.y, pads.post.r * (1.15 + 0.1 * Math.sin(g.t * 10)), 0, Math.PI * 2);
      ctx.strokeStyle = C.fire;
      ctx.lineWidth = 4 * s;
      ctx.stroke();
    }
    draw('post', 'POST', ready ? C.fireOrange : C.mustardDark);
  }
}

export function drawHint(g: Game, ctx: Ctx): void {
  if (!g.hint || g.mode === 'shop' || g.paused) return;
  g.hint.t += g.fdt;
  if (g.hint.t > 9 && g.hint.id !== 'drive') {
    g.retireHint(g.hint.id);
    return;
  }
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  ctx.font = `600 ${Math.round(20 * s)}px ${BODY}`;
  const tw = Math.min(W - 24 * s, ctx.measureText(g.hint.text).width + 40 * s);
  const y = g.input.touchUI ? H - 200 * s : H - 90 * s;
  const bob = g.fx.reduced ? 0 : Math.sin(g.t * 3) * 3 * s;
  panel(ctx, { x: W / 2 - tw / 2, y: y + bob, w: tw, h: 46 * s }, C.paper, s, -0.01);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g.hint.text, W / 2, y + bob + 24 * s, tw - 20 * s);
}
