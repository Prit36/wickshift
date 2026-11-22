// Full-screen cards: title, the delivery card (what's next, who's inspecting),
// results with wages, the late post, dawn (and Overtime), pause.
import type { Game } from './game';
import { INSPECTORS } from '../sim/shift';
import { KINDS, KIND_NAME, ROUTES, targetFor, inspectorFor } from '../sim/night';
import { themeFor } from '../render/theme';
import { rr } from '../render/art';
import { C, BODY } from '../render/palette';
import { panel, button, text, fmt, inside, coin, logo, fitSize, wrapText, drawStamp } from '../render/ui';
import { STAMPS } from '../sim/stamps';
import { sfx } from '../audio/sfx';
import { routeLabel } from './hud';

type Ctx = CanvasRenderingContext2D;

const TIPS = [
  'Skipping a window lets your flame grow, but a big flame shatters on hard landings.',
  'Land on downslopes: the steeper the slope matches your fall, the softer the landing.',
  'High windows double your sparks. Line up the jump that reaches them.',
  'Variety pays: the first time you do a trick in a flame it adds a spark.',
  'Post stamps fire left to right. A ×2 after the +3 is worth more than before it.',
  'Hold pennies: every 5 you carry earns 1 more at the end of a delivery.',
  'The Inspector for each route is shown at the counter. Buy for the fight ahead.',
  'Postcards level up a trick family for the whole night. Pick one and lean in.',
];

function dim(g: Game, ctx: Ctx, a: number): void {
  ctx.fillStyle = `rgba(14,10,40,${a})`;
  ctx.fillRect(0, 0, g.cam.W, g.cam.H);
}

export function drawTitle(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  dim(g, ctx, 0.25);
  const ly = H * 0.18;
  logo(ctx, W / 2, ly, Math.min(110 * s, W / 11), g.t, g.fx.reduced);
  text(ctx, 'DELIVERIES', W / 2, ly + 80 * s, 30 * s, C.mustard, 'center', 6 * s);
  const lines = [
    'Pull tricks to grow your lamp’s flame: heat × sparks.',
    'Throw it into a window to post it, or skip windows to let it grow…',
    '…but a big flame shatters on a hard landing.',
    'Four rooms, three deliveries each. Stamps bend the rules.',
  ];
  lines.forEach((l, i) => text(ctx, l, W / 2, ly + 120 * s + i * 27 * s, fitSize(ctx, l, W - 40 * s, 20 * s, BODY, 600), C.cream, 'center', 5 * s, BODY, 600));
  const br = { x: W / 2 - 150 * s, y: ly + 240 * s, w: 300 * s, h: 58 * s };
  button(ctx, br, 'START THE NIGHT', s, inside(br, g.input.mouse.x, g.input.mouse.y), C.red, true, g.input.touchUI ? '' : '→');
  g.hits.push({ r: br, id: 'go' });
  const sv = g.save;
  if (sv.best > 0) {
    const reach = sv.bestRoute > ROUTES ? `Overtime ${sv.bestRoute - ROUTES}` : `route ${sv.bestRoute}`;
    const st = `Best night ${fmt(sv.best)}  ·  furthest ${reach}  ·  biggest post ${fmt(sv.bestPost)}  ·  dawns ${sv.dawns}`;
    text(ctx, st, W / 2, H - 30 * s, fitSize(ctx, st, W - 40 * s, 17 * s, BODY, 600), C.paper, 'center', 4 * s, BODY, 600);
  }
  text(ctx, `M: sound ${sv.muted ? 'off' : 'on'}`, 16 * s, H - 54 * s, 15 * s, C.paper, 'left', 4 * s, BODY, 600);
}

/** The delivery card: the route, its three deliveries, the target and the Inspector. */
export function drawIntro(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  const sh = g.shift;
  const run = g.run;
  const k = Math.min(1, g.modeT / 0.25);
  dim(g, ctx, 0.35 * k);
  const w = Math.min(520 * s, W - 24 * s);
  const insp = INSPECTORS[inspectorFor(run)];
  const isBoss = sh.cfg.kind === 'inspection';
  const h = 290 * s;
  const r = { x: W / 2 - w / 2, y: Math.max(90 * s, H * 0.16) + (1 - k) * 40 * s, w, h };
  panel(ctx, r, C.cream, s, -0.012);
  const room = run.route > ROUTES ? 'OVERTIME' : themeFor(run.route - 1).name.toUpperCase();
  text(ctx, `${routeLabel(run.route)} · ${room}`, W / 2, r.y + 24 * s, fitSize(ctx, `${routeLabel(run.route)} · ${room}`, w - 30 * s, 17 * s), C.inkSoft, 'center');
  // three deliveries in this route
  const pw = (w - 40 * s) / 3;
  KINDS.forEach((kd, i) => {
    const px = r.x + 20 * s + i * pw;
    const py = r.y + 40 * s;
    const cur = i === run.step;
    const done = i < run.step;
    rr(ctx, px + 4 * s, py, pw - 8 * s, 50 * s, 8 * s);
    ctx.fillStyle = cur ? (kd === 'inspection' ? C.pink : C.mustard) : done ? 'rgba(89,192,107,0.35)' : 'rgba(26,18,51,0.08)';
    ctx.fill();
    ctx.lineWidth = (cur ? 3 : 1.5) * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    text(ctx, (done ? '✓ ' : '') + KIND_NAME[kd].toUpperCase(), px + pw / 2, py + 17 * s, fitSize(ctx, KIND_NAME[kd].toUpperCase(), pw - 24 * s, 17 * s), C.ink, 'center');
    text(ctx, fmt(targetFor(run.route, i)), px + pw / 2, py + 37 * s, 15 * s, C.inkSoft, 'center', 0, BODY, 600);
  });
  const big = `${KIND_NAME[sh.cfg.kind].toUpperCase()} DELIVERY`;
  text(ctx, big, W / 2, r.y + 120 * s, fitSize(ctx, big, w - 30 * s, 40 * s), isBoss ? C.redDark : C.red, 'center');
  const goal = `Post ${fmt(sh.target)} before the sorting office`;
  text(ctx, goal, W / 2, r.y + 156 * s, fitSize(ctx, goal, w - 30 * s, 20 * s, BODY, 600), C.ink, 'center', 0, BODY, 600);
  if (isBoss) {
    const br = { x: r.x + 18 * s, y: r.y + 178 * s, w: w - 36 * s, h: 70 * s };
    rr(ctx, br.x, br.y, br.w, br.h, 10 * s);
    ctx.fillStyle = C.pink;
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    text(ctx, `INSPECTOR: ${insp.name.toUpperCase()}`, W / 2, br.y + 20 * s, 22 * s, C.ink, 'center');
    text(ctx, insp.text, W / 2, br.y + 48 * s, fitSize(ctx, insp.text, br.w - 20 * s, 17 * s, BODY, 600), C.ink, 'center', 0, BODY, 600);
  } else {
    text(ctx, `Then: the Inspection — ${insp.name}`, W / 2, r.y + 196 * s, fitSize(ctx, `Then: the Inspection — ${insp.name}`, w - 30 * s, 17 * s, BODY, 600), C.redDark, 'center', 0, BODY, 600);
    const paid = `Pays ${sh.cfg.kind === 'local' ? 3 : 4} pennies + bonuses`;
    text(ctx, paid, W / 2, r.y + 224 * s, 15 * s, C.inkSoft, 'center', 0, BODY, 600);
  }
  const go = g.input.touchUI ? 'Hold ▶ to go' : 'Hold → to go';
  const bob = g.fx.reduced ? 0 : Math.sin(g.t * 4) * 3 * s;
  text(ctx, go, W / 2, r.y + h - 20 * s + bob, 22 * s, C.red, 'center');
}

export function drawWaiting(g: Game, ctx: Ctx): void {
  const sh = g.shift;
  if (!sh.done) return;
  const s = g.s;
  const k = Math.min(1, Math.max(0, g.modeT) / 0.2);
  ctx.save();
  ctx.translate(g.cam.W / 2, g.cam.H * 0.62);
  ctx.rotate(-0.08);
  const sc = g.fx.reduced ? 1 : 1.6 - 0.6 * k;
  ctx.scale(sc, sc);
  ctx.globalAlpha = k;
  const label = sh.passed ? 'DELIVERED' : 'LATE';
  text(ctx, label, 0, 0, 64 * s, sh.passed ? C.green : C.red, 'center', 9 * s);
  ctx.restore();
}

export function drawResults(g: Game, ctx: Ctx): void {
  const f = g.finishInfo!;
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  const k = Math.min(1, g.modeT / 0.3);
  dim(g, ctx, 0.45 * k);
  const w = Math.min(460 * s, W - 24 * s);
  const h = (250 + f.lines.length * 30) * s;
  const r = { x: W / 2 - w / 2, y: Math.max(12 * s, H / 2 - h / 2) + (1 - k) * 60 * s, w, h };
  panel(ctx, r, C.cream, s, 0.01);
  const over = f.posted / f.target;
  const head = over >= 3 ? 'SCORCHED IT!' : over >= 1.5 ? 'FIRST CLASS!' : 'DELIVERED';
  text(ctx, head, W / 2, r.y + 36 * s, 38 * s, C.greenDark, 'center');
  const sub = `${fmt(f.posted)} posted of ${fmt(f.target)}  ·  best post ${fmt(f.best)}`;
  text(ctx, sub, W / 2, r.y + 74 * s, fitSize(ctx, sub, w - 30 * s, 20 * s, BODY, 600), C.ink, 'center', 0, BODY, 600);
  let y = r.y + 112 * s;
  let shown = 0;
  f.lines.forEach(([label, n], i) => {
    if (g.modeT <= 0.35 + i * 0.2) return;
    shown++;
    text(ctx, label, r.x + 36 * s, y, 20 * s, C.inkSoft, 'left', 0, BODY, 600);
    coin(ctx, r.x + w - 74 * s, y, 10 * s);
    text(ctx, `+${n}`, r.x + w - 56 * s, y + 1, 22 * s, C.ink, 'left');
    y += 30 * s;
  });
  if (shown > g.resultsShown) {
    g.resultsShown = shown;
    sfx.coin(shown);
  }
  if (shown === f.lines.length) {
    ctx.fillStyle = 'rgba(26,18,51,0.25)';
    ctx.fillRect(r.x + 30 * s, y - 12 * s, w - 60 * s, 2 * s);
    text(ctx, 'Wages', r.x + 36 * s, y + 8 * s, 22 * s, C.ink, 'left');
    coin(ctx, r.x + w - 74 * s, y + 8 * s, 12 * s);
    text(ctx, `+${f.earned}`, r.x + w - 56 * s, y + 9 * s, 26 * s, C.mustardDark, 'left', 3 * s);
  }
  const br = { x: W / 2 - 150 * s, y: r.y + h - 72 * s, w: 300 * s, h: 54 * s };
  const dawn = g.run.route > ROUTES && !g.overtime;
  button(ctx, br, dawn ? 'SEE THE DAWN' : 'TO THE COUNTER', s, inside(br, g.input.mouse.x, g.input.mouse.y), C.red, true, g.input.touchUI ? '' : '⏎');
  g.hits.push({ r: br, id: 'continue' });
}

export function drawOver(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  const sh = g.shift;
  const run = g.run;
  const k = Math.min(1, g.modeT / 0.4);
  dim(g, ctx, 0.6 * k);
  const w = Math.min(500 * s, W - 24 * s);
  // the album you built is the story of the run: show it
  const sw = 52 * s;
  const shh = 64 * s;
  const albumH = run.stamps.length ? shh + 30 * s : 0;
  const h = 330 * s + albumH;
  const r = { x: W / 2 - w / 2, y: H / 2 - h / 2 + (1 - k) * 60 * s, w, h };
  panel(ctx, r, C.cream, s, -0.012);
  text(ctx, 'THE POST IS LATE', W / 2, r.y + 40 * s, fitSize(ctx, 'THE POST IS LATE', w - 30 * s, 42 * s), C.red, 'center');
  const why = sh.glasses <= 0 ? `Every lamp glass is broken, ${fmt(sh.posted)} of ${fmt(sh.target)} posted.` : `${KIND_NAME[sh.cfg.kind]} needed ${fmt(sh.target)}: you posted ${fmt(sh.posted)}.`;
  text(ctx, why, W / 2, r.y + 84 * s, fitSize(ctx, why, w - 30 * s, 20 * s, BODY, 600), C.ink, 'center', 0, BODY, 600);
  const reach = `Reached ${routeLabel(run.route).toLowerCase()}, ${KIND_NAME[sh.cfg.kind]}  ·  night total ${fmt(run.total)}`;
  text(ctx, reach, W / 2, r.y + 120 * s, fitSize(ctx, reach, w - 30 * s, 17 * s, BODY, 600), C.inkSoft, 'center', 0, BODY, 600);
  const st = `Best post ${fmt(run.bestPost)}  ·  windows lit ${run.windows}  ·  best night ${fmt(g.save.best)}`;
  text(ctx, st, W / 2, r.y + 146 * s, fitSize(ctx, st, w - 30 * s, 17 * s, BODY, 600), C.inkSoft, 'center', 0, BODY, 600);
  if (run.stamps.length) {
    const gap = 8 * s;
    const n = run.stamps.length;
    const x0 = W / 2 - (n * sw + (n - 1) * gap) / 2;
    run.stamps.forEach((id, i) => drawStamp(ctx, { x: x0 + i * (sw + gap), y: r.y + 170 * s, w: sw, h: shh }, STAMPS[id], s * 0.47, false, g.t, i % 2 ? 0.05 : -0.05));
  }
  const tip = TIPS[run.seed % TIPS.length];
  wrapText(ctx, `Tip: ${tip}`, r.x + 30 * s, r.y + 180 * s + albumH, w - 60 * s, 16 * s, C.blueDark, 'left');
  const br = { x: W / 2 - 140 * s, y: r.y + h - 78 * s, w: 280 * s, h: 56 * s };
  button(ctx, br, 'NEW NIGHT', s, inside(br, g.input.mouse.x, g.input.mouse.y), C.red, true, g.input.touchUI ? '' : 'R');
  g.hits.push({ r: br, id: 'again' });
}

export function drawDawn(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  const k = Math.min(1, g.modeT / 1.2);
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, `rgba(255,170,120,${0.75 * k})`);
  gr.addColorStop(1, `rgba(255,220,140,${0.88 * k})`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
  logo(ctx, W / 2, H * 0.18, Math.min(90 * s, W / 12), g.t, g.fx.reduced);
  const head = 'DAWN · EVERY ROUTE DELIVERED';
  text(ctx, head, W / 2, H * 0.18 + 80 * s, fitSize(ctx, head, W - 40 * s, 34 * s), C.cream, 'center', 7 * s);
  // the night's story on a card: total, stats and the album that got you here
  const run = g.run;
  const cw = Math.min(620 * s, W - 24 * s);
  const sw = 52 * s;
  const shh = 64 * s;
  const albumH = run.stamps.length ? shh + 18 * s : 0;
  const card = { x: W / 2 - cw / 2, y: H * 0.18 + 112 * s + (1 - k) * 40 * s, w: cw, h: 150 * s + albumH };
  panel(ctx, card, C.cream, s, 0.008);
  const total = `Night total ${fmt(run.total)}`;
  text(ctx, total, W / 2, card.y + 38 * s, fitSize(ctx, total, cw - 30 * s, 46 * s), C.red, 'center');
  const st = `Best single post ${fmt(run.bestPost)}  ·  windows lit ${run.windows}  ·  best night ${fmt(g.save.best)}`;
  text(ctx, st, W / 2, card.y + 78 * s, fitSize(ctx, st, cw - 30 * s, 18 * s, BODY, 600), C.ink, 'center', 0, BODY, 600);
  if (run.stamps.length) {
    const gap = 8 * s;
    const n = run.stamps.length;
    const x0 = W / 2 - (n * sw + (n - 1) * gap) / 2;
    run.stamps.forEach((id, i) => drawStamp(ctx, { x: x0 + i * (sw + gap), y: card.y + 96 * s, w: sw, h: shh }, STAMPS[id], s * 0.47, false, g.t, i % 2 ? 0.05 : -0.05));
  }
  const t2 = 'Keep going? Overtime routes get harder every time.';
  text(ctx, t2, W / 2, card.y + card.h - 26 * s, fitSize(ctx, t2, cw - 30 * s, 17 * s, BODY, 600), C.inkSoft, 'center', 0, BODY, 600);
  const bw = Math.min(250 * s, (W - 44 * s) / 2);
  const by = card.y + card.h + 24 * s;
  const b1 = { x: W / 2 - bw - 10 * s, y: by, w: bw, h: 58 * s };
  const b2 = { x: W / 2 + 10 * s, y: by, w: bw, h: 58 * s };
  button(ctx, b1, 'OVERTIME', s, inside(b1, g.input.mouse.x, g.input.mouse.y), C.red, true, g.input.touchUI ? '' : '⏎');
  button(ctx, b2, 'NEW NIGHT', s, inside(b2, g.input.mouse.x, g.input.mouse.y), C.blue, true, g.input.touchUI ? '' : 'R');
  g.hits.push({ r: b1, id: 'overtime' }, { r: b2, id: 'again' });
}

export function drawPause(g: Game, ctx: Ctx): void {
  const s = g.s;
  const W = g.cam.W;
  const H = g.cam.H;
  g.hits = [];
  dim(g, ctx, 0.6);
  const w = 360 * s;
  const h = 380 * s;
  const r = { x: W / 2 - w / 2, y: H / 2 - h / 2, w, h };
  panel(ctx, r, C.cream, s, 0.01);
  text(ctx, 'PAUSED', W / 2, r.y + 40 * s, 42 * s, C.red, 'center');
  const items: [string, string, string][] = [
    ['resume', 'RESUME', C.green],
    ['mute', g.save.muted ? 'SOUND: OFF' : 'SOUND: ON', C.blue],
    ['motion', g.save.reduced ? 'MOTION: REDUCED' : 'MOTION: FULL', C.teal],
    ['restart', 'NEW NIGHT', C.red],
  ];
  items.forEach(([id, label, col], i) => {
    const br = { x: W / 2 - 130 * s, y: r.y + 84 * s + i * 68 * s, w: 260 * s, h: 52 * s };
    button(ctx, br, label, s, inside(br, g.input.mouse.x, g.input.mouse.y), col);
    g.hits.push({ r: br, id });
  });
}
