// The two screens that are not the stage: the pause slip (pinned over the
// frozen stage) and the routes view (an illustrated street of four windows).
import { ROUTES } from '../data/routes';
import type { RouteDef } from '../data/routeTypes';
import { clamp, mulberry32 } from '../core/geom';
import { C, FONT_STAMP, FONT_TEXT, TYPE } from '../render/palette';
import { FX, grainOver, printed, polyPath, roughRect } from '../render/paint';
import { drawMoth } from '../render/moth';
import type { Control } from './a11y';
import type { Layout, Rect } from './layout';
import { drawWordmark } from '../render/wordmark';
import { drawDeliveredStamp, drawGlyph, drawMarkStamp, drawProfile, drawTab, focusRing, wrapText } from './hud';
import type { Game } from './game';

export interface RoutesUi {
  selected: number;
  /** 0..1 entrance */
  t: number;
  /** all four lit: the pull-back */
  finale: boolean;
}

export interface MenuControl extends Control {
  adjust?: (dir: number) => void;
}

const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// ============================================================== pause

interface PauseRow {
  id: string;
  label: string;
  kind: 'button' | 'slider' | 'toggle';
  value?: number | boolean;
  primary?: boolean;
}

function pauseRows(g: Game): PauseRow[] {
  const st = g.save.data.settings;
  return [
    { id: 'pause:resume', label: 'Resume', kind: 'button', primary: true },
    { id: 'pause:routes', label: 'Routes', kind: 'button' },
    { id: 'pause:sfx', label: 'Sound', kind: 'slider', value: st.sfx },
    { id: 'pause:music', label: 'Music', kind: 'slider', value: st.music },
    { id: 'pause:mute', label: 'Mute all', kind: 'toggle', value: st.muted },
    { id: 'pause:motion', label: 'Reduced motion', kind: 'toggle', value: FX.reducedMotion },
    { id: 'pause:full', label: 'Fullscreen', kind: 'toggle', value: !!document.fullscreenElement },
  ];
}

function slipRect(L: Layout, rows: number): Rect {
  const w = 440;
  const h = 96 + rows * 58 + 24;
  return { x: L.W / 2 - w / 2, y: Math.max(16, L.H / 2 - h / 2 - 10), w, h };
}

function rowRect(slip: Rect, i: number): Rect {
  return { x: slip.x + 26, y: slip.y + 92 + i * 58, w: slip.w - 52, h: 50 };
}

export function pauseControls(g: Game, L: Layout): MenuControl[] {
  const rows = pauseRows(g);
  const slip = slipRect(L, rows.length);
  const st = g.save.data.settings;
  const setSfx = (v: number) => g.setLevels(clamp(Math.round(v * 10) / 10, 0, 1), st.music, st.muted);
  const setMusic = (v: number) => g.setLevels(st.sfx, clamp(Math.round(v * 10) / 10, 0, 1), st.muted);
  return rows.map((r, i) => {
    const rect = rowRect(slip, i);
    const bar = sliderBar(rect);
    const pct = (v: number) => `${Math.round(v * 100)} percent`;
    const base: MenuControl = { id: r.id, label: r.label, rect, enabled: true, group: 'pause', onActivate: () => undefined };
    switch (r.id) {
      case 'pause:resume':
        return { ...base, onActivate: () => g.togglePause() };
      case 'pause:routes':
        return { ...base, onActivate: () => g.openRoutes() };
      case 'pause:sfx':
      case 'pause:music': {
        const set = r.id === 'pause:sfx' ? setSfx : setMusic;
        const cur = () => (r.id === 'pause:sfx' ? g.save.data.settings.sfx : g.save.data.settings.music);
        return {
          ...base,
          label: `${r.label} level, ${pct(r.value as number)}. Left and right arrows adjust.`,
          onActivate: () => {
            const p = g.pointer;
            if (g.device !== 'keyboard' && p.x >= bar.x - 12 && p.x <= bar.x + bar.w + 12) set((p.x - bar.x) / bar.w);
            else set(cur() >= 1 ? 0 : cur() + 0.1);
          },
          adjust: (d) => set(cur() + d * 0.1),
        };
      }
      case 'pause:mute':
        return { ...base, label: `Mute all, ${st.muted ? 'on' : 'off'}`, pressed: st.muted, onActivate: () => g.setLevels(st.sfx, st.music, !st.muted) };
      case 'pause:motion':
        return { ...base, label: `Reduced motion, ${FX.reducedMotion ? 'on' : 'off'}`, pressed: FX.reducedMotion, onActivate: () => g.setReducedMotion(!FX.reducedMotion) };
      default:
        return { ...base, label: `Fullscreen, ${document.fullscreenElement ? 'on' : 'off'}`, pressed: !!document.fullscreenElement, onActivate: () => g.toggleFullscreen() };
    }
  });
}

function sliderBar(r: Rect): Rect {
  return { x: r.x + 190, y: r.y + r.h / 2 - 5, w: r.w - 214, h: 10 };
}

export function drawPauseSlip(ctx: CanvasRenderingContext2D, g: Game, L: Layout): void {
  const t = ease(g.pauseT);
  const rows = pauseRows(g);
  const slip = slipRect(L, rows.length);
  // The stage is frozen underneath, dimmed with ink (not a blur).
  ctx.save();
  ctx.fillStyle = `rgba(9,15,24,${0.62 * t})`;
  ctx.fillRect(0, 0, L.W, L.H);
  // The slip drops from its pin with a small swing.
  const drop = (1 - t) * -60;
  const swing = FX.reducedMotion ? 0 : (1 - t) * 0.05;
  ctx.translate(slip.x + slip.w / 2, slip.y + drop);
  ctx.rotate(swing - 0.008);
  ctx.translate(-(slip.x + slip.w / 2), -slip.y);
  ctx.globalAlpha = Math.min(1, t * 1.6);
  const shape = roughRect(slip.x, slip.y, slip.w, slip.h, 41, 1.6);
  ctx.save();
  ctx.translate(5, 8);
  ctx.fillStyle = 'rgba(4,8,14,0.55)';
  ctx.fill(shape);
  ctx.restore();
  printed(ctx, shape, C.paper, { lw: 2.5 });
  grainOver(ctx, shape, slip.x, slip.y, 0.6, 'fiber');
  // Tear perforation along the top edge and the pin.
  ctx.fillStyle = C.paperShade;
  for (let x = slip.x + 14; x < slip.x + slip.w - 10; x += 12) {
    ctx.beginPath();
    ctx.arc(x, slip.y + 54, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.brass;
  ctx.beginPath();
  ctx.arc(slip.x + slip.w / 2, slip.y + 10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Header.
  ctx.fillStyle = C.ink;
  ctx.font = `700 ${TYPE.title}px ${FONT_STAMP}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('SHIFT ON HOLD', slip.x + 28, slip.y + 34);
  ctx.font = `600 ${TYPE.count}px ${FONT_TEXT}`;
  ctx.fillStyle = C.inkSoft;
  ctx.textAlign = 'right';
  ctx.fillText(`Job ${g.route.index + 1} · ${g.route.name}`, slip.x + slip.w - 28, slip.y + 36);
  const focused = g.a11y.focused();
  const showFocus = g.device === 'keyboard';
  rows.forEach((r, i) => {
    const rr = rowRect(slip, i);
    const hover = g.hover === r.id;
    const pressed = g.pressed === r.id;
    if (r.kind === 'button') {
      drawTab(ctx, rr, r.id === 'pause:resume' ? 'next' : 'routes', r.label, { enabled: true, focus: false, hover, pressed, primary: r.primary, glyph: r.id === 'pause:resume' ? 'Esc' : undefined });
    } else {
      // Ruled line with a label and a control.
      ctx.strokeStyle = 'rgba(24,38,56,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rr.x, rr.y + rr.h + 3);
      ctx.lineTo(rr.x + rr.w, rr.y + rr.h + 3);
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.font = `700 ${TYPE.stamp}px ${FONT_STAMP}`;
      ctx.textAlign = 'left';
      ctx.fillText(r.label.toUpperCase(), rr.x + 4, rr.y + rr.h / 2 + 1);
      if (r.kind === 'slider') drawSlider(ctx, sliderBar(rr), r.value as number, g.save.data.settings.muted);
      else drawSwitch(ctx, rr.x + rr.w - 86, rr.y + rr.h / 2, r.value as boolean, hover);
    }
    if (showFocus && focused === r.id) focusRing(ctx, rr, 8);
  });
  ctx.restore();
}

/** A brass rule with a sliding paper rider and printed tick marks. */
function drawSlider(ctx: CanvasRenderingContext2D, b: Rect, v: number, muted: boolean): void {
  ctx.save();
  printed(ctx, polyPath([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]), C.brass, { lw: 1.6 });
  ctx.fillStyle = C.ink;
  for (let i = 0; i <= 10; i++) {
    const x = b.x + (b.w * i) / 10;
    ctx.fillRect(x - 0.5, b.y + b.h + 2, 1, i % 5 === 0 ? 8 : 4);
  }
  // Filled part of the rule (ink inlay).
  ctx.fillStyle = muted ? C.paperDeep : C.petrol;
  ctx.fillRect(b.x + 2, b.y + 2, (b.w - 4) * v, b.h - 4);
  const rx = b.x + b.w * v;
  const rider = polyPath([[rx - 9, b.y - 10], [rx + 9, b.y - 10], [rx + 9, b.y + b.h + 4], [rx, b.y + b.h + 12], [rx - 9, b.y + b.h + 4]]);
  printed(ctx, rider, C.vermilion, { lw: 2 });
  ctx.fillStyle = C.paper;
  ctx.font = `700 ${TYPE.count - 2}px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(v * 10)), rx, b.y + 2);
  ctx.restore();
}

/** A toggle drawn as a postal two-position lever (ON / OFF printed on the plate). */
function drawSwitch(ctx: CanvasRenderingContext2D, x: number, cy: number, on: boolean, hover: boolean): void {
  ctx.save();
  const plate = new Path2D();
  plate.roundRect(x, cy - 15, 80, 30, 15);
  printed(ctx, plate, on ? C.petrol : C.paperShade, { lw: 2 });
  ctx.font = `700 ${TYPE.count}px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = on ? C.paper : C.inkSoft;
  ctx.fillText(on ? 'ON' : 'OFF', on ? x + 26 : x + 54, cy + 1);
  const kx = on ? x + 62 : x + 18;
  ctx.fillStyle = C.brass;
  ctx.beginPath();
  ctx.arc(kx, cy + (hover ? -1 : 0), 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.brassGlint;
  ctx.fillRect(kx - 5, cy - 6, 4, 2);
  ctx.restore();
}

// ============================================================= routes

interface HouseSpot {
  r: RouteDef;
  i: number;
  house: Rect;
  slip: Rect;
}

function houseSpots(L: Layout): HouseSpot[] {
  const n = Math.max(4, ROUTES.length);
  const margin = Math.max(70, L.W * 0.07);
  const span = L.W - margin * 2;
  const cell = span / n;
  const hw = Math.min(210, cell - 34);
  const street = L.H * 0.6;
  const heights = [250, 290, 260, 300];
  return ROUTES.map((r, i) => {
    const cx = margin + cell * (i + 0.5);
    const hh = heights[i % 4]!;
    return {
      r,
      i,
      house: { x: cx - hw / 2, y: street - hh, w: hw, h: hh },
      slip: { x: cx - Math.min(118, cell / 2 - 8), y: street + 34, w: Math.min(236, cell - 16), h: 140 },
    };
  });
}

export function routesControls(g: Game, L: Layout): MenuControl[] {
  const out: MenuControl[] = houseSpots(L).map((s) => {
    const open = g.save.isUnlocked(s.i);
    const done = !!g.save.data.delivered[s.r.id];
    const mark = !!g.save.data.marks[s.r.id];
    return {
      id: `route:${s.i}`,
      label: `Window ${s.i + 1}, ${s.r.name}. ${open ? (done ? `Delivered${mark ? `, ${s.r.mark.name} earned` : `, ${s.r.mark.name} outstanding`}` : 'Dark, open for delivery') : 'Shuttered until the window before it is lit'}.`,
      rect: { x: s.house.x, y: s.house.y, w: s.house.w, h: s.slip.y + s.slip.h - s.house.y },
      enabled: open,
      group: 'routes',
      onActivate: () => g.openRoute(s.i),
    };
  });
  out.push({ id: 'routes:back', label: `Back to the bench, job ${g.route.index + 1}`, rect: backRect(L), enabled: true, onActivate: () => g.openRoute(g.route.index) });
  out.push({ id: 'pause', label: 'Pause', rect: L.pause, enabled: true, onActivate: () => g.togglePause() });
  return out;
}

function backRect(L: Layout): Rect {
  return { x: L.W - 300, y: L.H - 92, w: 260, h: 56 };
}

export function drawRoutes(ctx: CanvasRenderingContext2D, g: Game, L: Layout): void {
  const ui = g.routesUi;
  const t = ease(ui.t);
  const allLit = ROUTES.every((r) => g.save.data.delivered[r.id]);
  ctx.save();
  // Night quay: sky, sea, the lighthouse and a cobbled street.
  const sky = ctx.createLinearGradient(0, 0, 0, L.H);
  sky.addColorStop(0, '#0f1a28');
  sky.addColorStop(0.55, '#1a2e44');
  sky.addColorStop(1, '#22374d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, L.W, L.H);
  // Pull back for the finale: the whole street settles into frame.
  const zoom = ui.finale && !FX.reducedMotion ? 1.12 - 0.12 * t : 1;
  ctx.translate(L.W / 2, L.H * 0.55);
  ctx.scale(zoom, zoom);
  ctx.translate(-L.W / 2, -L.H * 0.55);
  drawStars(ctx, L);
  // Moon: pale paper disc (reflects light; not a glow source).
  ctx.fillStyle = '#e8dcbc';
  ctx.beginPath();
  ctx.arc(L.W * 0.83, L.H * 0.14, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a2e44';
  ctx.beginPath();
  ctx.arc(L.W * 0.83 + 12, L.H * 0.14 - 6, 26, 0, Math.PI * 2);
  ctx.fill();
  const street = L.H * 0.6;
  // Sea band behind the houses, with printed wave lines.
  ctx.fillStyle = '#26404f';
  ctx.fillRect(0, street - 150, L.W, 150);
  ctx.strokeStyle = 'rgba(121,166,157,0.35)';
  ctx.lineWidth = 1.5;
  const rnd = mulberry32(9);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * L.W;
    const y = street - 140 + rnd() * 120;
    const w = 20 + rnd() * 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
    ctx.stroke();
  }
  drawLighthouse(ctx, L.W * 0.06, street - 140, allLit ? t : 0, g.time);
  const spots = houseSpots(L);
  // The moth's round: a chalk dashed path linking the windows along the street.
  ctx.save();
  ctx.setLineDash([10, 9]);
  ctx.strokeStyle = 'rgba(246,240,226,0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  spots.forEach((s, i) => {
    const x = s.house.x + s.house.w / 2;
    const y = street + 14 + (i % 2) * 6;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x - 80, y);
  });
  ctx.stroke();
  ctx.restore();
  // Street.
  const road = new Path2D();
  road.rect(0, street, L.W, L.H - street);
  printed(ctx, road, C.petrolDeep, { lw: 0 });
  grainOver(ctx, road, 0, street, 0.8);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, street - 2, L.W, 5);

  const focused = g.device === 'keyboard' ? g.a11y.focused() : null;
  spots.forEach((s) => {
    const open = g.save.isUnlocked(s.i);
    const done = !!g.save.data.delivered[s.r.id];
    const mark = !!g.save.data.marks[s.r.id];
    const sel = g.hover === `route:${s.i}` || focused === `route:${s.i}`;
    // Staggered entrance: each house rises a little after the last.
    const enter = FX.reducedMotion ? 1 : ease(ui.t * 1.6 - s.i * 0.12);
    ctx.save();
    ctx.globalAlpha = clamp(enter * 1.4, 0, 1);
    ctx.translate(0, (1 - enter) * 40);
    drawHouse(ctx, s, { open, done, current: g.route.index === s.i, sel, time: g.time });
    drawRouteSlip(ctx, s, { open, done, mark, sel });
    if (focused === `route:${s.i}`) focusRing(ctx, { x: s.house.x, y: s.house.y, w: s.house.w, h: s.slip.y + s.slip.h - s.house.y }, 10);
    ctx.restore();
  });
  ctx.restore();

  // Title (not zoomed).
  ctx.save();
  drawWordmark(ctx, 46, 74, 40);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${TYPE.body + 1}px ${FONT_TEXT}`;
  ctx.fillStyle = C.paperShade;
  const lit = ROUTES.filter((r) => g.save.data.delivered[r.id]).length;
  const marks = ROUTES.filter((r) => g.save.data.marks[r.id]).length;
  ctx.fillText(allLit ? `The night round is done. ${marks} of ${ROUTES.length} special marks stamped.` : `The night round · ${lit} of ${ROUTES.length} windows lit · ${marks} special marks`, 42, 108);
  ctx.restore();
  const br = backRect(L);
  drawTab(ctx, br, 'back', `Bench · job ${g.route.index + 1}`, { enabled: true, focus: focused === 'routes:back', hover: g.hover === 'routes:back', pressed: g.pressed === 'routes:back' });
  drawTab(ctx, L.pause, 'pause', 'Pause', { enabled: true, focus: focused === 'pause', hover: g.hover === 'pause', pressed: false });
}

function drawStars(ctx: CanvasRenderingContext2D, L: Layout): void {
  const rnd = mulberry32(21);
  ctx.fillStyle = 'rgba(243,222,174,0.55)';
  for (let i = 0; i < 60; i++) {
    const x = rnd() * L.W;
    const y = rnd() * L.H * 0.4;
    const r = rnd() < 0.15 ? 1.6 : 0.9;
    ctx.fillRect(x, y, r, r);
  }
}

/** The lighthouse across the bay; it only lights when every window is lit. */
function drawLighthouse(ctx: CanvasRenderingContext2D, x: number, base: number, lit: number, time: number): void {
  ctx.save();
  const tower = polyPath([[x - 16, base], [x + 16, base], [x + 10, base - 110], [x - 10, base - 110]]);
  printed(ctx, tower, C.paperShade, { lw: 2 });
  ctx.fillStyle = C.vermilion;
  ctx.fillRect(x - 13, base - 40, 26, 14);
  ctx.fillRect(x - 11, base - 86, 22, 12);
  const lampY = base - 122;
  ctx.fillStyle = lit > 0 ? C.honey : C.inkSoft;
  ctx.fillRect(x - 9, lampY, 18, 12);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 9, lampY, 18, 12);
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.moveTo(x - 13, lampY);
  ctx.lineTo(x, lampY - 14);
  ctx.lineTo(x + 13, lampY);
  ctx.closePath();
  ctx.fill();
  if (lit > 0 && FX.glow) {
    // The beam sweeps slowly; glow belongs only to this fire.
    const a = FX.reducedMotion ? 0.12 : Math.sin(time * 0.6) * 0.35 + 0.1;
    ctx.globalAlpha = lit * 0.45;
    const beam = ctx.createLinearGradient(x, lampY, x + 600, lampY);
    beam.addColorStop(0, 'rgba(255,209,108,0.9)');
    beam.addColorStop(1, 'rgba(255,209,108,0)');
    ctx.fillStyle = beam;
    ctx.translate(x, lampY + 6);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(620, -70);
    ctx.lineTo(620, 70);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHouse(ctx: CanvasRenderingContext2D, s: HouseSpot, st: { open: boolean; done: boolean; current: boolean; sel: boolean; time: number }): void {
  const { house: h } = s;
  const lift = st.sel && st.open ? -6 : 0;
  ctx.save();
  ctx.translate(0, lift);
  // Gabled front with a chimney stack; each house a little different.
  const roofH = 46 + (s.i % 2) * 14;
  const front = new Path2D();
  front.moveTo(h.x, h.y + h.h);
  front.lineTo(h.x, h.y + roofH);
  front.lineTo(h.x + h.w / 2, h.y);
  front.lineTo(h.x + h.w, h.y + roofH);
  front.lineTo(h.x + h.w, h.y + h.h);
  front.closePath();
  ctx.save();
  ctx.translate(4, 6);
  ctx.fillStyle = 'rgba(5,9,15,0.45)';
  ctx.fill(front);
  ctx.restore();
  const tones = [C.petrol, C.tealDeep, C.petrolDeep, C.petrol];
  printed(ctx, front, tones[s.i % 4]!, { lw: 3, mx: 1.6, my: 1.2 });
  grainOver(ctx, front, h.x, h.y, 0.9);
  // Roof edge in vermilion print.
  ctx.strokeStyle = C.vermilionDeep;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(h.x - 6, h.y + roofH + 4);
  ctx.lineTo(h.x + h.w / 2, h.y - 4);
  ctx.lineTo(h.x + h.w + 6, h.y + roofH + 4);
  ctx.stroke();
  // Arched window.
  const ww = h.w * 0.5;
  const wx = h.x + h.w / 2 - ww / 2;
  const wt = h.y + roofH + 34;
  const wb = h.y + h.h - 44;
  const arch = new Path2D();
  arch.moveTo(wx, wb);
  arch.lineTo(wx, wt + ww / 2);
  arch.arc(wx + ww / 2, wt + ww / 2, ww / 2, Math.PI, 0);
  arch.lineTo(wx + ww, wb);
  arch.closePath();
  if (st.done) {
    // Lit from inside: the only warm light on the street.
    if (FX.glow) {
      ctx.save();
      const pool = ctx.createRadialGradient(wx + ww / 2, wb, 4, wx + ww / 2, wb, ww * 2.2);
      pool.addColorStop(0, 'rgba(255,209,108,0.45)');
      pool.addColorStop(1, 'rgba(255,209,108,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(wx - ww * 2, wb - ww * 2, ww * 5, ww * 2.6);
      ctx.restore();
    }
    const glow = ctx.createRadialGradient(wx + ww * 0.6, wb - 30, 4, wx + ww * 0.6, wb - 30, ww * 1.2);
    glow.addColorStop(0, C.honeyHot);
    glow.addColorStop(0.4, C.honey);
    glow.addColorStop(1, '#c98b3a');
    ctx.fillStyle = glow;
    ctx.fill(arch);
    ctx.save();
    ctx.clip(arch);
    ctx.translate(wx + ww * 0.34, wb - 18);
    drawMoth(ctx, { k: 44, pose: 'clerk', time: st.time + s.i, silhouette: true });
    ctx.restore();
  } else {
    ctx.fillStyle = '#0a121c';
    ctx.fill(arch);
  }
  // Glazing bars.
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wt);
  ctx.lineTo(wx + ww / 2, wb);
  ctx.moveTo(wx, wt + ww * 0.75);
  ctx.lineTo(wx + ww, wt + ww * 0.75);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.stroke(arch);
  if (!st.open) {
    // Shuttered: closed wooden slats and a wax seal.
    ctx.save();
    ctx.clip(arch);
    ctx.fillStyle = C.wood;
    ctx.fill(arch);
    ctx.strokeStyle = C.woodDeep;
    ctx.lineWidth = 2;
    for (let y = wt; y < wb; y += 9) {
      ctx.beginPath();
      ctx.moveTo(wx, y);
      ctx.lineTo(wx + ww, y + 3);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.stroke(arch);
    const sx = wx + ww / 2;
    const sy = (wt + wb) / 2 + 10;
    ctx.fillStyle = C.vermilionDeep;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 ? 13 : 15;
      i ? ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r) : ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.vermilion;
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Doorstep and the number plate.
  ctx.fillStyle = C.inkSoft;
  ctx.fillRect(wx - 10, wb, ww + 20, 8);
  const px = h.x + h.w / 2;
  const py = h.y + roofH + 12;
  printed(ctx, polyPath([[px - 20, py - 11], [px + 20, py - 11], [px + 20, py + 11], [px - 20, py + 11]]), C.brass, { lw: 1.6 });
  ctx.fillStyle = C.ink;
  ctx.font = `700 17px ${FONT_STAMP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(s.i + 1).padStart(2, '0'), px, py + 1);
  if (st.current) {
    // The cart's current bench: a tiny lamp hung from the plate's hook.
    drawGlyph(ctx, 'BENCH', px - 26, h.y + h.h - 18, 14, true);
  }
  ctx.restore();
}

function drawRouteSlip(ctx: CanvasRenderingContext2D, s: HouseSpot, st: { open: boolean; done: boolean; mark: boolean; sel: boolean }): void {
  const r = s.slip;
  ctx.save();
  ctx.translate(0, st.sel && st.open ? -4 : 0);
  ctx.rotate(0);
  const tilt = ((s.i % 2) * 2 - 1) * 0.012;
  ctx.translate(r.x + r.w / 2, r.y);
  ctx.rotate(tilt);
  ctx.translate(-(r.x + r.w / 2), -r.y);
  const shape = roughRect(r.x, r.y, r.w, r.h, 60 + s.i, 1.2);
  ctx.save();
  ctx.translate(3, 5);
  ctx.fillStyle = 'rgba(4,8,14,0.5)';
  ctx.fill(shape);
  ctx.restore();
  printed(ctx, shape, st.open ? C.paper : C.paperShade, { lw: 2 });
  grainOver(ctx, shape, r.x, r.y, 0.5, 'fiber');
  ctx.fillStyle = C.ink;
  ctx.fillRect(r.x + 8, r.y + 8, r.w - 16, 24);
  ctx.fillStyle = C.paper;
  ctx.font = `700 ${TYPE.stamp - 3}px ${FONT_STAMP}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${s.i + 1} · ${s.r.name.toUpperCase()}`, r.x + 14, r.y + 21);
  if (st.open) drawProfile(ctx, s.r, { x: r.x + 12, y: r.y + 40, w: r.w - 24, h: 40 });
  else {
    ctx.fillStyle = C.inkSoft;
    ctx.font = `600 ${TYPE.count}px ${FONT_TEXT}`;
    ctx.fillText('Opens when window', r.x + 14, r.y + 52);
    ctx.fillText(`${s.i} is lit`, r.x + 14, r.y + 70);
  }
  ctx.fillStyle = C.ink;
  ctx.font = `700 ${TYPE.count}px ${FONT_STAMP}`;
  ctx.fillText(s.r.mark.name.toUpperCase(), r.x + 14, r.y + 98);
  ctx.font = `400 ${TYPE.count - 2}px ${FONT_TEXT}`;
  ctx.fillStyle = C.inkSoft;
  wrapText(ctx, s.r.mark.condition, r.w - 76)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, r.x + 14, r.y + 114 + i * 13));
  const bx = r.x + r.w - 56;
  const by = r.y + 88;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = C.inkSoft;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(bx, by, 44, 40);
  ctx.setLineDash([]);
  if (st.mark) drawMarkStamp(ctx, bx + 22, by + 20, s.r.mark.id, 1);
  if (st.done) drawDeliveredStamp(ctx, r.x + r.w * 0.5, r.y + 62, 1);
  ctx.restore();
}
